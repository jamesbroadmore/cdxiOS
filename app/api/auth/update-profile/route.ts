import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { z } from 'zod'

const updateSchema = z.object({
  full_name: z.string().min(1).optional(),
  email: z.string().email().optional(),
})

export async function PATCH(req: NextRequest) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const data = updateSchema.parse(body)

    if (!data.full_name && !data.email) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const sql = getSql()

    // If email is being changed, check it's not already in use
    if (data.email && data.email !== user.email) {
      const existing = await sql`SELECT id FROM users WHERE email = ${data.email}`
      if (existing.length > 0) {
        return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
      }
    }

    const result = await sql`
      UPDATE users
      SET
        full_name = COALESCE(${data.full_name ?? null}, full_name),
        email = COALESCE(${data.email ?? null}, email),
        updated_at = now()
      WHERE id = ${user.id}
      RETURNING id, email, full_name, role, created_at, updated_at
    `

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json(result[0])
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('[cdxi] Update profile error:', error)
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
  }
}
