"""cdxi | OS — FastAPI backend.

Multi-tenant AI-native agency operating system.
Version 2.0 — Full Platform Build
"""
from __future__ import annotations

import json
import logging
import os
import re
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import bcrypt
import jwt as pyjwt
from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field, field_validator
from starlette.middleware.cors import CORSMiddleware

try:
    from emergentintegrations.payments.stripe.checkout import (
        CheckoutSessionRequest,
        StripeCheckout,
    )
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False

# ---------------------------------------------------------------------------
# Environment & configuration
# ---------------------------------------------------------------------------

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        sys.stderr.write(f"[cdxi] Missing required env var: {name}\n")
        raise SystemExit(1)
    return value


LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("cdxi")

MONGO_URL = _require_env("MONGO_URL")
DB_NAME = _require_env("DB_NAME")
JWT_SECRET = _require_env("JWT_SECRET")
ADMIN_EMAIL = _require_env("ADMIN_EMAIL").lower()
ADMIN_PASSWORD = _require_env("ADMIN_PASSWORD")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "sk_test_emergent")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

JWT_ALG = "HS256"
JWT_EXPIRY_DAYS = int(os.environ.get("JWT_EXPIRY_DAYS", "7"))
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
ALLOW_CREDENTIALS = CORS_ORIGINS != ["*"]

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# ---------------------------------------------------------------------------
# DB client
# ---------------------------------------------------------------------------

mongo_client: AsyncIOMotorClient = AsyncIOMotorClient(MONGO_URL)
db = mongo_client[DB_NAME]


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.clients.create_index("id", unique=True)
    await db.clients.create_index("created_at")
    await db.contacts.create_index("client_id")
    await db.client_notes.create_index("client_id")
    await db.projects.create_index("id", unique=True)
    await db.projects.create_index("client_id")
    await db.tasks.create_index("project_id")
    await db.milestones.create_index("id", unique=True)
    await db.milestones.create_index([("project_id", 1), ("order", 1)])
    await db.rate_cards.create_index("client_id")
    await db.timers.create_index("status")
    await db.timers.create_index("client_id")
    await db.usage_events.create_index("client_id")
    await db.usage_events.create_index("occurred_at")
    await db.invoices.create_index("client_id")
    await db.invoices.create_index("status")
    try:
        await db.invoices.create_index("invoice_number", unique=True)
    except Exception:
        pass
    await db.contracts.create_index("client_id")
    await db.contracts.create_index("status")
    try:
        await db.contracts.create_index("contract_number", unique=True)
    except Exception:
        pass
    await db.approvals.create_index("status")
    await db.agent_runs.create_index("execution_status")
    await db.agent_runs.create_index("started_at")
    await db.audit_log.create_index("occurred_at")
    try:
        await db.payment_transactions.create_index("session_id", unique=True)
    except Exception:
        pass
    try:
        await db.tenants.create_index("id", unique=True)
        await db.tenants.create_index("slug", unique=True)
    except Exception:
        pass

    await _seed_default_tenant()
    await _seed_admin()
    await _seed_rate_cards()
    await _seed_agents()
    await _seed_contract_templates()
    logger.info("cdxi | OS v2.1 started (db=%s)", DB_NAME)
    try:
        yield
    finally:
        mongo_client.close()
        logger.info("cdxi | OS stopped")


