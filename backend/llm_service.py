"""Claude Sonnet 4.5 (via emergentintegrations) — RFP analysis + Q&A."""
import os
import json
import re
import uuid
from typing import List, Dict, Any

from emergentintegrations.llm.chat import LlmChat, UserMessage

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-4-5-20250929"


def _new_chat(session_id: str, system: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)


def _strip_json(text: str) -> str:
    text = text.strip()
    # Remove markdown fences
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```\s*$", "", text)
    return text.strip()


ANALYSIS_SYSTEM = """You are an expert RFP analyst for the Engineering, Architecture and Construction (AEC) industry.
You analyse Request-For-Proposal documents and produce a structured, exhaustive breakdown.

Always reply with STRICT VALID JSON (no markdown, no commentary) matching this schema:
{
  "title": str,                                    // short title for the project
  "client": str,                                   // client / issuer name (best-guess if unclear)
  "summary": str,                                  // 2-4 sentence executive summary
  "scope": [str, ...],                             // bullet points of project scope
  "program": [                                     // project program / phases
    {"phase": str, "description": str, "duration": str}
  ],
  "key_dates": [
    {"label": str, "date": str, "type": str}       // type: submission|kickoff|milestone|interview|other
  ],
  "requirements": [
    {"id": str, "category": str, "requirement": str, "mandatory": bool, "source": str}
  ],
  "disciplines": [
    {"name": str, "description": str, "scope_summary": str}
                                                   // typical AEC disciplines: Architecture, Structural, MEP,
                                                   // Civil, Geotechnical, Landscape, Interiors, Fire, Acoustics,
                                                   // Sustainability, Cost, Project Management, Surveying, etc.
  ],
  "risks": [str, ...],
  "evaluation_criteria": [
    {"criterion": str, "weight": str}
  ]
}

Be comprehensive: extract every requirement you find, even small ones. Include all dates with deadlines.
Identify ALL applicable engineering/architecture disciplines based on the scope.
"""


# Single-pass safe input size (Claude Sonnet 4.5 has 200K context, leave headroom for prompt + output)
SINGLE_PASS_LIMIT = 180000
CHUNK_SIZE = 90000  # for map-reduce


def _parse_json(text: str) -> Dict[str, Any]:
    cleaned = _strip_json(str(text))
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            return json.loads(m.group(0))
        raise


async def _analyze_single(project_id: str, text: str, system: str = ANALYSIS_SYSTEM) -> Dict[str, Any]:
    chat = _new_chat(f"analyse-{project_id}-{uuid.uuid4().hex[:8]}", system)
    msg = UserMessage(text=f"Analyse the following RFP documents and respond with the JSON schema only.\n\nDOCUMENTS:\n{text}")
    raw = await chat.send_message(msg)
    return _parse_json(raw)


MERGE_SYSTEM = """You are merging multiple partial RFP-analysis JSON objects (each from a different document chunk)
into ONE consolidated analysis. Preserve the same JSON schema as the inputs. De-duplicate items.
Reply with STRICT VALID JSON only, no commentary."""


async def _merge_partials(project_id: str, partials: List[Dict[str, Any]]) -> Dict[str, Any]:
    chat = _new_chat(f"merge-{project_id}-{uuid.uuid4().hex[:8]}", MERGE_SYSTEM)
    msg = UserMessage(text="Merge these partial analyses into one. JSON only.\n\n" + json.dumps(partials, ensure_ascii=False))
    raw = await chat.send_message(msg)
    return _parse_json(raw)


async def analyze_rfp(project_id: str, combined_text: str) -> Dict[str, Any]:
    """Analyse RFP. For large inputs use map-reduce (chunked extraction + final merge)."""
    text = combined_text.strip()
    if len(text) <= SINGLE_PASS_LIMIT:
        return await _analyze_single(project_id, text)

    # Map-reduce: split into chunks, extract per chunk, then merge
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(start + CHUNK_SIZE, len(text))
        # try to break on a newline / file boundary
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
            partials.append(await _analyze_single(project_id, c))
        except Exception:
            # Skip a failed chunk rather than abort the entire analysis
            continue
    if not partials:
        raise RuntimeError("All analysis chunks failed")
    if len(partials) == 1:
        return partials[0]
    return await _merge_partials(project_id, partials)


CHAT_SYSTEM = """You are an expert assistant answering questions about a specific RFP.
Use ONLY the provided context excerpts. If the answer is not in the context, say you don't have enough information.
Be concise and cite the source filename in parentheses when helpful."""


async def answer_question(project_id: str, question: str, context_chunks: List[Dict[str, Any]]) -> str:
    if not context_chunks:
        return "I don't have any indexed RFP documents yet. Please upload and analyse documents first."
    context_block = "\n\n---\n\n".join(
        f"[{c.get('filename', 'doc')}] {c['text']}" for c in context_chunks
    )
    chat = _new_chat(f"qa-{project_id}-{uuid.uuid4().hex[:8]}", CHAT_SYSTEM)
    msg = UserMessage(text=f"CONTEXT:\n{context_block}\n\nQUESTION: {question}")
    return str(await chat.send_message(msg))
