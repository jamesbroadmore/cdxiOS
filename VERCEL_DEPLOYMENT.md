# 🚀 Vercel Deployment Checklist & Guide

**Status**: Production-ready for Vercel deployment  
**Last Updated**: 2026-07-07  
**Time to Deploy**: ~20 minutes

---

## Pre-Deployment Verification

### 1. Local Build Test ✓
```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# Build check
pnpm build

# Type check
pnpm tsc --noEmit

# Lint check (optional, non-blocking)
pnpm lint
```

**Expected Output**:
- ✓ No TypeScript errors
- ✓ Build completes in < 90 seconds
- ✓ `.next/` directory created

---

## External Services Setup

### 2. MongoDB Atlas
- [ ] Account created at [mongodb.com/atlas](https://mongodb.com/atlas)
- [ ] Cluster deployed (M2+ recommended for production)
- [ ] Database user created with strong password
- [ ] Network access configured:
  - Development: Whitelist your IP (e.g., `203.0.113.42/32`)
  - Production: Use Vercel IP allowlist or `0.0.0.0/0` (not recommended)
  - OR: Use connection string with allowlist all IPs

**Connection String Format**:
```
mongodb+srv://username:password@cluster0.abc123.mongodb.net/cdxi_os?retryWrites=true&w=majority
```

**Verify Connection**:
```bash
# Test locally
MONGODB_URI="your-connection-string" pnpm build
```

### 3. Anthropic API
- [ ] Account created at [console.anthropic.com](https://console.anthropic.com)
- [ ] API key generated (starts with `sk-ant-`)
- [ ] Billing enabled and verified
- [ ] Model available: `claude-3-5-sonnet-20241022`

**Test API Key**:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model": "claude-3-5-sonnet-20241022", "max_tokens": 100, "messages": [{"role": "user", "content": "test"}]}'
```

### 4. Stripe (Optional)
- [ ] Account created at [dashboard.stripe.com](https://dashboard.stripe.com)
- [ ] Test keys obtained (or live keys for production)
- [ ] Format: `sk_test_xxx` and `pk_test_xxx`

---

## Environment Variables Setup

### 5. Generate Secure Values
```bash
# Generate 32+ character JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET"

# Example admin password (generate your own)
ADMIN_PASSWORD="YourSecurePassword123!"
```

### 6. Prepare Environment Variables
Create this list (don't commit to git):

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cdxi_os?retryWrites=true&w=majority

# Authentication (32+ chars for JWT_SECRET)
JWT_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz1234567890
JWT_EXPIRY_DAYS=7

# Admin User (created on first deploy)
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=YourSecurePassword123!

# Stripe (test or live)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# URLs & CORS
CORS_ORIGINS=https://cdxios.vercel.app,https://yourdomain.com
NEXT_PUBLIC_API_URL=https://cdxios.vercel.app
```

---

## Vercel Deployment

### 7. Install Vercel CLI
```bash
npm install -g vercel
# or use without installing:
# npx vercel
```

### 8. Initial Deployment
```bash
# From project root
vercel --prod

# Follow prompts:
# - Link to GitHub? → Yes
# - GitHub repo? → jamesbroadmore/cdxiOS
# - Framework? → Next.js
# - Build command? → pnpm build
# - Output directory? → .next
```

**After first deploy**, note your deployment URL:
```
https://cdxios.vercel.app
```

### 9. Add Environment Variables to Vercel

**Option A: Via CLI (Recommended)**
```bash
vercel env add --prod MONGODB_URI
vercel env add --prod JWT_SECRET
vercel env add --prod JWT_EXPIRY_DAYS
vercel env add --prod ADMIN_EMAIL
vercel env add --prod ADMIN_PASSWORD
vercel env add --prod STRIPE_SECRET_KEY
vercel env add --prod STRIPE_PUBLISHABLE_KEY
vercel env add --prod ANTHROPIC_API_KEY
vercel env add --prod CORS_ORIGINS
vercel env add --prod NEXT_PUBLIC_API_URL
```

**Option B: Via Dashboard**
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project: `cdxiOS`
3. Settings → Environment Variables
4. Add each variable for `Production` environment

### 10. Production Redeploy
```bash
vercel deploy --prod

# Or just push to main branch (if GitHub linked)
git push origin main
```

**Wait for deployment** → Check Vercel dashboard for completion

---

## Post-Deployment Verification

### 11. Health Check
```bash
# Test endpoint (should return HTML, not error)
curl https://cdxios.vercel.app

# Check build logs
vercel logs https://cdxios.vercel.app
```

### 12. Create Admin User
Once deployment succeeds, seed the admin user:

**Option A: Via API (if auth endpoint is public)**
```bash
curl -X POST https://cdxios.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@yourdomain.com",
    "password":"YourSecurePassword123!",
    "full_name":"Administrator"
  }'
```

**Option B: Via MongoDB Atlas (Recommended)**
1. Open MongoDB Atlas → Collections
2. Select database `cdxi_os` → collection `users`
3. Insert one document:
```json
{
  "id": "admin-user-1",
  "email": "admin@yourdomain.com",
  "password_hash": "$2a$10$...",
  "full_name": "Administrator",
  "role": "admin",
  "created_at": {"$date": "2026-07-07T00:00:00.000Z"},
  "updated_at": {"$date": "2026-07-07T00:00:00.000Z"}
}
```

> **Note**: Use `bcrypt` to hash the password. For testing, use Node:
> ```javascript
> const bcrypt = require('bcryptjs');
> const hash = bcrypt.hashSync('YourPassword123!', 10);
> console.log(hash);
> ```

**Option C: Use Seed Script (Local Only)**
```bash
# Local development only - connects to MongoDB and seeds admin
MONGODB_URI="your-connection-string" \
ADMIN_EMAIL="admin@yourdomain.com" \
ADMIN_PASSWORD="YourSecurePassword123!" \
  npm run seed
```

### 13. Application Test
1. **Navigate to app**: https://cdxios.vercel.app
2. **Login page loads**: ✓
3. **Login with credentials**:
   - Email: `admin@yourdomain.com`
   - Password: `YourSecurePassword123!`
4. **Dashboard loads**: ✓
5. **Create test client**: Name, email, company
6. **Create test project**: Link to client
7. **Test AI Copilot**: 
   - Click "Copilot"
   - Choose agent (e.g., "Research Agent")
   - Send message: "Hello, can you help?"
   - Should receive Claude response

---

## Monitoring & Maintenance

### 14. Set Up Monitoring
```bash
# View real-time logs
vercel logs https://cdxios.vercel.app --follow

# View analytics
# → https://vercel.com/dashboard/cdxios → Analytics
```

### 15. Configure Auto-Deploy
1. **Settings** → **Git** → **Vercel for GitHub**
2. Enable: "Deploy on push to main"
3. Now: Every `git push origin main` triggers deployment

### 16. Backup Strategy
- **MongoDB**: Automated daily backups in Atlas
- **Code**: All commits in GitHub
- **Secrets**: Stored in Vercel environment (encrypted)

---

## Troubleshooting

### Build Fails
```bash
# Check logs
vercel logs https://cdxios.vercel.app

# Common causes:
# - Missing env vars → Check Vercel dashboard
# - TypeScript errors → Run `pnpm build` locally
# - Dependency issues → Run `pnpm install` locally
```

### API 500 Errors
```bash
# Check function logs
vercel logs https://cdxios.vercel.app --follow

# Common causes:
# - MongoDB connection: IP whitelist issue
# - JWT_SECRET too short: Must be 32+ chars
# - API key invalid: Anthropic, Stripe credentials
```

### Cannot Connect to MongoDB
1. **Check connection string** includes username and password
2. **Verify IP whitelist** in MongoDB Atlas → Network Access
3. **Test locally first**: `pnpm dev` with same connection string
4. **Enable Retry Writes** in connection string (already in template)

### JWT Token Errors
```bash
# Issue: "JWT_SECRET must be at least 32 characters long"
# Solution: Generate new secret
openssl rand -base64 32

# Then update in Vercel:
vercel env add --prod JWT_SECRET <new-secret>
vercel deploy --prod
```

### CORS Errors
- **Error**: "Cross-Origin Request Blocked"
- **Check**: `CORS_ORIGINS` includes your domain
- **Update**: 
  ```
  vercel env add --prod CORS_ORIGINS "https://cdxios.vercel.app,https://yourdomain.com"
  ```

---

## Rollback Plan

If deployment has issues:

```bash
# Revert to previous deployment
vercel rollback

# Or redeploy specific commit
git checkout <commit-hash>
git push origin main
```

---

## Security Checklist

- [ ] JWT_SECRET is 32+ characters and unique
- [ ] MongoDB password is 16+ characters with symbols
- [ ] IP whitelist configured in MongoDB (not `0.0.0.0/0`)
- [ ] Stripe test keys used for testing (live keys for production)
- [ ] API keys never committed to git
- [ ] `.env.local` in `.gitignore`
- [ ] CORS_ORIGINS restricted to your domains
- [ ] SSL/TLS enabled (automatic with Vercel)

---

## Scaling Considerations

### Database
- **M0** (free): Dev only, 512MB
- **M2**: 2GB, suitable for small production
- **M5**: 10GB, suitable for medium production
- **M10+**: Enterprise features, auto-sharding

### Vercel
- **Free**: Good for testing
- **Pro** ($20/month): Recommended for production
- **Enterprise**: Custom SLA

### Performance
- Enable Vercel Analytics: ✓ (included in `package.json`)
- Monitor Core Web Vitals: → vercel.com dashboard
- Database indexes: Already configured in `lib/models.ts`

---

## Support & Help

- **Vercel Docs**: https://vercel.com/docs
- **Vercel Support**: https://vercel.com/help
- **MongoDB Support**: https://mongodb.com/support
- **Anthropic Docs**: https://docs.anthropic.com

---

**You're ready for production! 🎉**

Next: Push to GitHub and verify deployment via Vercel dashboard.
