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
        <span className="font-righteous text-3xl font-bold text-white">cdxi</span>
        <div
          className="size-6 animate-spin rounded-full border-2 border-muted border-t-primary"
          role="status"
          aria-label="Loading"
        />
      </div>
    </main>
  )
}
