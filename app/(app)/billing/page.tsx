'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DollarSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/client-auth'

interface Invoice {
  id: string
  client_id: string
  project_id?: string
  amount: number
  status: 'draft' | 'sent' | 'paid' | 'overdue'
  invoice_date: string
  due_date: string
  created_at: string
  updated_at: string
  client?: { name: string }
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { token } = useAuthStore()

  useEffect(() => {
    if (!token) return

    const fetchInvoices = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/invoices', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error('Failed to fetch invoices')
        const data = await res.json()
        setInvoices(Array.isArray(data) ? data : [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setLoading(false)
      }
    }

    fetchInvoices()
  }, [token])

  const stats = {
    totalRevenue: invoices
      .filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.amount), 0),
    totalSent: invoices.filter((i) => i.status !== 'draft').length,
    overdue: invoices.filter((i) => i.status === 'overdue').length,
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-500/20 text-green-700 dark:text-green-400'
      case 'sent':
        return 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
      case 'draft':
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
      case 'overdue':
        return 'bg-red-500/20 text-red-700 dark:text-red-400'
      default:
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-6 h-6 sm:w-8 sm:h-8 text-accent" />
          Billing & Invoicing
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage invoices and track revenue</p>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="pt-6">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 sm:pt-6">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">Total Revenue</p>
              <p className="text-xl sm:text-3xl font-bold text-foreground">${stats.totalRevenue.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 sm:pt-6">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">Invoices Sent</p>
              <p className="text-xl sm:text-3xl font-bold text-foreground">{stats.totalSent}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 sm:pt-6">
            <div className="text-center">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">Overdue</p>
              <p className="text-xl sm:text-3xl font-bold text-foreground">{stats.overdue}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg sm:text-xl font-semibold text-foreground">Recent Invoices</h2>
        </div>

        {loading ? (
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">Loading invoices...</p>
            </CardContent>
          </Card>
        ) : invoices.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground text-center">No invoices yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2 sm:space-y-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg hover:bg-muted/40 transition border border-border/50"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm sm:text-base text-foreground truncate">
                    Invoice #{invoice.id.slice(0, 8)}
                  </h3>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Due {new Date(invoice.due_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
                  <p className="text-sm sm:text-base font-semibold text-foreground">${Number(invoice.amount).toLocaleString()}</p>
                  <Badge className={`text-xs flex-shrink-0 ${getStatusColor(invoice.status)}`}>
                    {invoice.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
