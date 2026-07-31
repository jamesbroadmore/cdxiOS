import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db'
import { getAuthUser, hashPassword, verifyPassword } from '@/lib/auth'
import { z } from 'zod'

const changeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
})

export async function POST(req: NextRequest) {
  try {
    const user = getAuthUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const data = changeSchema.parse(body)

    const sql = getSql()

    // Get current user with password hash
    const users = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`
    if (users.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const currentUser = users[0] as { password_hash: string }

    // Verify current password
    const isValid = await verifyPassword(data.current_password, currentUser.password_hash)
    if (!isValid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
    }

    // Hash new password
    const newHash = await hashPassword(data.new_password)

    // Update password
    await sql`
      UPDATE users
      SET password_hash = ${newHash}, updated_at = now()
      WHERE id = ${user.id}
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('[cdxi] Change password error:', error)
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 })
  }
}
