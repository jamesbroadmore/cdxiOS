import { getSql } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  status: z.enum(['active', 'inactive', 'prospect']).optional(),
  notes: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM clients WHERE id = ${id} AND user_id = ${user.id}`;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error: unknown) {
    console.error('[cdxi] Get client error:', error);
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const data = updateSchema.parse(body);

    const sql = getSql();
    const rows = await sql`
      UPDATE clients SET
        name = COALESCE(${data.name ?? null}, name),
        email = COALESCE(${data.email ?? null}, email),
        phone = COALESCE(${data.phone ?? null}, phone),
        company = COALESCE(${data.company ?? null}, company),
        industry = COALESCE(${data.industry ?? null}, industry),
        status = COALESCE(${data.status ?? null}, status),
        notes = COALESCE(${data.notes ?? null}, notes),
        updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *`;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Update client error:', error);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const sql = getSql();
    const rows = await sql`
      DELETE FROM clients WHERE id = ${id} AND user_id = ${user.id} RETURNING id`;

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[cdxi] Delete client error:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
