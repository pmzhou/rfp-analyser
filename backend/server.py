"""RFP Analyser — FastAPI backend."""
import os
import re
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from auth import (
    hash_password, verify_password, create_token, get_current_user
)
from document_service import (
    extract_text, index_document, query_project, delete_project, delete_document
)
from llm_service import analyze_rfp, answer_question
from email_service import send_smtp, encrypt, decrypt, mask
from export_service import export_pdf, export_xlsx

UPLOAD_DIR = Path(os.environ['UPLOAD_DIR'])
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="RFP Analyser")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("rfp-analyser")


# ---------------------- helpers ---------------------- #
def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def clean_doc(d: Optional[dict]) -> Optional[dict]:
    if d is None:
        return None
    d.pop('_id', None)
    return d


# ---------------------- models ---------------------- #
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=1)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class AuthOut(BaseModel):
    token: str
    user: dict


class ProjectIn(BaseModel):
    title: str = Field(min_length=1)
    client_name: Optional[str] = ""
    description: Optional[str] = ""


class InviteIn(BaseModel):
    discipline: str
    consultant_name: str
    consultant_email: EmailStr
    consultant_company: Optional[str] = ""
    notes: Optional[str] = ""


class InviteResponseIn(BaseModel):
    fee: float = Field(ge=0)
    currency: str = Field(default="USD")
    notes: Optional[str] = ""
    timeline: Optional[str] = ""
    status: str = Field(default="submitted")  # submitted | declined


class ChatIn(BaseModel):
    question: str


# ---------------------- auth ---------------------- #
@api.post("/auth/signup", response_model=AuthOut)
async def signup(body: SignupIn):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    # First user becomes admin (Sovrium pattern)
    is_first = (await db.users.count_documents({})) == 0
    user = {
        "id": new_id(),
        "email": body.email.lower(),
        "name": body.name,
        "role": "admin" if is_first else "member",
        "password_hash": hash_password(body.password),
        "created_at": now(),
    }
    await db.users.insert_one(user)
    user.pop('_id', None)
    public_user = {k: v for k, v in user.items() if k != 'password_hash'}
    token = create_token(user["id"], user["email"], user["role"])
    return AuthOut(token=token, user=public_user)


@api.post("/auth/login", response_model=AuthOut)
async def login(body: LoginIn):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    u.pop('_id', None)
    public_user = {k: v for k, v in u.items() if k != 'password_hash'}
    token = create_token(u["id"], u["email"], u["role"])
    return AuthOut(token=token, user=public_user)


@api.get("/auth/me")
async def me(user=Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "User not found")
    return u


# ---------------------- projects ---------------------- #
@api.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    cursor = db.projects.find({"owner_id": user["id"]}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(500)


@api.post("/projects")
async def create_project(body: ProjectIn, user=Depends(get_current_user)):
    proj = {
        "id": new_id(),
        "owner_id": user["id"],
        "title": body.title,
        "client_name": body.client_name or "",
        "description": body.description or "",
        "status": "draft",          # draft | analysing | analysed | distributed | merged
        "analysis": None,
        "created_at": now(),
        "updated_at": now(),
    }
    await db.projects.insert_one(proj)
    return clean_doc(proj)


@api.get("/projects/{project_id}")
async def get_project(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@api.delete("/projects/{project_id}")
async def remove_project(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    await db.projects.delete_one({"id": project_id})
    await db.documents.delete_many({"project_id": project_id})
    await db.invites.delete_many({"project_id": project_id})
    delete_project(project_id)
    return {"ok": True}


# ---------------------- documents ---------------------- #
@api.post("/projects/{project_id}/documents")
async def upload_document(project_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty file")
    doc_id = new_id()
    safe_name = file.filename or f"document-{doc_id}"
    storage_path = UPLOAD_DIR / f"{doc_id}__{safe_name}"
    storage_path.write_bytes(content)
    text = extract_text(safe_name, content)
    chunks = index_document(project_id, doc_id, safe_name, text)
    doc = {
        "id": doc_id,
        "project_id": project_id,
        "filename": safe_name,
        "size": len(content),
        "mime": file.content_type or "",
        "storage_path": str(storage_path),
        "text_length": len(text),
        "chunks": chunks,
        "uploaded_at": now(),
    }
    await db.documents.insert_one(doc)
    return clean_doc(doc)


@api.get("/projects/{project_id}/documents")
async def list_documents(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    cursor = db.documents.find({"project_id": project_id}, {"_id": 0, "storage_path": 0}).sort("uploaded_at", 1)
    return await cursor.to_list(500)


@api.delete("/projects/{project_id}/documents/{document_id}")
async def remove_document(project_id: str, document_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    d = await db.documents.find_one({"id": document_id, "project_id": project_id})
    if not d:
        raise HTTPException(404, "Document not found")
    try:
        Path(d["storage_path"]).unlink(missing_ok=True)
    except Exception:
        pass
    await db.documents.delete_one({"id": document_id})
    delete_document(project_id, document_id)
    return {"ok": True}


# ---------------------- analysis ---------------------- #
async def _get_settings(user_id: str) -> Dict[str, Any]:
    s = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not s:
        return {}
    if s.get("llm_api_key"):
        s["llm_api_key"] = decrypt(s["llm_api_key"])
    if s.get("smtp_password"):
        s["smtp_password"] = decrypt(s["smtp_password"])
    return s


async def _custom_requirements_block(user_id: str) -> str:
    items = await db.library.find({"owner_id": user_id, "type": "requirement", "auto_inject": True}, {"_id": 0}).to_list(500)
    if not items:
        return ""
    lines = [f"- [{i.get('category','')}] {i.get('requirement','')} ({'mandatory' if i.get('mandatory') else 'optional'})" for i in items]
    return ("ALSO check whether the RFP triggers any of these firm-specific custom requirements; "
            "if applicable, include them in the 'requirements' array with source='firm-library':\n" + "\n".join(lines))


@api.post("/projects/{project_id}/analyze")
async def analyze(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    docs = await db.documents.find({"project_id": project_id}, {"_id": 0}).to_list(200)
    if not docs:
        raise HTTPException(400, "Upload at least one document before analysis")
    combined_parts: List[str] = []
    for d in docs:
        path = Path(d["storage_path"]) if "storage_path" in d else None
        if path and path.exists():
            try:
                combined_parts.append(f"=== FILE: {d['filename']} ===\n" + extract_text(d['filename'], path.read_bytes()))
            except Exception as e:
                logger.warning("re-read failed for %s: %s", d['filename'], e)
    combined = "\n\n".join(combined_parts)
    if not combined.strip():
        raise HTTPException(400, "No extractable text in uploaded documents")

    settings = await _get_settings(user["id"])
    extra = await _custom_requirements_block(user["id"])

    # Mark as analysing and clear any previous error
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"status": "analysing", "analysis_error": None, "analysis_started_at": now(), "updated_at": now()}}
    )

    # Run the long LLM call in the background so the kubernetes ingress doesn't time us out.
    import asyncio
    asyncio.create_task(_run_analysis_bg(project_id, combined, settings, extra))

    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return p


async def _run_analysis_bg(project_id: str, combined: str, settings: Dict[str, Any], extra: str):
    try:
        analysis = await analyze_rfp(project_id, combined, settings, extra)
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {"analysis": analysis, "status": "analysed", "analysis_error": None, "updated_at": now()}}
        )
        logger.info("analysis complete for %s", project_id)
    except Exception as e:
        logger.exception("background analysis failed for %s", project_id)
        msg = str(e)[:600]
        await db.projects.update_one(
            {"id": project_id},
            {"$set": {"status": "draft", "analysis_error": msg, "updated_at": now()}}
        )


@api.patch("/projects/{project_id}/fee-builder")
async def update_fee_builder(project_id: str, body: Dict[str, Any], user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"fee_builder": body, "updated_at": now()}}
    )
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


