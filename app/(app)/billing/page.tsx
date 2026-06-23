'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DollarSign, CreditCard } from 'lucide-react'

export default function BillingPage() {
  const mockInvoices = [
    { id: '1', client: 'Acme Corp', amount: 5000, status: 'paid', date: '2024-06-01' },
    { id: '2', client: 'TechStart Inc', amount: 3500, status: 'sent', date: '2024-06-15' },
    { id: '3', client: 'Global Solutions', amount: 2000, status: 'draft', date: '2024-06-20' },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-500/20 text-green-700 dark:text-green-400'
      case 'sent':
        return 'bg-blue-500/20 text-blue-700 dark:text-blue-400'
      case 'draft':
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
      default:
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400'
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
          <DollarSign className="w-8 h-8 text-accent" />
          Billing & Invoicing
        </h1>
        <p className="text-muted-foreground mt-1">Manage invoices and track revenue</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Total Revenue (30d)</p>
              <p className="text-3xl font-bold text-foreground">$10,500</p>
              <p className="text-xs text-green-500 mt-2">+12.5% from last month</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Invoices Sent</p>
              <p className="text-3xl font-bold text-foreground">12</p>
              <p className="text-xs text-muted-foreground mt-2">2 overdue</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Outstanding</p>
              <p className="text-3xl font-bold text-foreground">$5,500</p>
              <p className="text-xs text-orange-500 mt-2">Due within 7 days</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Invoices</CardTitle>
              <CardDescription>Your latest invoices</CardDescription>
            </div>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
              <CreditCard className="w-4 h-4 mr-2" />
              Create Invoice
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockInvoices.map((invoice) => (
              <div
                key={invoice.id}
                className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/50 transition border border-border/50"
              >
                <div className="flex-1">
                  <p className="font-medium text-foreground">{invoice.client}</p>
                  <p className="text-sm text-muted-foreground">{invoice.date}</p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="font-semibold text-foreground">${invoice.amount.toLocaleString()}</p>
                  <Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
