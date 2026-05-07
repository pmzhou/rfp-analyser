"""LLM service: per-user settings (provider/model/key/base_url), supports Ollama / OpenAI-compatible local endpoints."""
import os
import json
import re
import uuid
from typing import List, Dict, Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage
from openai import AsyncOpenAI

DEFAULT_PROVIDER = "anthropic"
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"
LOCAL_PROVIDERS = {"ollama", "custom"}


def _provider_model(s: Optional[Dict[str, Any]]) -> tuple:
    if s:
        return (s.get("llm_provider") or DEFAULT_PROVIDER, s.get("llm_model") or DEFAULT_MODEL)
    return DEFAULT_PROVIDER, DEFAULT_MODEL


def _api_key(s: Optional[Dict[str, Any]]) -> str:
    if s and s.get("llm_api_key"):
        return s["llm_api_key"]
    return os.environ.get("EMERGENT_LLM_KEY", "")


def _base_url(s: Optional[Dict[str, Any]], provider: str) -> str:
    if s and s.get("llm_base_url"):
        return s["llm_base_url"]
    if provider == "ollama":
        return "http://localhost:11434/v1"
    return ""


async def _send(system: str, prompt: str, session_id: str, s: Optional[Dict[str, Any]]) -> str:
    """Dispatch to emergentintegrations (cloud) or OpenAI SDK (local)."""
    provider, model = _provider_model(s)
    if provider in LOCAL_PROVIDERS:
        base_url = _base_url(s, provider)
        if not base_url:
            raise RuntimeError(f"{provider} provider requires Base URL in Settings")
        # Local LLMs (Ollama, vLLM, LM Studio, OpenAI-compatible) typically don't need an API key
        api_key = _api_key(s) or "local"
        client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=600.0)
        resp = await client.chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return resp.choices[0].message.content or ""
    # Cloud providers via emergentintegrations
    chat = LlmChat(api_key=_api_key(s), session_id=session_id, system_message=system).with_model(provider, model)
    return str(await chat.send_message(UserMessage(text=prompt)))


def _strip_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


def _parse_json(text: str) -> Dict[str, Any]:
    cleaned = _strip_json(str(text))
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            return json.loads(m.group(0))
        raise


ANALYSIS_SYSTEM = """You are an expert RFP analyst for the Engineering, Architecture and Construction (AEC) industry.
Analyse Request-For-Proposal documents and produce a structured, exhaustive breakdown.

Always reply with STRICT VALID JSON (no markdown, no commentary) matching this schema:
{
  "title": str,
  "client": str,
  "summary": str,
  "project_objectives": str,

  "scope": [str, ...],
  "detailed_tasks": [{"id": str, "task": str, "subtasks": [str, ...]}],
  "deliverables": [{"name": str, "description": str, "acceptance_criteria": str, "due": str}],
  "agency_contractor_duties": {"agency": [str, ...], "contractor": [str, ...]},

  "program": [{"phase": str, "description": str, "duration": str}],
  "key_dates": [{"label": str, "date": str, "type": str}],

  "requirements": [{"id": str, "category": str, "requirement": str, "mandatory": bool, "source": str, "confidence": str}],
  "technical_specifications": [{"category": str, "specification": str, "standard": str, "quantity": str, "unit": str, "confidence": str}],
  "vendor_qualifications": [{"requirement": str, "evidence_required": str}],
  "compliance_and_ethics": [{"item": str, "type": str, "details": str}],

  "disciplines": [{"name": str, "description": str, "scope_summary": str}],

  "evaluation_criteria": [{"criterion": str, "weight": str, "notes": str}],
  "financial_terms": {"pricing_format": str, "budget_ceiling": str, "payment_structure": str, "currency": str},
  "risk_management": [{"clause": str, "details": str}],
  "submission_guidelines": {"format": str, "page_limit": str, "copies": str, "language": str, "delivery_method": str, "mandatory_forms": [str, ...]},

  "risks": [str, ...]
}

confidence MUST be "high", "medium", or "low" — based on how clearly each item is stated in the source.
Use empty arrays/strings rather than omitting fields. Be comprehensive.
"""


SINGLE_PASS_LIMIT = 180000
CHUNK_SIZE = 90000


async def _analyze_single(project_id: str, text: str, user_settings: Optional[Dict[str, Any]] = None,
                          extra_instructions: str = "") -> Dict[str, Any]:
    sysmsg = ANALYSIS_SYSTEM + ("\n\n" + extra_instructions if extra_instructions else "")
    raw = await _send(sysmsg,
        f"Analyse the following RFP documents and respond with the JSON schema only.\n\nDOCUMENTS:\n{text}",
        f"analyse-{project_id}-{uuid.uuid4().hex[:8]}", user_settings)
    return _parse_json(raw)


MERGE_SYSTEM = """You are merging multiple partial RFP-analysis JSON objects (each from a different document chunk)
into ONE consolidated analysis. Preserve the same JSON schema as the inputs. De-duplicate items.
Reply with STRICT VALID JSON only, no commentary."""


async def _merge_partials(project_id: str, partials: List[Dict[str, Any]],
                          user_settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    raw = await _send(MERGE_SYSTEM,
        "Merge these partial analyses into one. JSON only.\n\n" + json.dumps(partials, ensure_ascii=False),
        f"merge-{project_id}-{uuid.uuid4().hex[:8]}", user_settings)
    return _parse_json(raw)


async def analyze_rfp(project_id: str, combined_text: str,
                      user_settings: Optional[Dict[str, Any]] = None,
                      extra_instructions: str = "") -> Dict[str, Any]:
    text = combined_text.strip()
    if len(text) <= SINGLE_PASS_LIMIT:
        return await _analyze_single(project_id, text, user_settings, extra_instructions)

    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        if end < len(text):
            for sep in ("\n=== FILE:", "\n\n", "\n"):
                p = text.rfind(sep, start + CHUNK_SIZE // 2, end)
                if p > 0:
                    end = p
                    break
        chunks.append(text[start:end])
        start = end
    partials: List[Dict[str, Any]] = []
    for c in chunks:
        try:
            partials.append(await _analyze_single(project_id, c, user_settings, extra_instructions))
        except Exception:
            continue
    if not partials:
        raise RuntimeError("All analysis chunks failed")
    if len(partials) == 1:
        return partials[0]
    return await _merge_partials(project_id, partials, user_settings)


CHAT_SYSTEM = """You are an expert assistant answering questions about a specific RFP (and optionally past projects).
Use ONLY the provided context excerpts. If the answer is not in the context, say you don't have enough information.
Be concise. Cite the source filename or project title in parentheses when helpful."""


async def answer_question(project_id: str, question: str, context_chunks: List[Dict[str, Any]],
                          user_settings: Optional[Dict[str, Any]] = None) -> str:
    if not context_chunks:
        return "I don't have any indexed RFP documents yet. Please upload and analyse documents first."
    context_block = "\n\n---\n\n".join(
        f"[{c.get('filename', c.get('project_title', 'doc'))}] {c['text']}" for c in context_chunks
    )
    return await _send(CHAT_SYSTEM,
        f"CONTEXT:\n{context_block}\n\nQUESTION: {question}",
        f"qa-{project_id}-{uuid.uuid4().hex[:8]}", user_settings)
