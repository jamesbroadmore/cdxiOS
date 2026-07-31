import { getSql } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const createSchema = z.object({
  client_id: z.string().uuid(),
  project_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  invoice_date: z.string().datetime().optional(),
  due_date: z.string().datetime(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue']).optional(),
})

export async function GET(req: NextRequest) {
  try {
    const user = getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sql = getSql()
    const invoices = await sql`
      SELECT * FROM invoices WHERE user_id = ${user.id} ORDER BY created_at DESC`
    return NextResponse.json(invoices)
  } catch (error: unknown) {
    console.error('[cdxi] Get invoices error:', error)
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = getAuthUser(req)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const data = createSchema.parse(body)

    const sql = getSql()

    // Ensure the client belongs to this user
    const owned = await sql`
      SELECT id FROM clients WHERE id = ${data.client_id} AND user_id = ${user.id}`
    if (owned.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const rows = await sql`
      INSERT INTO invoices (user_id, client_id, project_id, amount, invoice_date, due_date, status)
      VALUES (
        ${user.id}, ${data.client_id}, ${data.project_id ?? null},
        ${data.amount}, ${data.invoice_date ?? new Date().toISOString()},
        ${data.due_date}, ${data.status ?? 'draft'}
      )
      RETURNING *`
    return NextResponse.json(rows[0], { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    console.error('[cdxi] Create invoice error:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }
}
