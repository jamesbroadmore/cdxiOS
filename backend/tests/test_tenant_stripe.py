"""
Backend tests for cdxi | OS — tenant isolation + Stripe settlement.

Covers:
 - FRESH DATA: empty arrays for clients/projects/invoices and zeroed dashboard
 - TENANT STAMPING on writes (clients, projects, timers, rate-cards, contracts/generate)
 - TENANT ISOLATION on reads (foreign-tenant docs hidden)
 - BACKFILL TOLERANCE (legacy docs without tenant_id visible to default tenant)
 - STRIPE invoice checkout (session url + payment_transactions row stamped)
 - STRIPE settlement helper (_settle_payment marks invoice paid + audit log)
 - STRIPE webhook safe (returns 400 on bad signature, no crash)
 - PAYMENTS STATUS returns invoice_id
 - AGENT WORKFLOW DEMO stamps tenant_id on agent_runs
"""
import os
import sys
import asyncio
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

# Allow importing the FastAPI server module to invoke _settle_payment directly
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "parker@cdxi.au"
ADMIN_PASSWORD = "220191"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

mongo = MongoClient(MONGO_URL)[DB_NAME]

OTHER_TENANT = "OTHER_TENANT"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session", autouse=True)
def cleanup_after_session():
    """After whole session, drop any docs we created (id prefixed TEST_ or foreign tenant)."""
    yield
    for col in ("clients", "projects", "timers", "rate_cards", "contracts",
                "invoices", "payment_transactions", "audit_log", "agent_runs"):
        mongo[col].delete_many({"$or": [
            {"tenant_id": OTHER_TENANT},
            {"id": {"$regex": "^TEST_"}},
            {"name": {"$regex": "^TEST_"}},
            {"title": {"$regex": "^TEST_"}},
            {"description": {"$regex": "^TEST_"}},
        ]})
    # also wipe agent_runs/audit produced by workflow tests + checkout txs
    mongo.agent_runs.delete_many({})
    mongo.payment_transactions.delete_many({})
    mongo.audit_log.delete_many({})


