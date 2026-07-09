import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.warn('DATABASE_URL not defined - database operations will fail at runtime');
}

// Lazily-initialized singleton SQL client (HTTP-based, serverless-friendly).
let _sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  if (!_sql) {
    _sql = neon(DATABASE_URL);
  }
  return _sql;
}
