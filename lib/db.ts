import { neon } from '@neondatabase/serverless';

const DATABASE_URL = process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.warn('DATABASE_URL not defined - database operations will fail at runtime');
}

// Row type returned by queries: an array of plain records.
export type Row = Record<string, any>;

// Tagged-template SQL function that always resolves to an array of rows.
export type Sql = (strings: TemplateStringsArray, ...values: any[]) => Promise<Row[]>;

// Lazily-initialized singleton SQL client (HTTP-based, serverless-friendly).
let _sql: Sql | null = null;

export function getSql(): Sql {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  if (!_sql) {
    _sql = neon(DATABASE_URL) as unknown as Sql;
  }
  return _sql;
}