app = FastAPI(title="cdxi | OS", version="2.0.0", lifespan=lifespan)
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except ValueError:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc),
        "type": "access",
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    token: Optional[str] = None
    if creds and creds.scheme.lower() == "bearer":
        token = creds.credentials
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one(
        {"id": payload["sub"]}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Backfill tenant_id for legacy users
    user["tenant_id"] = user.get("tenant_id") or DEFAULT_TENANT
    return user


# ---------------------------------------------------------------------------
# Multi-tenant helpers
# ---------------------------------------------------------------------------

DEFAULT_TENANT = "default"


def tid(user: dict) -> str:
    """Resolve the tenant_id for the current authenticated user."""
    return user.get("tenant_id") or DEFAULT_TENANT


def tquery(user: dict, extra: Optional[dict] = None) -> dict:
    """Build a Mongo query scoped to the user's tenant.

    Backfills legacy docs that may not yet carry tenant_id by also
    matching docs where tenant_id is missing/null when tenant is the
    default. New writes always set tenant_id explicitly.
    """
    t = tid(user)
    base: dict
    if t == DEFAULT_TENANT:
        base = {"$or": [{"tenant_id": t}, {"tenant_id": {"$exists": False}}, {"tenant_id": None}]}
    else:
        base = {"tenant_id": t}
    if not extra:
        return base
    # Merge extra into base. If base has $or, AND-combine with extra.
    if "$or" in base:
        return {"$and": [base, extra]}
    return {**base, **extra}


def tdoc(user: dict, doc: dict) -> dict:
    """Stamp a document with the current tenant_id (idempotent)."""
    doc["tenant_id"] = tid(user)
    return doc


# ---------------------------------------------------------------------------
# Audit helper
# ---------------------------------------------------------------------------

def _strip_mongo_id(value):
    """Recursively remove BSON _id keys so audit payloads stay JSON-serializable."""
    if isinstance(value, dict):
        return {k: _strip_mongo_id(v) for k, v in value.items() if k != "_id"}
    if isinstance(value, list):
        return [_strip_mongo_id(v) for v in value]
    return value


async def log_audit(
    event_name: str,
    object_type: str,
    object_id: str,
    actor_id: Optional[str] = None,
    actor_type: str = "user",
    before_state: Optional[dict] = None,
    after_state: Optional[dict] = None,
    metadata: Optional[dict] = None,
    tenant_id: Optional[str] = None,
) -> None:
    try:
        await db.audit_log.insert_one({
            "event_id": str(uuid.uuid4()),
            "actor_id": actor_id,
            "actor_type": actor_type,
            "event_name": event_name,
            "object_type": object_type,
            "object_id": object_id,
            "before_state": _strip_mongo_id(before_state),
            "after_state": _strip_mongo_id(after_state),
            "metadata": _strip_mongo_id(metadata) or {},
            "tenant_id": tenant_id or DEFAULT_TENANT,
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as exc:
        logger.warning("Audit log write failed: %s", exc)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

def _validate_iso_date(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    if not _DATE_RE.match(value):
        raise ValueError("date must be ISO format YYYY-MM-DD")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("Invalid calendar date") from exc
    return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class LoginResponse(BaseModel):
    access_token: str
    user: dict


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=100)
    role: Literal["admin", "account_manager", "viewer"] = "account_manager"
    password: str = Field(min_length=8, max_length=100)


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    role: Optional[Literal["admin", "account_manager", "viewer"]] = None
    status: Optional[Literal["active", "invited", "suspended"]] = None
    tenant_id: Optional[str] = None


class TenantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=60, description="URL-safe identifier")


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[Literal["active", "suspended"]] = None


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    trading_name: Optional[str] = None
    email: Optional[EmailStr] = None
    abn: Optional[str] = None
    website: Optional[str] = None
    billing_model: Literal["hourly", "retainer", "consumption", "hybrid", "fixed"] = "hourly"
    lifecycle_stage: Literal["lead", "qualified", "onboarding", "active", "renewal", "churned"] = "lead"
    status: Literal["prospect", "active", "at_risk", "churned", "paused"] = "prospect"
    account_manager_id: Optional[str] = None
    primary_currency: str = "AUD"
    tags: List[str] = []
    # backward compat
    project_name: Optional[str] = None
    total_amount: Optional[float] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    trading_name: Optional[str] = None
    abn: Optional[str] = None
    website: Optional[str] = None
    status: Optional[Literal["prospect", "active", "at_risk", "churned", "paused"]] = None
    lifecycle_stage: Optional[Literal["lead", "qualified", "onboarding", "active", "renewal", "churned"]] = None
    billing_model: Optional[Literal["hourly", "retainer", "consumption", "hybrid", "fixed"]] = None
    account_manager_id: Optional[str] = None
    health_score: Optional[float] = None
    tags: Optional[List[str]] = None
    primary_currency: Optional[str] = None


class ContactCreate(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    is_primary: bool = False
    is_billing: bool = False
    is_signatory: bool = False


class ContactUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    is_primary: Optional[bool] = None
    is_billing: Optional[bool] = None


class NoteCreate(BaseModel):
    body: str = Field(min_length=1)
    note_type: Literal["general", "meeting", "call", "email", "risk", "opportunity"] = "general"


class ProjectCreate(BaseModel):
    client_id: str
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    project_type: Literal["service", "retainer", "fixed_price", "internal"] = "service"
    budget: Optional[float] = None
    margin_target: Optional[float] = None
    risk_level: Literal["low", "medium", "high", "critical"] = "low"
    start_date: Optional[str] = None
    target_date: Optional[str] = None
    owner_id: Optional[str] = None
    status: str = "active"
    total_amount: Optional[float] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    status: Optional[str] = None
    description: Optional[str] = None
    project_type: Optional[Literal["service", "retainer", "fixed_price", "internal"]] = None
    budget: Optional[float] = None
    risk_level: Optional[Literal["low", "medium", "high", "critical"]] = None
    target_date: Optional[str] = None
    owner_id: Optional[str] = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    milestone_id: Optional[str] = None
    priority: Literal["low", "medium", "high", "urgent"] = "medium"
    estimated_hours: Optional[float] = None
    billable_flag: bool = True
    due_date: Optional[str] = None
    status: Literal["backlog", "ready", "in_progress", "review", "done", "cancelled"] = "backlog"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["backlog", "ready", "in_progress", "review", "done", "cancelled"]] = None
    assignee_id: Optional[str] = None
    priority: Optional[Literal["low", "medium", "high", "urgent"]] = None
    actual_hours: Optional[float] = None
    due_date: Optional[str] = None


class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0)
    due_date: Optional[str] = None

    @field_validator("due_date")
    @classmethod
    def _check_due(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v)


class MilestoneUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    amount: Optional[float] = Field(default=None, ge=0)
    due_date: Optional[str] = None
    payment_status: Optional[Literal["paid", "unpaid"]] = None
    completed: Optional[bool] = None

    @field_validator("due_date")
    @classmethod
    def _check_due(cls, v: Optional[str]) -> Optional[str]:
        return _validate_iso_date(v)


class ChangeRequestCreate(BaseModel):
    description: str = Field(min_length=1)
    impact_estimate: Dict[str, Any] = {}


class ChangeRequestUpdate(BaseModel):
    status: Optional[Literal["pending", "approved", "rejected", "merged"]] = None
    notes: Optional[str] = None


class RateCardCreate(BaseModel):
    client_id: Optional[str] = None
    name: str = Field(min_length=1)
    currency: str = "AUD"
    effective_from: str
    effective_to: Optional[str] = None
    rates: Dict[str, float] = {"hourly": 150.0}
    overage_rules: Dict[str, Any] = {}
    is_default: bool = False


class RateCardUpdate(BaseModel):
    name: Optional[str] = None
    effective_to: Optional[str] = None
    rates: Optional[Dict[str, float]] = None
    is_default: Optional[bool] = None


class TimerStart(BaseModel):
    client_id: str
    project_id: Optional[str] = None
    task_id: Optional[str] = None
    description: Optional[str] = None
    is_billable: bool = True


class InvoiceGenerate(BaseModel):
    client_id: str
    period_start: str
    period_end: str
    due_date: Optional[str] = None
    notes: Optional[str] = None
    tax_rate: float = 0.10


class InvoiceUpdate(BaseModel):
    status: Optional[Literal["draft", "review", "sent", "paid", "partial", "overdue", "disputed", "voided"]] = None
    notes: Optional[str] = None
    amount_paid: Optional[float] = None


class ContractTemplateCreate(BaseModel):
    name: str = Field(min_length=1)
    template_type: Literal["msa", "sow", "nda", "proposal", "change_order", "renewal"]
    body_template: str
    variables: List[str] = []


class ContractGenerate(BaseModel):
    client_id: str
    template_id: str
    contract_type: Literal["msa", "sow", "nda", "proposal", "change_order", "renewal"]
    title: str
    variables_used: Dict[str, str] = {}
    effective_date: Optional[str] = None
    expiry_date: Optional[str] = None
    renewal_trigger: Literal["auto", "manual", "notify_only", "none"] = "manual"


class ContractUpdate(BaseModel):
    status: Optional[Literal["draft", "review", "sent", "signed", "active", "expired", "terminated", "voided"]] = None
    signed_by_client: Optional[str] = None
    signed_by_cdxi: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class ApprovalCreate(BaseModel):
    approval_type: Literal["contract", "invoice", "change_order", "payment", "agent_action"]
    target_type: str
    target_id: str
    notes: Optional[str] = None
    approver_id: Optional[str] = None


class ApprovalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    notes: Optional[str] = None


class AgentRunTrigger(BaseModel):
    agent_type: Literal[
        "chief_orchestrator", "finance", "client_success",
        "compliance_sentinel", "delivery_ops", "revenue_ops"
    ]
    trigger_event: str
    context: Dict[str, Any] = {}


class AgentRunReview(BaseModel):
    decision: Literal["approved", "rejected"]
    notes: Optional[str] = None


class CheckoutBody(BaseModel):
    origin_url: str = Field(min_length=1, max_length=2048)


# ---------------------------------------------------------------------------
# Business logic helpers
# ---------------------------------------------------------------------------

def _derive_status(stored_status: Optional[str], total: int, completed: int) -> str:
    stored = stored_status or "Not Started"
    if total and completed == total:
        return "Completed"
    if completed > 0 and stored == "Not Started":
        return "In Progress"
    return stored


async def _attach_milestones(project: dict) -> dict:
    milestones = await db.milestones.find(
        {"project_id": project["id"]}, {"_id": 0}
    ).sort("order", 1).to_list(None)

    total = len(milestones)
    completed = sum(1 for m in milestones if m.get("completed"))
    progress = int((completed / total) * 100) if total else 0

    next_payment = None
    next_due = None
    for m in milestones:
        if m.get("payment_status") != "paid":
            next_payment = m.get("amount")
            next_due = m.get("due_date")
            break

    status_value = _derive_status(project.get("status"), total, completed)
    tasks_total = await db.tasks.count_documents({"project_id": project["id"]})
    tasks_done = await db.tasks.count_documents({"project_id": project["id"], "status": "done"})

    return {
        **project,
        "milestones": milestones,
        "progress": progress,
        "next_payment": next_payment,
        "next_due": next_due,
        "status": status_value,
        "tasks_total": tasks_total,
        "tasks_done": tasks_done,
    }


async def _batch_attach_projects(clients: list[dict]) -> list[dict]:
    if not clients:
        return []
    client_ids = [c["id"] for c in clients]
    projects = await db.projects.find(
        {"client_id": {"$in": client_ids}}, {"_id": 0}
    ).to_list(None)
    if not projects:
        return [{**c, "project": None} for c in clients]

    project_ids = [p["id"] for p in projects]
    milestones = await db.milestones.find(
        {"project_id": {"$in": project_ids}}, {"_id": 0}
    ).sort("order", 1).to_list(None)

    milestones_by_project: dict[str, list[dict]] = {}
    for m in milestones:
        milestones_by_project.setdefault(m["project_id"], []).append(m)

    project_by_client: dict[str, dict] = {}
    for p in projects:
        ms = milestones_by_project.get(p["id"], [])
        total = len(ms)
        completed = sum(1 for m in ms if m.get("completed"))
        progress = int((completed / total) * 100) if total else 0
        next_payment = None
        next_due = None
        for m in ms:
            if m.get("payment_status") != "paid":
                next_payment = m.get("amount")
                next_due = m.get("due_date")
                break
        if p["client_id"] not in project_by_client:
            project_by_client[p["client_id"]] = {
                **p,
                "milestones": ms,
                "progress": progress,
                "next_payment": next_payment,
                "next_due": next_due,
                "status": _derive_status(p.get("status"), total, completed),
            }

    return [{**c, "project": project_by_client.get(c["id"])} for c in clients]


async def _get_client_with_project(client_doc: dict) -> dict:
    project = await db.projects.find_one({"client_id": client_doc["id"]}, {"_id": 0})
    if project:
        project = await _attach_milestones(project)
    return {**client_doc, "project": project}


async def _get_default_rate_card(client_id: str) -> Optional[dict]:
    rc = await db.rate_cards.find_one({"client_id": client_id}, {"_id": 0})
    if not rc:
        rc = await db.rate_cards.find_one(
            {"is_default": True, "client_id": None}, {"_id": 0}
        )
    return rc


def _next_invoice_number() -> str:
    suffix = str(uuid.uuid4()).replace("-", "")[:6].upper()
    return f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{suffix}"


def _next_contract_number() -> str:
    suffix = str(uuid.uuid4()).replace("-", "")[:6].upper()
    return f"CON-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{suffix}"


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

# Brute-force login lockout: 5 failed attempts → 15 min cooldown per email
_LOGIN_FAIL_WINDOW_S = 15 * 60
_LOGIN_FAIL_LIMIT = 5
_login_fails: Dict[str, List[float]] = {}


def _login_locked(email: str) -> Optional[int]:
    fails = _login_fails.get(email, [])
    cutoff = time.time() - _LOGIN_FAIL_WINDOW_S
    fails = [t for t in fails if t > cutoff]
    _login_fails[email] = fails
    if len(fails) >= _LOGIN_FAIL_LIMIT:
        oldest = min(fails)
        return int(oldest + _LOGIN_FAIL_WINDOW_S - time.time())
    return None


def _login_record_fail(email: str) -> None:
    _login_fails.setdefault(email, []).append(time.time())


def _login_clear(email: str) -> None:
    _login_fails.pop(email, None)


@api.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    email = body.email.lower()
    locked_for = _login_locked(email)
    if locked_for and locked_for > 0:
        mins = max(1, locked_for // 60)
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in ~{mins} minute(s).")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        _login_record_fail(email)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _login_clear(email)
    token = create_access_token(user["id"], user["email"])
    await log_audit("auth.login", "user", user["id"], actor_id=user["id"])
    return LoginResponse(
        access_token=token,
        user={"id": user["id"], "email": user["email"],
              "name": user.get("display_name") or user.get("name"),
              "role": user.get("role")},
    )


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)) -> dict:
    return user


@api.post("/auth/logout")
async def logout(user: dict = Depends(get_current_user)) -> dict:
    return {"ok": True}


# ---------------------------------------------------------------------------
# Dashboard / KPIs
# ---------------------------------------------------------------------------

@api.get("/kpis")
async def kpis(user: dict = Depends(get_current_user)) -> dict:
    projects = await db.projects.find(tquery(user), {"_id": 0, "id": 1}).to_list(None)
    project_ids = [p["id"] for p in projects]

    total_clients = await db.clients.count_documents(tquery(user))
    active_clients = await db.clients.count_documents(tquery(user, {"status": "active"}))
    at_risk_clients = await db.clients.count_documents(tquery(user, {"status": "at_risk"}))

    if not project_ids:
        return {
            "active_projects": 0,
            "revenue_pipeline": 0.0,
            "overdue_payments": 0.0,
            "total_clients": total_clients,
            "active_clients": active_clients,
            "at_risk_clients": at_risk_clients,
            "pending_reviews": 0,
            "active_timers": 0,
        }

    milestones = await db.milestones.find(
        {"project_id": {"$in": project_ids}},
        {"_id": 0, "project_id": 1, "payment_status": 1, "completed": 1, "amount": 1, "due_date": 1},
    ).to_list(None)

    today_iso = date.today().isoformat()
    by_project: dict[str, list[dict]] = {}
    for m in milestones:
        by_project.setdefault(m["project_id"], []).append(m)

    active = 0
    revenue_pipeline = 0.0
    overdue = 0.0
    for pid in project_ids:
        ms = by_project.get(pid, [])
        total = len(ms)
        completed = sum(1 for m in ms if m.get("completed"))
        if total == 0 or completed < total:
            active += 1
        for m in ms:
            if m.get("payment_status") != "paid":
                amt = float(m.get("amount") or 0)
                revenue_pipeline += amt
                due = m.get("due_date")
                if due and _DATE_RE.match(str(due)) and str(due) < today_iso:
                    overdue += amt

    # Add unpaid usage events to revenue pipeline
    uninvoiced = await db.usage_events.find(
        tquery(user, {"invoice_id": {"$exists": False}, "voided_at": {"$exists": False}}),
        {"_id": 0, "billable_amount": 1}
    ).to_list(None)
    for ue in uninvoiced:
        revenue_pipeline += float(ue.get("billable_amount") or 0)

    pending_reviews = await db.agent_runs.count_documents(tquery(user, {"execution_status": "escalated", "human_reviewed": False}))
    active_timers = await db.timers.count_documents(tquery(user, {"status": "running"}))

    return {
        "active_projects": active,
        "revenue_pipeline": round(revenue_pipeline, 2),
        "overdue_payments": round(overdue, 2),
        "total_clients": total_clients,
        "active_clients": active_clients,
        "at_risk_clients": at_risk_clients,
        "pending_reviews": pending_reviews,
        "active_timers": active_timers,
    }


