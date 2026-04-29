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


async def analyze_rfp(project_id: str, combined_text: str) -> Dict[str, Any]:
    # Cap input size to avoid extreme prompts
    truncated = combined_text[:120000]
    chat = _new_chat(f"analyse-{project_id}-{uuid.uuid4().hex[:8]}", ANALYSIS_SYSTEM)
    msg = UserMessage(text=f"Analyse the following RFP documents and respond with the JSON schema only.\n\nDOCUMENTS:\n{truncated}")
    raw = await chat.send_message(msg)
    cleaned = _strip_json(str(raw))
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find the largest {...} block
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if m:
            return json.loads(m.group(0))
        raise


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
