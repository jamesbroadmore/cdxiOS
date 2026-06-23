import { connectDB } from '@/lib/db';
import { Project } from '@/lib/models';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const createSchema = z.object({
  client_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['planning', 'in_progress', 'completed', 'paused']).optional(),
  budget: z.number().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const projects = await Project.find({ user_id: user.id }).sort({ created_at: -1 });
    return NextResponse.json(projects);
  } catch (error: any) {
    console.error('[cdxi] Get projects error:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
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

    const project = new Project({
      user_id: user.id,
      ...data,
    });

    await project.save();
    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    console.error('[cdxi] Create project error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
