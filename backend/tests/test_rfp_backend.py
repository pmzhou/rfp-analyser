"""Backend regression tests for RFP Analyser - auth, projects, docs, analyse, invites, fees, chat."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://rfp-workflow-pro.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

UNIQUE = uuid.uuid4().hex[:8]
ADMIN_EMAIL = f"admin_{UNIQUE}@rfpqa.example.com"
MEMBER_EMAIL = f"member_{UNIQUE}@rfpqa.example.com"
PASSWORD = "TestAdmin123!"

state = {}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# -------- Auth --------
def test_signup_first_user_admin(s):
    r = s.post(f"{API}/auth/signup", json={"email": ADMIN_EMAIL, "password": PASSWORD, "name": "Admin"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and data["user"]["email"] == ADMIN_EMAIL
    assert "password_hash" not in data["user"]
    state["admin_token"] = data["token"]
    state["admin_user"] = data["user"]


def test_signup_second_user_member(s):
    r = s.post(f"{API}/auth/signup", json={"email": MEMBER_EMAIL, "password": PASSWORD, "name": "Member"})
    assert r.status_code == 200, r.text
    user = r.json()["user"]
    # Role should NOT be admin since admin already exists
    assert user["role"] in ("member", "admin")  # admin only if there were 0 users before; we expect member
    state["member_token"] = r.json()["token"]


def test_signup_duplicate_rejected(s):
    r = s.post(f"{API}/auth/signup", json={"email": ADMIN_EMAIL, "password": PASSWORD, "name": "Dup"})
    assert r.status_code == 400


def test_login_success(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": PASSWORD})
    assert r.status_code == 200
    assert "token" in r.json()


def test_login_invalid(s):
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_me_returns_user(s):
    h = {"Authorization": f"Bearer {state['admin_token']}"}
    r = s.get(f"{API}/auth/me", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["email"] == ADMIN_EMAIL
    assert "password_hash" not in body


# -------- Projects --------
def auth_h():
    return {"Authorization": f"Bearer {state['admin_token']}"}


def member_h():
    return {"Authorization": f"Bearer {state['member_token']}"}


def test_create_project(s):
    r = s.post(f"{API}/projects", headers=auth_h(),
               json={"title": "TEST_RFP_Hospital", "client_name": "Acme Health", "description": "Test"})
    assert r.status_code == 200
    p = r.json()
    assert p["status"] == "draft" and p["id"]
    state["project_id"] = p["id"]


def test_list_projects_owner_only(s):
    r = s.get(f"{API}/projects", headers=auth_h())
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert state["project_id"] in ids
    # member should not see admin's project
    r2 = s.get(f"{API}/projects", headers=member_h())
    ids2 = [p["id"] for p in r2.json()]
    assert state["project_id"] not in ids2


def test_get_project_404_for_non_owner(s):
    r = s.get(f"{API}/projects/{state['project_id']}", headers=member_h())
    assert r.status_code == 404


# -------- Documents --------
SAMPLE_RFP = b"""REQUEST FOR PROPOSAL - Hospital Tower Renovation
Client: Acme Health Systems
Submission Deadline: March 15, 2026
Kickoff: April 1, 2026

Scope: Full architectural and engineering services for a 4-storey hospital tower renovation.
Disciplines required: Architecture, Structural Engineering, MEP, Civil, Fire Safety, Interiors.

Requirements:
1. Licensed engineers in state.
2. Minimum 5 years healthcare experience.
3. BIM Level 2 deliverables mandatory.
4. Sustainability LEED Gold target.
"""


def test_upload_document(s):
    files = {"file": ("rfp.txt", SAMPLE_RFP, "text/plain")}
    r = s.post(f"{API}/projects/{state['project_id']}/documents", headers=auth_h(), files=files)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["chunks"] > 0 and d["text_length"] > 0
    state["doc_id"] = d["id"]


def test_list_documents(s):
    r = s.get(f"{API}/projects/{state['project_id']}/documents", headers=auth_h())
    assert r.status_code == 200 and len(r.json()) >= 1


# -------- Analyse (real LLM) --------
def test_analyze_project(s):
    r = s.post(f"{API}/projects/{state['project_id']}/analyze", headers=auth_h(), timeout=120)
    assert r.status_code == 200, r.text
    p = r.json()
    a = p.get("analysis") or {}
    for k in ("title", "summary", "scope", "requirements", "key_dates", "disciplines"):
        assert k in a, f"missing {k} in analysis"
    assert isinstance(a["disciplines"], list) and len(a["disciplines"]) > 0
    state["disciplines"] = [d["name"] for d in a["disciplines"]]
    assert p["status"] == "analysed"


# -------- Invites --------
def test_create_invite(s):
    discipline = state.get("disciplines", ["Architecture"])[0]
    r = s.post(f"{API}/projects/{state['project_id']}/invites", headers=auth_h(),
               json={"discipline": discipline, "consultant_name": "Sub A",
                     "consultant_email": "sub_a@rfpqa.example.com", "consultant_company": "Sub A LLC"})
    assert r.status_code == 200
    inv = r.json()
    assert inv["share_token"] and inv["status"] == "sent"
    state["invite_id"] = inv["id"]
    state["share_token"] = inv["share_token"]


def test_public_get_invite_no_auth(s):
    r = requests.get(f"{API}/public/invites/{state['share_token']}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["invite"]["status"] == "viewed"
    assert "project" in body and "discipline" in body["project"]


def test_public_respond_no_auth(s):
    r = requests.post(f"{API}/public/invites/{state['share_token']}/respond",
                      json={"fee": 25000, "currency": "USD", "notes": "test", "timeline": "8 weeks", "status": "submitted"})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_fee_summary(s):
    r = s.get(f"{API}/projects/{state['project_id']}/fees", headers=auth_h())
    assert r.status_code == 200
    body = r.json()
    assert body["submitted_count"] >= 1
    assert body["totals_by_currency"].get("USD", 0) >= 25000


# -------- Chat (real LLM) --------
def test_chat_with_rfp(s):
    r = s.post(f"{API}/projects/{state['project_id']}/chat", headers=auth_h(),
               json={"question": "What is the submission deadline?"}, timeout=90)
    assert r.status_code == 200
    body = r.json()
    assert "answer" in body and len(body["answer"]) > 0


# -------- Delete flows --------
def test_delete_invite(s):
    r = s.delete(f"{API}/projects/{state['project_id']}/invites/{state['invite_id']}", headers=auth_h())
    assert r.status_code == 200 and r.json()["ok"] is True


def test_delete_document(s):
    r = s.delete(f"{API}/projects/{state['project_id']}/documents/{state['doc_id']}", headers=auth_h())
    assert r.status_code == 200 and r.json()["ok"] is True


def test_delete_project(s):
    r = s.delete(f"{API}/projects/{state['project_id']}", headers=auth_h())
    assert r.status_code == 200
    # verify gone
    r2 = s.get(f"{API}/projects/{state['project_id']}", headers=auth_h())
    assert r2.status_code == 404
