'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react'
import type { Task, Project } from '@/lib/types'

interface TaskWithProject extends Task {
  projectName?: string
}

export default function TasksPage() {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskWithProject[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editingTask, setEditingTask] = useState<TaskWithProject | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<'todo' | 'in_progress' | 'done'>('todo')
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [tasksData, projectsData] = await Promise.all([
        api.get<TaskWithProject[]>('/api/tasks'),
        api.get<Project[]>('/api/projects'),
      ])
      setProjects(projectsData)
      setTasks(
        tasksData.map((t) => ({
          ...t,
          projectName: projectsData.find((p) => p.id === t.project_id)?.name || 'Unknown Project',
        })),
      )
    } catch (error) {
      console.error('[cdxi] Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  async function createTask() {
    if (!newTaskTitle.trim() || !selectedProjectId) return

    setSubmitting(true)
    try {
      const newTask = await api.post<TaskWithProject>('/api/tasks', {
        title: newTaskTitle,
        projectId: selectedProjectId,
      })
      setTasks([...tasks, { ...newTask, projectName: projects.find((p) => p.id === newTask.project_id)?.name }])
      setNewTaskTitle('')
      setSelectedProjectId('')
    } catch (error) {
      console.error('[cdxi] Failed to create task:', error)
    } finally {
      setSubmitting(false)
    }
  }

  async function updateTask(taskId: string) {
    if (!editTitle.trim()) return

    setSubmitting(true)
    try {
      const updated = await api.patch<TaskWithProject>(`/api/tasks/${taskId}`, {
        title: editTitle,
        status: editStatus,
        priority: editPriority,
      })
      setTasks(
        tasks.map((t) =>
          t.id === taskId ? { ...updated, projectName: t.projectName } : t,
        ),
      )
      setEditingTask(null)
    } catch (error) {
      console.error('[cdxi] Failed to update task:', error)
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return

    try {
      await api.delete(`/api/tasks/${taskId}`)
      setTasks(tasks.filter((t) => t.id !== taskId))
    } catch (error) {
      console.error('[cdxi] Failed to delete task:', error)
    }
  }

  async function toggleTaskStatus(task: TaskWithProject) {
    const newStatus = task.status === 'done' ? 'todo' : 'done'
    try {
      const updated = await api.patch<TaskWithProject>(`/api/tasks/${task.id}`, {
        status: newStatus,
      })
      setTasks(
        tasks.map((t) =>
          t.id === task.id ? { ...updated, projectName: t.projectName } : t,
        ),
      )
    } catch (error) {
      console.error('[cdxi] Failed to toggle task:', error)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Organize and track your team's work</p>
        </div>
        <Dialog>
          <DialogTrigger render={<Button nativeButton={false} />}>
            <Plus data-icon="inline-start" />
            New Task
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>Add a task to your project</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Task title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
              />
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
              >
                <option value="">Select project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <Button
                nativeButton={false}
                onClick={() => createTask()}
                disabled={submitting || !newTaskTitle.trim() || !selectedProjectId}
              >
                {submitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                Create Task
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>All Tasks</CardTitle>
          <CardDescription>Track your team's progress</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No tasks yet. Create one to get started.</div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 p-4 rounded-lg hover:bg-muted/50 transition border border-border/50">
                  <Checkbox
                    checked={task.status === 'done'}
                    onCheckedChange={() => toggleTaskStatus(task)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className={`font-medium ${task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                      {task.title}
                    </p>
                    <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{task.projectName}</span>
                      {task.due_date && (
                        <>
                          <span>•</span>
                          <span>Due {new Date(task.due_date).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'low' ? 'secondary' : 'default'}>
                      {task.priority}
                    </Badge>
                    <Badge variant={task.status === 'done' ? 'default' : task.status === 'in_progress' ? 'secondary' : 'outline'}>
                      {task.status}
                    </Badge>
                  </div>
                  <Dialog open={editingTask?.id === task.id} onOpenChange={(open) => {
                    if (open) {
                      setEditingTask(task)
                      setEditTitle(task.title)
                      setEditStatus(task.status)
                      setEditPriority(task.priority)
                    } else {
                      setEditingTask(null)
                    }
                  }}>
                    <DialogTrigger
                      render={<Button variant="ghost" size="sm" nativeButton={false} />}
                      onClick={() => {
                        setEditingTask(task)
                        setEditTitle(task.title)
                        setEditStatus(task.status)
                        setEditPriority(task.priority)
                      }}
                    >
                      <Edit2 className="w-4 h-4" />
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Task</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
                        />
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as 'todo' | 'in_progress' | 'done')}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                        <select
                          value={editPriority}
                          onChange={(e) => setEditPriority(e.target.value as 'low' | 'medium' | 'high')}
                          className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <Button
                          nativeButton={false}
                          onClick={() => updateTask(task.id)}
                          disabled={submitting || !editTitle.trim()}
                        >
                          {submitting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : 'Save'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button
                    variant="ghost"
                    size="sm"
                    nativeButton={false}
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
