"""
cdxi | OS — backend regression tests for the merged build.

Covers:
- Auth: login (parker@cdxi.au / 220191), /auth/me
- Tenants seeded: default(cdxi), fourtee2, fleshsesh
- Dashboard, health, audit-log, agents, agents/review-queue
- CRUD: clients, projects, milestones, tasks, contracts(+templates), rate-cards,
        invoices, change-requests, timers
- Tenant isolation: X-Tenant-Id=fourtee2 returns []
- Atlas copilot: real GPT-5.2 reply via EMERGENT_LLM_KEY
- Stripe webhook route exists (no signature)
"""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

def _read_frontend_env_url():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"')
    except Exception:
        return None
    return None


BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env_url() or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "parker@cdxi.au"
ADMIN_PASSWORD = "220191"


# -------------------- fixtures --------------------

@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                      timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body and body["access_token"]
    return body["access_token"]


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_user(headers):
    r = requests.get(f"{API}/auth/me", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# -------------------- AUTH --------------------

class TestAuth:
    def test_login_returns_admin(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body.get("access_token"), str) and len(body["access_token"]) > 10
        u = body["user"]
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": "wrong"},
                          timeout=15)
        assert r.status_code == 401

    def test_brute_force_lockout(self):
        """5 bad attempts on a non-existent email -> 6th returns 429."""
        # Use a unique random email so we don't pollute other tests / lock parker
        lockout_email = f"lockout-test-{uuid.uuid4().hex[:8]}@example.com"
        for i in range(5):
            r = requests.post(f"{API}/auth/login",
                              json={"email": lockout_email, "password": "wrong"},
                              timeout=15)
            assert r.status_code == 401, f"attempt {i+1}: expected 401 got {r.status_code} {r.text}"
        # 6th attempt -> locked
        r6 = requests.post(f"{API}/auth/login",
                           json={"email": lockout_email, "password": "wrong"},
                           timeout=15)
        assert r6.status_code == 429, f"expected 429 lockout got {r6.status_code} {r6.text}"
        body = r6.json()
        detail = (body.get("detail") or body.get("message") or str(body)).lower()
        assert "try again" in detail or "minute" in detail, f"lockout message missing: {body}"

    def test_me_matches_login(self, headers):
        r = requests.get(f"{API}/auth/me", headers=headers, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"
        assert u.get("tenant_id") == "default"


# -------------------- TENANTS --------------------

class TestTenants:
    def test_three_tenants_seeded(self, headers):
        r = requests.get(f"{API}/tenants", headers=headers, timeout=15)
        assert r.status_code == 200
        tenants = r.json()
        ids = {t["id"]: t.get("name") for t in tenants}
        assert "default" in ids, f"missing 'default' tenant: {ids}"
        assert "fourtee2" in ids, f"missing 'fourtee2' tenant: {ids}"
        assert "fleshsesh" in ids, f"missing 'fleshsesh' tenant: {ids}"
        assert ids["default"] == "cdxi", f"default tenant should be named 'cdxi', got {ids['default']}"

    def test_clients_isolated_by_tenant_header(self, headers):
        h = {**headers, "X-Tenant-Id": "fourtee2"}
        r = requests.get(f"{API}/clients", headers=h, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json() == []

        h2 = {**headers, "X-Tenant-Id": "fleshsesh"}
        r2 = requests.get(f"{API}/clients", headers=h2, timeout=15)
        assert r2.status_code == 200
        assert r2.json() == []


# -------------------- HEALTH / DASHBOARD / AUDIT --------------------

class TestSystem:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("service") == "cdxi-os"
        assert body.get("status") == "ok"
        assert body.get("db") == "up"

    def test_dashboard(self, headers):
        r = requests.get(f"{API}/dashboard", headers=headers, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict)
        # Should at least be a metrics object
        assert len(body.keys()) >= 1

    def test_audit_log_has_login(self, headers):
        r = requests.get(f"{API}/audit-log", headers=headers, timeout=15)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list)
        # auth.login event should be present from login
        assert any(e.get("event_name") == "auth.login" for e in events[:50]), \
            f"no auth.login in first 50 audit events: {[e.get('event_name') for e in events[:10]]}"


# -------------------- AGENTS --------------------

class TestAgents:
    def test_agents_seeded(self, headers):
        r = requests.get(f"{API}/agents", headers=headers, timeout=15)
        assert r.status_code == 200
        agents = r.json()
        assert isinstance(agents, list)
        assert len(agents) == 6, f"expected 6 agents, got {len(agents)}: {[a.get('name') for a in agents]}"

    def test_review_queue(self, headers):
        r = requests.get(f"{API}/agents/review-queue", headers=headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# -------------------- FULL CRUD --------------------

@pytest.fixture(scope="class")
def created(headers):
    """Create a client + project + milestone + task and return ids for teardown."""
    state = {}
    # client
    r = requests.post(f"{API}/clients", headers=headers,
                      json={"name": f"TEST_Client_{uuid.uuid4().hex[:6]}",
                            "email": f"test_{uuid.uuid4().hex[:6]}@cdxi.au",
                            "billing_model": "hourly"},
                      timeout=15)
    assert r.status_code == 201, r.text
    state["client_id"] = r.json()["id"]

    # project
    r = requests.post(f"{API}/projects", headers=headers,
                      json={"client_id": state["client_id"],
                            "name": "TEST_Project",
                            "budget": 10000,
                            "total_amount": 10000},
                      timeout=15)
    assert r.status_code == 201, r.text
    state["project_id"] = r.json()["id"]

    yield state

    # teardown
    try:
        requests.delete(f"{API}/clients/{state['client_id']}", headers=headers, timeout=10)
    except Exception:
        pass


class TestCrud:
    def test_get_client(self, headers, created):
        r = requests.get(f"{API}/clients/{created['client_id']}", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == created["client_id"]

    def test_patch_client(self, headers, created):
        r = requests.patch(f"{API}/clients/{created['client_id']}",
                           headers=headers,
                           json={"status": "active", "tags": ["test"]},
                           timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "active"
        # GET to verify persistence
        r2 = requests.get(f"{API}/clients/{created['client_id']}", headers=headers, timeout=15)
        assert r2.json()["status"] == "active"

    def test_list_clients(self, headers, created):
        r = requests.get(f"{API}/clients", headers=headers, timeout=15)
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert created["client_id"] in ids

    def test_get_project(self, headers, created):
        r = requests.get(f"{API}/projects/{created['project_id']}", headers=headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == created["project_id"]

    def test_list_projects(self, headers):
        r = requests.get(f"{API}/projects", headers=headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_milestone_create(self, headers, created):
        due = (datetime.now(timezone.utc) + timedelta(days=14)).date().isoformat()
        r = requests.post(f"{API}/projects/{created['project_id']}/milestones",
                          headers=headers,
                          json={"name": "TEST_Milestone", "amount": 2500, "due_date": due},
                          timeout=15)
        assert r.status_code == 201, r.text
        m = r.json()
        assert m["name"] == "TEST_Milestone"
        # patch + verify (server enforces payment must be paid before completion)
        r2 = requests.patch(f"{API}/milestones/{m['id']}", headers=headers,
                            json={"payment_status": "paid"}, timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["payment_status"] == "paid"
        r3 = requests.patch(f"{API}/milestones/{m['id']}", headers=headers,
                            json={"completed": True}, timeout=15)
        assert r3.status_code == 200, r3.text
        assert r3.json()["completed"] is True

    def test_task_crud(self, headers, created):
        r = requests.post(f"{API}/projects/{created['project_id']}/tasks",
                          headers=headers,
                          json={"title": "TEST_Task", "priority": "medium"},
                          timeout=15)
        assert r.status_code == 201, r.text
        tid = r.json()["id"]
        # patch
        r2 = requests.patch(f"{API}/tasks/{tid}", headers=headers,
                            json={"status": "done", "actual_hours": 1.5}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "done"
        # list
        r3 = requests.get(f"{API}/projects/{created['project_id']}/tasks", headers=headers, timeout=15)
        assert any(t["id"] == tid for t in r3.json())
        # delete
        r4 = requests.delete(f"{API}/tasks/{tid}", headers=headers, timeout=10)
        assert r4.status_code in (200, 204)

    def test_change_request_crud(self, headers, created):
        r = requests.post(f"{API}/projects/{created['project_id']}/change-requests",
                          headers=headers,
                          json={"description": "Add OAuth", "impact_estimate": {"hours": 5}},
                          timeout=15)
        assert r.status_code == 201, r.text
        crid = r.json()["id"]
        r2 = requests.patch(f"{API}/change-requests/{crid}", headers=headers,
                            json={"status": "approved", "notes": "ok"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["status"] == "approved"

    def test_rate_cards(self, headers):
        r = requests.get(f"{API}/rate-cards", headers=headers, timeout=15)
        assert r.status_code == 200
        # create new
        r2 = requests.post(f"{API}/rate-cards", headers=headers,
                           json={"name": f"TEST_Card_{uuid.uuid4().hex[:6]}",
                                 "currency": "AUD",
                                 "effective_from": datetime.now(timezone.utc).date().isoformat(),
                                 "rates": {"hourly": 200.0}},
                           timeout=15)
        assert r2.status_code == 201, r2.text
        rcid = r2.json()["id"]
        # patch
        r3 = requests.patch(f"{API}/rate-cards/{rcid}", headers=headers,
                            json={"rates": {"hourly": 220.0}}, timeout=15)
        assert r3.status_code == 200
        # delete
        requests.delete(f"{API}/rate-cards/{rcid}", headers=headers, timeout=10)

    def test_timer_start_stop(self, headers, created):
        r = requests.post(f"{API}/timers/start", headers=headers,
                          json={"client_id": created["client_id"],
                                "project_id": created["project_id"],
                                "description": "TEST timer", "is_billable": True},
                          timeout=15)
        assert r.status_code == 201, r.text
        tmid = r.json()["id"]
        # stop
        r2 = requests.post(f"{API}/timers/{tmid}/stop", headers=headers, timeout=15)
        assert r2.status_code == 200
        # list
        r3 = requests.get(f"{API}/timers", headers=headers, timeout=15)
        assert any(t["id"] == tmid for t in r3.json())

    def test_invoice_generate(self, headers, created):
        today = datetime.now(timezone.utc).date()
        r = requests.post(f"{API}/invoices/generate", headers=headers,
                          json={"client_id": created["client_id"],
                                "period_start": (today - timedelta(days=30)).isoformat(),
                                "period_end": today.isoformat(),
                                "due_date": (today + timedelta(days=14)).isoformat(),
                                "tax_rate": 0.10},
                          timeout=20)
        # An invoice with zero billable items still should return 201 or a clear error.
        assert r.status_code in (201, 400), r.text
        if r.status_code == 201:
            inv_id = r.json()["id"]
            # list
            r2 = requests.get(f"{API}/invoices", headers=headers, timeout=15)
            assert any(i["id"] == inv_id for i in r2.json())
            # get
            r3 = requests.get(f"{API}/invoices/{inv_id}", headers=headers, timeout=15)
            assert r3.status_code == 200

    def test_contracts_flow(self, headers, created):
        # List templates - server seeds 2
        r = requests.get(f"{API}/contract-templates", headers=headers, timeout=15)
        assert r.status_code == 200
        tpls = r.json()
        assert len(tpls) >= 1
        sow = next((t for t in tpls if t["template_type"] == "sow"), tpls[0])
        # Generate
        r2 = requests.post(f"{API}/contracts/generate", headers=headers,
                           json={"client_id": created["client_id"],
                                 "template_id": sow["id"],
                                 "contract_type": sow["template_type"],
                                 "title": "TEST_Contract",
                                 "variables_used": {"scope": "x", "deliverables": "y", "payment_terms": "z"}},
                           timeout=20)
        assert r2.status_code == 201, r2.text
        cid = r2.json()["id"]
        # list
        r3 = requests.get(f"{API}/contracts", headers=headers, timeout=15)
        assert any(c["id"] == cid for c in r3.json())


# -------------------- COPILOT (LIVE LLM) --------------------

class TestCopilot:
    def test_copilot_chat_real_reply(self, headers):
        body = {"session_id": f"test_{uuid.uuid4().hex[:8]}",
                "message": "In one short sentence, confirm you can hear me."}
        r = requests.post(f"{API}/copilot/chat", headers=headers, json=body, timeout=90)
        assert r.status_code == 200, f"copilot failed: {r.status_code} {r.text}"
        data = r.json()
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"].strip()) > 0, f"empty reply: {data}"


# -------------------- STRIPE WEBHOOK --------------------

class TestStripeWebhook:
    def test_webhook_route_exists(self):
        # Empty payload → expect 4xx (route must exist; should not 404)
        r = requests.post(f"{API}/webhook/stripe", data="", timeout=15)
        assert r.status_code != 404, f"webhook missing: {r.status_code}"
        assert 400 <= r.status_code < 500, f"unexpected status: {r.status_code} {r.text}"
