'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api-client'
import type { Project } from '@/lib/types'

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const [project, setProject] = useState<Project | null>(null); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { api.get<Project>(`/api/projects/${id}`).then(setProject).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load project')).finally(() => setLoading(false)) }, [id])
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!project) return; setSaving(true); setError(''); const form = new FormData(event.currentTarget); try { const updated = await api.patch<Project>(`/api/projects/${id}`, { name: form.get('name'), description: form.get('description'), status: form.get('status'), budget: Number(form.get('budget') || 0) }); setProject(updated) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save project') } finally { setSaving(false) } }
  async function remove() { if (!window.confirm('Delete this project and its tasks?')) return; try { await api.delete(`/api/projects/${id}`); router.push('/projects') } catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete project') } }
  if (loading) return <div className="p-6 text-muted-foreground">Loading project…</div>
  if (!project) return <div className="p-6"><p role="alert" className="text-destructive">{error || 'Project not found'}</p><Link href="/projects" className="mt-4 inline-flex text-sm underline">Back to projects</Link></div>
  return <div className="mx-auto w-full max-w-2xl p-4 sm:p-6"><div className="mb-4 flex items-center justify-between"><Link href="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft data-icon="inline-start" /> Back to projects</Link><Button variant="destructive" size="sm" onClick={remove}><Trash2 data-icon="inline-start" /> Delete</Button></div><Card><CardHeader><CardTitle>{project.name}</CardTitle><CardDescription>Update project details.</CardDescription></CardHeader><CardContent><form onSubmit={save} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" defaultValue={project.name} required /></div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="status">Status</Label><select id="status" name="status" defaultValue={project.status} className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"><option value="planning">Planning</option><option value="in_progress">In progress</option><option value="paused">Paused</option><option value="completed">Completed</option></select></div><div className="flex flex-col gap-2"><Label htmlFor="budget">Budget</Label><Input id="budget" name="budget" type="number" min="0" step="0.01" defaultValue={String(project.budget)} /></div></div><div className="flex flex-col gap-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" defaultValue={project.description} rows={6} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={saving}>{saving && <Loader2 data-icon="inline-start" className="animate-spin" />}Save changes</Button></form></CardContent></Card></div>
}
