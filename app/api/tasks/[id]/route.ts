import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sql = getSql()
    const task = await sql`
      SELECT id, title, description, project_id, priority, status, due_date, created_at
      FROM tasks
      WHERE id = ${params.id} AND user_id = ${user.id}
    `

    if (task.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(task[0])
  } catch (error) {
    console.error('[cdxi] Task GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch task' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, description, priority, status, dueDate } = await req.json()

    const sql = getSql()
    const result = await sql`
      UPDATE tasks
      SET
        title = COALESCE(${title || null}, title),
        description = COALESCE(${description || null}, description),
        priority = COALESCE(${priority || null}, priority),
        status = COALESCE(${status || null}, status),
        due_date = COALESCE(${dueDate || null}, due_date)
      WHERE id = ${params.id} AND user_id = ${user.id}
      RETURNING id, title, description, project_id, priority, status, due_date, created_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('[cdxi] Task PATCH error:', error)
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sql = getSql()
    const result = await sql`
      DELETE FROM tasks
      WHERE id = ${params.id} AND user_id = ${user.id}
      RETURNING id
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[cdxi] Task DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
  }
}
