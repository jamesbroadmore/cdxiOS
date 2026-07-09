import { getSql } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('client_id');

    const sql = getSql();
    // Only return contacts belonging to clients owned by this user.
    const contacts = clientId
      ? await sql`
          SELECT co.* FROM contacts co
          JOIN clients cl ON cl.id = co.client_id
          WHERE cl.user_id = ${user.id} AND co.client_id = ${clientId}
          ORDER BY co.created_at DESC`
      : await sql`
          SELECT co.* FROM contacts co
          JOIN clients cl ON cl.id = co.client_id
          WHERE cl.user_id = ${user.id}
          ORDER BY co.created_at DESC`;

    return NextResponse.json(contacts);
  } catch (error: unknown) {
    console.error('[cdxi] Get contacts error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
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

    // Ensure the client belongs to this user.
    const owned = await sql`
      SELECT id FROM clients WHERE id = ${data.client_id} AND user_id = ${user.id}`;
    if (owned.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const rows = await sql`
      INSERT INTO contacts (client_id, name, email, phone, role)
      VALUES (${data.client_id}, ${data.name}, ${data.email}, ${data.phone ?? ''}, ${data.role ?? ''})
      RETURNING *`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Create contact error:', error);
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