@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)) -> dict:
    kpi_data = await kpis(user)

    # Recent audit log
    recent_events = await db.audit_log.find(
        tquery(user), {"_id": 0}
    ).sort("occurred_at", -1).limit(10).to_list(None)

    # Recent agent runs
    recent_runs = await db.agent_runs.find(
        tquery(user), {"_id": 0}
    ).sort("started_at", -1).limit(5).to_list(None)

    # Client health distribution
    clients = await db.clients.find(tquery(user), {"_id": 0, "health_score": 1, "status": 1}).to_list(None)
    health_buckets = {"healthy": 0, "moderate": 0, "at_risk": 0}
    for c in clients:
        hs = float(c.get("health_score") or 100)
        if hs >= 75:
            health_buckets["healthy"] += 1
        elif hs >= 50:
            health_buckets["moderate"] += 1
        else:
            health_buckets["at_risk"] += 1

    # Recent invoices
    recent_invoices = await db.invoices.find(
        tquery(user), {"_id": 0}
    ).sort("created_at", -1).limit(5).to_list(None)

    return {
        **kpi_data,
        "recent_events": recent_events,
        "recent_agent_runs": recent_runs,
        "health_distribution": health_buckets,
        "recent_invoices": recent_invoices,
    }


# ---------------------------------------------------------------------------
# CRM — Clients
# ---------------------------------------------------------------------------

@api.get("/clients")
async def list_clients(
    status: Optional[str] = None,
    lifecycle_stage: Optional[str] = None,
    billing_model: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if status:
        query["status"] = status
    if lifecycle_stage:
        query["lifecycle_stage"] = lifecycle_stage
    if billing_model:
        query["billing_model"] = billing_model
    clients = await db.clients.find(tquery(user, query), {"_id": 0}).sort("created_at", -1).to_list(None)
    return await _batch_attach_projects(clients)


@api.post("/clients", status_code=status.HTTP_201_CREATED)
async def create_client(body: ClientCreate, user: dict = Depends(get_current_user)) -> dict:
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    client_doc = tdoc(user, {
        "id": cid,
        "name": body.name.strip(),
        "trading_name": body.trading_name,
        "email": body.email.lower() if body.email else None,
        "abn": body.abn,
        "website": body.website,
        "billing_model": body.billing_model,
        "lifecycle_stage": body.lifecycle_stage,
        "status": body.status,
        "account_manager_id": body.account_manager_id,
        "primary_currency": body.primary_currency,
        "tags": body.tags,
        "health_score": 100.0,
        "profitability_score": 0.0,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    })
    await db.clients.insert_one(client_doc)

    # Create initial project if project_name provided (backward compat)
    if body.project_name:
        pid = str(uuid.uuid4())
        await db.projects.insert_one(tdoc(user, {
            "id": pid,
            "client_id": cid,
            "name": body.project_name.strip(),
            "status": "active",
            "project_type": "service",
            "budget": float(body.total_amount) if body.total_amount else None,
            "total_amount": float(body.total_amount) if body.total_amount else 0.0,
            "risk_level": "low",
            "created_by": user["id"],
            "created_at": now,
            "updated_at": now,
        }))

    await log_audit("client.created", "client", cid, actor_id=user["id"], after_state=client_doc)
    c = await db.clients.find_one({"id": cid}, {"_id": 0})
    return await _get_client_with_project(c)


@api.get("/clients/{client_id}")
async def get_client(client_id: str, user: dict = Depends(get_current_user)) -> dict:
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return await _get_client_with_project(c)


@api.patch("/clients/{client_id}")
async def update_client(
    client_id: str, body: ClientUpdate, user: dict = Depends(get_current_user)
) -> dict:
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat(), "updated_by": user["id"]}
    data = body.model_dump(exclude_none=True)
    if "name" in data:
        data["name"] = data["name"].strip()
    if "email" in data and data["email"]:
        data["email"] = data["email"].lower()
    updates.update(data)
    await db.clients.update_one({"id": client_id}, {"$set": updates})
    await log_audit("client.updated", "client", client_id, actor_id=user["id"],
                    before_state=existing, after_state={**existing, **updates})
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    return await _get_client_with_project(c)


@api.delete("/clients/{client_id}")
async def delete_client(client_id: str, user: dict = Depends(get_current_user)) -> dict:
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    project = await db.projects.find_one({"client_id": client_id})
    if project:
        await db.milestones.delete_many({"project_id": project["id"]})
        await db.tasks.delete_many({"project_id": project["id"]})
        await db.projects.delete_one({"id": project["id"]})
    await db.contacts.delete_many({"client_id": client_id})
    await db.client_notes.delete_many({"client_id": client_id})
    await db.clients.delete_one({"id": client_id})
    await log_audit("client.deleted", "client", client_id, actor_id=user["id"], before_state=existing)
    return {"ok": True}


@api.get("/clients/{client_id}/health")
async def get_client_health(client_id: str, user: dict = Depends(get_current_user)) -> dict:
    c = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")

    projects = await db.projects.find({"client_id": client_id}, {"_id": 0}).to_list(None)
    invoices = await db.invoices.find({"client_id": client_id}, {"_id": 0}).to_list(None)
    last_note = await db.client_notes.find_one(
        {"client_id": client_id}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)]
    )

    today = datetime.now(timezone.utc).date()
    last_note_days = 999
    if last_note:
        try:
            ln_date = datetime.fromisoformat(last_note["created_at"]).date()
            last_note_days = (today - ln_date).days
        except Exception:
            pass

    # Compute signals
    score = 100.0
    signals = []
    if c.get("status") == "at_risk":
        score -= 20
        signals.append({"type": "warning", "message": "Client marked as at-risk"})
    if c.get("status") == "paused":
        score -= 10
        signals.append({"type": "info", "message": "Account is paused"})

    today_iso = today.isoformat()
    overdue_inv = [i for i in invoices if i.get("status") == "overdue" or
                   (i.get("status") not in ["paid", "voided"] and str(i.get("due_date", "9999")) < today_iso)]
    if overdue_inv:
        score -= len(overdue_inv) * 10
        signals.append({"type": "danger", "message": f"{len(overdue_inv)} overdue invoice(s)"})

    if last_note_days > 30:
        score -= 10
        signals.append({"type": "warning", "message": f"No client notes in {last_note_days} days"})

    blocked = [p for p in projects if p.get("status") == "blocked"]
    if blocked:
        score -= len(blocked) * 15
        signals.append({"type": "danger", "message": f"{len(blocked)} blocked project(s)"})

    score = max(0.0, min(100.0, score))
    await db.clients.update_one({"id": client_id}, {"$set": {"health_score": score}})

    return {
        "client_id": client_id,
        "health_score": score,
        "signals": signals,
        "last_note_days": last_note_days,
        "overdue_invoices": len(overdue_inv),
        "blocked_projects": len(blocked),
    }


# CRM — Contacts

