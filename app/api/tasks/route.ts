import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const sql = getSql()
    const tasks = await sql`
      SELECT id, title, description, project_id, priority, status, due_date, created_at
      FROM tasks
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `

    return NextResponse.json(tasks)
  } catch (error) {
    console.error('[cdxi] Tasks GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, description, projectId, priority, dueDate } = await req.json()

    if (!title || !projectId) {
      return NextResponse.json({ error: 'Title and project ID are required' }, { status: 400 })
    }

    const defaultStatus = 'todo'
    const sql = getSql()
    const result = await sql`
      INSERT INTO tasks (user_id, title, description, project_id, priority, status, due_date)
      VALUES (${user.id}, ${title}, ${description ?? null}, ${projectId}, ${priority ?? 'medium'}, ${defaultStatus}, ${dueDate ?? null})
      RETURNING id, title, description, project_id, priority, status, due_date, created_at, updated_at
    `

    return NextResponse.json(result[0], { status: 201 })
  } catch (error) {
    console.error('[cdxi] Tasks POST error:', error)
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}
