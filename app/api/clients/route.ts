import { connectDB } from '@/lib/db';
import { Client } from '@/lib/models';
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
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clients = await Client.find({ user_id: user.id }).sort({ created_at: -1 });
    return NextResponse.json(clients);
  } catch (error: any) {
    console.error('[cdxi] Get clients error:', error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const data = createSchema.parse(body);

    const client = new Client({
      user_id: user.id,
      ...data,
    });

    await client.save();
    return NextResponse.json(client, { status: 201 });
  } catch (error: any) {
    console.error('[cdxi] Create client error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}
