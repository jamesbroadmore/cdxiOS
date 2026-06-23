import { connectDB } from '@/lib/db';
import { Contact } from '@/lib/models';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  client_id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get('client_id');

    let query: any = {};
    if (clientId) {
      query.client_id = clientId;
    }

    const contacts = await Contact.find(query).sort({ created_at: -1 });
    return NextResponse.json(contacts);
  } catch (error: any) {
    console.error('[cdxi] Get contacts error:', error);
    return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 });
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

    const contact = new Contact(data);
    await contact.save();
    return NextResponse.json(contact, { status: 201 });
  } catch (error: any) {
    console.error('[cdxi] Create contact error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
