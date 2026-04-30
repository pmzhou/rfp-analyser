"""RFP Analyser — FastAPI backend."""
import os
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import FileResponse
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

    await db.projects.update_one({"id": project_id}, {"$set": {"status": "analysing", "updated_at": now()}})
    try:
        analysis = await analyze_rfp(project_id, combined)
    except Exception as e:
        logger.exception("analysis failed")
        await db.projects.update_one({"id": project_id}, {"$set": {"status": "draft", "updated_at": now()}})
        raise HTTPException(500, f"Analysis failed: {e}")
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"analysis": analysis, "status": "analysed", "updated_at": now()}}
    )
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return p


@api.patch("/projects/{project_id}/analysis")
async def update_analysis(project_id: str, body: Dict[str, Any], user=Depends(get_current_user)):
    """Human-in-the-loop QA: persist user-edited analysis fields."""
    p = await db.projects.find_one({"id": project_id, "owner_id": user["id"]})
    if not p:
        raise HTTPException(404, "Project not found")
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"analysis": body, "updated_at": now()}}
    )
    return await db.projects.find_one({"id": project_id}, {"_id": 0})


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


# Public endpoints (no auth) for sub-consultants
@api.get("/public/invites/{token}")
async def public_get_invite(token: str):
    inv = await db.invites.find_one({"share_token": token}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invite not found")
    proj = await db.projects.find_one(
        {"id": inv["project_id"]},
        {"_id": 0, "title": 1, "client_name": 1, "description": 1, "analysis": 1}
    )
    if inv["status"] == "sent":
        await db.invites.update_one({"share_token": token}, {"$set": {"status": "viewed"}})
        inv["status"] = "viewed"
    # Slim analysis for sub-consultant: only their discipline + key dates + scope
    discipline_section = None
    if proj and proj.get("analysis"):
        analysis = proj["analysis"]
        for d in (analysis.get("disciplines") or []):
            if (d.get("name") or "").lower() == inv["discipline"].lower():
                discipline_section = d
                break
        proj_view = {
            "title": proj.get("title"),
            "client_name": proj.get("client_name"),
            "summary": analysis.get("summary"),
            "scope": analysis.get("scope", []),
            "key_dates": analysis.get("key_dates", []),
            "discipline": discipline_section,
        }
    else:
        proj_view = {"title": proj.get("title") if proj else "", "client_name": proj.get("client_name") if proj else "", "summary": "", "scope": [], "key_dates": [], "discipline": None}
    return {"invite": inv, "project": proj_view}


@api.post("/public/invites/{token}/respond")
async def public_respond(token: str, body: InviteResponseIn):
    inv = await db.invites.find_one({"share_token": token})
    if not inv:
        raise HTTPException(404, "Invite not found")
    update = {
        "fee": body.fee,
        "currency": body.currency,
        "response_notes": body.notes or "",
        "response_timeline": body.timeline or "",
        "status": "submitted" if body.status == "submitted" else "declined",
        "responded_at": now(),
    }
    await db.invites.update_one({"share_token": token}, {"$set": update})
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
    answer = await answer_question(project_id, body.question, context)
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
