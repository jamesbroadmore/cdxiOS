# Quick Start — cdxi | OS

## Local Development (5 minutes)

### 1. Clone & Install
```bash
git clone https://github.com/jamesbroadmore/cdxi-OS.git
cd cdxi-OS
pnpm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local with:
# - Your MongoDB connection string
# - Your JWT secret (use: openssl rand -base64 32)
# - Your Anthropic API key
# - Your Stripe keys (optional for dev)
```

### 3. Run Development Server
```bash
pnpm dev
# Opens http://localhost:3000
```

### 4. Login
- Email: `admin@cdxi.io`
- Password: `demo123456`

---

## Production Deployment (15 minutes)

### 1. Prerequisites
- [ ] GitHub account (repo already created)
- [ ] Vercel account (vercel.com)
- [ ] MongoDB Atlas account (mongodb.com)
- [ ] Anthropic API key (console.anthropic.com)
- [ ] Stripe API keys (dashboard.stripe.com) — optional

### 2. Deploy to Vercel
```bash
npm install -g vercel  # or use: npx vercel
vercel deploy --prod
```

### 3. Set Environment Variables
```bash
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add ANTHROPIC_API_KEY
vercel env add STRIPE_SECRET_KEY
vercel env add ADMIN_EMAIL
vercel env add ADMIN_PASSWORD
```

Or manually in dashboard:
- vercel.com → Select project → Settings → Environment Variables

### 4. Redeploy
```bash
vercel deploy --prod
# Or push to main branch for auto-deploy
```

---

## First Time Setup

### After First Deploy:
1. Visit `https://your-app.vercel.app/login`
2. Login with your admin credentials
3. Dashboard loads → Create test client
4. Create test project
5. Test Copilot chat → Choose an agent

---

## Common Issues

### "MongoDB connection failed"
- Check connection string includes username:password
- Verify IP is whitelisted in MongoDB Atlas
- Test locally with `pnpm dev` first

### "Cannot find module"
```bash
pnpm install
pnpm build
```

### "Anthropic API error"
- Verify API key is valid at console.anthropic.com
- Check that billing is enabled
- Rate limit may be exceeded (upgrade plan)

### "Port already in use"
```bash
# Stop other dev servers or use:
pnpm dev -p 3001
```

---

## Project Structure Quick Reference

```
src/
├── app/
│   ├── (auth)/        ← Login/register pages
│   ├── (app)/         ← Protected routes
│   └── api/           ← Backend endpoints
├── lib/
│   ├── models.ts      ← Database schemas
│   ├── auth.ts        ← JWT utilities
│   └── db.ts          ← MongoDB connection
└── components/ui/     ← UI components
```

---

## Key Commands

```bash
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm start            # Run production build
pnpm lint             # Check code quality
npm run seed          # Seed database (local only)
```

---

## Feature Walkthrough

### Dashboard
- View KPIs: Clients, projects, tasks, revenue
- See recent activity
- Quick actions: New client, new project

### Clients (CRM)
- View all clients with status
- Click to view details
- Add new clients
- Track client relationships

### Copilot (AI)
- Select an agent (Research, Writer, Developer, etc.)
- Chat with AI in real-time
- Save conversation history
- Switch between agents

### Billing
- View revenue metrics
- See recent invoices
- Track payment status
- (Stripe integration ready)

---

## Need Help?

- **Setup Issues**: See README.md
- **Deployment Issues**: See DEPLOYMENT.md
- **API Docs**: Check app/api/* files
- **Database**: See lib/models.ts

---

**Ready to deploy?** Follow DEPLOYMENT.md for full production setup.

**Questions?** Check PROJECT_SUMMARY.md for architecture details.
