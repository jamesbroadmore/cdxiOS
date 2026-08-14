'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api-client'

export default function NewClientPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      await api.post('/api/clients', {
        name: String(form.get('name') || ''), email: String(form.get('email') || ''),
        phone: String(form.get('phone') || ''), company: String(form.get('company') || ''),
        industry: String(form.get('industry') || ''), notes: String(form.get('notes') || ''),
      })
      router.push('/clients')
      router.refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create client') }
    finally { setSaving(false) }
  }

  return <div className="mx-auto w-full max-w-2xl p-4 sm:p-6">
    <Link href="/clients" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft data-icon="inline-start" /> Back to clients</Link>
    <Card><CardHeader><CardTitle>New client</CardTitle><CardDescription>Add a client to your workspace.</CardDescription></CardHeader><CardContent><form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2"><div className="flex flex-col gap-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div><div className="flex flex-col gap-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div><div className="flex flex-col gap-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" /></div><div className="flex flex-col gap-2"><Label htmlFor="company">Company</Label><Input id="company" name="company" /></div><div className="flex flex-col gap-2 sm:col-span-2"><Label htmlFor="industry">Industry</Label><Input id="industry" name="industry" /></div></div>
      <div className="flex flex-col gap-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={4} /></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <Loader2 data-icon="inline-start" className="animate-spin" />}Create client</Button></div>
    </form></CardContent></Card>
  </div>
}
