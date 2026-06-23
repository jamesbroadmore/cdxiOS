# cdxi | OS — Test Credentials

## Admin
- **Email:** `parker@cdxi.au`
- **Password:** `220191`
- **Role:** `admin`
- **Default tenant:** `default` (display name: `cdxi`)
- The admin user is **seeded on every backend boot**. If `ADMIN_PASSWORD` in `/app/backend/.env` ever changes, the seeder rotates the hash automatically.

## Brand tenants (seeded on first boot)
| id (slug) | display name |
|---|---|
| `default` | `cdxi` |
| `fourtee2` | `fourtee2` |
| `fleshsesh` | `fleshsesh` |

## Auth
- `POST /api/auth/login` → returns `{access_token, user}`
- `GET  /api/auth/me` (Bearer token)
- `POST /api/auth/logout`
- **Brute-force lockout:** 5 failed attempts on the same email → HTTP 429 for ~15 minutes (in-memory; resets on backend restart).

## Atlas copilot
- `POST /api/copilot/chat` body `{session_id, message, include_workspace?}` returns `{reply}`
- Model: **GPT-5.2** via `EMERGENT_LLM_KEY`
- 45 s server-side timeout
- Per-tenant workspace snapshot auto-injected when `include_workspace` (default true)

## Tenant switching
- Admin can switch via the top-right tenant pill. Backend supports `X-Tenant-Id` header to scope queries.

## Stripe
- `STRIPE_API_KEY=sk_test_emergent` (test mode). Real keys swap into `/app/backend/.env`.

## Smoke check (CLI)
```bash
TOKEN=$(curl -s -X POST $URL/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"parker@cdxi.au","password":"220191"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl -s -H "Authorization: Bearer $TOKEN" $URL/api/tenants | jq
curl -s -H "Authorization: Bearer $TOKEN" $URL/api/dashboard | jq
```