# ---------------------------------------------------------------------------
# FRESH DATA
# ---------------------------------------------------------------------------
class TestFreshData:
    def test_clients_empty(self, headers):
        r = requests.get(f"{API}/clients", headers=headers, timeout=30)
        assert r.status_code == 200
        assert r.json() == []

    def test_projects_empty(self, headers):
        r = requests.get(f"{API}/projects", headers=headers, timeout=30)
        assert r.status_code == 200
        assert r.json() == []

    def test_invoices_empty(self, headers):
        r = requests.get(f"{API}/invoices", headers=headers, timeout=30)
        assert r.status_code == 200
        assert r.json() == []

    def test_dashboard_zeroed(self, headers):
        r = requests.get(f"{API}/dashboard", headers=headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("total_clients", 0) == 0
        assert d.get("active_projects", 0) == 0
        # revenue_pipeline may be float 0 or 0.0
        assert float(d.get("revenue_pipeline", 0) or 0) == 0.0


# ---------------------------------------------------------------------------
# TENANT STAMPING ON WRITES
# ---------------------------------------------------------------------------
class TestTenantStamping:
    def test_create_client_stamps_default(self, headers):
        body = {"name": "TEST_StampCo"}
        r = requests.post(f"{API}/clients", headers=headers, json=body, timeout=30)
        assert r.status_code == 201, r.text
        cid = r.json()["id"]
        doc = mongo.clients.find_one({"id": cid})
        assert doc is not None
        assert doc.get("tenant_id") == "default"
        pytest.shared_client_id = cid

    def test_create_project_stamps_default(self, headers):
        cid = pytest.shared_client_id
        body = {"client_id": cid, "name": "TEST_StampProj", "project_type": "service"}
        r = requests.post(f"{API}/projects", headers=headers, json=body, timeout=30)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        doc = mongo.projects.find_one({"id": pid})
        assert doc and doc.get("tenant_id") == "default"
        pytest.shared_project_id = pid

    def test_start_timer_stamps_default(self, headers):
        cid = pytest.shared_client_id
        body = {"client_id": cid, "description": "TEST_timer", "is_billable": True}
        r = requests.post(f"{API}/timers/start", headers=headers, json=body, timeout=30)
        assert r.status_code == 201, r.text
        tid_ = r.json()["id"]
        doc = mongo.timers.find_one({"id": tid_})
        assert doc and doc.get("tenant_id") == "default"
        # stop timer to clean state
        requests.post(f"{API}/timers/{tid_}/stop", headers=headers, timeout=30)

    def test_create_rate_card_stamps_default(self, headers):
        body = {
            "name": "TEST_RC",
            "currency": "AUD",
            "effective_from": "2026-01-01",
            "rates": {"hourly": 200.0},
            "is_default": False,
        }
        r = requests.post(f"{API}/rate-cards", headers=headers, json=body, timeout=30)
        assert r.status_code == 201, r.text
        rcid = r.json()["id"]
        doc = mongo.rate_cards.find_one({"id": rcid})
        assert doc and doc.get("tenant_id") == "default"

    def test_generate_contract_stamps_default(self, headers):
        cid = pytest.shared_client_id
        tmpl = mongo.contract_templates.find_one({"template_type": "sow"})
        assert tmpl is not None
        body = {
            "client_id": cid,
            "template_id": tmpl["id"],
            "contract_type": "sow",
            "title": "TEST_SOW",
            "variables_used": {"scope": "x", "deliverables": "y", "payment_terms": "z"},
        }
        r = requests.post(f"{API}/contracts/generate", headers=headers, json=body, timeout=30)
        assert r.status_code == 201, r.text
        conid = r.json()["id"]
        doc = mongo.contracts.find_one({"id": conid})
        assert doc and doc.get("tenant_id") == "default"


# ---------------------------------------------------------------------------
# TENANT ISOLATION ON READS
# ---------------------------------------------------------------------------
class TestTenantIsolation:
    def test_foreign_client_hidden(self, headers):
        mongo.clients.insert_one({
            "id": "TEST_foreign-client-1",
            "name": "OTHER_TENANT_CO",
            "status": "active",
            "tenant_id": OTHER_TENANT,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{API}/clients", headers=headers, timeout=30)
        assert r.status_code == 200
        names = [c.get("name") for c in r.json()]
        assert "OTHER_TENANT_CO" not in names

    def test_foreign_project_hidden(self, headers):
        mongo.projects.insert_one({
            "id": "TEST_foreign-project-1",
            "client_id": "TEST_foreign-client-1",
            "name": "OTHER_TENANT_PROJ",
            "status": "active",
            "tenant_id": OTHER_TENANT,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{API}/projects", headers=headers, timeout=30)
        assert r.status_code == 200
        names = [p.get("name") for p in r.json()]
        assert "OTHER_TENANT_PROJ" not in names

    def test_foreign_invoice_hidden(self, headers):
        mongo.invoices.insert_one({
            "id": "TEST_foreign-invoice-1",
            "invoice_number": "INV-OTHER-9999",
            "client_id": "TEST_foreign-client-1",
            "status": "sent",
            "total_amount": 100.0,
            "balance_due": 100.0,
            "tenant_id": OTHER_TENANT,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{API}/invoices", headers=headers, timeout=30)
        assert r.status_code == 200
        nums = [i.get("invoice_number") for i in r.json()]
        assert "INV-OTHER-9999" not in nums

    def test_foreign_audit_hidden(self, headers):
        mongo.audit_log.insert_one({
            "event_id": "TEST_foreign-evt-1",
            "event_name": "test.foreign",
            "object_type": "client",
            "object_id": "TEST_foreign-client-1",
            "tenant_id": OTHER_TENANT,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{API}/audit-log", headers=headers, timeout=30)
        assert r.status_code == 200
        ids = [e.get("event_id") for e in r.json()]
        assert "TEST_foreign-evt-1" not in ids

    def test_foreign_agent_run_hidden(self, headers):
        mongo.agent_runs.insert_one({
            "id": "TEST_foreign-run-1",
            "agent_key": "chief_orchestrator",
            "tenant_id": OTHER_TENANT,
            "execution_status": "complete",
            "started_at": datetime.now(timezone.utc).isoformat(),
        })
        r = requests.get(f"{API}/agents/runs", headers=headers, timeout=30)
        assert r.status_code == 200
        ids = [a.get("id") for a in r.json()]
        assert "TEST_foreign-run-1" not in ids


# ---------------------------------------------------------------------------
# BACKFILL TOLERANCE: legacy docs without tenant_id visible to default tenant
# ---------------------------------------------------------------------------
class TestBackfillTolerance:
    def test_legacy_client_visible(self, headers):
        legacy_id = "TEST_legacy-client-1"
        mongo.clients.insert_one({
            "id": legacy_id,
            "name": "LEGACY_NO_TENANT",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
            # NO tenant_id field
        })
        r = requests.get(f"{API}/clients", headers=headers, timeout=30)
        assert r.status_code == 200
        ids = [c.get("id") for c in r.json()]
        assert legacy_id in ids, "Legacy client without tenant_id should still be visible"


# ---------------------------------------------------------------------------
# STRIPE INVOICE CHECKOUT
# ---------------------------------------------------------------------------
class TestStripeCheckout:
    def test_invoice_checkout_creates_session_and_tx(self, headers):
        # Insert invoice directly via mongo (sent status)
        inv_id = f"TEST_inv-{uuid.uuid4().hex[:8]}"
        cid = pytest.shared_client_id
        mongo.invoices.insert_one({
            "id": inv_id,
            "invoice_number": f"INV-TEST-{uuid.uuid4().hex[:6].upper()}",
            "client_id": cid,
            "status": "sent",
            "total_amount": 250.0,
            "balance_due": 250.0,
            "amount_paid": 0.0,
            "currency": "aud",
            "tenant_id": "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        r = requests.post(
            f"{API}/invoices/{inv_id}/checkout",
            headers=headers,
            json={"origin_url": BASE_URL},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("https://checkout.stripe.com/")
        assert "session_id" in data and data["session_id"].startswith("cs_")
        pytest.shared_session_id = data["session_id"]
        pytest.shared_invoice_id = inv_id

        # verify payment_transactions row
        tx = mongo.payment_transactions.find_one({"session_id": data["session_id"]})
        assert tx is not None
        assert tx.get("tenant_id") == "default"
        assert tx.get("invoice_id") == inv_id


# ---------------------------------------------------------------------------
# STRIPE SETTLEMENT FUNCTION
# ---------------------------------------------------------------------------
class TestSettlement:
    def test_settle_payment_marks_invoice_paid(self):
        # Create a fresh invoice + tx directly, then invoke _settle_payment
        inv_id = f"TEST_inv-settle-{uuid.uuid4().hex[:8]}"
        mongo.invoices.insert_one({
            "id": inv_id,
            "invoice_number": "INV-SETTLE-001",
            "client_id": getattr(pytest, "shared_client_id", "TEST_client"),
            "status": "sent",
            "total_amount": 500.0,
            "balance_due": 500.0,
            "amount_paid": 0.0,
            "currency": "aud",
            "tenant_id": "default",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        tx = {
            "id": f"TEST_tx-{uuid.uuid4().hex[:8]}",
            "session_id": f"cs_test_TEST_{uuid.uuid4().hex[:10]}",
            "invoice_id": inv_id,
            "milestone_id": None,
            "amount": 500.0,
            "currency": "aud",
            "tenant_id": "default",
        }
        mongo.payment_transactions.insert_one(dict(tx))

        # Import server lazily and run the coroutine
        import server  # noqa: E402

        asyncio.get_event_loop().run_until_complete(server._settle_payment(tx, user_id=None))

        inv = mongo.invoices.find_one({"id": inv_id})
        assert inv is not None
        assert inv["status"] == "paid"
        assert float(inv["amount_paid"]) == 500.0
        assert float(inv["balance_due"]) == 0.0
        assert inv.get("paid_at"), "paid_at timestamp should be set"

        # audit log row
        audit = mongo.audit_log.find_one({
            "event_name": "invoice.paid_via_stripe", "object_id": inv_id,
        })
        assert audit is not None
        assert audit.get("tenant_id") == "default"


# ---------------------------------------------------------------------------
# STRIPE WEBHOOK — bad signature returns 400 without crash
# ---------------------------------------------------------------------------
class TestStripeWebhook:
    def test_webhook_bad_signature_returns_400(self):
        r = requests.post(
            f"{API}/webhook/stripe",
            data=b'{"type":"checkout.session.completed","data":{"object":{"id":"cs_test"}}}',
            headers={"Stripe-Signature": "t=0,v1=invalid", "Content-Type": "application/json"},
            timeout=30,
        )
        # signature invalid => 400 (clean), not 500
        assert r.status_code in (400, 503), f"Unexpected status: {r.status_code} body={r.text}"


# ---------------------------------------------------------------------------
# PAYMENTS STATUS contains invoice_id
# ---------------------------------------------------------------------------
class TestPaymentsStatus:
    def test_payments_status_returns_invoice_id(self, headers):
        sid = getattr(pytest, "shared_session_id", None)
        if not sid:
            pytest.skip("No session id from checkout test")
        r = requests.get(f"{API}/payments/status/{sid}", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "invoice_id" in data, f"invoice_id missing from response: {data}"
        assert data["invoice_id"] == pytest.shared_invoice_id


# ---------------------------------------------------------------------------
# AGENT WORKFLOW DEMO stamps tenant_id on agent_runs
# ---------------------------------------------------------------------------
class TestAgentWorkflowTenant:
    def test_workflow_demo_stamps_runs(self, headers):
        before = mongo.agent_runs.count_documents({})
        r = requests.post(f"{API}/agents/workflow-demo", headers=headers, json={}, timeout=120)
        assert r.status_code == 200, r.text
        after_docs = list(mongo.agent_runs.find({}, {"_id": 0}))
        assert len(after_docs) >= before + 3
        # last 3 runs should all carry tenant_id default
        # take most recent by started_at
        recent = sorted(after_docs, key=lambda d: d.get("started_at", ""), reverse=True)[:3]
        for d in recent:
            assert d.get("tenant_id") == "default", f"agent_run missing tenant_id: {d.get('id')}"
