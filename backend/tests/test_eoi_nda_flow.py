"""Backend tests for the new EOI → NDA → Full-Details public flow + NDA template library + skip_nda/anonymise.

Avoids /analyze (LLM key exhausted). Creates projects directly and seeds invites.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"

UNIQUE = uuid.uuid4().hex[:8]
EMAIL = f"eoiowner_{UNIQUE}@rfpqa.example.com"
PASS = "TestEoi123!"

state = {}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


# ---------- Auth + project bootstrap ----------
def test_signup_owner(s):
    r = s.post(f"{API}/auth/signup", json={"email": EMAIL, "password": PASS, "name": "EOI Owner"})
    assert r.status_code == 200, r.text
    state["token"] = r.json()["token"]
    state["user"] = r.json()["user"]


def H():
    return {"Authorization": f"Bearer {state['token']}"}


def test_create_project(s):
    r = s.post(f"{API}/projects", headers=H(),
               json={"title": "TEST_EOI_Tower", "client_name": "Acme Health Real", "description": "test"})
    assert r.status_code == 200
    state["pid"] = r.json()["id"]


def test_create_invite(s):
    r = s.post(f"{API}/projects/{state['pid']}/invites", headers=H(),
               json={"discipline": "Structural", "consultant_name": "Sub A",
                     "consultant_email": "sub_a@rfpqa.example.com", "consultant_company": "SubA LLC"})
    assert r.status_code == 200
    inv = r.json()
    state["iid"] = inv["id"]
    state["tok"] = inv["share_token"]
    assert inv["status"] == "sent"


# ---------- EOI step ----------
def test_eoi_get_marks_viewed(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/eoi")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["discipline"] == "Structural"
    assert body["project"]["title"] == "TEST_EOI_Tower"
    assert body["project"]["client_name"] == "Acme Health Real"
    assert body["invite_status"] == "viewed"
    assert body["skip_nda"] is False


def test_details_blocked_before_nda(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/details")
    assert r.status_code == 403, f"expected 403 before NDA signed, got {r.status_code} {r.text}"


def test_respond_blocked_before_nda(s):
    r = requests.post(f"{API}/public/invites/{state['tok']}/respond",
                      json={"fee": 1000, "currency": "USD", "status": "submitted"})
    assert r.status_code == 403


def test_pdf_404_before_signed(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/nda/pdf")
    assert r.status_code == 404


def test_express_interest(s):
    r = requests.post(f"{API}/public/invites/{state['tok']}/interest", json={"interested": True})
    assert r.status_code == 200
    # Verify status changed
    r2 = requests.get(f"{API}/public/invites/{state['tok']}/eoi")
    assert r2.json()["invite_status"] == "interested"


# ---------- NDA step ----------
def test_get_nda_returns_default_template(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/nda")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "template" in body and "rendered" in body
    assert "NON-DISCLOSURE AGREEMENT" in body["template"]
    assert "Sub A" in body["rendered"]
    assert "TEST_EOI_Tower" in body["rendered"]
    assert "Acme Health Real" in body["rendered"]
    assert body["already_signed"] is False


def test_sign_nda_requires_agree(s):
    r = requests.post(f"{API}/public/invites/{state['tok']}/nda/sign",
                      json={"typed_name": "Sub A Signer", "email_confirm": "sub_a@rfpqa.example.com",
                            "agree": False})
    assert r.status_code == 400


def test_sign_nda_success(s):
    r = requests.post(f"{API}/public/invites/{state['tok']}/nda/sign",
                      json={"typed_name": "Sub A Signer", "email_confirm": "sub_a@rfpqa.example.com",
                            "agree": True})
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_nda_pdf_after_signed(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/nda/pdf")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    body = r.content
    assert len(body) > 1024, f"PDF too small: {len(body)} bytes"
    assert body[:4] == b"%PDF", f"Not a PDF: {body[:8]!r}"


def test_get_nda_already_signed_flag(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/nda")
    assert r.status_code == 200
    assert r.json()["already_signed"] is True


# ---------- Details step (post-NDA) ----------
def test_details_accessible_after_nda(s):
    r = requests.get(f"{API}/public/invites/{state['tok']}/details")
    assert r.status_code == 200
    body = r.json()
    assert body["invite"]["status"] in ("nda_signed", "viewing_details")
    assert body["project"]["title"] == "TEST_EOI_Tower"
    # Without analysis these will be empty - expected
    assert "scope" in body["project"]
    assert "key_dates" in body["project"]


def test_respond_submitted(s):
    r = requests.post(f"{API}/public/invites/{state['tok']}/respond",
                      json={"fee": 25000, "currency": "USD", "notes": "ok",
                            "timeline": "6 weeks", "status": "submitted"})
    assert r.status_code == 200
    # Verify persisted
    invs = s.get(f"{API}/projects/{state['pid']}/invites", headers=H()).json()
    inv = next(i for i in invs if i["id"] == state["iid"])
    assert inv["status"] == "submitted"
    assert inv["fee"] == 25000


# ---------- NDA Template Library ----------
def test_builtin_nda_endpoint(s):
    r = s.get(f"{API}/library/nda/builtin", headers=H())
    assert r.status_code == 200
    txt = r.json()["nda_text"]
    assert "NON-DISCLOSURE" in txt
    assert len(txt) > 1500


def test_builtin_requires_auth(s):
    r = requests.get(f"{API}/library/nda/builtin")
    assert r.status_code == 401


def test_create_nda_template_default(s):
    payload = {"type": "nda_template", "nda_name": "TEST_Mutual NDA",
               "nda_text": "CUSTOM NDA for {{consultant_name}} on {{project_title}} - {{client_name}}",
               "is_default": True}
    r = s.post(f"{API}/library", headers=H(), json=payload)
    assert r.status_code == 200
    item = r.json()
    state["tpl_id"] = item["id"]
    assert item["nda_name"] == "TEST_Mutual NDA"
    assert item["is_default"] is True


def test_list_nda_templates(s):
    r = s.get(f"{API}/library?type=nda_template", headers=H())
    assert r.status_code == 200
    items = r.json()
    assert any(i["id"] == state["tpl_id"] for i in items)


def test_custom_default_used_in_public_nda(s):
    """Create a fresh invite and confirm the public NDA endpoint uses the custom default."""
    r = s.post(f"{API}/projects/{state['pid']}/invites", headers=H(),
               json={"discipline": "MEP", "consultant_name": "Sub B",
                     "consultant_email": "sub_b@rfpqa.example.com"})
    assert r.status_code == 200
    tok2 = r.json()["share_token"]
    state["tok2"] = tok2
    state["iid2"] = r.json()["id"]
    # advance past EOI
    requests.get(f"{API}/public/invites/{tok2}/eoi")
    requests.post(f"{API}/public/invites/{tok2}/interest", json={"interested": True})
    nda = requests.get(f"{API}/public/invites/{tok2}/nda").json()
    assert "CUSTOM NDA for Sub B" in nda["rendered"]
    assert "TEST_EOI_Tower" in nda["rendered"]


def test_update_nda_template(s):
    r = s.put(f"{API}/library/{state['tpl_id']}", headers=H(),
              json={"type": "nda_template", "nda_name": "TEST_Mutual NDA v2",
                    "nda_text": "v2 NDA for {{consultant_name}} - client {{client_name}}",
                    "is_default": True})
    assert r.status_code == 200
    assert r.json()["nda_name"] == "TEST_Mutual NDA v2"


# ---------- Invite PATCH: skip_nda ----------
def test_skip_nda_patch(s):
    # Create fresh invite for skip_nda
    r = s.post(f"{API}/projects/{state['pid']}/invites", headers=H(),
               json={"discipline": "Civil", "consultant_name": "Sub C",
                     "consultant_email": "sub_c@rfpqa.example.com"})
    iid = r.json()["id"]; tok = r.json()["share_token"]
    state["skip_tok"] = tok
    # Confirm 403 first
    requests.get(f"{API}/public/invites/{tok}/eoi")
    pre = requests.get(f"{API}/public/invites/{tok}/details")
    assert pre.status_code == 403
    # Patch
    r = s.patch(f"{API}/projects/{state['pid']}/invites/{iid}", headers=H(),
                json={"skip_nda": True})
    assert r.status_code == 200
    assert r.json()["skip_nda"] is True
    # Should now be accessible
    post = requests.get(f"{API}/public/invites/{tok}/details")
    assert post.status_code == 200
    # Respond also works without NDA
    rr = requests.post(f"{API}/public/invites/{tok}/respond",
                       json={"fee": 100, "currency": "USD", "status": "submitted"})
    assert rr.status_code == 200


# ---------- Invite PATCH: anonymise_client ----------
def test_anonymise_patch(s):
    r = s.post(f"{API}/projects/{state['pid']}/invites", headers=H(),
               json={"discipline": "Fire", "consultant_name": "Sub D",
                     "consultant_email": "sub_d@rfpqa.example.com"})
    iid = r.json()["id"]; tok = r.json()["share_token"]
    r = s.patch(f"{API}/projects/{state['pid']}/invites/{iid}", headers=H(),
                json={"anonymise_client": True})
    assert r.status_code == 200
    eoi = requests.get(f"{API}/public/invites/{tok}/eoi").json()
    assert eoi["project"]["client_name"] == "Confidential client"
    requests.post(f"{API}/public/invites/{tok}/interest", json={"interested": True})
    nda = requests.get(f"{API}/public/invites/{tok}/nda").json()
    assert "Confidential client" in nda["rendered"]
    assert "Acme Health Real" not in nda["rendered"]


def test_patch_invite_empty_body_400(s):
    r = s.patch(f"{API}/projects/{state['pid']}/invites/{state['iid']}", headers=H(), json={})
    assert r.status_code == 400


# ---------- Decline flows ----------
def test_decline_at_eoi(s):
    r = s.post(f"{API}/projects/{state['pid']}/invites", headers=H(),
               json={"discipline": "Interiors", "consultant_name": "Sub E",
                     "consultant_email": "sub_e@rfpqa.example.com"})
    iid = r.json()["id"]; tok = r.json()["share_token"]
    requests.get(f"{API}/public/invites/{tok}/eoi")
    r2 = requests.post(f"{API}/public/invites/{tok}/interest",
                       json={"interested": False, "reason": "capacity"})
    assert r2.status_code == 200
    # Confirm via owner list
    invs = s.get(f"{API}/projects/{state['pid']}/invites", headers=H()).json()
    inv = next(i for i in invs if i["id"] == iid)
    assert inv["status"] == "declined"
    assert inv.get("decline_stage") == "eoi"
    assert inv.get("decline_reason") == "capacity"


def test_decline_at_details(s):
    # Need to sign NDA first then decline at details stage
    r = s.post(f"{API}/projects/{state['pid']}/invites", headers=H(),
               json={"discipline": "BIM", "consultant_name": "Sub F",
                     "consultant_email": "sub_f@rfpqa.example.com"})
    iid = r.json()["id"]; tok = r.json()["share_token"]
    requests.get(f"{API}/public/invites/{tok}/eoi")
    requests.post(f"{API}/public/invites/{tok}/interest", json={"interested": True})
    requests.post(f"{API}/public/invites/{tok}/nda/sign",
                  json={"typed_name": "F Signer", "email_confirm": "sub_f@rfpqa.example.com", "agree": True})
    r3 = requests.post(f"{API}/public/invites/{tok}/respond",
                       json={"fee": 0, "currency": "USD", "notes": "no thanks", "status": "declined"})
    assert r3.status_code == 200
    invs = s.get(f"{API}/projects/{state['pid']}/invites", headers=H()).json()
    inv = next(i for i in invs if i["id"] == iid)
    assert inv["status"] == "declined"
    assert inv.get("decline_stage") == "details"


# ---------- Library CRUD regression for non-NDA types ----------
def test_library_requirement_crud(s):
    r = s.post(f"{API}/library", headers=H(),
               json={"type": "requirement", "title": "TEST_Reqt", "text": "XYZ"})
    assert r.status_code == 200
    rid = r.json()["id"]
    r2 = s.get(f"{API}/library?type=requirement", headers=H())
    assert any(x["id"] == rid for x in r2.json())
    r3 = s.delete(f"{API}/library/{rid}", headers=H())
    assert r3.status_code == 200


def test_library_invalid_type_400(s):
    r = s.get(f"{API}/library?type=bogus", headers=H())
    assert r.status_code == 400


# ---------- Cleanup ----------
def test_cleanup(s):
    s.delete(f"{API}/library/{state['tpl_id']}", headers=H())
    s.delete(f"{API}/projects/{state['pid']}", headers=H())
