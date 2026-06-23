# cdxi | OS Deployment Guide

Complete step-by-step guide to deploy cdxi-OS to Vercel with MongoDB and all integrations.

## Pre-Deployment Checklist

### 1. Code Repository
- [x] Code pushed to GitHub: https://github.com/jamesbroadmore/cdxi-OS
- [x] package.json updated with correct scripts
- [x] .env.example provides all required variables
- [x] README.md with setup instructions included

### 2. External Services Setup

#### MongoDB Atlas
1. Go to mongodb.com/atlas and create/login to account
2. Create a new project and cluster (M0 free tier for testing, M2+ for production)
3. Click "Connect" and select "Connect your application"
4. Copy connection string: `mongodb+srv://username:password@cluster.mongodb.net/cdxi_os`
5. Add `?retryWrites=true&w=majority` to connection string
6. Whitelist your IP or use `0.0.0.0/0` for development (NOT production)

#### Anthropic API
1. Go to console.anthropic.com
2. Create account and sign in
3. Navigate to API keys section
4. Create new API key (keep it safe!)
5. Verify billing is enabled for production use

#### Stripe (Optional for Testing)
1. Go to dashboard.stripe.com
2. Create account and sign in
3. Toggle "View test data" in sidebar
4. Copy test keys:
   - Secret Key: `sk_test_...`
   - Publishable Key: `pk_test_...`

### 3. Environment Variables

Generate secure values:

```bash
# Generate 32-character JWT secret
openssl rand -base64 32

# Example values:
JWT_SECRET=abc123def456ghi789jkl012mno345pqr
ADMIN_PASSWORD=SecurePassword123!
```

## Vercel Deployment Steps

### Step 1: Install Vercel CLI
```bash
npm install -g vercel
# or use npx without installing
```

### Step 2: Deploy to Vercel
```bash
cd /path/to/cdxi-OS
vercel deploy
```

Follow the CLI prompts:
- Link to existing project or create new
- Framework: Next.js ✓
- Build command: `next build` ✓
- Output directory: `.next` ✓

### Step 3: Configure Environment Variables

Option A: Via Vercel CLI
```bash
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add JWT_EXPIRY_DAYS
vercel env add ADMIN_EMAIL
vercel env add ADMIN_PASSWORD
vercel env add STRIPE_SECRET_KEY
vercel env add STRIPE_PUBLISHABLE_KEY
vercel env add ANTHROPIC_API_KEY
vercel env add CORS_ORIGINS
vercel env add NEXT_PUBLIC_API_URL
```

Option B: Via Dashboard
1. Go to vercel.com and login
2. Select your project
3. Settings → Environment Variables
4. Add each variable

### Step 4: Set Variables for Production

```env
# MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster0.abc123.mongodb.net/cdxi_os?retryWrites=true&w=majority
DB_NAME=cdxi_os

# Authentication
JWT_SECRET=<output-from-openssl-rand-command>
JWT_EXPIRY_DAYS=7

# Admin Credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=<secure-password>

# Stripe (from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_live_xxx... (for production)
STRIPE_PUBLISHABLE_KEY=pk_live_xxx...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# CORS & URLs
CORS_ORIGINS=https://your-app.vercel.app,https://yourdomain.com
NEXT_PUBLIC_API_URL=https://your-app.vercel.app
```

### Step 5: Redeploy with Environment Variables

```bash
vercel deploy --prod
# or via dashboard: Push to GitHub and auto-deploy triggers
```

## Initial Setup After Deployment

### 1. Verify Deployment
```bash
# Check that your app loads
curl https://your-app.vercel.app

# Should return HTML (not error)
```

### 2. Seed Admin User

Option A: Via curl (if public endpoint exists)
```bash
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@yourdomain.com",
    "password":"<secure-password>",
    "full_name":"Administrator"
  }'
```

