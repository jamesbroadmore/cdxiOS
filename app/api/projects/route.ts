import { getSql } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['planning', 'in_progress', 'completed', 'paused']).optional(),
  budget: z.number().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSql();
    const projects = await sql`
      SELECT * FROM projects WHERE user_id = ${user.id} ORDER BY created_at DESC`;
    return NextResponse.json(projects);
  } catch (error: unknown) {
    console.error('[cdxi] Get projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
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

    // Ensure the client belongs to this user before attaching a project.
    const owned = await sql`
      SELECT id FROM clients WHERE id = ${data.client_id} AND user_id = ${user.id}`;
    if (owned.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const rows = await sql`
      INSERT INTO projects (user_id, client_id, name, description, status, budget, start_date, end_date)
      VALUES (
        ${user.id}, ${data.client_id}, ${data.name}, ${data.description ?? ''},
        ${data.status ?? 'planning'}, ${data.budget ?? 0},
        ${data.start_date ?? null}, ${data.end_date ?? null}
      )
      RETURNING *`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Create project error:', error);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
