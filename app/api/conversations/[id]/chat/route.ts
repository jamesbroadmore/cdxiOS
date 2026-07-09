import { getSql } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { z } from 'zod';

const messageSchema = z.object({
  content: z.string().min(1),
});

type Message = { role: 'user' | 'assistant'; content: string; timestamp: string };
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { content } = messageSchema.parse(body);

    const sql = getSql();
    const convRows = await sql`
      SELECT * FROM conversations WHERE id = ${id} AND user_id = ${user.id}`;
    const conversation = convRows[0];
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const agentRows = await sql`
      SELECT * FROM agents WHERE id = ${conversation.agent_id}`;
    const agent = agentRows[0];
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const history: Message[] = Array.isArray(conversation.messages)
      ? conversation.messages
      : [];

    const userMessage: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    const { text } = await generateText({
      model: agent.model || 'anthropic/claude-sonnet-4.5',
      system: agent.system_prompt,
      messages: [...history, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const assistantMessage: Message = {
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...history, userMessage, assistantMessage];

    const updated = await sql`
      UPDATE conversations
      SET messages = ${JSON.stringify(updatedMessages)}, updated_at = now()
      WHERE id = ${id}
      RETURNING *`;

    return NextResponse.json({
      message: text,
      conversation: updated[0],
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    console.error('[cdxi] Chat error:', error);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
