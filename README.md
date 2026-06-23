# cdxi | OS — AI-Native Agency Operating System

Enterprise CRM and AI agent management platform for modern agencies. Built with Next.js 16, MongoDB, Anthropic Claude, and Stripe.

## Features

- **CRM Management**: Clients, projects, contacts, tasks, and milestones
- **AI Copilot**: Six specialized agents (Research, Writer, Developer, PM, Sales, Support)
- **Billing & Invoicing**: Stripe integration for payment processing
- **Real-time Collaboration**: WebSocket-ready architecture
- **Enterprise Auth**: JWT with secure session management
- **Dark Mode**: Modern, professional UI with Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Next.js API Routes, Node.js
- **Database**: MongoDB (Mongoose ODM)
- **AI**: Anthropic Claude API
- **Payments**: Stripe
- **Auth**: JWT + bcryptjs
- **UI**: shadcn/ui, Tailwind CSS v4
- **Deployment**: Vercel

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB database (MongoDB Atlas recommended)
- Environment variables set

### Installation

```bash
# Clone the repository
git clone https://github.com/jamesbroadmore/cdxi-OS.git
cd cdxi-OS

# Install dependencies
pnpm install

# Create .env.local from template
cp .env.example .env.local

# Start development server
pnpm dev
```

### Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/cdxi_os

# Authentication
JWT_SECRET=your-secret-key-min-32-characters-long
JWT_EXPIRY_DAYS=7

# Admin credentials
ADMIN_EMAIL=admin@cdxi.io
ADMIN_PASSWORD=your-secure-password

# Stripe (get from dashboard.stripe.com)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

# Anthropic (get from console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# CORS & URLs
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Project Structure

```
cdxi-OS/
├── app/
│   ├── (auth)/           # Login/Register pages
│   ├── (app)/            # Protected routes (dashboard, CRM)
│   │   ├── dashboard/    # Main dashboard
│   │   ├── clients/      # CRM client management
│   │   ├── projects/     # Project tracking
│   │   ├── copilot/      # AI chat interface
│   │   ├── billing/      # Invoicing & payments
│   │   └── layout.tsx    # App shell with sidebar
│   ├── api/              # Next.js API routes
│   │   ├── auth/         # Authentication endpoints
│   │   ├── clients/      # CRM endpoints
│   │   ├── projects/
│   │   ├── contacts/
│   │   ├── agents/       # AI agents
│   │   └── conversations/ # AI chat history
│   └── layout.tsx        # Root layout
├── lib/
│   ├── db.ts             # MongoDB connection
│   ├── auth.ts           # JWT utilities
│   ├── models.ts         # Mongoose schemas
│   ├── client-auth.ts    # Client-side auth helpers
│   └── api-client.ts     # Fetch wrapper
├── components/ui/        # shadcn/ui components
├── public/               # Static assets
├── .env.example          # Environment template
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

### CRM
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `GET /api/clients/[id]` - Get client details
- `PATCH /api/clients/[id]` - Update client
- `DELETE /api/clients/[id]` - Delete client

- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/contacts` - List contacts
- `POST /api/contacts` - Create contact

### AI & Agents
- `GET /api/agents` - List all agents (auto-seeds defaults)
- `GET /api/conversations` - List user conversations
- `POST /api/conversations` - Start new chat
- `POST /api/conversations/[id]/chat` - Send message to agent

## Deployment

### Vercel Deployment

The app is optimized for Vercel and requires only environment variables to be set:

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy

# Set environment variables in Vercel dashboard or CLI
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add STRIPE_SECRET_KEY
vercel env add ANTHROPIC_API_KEY
```

### Important Deployment Checklist

- [ ] MongoDB Atlas configured and connection string verified
- [ ] JWT_SECRET is at least 32 characters (use `openssl rand -base64 32`)
- [ ] Stripe keys configured and test mode enabled
- [ ] Anthropic API key set and billing configured
- [ ] CORS_ORIGINS updated to production domain
- [ ] NEXT_PUBLIC_API_URL set to production URL
- [ ] All secrets added to Vercel environment

### Production Considerations

1. **Database**: Use MongoDB Atlas with IP whitelist for production
2. **Security**: Enable MongoDB auth, rotate JWT_SECRET regularly
3. **Rate Limiting**: Implement rate limiting on API routes
4. **Monitoring**: Set up Vercel Analytics and error tracking
5. **Backups**: Enable MongoDB automated backups
6. **SSL/TLS**: Vercel provides automatic HTTPS

## Authentication Flow

1. User creates account with email/password (bcryptjs hashing)
2. Backend generates JWT token (7-day expiry by default)
3. Token stored in localStorage on client
4. Requests include `Authorization: Bearer {token}` header
5. 401 responses trigger automatic logout and redirect

## AI Copilot

Six pre-configured agents:

1. **Research Agent** - Data gathering and analysis
2. **Writer** - Content creation and copywriting
3. **Developer** - Code assistance and architecture
4. **Project Manager** - Planning and scheduling
5. **Sales** - Revenue growth and opportunities
6. **Support** - Customer success

Each agent uses Claude 3.5 Sonnet with customized system prompts. Conversations are persisted in MongoDB.

## Database Schema

**Users**: Email, password hash, role (admin/user/agency_owner)
**Clients**: Name, email, company, industry, status, notes
**Projects**: Name, client_id, status, budget, dates
**Tasks**: Title, project_id, priority, due date, status
**Contacts**: Client contacts with roles
**Agents**: Predefined AI agents with prompts
**Conversations**: Chat history with agents

## Development

```bash
# Format code
pnpm lint

# Type check
pnpm tsc --noEmit

# Build for production
pnpm build

# Preview production build locally
pnpm start
```

## Troubleshooting

**MongoDB Connection Error**
- Verify connection string includes username and password
- Check IP address is whitelisted in MongoDB Atlas
- Ensure database name is correct

**JWT Issues**
- JWT_SECRET must be 32+ characters
- Token expires after JWT_EXPIRY_DAYS (default 7)
- Clear localStorage and re-login if needed

**API 401 Responses**
- Token may have expired - re-login required
- Check Authorization header is properly formatted
- Verify token is stored in localStorage

**Anthropic API Errors**
- Verify API key is valid and has billing
- Check rate limits (free tier: limited requests)
- Models available: claude-3-5-sonnet-20241022

## License

Proprietary — cdxi | OS

## Support

For issues, feature requests, or deployment help:
- Check deployment checklist above
- Review environment variables in Vercel dashboard
- Ensure MongoDB connection is active
- Test API endpoints with curl or Postman

---

Built with Next.js, MongoDB, and Anthropic Claude
