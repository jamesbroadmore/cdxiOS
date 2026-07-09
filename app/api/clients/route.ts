import { getSql } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  status: z.enum(['active', 'inactive', 'prospect']).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSql();
    const clients = await sql`
      SELECT * FROM clients WHERE user_id = ${user.id} ORDER BY created_at DESC`;
    return NextResponse.json(clients);
  } catch (error: unknown) {
    console.error('[cdxi] Get clients error:', error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const data = createSchema.parse(body);

    const sql = getSql();
    const rows = await sql`
      INSERT INTO clients (user_id, name, email, phone, company, industry, status, notes)
      VALUES (
        ${user.id}, ${data.name}, ${data.email}, ${data.phone ?? ''},
        ${data.company ?? ''}, ${data.industry ?? ''},
        ${data.status ?? 'prospect'}, ${data.notes ?? ''}
      )
      RETURNING *`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Create client error:', error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}
