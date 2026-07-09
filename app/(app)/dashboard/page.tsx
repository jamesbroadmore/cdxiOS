'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Users, Briefcase, CheckSquare, DollarSign, TrendingUp, Plus } from 'lucide-react'

export default function DashboardPage() {
  const [stats, setStats] = useState({
    clients: 0,
    projects: 0,
    tasks: 0,
    revenue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentClients, setRecentClients] = useState<any[]>([])
  const [recentProjects, setRecentProjects] = useState<any[]>([])

  useEffect(() => {
    async function loadData() {
      try {
        const [clients, projects] = await Promise.all([
          api.get<any[]>('/api/clients'),
          api.get<any[]>('/api/projects'),
        ])

        setStats({
          clients: clients.length,
          projects: projects.length,
          tasks: 0,
          revenue: 0,
        })

        setRecentClients(clients.slice(0, 5))
        setRecentProjects(projects.slice(0, 5))
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const StatCard = ({ icon: Icon, label, value, href }: any) => (
    <Link href={href}>
      <Card className="hover:border-primary/50 hover:shadow-lg transition cursor-pointer bg-card border-border">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">{label}</p>
              <p className="text-3xl font-bold text-foreground mt-2">{value}</p>
            </div>
            <Icon className="w-12 h-12 text-primary/20" />
          </div>
        </CardContent>
      </Card>
    </Link>
  )

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back to your agency</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/clients/new" />}
          >
            <Plus data-icon="inline-start" />
            New Client
          </Button>
          <Button nativeButton={false} render={<Link href="/projects/new" />}>
            <Plus data-icon="inline-start" />
            New Project
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Clients"
          value={stats.clients}
          href="/clients"
        />
        <StatCard
          icon={Briefcase}
          label="Active Projects"
          value={stats.projects}
          href="/projects"
        />
        <StatCard
          icon={CheckSquare}
          label="Tasks Completed"
          value={stats.tasks}
          href="/tasks"
        />
        <StatCard
          icon={DollarSign}
          label="Revenue (30d)"
          value={`$${(stats.revenue || 0).toLocaleString()}`}
          href="/billing"
        />
      </div>

      {/* Charts and Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Clients */}
        <Card className="lg:col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle>Recent Clients</CardTitle>
            <CardDescription>Latest clients added to your agency</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                ))}
              </div>
            ) : recentClients.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-muted-foreground">No clients yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentClients.map((client) => (
                  <div key={client.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition">
                    <div>
                      <p className="font-medium text-foreground">{client.name}</p>
                      <p className="text-sm text-muted-foreground">{client.email}</p>
                    </div>
                    <Badge variant="secondary">{client.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Summary */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle>Quick Stats</CardTitle>
            <CardDescription>Your performance metrics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Projects on track</span>
                <span className="text-sm font-semibold text-foreground">{stats.projects}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(stats.projects * 20, 100)}%` }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Client satisfaction</span>
                <span className="text-sm font-semibold text-foreground">95%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="bg-accent h-2 rounded-full" style={{ width: '95%' }} />
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground mb-3">Team collaboration</p>
              <div className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="size-8 rounded-full bg-primary border-2 border-card flex items-center justify-center text-xs text-primary-foreground font-bold"
                  >
                    {i}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Projects */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
          <CardDescription>Projects you are currently working on</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="text-center py-8">
              <Briefcase className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-muted-foreground">No projects yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentProjects.map((project) => (
                <div key={project.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition border border-border/50">
                  <div className="flex-1">
                    <p className="font-medium text-foreground">{project.name}</p>
                    <p className="text-sm text-muted-foreground">{project.description}</p>
                  </div>
                  <Badge>{project.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
