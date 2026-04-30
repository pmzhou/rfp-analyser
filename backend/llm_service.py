"""LLM service: now reads per-user settings (provider/model/key/base_url) and supports custom OpenAI-compatible endpoints."""
import os
import json
import re
import uuid
from typing import List, Dict, Any, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

DEFAULT_PROVIDER = "anthropic"
DEFAULT_MODEL = "claude-sonnet-4-5-20250929"


def _key_for(provider: str, user_settings: Optional[Dict[str, Any]] = None) -> str:
    """Pick the API key: per-user override, then EMERGENT_LLM_KEY."""
    if user_settings and user_settings.get("llm_api_key"):
        return user_settings["llm_api_key"]
    return os.environ.get("EMERGENT_LLM_KEY", "")


def _provider_model(user_settings: Optional[Dict[str, Any]] = None) -> tuple:
    if user_settings:
        p = user_settings.get("llm_provider") or DEFAULT_PROVIDER
        m = user_settings.get("llm_model") or DEFAULT_MODEL
        return p, m
    return DEFAULT_PROVIDER, DEFAULT_MODEL


def _new_chat(session_id: str, system: str, user_settings: Optional[Dict[str, Any]] = None) -> LlmChat:
    provider, model = _provider_model(user_settings)
    chat = LlmChat(
        api_key=_key_for(provider, user_settings),
        session_id=session_id,
        system_message=system,
    ).with_model(provider, model)
    return chat


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
    chat = _new_chat(f"analyse-{project_id}-{uuid.uuid4().hex[:8]}", sysmsg, user_settings)
    msg = UserMessage(text=f"Analyse the following RFP documents and respond with the JSON schema only.\n\nDOCUMENTS:\n{text}")
    raw = await chat.send_message(msg)
    return _parse_json(raw)


MERGE_SYSTEM = """You are merging multiple partial RFP-analysis JSON objects (each from a different document chunk)
into ONE consolidated analysis. Preserve the same JSON schema as the inputs. De-duplicate items.
Reply with STRICT VALID JSON only, no commentary."""


async def _merge_partials(project_id: str, partials: List[Dict[str, Any]],
                          user_settings: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    chat = _new_chat(f"merge-{project_id}-{uuid.uuid4().hex[:8]}", MERGE_SYSTEM, user_settings)
    msg = UserMessage(text="Merge these partial analyses into one. JSON only.\n\n" + json.dumps(partials, ensure_ascii=False))
    raw = await chat.send_message(msg)
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
    chat = _new_chat(f"qa-{project_id}-{uuid.uuid4().hex[:8]}", CHAT_SYSTEM, user_settings)
    msg = UserMessage(text=f"CONTEXT:\n{context_block}\n\nQUESTION: {question}")
    return str(await chat.send_message(msg))