@api.patch("/projects/{project_id}/analysis")
async def update_analysis(project_id: str, body: Dict[str, Any], user=Depends(get_current_user)):
    """Human-in-the-loop QA: persist user-edited analysis fields, audit-logged."""
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    prev = p.get("analysis") or {}
    # diff: which top-level keys changed
    changed_keys = sorted([k for k in set(list(prev.keys()) + list(body.keys())) if prev.get(k) != body.get(k)])
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"analysis": body, "updated_at": now(), "last_edited_by": user["email"], "last_edited_at": now()}}
    )
    await db.audit_logs.insert_one({
        "id": new_id(),
        "project_id": project_id,
        "user_id": user["id"],
        "user_email": user["email"],
        "action": "edit_analysis",
        "fields_changed": changed_keys,
        "timestamp": now(),
    })
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


@api.get("/projects/{project_id}/audit")
async def project_audit(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    cursor = db.audit_logs.find({"project_id": project_id}, {"_id": 0}).sort("timestamp", -1)
    return await cursor.to_list(200)


@api.post("/projects/{project_id}/duplicate")
async def duplicate_project(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    new_proj = {
        **p,
        "id": new_id(),
        "title": f"{p['title']} (copy)",
        "status": "draft",
        "outcome": None,
        "awarded_amount": None,
        "created_at": now(),
        "updated_at": now(),
    }
    await db.projects.insert_one(new_proj)
    return clean_doc(new_proj)


class ProjectStatusIn(BaseModel):
    outcome: Optional[str] = None        # won | lost | abandoned | pending
    awarded_amount: Optional[float] = None


@api.patch("/projects/{project_id}/outcome")
async def set_outcome(project_id: str, body: ProjectStatusIn, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    upd: Dict[str, Any] = {"updated_at": now()}
    if body.outcome is not None:
        upd["outcome"] = body.outcome
    if body.awarded_amount is not None:
        upd["awarded_amount"] = body.awarded_amount
    await db.projects.update_one({"id": project_id}, {"$set": upd})
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


# ---------------------- export ---------------------- #
@api.get("/projects/{project_id}/export")
async def export_project(project_id: str, format: str = Query("pdf"), user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Project not found")
    invites = await db.invites.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    settings = await _get_settings(user["id"])
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", p.get("title", "rfp"))[:60] or "rfp"
    if format == "xlsx":
        data = export_xlsx(p, invites, settings)
        return Response(data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        headers={"Content-Disposition": f'attachment; filename="{safe_name}.xlsx"'})
    data = export_pdf(p, invites, settings)
    return Response(data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'})


# ---------------------- document file (for side-by-side viewer) ---------------------- #
@api.get("/projects/{project_id}/documents/{document_id}/file")
async def get_document_file(project_id: str, document_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    d = await db.documents.find_one({"id": document_id, "project_id": project_id})
    if not d:
        raise HTTPException(404, "Document not found")
    path = Path(d["storage_path"])
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(str(path), filename=d["filename"], media_type=d.get("mime") or "application/octet-stream")


# ---------------------- settings ---------------------- #
class SettingsIn(BaseModel):
    # Preferences
    default_currency: Optional[str] = "AED"
    date_format: Optional[str] = "dd/mm/yyyy"
    # SMTP
    smtp_host: Optional[str] = ""
    smtp_port: Optional[int] = 587
    smtp_username: Optional[str] = ""
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = True
    smtp_from_name: Optional[str] = ""
    smtp_from_email: Optional[str] = ""
    # LLM
    llm_provider: Optional[str] = "anthropic"
    llm_model: Optional[str] = "claude-sonnet-4-5-20250929"
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = ""
    # Fee Methods defaults (used by Fee Builder "Fee Methods" page)
    fee_benchmark_by_typology: Optional[Dict[str, float]] = None   # e.g. {"healthcare": 12.0, "residential": 10.0}
    fee_phase_preset: Optional[str] = "traditional"                # traditional | bim_led | custom
    fee_phase_distribution: Optional[Dict[str, float]] = None      # e.g. {"SD":15,"DD":20,"CD":40,"Tender":5,"CA":20}
    fee_overhead_multiplier: Optional[float] = 2.85
    fee_target_margin_pct: Optional[float] = 20.0
    fee_lock_to_signing_budget: Optional[bool] = False
    fee_sliding_scale: Optional[List[Dict[str, float]]] = None     # [{"limit":10000000,"pct":8},{"limit":20000000,"pct":6.5}...]
    fee_complexity_factors: Optional[List[Dict[str, Any]]] = None  # [{"name":"Healthcare","pct":40,"on":False},...]


def _public_settings(s: Dict[str, Any]) -> Dict[str, Any]:
    s = dict(s or {})
    s.pop("_id", None)
    s["smtp_password_mask"] = mask(s.pop("smtp_password", "")) if s.get("smtp_password") or s.get("smtp_password") == "" else ""
    s["llm_api_key_mask"] = mask(s.pop("llm_api_key", ""))
    return s


@api.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"user_id": user["id"]}) or {"user_id": user["id"]}
    return _public_settings(s)


@api.put("/settings")
async def put_settings(body: SettingsIn, user=Depends(get_current_user)):
    existing = await db.settings.find_one({"user_id": user["id"]}) or {}
    upd: Dict[str, Any] = {"user_id": user["id"], "updated_at": now()}
    # Only persist fields the caller explicitly sent (true partial update).
    sent = body.model_dump(exclude_unset=True)
    for k, v in sent.items():
        if k in ("smtp_password", "llm_api_key"):
            continue   # handled below
        upd[k] = v
    # secret fields: not sent -> keep existing; "" -> clear; other -> encrypt + store
    for k in ("smtp_password", "llm_api_key"):
        if k not in sent:
            if k in existing:
                upd[k] = existing[k]
        else:
            v = sent[k]
            if v is None or v == "":
                upd[k] = ""
            else:
                upd[k] = encrypt(v)
    await db.settings.update_one({"user_id": user["id"]}, {"$set": upd}, upsert=True)
    return _public_settings(await db.settings.find_one({"user_id": user["id"]}))


class TestEmailIn(BaseModel):
    to_email: EmailStr


@api.post("/settings/test-email")
async def test_email(body: TestEmailIn, user=Depends(get_current_user)):
    s = await _get_settings(user["id"])
    if not s.get("smtp_host"):
        raise HTTPException(400, "Configure SMTP host first")
    try:
        await send_smtp(
            host=s["smtp_host"], port=s.get("smtp_port") or 587,
            username=s.get("smtp_username") or "", password=s.get("smtp_password") or "",
            use_tls=bool(s.get("smtp_use_tls", True)),
            from_name=s.get("smtp_from_name") or "RFP Analyser",
            from_email=s.get("smtp_from_email") or s.get("smtp_username", ""),
            to_email=body.to_email,
            subject="RFP Analyser — SMTP test",
            body_text="If you can read this, your SMTP settings are working.",
        )
    except Exception as e:
        raise HTTPException(500, f"SMTP test failed: {e}")
    return {"ok": True}


# ---------------------- library: requirements / fee templates / contacts ---------------------- #
class LibraryItemIn(BaseModel):
    type: str                           # requirement | fee_template | contact | staff
    # requirement fields
    category: Optional[str] = ""
    requirement: Optional[str] = ""
    mandatory: Optional[bool] = False
    auto_inject: Optional[bool] = False
    # fee_template fields
    discipline: Optional[str] = ""
    fee_format: Optional[str] = ""
    base_fee: Optional[float] = 0.0
    currency: Optional[str] = "USD"
    template_notes: Optional[str] = ""
    # contact fields
    consultant_name: Optional[str] = ""
    consultant_email: Optional[str] = ""
    consultant_company: Optional[str] = ""
    contact_disciplines: Optional[List[str]] = []
    # staff fields (global staff roster)
    staff_name: Optional[str] = ""
    staff_title: Optional[str] = ""
    staff_dept: Optional[str] = ""           # arch | int | ca | site
    staff_group: Optional[str] = ""          # Directors | Senior | Mid | Junior | etc
    cost_rate: Optional[float] = 0.0
    rate_currency: Optional[str] = "USD"
    active: Optional[bool] = True
    # nda_template fields
    nda_name: Optional[str] = ""
    nda_text: Optional[str] = ""
    is_default: Optional[bool] = False


@api.get("/library")
async def list_library(type: str = Query(...), user=Depends(get_current_user)):
    if type not in ("requirement", "fee_template", "contact", "staff", "nda_template"):
        raise HTTPException(400, "Invalid type")
    cursor = db.library.find({"owner_id": user["id"], "type": type}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(2000)


@api.post("/library")
async def create_library_item(body: LibraryItemIn, user=Depends(get_current_user)):
    item = {"id": new_id(), "owner_id": user["id"], "created_at": now(), **body.model_dump()}
    await db.library.insert_one(item)
    if body.type == "nda_template" and body.is_default:
        await db.settings.update_one({"user_id": user["id"]}, {"$set": {"default_nda_id": item["id"]}}, upsert=True)
    return clean_doc(item)


@api.put("/library/{item_id}")
async def update_library_item(item_id: str, body: LibraryItemIn, user=Depends(get_current_user)):
    res = await db.library.update_one(
        {"id": item_id, "owner_id": user["id"]},
        {"$set": body.model_dump()}
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Item not found")
    if body.type == "nda_template" and body.is_default:
        await db.settings.update_one({"user_id": user["id"]}, {"$set": {"default_nda_id": item_id}}, upsert=True)
    return await db.library.find_one({"id": item_id}, {"_id": 0})


@api.delete("/library/{item_id}")
async def delete_library_item(item_id: str, user=Depends(get_current_user)):
    res = await db.library.delete_one({"id": item_id, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Item not found")
    return {"ok": True}


# ---------------------- bulk invite ---------------------- #
class BulkInvitesIn(BaseModel):
    invites: List[InviteIn]
    send_email: Optional[bool] = False


@api.post("/projects/{project_id}/invites/bulk")
async def bulk_invites(project_id: str, body: BulkInvitesIn, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    settings = await _get_settings(user["id"]) if body.send_email else {}
    base_url = os.environ.get("PUBLIC_BASE_URL", "")
    created = []
    sent = 0
    failed = []
    for body_inv in body.invites:
        invite = {
            "id": new_id(), "project_id": project_id,
            "share_token": uuid.uuid4().hex,
            "discipline": body_inv.discipline,
            "consultant_name": body_inv.consultant_name,
            "consultant_email": body_inv.consultant_email.lower(),
            "consultant_company": body_inv.consultant_company or "",
            "notes": body_inv.notes or "",
            "status": "sent",
            "fee": None, "currency": None,
            "response_notes": "", "response_timeline": "",
            "responded_at": None, "created_at": now(),
        }
        await db.invites.insert_one(invite)
        created.append(clean_doc(dict(invite)))
        if body.send_email and settings.get("smtp_host"):
            try:
                share_url = f"{base_url}/respond/{invite['share_token']}" if base_url else f"/respond/{invite['share_token']}"
                await send_smtp(
                    host=settings["smtp_host"], port=settings.get("smtp_port") or 587,
                    username=settings.get("smtp_username") or "",
                    password=settings.get("smtp_password") or "",
                    use_tls=bool(settings.get("smtp_use_tls", True)),
                    from_name=settings.get("smtp_from_name") or "RFP Analyser",
                    from_email=settings.get("smtp_from_email") or settings.get("smtp_username", ""),
                    to_email=invite["consultant_email"],
                    subject=f"Sub-consultant fee request — {p['title']} — {invite['discipline']}",
                    body_text=(
                        f"Hi {invite['consultant_name']},\n\n"
                        f"We invite you to submit a fee for the {invite['discipline']} discipline on:\n"
                        f"  Project: {p['title']}\n  Client: {p.get('client_name') or '—'}\n\n"
                        f"Please review the scope and submit your fee here:\n{share_url}\n\nBest regards"
                    ),
                )
                sent += 1
            except Exception as e:
                failed.append({"email": invite["consultant_email"], "error": str(e)})
    if created:
        await db.projects.update_one({"id": project_id}, {"$set": {"status": "distributed", "updated_at": now()}})
    return {"created": created, "emails_sent": sent, "failed": failed}


@api.post("/projects/{project_id}/invites/{invite_id}/send-email")
async def send_invite_email(project_id: str, invite_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    inv = await db.invites.find_one({"id": invite_id, "project_id": project_id})
    if not inv:
        raise HTTPException(404, "Invite not found")
    settings = await _get_settings(user["id"])
    if not settings.get("smtp_host"):
        raise HTTPException(400, "Configure SMTP in Settings first (or use the Copy Link button)")
    base_url = os.environ.get("PUBLIC_BASE_URL", "")
    share_url = f"{base_url}/respond/{inv['share_token']}" if base_url else f"/respond/{inv['share_token']}"
    try:
        await send_smtp(
            host=settings["smtp_host"], port=settings.get("smtp_port") or 587,
            username=settings.get("smtp_username") or "",
            password=settings.get("smtp_password") or "",
            use_tls=bool(settings.get("smtp_use_tls", True)),
            from_name=settings.get("smtp_from_name") or "RFP Analyser",
            from_email=settings.get("smtp_from_email") or settings.get("smtp_username", ""),
            to_email=inv["consultant_email"],
            subject=f"Sub-consultant fee request — {p['title']} — {inv['discipline']}",
            body_text=(
                f"Hi {inv['consultant_name']},\n\n"
                f"We invite you to submit a fee for the {inv['discipline']} discipline on:\n"
                f"  Project: {p['title']}\n  Client: {p.get('client_name') or '—'}\n\n"
                f"Please review the scope and submit your fee here:\n{share_url}\n\nBest regards"
            ),
        )
    except Exception as e:
        raise HTTPException(500, f"Send failed: {e}")
    return {"ok": True}


# ---------------------- knowledge base / past proposals chat ---------------------- #
@api.post("/projects/{project_id}/chat/cross")
async def chat_cross(project_id: str, body: ChatIn, user=Depends(get_current_user)):
    """Chat across the user's whole RFP history."""
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    own_projects = await db.projects.find({"owner_id": user["id"]}, {"_id": 0, "id": 1, "title": 1}).to_list(500)
    context = []
    for op in own_projects:
        results = query_project(op["id"], body.question, n_results=2)
        for t, m in results:
            context.append({"text": t, "filename": (m or {}).get("filename","doc"), "project_title": op.get("title", "")})
    settings = await _get_settings(user["id"])
    answer = await answer_question(project_id, body.question, context[:10], settings)
    return {"answer": answer, "sources": list({c["project_title"] for c in context if c.get("project_title")})}


# ---------------------- invites (sub-consultants) ---------------------- #
@api.post("/projects/{project_id}/invites")
async def create_invite(project_id: str, body: InviteIn, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    invite = {
        "id": new_id(),
        "project_id": project_id,
        "share_token": uuid.uuid4().hex,
        "discipline": body.discipline,
        "consultant_name": body.consultant_name,
        "consultant_email": body.consultant_email.lower(),
        "consultant_company": body.consultant_company or "",
        "notes": body.notes or "",
        "status": "sent",      # sent | viewed | submitted | declined
        "fee": None,
        "currency": None,
        "response_notes": "",
        "response_timeline": "",
        "responded_at": None,
        "created_at": now(),
    }
    await db.invites.insert_one(invite)
    await db.projects.update_one({"id": project_id}, {"$set": {"status": "distributed", "updated_at": now()}})
    return clean_doc(invite)


@api.get("/projects/{project_id}/invites")
async def list_invites(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    cursor = db.invites.find({"project_id": project_id}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(500)


@api.delete("/projects/{project_id}/invites/{invite_id}")
async def remove_invite(project_id: str, invite_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    await db.invites.delete_one({"id": invite_id, "project_id": project_id})
    return {"ok": True}


class InvitePatchIn(BaseModel):
    skip_nda: Optional[bool] = None
    anonymise_client: Optional[bool] = None
    notes: Optional[str] = None


@api.patch("/projects/{project_id}/invites/{invite_id}")
async def patch_invite(project_id: str, invite_id: str, body: InvitePatchIn, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    upd: Dict[str, Any] = {}
    for k in ("skip_nda", "anonymise_client", "notes"):
        v = getattr(body, k)
        if v is not None:
            upd[k] = v
    if not upd:
        raise HTTPException(400, "Nothing to update")
    res = await db.invites.update_one({"id": invite_id, "project_id": project_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(404, "Invite not found")
    return await db.invites.find_one({"id": invite_id}, {"_id": 0})


async def _notify_owner(invite: Dict[str, Any], event: str, extra: str = "") -> None:
    """Best-effort SMTP notification to the project owner. Silent on failure."""
    try:
        proj = await db.projects.find_one({"id": invite["project_id"]}, {"_id": 0})
        if not proj:
            return
        owner = await db.users.find_one({"id": proj["owner_id"]}, {"_id": 0})
        if not owner:
            return
        s = await _get_settings(proj["owner_id"])
        if not s.get("smtp_host"):
            return
        labels = {
            "eoi_viewed": "viewed the EOI",
            "interested": "expressed interest",
            "declined": "declined the invitation",
            "nda_signed": "signed the NDA",
            "responded": "submitted a fee response",
        }
        verb = labels.get(event, event)
        subject = f"[RFP/Analyser] {invite.get('consultant_name','Sub-consultant')} {verb} — {proj.get('title','')}"
        body_text = (
            f"Hi {owner.get('name','')},\n\n"
            f"{invite.get('consultant_name','A sub-consultant')} ({invite.get('consultant_email','')}) "
            f"{verb} for the {invite.get('discipline','')} discipline on project '{proj.get('title','')}'.\n"
            f"{extra}\n\n"
            f"Open project: {os.environ.get('PUBLIC_BASE_URL','')}/projects/{invite['project_id']}\n"
        )
        await send_smtp(
            host=s["smtp_host"], port=s.get("smtp_port") or 587,
            username=s.get("smtp_username") or "",
            password=s.get("smtp_password") or "",
            use_tls=bool(s.get("smtp_use_tls", True)),
            from_name=s.get("smtp_from_name") or "RFP Analyser",
            from_email=s.get("smtp_from_email") or s.get("smtp_username", ""),
            to_email=owner["email"],
            subject=subject, body_text=body_text,
        )
    except Exception as e:
        logger.info("owner notification skipped: %s", e)


DEFAULT_NDA_TEMPLATE = """NON-DISCLOSURE AGREEMENT

This Non-Disclosure Agreement (the "Agreement") is entered into on {{signing_date}}
by and between:

  Disclosing Party: {{owner_name}} ({{owner_email}})
  Receiving Party : {{consultant_name}}, {{consultant_company}} ({{consultant_email}})

in connection with the proposed engagement on the project titled
"{{project_title}}" for client "{{client_name}}" (the "Project"), specifically
the {{discipline}} discipline.

1. CONFIDENTIAL INFORMATION. "Confidential Information" means all non-public
information disclosed by the Disclosing Party relating to the Project,
including but not limited to: requirements, technical specifications, scope,
financial terms, drawings, schedules, client identity, and any documents
shared via this portal.

2. OBLIGATIONS. The Receiving Party agrees: (a) to hold all Confidential
Information in strict confidence; (b) to use it solely for the purpose of
preparing a fee proposal for the Project; (c) not to disclose it to any
third party without prior written consent of the Disclosing Party;
(d) to protect it with the same degree of care it uses for its own
confidential information, and not less than reasonable care.

3. EXCLUSIONS. Confidential Information does not include information that:
(a) was already known to the Receiving Party without obligation of
confidence; (b) is or becomes publicly available through no fault of the
Receiving Party; (c) is independently developed without use of the
Confidential Information; (d) must be disclosed by law, provided the
Receiving Party gives prompt notice.

4. TERM. This Agreement remains in effect for two (2) years from the date
of signing, regardless of whether the Receiving Party participates further
in the Project.

5. NO LICENCE. Nothing in this Agreement grants the Receiving Party any
licence, ownership or other right in any Confidential Information.

6. RETURN OR DESTRUCTION. Upon written request, the Receiving Party will
promptly return or destroy all Confidential Information.

7. GOVERNING LAW. This Agreement is governed by the laws of the
Disclosing Party's jurisdiction.

By signing electronically below, the Receiving Party acknowledges that:
they are authorised to sign on behalf of the company; the typed name
constitutes a legally binding signature; and they have read and agree to
all terms above.

Signed by : {{consultant_name}}
Email     : {{consultant_email}}
Date      : {{signing_date}}
IP address: {{signing_ip}}
"""


def _render_nda(template: str, ctx: Dict[str, Any]) -> str:
    out = template
    for k, v in ctx.items():
        out = out.replace("{{" + k + "}}", str(v or ""))
    return out


@api.get("/library/nda/builtin")
async def get_builtin_nda(_=Depends(get_current_user)):
    """Returns the built-in mutual NDA template text for use as a starting point."""
    return {"nda_text": DEFAULT_NDA_TEMPLATE}


@api.get("/public/invites/{token}/eoi")
async def public_get_eoi(token: str):
    inv = await db.invites.find_one({"share_token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    proj = await db.projects.find_one(
        {"id": inv["project_id"]},
        {"_id": 0, "title": 1, "client_name": 1, "analysis": 1, "owner_id": 1}
    )
    # Mark EOI viewed if first time
    upd = {}
    if not inv.get("eoi_viewed_at"):
        upd["eoi_viewed_at"] = now()
        if inv.get("status") == "sent":
            upd["status"] = "viewed"
    if upd:
        await db.invites.update_one({"share_token": token}, {"$set": upd})
        inv.update(upd)
        if upd.get("eoi_viewed_at"):
            import asyncio as _asyncio
            _asyncio.create_task(_notify_owner(inv, "eoi_viewed"))
    summary = ""
    submission_date = None
    if proj and proj.get("analysis"):
        a = proj["analysis"]
        summary = a.get("summary", "")
        for d in (a.get("key_dates") or []):
            if (d.get("type") or "").lower() == "submission":
                submission_date = d.get("date")
                break
    client_name = proj.get("client_name", "") if proj else ""
    if inv.get("anonymise_client"):
        client_name = "Confidential client"
    return {
        "invite_status": inv.get("status"),
        "skip_nda": bool(inv.get("skip_nda")),
        "interested_at": inv.get("interested_at"),
        "declined_at": inv.get("declined_at"),
        "nda_signed_at": inv.get("nda_signed_at"),
        "discipline": inv.get("discipline"),
        "consultant_name": inv.get("consultant_name"),
        "consultant_company": inv.get("consultant_company"),
        "project": {
            "title": proj.get("title") if proj else "",
            "client_name": client_name,
            "summary": summary,
            "submission_date": submission_date,
        },
    }


class InterestIn(BaseModel):
    interested: bool
    reason: Optional[str] = ""


@api.post("/public/invites/{token}/interest")
async def public_interest(token: str, body: InterestIn):
    inv = await db.invites.find_one({"share_token": token})
    if not inv:
        raise HTTPException(404, "Invite not found")
    upd: Dict[str, Any] = {}
    event = "interested"
    extra = ""
    if body.interested:
        upd = {"interested_at": now(), "status": "interested"}
    else:
        upd = {"declined_at": now(), "decline_reason": body.reason or "", "status": "declined", "decline_stage": "eoi"}
        event = "declined"
        extra = f"Stage: EOI. Reason: {body.reason or 'not provided'}"
    await db.invites.update_one({"share_token": token}, {"$set": upd})
    merged = {**inv, **upd}
    import asyncio as _asyncio
    _asyncio.create_task(_notify_owner(merged, event, extra))
    return {"ok": True}


async def _resolve_nda_template(user_id: str) -> str:
    """Pick the user's default NDA template, else a stored 'first' one, else the built-in default."""
    s = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if s and s.get("default_nda_id"):
        item = await db.library.find_one({"id": s["default_nda_id"], "owner_id": user_id, "type": "nda_template"}, {"_id": 0})
        if item and item.get("nda_text"):
            return item["nda_text"]
    item = await db.library.find_one({"owner_id": user_id, "type": "nda_template"}, sort=[("created_at", -1)])
    if item and item.get("nda_text"):
        return item["nda_text"]
    return DEFAULT_NDA_TEMPLATE


@api.get("/public/invites/{token}/nda")
async def public_get_nda(token: str):
    inv = await db.invites.find_one({"share_token": token})
    if not inv:
        raise HTTPException(404, "Invite not found")
    if inv.get("declined_at"):
        raise HTTPException(400, "Invite declined")
    proj = await db.projects.find_one({"id": inv["project_id"]}, {"_id": 0})
    if not proj:
        raise HTTPException(404, "Project not found")
    owner = await db.users.find_one({"id": proj["owner_id"]}, {"_id": 0})
    template = await _resolve_nda_template(proj["owner_id"])
    ctx = {
        "owner_name": owner.get("name", "") if owner else "",
        "owner_email": owner.get("email", "") if owner else "",
        "consultant_name": inv.get("consultant_name", ""),
        "consultant_email": inv.get("consultant_email", ""),
        "consultant_company": inv.get("consultant_company", ""),
        "project_title": proj.get("title", ""),
        "client_name": "Confidential client" if inv.get("anonymise_client") else proj.get("client_name", ""),
        "discipline": inv.get("discipline", ""),
        "signing_date": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
        "signing_ip": "",
    }
    return {"template": template, "rendered": _render_nda(template, ctx), "context": ctx,
            "already_signed": bool(inv.get("nda_signed_at"))}


class NDASignIn(BaseModel):
    typed_name: str = Field(min_length=2)
    email_confirm: EmailStr
    agree: bool


@api.post("/public/invites/{token}/nda/sign")
async def public_sign_nda(request: Request, token: str, body: NDASignIn):
    inv = await db.invites.find_one({"share_token": token})
    if not inv:
        raise HTTPException(404, "Invite not found")
    if not body.agree:
        raise HTTPException(400, "You must tick the agreement checkbox")
    proj = await db.projects.find_one({"id": inv["project_id"]}, {"_id": 0})
    owner = await db.users.find_one({"id": proj["owner_id"]}, {"_id": 0})
    template = await _resolve_nda_template(proj["owner_id"])
    ip = request.client.host if request.client else ""
    signing_date = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    ctx = {
        "owner_name": owner.get("name", "") if owner else "",
        "owner_email": owner.get("email", "") if owner else "",
        "consultant_name": inv.get("consultant_name", ""),
        "consultant_email": inv.get("consultant_email", ""),
        "consultant_company": inv.get("consultant_company", ""),
        "project_title": proj.get("title", ""),
        "client_name": "Confidential client" if inv.get("anonymise_client") else proj.get("client_name", ""),
        "discipline": inv.get("discipline", ""),
        "signing_date": signing_date,
        "signing_ip": ip,
    }
    text_snapshot = _render_nda(template, ctx)
    upd = {
        "nda_signed_at": now(),
        "nda_signed_name": body.typed_name,
        "nda_signed_email": body.email_confirm.lower(),
        "nda_signed_ip": ip,
        "nda_text_snapshot": text_snapshot,
        "status": "nda_signed",
    }
    await db.invites.update_one({"share_token": token}, {"$set": upd})
    merged = {**inv, **upd}
    import asyncio as _asyncio
    _asyncio.create_task(_notify_owner(merged, "nda_signed"))
    return {"ok": True}


@api.get("/public/invites/{token}/nda/pdf")
async def public_nda_pdf(token: str):
    inv = await db.invites.find_one({"share_token": token}, {"_id": 0})
    if not inv or not inv.get("nda_text_snapshot"):
        raise HTTPException(404, "Signed NDA not found")
    pdf = _nda_pdf(inv)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="NDA_{inv.get("consultant_name","").replace(" ","_")}.pdf"'})


@api.get("/projects/{project_id}/invites/{invite_id}/nda/pdf")
async def owner_nda_pdf(project_id: str, invite_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    inv = await db.invites.find_one({"id": invite_id, "project_id": project_id}, {"_id": 0})
    if not inv or not inv.get("nda_text_snapshot"):
        raise HTTPException(404, "Signed NDA not found")
    pdf = _nda_pdf(inv)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="NDA_{inv.get("consultant_name","").replace(" ","_")}.pdf"'})


def _nda_pdf(invite: Dict[str, Any]) -> bytes:
    import io as _io
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas as _canvas
    buf = _io.BytesIO()
    c = _canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 18 * mm
    y = height - margin
    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin, y, "Signed Non-Disclosure Agreement")
    y -= 8 * mm
    c.setFont("Helvetica", 9)
    c.setFillGray(0.4)
    c.drawString(margin, y, f"Signed: {invite.get('nda_signed_at','')}   ·   IP: {invite.get('nda_signed_ip','')}")
    y -= 8 * mm
    c.setFillGray(0)
    c.setFont("Helvetica", 10)
    for line in (invite.get("nda_text_snapshot") or "").split("\n"):
        if y < margin + 20 * mm:
            c.showPage(); c.setFont("Helvetica", 10); y = height - margin
        # naive wrap at ~95 chars
        chunk = line
        while len(chunk) > 95:
            c.drawString(margin, y, chunk[:95]); y -= 12; chunk = chunk[95:]
            if y < margin + 20 * mm:
                c.showPage(); c.setFont("Helvetica", 10); y = height - margin
        c.drawString(margin, y, chunk); y -= 12
    c.save()
    return buf.getvalue()


# Restrict full RFP details so they only flow after NDA is signed (or skip_nda)
def _require_full_access(invite: Dict[str, Any]) -> None:
    if invite.get("skip_nda"):
        return
    if invite.get("nda_signed_at"):
        return
    raise HTTPException(403, "NDA not yet signed")


@api.get("/public/invites/{token}/details")
async def public_get_details(token: str):
    """Full RFP details for the sub-consultant — only accessible after NDA signed (or skip_nda)."""
    inv = await db.invites.find_one({"share_token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    _require_full_access(inv)
    proj = await db.projects.find_one(
        {"id": inv["project_id"]},
        {"_id": 0, "title": 1, "client_name": 1, "description": 1, "analysis": 1}
    )
    if inv.get("status") in (None, "sent", "viewed", "interested", "nda_signed"):
        await db.invites.update_one({"share_token": token}, {"$set": {"status": "viewing_details"}})
    discipline_section = None
    if proj and proj.get("analysis"):
        analysis = proj["analysis"]
        for d in (analysis.get("disciplines") or []):
            if (d.get("name") or "").lower() == (inv.get("discipline") or "").lower():
                discipline_section = d
                break
        proj_view = {
            "title": proj.get("title"),
            "client_name": "Confidential client" if inv.get("anonymise_client") else proj.get("client_name"),
            "summary": analysis.get("summary", ""),
            "project_objectives": analysis.get("project_objectives", ""),
            "scope": analysis.get("scope", []),
            "key_dates": analysis.get("key_dates", []),
            "deliverables": analysis.get("deliverables", []),
            "technical_specifications": analysis.get("technical_specifications", []),
            "financial_terms": analysis.get("financial_terms", {}),
            "submission_guidelines": analysis.get("submission_guidelines", {}),
            "discipline": discipline_section,
        }
    else:
        proj_view = {
            "title": proj.get("title") if proj else "",
            "client_name": "Confidential client" if inv.get("anonymise_client") else (proj.get("client_name") if proj else ""),
            "summary": "", "project_objectives": "", "scope": [], "key_dates": [],
            "deliverables": [], "technical_specifications": [],
            "financial_terms": {}, "submission_guidelines": {},
            "discipline": None,
        }
    return {"invite": inv, "project": proj_view}


@api.post("/public/invites/{token}/respond")
async def public_respond(token: str, body: InviteResponseIn):
    inv = await db.invites.find_one({"share_token": token})
    if not inv:
        raise HTTPException(404, "Invite not found")
    _require_full_access(inv)
    update = {
        "fee": body.fee,
        "currency": body.currency,
        "response_notes": body.notes or "",
        "response_timeline": body.timeline or "",
        "status": "submitted" if body.status == "submitted" else "declined",
        "responded_at": now(),
    }
    if body.status != "submitted" and not inv.get("decline_stage"):
        update["decline_stage"] = "details"
        update["declined_at"] = now()
    await db.invites.update_one({"share_token": token}, {"$set": update})
    merged = {**inv, **update}
    import asyncio as _asyncio
    event = "responded" if body.status == "submitted" else "declined"
    extra = f"Fee: {body.currency} {body.fee:,.2f}" if body.status == "submitted" else f"Stage: full details. Notes: {body.notes or '—'}"
    _asyncio.create_task(_notify_owner(merged, event, extra))
    return {"ok": True}


# ---------------------- fee merge ---------------------- #
@api.get("/projects/{project_id}/fees")
async def fee_summary(project_id: str, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    invites = await db.invites.find({"project_id": project_id}, {"_id": 0}).to_list(500)
    by_currency: Dict[str, float] = {}
    submitted = []
    for inv in invites:
        if inv.get("status") == "submitted" and isinstance(inv.get("fee"), (int, float)):
            cur = inv.get("currency") or "USD"
            by_currency[cur] = by_currency.get(cur, 0.0) + float(inv["fee"])
            submitted.append(inv)
    return {
        "invites": invites,
        "submitted_count": len(submitted),
        "total_invites": len(invites),
        "totals_by_currency": by_currency,
    }


# ---------------------- chat with RFP ---------------------- #
@api.post("/projects/{project_id}/chat")
async def chat_rfp(project_id: str, body: ChatIn, user=Depends(get_current_user)):
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    results = query_project(project_id, body.question, n_results=6)
    context = [{"text": t, "filename": (m or {}).get("filename", "doc")} for t, m in results]
    settings = await _get_settings(user["id"])
    answer = await answer_question(project_id, body.question, context, settings)
    return {"answer": answer, "sources": [c["filename"] for c in context]}


# ---------------------- root + mount ---------------------- #
@api.get("/")
async def root():
    return {"name": "RFP Analyser API", "status": "ok"}


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