Option B: Manual admin creation via MongoDB Atlas
1. Go to MongoDB Atlas → Collections
2. Select `cdxi_os` database → `users` collection
3. Insert document:
```json
{
  "id": "admin-user-1",
  "email": "admin@yourdomain.com",
  "password_hash": "<bcrypt-hashed-password>",
  "full_name": "Administrator",
  "role": "admin",
  "created_at": new Date(),
  "updated_at": new Date()
}
```

### 3. Test Application

1. Navigate to `https://your-app.vercel.app/login`
2. Login with admin credentials
3. Create a test client and project
4. Test AI Copilot chat
5. Verify all pages load correctly

## Troubleshooting Deployment

### Build Errors
```bash
# View logs
vercel logs <deployment-url>

# Common issues:
# - Missing dependencies: npm install before deploying
# - TypeScript errors: npm run build locally first
# - Port issues: Vercel assigns PORT automatically
```

### Runtime Errors
```bash
# Check function logs
vercel logs https://your-app.vercel.app --follow

# Common issues:
# - MongoDB connection: Verify IP whitelist and connection string
# - Missing env vars: Check Vercel dashboard Environment Variables
# - JWT_SECRET too short: Must be 32+ characters
```

### MongoDB Issues
1. Check Atlas network access whitelist
2. Verify connection string includes username:password
3. Test connection locally first
4. Enable "Retry Writes" in connection string

### API 401 Errors
- JWT expired: Clear localStorage and re-login
- Invalid token: Regenerate JWT_SECRET and re-authenticate
- CORS: Check CORS_ORIGINS includes your domain

## Production Monitoring

### Set Up Vercel Analytics
```bash
# Already included in package.json
# Monitoring via: vercel.com dashboard
```

### Set Up Error Tracking
```bash
# Optional: Install Sentry for error monitoring
npm install @sentry/nextjs
```

### Database Backups
1. MongoDB Atlas: Automated daily backups included
2. Enable point-in-time recovery (Atlas M2+)
3. Export backups monthly to secure storage

## Security Best Practices

1. **Rotate Secrets Regularly**
   ```bash
   # Generate new JWT_SECRET monthly
   openssl rand -base64 32
   ```

2. **MongoDB Security**
   - Use strong passwords (16+ chars with symbols)
   - Enable IP whitelist (NOT 0.0.0.0/0)
   - Enable authentication with username/password
   - Use MongoDB encryption at rest

3. **Stripe Security**
   - Use test keys for development
   - Use live keys for production
   - Rotate keys annually
   - Monitor Stripe dashboard for suspicious activity

4. **API Security**
   - Enable CORS only for your domains
   - Rate limit API endpoints (not in base code, add middleware)
   - Validate all inputs on server-side
   - Log all authentication events

5. **Environment Variables**
   - Never commit .env to Git
   - Use GitHub secrets for CI/CD
   - Rotate API keys regularly
   - Use separate keys for dev/staging/production

## Scaling Considerations

### Database
- M0 (free): Dev/test only, 512MB storage
- M2: 2GB storage, suitable for small production
- M5: 10GB storage, suitable for medium production
- M10+: Enterprise features, auto-sharding

### Vercel
- Standard: Included with free tier
- Pro: Recommended for production ($20/month)
- Enterprise: Custom SLA and support

### Performance
- Enable Vercel Analytics for Core Web Vitals
- Monitor MongoDB query performance
- Implement caching layer (Redis optional)
- Use CDN for static assets

## Rollback Plan

If deployment fails:
```bash
# Revert to previous deployment
vercel rollback

# Or redeploy specific commit
git checkout <commit-hash>
vercel deploy --prod
```

## Contact & Support

- Vercel Support: vercel.com/help
- MongoDB Support: mongodb.com/support
- Anthropic Support: console.anthropic.com/support
- Stripe Support: stripe.com/support

---

**Last Updated**: June 2024
**Deployment Status**: Ready for production
