# cdxi | OS — PRD

**Version**: v2.3-merged · **Updated**: Jun 2026
**Status**: Beta-ready

## Purpose
cdxi | OS is the internal operating system used to run cdxi and its brands (`cdxi`, `fourtee2`, `fleshsesh`). It unifies CRM, project delivery, billing (time + invoices + Stripe), contracts, an AI agent ops layer, and the Atlas AI copilot in a single tenant-scoped control layer.

## Architecture
- **Backend** — FastAPI (`/app/backend/server.py`, ~2700 lines) + MongoDB (`cdxi_os`)
- **Frontend** — React (CRA + craco), Tailwind, shadcn/ui, sonner, Inter + Righteous + JetBrains Mono
- **Auth** — JWT bearer; bcrypt; brute-force lockout (5 fails / 15 min)
- **Multi-tenant** — tenants table; admin can switch; resource endpoints scope to `user.tenant_id` or override with `X-Tenant-Id` header
- **AI** — Internal agents (Claude Sonnet 4.5 via Emergent Universal Key) + Atlas copilot (GPT-5.2)
- **Payments** — Stripe Checkout + webhook (test mode by default)

## Brand identity (locked)
- Wordmark: `cdxi` (lowercase, no chrome)
- Display typeface: **Righteous** — reserved for brand moments only
- Body: **Inter** with system fallback
- Mono: **JetBrains Mono**
- Style: text-led, simple, confident — no gradients, badges, or icon marks

## Modules shipped (beta)
- **Atlas Command Centre** (`/`) — KPIs, recent activity, agent run feed, client health distribution
- **Clients** (`/clients`) — full CRM with contacts, notes, health, lifecycle stage
- **Projects** (`/projects`) — projects + tasks + milestones + change requests
- **Time & Billing** (`/billing`) — timers, usage events, invoices, rate cards, invoice generation, Stripe Checkout
- **Contracts** (`/contracts`) — templates + generation + approvals
- **AI Ops** (`/agents`) — 6 seeded agents (Chief Orchestrator, Finance, Client Success, Delivery Ops, Revenue Ops, Compliance Sentinel), review queue, workflow demo, run history
- **Settings** (`/settings`) — users & roles (RBAC), tenants, rate cards, audit log
- **Atlas dock** (⌘ + /) — slide-out GPT-5.2 chat scoped to active brand
- **Command palette** (⌘ + K) — live search of clients / projects / invoices + navigation

## Brand-tenants seeded on first boot
1. `cdxi` (id `default`)
2. `fourtee2`
3. `fleshsesh`

## Credentials
- Admin: `parker@cdxi.au` / `220191` (auto-seeded; password rotates from `.env` on boot)

## Testing
- Backend: **24/24 pytest tests pass** including live GPT-5.2 copilot round-trip and full CRUD across every module. Report: `/app/test_reports/iteration_2.json`
- Frontend: smoke-tested across all routes; no console errors.

## What changed in this build vs the upstream portal
1. Seeder now creates 3 brand tenants (cdxi/fourtee2/fleshsesh) instead of just `default`
2. New `/api/copilot/chat` endpoint — Atlas (GPT-5.2) with per-tenant snapshot
3. Brand polish: Righteous wordmark, Inter body, no gradients/glow
4. Redesigned sidebar with logical sections (Operate / Money / Intelligence / System)
5. Top bar: Atlas + ⌘K shortcuts
6. Brute-force login lockout (5 / 15 min)
7. Atlas LLM call has 45 s server-side timeout

## Open backlog (post-beta)
### P0
- Split `server.py` into routers per domain
- Migrate `@app.on_event("startup")` → FastAPI `lifespan`
- Plug in real Stripe keys for production
- Lock CORS to explicit origins for credentialed traffic

### P1
- Per-tenant rate limits on `/api/copilot/chat`
- Persistent Atlas session memory across page reloads
- Document the milestone "must be paid before completed" rule in the UI
- Mobile sidebar polish (responsive tests)
- Audit log: alias `event_name` ↔ `action` for cross-team clarity

### P2
- Public client portal (`/portal/{share_token}`) — port from earlier cdxi-OS draft
- Marketplace / installable modules
- SSO / MFA
