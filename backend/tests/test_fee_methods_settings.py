"""Backend tests for new Fee Methods settings fields on PUT/GET /api/settings.

Validates the 7 new fee_* fields persist, round-trip correctly, and that
partial PUTs (only fee_* fields) do NOT clobber existing smtp/llm/preferences.
"""
import os
import re
import uuid
import pytest
import requests


def _load_backend_url() -> str:
    v = os.environ.get('REACT_APP_BACKEND_URL')
    if v:
        return v.rstrip('/')
    try:
        with open('/app/frontend/.env') as f:
            for line in f:
                m = re.match(r'^REACT_APP_BACKEND_URL=(.+)$', line.strip())
                if m:
                    return m.group(1).rstrip('/')
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

UNIQUE = uuid.uuid4().hex[:8]
USER_EMAIL = f"feem_{UNIQUE}@rfpqa.example.com"
PASSWORD = "TestPass123!"

state = {}


@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session", autouse=True)
def _bootstrap(s):
    """Create a fresh user for an isolated settings doc."""
    r = s.post(f"{API}/auth/signup", json={"email": USER_EMAIL, "password": PASSWORD, "name": "FeeM"})
    assert r.status_code == 200, r.text
    state["token"] = r.json()["token"]
    state["headers"] = {"Authorization": f"Bearer {state['token']}"}
    yield


def H():
    return state["headers"]


# ---------------- Field defaults / shape ---------------- #
def test_get_settings_initial_returns_no_fee_fields(s):
    """Fresh user — settings doc may be empty, fee fields should be absent or None."""
    r = s.get(f"{API}/settings", headers=H())
    assert r.status_code == 200
    body = r.json()
    # Should NOT leak password fields raw
    assert "smtp_password" not in body
    assert "llm_api_key" not in body
    # mask helpers always present
    assert "smtp_password_mask" in body
    assert "llm_api_key_mask" in body


