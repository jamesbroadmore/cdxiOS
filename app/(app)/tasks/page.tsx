'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, CheckCircle2, Circle } from 'lucide-react'

export default function TasksPage() {
  const mockTasks = [
    { id: '1', title: 'Design landing page', project: 'Acme Website', priority: 'high', status: 'in_progress', dueDate: '2024-06-25' },
    { id: '2', title: 'API integration', project: 'Acme Website', priority: 'high', status: 'todo', dueDate: '2024-06-28' },
    { id: '3', title: 'Bug fixes', project: 'Mobile App', priority: 'medium', status: 'done', dueDate: '2024-06-20' },
  ]

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Organize and track your team's work</p>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>All Tasks</CardTitle>
          <CardDescription>Track your team&apos;s progress</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockTasks.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted/50 transition border border-border/50">
                <Checkbox defaultChecked={task.status === 'done'} className="mt-1" />
                <div className="flex-1">
                  <p className="font-medium text-foreground">{task.title}</p>
                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                    <span>{task.project}</span>
                    <span>•</span>
                    <span>Due {task.dueDate}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={task.priority === 'high' ? 'destructive' : 'secondary'}>{task.priority}</Badge>
                  <Badge>{task.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
