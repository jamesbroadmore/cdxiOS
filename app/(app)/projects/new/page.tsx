'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api-client'
import type { Client } from '@/lib/types'

export default function NewProjectPage() {
  const router = useRouter(); const [clients, setClients] = useState<Client[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { api.get<Client[]>('/api/clients').then(setClients).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load clients')) }, [])
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(''); const form = new FormData(event.currentTarget); try { await api.post('/api/projects', { client_id: String(form.get('client_id')), name: String(form.get('name')), description: String(form.get('description') || ''), status: String(form.get('status') || 'planning'), budget: Number(form.get('budget') || 0) }); router.push('/projects'); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create project') } finally { setSaving(false) } }
  return <div className="mx-auto w-full max-w-2xl p-4 sm:p-6"><Link href="/projects" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft data-icon="inline-start" /> Back to projects</Link><Card><CardHeader><CardTitle>New project</CardTitle><CardDescription>Connect a project to one of your clients.</CardDescription></CardHeader><CardContent><form onSubmit={submit} className="flex flex-col gap-4"><div className="flex flex-col gap-2"><Label htmlFor="client_id">Client</Label><select id="client_id" name="client_id" required className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"><option value="">Select a client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>{clients.length === 0 && <p className="text-sm text-muted-foreground">Create a client before adding a project.</p>}</div><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div><div className="flex flex-col gap-2"><Label htmlFor="status">Status</Label><select id="status" name="status" defaultValue="planning" className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm"><option value="planning">Planning</option><option value="in_progress">In progress</option><option value="paused">Paused</option><option value="completed">Completed</option></select></div><div className="flex flex-col gap-2"><Label htmlFor="budget">Budget</Label><Input id="budget" name="budget" type="number" min="0" step="0.01" /></div></div><div className="flex flex-col gap-2"><Label htmlFor="description">Description</Label><Textarea id="description" name="description" rows={5} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="submit" disabled={saving || clients.length === 0}>{saving && <Loader2 data-icon="inline-start" className="animate-spin" />}Create project</Button></div></form></CardContent></Card></div>
}
