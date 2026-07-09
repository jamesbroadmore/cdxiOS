// Shared domain types matching the Neon Postgres schema (scripts/setup-db.mjs).

export interface Client {
  id: string
  name: string
  email: string
  phone: string
  company: string
  industry: string
  status: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id: string
  name: string
  description: string
  status: string
  /** Postgres NUMERIC is serialized as a string. Use Number(budget) before math/formatting. */
  budget: string | number
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  client_id: string
  name: string
  email: string
  phone: string
  role: string
  created_at: string
}

export interface AgentSummary {
  id: string
  name: string
  role: string
  description: string
  model: string
}

export interface ConversationSummary {
  id: string
  agent_id: string
  title: string
  created_at: string
}

/** Extracts a human-readable message from an unknown thrown value. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  return error instanceof Error && error.message ? error.message : fallback
}
