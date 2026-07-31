import { getSql } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['planning', 'in_progress', 'completed', 'paused']).optional(),
  budget: z.number().optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const sql = getSql()
    const rows = await sql`SELECT * FROM projects WHERE id = ${id} AND user_id = ${user.id}`

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (error: unknown) {
    console.error('[cdxi] Get project error:', error)
    return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const data = updateSchema.parse(body)

    const sql = getSql()
    const rows = await sql`
      UPDATE projects SET
        name = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        status = COALESCE(${data.status ?? null}, status),
        budget = COALESCE(${data.budget ?? null}, budget),
        start_date = COALESCE(${data.start_date ?? null}, start_date),
        end_date = COALESCE(${data.end_date ?? null}, end_date),
        updated_at = now()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *`

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('[cdxi] Update project error:', error)
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const sql = getSql()
    const rows = await sql`DELETE FROM projects WHERE id = ${id} AND user_id = ${user.id} RETURNING id`

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[cdxi] Delete project error:', error)
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 })
  }
}