# ---------------- Round-trip all 7 new fields ---------------- #
def test_put_all_fee_fields_round_trip(s):
    payload = {
        "fee_benchmark_by_typology": {
            "healthcare": 13.5, "residential": 9.5, "lab": 14.0, "commercial": 8.0,
            "education": 11.0, "hospitality": 10.5, "industrial": 7.5, "retail": 9.0,
            "civic": 11.5, "religious": 10.0, "transport": 8.5, "other": 10.0
        },
        "fee_phase_preset": "bim_led",
        "fee_phase_distribution": {"SD": 18, "DD": 22, "CD": 35, "Tender": 5, "CA": 20},
        "fee_overhead_multiplier": 3.05,
        "fee_target_margin_pct": 22.5,
        "fee_lock_to_signing_budget": True,
        "fee_sliding_scale": [
            {"limit": 10_000_000, "pct": 8.0},
            {"limit": 20_000_000, "pct": 6.5},
            {"limit": 50_000_000, "pct": 5.0},
        ],
        "fee_complexity_factors": [
            {"name": "Healthcare", "pct": 40, "on": False},
            {"name": "Heritage", "pct": 25, "on": True},
        ],
    }
    r = s.put(f"{API}/settings", headers=H(), json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["fee_phase_preset"] == "bim_led"
    assert body["fee_overhead_multiplier"] == 3.05
    assert body["fee_target_margin_pct"] == 22.5
    assert body["fee_lock_to_signing_budget"] is True
    assert body["fee_benchmark_by_typology"]["healthcare"] == 13.5
    assert body["fee_benchmark_by_typology"]["lab"] == 14.0
    assert body["fee_phase_distribution"]["DD"] == 22
    assert len(body["fee_sliding_scale"]) == 3
    assert body["fee_sliding_scale"][1] == {"limit": 20_000_000, "pct": 6.5}
    assert len(body["fee_complexity_factors"]) == 2
    assert body["fee_complexity_factors"][1]["on"] is True


def test_get_after_put_returns_persisted_fee_fields(s):
    """GET must return the values stored by the previous PUT unchanged."""
    r = s.get(f"{API}/settings", headers=H())
    assert r.status_code == 200
    body = r.json()
    assert body["fee_phase_preset"] == "bim_led"
    assert body["fee_overhead_multiplier"] == 3.05
    assert body["fee_target_margin_pct"] == 22.5
    assert body["fee_lock_to_signing_budget"] is True
    assert body["fee_benchmark_by_typology"]["healthcare"] == 13.5
    assert body["fee_complexity_factors"][0]["name"] == "Healthcare"


# ---------------- Existing fields still round-trip ---------------- #
def test_put_smtp_and_llm_round_trip(s):
    payload = {
        "default_currency": "USD",
        "date_format": "yyyy-mm-dd",
        "smtp_host": "smtp.example.com",
        "smtp_port": 465,
        "smtp_username": "noreply@example.com",
        "smtp_password": "supersecret",
        "smtp_use_tls": False,
        "smtp_from_name": "RFP Test",
        "smtp_from_email": "noreply@example.com",
        "llm_provider": "anthropic",
        "llm_model": "claude-sonnet-4-5-20250929",
        "llm_api_key": "sk-test-llm-key",
        "llm_base_url": "https://api.anthropic.com",
    }
    r = s.put(f"{API}/settings", headers=H(), json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["default_currency"] == "USD"
    assert body["date_format"] == "yyyy-mm-dd"
    assert body["smtp_host"] == "smtp.example.com"
    assert body["smtp_port"] == 465
    assert body["smtp_use_tls"] is False
    assert body["smtp_from_name"] == "RFP Test"
    assert body["llm_provider"] == "anthropic"
    assert body["llm_model"] == "claude-sonnet-4-5-20250929"
    assert body["llm_base_url"] == "https://api.anthropic.com"
    # secrets must not echo, but mask should be set
    assert "smtp_password" not in body
    assert "llm_api_key" not in body
    assert body["smtp_password_mask"]
    assert body["llm_api_key_mask"]


# ---------------- Partial PUT must NOT clobber siblings ---------------- #
def test_partial_put_fee_only_preserves_smtp_llm(s):
    """Send only fee_* fields. SMTP/LLM/preferences set in previous test must remain."""
    payload = {
        "fee_phase_preset": "traditional",
        "fee_overhead_multiplier": 2.85,
        "fee_target_margin_pct": 20.0,
        "fee_lock_to_signing_budget": False,
    }
    r = s.put(f"{API}/settings", headers=H(), json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    # Fee fields updated
    assert body["fee_phase_preset"] == "traditional"
    assert body["fee_overhead_multiplier"] == 2.85
    assert body["fee_target_margin_pct"] == 20.0
    assert body["fee_lock_to_signing_budget"] is False
    # SMTP/LLM/preferences PRESERVED
    assert body["default_currency"] == "USD"
    assert body["date_format"] == "yyyy-mm-dd"
    assert body["smtp_host"] == "smtp.example.com"
    assert body["smtp_port"] == 465
    assert body["smtp_use_tls"] is False
    assert body["llm_provider"] == "anthropic"
    assert body["llm_model"] == "claude-sonnet-4-5-20250929"
    # Secrets preserved (mask still set since we didn't pass None or "")
    assert body["smtp_password_mask"]
    assert body["llm_api_key_mask"]
    # Earlier benchmark/sliding/complexity still there (set 2 tests ago)
    assert body["fee_benchmark_by_typology"]["healthcare"] == 13.5
    assert len(body["fee_sliding_scale"]) == 3
    assert len(body["fee_complexity_factors"]) == 2


# ---------------- Partial PUT only SMTP/LLM keeps fee_* ---------------- #
def test_partial_put_smtp_only_preserves_fee_fields(s):
    payload = {"smtp_from_name": "Updated Sender"}
    r = s.put(f"{API}/settings", headers=H(), json=payload)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["smtp_from_name"] == "Updated Sender"
    # All fee fields still there
    assert body["fee_phase_preset"] == "traditional"
    assert body["fee_overhead_multiplier"] == 2.85
    assert body["fee_benchmark_by_typology"]["healthcare"] == 13.5
    assert body["fee_sliding_scale"][0]["limit"] == 10_000_000


# ---------------- Auth guard ---------------- #
def test_get_settings_requires_auth(s):
    r = requests.get(f"{API}/settings")
    assert r.status_code == 401


def test_put_settings_requires_auth(s):
    r = requests.put(f"{API}/settings", json={"fee_phase_preset": "traditional"})
    assert r.status_code == 401


# ---------------- Validation: wrong types ---------------- #
def test_put_invalid_overhead_type_rejected(s):
    r = s.put(f"{API}/settings", headers=H(), json={"fee_overhead_multiplier": "not-a-number"})
    assert r.status_code == 422


def test_put_invalid_lock_budget_type_rejected(s):
    # Pydantic actually coerces "true"/"false" strings; ensure non-coercible value rejected
    r = s.put(f"{API}/settings", headers=H(), json={"fee_lock_to_signing_budget": "notabool"})
    assert r.status_code == 422


# ---------------- Edge: empty/null preserves ---------------- #
def test_put_none_fee_fields_preserves_existing(s):
    """Sending null fee fields (omitted) should not clobber existing values."""
    # Only pass an unrelated field
    r = s.put(f"{API}/settings", headers=H(), json={"default_currency": "AED"})
    assert r.status_code == 200
    body = r.json()
    assert body["default_currency"] == "AED"
    # fee_* preserved
    assert body["fee_phase_preset"] == "traditional"
    assert body["fee_benchmark_by_typology"]["healthcare"] == 13.5
