// One-time database setup for cdxi OS on Neon Postgres.
// Run: node --env-file-if-exists=.env.development.local scripts/setup-db.mjs
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

const sql = neon(process.env.DATABASE_URL);

async function main() {
  console.log('[setup] Creating tables...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'prospect',
      notes TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'planning',
      budget NUMERIC NOT NULL DEFAULT 0,
      start_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT 'anthropic/claude-sonnet-4.5',
      system_prompt TEXT NOT NULL,
      tools JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      messages JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
      amount NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      invoice_date TIMESTAMPTZ NOT NULL DEFAULT now(),
      due_date TIMESTAMPTZ NOT NULL,
      stripe_payment_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`CREATE INDEX IF NOT EXISTS idx_clients_user ON clients(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoices(user_id)`;

  console.log('[setup] Tables ready.');

  // Seed super admin (per spec). Change this password after first login.
  const adminEmail = 'parker@cdxi.au';
  const existing = await sql`SELECT id FROM users WHERE email = ${adminEmail}`;
  if (existing.length === 0) {
    const hash = bcrypt.hashSync('22011991', 10);
    await sql`
      INSERT INTO users (email, password_hash, full_name, role)
      VALUES (${adminEmail}, ${hash}, 'Parker', 'admin')`;
    console.log(`[setup] Seeded super admin: ${adminEmail}`);
  } else {
    console.log('[setup] Super admin already exists.');
  }

  // Seed default AI agents.
  const agents = await sql`SELECT id FROM agents LIMIT 1`;
  if (agents.length === 0) {
    const defaults = [
      ['Research Agent', 'research', 'Specialized in gathering and analyzing information', 'You are a research specialist. Your role is to gather, analyze, and synthesize information from various sources to provide comprehensive insights.', ['web_search', 'data_analysis']],
      ['Writing Agent', 'writer', 'Expert copywriter and content creator', 'You are a professional copywriter and content creator. Create engaging, clear, and compelling content tailored to the audience.', ['drafting', 'editing']],
      ['Code Agent', 'developer', 'Full-stack developer assistant', 'You are an expert full-stack developer. Help with code design, implementation, debugging, and optimization.', ['code_analysis', 'testing']],
      ['Project Manager', 'project_manager', 'Oversees project planning and execution', 'You are a skilled project manager. Help with planning, scheduling, resource allocation, and risk management.', ['planning', 'scheduling']],
      ['Sales Agent', 'sales', 'Revenue-focused business development specialist', 'You are a sales expert. Help identify opportunities, close deals, and grow revenue through strategic initiatives.', ['lead_scoring', 'opportunity_analysis']],
      ['Support Agent', 'support', 'Customer success and support specialist', 'You are a customer support specialist. Provide excellent support, resolve issues, and ensure customer satisfaction.', ['ticketing', 'knowledge_base']],
    ];
    for (const [name, role, description, system_prompt, tools] of defaults) {
      await sql`
        INSERT INTO agents (name, role, description, system_prompt, tools)
        VALUES (${name}, ${role}, ${description}, ${system_prompt}, ${JSON.stringify(tools)})`;
    }
    console.log('[setup] Seeded 6 default agents.');
  } else {
    console.log('[setup] Agents already exist.');
  }

  console.log('[setup] Done.');
}

main().catch((err) => {
  console.error('[setup] Failed:', err);
  process.exit(1);
});
