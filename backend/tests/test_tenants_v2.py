"""
Backend tests for cdxi | OS iteration 3 — multi-tenant onboarding,
admin password rotation, Stripe webhook error distinction, reseed CLI.

Covers:
 - AUTH: new password (220191) works, old password (cdxi2026!) rejected.
 - TENANT ENDPOINTS: GET list, POST create (admin-only, slug auto-gen, dup reject),
   PATCH update (admin-only), POST switch + tenant isolation end-to-end.
 - STRIPE WEBHOOK error handling (missing sig / bad sig / parse error).
 - RESEED CLI: idempotency, --wipe-only, post-seed counts.
"""
import os
import sys
import subprocess
import uuid
from datetime import datetime, timezone

import pytest
import requests
from pymongo import MongoClient

sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "parker@cdxi.au"
ADMIN_PASSWORD = "220191"
ADMIN_PASSWORD_OLD = "cdxi2026!"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
mongo = MongoClient(MONGO_URL)[DB_NAME]

TEST_TENANT_NAME = "TEST Onboard Co"
TEST_TENANT_SLUG_EXPECTED = "test-onboard-co"


# --------------------------------------------------------------------------- fixtures

@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def viewer_headers(headers):
    """Create a viewer user (or reuse one), return Authorization headers for them."""
    email = f"TEST_viewer_{uuid.uuid4().hex[:6]}@cdxi.au"
    password = "viewerpass123"
    # Use admin /users endpoint if available, else seed directly into mongo
    try:
        r = requests.post(
            f"{API}/users",
            headers=headers,
            json={"email": email, "password": password,
                  "display_name": "TEST Viewer", "role": "viewer"},
            timeout=30,
        )
        if r.status_code not in (200, 201):
            pytest.skip(f"Cannot create viewer user via /users: {r.status_code} {r.text}")
    except Exception as e:
        pytest.skip(f"Cannot create viewer user: {e}")
    rl = requests.post(f"{API}/auth/login",
                       json={"email": email, "password": password}, timeout=30)
    assert rl.status_code == 200, rl.text
    tok = rl.json()["access_token"]
    yield {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    # cleanup viewer user (server lowercases emails)
    mongo.users.delete_many({"email": email.lower()})


@pytest.fixture(scope="session", autouse=True)
def cleanup_after_session():
    yield
    # Wipe any tenants we created (anything except 'default')
    # plus cosmic-brand (which the request says we can remove at end).
    mongo.tenants.delete_many({"id": {"$ne": "default"}})
    # Ensure admin user is back on default tenant
    mongo.users.update_one(
        {"email": ADMIN_EMAIL}, {"$set": {"tenant_id": "default"}}
    )
    # Clean test docs we created
    for col in ("clients", "projects", "audit_log"):
        mongo[col].delete_many({"$or": [
            {"name": {"$regex": "^TEST_"}},
            {"tenant_id": {"$regex": "^test-"}},
            {"tenant_id": TEST_TENANT_SLUG_EXPECTED},
        ]})
    # Optionally wipe test demo data we may have seeded
    mongo.clients.delete_many({"email": {"$in": [
        "christian@m8srates.com", "bianca@cosmicblueprint.co"
    ]}})
    mongo.invoices.delete_many({"invoice_number": "INV-DEMO-001"})
    mongo.projects.delete_many({"name": {"$in": ["m8s rates", "Cosmic Blueprint"]}})
    mongo.milestones.delete_many({"name": {"$in": [
        "Discovery & Strategy", "Design System", "Development Build",
        "Blueprint Intake", "Chart Synthesis", "Final Delivery"
    ]}})


# --------------------------------------------------------------------------- AUTH

class TestAuthPasswordRotation:
    def test_login_with_new_password_succeeds(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "access_token" in body and isinstance(body["access_token"], str)
        assert len(body["access_token"]) > 0

    def test_login_with_old_password_fails(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD_OLD}, timeout=30)
        assert r.status_code == 401, r.text


# --------------------------------------------------------------------------- TENANT ENDPOINTS

class TestTenantList:
    def test_default_tenant_present(self, headers):
        r = requests.get(f"{API}/tenants", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        tenants = r.json()
        assert isinstance(tenants, list)
        default = next((t for t in tenants if t["id"] == "default"), None)
        assert default is not None, f"Default tenant missing from list: {tenants}"
        assert default["name"] == "cdxi (default)"
        assert default["status"] == "active"
        assert default.get("slug") == "default"


class TestTenantCreate:
    def test_create_tenant_auto_slug(self, headers):
        # Ensure clean slate
        mongo.tenants.delete_many({"id": TEST_TENANT_SLUG_EXPECTED})

        r = requests.post(f"{API}/tenants", headers=headers,
                          json={"name": TEST_TENANT_NAME}, timeout=30)
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["id"] == TEST_TENANT_SLUG_EXPECTED
        assert body["slug"] == TEST_TENANT_SLUG_EXPECTED
        assert body["name"] == TEST_TENANT_NAME
        assert body["status"] == "active"
        assert "created_at" in body
        assert "_id" not in body  # mongo ObjectId scrubbed

        # GET to verify persisted
        rget = requests.get(f"{API}/tenants", headers=headers, timeout=30)
        assert rget.status_code == 200
        ids = [t["id"] for t in rget.json()]
        assert TEST_TENANT_SLUG_EXPECTED in ids

    def test_create_tenant_duplicate_slug_rejected(self, headers):
        r = requests.post(f"{API}/tenants", headers=headers,
                          json={"name": TEST_TENANT_NAME}, timeout=30)
        assert r.status_code == 400, r.text
        assert "already exists" in r.text.lower()

    def test_create_tenant_requires_admin(self, viewer_headers):
        r = requests.post(f"{API}/tenants", headers=viewer_headers,
                          json={"name": "TEST Should Fail"}, timeout=30)
        assert r.status_code == 403, r.text
        assert "admin" in r.text.lower()


class TestTenantUpdate:
    def test_patch_tenant_name_and_status(self, headers):
        # Use the tenant we just created
        slug = TEST_TENANT_SLUG_EXPECTED
        r = requests.patch(f"{API}/tenants/{slug}", headers=headers,
                           json={"name": "TEST Renamed Co", "status": "suspended"},
                           timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["name"] == "TEST Renamed Co"
        assert body["status"] == "suspended"
        # Revert back to active so switch test works
        rr = requests.patch(f"{API}/tenants/{slug}", headers=headers,
                            json={"status": "active"}, timeout=30)
        assert rr.status_code == 200

    def test_patch_unknown_tenant_404(self, headers):
        r = requests.patch(f"{API}/tenants/does-not-exist",
                           headers=headers, json={"name": "x"}, timeout=30)
        assert r.status_code == 404

    def test_patch_requires_admin(self, viewer_headers):
        r = requests.patch(f"{API}/tenants/{TEST_TENANT_SLUG_EXPECTED}",
                           headers=viewer_headers, json={"name": "no"}, timeout=30)
        assert r.status_code == 403


class TestTenantSwitchIsolation:
    """End-to-end: switch into new tenant, write a client, verify isolation."""

    def test_switch_creates_isolation(self, headers):
        slug = TEST_TENANT_SLUG_EXPECTED
        # Switch admin into new tenant
        r = requests.post(f"{API}/tenants/{slug}/switch", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("tenant_id") == slug

        # Verify admin user's tenant_id was updated in DB
        admin = mongo.users.find_one({"email": ADMIN_EMAIL})
        assert admin["tenant_id"] == slug

        # GET /clients in new tenant should be empty (fresh)
        rc = requests.get(f"{API}/clients", headers=headers, timeout=30)
        assert rc.status_code == 200
        assert rc.json() == []

        # Create a client in the new tenant
        rc2 = requests.post(f"{API}/clients", headers=headers,
                            json={"name": "TEST_OnboardClient"}, timeout=30)
        assert rc2.status_code == 201, rc2.text
        new_client = rc2.json()
        new_client_id = new_client["id"]

        # Verify client is stamped with new tenant_id
        doc = mongo.clients.find_one({"id": new_client_id})
        assert doc and doc["tenant_id"] == slug

        # Verify list returns just this client
        rc3 = requests.get(f"{API}/clients", headers=headers, timeout=30)
        assert rc3.status_code == 200
        names = [c["name"] for c in rc3.json()]
        assert names == ["TEST_OnboardClient"]

        # Switch back to default tenant
        rback = requests.post(f"{API}/tenants/default/switch", headers=headers, timeout=30)
        assert rback.status_code == 200
        assert rback.json().get("tenant_id") == "default"

        # The new tenant's client should NOT be visible in default
        rc4 = requests.get(f"{API}/clients", headers=headers, timeout=30)
        assert rc4.status_code == 200
        assert "TEST_OnboardClient" not in [c["name"] for c in rc4.json()]

    def test_switch_to_unknown_tenant_404(self, headers):
        r = requests.post(f"{API}/tenants/does-not-exist/switch",
                          headers=headers, timeout=30)
        assert r.status_code == 404

    def test_switch_requires_admin(self, viewer_headers):
        r = requests.post(f"{API}/tenants/default/switch",
                          headers=viewer_headers, timeout=30)
        assert r.status_code == 403


# --------------------------------------------------------------------------- STRIPE WEBHOOK

class TestStripeWebhookErrors:
    def test_no_signature_header_400(self):
        r = requests.post(f"{API}/webhook/stripe",
                          data=b'{"type":"x"}',
                          headers={"Content-Type": "application/json"},
                          timeout=30)
        assert r.status_code == 400, r.text
        assert "missing" in r.text.lower() and "signature" in r.text.lower()

    def test_invalid_signature_400(self):
        r = requests.post(
            f"{API}/webhook/stripe",
            data=b'{"type":"checkout.session.completed","data":{"object":{"id":"cs_test"}}}',
            headers={"Stripe-Signature": "t=0,v1=invalid",
                     "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 400, r.text
        body_lower = r.text.lower()
        # Accept either signature-verification or parse-error path so long as it's 400
        assert ("signature" in body_lower) or ("parse" in body_lower)

    def test_bad_payload_400(self):
        # Garbage non-json body should hit parse-error branch
        r = requests.post(
            f"{API}/webhook/stripe",
            data=b"NOT_JSON_GARBAGE",
            headers={"Stripe-Signature": "t=0,v1=anything",
                     "Content-Type": "application/json"},
            timeout=30,
        )
        assert r.status_code == 400, r.text


# --------------------------------------------------------------------------- RESEED CLI

RESEED_PATH = "/app/backend/scripts/reseed.py"


def _run_reseed(*flags) -> subprocess.CompletedProcess:
    env = os.environ.copy()
    env["MONGO_URL"] = MONGO_URL
    env["DB_NAME"] = DB_NAME
    return subprocess.run(
        ["python", RESEED_PATH, *flags],
        cwd="/app",
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


class TestReseedCLI:
    def test_wipe_only_clears_tenant_collections(self):
        # Insert a marker invoice so we can confirm it's wiped
        mongo.invoices.insert_one({
            "id": f"TEST_wipe-{uuid.uuid4().hex[:8]}",
            "invoice_number": "TEST_WIPE_MARKER",
            "tenant_id": "default",
            "status": "draft",
            "total_amount": 1.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        before = mongo.invoices.count_documents({"invoice_number": "TEST_WIPE_MARKER"})
        assert before == 1

        result = _run_reseed("--wipe-only")
        assert result.returncode == 0, result.stderr or result.stdout
        assert "wiped" in result.stdout.lower()

        after = mongo.invoices.count_documents({"invoice_number": "TEST_WIPE_MARKER"})
        assert after == 0
        # All tenant collections should now be empty
        for c in ["clients", "projects", "milestones", "invoices"]:
            assert mongo[c].count_documents({}) == 0, f"{c} not wiped"

    def test_seed_creates_demo_data(self):
        result = _run_reseed()
        assert result.returncode == 0, result.stderr or result.stdout
        assert "seeded" in result.stdout.lower()

        # 2 clients, 2 projects, 6 milestones, 1 INV-DEMO-001
        assert mongo.clients.count_documents({"tenant_id": "default"}) >= 2
        assert mongo.projects.count_documents({"tenant_id": "default"}) >= 2
        assert mongo.milestones.count_documents({}) >= 6
        inv = mongo.invoices.find_one({"invoice_number": "INV-DEMO-001"})
        assert inv is not None
        assert inv["status"] == "overdue"
        assert float(inv["balance_due"]) == 1100.0
        assert inv["tenant_id"] == "default"

    def test_seed_idempotent_skips(self):
        result = _run_reseed()
        assert result.returncode == 0, result.stderr or result.stdout
        assert "skipping" in result.stdout.lower(), result.stdout

    def test_admin_login_still_works_after_reseed(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
                          timeout=30)
        assert r.status_code == 200, r.text