@api.get("/clients/{client_id}/contacts")
async def list_contacts(client_id: str, user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.contacts.find({"client_id": client_id}, {"_id": 0}).to_list(None)


@api.post("/clients/{client_id}/contacts", status_code=status.HTTP_201_CREATED)
async def create_contact(
    client_id: str, body: ContactCreate, user: dict = Depends(get_current_user)
) -> dict:
    c = await db.clients.find_one({"id": client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": cid,
        "client_id": client_id,
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "email": body.email.lower() if body.email else None,
        "phone": body.phone,
        "title": body.title,
        "is_primary": body.is_primary,
        "is_billing": body.is_billing,
        "is_signatory": body.is_signatory,
        "created_at": now,
        "updated_at": now,
    }
    await db.contacts.insert_one(doc)
    return await db.contacts.find_one({"id": cid}, {"_id": 0})


@api.patch("/contacts/{contact_id}")
async def update_contact(
    contact_id: str, body: ContactUpdate, user: dict = Depends(get_current_user)
) -> dict:
    existing = await db.contacts.find_one({"id": contact_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.contacts.update_one({"id": contact_id}, {"$set": updates})
    return await db.contacts.find_one({"id": contact_id}, {"_id": 0})


@api.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: dict = Depends(get_current_user)) -> dict:
    result = await db.contacts.delete_one({"id": contact_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"ok": True}


# CRM — Notes

@api.get("/clients/{client_id}/notes")
async def list_notes(client_id: str, user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.client_notes.find(
        {"client_id": client_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(None)


@api.post("/clients/{client_id}/notes", status_code=status.HTTP_201_CREATED)
async def create_note(
    client_id: str, body: NoteCreate, user: dict = Depends(get_current_user)
) -> dict:
    c = await db.clients.find_one({"id": client_id})
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    nid = str(uuid.uuid4())
    doc = {
        "id": nid,
        "client_id": client_id,
        "author_id": user["id"],
        "body": body.body,
        "note_type": body.note_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.client_notes.insert_one(doc)
    return await db.client_notes.find_one({"id": nid}, {"_id": 0})


@api.delete("/notes/{note_id}")
async def delete_note(note_id: str, user: dict = Depends(get_current_user)) -> dict:
    result = await db.client_notes.delete_one({"id": note_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------

@api.get("/projects")
async def list_projects(
    client_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    if status_filter:
        query["status"] = status_filter
    projects = await db.projects.find(tquery(user, query), {"_id": 0}).sort("created_at", -1).to_list(None)
    result = []
    for p in projects:
        enriched = await _attach_milestones(p)
        # Attach client name
        c = await db.clients.find_one({"id": p["client_id"]}, {"_id": 0, "name": 1})
        enriched["client_name"] = c["name"] if c else "Unknown"
        result.append(enriched)
    return result


@api.post("/projects", status_code=status.HTTP_201_CREATED)
async def create_project(body: ProjectCreate, user: dict = Depends(get_current_user)) -> dict:
    c = await db.clients.find_one(tquery(user, {"id": body.client_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = tdoc(user, {
        "id": pid,
        "client_id": body.client_id,
        "owner_id": body.owner_id or user["id"],
        "name": body.name.strip(),
        "description": body.description,
        "project_type": body.project_type,
        "status": body.status,
        "budget": body.budget,
        "total_amount": body.total_amount or body.budget or 0,
        "budget_spent": 0.0,
        "margin_target": body.margin_target,
        "risk_level": body.risk_level,
        "start_date": body.start_date,
        "target_date": body.target_date,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    })
    await db.projects.insert_one(doc)
    await log_audit("project.created", "project", pid, actor_id=user["id"], after_state=doc)
    p = await db.projects.find_one({"id": pid}, {"_id": 0})
    return await _attach_milestones(p)


@api.get("/projects/{project_id}")
async def get_project(project_id: str, user: dict = Depends(get_current_user)) -> dict:
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    enriched = await _attach_milestones(p)
    tasks = await db.tasks.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(None)
    crs = await db.change_requests.find({"project_id": project_id}, {"_id": 0}).to_list(None)
    c = await db.clients.find_one({"id": p["client_id"]}, {"_id": 0, "name": 1})
    enriched["tasks"] = tasks
    enriched["change_requests"] = crs
    enriched["client_name"] = c["name"] if c else "Unknown"
    return enriched


@api.patch("/projects/{project_id}")
async def update_project(
    project_id: str, body: ProjectUpdate, user: dict = Depends(get_current_user)
) -> dict:
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = user["id"]
    if updates:
        await db.projects.update_one({"id": project_id}, {"$set": updates})
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _attach_milestones(p)


# Tasks

@api.get("/projects/{project_id}/tasks")
async def list_tasks(project_id: str, user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.tasks.find({"project_id": project_id}, {"_id": 0}).sort("created_at", 1).to_list(None)


@api.post("/projects/{project_id}/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(
    project_id: str, body: TaskCreate, user: dict = Depends(get_current_user)
) -> dict:
    p = await db.projects.find_one({"id": project_id})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    tid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": tid,
        "project_id": project_id,
        "client_id": p["client_id"],
        "milestone_id": body.milestone_id,
        "assignee_id": body.assignee_id,
        "title": body.title.strip(),
        "description": body.description,
        "status": body.status,
        "priority": body.priority,
        "estimated_hours": body.estimated_hours,
        "actual_hours": 0.0,
        "billable_flag": body.billable_flag,
        "due_date": body.due_date,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.tasks.insert_one(doc)
    return await db.tasks.find_one({"id": tid}, {"_id": 0})


@api.patch("/tasks/{task_id}")
async def update_task(
    task_id: str, body: TaskUpdate, user: dict = Depends(get_current_user)
) -> dict:
    t = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    if updates:
        await db.tasks.update_one({"id": task_id}, {"$set": updates})
    return await db.tasks.find_one({"id": task_id}, {"_id": 0})


@api.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)) -> dict:
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"ok": True}


# Milestones

@api.post("/projects/{project_id}/milestones", status_code=status.HTTP_201_CREATED)
async def add_milestone(
    project_id: str, body: MilestoneCreate, user: dict = Depends(get_current_user),
) -> dict:
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    existing_count = await db.milestones.count_documents({"project_id": project_id})
    mid = str(uuid.uuid4())
    doc = {
        "id": mid,
        "project_id": project_id,
        "name": body.name.strip(),
        "amount": float(body.amount),
        "due_date": body.due_date,
        "order": existing_count,
        "payment_status": "unpaid",
        "completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.milestones.insert_one(doc)
    return await db.milestones.find_one({"id": mid}, {"_id": 0})


@api.patch("/milestones/{milestone_id}")
async def update_milestone(
    milestone_id: str, body: MilestoneUpdate, user: dict = Depends(get_current_user),
) -> dict:
    m = await db.milestones.find_one({"id": milestone_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    updates = body.model_dump(exclude_none=True)
    merged = {**m, **updates}
    if merged.get("completed") and merged.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Milestone cannot be completed until payment is paid")
    if updates.get("payment_status") == "unpaid" and m.get("completed"):
        updates["completed"] = False
    if updates:
        if "name" in updates and isinstance(updates["name"], str):
            updates["name"] = updates["name"].strip()
        await db.milestones.update_one({"id": milestone_id}, {"$set": updates})
    return await db.milestones.find_one({"id": milestone_id}, {"_id": 0})


@api.delete("/milestones/{milestone_id}")
async def delete_milestone(milestone_id: str, user: dict = Depends(get_current_user)) -> dict:
    result = await db.milestones.delete_one({"id": milestone_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Milestone not found")
    return {"ok": True}


# Change Requests

@api.get("/projects/{project_id}/change-requests")
async def list_change_requests(project_id: str, user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.change_requests.find({"project_id": project_id}, {"_id": 0}).to_list(None)


@api.post("/projects/{project_id}/change-requests", status_code=status.HTTP_201_CREATED)
async def create_change_request(
    project_id: str, body: ChangeRequestCreate, user: dict = Depends(get_current_user)
) -> dict:
    p = await db.projects.find_one({"id": project_id})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    crid = str(uuid.uuid4())
    doc = {
        "id": crid,
        "project_id": project_id,
        "client_id": p["client_id"],
        "requested_by": user["id"],
        "description": body.description,
        "impact_estimate": body.impact_estimate,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.change_requests.insert_one(doc)
    return await db.change_requests.find_one({"id": crid}, {"_id": 0})


@api.patch("/change-requests/{cr_id}")
async def update_change_request(
    cr_id: str, body: ChangeRequestUpdate, user: dict = Depends(get_current_user)
) -> dict:
    cr = await db.change_requests.find_one({"id": cr_id}, {"_id": 0})
    if not cr:
        raise HTTPException(status_code=404, detail="Change request not found")
    updates = body.model_dump(exclude_none=True)
    if updates.get("status") in ["approved", "rejected"]:
        updates["approved_by"] = user["id"]
        updates["resolved_at"] = datetime.now(timezone.utc).isoformat()
    await db.change_requests.update_one({"id": cr_id}, {"$set": updates})
    return await db.change_requests.find_one({"id": cr_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Billing — Rate Cards
# ---------------------------------------------------------------------------

@api.get("/rate-cards")
async def list_rate_cards(user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.rate_cards.find(tquery(user), {"_id": 0}).sort("created_at", -1).to_list(None)


@api.post("/rate-cards", status_code=status.HTTP_201_CREATED)
async def create_rate_card(body: RateCardCreate, user: dict = Depends(get_current_user)) -> dict:
    rcid = str(uuid.uuid4())
    doc = tdoc(user, {
        "id": rcid,
        "client_id": body.client_id,
        "name": body.name,
        "currency": body.currency,
        "effective_from": body.effective_from,
        "effective_to": body.effective_to,
        "rates": body.rates,
        "overage_rules": body.overage_rules,
        "is_default": body.is_default,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    if body.is_default:
        await db.rate_cards.update_many(tquery(user, {"is_default": True, "client_id": None}), {"$set": {"is_default": False}})
    await db.rate_cards.insert_one(doc)
    return await db.rate_cards.find_one({"id": rcid}, {"_id": 0})


@api.patch("/rate-cards/{rc_id}")
async def update_rate_card(
    rc_id: str, body: RateCardUpdate, user: dict = Depends(get_current_user)
) -> dict:
    rc = await db.rate_cards.find_one({"id": rc_id}, {"_id": 0})
    if not rc:
        raise HTTPException(status_code=404, detail="Rate card not found")
    updates = body.model_dump(exclude_none=True)
    await db.rate_cards.update_one({"id": rc_id}, {"$set": updates})
    return await db.rate_cards.find_one({"id": rc_id}, {"_id": 0})


@api.delete("/rate-cards/{rc_id}")
async def delete_rate_card(rc_id: str, user: dict = Depends(get_current_user)) -> dict:
    result = await db.rate_cards.delete_one({"id": rc_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rate card not found")
    return {"ok": True}


# Billing — Timers ($$ Clock)

@api.get("/timers")
async def list_timers(
    client_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    if status_filter:
        query["status"] = status_filter
    timers = await db.timers.find(tquery(user, query), {"_id": 0}).sort("started_at", -1).limit(100).to_list(None)
    # Enrich with client name
    result = []
    for t in timers:
        c = await db.clients.find_one({"id": t["client_id"]}, {"_id": 0, "name": 1})
        t["client_name"] = c["name"] if c else "Unknown"
        if t.get("status") == "running":
            elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(t["started_at"].replace("Z", "+00:00"))).total_seconds()
            t["elapsed_secs"] = int(elapsed)
        result.append(t)
    return result


@api.get("/timers/active")
async def list_active_timers(user: dict = Depends(get_current_user)) -> list[dict]:
    timers = await db.timers.find(tquery(user, {"status": "running"}), {"_id": 0}).to_list(None)
    result = []
    for t in timers:
        c = await db.clients.find_one({"id": t["client_id"]}, {"_id": 0, "name": 1})
        t["client_name"] = c["name"] if c else "Unknown"
        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(t["started_at"].replace("Z", "+00:00"))).total_seconds()
        t["elapsed_secs"] = int(elapsed)
        result.append(t)
    return result


@api.post("/timers/start", status_code=status.HTTP_201_CREATED)
async def start_timer(body: TimerStart, user: dict = Depends(get_current_user)) -> dict:
    c = await db.clients.find_one(tquery(user, {"id": body.client_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    # Check for already running timer for this user+client
    existing = await db.timers.find_one({"user_id": user["id"], "status": "running"})
    if existing:
        raise HTTPException(status_code=400, detail="You already have a running timer. Stop it first.")
    tid_ = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = tdoc(user, {
        "id": tid_,
        "user_id": user["id"],
        "client_id": body.client_id,
        "project_id": body.project_id,
        "task_id": body.task_id,
        "description": body.description,
        "started_at": now,
        "stopped_at": None,
        "duration_secs": None,
        "is_billable": body.is_billable,
        "source": "manual",
        "status": "running",
        "created_at": now,
    })
    await db.timers.insert_one(doc)
    await log_audit("timer.started", "timer", tid_, actor_id=user["id"])
    t = await db.timers.find_one({"id": tid_}, {"_id": 0})
    t["client_name"] = c["name"]
    return t


@api.post("/timers/{timer_id}/stop")
async def stop_timer(timer_id: str, user: dict = Depends(get_current_user)) -> dict:
    t = await db.timers.find_one({"id": timer_id}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Timer not found")
    if t.get("status") != "running":
        raise HTTPException(status_code=400, detail="Timer is not running")

    stopped_at = datetime.now(timezone.utc)
    started_at = datetime.fromisoformat(t["started_at"].replace("Z", "+00:00"))
    duration_secs = int((stopped_at - started_at).total_seconds())
    duration_hours = duration_secs / 3600.0

    await db.timers.update_one(
        {"id": timer_id},
        {"$set": {
            "status": "stopped",
            "stopped_at": stopped_at.isoformat(),
            "duration_secs": duration_secs,
        }}
    )

    # Create usage event
    rate_card = await _get_default_rate_card(t["client_id"])
    hourly_rate = 150.0
    currency = "AUD"
    rate_card_id = None
    if rate_card:
        hourly_rate = float(rate_card.get("rates", {}).get("hourly", 150.0))
        currency = rate_card.get("currency", "AUD")
        rate_card_id = rate_card["id"]

    billable_amount = round(duration_hours * hourly_rate, 2) if t.get("is_billable") else 0.0

    ue_id = str(uuid.uuid4())
    ue_doc = tdoc(user, {
        "id": ue_id,
        "client_id": t["client_id"],
        "project_id": t.get("project_id"),
        "task_id": t.get("task_id"),
        "timer_id": timer_id,
        "source_type": "timer",
        "units": round(duration_hours, 4),
        "unit_label": "hours",
        "unit_rate": hourly_rate,
        "billable_amount": billable_amount,
        "currency": currency,
        "rate_card_id": rate_card_id,
        "is_billable": t.get("is_billable", True),
        "description": t.get("description"),
        "occurred_at": stopped_at.isoformat(),
        "created_at": stopped_at.isoformat(),
    })
    await db.usage_events.insert_one(ue_doc)
    await log_audit("timer.stopped", "timer", timer_id, actor_id=user["id"])

    timer_doc = await db.timers.find_one({"id": timer_id}, {"_id": 0})
    return {"timer": timer_doc, "usage_event": await db.usage_events.find_one({"id": ue_id}, {"_id": 0})}


# Billing — Usage Events

@api.get("/usage-events")
async def list_usage_events(
    client_id: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    events = await db.usage_events.find(tquery(user, query), {"_id": 0}).sort("occurred_at", -1).limit(200).to_list(None)
    result = []
    for e in events:
        c = await db.clients.find_one({"id": e["client_id"]}, {"_id": 0, "name": 1})
        e["client_name"] = c["name"] if c else "Unknown"
        result.append(e)
    return result


# Billing — Invoices

@api.get("/invoices")
async def list_invoices(
    client_id: Optional[str] = None,
    inv_status: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    if inv_status:
        query["status"] = inv_status
    invoices = await db.invoices.find(tquery(user, query), {"_id": 0}).sort("created_at", -1).to_list(None)
    result = []
    for inv in invoices:
        c = await db.clients.find_one({"id": inv["client_id"]}, {"_id": 0, "name": 1})
        inv["client_name"] = c["name"] if c else "Unknown"
        result.append(inv)
    return result


@api.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, user: dict = Depends(get_current_user)) -> dict:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    c = await db.clients.find_one({"id": inv["client_id"]}, {"_id": 0, "name": 1})
    inv["client_name"] = c["name"] if c else "Unknown"
    return inv


@api.post("/invoices/generate", status_code=status.HTTP_201_CREATED)
async def generate_invoice(body: InvoiceGenerate, user: dict = Depends(get_current_user)) -> dict:
    c = await db.clients.find_one(tquery(user, {"id": body.client_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")

    # Get unbilled usage events in period
    usage_events = await db.usage_events.find(tquery(user, {
        "client_id": body.client_id,
        "invoice_id": {"$exists": False},
        "voided_at": {"$exists": False},
        "occurred_at": {"$gte": body.period_start, "$lte": body.period_end + "T23:59:59Z"},
    }), {"_id": 0}).to_list(None)

    line_items = []
    subtotal = 0.0

    for ue in usage_events:
        amt = float(ue.get("billable_amount") or 0)
        if not ue.get("is_billable", True):
            continue
        label = ue.get("description") or f"{round(float(ue.get('units', 0)), 2)} {ue.get('unit_label', 'hours')}"
        line_items.append({
            "usage_event_id": ue["id"],
            "description": label,
            "units": ue.get("units"),
            "unit_rate": ue.get("unit_rate"),
            "amount": amt,
        })
        subtotal += amt

    tax_amount = round(subtotal * body.tax_rate, 2)
    total_amount = round(subtotal + tax_amount, 2)
    currency = c.get("primary_currency", "AUD")

    inv_number = _next_invoice_number()
    now = datetime.now(timezone.utc).isoformat()
    due_date = body.due_date or (date.today() + timedelta(days=30)).isoformat()

    inv_doc = tdoc(user, {
        "id": str(uuid.uuid4()),
        "client_id": body.client_id,
        "invoice_number": inv_number,
        "status": "draft",
        "subtotal": round(subtotal, 2),
        "tax_amount": tax_amount,
        "discount_amount": 0.0,
        "total_amount": total_amount,
        "amount_paid": 0.0,
        "balance_due": total_amount,
        "currency": currency,
        "due_date": due_date,
        "period_start": body.period_start,
        "period_end": body.period_end,
        "line_items": line_items,
        "notes": body.notes,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    })
    await db.invoices.insert_one(inv_doc)

    # Mark usage events as invoiced
    ue_ids = [li["usage_event_id"] for li in line_items if "usage_event_id" in li]
    if ue_ids:
        await db.usage_events.update_many(
            {"id": {"$in": ue_ids}},
            {"$set": {"invoice_id": inv_doc["id"]}}
        )

    await log_audit("invoice.generated", "invoice", inv_doc["id"], actor_id=user["id"])
    result = await db.invoices.find_one({"id": inv_doc["id"]}, {"_id": 0})
    result["client_name"] = c["name"]
    return result


@api.patch("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: str, body: InvoiceUpdate, user: dict = Depends(get_current_user)
) -> dict:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    if updates.get("amount_paid") is not None:
        paid = float(updates["amount_paid"])
        total = float(inv["total_amount"])
        updates["balance_due"] = round(max(0, total - paid), 2)
        if paid >= total:
            updates["status"] = "paid"
            updates["paid_at"] = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one({"id": invoice_id}, {"$set": updates})
    await log_audit("invoice.updated", "invoice", invoice_id, actor_id=user["id"])
    result = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    c = await db.clients.find_one({"id": result["client_id"]}, {"_id": 0, "name": 1})
    result["client_name"] = c["name"] if c else "Unknown"
    return result


@api.post("/invoices/{invoice_id}/checkout")
async def invoice_checkout(
    invoice_id: str,
    body: CheckoutBody,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    """Create a Stripe checkout session for an invoice."""
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe not available")
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Invoice already paid")
    balance = float(inv.get("balance_due") or inv.get("total_amount") or 0)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="Nothing to pay on this invoice")

    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=_webhook_url(request))
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/payment-status?session_id={{CHECKOUT_SESSION_ID}}&source=invoice&invoice_id={invoice_id}"
    cancel_url = f"{origin}/billing"
    client = await db.clients.find_one({"id": inv["client_id"]}, {"_id": 0, "name": 1})
    client_name = client["name"] if client else "Client"
    req = CheckoutSessionRequest(
        amount=balance,
        currency=inv.get("currency", "aud").lower(),
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"invoice_id": invoice_id, "invoice_number": inv["invoice_number"]},
    )
    session = await stripe_checkout.create_checkout_session(req)
    await db.payment_transactions.insert_one(tdoc(user, {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "invoice_id": invoice_id,
        "milestone_id": None,
        "project_id": None,
        "amount": balance,
        "currency": inv.get("currency", "aud").lower(),
        "payment_status": "initiated",
        "status": "open",
        "metadata": {"invoice_id": invoice_id, "client_name": client_name},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }))
    await log_audit("invoice.checkout_created", "invoice", invoice_id, actor_id=user["id"])
    return {"url": session.url, "session_id": session.session_id}


@api.post("/invoices/{invoice_id}/send")
async def send_invoice(invoice_id: str, user: dict = Depends(get_current_user)) -> dict:
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.invoices.update_one(
        {"id": invoice_id},
        {"$set": {"status": "sent", "issued_at": now, "updated_at": now}}
    )
    await log_audit("invoice.sent", "invoice", invoice_id, actor_id=user["id"])
    return {"ok": True, "status": "sent"}


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

@api.get("/contract-templates")
async def list_contract_templates(user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.contract_templates.find({}, {"_id": 0}).sort("created_at", -1).to_list(None)


@api.post("/contract-templates", status_code=status.HTTP_201_CREATED)
async def create_contract_template(
    body: ContractTemplateCreate, user: dict = Depends(get_current_user)
) -> dict:
    tid = str(uuid.uuid4())
    doc = {
        "id": tid,
        "name": body.name,
        "template_type": body.template_type,
        "body_template": body.body_template,
        "variables": body.variables,
        "version": 1,
        "is_active": True,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contract_templates.insert_one(doc)
    return await db.contract_templates.find_one({"id": tid}, {"_id": 0})


@api.get("/contracts")
async def list_contracts(
    client_id: Optional[str] = None,
    user: dict = Depends(get_current_user)
) -> list[dict]:
    query: dict = {}
    if client_id:
        query["client_id"] = client_id
    contracts = await db.contracts.find(tquery(user, query), {"_id": 0}).sort("created_at", -1).to_list(None)
    result = []
    for con in contracts:
        c = await db.clients.find_one({"id": con["client_id"]}, {"_id": 0, "name": 1})
        con["client_name"] = c["name"] if c else "Unknown"
        result.append(con)
    return result


@api.get("/contracts/{contract_id}")
async def get_contract(contract_id: str, user: dict = Depends(get_current_user)) -> dict:
    con = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not con:
        raise HTTPException(status_code=404, detail="Contract not found")
    c = await db.clients.find_one({"id": con["client_id"]}, {"_id": 0, "name": 1})
    con["client_name"] = c["name"] if c else "Unknown"
    return con


@api.post("/contracts/generate", status_code=status.HTTP_201_CREATED)
async def generate_contract(
    body: ContractGenerate, user: dict = Depends(get_current_user)
) -> dict:
    c = await db.clients.find_one(tquery(user, {"id": body.client_id}))
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    tmpl = await db.contract_templates.find_one({"id": body.template_id})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    # Render template with variables
    rendered = tmpl["body_template"]
    for key, val in body.variables_used.items():
        rendered = rendered.replace(f"{{{{{key}}}}}", val)
    # Replace standard vars
    rendered = rendered.replace("{{client_name}}", c["name"])
    rendered = rendered.replace("{{date}}", date.today().isoformat())

    con_number = _next_contract_number()
    now = datetime.now(timezone.utc).isoformat()
    con_doc = tdoc(user, {
        "id": str(uuid.uuid4()),
        "client_id": body.client_id,
        "template_id": body.template_id,
        "contract_number": con_number,
        "contract_type": body.contract_type,
        "title": body.title,
        "status": "draft",
        "rendered_body": rendered,
        "variables_used": body.variables_used,
        "effective_date": body.effective_date,
        "expiry_date": body.expiry_date,
        "renewal_trigger": body.renewal_trigger,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    })
    await db.contracts.insert_one(con_doc)
    await log_audit("contract.generated", "contract", con_doc["id"], actor_id=user["id"])
    result = await db.contracts.find_one({"id": con_doc["id"]}, {"_id": 0})
    result["client_name"] = c["name"]
    return result


@api.patch("/contracts/{contract_id}")
async def update_contract(
    contract_id: str, body: ContractUpdate, user: dict = Depends(get_current_user)
) -> dict:
    con = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not con:
        raise HTTPException(status_code=404, detail="Contract not found")
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    if updates.get("status") == "signed":
        updates["signed_at_cdxi"] = datetime.now(timezone.utc).isoformat()
    await db.contracts.update_one({"id": contract_id}, {"$set": updates})
    await log_audit("contract.updated", "contract", contract_id, actor_id=user["id"])
    result = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    c = await db.clients.find_one({"id": result["client_id"]}, {"_id": 0, "name": 1})
    result["client_name"] = c["name"] if c else "Unknown"
    return result


@api.post("/contracts/{contract_id}/send")
async def send_contract(contract_id: str, user: dict = Depends(get_current_user)) -> dict:
    con = await db.contracts.find_one({"id": contract_id}, {"_id": 0})
    if not con:
        raise HTTPException(status_code=404, detail="Contract not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.contracts.update_one(
        {"id": contract_id},
        {"$set": {"status": "sent", "updated_at": now}}
    )
    await log_audit("contract.sent", "contract", contract_id, actor_id=user["id"])
    return {"ok": True, "status": "sent"}


# Approvals

@api.get("/approvals")
async def list_approvals(
    pending_only: bool = False,
    user: dict = Depends(get_current_user)
) -> list[dict]:
    query: dict = {}
    if pending_only:
        query["status"] = "pending"
    return await db.approvals.find(query, {"_id": 0}).sort("created_at", -1).to_list(None)


@api.post("/approvals", status_code=status.HTTP_201_CREATED)
async def create_approval(body: ApprovalCreate, user: dict = Depends(get_current_user)) -> dict:
    apid = str(uuid.uuid4())
    doc = {
        "id": apid,
        "approval_type": body.approval_type,
        "target_type": body.target_type,
        "target_id": body.target_id,
        "requested_by": user["id"],
        "approver_id": body.approver_id,
        "status": "pending",
        "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.approvals.insert_one(doc)
    return await db.approvals.find_one({"id": apid}, {"_id": 0})


@api.patch("/approvals/{approval_id}/decide")
async def decide_approval(
    approval_id: str, body: ApprovalDecision, user: dict = Depends(get_current_user)
) -> dict:
    ap = await db.approvals.find_one({"id": approval_id}, {"_id": 0})
    if not ap:
        raise HTTPException(status_code=404, detail="Approval not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.approvals.update_one(
        {"id": approval_id},
        {"$set": {
            "status": body.decision,
            "approver_id": user["id"],
            "notes": body.notes or ap.get("notes"),
            "decided_at": now,
        }}
    )
    await log_audit(f"approval.{body.decision}", "approval", approval_id, actor_id=user["id"])
    return await db.approvals.find_one({"id": approval_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# AI Operations
# ---------------------------------------------------------------------------

@api.get("/agents")
async def list_agents(user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.agents.find({}, {"_id": 0}).to_list(None)


@api.post("/agents/run")
async def trigger_agent_run(
    body: AgentRunTrigger,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
) -> dict:
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=400, detail="LLM key not configured")

    from agents_service import run_agent_task

    try:
        result = await run_agent_task(
            agent_type=body.agent_type,
            trigger_event=body.trigger_event,
            context=body.context,
            db=db,
            actor_id=user["id"],
            tenant_id=tid(user),
        )
        return result
    except Exception as exc:
        logger.error("Agent run failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Agent run failed: {str(exc)}")


@api.get("/agents/runs")
async def list_agent_runs(
    agent_type: Optional[str] = None,
    exec_status: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if agent_type:
        query["agent_type"] = agent_type
    if exec_status:
        query["execution_status"] = exec_status
    return await db.agent_runs.find(tquery(user, query), {"_id": 0}).sort("started_at", -1).limit(50).to_list(None)


@api.get("/agents/review-queue")
async def get_review_queue(user: dict = Depends(get_current_user)) -> list[dict]:
    return await db.agent_runs.find(
        tquery(user, {"execution_status": "escalated", "human_reviewed": False}), {"_id": 0}
    ).sort("started_at", -1).to_list(None)


@api.get("/agents/runs/{run_id}")
async def get_agent_run(run_id: str, user: dict = Depends(get_current_user)) -> dict:
    run = await db.agent_runs.find_one({"id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


@api.post("/agents/runs/{run_id}/review")
async def review_agent_run(
    run_id: str, body: AgentRunReview, user: dict = Depends(get_current_user)
) -> dict:
    run = await db.agent_runs.find_one({"id": run_id}, {"_id": 0})
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.agent_runs.update_one(
        {"id": run_id},
        {"$set": {
            "human_reviewed": True,
            "human_decision": body.decision,
            "review_notes": body.notes,
            "execution_status": "complete" if body.decision == "approved" else "cancelled",
            "reviewed_at": now,
            "reviewed_by": user["id"],
        }}
    )
    await log_audit(f"agent_run.{body.decision}", "agent_run", run_id, actor_id=user["id"])
    return await db.agent_runs.find_one({"id": run_id}, {"_id": 0})


# ---------------------------------------------------------------------------
# Agent Workflow Demo — End-to-end orchestrated multi-agent run
# ---------------------------------------------------------------------------

@api.post("/agents/workflow-demo")
async def run_workflow_demo(user: dict = Depends(get_current_user)) -> dict:
    """Run an end-to-end demo: Chief Orchestrator -> Finance -> Client Success.

    Pulls real DB context (an overdue/sent invoice + lowest-health client) and
    runs three sequential agent invocations, returning the full chain.
    """
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=400, detail="LLM key not configured")

    from agents_service import run_agent_task

    # 1. Find an overdue/sent invoice (or fall back to most recent)
    invoice = await db.invoices.find_one(
        tquery(user, {"status": {"$in": ["overdue", "sent"]}}),
        {"_id": 0},
        sort=[("due_date", 1)],
    )
    if not invoice:
        invoice = await db.invoices.find_one(tquery(user), {"_id": 0}, sort=[("created_at", -1)])
    if not invoice:
        # Fabricate a demo invoice context if none exists
        invoice = {
            "id": "demo-inv",
            "invoice_number": "INV-DEMO-001",
            "client_id": "demo-client",
            "total_amount": 12500.0,
            "balance_due": 12500.0,
            "status": "overdue",
            "due_date": "2025-12-15",
            "currency": "AUD",
        }

    client = None
    if invoice.get("client_id"):
        client = await db.clients.find_one(tquery(user, {"id": invoice["client_id"]}), {"_id": 0})
    if not client:
        client = await db.clients.find_one(tquery(user), {"_id": 0}, sort=[("health_score", 1)])
    if not client:
        client = {"id": "demo-client", "name": "Acme Studios", "health_score": 62, "lifecycle_stage": "active"}

    days_overdue = 0
    try:
        if invoice.get("due_date"):
            due = datetime.fromisoformat(str(invoice["due_date"]).replace("Z", "+00:00"))
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            days_overdue = max(0, (datetime.now(timezone.utc) - due).days)
    except Exception:
        days_overdue = 0

    base_context = {
        "client_id": client.get("id"),
        "client_name": client.get("name"),
        "health_score": client.get("health_score"),
        "lifecycle_stage": client.get("lifecycle_stage"),
        "invoice_id": invoice.get("id"),
        "invoice_number": invoice.get("invoice_number"),
        "amount_outstanding": invoice.get("balance_due") or invoice.get("total_amount"),
        "currency": invoice.get("currency", "AUD"),
        "days_overdue": days_overdue,
        "invoice_status": invoice.get("status"),
    }

    steps: list[dict] = []

    # Step 1: Chief Orchestrator routes the event
    orch = await run_agent_task(
        agent_type="chief_orchestrator",
        trigger_event="invoice.overdue_detected",
        context=base_context,
        db=db,
        actor_id=user["id"],
        tenant_id=tid(user),
    )
    steps.append({
        "step": 1,
        "agent": "chief_orchestrator",
        "title": "Chief Orchestrator — classify & route",
        "trigger": "invoice.overdue_detected",
        **orch,
    })

    # Step 2: Finance Agent drafts dunning communication
    fin_context = {**base_context, "orchestrator_priority": orch["output"].get("priority")}
    fin = await run_agent_task(
        agent_type="finance",
        trigger_event="finance.draft_followup",
        context=fin_context,
        db=db,
        actor_id=user["id"],
        tenant_id=tid(user),
    )
    steps.append({
        "step": 2,
        "agent": "finance",
        "title": "Finance Agent — draft follow-up",
        "trigger": "finance.draft_followup",
        **fin,
    })

    # Step 3: Client Success reviews health impact
    cs_context = {
        **base_context,
        "finance_risk_level": fin["output"].get("risk_level"),
        "finance_action_type": fin["output"].get("action_type"),
    }
    cs = await run_agent_task(
        agent_type="client_success",
        trigger_event="client_success.health_review",
        context=cs_context,
        db=db,
        actor_id=user["id"],
        tenant_id=tid(user),
    )
    steps.append({
        "step": 3,
        "agent": "client_success",
        "title": "Client Success — health & retention plan",
        "trigger": "client_success.health_review",
        **cs,
    })

    avg_confidence = round(
        sum(s.get("confidence_score") or 0 for s in steps) / len(steps), 3
    )

    return {
        "context": base_context,
        "steps": steps,
        "summary": {
            "total_steps": len(steps),
            "average_confidence": avg_confidence,
            "any_escalated": any(s.get("escalation_flag") for s in steps),
        },
    }


# ---------------------------------------------------------------------------
# Settings — Users
# ---------------------------------------------------------------------------

@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)) -> list[dict]:
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(None)
    return users


@api.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create users")
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")
    uid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "display_name": body.display_name,
        "name": body.display_name,
        "role": body.role,
        "status": "active",
        "tenant_id": tid(user),
        "password_hash": hash_password(body.password),
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.users.insert_one(doc)
    result = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return result


@api.patch("/users/{user_id}")
async def update_user(
    user_id: str, body: UserUpdate, current_user: dict = Depends(get_current_user)
) -> dict:
    if current_user.get("role") != "admin" and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Forbidden")
    updates = body.model_dump(exclude_none=True)
    # Only admins can change tenant_id, and target tenant must exist
    if "tenant_id" in updates:
        if current_user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Only admins can change a user's tenant")
        t = await db.tenants.find_one({"id": updates["tenant_id"]})
        if not t:
            raise HTTPException(status_code=404, detail="Target tenant not found")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.users.update_one({"id": user_id}, {"$set": updates})
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})


# ---------------------------------------------------------------------------
# Tenants — Multi-tenant onboarding
# ---------------------------------------------------------------------------

def _slugify(value: str) -> str:
    s = "".join(c.lower() if c.isalnum() else "-" for c in value).strip("-")
    while "--" in s:
        s = s.replace("--", "-")
    return s or "tenant"


@api.get("/tenants")
async def list_tenants(user: dict = Depends(get_current_user)) -> list[dict]:
    # Admins see all tenants; non-admins only see their own
    if user.get("role") == "admin":
        return await db.tenants.find({}, {"_id": 0}).sort("created_at", 1).to_list(None)
    own = await db.tenants.find_one({"id": tid(user)}, {"_id": 0})
    return [own] if own else []


@api.post("/tenants", status_code=status.HTTP_201_CREATED)
async def create_tenant(body: TenantCreate, user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can create tenants")
    slug = (body.slug or _slugify(body.name))[:60]
    existing = await db.tenants.find_one({"$or": [{"id": slug}, {"slug": slug}]})
    if existing:
        raise HTTPException(status_code=400, detail="A tenant with this slug already exists")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": slug,
        "slug": slug,
        "name": body.name.strip(),
        "status": "active",
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.tenants.insert_one(doc)
    await log_audit("tenant.created", "tenant", slug, actor_id=user["id"], tenant_id=tid(user), after_state=doc)
    return await db.tenants.find_one({"id": slug}, {"_id": 0})


@api.patch("/tenants/{tenant_slug}")
async def update_tenant(
    tenant_slug: str, body: TenantUpdate, user: dict = Depends(get_current_user)
) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update tenants")
    existing = await db.tenants.find_one({"id": tenant_slug}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Tenant not found")
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.tenants.update_one({"id": tenant_slug}, {"$set": updates})
    return await db.tenants.find_one({"id": tenant_slug}, {"_id": 0})


@api.post("/tenants/{tenant_slug}/switch")
async def switch_tenant(tenant_slug: str, user: dict = Depends(get_current_user)) -> dict:
    """Move the current user into the specified tenant. Admins only.

    The user's current JWT remains valid; tenant scope is resolved from the
    user record on every request, so the next API call reflects the new tenant.
    """
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can switch tenants")
    t = await db.tenants.find_one({"id": tenant_slug}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Tenant not found")
    await db.users.update_one(
        {"id": user["id"]}, {"$set": {"tenant_id": tenant_slug, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await log_audit("tenant.switched", "tenant", tenant_slug, actor_id=user["id"], tenant_id=tenant_slug)
    return {"ok": True, "tenant_id": tenant_slug, "tenant_name": t["name"]}


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

@api.get("/audit-log")
async def get_audit_log(
    limit: int = 50,
    object_type: Optional[str] = None,
    user: dict = Depends(get_current_user),
) -> list[dict]:
    query: dict = {}
    if object_type:
        query["object_type"] = object_type
    return await db.audit_log.find(
        tquery(user, query), {"_id": 0}
    ).sort("occurred_at", -1).limit(limit).to_list(None)


# ---------------------------------------------------------------------------
# Stripe (existing, preserved)
# ---------------------------------------------------------------------------

def _webhook_url(request: Request) -> str:
    base = PUBLIC_BASE_URL or str(request.base_url).rstrip("/")
    return f"{base}/api/webhook/stripe"


@api.post("/milestones/{milestone_id}/checkout")
async def create_checkout(
    milestone_id: str,
    body: CheckoutBody,
    request: Request,
    user: dict = Depends(get_current_user),
) -> dict:
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe not available")
    milestone = await db.milestones.find_one({"id": milestone_id}, {"_id": 0})
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone not found")
    if milestone.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Milestone already paid")
    amount = float(milestone["amount"])
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid milestone amount")

    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=_webhook_url(request))
    origin = body.origin_url.rstrip("/")
    success_url = f"{origin}/payment-status?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/"
    req = CheckoutSessionRequest(
        amount=amount, currency="usd",
        success_url=success_url, cancel_url=cancel_url,
        metadata={"milestone_id": milestone_id, "project_id": milestone["project_id"]},
    )
    session = await stripe_checkout.create_checkout_session(req)
    await db.payment_transactions.insert_one(tdoc(user, {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "milestone_id": milestone_id,
        "project_id": milestone["project_id"],
        "amount": amount, "currency": "usd",
        "payment_status": "initiated", "status": "open",
        "metadata": {"milestone_id": milestone_id, "project_id": milestone["project_id"]},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }))
    return {"url": session.url, "session_id": session.session_id}


@api.get("/payments/status/{session_id}")
async def payment_status(
    session_id: str, request: Request, user: dict = Depends(get_current_user)
) -> dict:
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if not STRIPE_AVAILABLE:
        return {"session_id": session_id, "payment_status": tx.get("payment_status", "pending"),
                "status": tx.get("status", "open"),
                "amount_total": int(float(tx.get("amount") or 0) * 100), "currency": tx.get("currency", "usd"),
                "invoice_id": tx.get("invoice_id"), "milestone_id": tx.get("milestone_id")}
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=_webhook_url(request))
    try:
        live = await stripe_checkout.get_checkout_status(session_id)
    except Exception as exc:
        logger.warning("Stripe status lookup failed: %s", exc)
        live = None
    if live is None:
        return {"session_id": session_id, "payment_status": tx.get("payment_status", "pending"),
                "status": tx.get("status", "open"),
                "amount_total": int(float(tx.get("amount") or 0) * 100), "currency": tx.get("currency", "usd"),
                "invoice_id": tx.get("invoice_id"), "milestone_id": tx.get("milestone_id")}
    if tx.get("payment_status") != "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": live.payment_status, "status": live.status}},
        )
        if live.payment_status == "paid":
            await _settle_payment(tx, user_id=user.get("id"))
    return {"session_id": session_id, "payment_status": live.payment_status,
            "status": live.status, "amount_total": live.amount_total, "currency": live.currency,
            "invoice_id": tx.get("invoice_id"), "milestone_id": tx.get("milestone_id")}


async def _settle_payment(tx: dict, user_id: Optional[str] = None) -> None:
    """Mark the invoice or milestone associated with a payment_transaction as paid."""
    now = datetime.now(timezone.utc).isoformat()
    if tx.get("invoice_id"):
        inv = await db.invoices.find_one({"id": tx["invoice_id"]}, {"_id": 0})
        if inv and inv.get("status") != "paid":
            total = float(inv.get("total_amount") or 0)
            await db.invoices.update_one(
                {"id": tx["invoice_id"]},
                {"$set": {
                    "status": "paid",
                    "amount_paid": total,
                    "balance_due": 0.0,
                    "paid_at": now,
                    "updated_at": now,
                }},
            )
            await log_audit(
                "invoice.paid_via_stripe", "invoice", tx["invoice_id"],
                actor_id=user_id, actor_type="stripe_webhook" if user_id is None else "user",
                tenant_id=inv.get("tenant_id") or DEFAULT_TENANT,
                metadata={"session_id": tx.get("session_id"), "amount": tx.get("amount")},
            )
    if tx.get("milestone_id"):
        await db.milestones.update_one(
            {"id": tx["milestone_id"]}, {"$set": {"payment_status": "paid"}}
        )


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request) -> dict:
    if not STRIPE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Stripe not available")
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    if not sig:
        logger.warning("Stripe webhook called with no Stripe-Signature header")
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=_webhook_url(request))
    try:
        evt = await stripe_checkout.handle_webhook(body, sig)
    except Exception as exc:
        # Distinguish signature failures (security concern) from parse errors (upstream issue)
        msg = str(exc).lower()
        if "signature" in msg or "verify" in msg:
            logger.error("Stripe webhook signature verification failed: %s", exc)
            raise HTTPException(status_code=400, detail="Webhook signature verification failed")
        logger.error("Stripe webhook payload parse error: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail=f"Webhook payload parse error: {exc.__class__.__name__}")
    if evt.payment_status == "paid" and evt.session_id:
        tx = await db.payment_transactions.find_one({"session_id": evt.session_id})
        if tx and tx.get("payment_status") != "paid":
            await db.payment_transactions.update_one(
                {"session_id": evt.session_id},
                {"$set": {"payment_status": "paid", "status": "complete"}},
            )
            await _settle_payment(tx)
    return {"received": True}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@api.get("/")
async def root() -> dict:
    return {"service": "cdxi-os", "version": "2.0.0", "status": "ok"}


@api.get("/health")
async def health() -> dict:
    try:
        await db.command("ping")
        db_ok = True
    except Exception as exc:
        logger.warning("health: db ping failed: %s", exc)
        db_ok = False
    return {"service": "cdxi-os", "status": "ok" if db_ok else "degraded", "db": "up" if db_ok else "down"}


# ---------------------------------------------------------------------------
# Atlas — AI copilot (GPT-5.2 via Emergent Universal Key)
# ---------------------------------------------------------------------------

class _CopilotMessage(BaseModel):
    session_id: str
    message: str
    include_workspace: bool = True


async def _atlas_workspace_snapshot(user: dict) -> str:
    tid = user.get("tenant_id") or DEFAULT_TENANT
    tenant = await db.tenants.find_one({"id": tid}, {"_id": 0})
    clients = await db.clients.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    projects = await db.projects.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    invoices = await db.invoices.find({"tenant_id": tid}, {"_id": 0}).to_list(100)

    open_inv = [i for i in invoices if i.get("status") in ("sent", "overdue", "partial")]
    open_ar = sum((i.get("balance_due") or 0) for i in open_inv)
    overdue = [i for i in invoices if i.get("status") == "overdue"]
    overdue_ar = sum((i.get("balance_due") or 0) for i in overdue)
    at_risk = [c for c in clients if (c.get("health_score") or 100) < 60]

    def cb(c):
        return f"- {c['name']} ({c.get('trading_name') or c.get('email','')}) · health={c.get('health_score',0):.0f} · {c.get('lifecycle_stage','')}"
    def pb(p):
        return f"- {p['name']} · status={p.get('status')} · risk={p.get('risk_level','')} · spent={p.get('budget_spent',0)}/{p.get('budget',0)}"
    def ib(i):
        return f"- {i.get('invoice_number')} · ${i.get('balance_due',0):,.0f} · {i.get('status')} · due={i.get('due_date','')}"

    lines = [
        f"BRAND: {tenant.get('name') if tenant else tid}",
        f"Counts: clients={len(clients)} projects={len(projects)} invoices={len(invoices)}",
        f"Open AR: ${open_ar:,.0f} · Overdue AR: ${overdue_ar:,.0f} · At-risk clients: {len(at_risk)}",
        "", "CLIENTS:", *[cb(c) for c in clients[:15]],
        "", "PROJECTS:", *[pb(p) for p in projects[:10]],
        "", "INVOICES (open):", *[ib(i) for i in open_inv[:15]],
    ]
    return "\n".join(lines)


@api.post("/copilot/chat")
async def copilot_chat(data: _CopilotMessage, user: dict = Depends(get_current_user)):
    llm_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not llm_key:
        raise HTTPException(500, "LLM key not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as exc:
        raise HTTPException(500, f"emergentintegrations not available: {exc}")

    tenant_name = (user.get("tenant_id") or DEFAULT_TENANT)
    system = (
        "You are Atlas, the in-house AI copilot inside cdxi | OS — the internal operating system used to run cdxi "
        "and its brands (cdxi, fourtee2, fleshsesh). Users are cdxi operators. "
        "Help them with CRM, deals, projects, proposals, invoicing, AR risk and delivery ops. "
        "Be concise, strategic and action-oriented. Use markdown with short paragraphs and bullets. "
        "When data is provided in the snapshot below, ground answers in it; otherwise answer from general knowledge. "
        f"Active brand: {tenant_name}."
    )
    if data.include_workspace:
        try:
            snap = await _atlas_workspace_snapshot(user)
            if snap:
                system += f"\n\n--- LIVE BRAND SNAPSHOT ---\n{snap}\n--- END ---"
        except Exception as exc:
            logger.warning("atlas snapshot failed: %s", exc)

    chat = LlmChat(api_key=llm_key, session_id=data.session_id, system_message=system).with_model("openai", "gpt-5.2")
    try:
        import asyncio as _asyncio
        reply = await _asyncio.wait_for(chat.send_message(UserMessage(text=data.message)), timeout=45.0)
    except _asyncio.TimeoutError:
        raise HTTPException(504, "Atlas timed out — try a shorter prompt or retry.")
    except Exception as exc:
        raise HTTPException(500, f"LLM error: {exc}")

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.copilot_messages.insert_many([
        {"id": str(uuid.uuid4()), "session_id": data.session_id, "user_id": user["id"],
         "tenant_id": user.get("tenant_id") or DEFAULT_TENANT, "role": "user",
         "content": data.message, "created_at": now_iso},
        {"id": str(uuid.uuid4()), "session_id": data.session_id, "user_id": user["id"],
         "tenant_id": user.get("tenant_id") or DEFAULT_TENANT, "role": "assistant",
         "content": reply, "created_at": now_iso},
    ])
    return {"reply": reply}


app.include_router(api)


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------

async def _seed_default_tenant() -> None:
    # cdxi internal OS — seed the cdxi org and its brand tenants
    brands = [
        ("default",   "cdxi"),       # primary tenant uses 'default' slug for backward-compat
        ("fourtee2",  "fourtee2"),
        ("fleshsesh", "fleshsesh"),
    ]
    now = datetime.now(timezone.utc).isoformat()
    for slug, name in brands:
        existing = await db.tenants.find_one({"id": slug})
        if existing:
            # ensure name is current (rename default → cdxi if older seed ran)
            if existing.get("name") != name:
                await db.tenants.update_one({"id": slug}, {"$set": {"name": name, "updated_at": now}})
            continue
        await db.tenants.insert_one({
            "id": slug,
            "slug": slug,
            "name": name,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        })
        logger.info("Seeded tenant: %s", name)


async def _seed_admin() -> None:
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "display_name": "Parker",
            "name": "Parker",
            "role": "admin",
            "status": "active",
            "tenant_id": DEFAULT_TENANT,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Seeded admin user (%s)", ADMIN_EMAIL)
        return

    # Backfill tenant_id on legacy admin
    if not existing.get("tenant_id"):
        await db.users.update_one(
            {"id": existing["id"]}, {"$set": {"tenant_id": DEFAULT_TENANT}}
        )
        logger.info("Backfilled tenant_id on existing admin user")

    # Re-hash password if env ADMIN_PASSWORD has changed (so env is source of truth)
    if not verify_password(ADMIN_PASSWORD, existing.get("password_hash", "")):
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
        )
        logger.info("Updated admin password hash from env")


async def _seed_agents() -> None:
    count = await db.agents.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    agent_types = [
        {"name": "Chief Orchestrator", "type": "chief_orchestrator", "desc": "Event routing and prioritisation"},
        {"name": "Finance Agent", "type": "finance", "desc": "AR monitoring and invoice risk"},
        {"name": "Client Success Agent", "type": "client_success", "desc": "Health monitoring and churn detection"},
        {"name": "Delivery Ops Agent", "type": "delivery_ops", "desc": "Project risk and deadline monitoring"},
        {"name": "Revenue Ops Agent", "type": "revenue_ops", "desc": "Pipeline and upsell signals"},
        {"name": "Compliance Sentinel", "type": "compliance_sentinel", "desc": "Policy and audit monitoring"},
    ]
    for a in agent_types:
        await db.agents.insert_one({
            "id": str(uuid.uuid4()),
            "name": a["name"],
            "agent_type": a["type"],
            "description": a["desc"],
            "status": "active",
            "model": "claude-sonnet-4-5-20250929",
            "auto_execute_threshold": 0.85,
            "run_count": 0,
            "created_at": now,
        })
    logger.info("Seeded %d agents", len(agent_types))


async def _seed_rate_cards() -> None:
    count = await db.rate_cards.count_documents({})
    if count > 0:
        return
    await db.rate_cards.insert_one({
        "id": str(uuid.uuid4()),
        "client_id": None,
        "name": "Standard Agency Rate",
        "currency": "AUD",
        "effective_from": date.today().isoformat(),
        "effective_to": None,
        "rates": {"hourly": 150.0, "daily": 1200.0, "monthly": 5000.0},
        "overage_rules": {},
        "is_default": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    logger.info("Seeded default rate card")


async def _seed_contract_templates() -> None:
    count = await db.contract_templates.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc).isoformat()
    await db.contract_templates.insert_one({
        "id": str(uuid.uuid4()),
        "name": "Standard SOW",
        "template_type": "sow",
        "body_template": "STATEMENT OF WORK\n\nClient: {{client_name}}\nDate: {{date}}\n\nScope of Work:\n{{scope}}\n\nDeliverables:\n{{deliverables}}\n\nPayment Terms:\n{{payment_terms}}",
        "variables": ["scope", "deliverables", "payment_terms"],
        "version": 1, "is_active": True, "created_at": now,
    })
    await db.contract_templates.insert_one({
        "id": str(uuid.uuid4()),
        "name": "Master Service Agreement",
        "template_type": "msa",
        "body_template": "MASTER SERVICE AGREEMENT\n\nThis Agreement is entered into between cdxi ventures and {{client_name}} on {{date}}.\n\n1. SERVICES: {{services_description}}\n\n2. TERM: This agreement commences on {{start_date}} and continues until terminated.\n\n3. FEES: As per the attached rate card.\n\n4. CONFIDENTIALITY: Both parties agree to maintain confidentiality.",
        "variables": ["services_description", "start_date"],
        "version": 1, "is_active": True, "created_at": now,
    })
    logger.info("Seeded contract templates")
