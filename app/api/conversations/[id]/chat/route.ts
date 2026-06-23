import { connectDB } from '@/lib/db';
import { Conversation, Agent } from '@/lib/models';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

const messageSchema = z.object({
  content: z.string().min(1),
});

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { content } = messageSchema.parse(body);

    // Fetch conversation
    const conversation = await Conversation.findOne({
      id: params.id,
      user_id: user.id,
    });

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Fetch agent
    const agent = await Agent.findOne({ id: conversation.agent_id });
    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Add user message to history
    conversation.messages.push({
      role: 'user',
      content,
      timestamp: new Date(),
    });

    // Prepare messages for API
    const messages = conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    // Call Claude
    const response = await client.messages.create({
      model: agent.model,
      max_tokens: 1024,
      system: agent.system_prompt,
      messages: messages.filter((m) => m.role !== 'system'),
    });

    const assistantMessage =
      response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate response';

    // Add assistant response to history
    conversation.messages.push({
      role: 'assistant',
      content: assistantMessage,
      timestamp: new Date(),
    });

    await conversation.save();

    return NextResponse.json({
      message: assistantMessage,
      conversation: conversation.toObject(),
    });
  } catch (error: any) {
    console.error('[cdxi] Chat error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}
