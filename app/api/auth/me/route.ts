import { connectDB } from '@/lib/db';
import { User } from '@/lib/models';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await User.findOne({ id: user.id });
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: dbUser.id,
      email: dbUser.email,
      full_name: dbUser.full_name,
      role: dbUser.role,
    });
  } catch (error: any) {
    console.error('[cdxi] Me endpoint error:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
