import { connectDB } from '@/lib/db';
import { Agent } from '@/lib/models';
import { getAuthUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// Default agents seed data
const DEFAULT_AGENTS = [
  {
    name: 'Research Agent',
    role: 'research',
    description: 'Specialized in gathering and analyzing information',
    system_prompt: 'You are a research specialist. Your role is to gather, analyze, and synthesize information from various sources to provide comprehensive insights.',
    tools: ['web_search', 'data_analysis'],
  },
  {
    name: 'Writing Agent',
    role: 'writer',
    description: 'Expert copywriter and content creator',
    system_prompt: 'You are a professional copywriter and content creator. Create engaging, clear, and compelling content tailored to the audience.',
    tools: ['drafting', 'editing'],
  },
  {
    name: 'Code Agent',
    role: 'developer',
    description: 'Full-stack developer assistant',
    system_prompt: 'You are an expert full-stack developer. Help with code design, implementation, debugging, and optimization.',
    tools: ['code_analysis', 'testing'],
  },
  {
    name: 'Project Manager',
    role: 'project_manager',
    description: 'Oversees project planning and execution',
    system_prompt: 'You are a skilled project manager. Help with planning, scheduling, resource allocation, and risk management.',
    tools: ['planning', 'scheduling'],
  },
  {
    name: 'Sales Agent',
    role: 'sales',
    description: 'Revenue-focused business development specialist',
    system_prompt: 'You are a sales expert. Help identify opportunities, close deals, and grow revenue through strategic initiatives.',
    tools: ['lead_scoring', 'opportunity_analysis'],
  },
  {
    name: 'Support Agent',
    role: 'support',
    description: 'Customer success and support specialist',
    system_prompt: 'You are a customer support specialist. Provide excellent support, resolve issues, and ensure customer satisfaction.',
    tools: ['ticketing', 'knowledge_base'],
  },
];

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const user = getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let agents = await Agent.find({}).sort({ created_at: 1 });
    
    // Seed default agents if none exist
    if (agents.length === 0) {
      agents = await Agent.insertMany(
        DEFAULT_AGENTS.map((a) => ({
          ...a,
          model: 'claude-3-5-sonnet-20241022',
        }))
      );
    }

    return NextResponse.json(agents);
  } catch (error: any) {
    console.error('[cdxi] Get agents error:', error);
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}
