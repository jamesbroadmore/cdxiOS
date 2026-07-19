'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Edit2, Trash2, Loader2 } from 'lucide-react'
import type { Task, Project } from '@/lib/types'

interface TaskWithProject extends Task {
  projectName?: string
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithProject[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [creating, setCreating] = useState(false)

  // Edit dialog
  const [editingTask, setEditingTask] = useState<TaskWithProject | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editStatus, setEditStatus] = useState<Task['status']>('todo')
  const [editPriority, setEditPriority] = useState<Task['priority']>('medium')
  const [saving, setSaving] = useState(false)

  // Delete dialog
  const [deletingTask, setDeletingTask] = useState<TaskWithProject | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
          projectName: projectsData.find((p) => p.id === t.project_id)?.name ?? 'Unknown Project',
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
    setCreating(true)
    try {
      const newTask = await api.post<TaskWithProject>('/api/tasks', {
        title: newTaskTitle.trim(),
        projectId: selectedProjectId,
      })
      const projectName = projects.find((p) => p.id === newTask.project_id)?.name
      setTasks((prev) => [{ ...newTask, projectName }, ...prev])
      setNewTaskTitle('')
      setSelectedProjectId('')
      setCreateOpen(false)
    } catch (error) {
      console.error('[cdxi] Failed to create task:', error)
    } finally {
      setCreating(false)
    }
  }

  function openEdit(task: TaskWithProject) {
    setEditingTask(task)
    setEditTitle(task.title)
    setEditStatus(task.status)
    setEditPriority(task.priority)
    setEditOpen(true)
  }

  async function updateTask() {
    if (!editTitle.trim() || !editingTask) return
    setSaving(true)
    try {
      const updated = await api.patch<TaskWithProject>(`/api/tasks/${editingTask.id}`, {
        title: editTitle.trim(),
        status: editStatus,
        priority: editPriority,
      })
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id ? { ...updated, projectName: t.projectName } : t,
        ),
      )
      setEditOpen(false)
      setEditingTask(null)
    } catch (error) {
      console.error('[cdxi] Failed to update task:', error)
    } finally {
      setSaving(false)
    }
  }

  function openDelete(task: TaskWithProject) {
    setDeletingTask(task)
    setDeleteOpen(true)
  }

  async function confirmDelete() {
    if (!deletingTask) return
    setDeleting(true)
    try {
      await api.delete(`/api/tasks/${deletingTask.id}`)
      setTasks((prev) => prev.filter((t) => t.id !== deletingTask.id))
      setDeleteOpen(false)
      setDeletingTask(null)
    } catch (error) {
      console.error('[cdxi] Failed to delete task:', error)
    } finally {
      setDeleting(false)
    }
  }

  async function toggleTaskStatus(task: TaskWithProject) {
    const newStatus: Task['status'] = task.status === 'done' ? 'todo' : 'done'
    try {
      const updated = await api.patch<TaskWithProject>(`/api/tasks/${task.id}`, {
        status: newStatus,
      })
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...updated, projectName: t.projectName } : t,
        ),
      )
    } catch (error) {
      console.error('[cdxi] Failed to toggle task:', error)
    }
  }

  const priorityVariant = (p: Task['priority']) =>
    p === 'high' ? 'destructive' : p === 'low' ? 'secondary' : 'default'

  const statusVariant = (s: Task['status']) =>
    s === 'done' ? 'default' : s === 'in_progress' ? 'secondary' : 'outline'

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-muted-foreground mt-1">Organise and track your team&apos;s work</p>
        </div>

        {/* Create dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus data-icon="inline-start" />
            New Task
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
              <DialogDescription>Add a task to one of your projects</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Title</label>
                <input
                  type="text"
                  placeholder="Task title"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                      createTask()
                    }
                  }}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm"
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={createTask}
                disabled={creating || !newTaskTitle.trim() || !selectedProjectId}
              >
                {creating ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
                Create Task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>All Tasks</CardTitle>
          <CardDescription>
            {tasks.length} task{tasks.length !== 1 ? 's' : ''} — {tasks.filter((t) => t.status === 'done').length} completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No tasks yet. Create one to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/40 transition border border-border/50"
                >
                  <Checkbox
                    checked={task.status === 'done'}
                    onCheckedChange={() => toggleTaskStatus(task)}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium text-sm truncate ${
                        task.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'
                      }`}
                    >
                      {task.title}
                    </p>
                    <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                      <span className="truncate">{task.projectName}</span>
                      {task.due_date && (
                        <>
                          <span>·</span>
                          <span>Due {new Date(task.due_date).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={priorityVariant(task.priority)} className="text-xs">
                      {task.priority}
                    </Badge>
                    <Badge variant={statusVariant(task.status)} className="text-xs">
                      {task.status.replace('_', ' ')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openEdit(task)}
                      title="Edit task"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => openDelete(task)}
                      title="Delete task"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { setEditOpen(open); if (!open) setEditingTask(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
            <DialogDescription>Update task details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Title</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    updateTask()
                  }
                }}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Status</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as Task['status'])}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm"
              >
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Priority</label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as Task['priority'])}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={updateTask} disabled={saving || !editTitle.trim()}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { setDeleteOpen(open); if (!open) setDeletingTask(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deletingTask?.title}&rdquo;? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
