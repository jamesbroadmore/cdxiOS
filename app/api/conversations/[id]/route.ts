import { getSql } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const user = getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const sql = getSql()
    const rows = await sql`SELECT * FROM conversations WHERE id = ${id} AND user_id = ${user.id}`

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return NextResponse.json(rows[0])
  } catch (error: unknown) {
    console.error('[cdxi] Get conversation error:', error)
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
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
    const rows = await sql`DELETE FROM conversations WHERE id = ${id} AND user_id = ${user.id} RETURNING id`

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[cdxi] Delete conversation error:', error)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
