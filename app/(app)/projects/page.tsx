'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api-client'
import type { Project } from '@/lib/types'
import { Plus } from 'lucide-react'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProjects() {
      try {
        const data = await api.get<Project[]>('/api/projects')
        setProjects(data)
      } catch (error) {
        console.error('Failed to load projects:', error)
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Projects</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">Manage all active and completed projects</p>
        </div>
        <Link href="/projects/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto">
            <Plus data-icon="inline-start" />
            New Project
          </Button>
        </Link>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>All Projects</CardTitle>
          <CardDescription>{projects.length} total projects</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">No projects yet. Create your first project to get started.</p>
              <Link href="/projects/new">
                <Button>Create Project</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {projects.map((project) => (
                <Link key={project.id} href={`/projects/${project.id}`} className="block">
                  <div className="rounded-lg border border-border/50 p-3 transition hover:bg-muted/50 sm:p-4">
                    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium text-foreground sm:text-base">{project.name}</h3>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">{project.description}</p>
                        {Number(project.budget) > 0 && (
                          <p className="mt-1 text-xs text-accent">${Number(project.budget).toLocaleString()}</p>
                        )}
                      </div>
                      <Badge className="flex-shrink-0">{project.status}</Badge>
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
