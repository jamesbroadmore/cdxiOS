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
import type { Client } from '@/lib/types'

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api.get<Client>(`/api/clients/${id}`).then(setClient).catch((err) => setError(err instanceof Error ? err.message : 'Unable to load client')).finally(() => setLoading(false)) }, [id])
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!client) return; setSaving(true); setError(''); const form = new FormData(event.currentTarget); try { const updated = await api.patch<Client>(`/api/clients/${id}`, { name: form.get('name'), email: form.get('email'), phone: form.get('phone'), company: form.get('company'), industry: form.get('industry'), notes: form.get('notes') }); setClient(updated) } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save client') } finally { setSaving(false) } }
  async function remove() { if (!window.confirm('Delete this client and its projects?')) return; try { await api.delete(`/api/clients/${id}`); router.push('/clients') } catch (err) { setError(err instanceof Error ? err.message : 'Unable to delete client') } }

  if (loading) return <div className="p-6 text-muted-foreground">Loading client…</div>
  if (!client) return <div className="p-6"><p role="alert" className="text-destructive">{error || 'Client not found'}</p><Link href="/clients" className="mt-4 inline-flex text-sm underline">Back to clients</Link></div>
  return <div className="mx-auto w-full max-w-2xl p-4 sm:p-6"><div className="mb-4 flex items-center justify-between"><Link href="/clients" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft data-icon="inline-start" /> Back to clients</Link><Button variant="destructive" size="sm" onClick={remove}><Trash2 data-icon="inline-start" /> Delete</Button></div><Card><CardHeader><CardTitle>{client.name}</CardTitle><CardDescription>Update client details.</CardDescription></CardHeader><CardContent><form onSubmit={save} className="flex flex-col gap-4"><div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" defaultValue={client.name} required /></div><div className="flex flex-col gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" defaultValue={client.email} required /></div><div className="flex flex-col gap-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" defaultValue={client.phone} /></div><div className="flex flex-col gap-2"><Label htmlFor="company">Company</Label><Input id="company" name="company" defaultValue={client.company} /></div><div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="industry">Industry</Label><Input id="industry" name="industry" defaultValue={client.industry} /></div></div><div className="flex flex-col gap-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" defaultValue={client.notes} rows={5} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={saving}>{saving && <Loader2 data-icon="inline-start" className="animate-spin" />}Save changes</Button></form></CardContent></Card></div>
}
