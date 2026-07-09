'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/client-auth'

export default function Page() {
  const router = useRouter()

  useEffect(() => {
    const token = getToken()
    router.replace(token ? '/dashboard' : '/login')
  }, [router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <span className="text-3xl font-bold tracking-tight text-primary">cdxi</span>
        <div
          className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary"
          role="status"
          aria-label="Loading"
        />
      </div>
    </main>
  )
}
