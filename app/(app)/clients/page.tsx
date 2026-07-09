'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { Plus, Mail, Phone } from 'lucide-react'

export default function ClientsPage() {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadClients() {
      try {
        const data = await api.get<any[]>('/api/clients')
        setClients(data)
      } catch (error) {
        console.error('Failed to load clients:', error)
      } finally {
        setLoading(false)
      }
    }

    loadClients()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Manage all your client relationships</p>
        </div>
        <Button nativeButton={false} render={<Link href="/clients/new" />}>
          <Plus data-icon="inline-start" />
          Add Client
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>All Clients</CardTitle>
          <CardDescription>{clients.length} total clients</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No clients yet. Add your first client to get started.</p>
              <Button nativeButton={false} render={<Link href="/clients/new" />}>
                Add Client
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((client) => (
                <Link key={client.id} href={`/clients/${client.id}`}>
                  <div className="p-4 rounded-lg hover:bg-muted/50 transition border border-border/50 cursor-pointer">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-foreground">{client.name}</h3>
                        <div className="flex gap-3 mt-2 text-sm text-muted-foreground">
                          {client.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="w-4 h-4" />
                              {client.email}
                            </div>
                          )}
                          {client.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-4 h-4" />
                              {client.phone}
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{client.company}</p>
                      </div>
                      <Badge>{client.status}</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
