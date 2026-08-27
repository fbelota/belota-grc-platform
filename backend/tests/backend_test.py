"""
BELOTA GRC Platform - Backend integration tests.
Covers: auth, companies CRM, diagnostic scoring, sub-collection CRUD (inventory/ropa/ripd/risks/actions/trainings/evidences/tickets),
AI endpoints (recommendations, RoPA suggest, RIPD generate, document generate), certificate rules, audit, dashboards.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://enterprise-grc-hub-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "fredbelota@gmail.com"
ADMIN_PASSWORD = "Belota@2025"

state = {}  # shared bag


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["role"] == "admin"
    assert "token" in data
    # Also set Authorization header as fallback (cookies too)
    s.headers.update({"Authorization": f"Bearer {data['token']}"})
    state["admin_user"] = data
    return s


@pytest.fixture(scope="session")
def company_id(admin_session):
    body = {"name": f"TEST_Empresa_{uuid.uuid4().hex[:6]}", "cnpj": "12.345.678/0001-00",
            "sector": "Tecnologia", "size": "PME", "contact_name": "Contato",
            "contact_email": "c@t.com", "stage": "onboarding", "plan": "premium"}
    r = admin_session.post(f"{API}/companies", json=body, timeout=30)
    assert r.status_code == 200, r.text
    cid = r.json()["id"]
    state["company_id"] = cid
    yield cid
    # cleanup
    try:
        admin_session.delete(f"{API}/companies/{cid}", timeout=30)
    except Exception:
        pass


# -------------------- AUTH --------------------
class TestAuth:
    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_me(self, admin_session):
        r = admin_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_unauth_blocked(self):
        r = requests.get(f"{API}/companies", timeout=15)
        assert r.status_code == 401

    def test_register_consultor(self):
        s = requests.Session()
        email = f"test_consultor_{uuid.uuid4().hex[:6]}@test.com"
        r = s.post(f"{API}/auth/register", json={"name": "Test Cons", "email": email,
                                                 "password": "Pass1234!", "role": "consultor"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["role"] == "consultor"


# -------------------- COMPANIES --------------------
class TestCompanies:
    def test_list_companies(self, admin_session):
        r = admin_session.get(f"{API}/companies", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_company(self, admin_session, company_id):
        r = admin_session.get(f"{API}/companies/{company_id}", timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == company_id

    def test_update_company(self, admin_session, company_id):
        r = admin_session.get(f"{API}/companies/{company_id}", timeout=15)
        body = r.json()
        body["notes"] = "updated"
        # strip non-CompanyIn fields
        payload = {k: body.get(k, "") for k in ["name","cnpj","sector","size","contact_name","contact_email","contact_phone","stage","plan","notes"]}
        r = admin_session.put(f"{API}/companies/{company_id}", json=payload, timeout=15)
        assert r.status_code == 200
        assert r.json()["notes"] == "updated"


# -------------------- DIAGNOSTIC --------------------
class TestDiagnostic:
    def test_template(self, admin_session):
        r = admin_session.get(f"{API}/diagnostic/template", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 3

    def test_save_diagnostic_low_score(self, admin_session, company_id):
        # all "nao" => 0%
        answers = {}
        r = admin_session.get(f"{API}/diagnostic/template", timeout=15)
        for d in r.json():
            for q in d["questions"]:
                answers[q["id"]] = "nao"
        r = admin_session.post(f"{API}/companies/{company_id}/diagnostic",
                               json={"answers": answers}, timeout=15)
        assert r.status_code == 200
        assert r.json()["score"] == 0

    def test_save_diagnostic_full_score(self, admin_session, company_id):
        answers = {}
        r = admin_session.get(f"{API}/diagnostic/template", timeout=15)
        for d in r.json():
            for q in d["questions"]:
                answers[q["id"]] = "sim"
        r = admin_session.post(f"{API}/companies/{company_id}/diagnostic",
                               json={"answers": answers}, timeout=15)
        assert r.status_code == 200
        assert r.json()["score"] == 100
        # ensure company compliance_score updated
        r2 = admin_session.get(f"{API}/companies/{company_id}", timeout=15)
        assert r2.json()["compliance_score"] == 100


# -------------------- INVENTORY --------------------
class TestInventory:
    @pytest.mark.parametrize("itype", ["data", "systems", "assets", "vendors"])
    def test_crud_inventory(self, admin_session, company_id, itype):
        r = admin_session.post(f"{API}/companies/{company_id}/inventory",
                               json={"type": itype, "name": f"TEST_{itype}", "category": "cat"}, timeout=15)
        assert r.status_code == 200
        item_id = r.json()["id"]
        assert r.json()["type"] == itype
        # list by type
        r = admin_session.get(f"{API}/companies/{company_id}/inventory?type={itype}", timeout=15)
        assert r.status_code == 200
        assert any(i["id"] == item_id for i in r.json())
        # delete
        r = admin_session.delete(f"{API}/companies/{company_id}/inventory/{item_id}", timeout=15)
        assert r.status_code == 200


# -------------------- RISKS --------------------
class TestRisks:
    def test_create_risk_score(self, admin_session, company_id):
        r = admin_session.post(f"{API}/companies/{company_id}/risks",
                               json={"title": "TEST_risk", "probability": 4, "impact": 5}, timeout=15)
        assert r.status_code == 200
        assert r.json()["score"] == 20
        state["risk_id"] = r.json()["id"]

    def test_list_risks(self, admin_session, company_id):
        r = admin_session.get(f"{API}/companies/{company_id}/risks", timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == state["risk_id"] for x in r.json())

    def test_delete_risk(self, admin_session, company_id):
        r = admin_session.delete(f"{API}/companies/{company_id}/risks/{state['risk_id']}", timeout=15)
        assert r.status_code == 200


# -------------------- ACTIONS / TRAININGS / EVIDENCES --------------------
class TestGenericCrud:
    @pytest.mark.parametrize("path,payload", [
        ("actions", {"title": "TEST_action"}),
        ("trainings", {"title": "TEST_training"}),
        ("evidences", {"title": "TEST_evidence"}),
        ("ropa", {"process_name": "TEST_ropa"}),
    ])
    def test_crud(self, admin_session, company_id, path, payload):
        r = admin_session.post(f"{API}/companies/{company_id}/{path}", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        iid = r.json()["id"]
        r = admin_session.get(f"{API}/companies/{company_id}/{path}", timeout=15)
        assert any(x["id"] == iid for x in r.json())
        r = admin_session.delete(f"{API}/companies/{company_id}/{path}/{iid}", timeout=15)
        assert r.status_code == 200


# -------------------- TICKETS --------------------
class TestTickets:
    def test_create_and_update_ticket(self, admin_session, company_id):
        r = admin_session.post(f"{API}/companies/{company_id}/tickets",
                               json={"requester_name": "TEST_John", "request_type": "acesso"}, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["protocol"].startswith("BEL-")
        tid = data["id"]
        r = admin_session.put(f"{API}/companies/{company_id}/tickets/{tid}",
                              json={"status": "resolvido", "resolution": "ok"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "resolvido"


# -------------------- CERTIFICATE --------------------
class TestCertificate:
    def test_cert_requires_diagnostic_saved(self, admin_session, company_id):
        # score already 100 from TestDiagnostic.test_save_diagnostic_full_score
        r = admin_session.post(f"{API}/companies/{company_id}/certificate", timeout=30)
        assert r.status_code == 200, r.text
        cert = r.json()
        assert cert["seal_type"] == "VERIFIED"
        assert cert["score"] >= 70

    def test_get_cert(self, admin_session, company_id):
        r = admin_session.get(f"{API}/companies/{company_id}/certificate", timeout=15)
        assert r.status_code == 200

    def test_cert_blocked_low_score(self, admin_session):
        # create new company w/o diagnostic
        r = admin_session.post(f"{API}/companies", json={"name": f"TEST_LOW_{uuid.uuid4().hex[:6]}"}, timeout=15)
        cid = r.json()["id"]
        r = admin_session.post(f"{API}/companies/{cid}/certificate", timeout=15)
        assert r.status_code == 400
        admin_session.delete(f"{API}/companies/{cid}", timeout=15)


# -------------------- DASHBOARDS + EVENTS --------------------
class TestDashboards:
    def test_global(self, admin_session):
        r = admin_session.get(f"{API}/dashboard", timeout=15)
        assert r.status_code == 200
        assert "total_companies" in r.json()

    def test_company_dashboard(self, admin_session, company_id):
        r = admin_session.get(f"{API}/companies/{company_id}/dashboard", timeout=15)
        assert r.status_code == 200
        assert r.json()["compliance_score"] == 100

    def test_events(self, admin_session, company_id):
        r = admin_session.get(f"{API}/companies/{company_id}/events", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) >= 1


# -------------------- AI ENDPOINTS (slow) --------------------
class TestAI:
    def test_diagnostic_recommendations(self, admin_session, company_id):
        r = admin_session.post(f"{API}/companies/{company_id}/diagnostic/ai-recommendations", timeout=90)
        assert r.status_code == 200, r.text
        assert isinstance(r.json().get("recommendations"), str) and len(r.json()["recommendations"]) > 20

    def test_ropa_ai_suggest(self, admin_session, company_id):
        r = admin_session.post(f"{API}/companies/{company_id}/ropa/ai-suggest", timeout=90)
        assert r.status_code == 200, r.text
        assert "suggestion" in r.json()

    def test_ripd_generate(self, admin_session, company_id):
        r = admin_session.post(f"{API}/companies/{company_id}/ripd/ai-generate",
                               json={"title": "TEST_RIPD", "scope": "Marketing digital"}, timeout=120)
        assert r.status_code == 200, r.text
        assert len(r.json().get("content", "")) > 50

    def test_document_generate(self, admin_session, company_id):
        r = admin_session.post(f"{API}/companies/{company_id}/documents/generate",
                               json={"doc_type": "nda"}, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["content"]) > 50
        # fetch it
        r2 = admin_session.get(f"{API}/companies/{company_id}/documents/{d['id']}", timeout=15)
        assert r2.status_code == 200


# -------------------- CLIENT SCOPING --------------------
class TestClientScoping:
    def test_cliente_scoped(self, admin_session, company_id):
        # register cliente scoped to company_id
        email = f"test_cli_{uuid.uuid4().hex[:6]}@t.com"
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"name": "Cliente", "email": email,
                                                 "password": "Pass1234!", "role": "cliente",
                                                 "company_id": company_id}, timeout=15)
        assert r.status_code == 200
        # cliente can view own company
        r = s.get(f"{API}/companies/{company_id}", timeout=15)
        assert r.status_code == 200
        # cliente cannot create company
        r = s.post(f"{API}/companies", json={"name": "X"}, timeout=15)
        assert r.status_code == 403
        # cliente cannot access other company
        r = admin_session.post(f"{API}/companies", json={"name": f"TEST_OTHER_{uuid.uuid4().hex[:6]}"}, timeout=15)
        other = r.json()["id"]
        r = s.get(f"{API}/companies/{other}", timeout=15)
        assert r.status_code == 403
        admin_session.delete(f"{API}/companies/{other}", timeout=15)
