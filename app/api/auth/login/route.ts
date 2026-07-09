import { getSql } from '@/lib/db';
import { verifyPassword, signToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const body = await req.json();
    const { email, password } = schema.parse(body);

    const rows = await sql`
      SELECT id, email, password_hash, full_name, role
      FROM users WHERE email = ${email.toLowerCase()}`;
    const user = rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      access_token: token,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
