"""cdxi | OS — Reseed CLI for demo / local environments.

Usage:
    python backend/scripts/reseed.py            # add demo data (idempotent)
    python backend/scripts/reseed.py --wipe     # wipe + reseed
    python backend/scripts/reseed.py --wipe-only
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, date, timezone
from pathlib import Path

# Make backend/ importable when run from /app
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

DEFAULT_TENANT = "default"

# Collections that hold tenant data (not users/agents/templates)
TENANT_COLLECTIONS = [
    "clients", "contacts", "client_notes",
    "projects", "tasks", "milestones", "change_requests",
    "timers", "usage_events", "invoices", "contracts",
    "agent_runs", "audit_log", "payment_transactions", "approvals",
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def wipe(db) -> None:
    for c in TENANT_COLLECTIONS:
        r = await db[c].delete_many({})
        print(f"  • wiped {c}: {r.deleted_count}")


async def seed_demo(db, tenant_id: str = DEFAULT_TENANT) -> None:
    """Idempotent demo seed — skips if any clients already exist for the tenant."""
    existing = await db.clients.count_documents({"tenant_id": tenant_id})
    if existing > 0:
        print(f"  • clients already exist for tenant={tenant_id} (n={existing}); skipping demo seed")
        return

    now = _now()

    # Client 1: Christian Dix / m8s Rates
    c1 = str(uuid.uuid4())
    p1 = str(uuid.uuid4())
    await db.clients.insert_one({
        "id": c1, "tenant_id": tenant_id,
        "name": "Christian Dix", "email": "christian@m8srates.com",
        "billing_model": "hourly", "lifecycle_stage": "active", "status": "active",
        "primary_currency": "AUD", "tags": ["web", "branding"],
        "health_score": 78.0, "profitability_score": 65.0,
        "trading_name": "m8s Rates", "created_at": now, "updated_at": now,
    })
    await db.projects.insert_one({
        "id": p1, "tenant_id": tenant_id, "client_id": c1,
        "name": "m8s rates", "status": "active",
        "project_type": "service", "budget": 3300.0, "total_amount": 3300.0,
        "budget_spent": 2200.0, "risk_level": "low",
        "created_at": now, "updated_at": now,
    })
    for m in [
        {"name": "Discovery & Strategy", "amount": 1100.0, "due_date": "2026-01-15", "order": 0, "payment_status": "paid",   "completed": True},
        {"name": "Design System",        "amount": 1100.0, "due_date": "2026-03-01", "order": 1, "payment_status": "paid",   "completed": True},
        {"name": "Development Build",    "amount": 1100.0, "due_date": "2026-04-29", "order": 2, "payment_status": "unpaid", "completed": False},
    ]:
        await db.milestones.insert_one({"id": str(uuid.uuid4()), "project_id": p1, "created_at": now, **m})

    # Client 2: Bianca Scott / Cosmic Blueprint
    c2 = str(uuid.uuid4())
    p2 = str(uuid.uuid4())
    await db.clients.insert_one({
        "id": c2, "tenant_id": tenant_id,
        "name": "Bianca Scott", "email": "bianca@cosmicblueprint.co",
        "billing_model": "fixed", "lifecycle_stage": "active", "status": "active",
        "primary_currency": "AUD", "tags": ["strategy", "coaching"],
        "health_score": 95.0, "profitability_score": 82.0,
        "created_at": now, "updated_at": now,
    })
    await db.projects.insert_one({
        "id": p2, "tenant_id": tenant_id, "client_id": c2,
        "name": "Cosmic Blueprint", "status": "delivered",
        "project_type": "fixed_price", "budget": 2400.0, "total_amount": 2400.0,
        "budget_spent": 2400.0, "risk_level": "low",
        "created_at": now, "updated_at": now,
    })
    for m in [
        {"name": "Blueprint Intake", "amount": 800.0, "due_date": "2025-11-10", "order": 0, "payment_status": "paid", "completed": True},
        {"name": "Chart Synthesis",  "amount": 800.0, "due_date": "2025-12-05", "order": 1, "payment_status": "paid", "completed": True},
        {"name": "Final Delivery",   "amount": 800.0, "due_date": "2026-01-20", "order": 2, "payment_status": "paid", "completed": True},
    ]:
        await db.milestones.insert_one({"id": str(uuid.uuid4()), "project_id": p2, "created_at": now, **m})

    # Demo overdue invoice (so workflow demo + Stripe Pay button have something to chew on)
    await db.invoices.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id,
        "client_id": c1, "invoice_number": "INV-DEMO-001",
        "status": "overdue", "total_amount": 1100.0, "balance_due": 1100.0,
        "subtotal": 1100.0, "tax_amount": 0.0, "amount_paid": 0.0,
        "currency": "AUD",
        "issued_at": "2026-02-01T00:00:00+00:00",
        "due_date": "2026-02-15",
        "line_items": [{"description": "Development Build M3", "amount": 1100.0}],
        "created_at": now, "updated_at": now,
    })

    print(f"  • seeded 2 clients, 2 projects, 6 milestones, 1 overdue invoice (tenant={tenant_id})")


async def main() -> int:
    parser = argparse.ArgumentParser(description="cdxi | OS reseed utility")
    parser.add_argument("--wipe", action="store_true", help="Wipe tenant data before seeding")
    parser.add_argument("--wipe-only", action="store_true", help="Wipe only, do not seed")
    parser.add_argument("--tenant", default=DEFAULT_TENANT, help="Tenant id to seed for (default: 'default')")
    args = parser.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("ERROR: MONGO_URL and DB_NAME env vars are required.", file=sys.stderr)
        print("Run with: MONGO_URL=mongodb://localhost:27017 DB_NAME=<db> python backend/scripts/reseed.py", file=sys.stderr)
        return 2
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    try:
        print(f"cdxi | OS reseed — db={db_name}  tenant={args.tenant}")
        if args.wipe or args.wipe_only:
            print("Wiping tenant data…")
            await wipe(db)
        if not args.wipe_only:
            print("Seeding demo data…")
            await seed_demo(db, tenant_id=args.tenant)
        print("Done.")
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
