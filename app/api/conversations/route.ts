import { connectDB } from '@/lib/db';
import { Conversation } from '@/lib/models';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  agent_id: z.string().min(1),
  title: z.string().min(1),
});

const messageSchema = z.object({
  content: z.string().min(1),
});

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const conversations = await Conversation.find({ user_id: user.id }).sort({ updated_at: -1 });
    return NextResponse.json(conversations);
  } catch (error: any) {
    console.error('[cdxi] Get conversations error:', error);
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
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

    const conversation = new Conversation({
      user_id: user.id,
      ...data,
      messages: [],
    });

    await conversation.save();
    return NextResponse.json(conversation, { status: 201 });
  } catch (error: any) {
    console.error('[cdxi] Create conversation error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
  }
}
