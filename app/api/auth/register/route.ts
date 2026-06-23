import { connectDB } from '@/lib/db';
import { User } from '@/lib/models';
import { hashPassword, signToken } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  full_name: z.string().min(2),
});

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await req.json();
    const { email, password, full_name } = schema.parse(body);

    // Check if user exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password_hash: hashPassword(password),
      full_name,
      role: 'user',
    });

    await user.save();

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
  } catch (error: any) {
    console.error('[cdxi] Registration error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
