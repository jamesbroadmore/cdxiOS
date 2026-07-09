import { getSql } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  agent_id: z.string().uuid(),
  title: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sql = getSql();
    const conversations = await sql`
      SELECT * FROM conversations WHERE user_id = ${user.id} ORDER BY updated_at DESC`;
    return NextResponse.json(conversations);
  } catch (error: unknown) {
    console.error('[cdxi] Get conversations error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
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
      INSERT INTO conversations (user_id, agent_id, title, messages)
      VALUES (${user.id}, ${data.agent_id}, ${data.title}, '[]')
      RETURNING *`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Create conversation error:', error);
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
