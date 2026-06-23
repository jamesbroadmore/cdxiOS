'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getToken, clearToken, getMe } from '@/lib/client-auth'
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarTrigger } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { LucideIcon, ChevronDown, LayoutDashboard, Users, Briefcase, CheckSquare, MessageSquare, DollarSign, Settings, LogOut } from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Clients', href: '/clients', icon: Users },
  { label: 'Projects', href: '/projects', icon: Briefcase },
  { label: 'Tasks', href: '/tasks', icon: CheckSquare },
  { label: 'Copilot', href: '/copilot', icon: MessageSquare },
  { label: 'Billing', href: '/billing', icon: DollarSign },
  { label: 'Settings', href: '/settings', icon: Settings },
]

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.push('/login')
      return
    }

    // Verify token and fetch user
    getMe(token)
      .then(setUser)
      .catch(() => {
        clearToken()
        router.push('/login')
      })
      .finally(() => setLoading(false))
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  function handleLogout() {
    clearToken()
    router.push('/login')
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar className="border-r border-border bg-sidebar">
        <SidebarHeader className="border-b border-sidebar-border px-6 py-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">OS</span>
            </div>
            <div>
              <p className="font-bold text-sidebar-foreground text-sm">cdxi</p>
              <p className="text-xs text-sidebar-foreground/60">Operating System</p>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2 py-4">
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild>
                  <Link href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-sidebar-accent/20 transition">
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between px-3 py-2 h-auto text-sidebar-foreground hover:bg-sidebar-accent/20"
              >
                <div className="text-left">
                  <p className="text-sm font-medium">{user?.full_name}</p>
                  <p className="text-xs text-sidebar-foreground/60">{user?.email}</p>
                </div>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-border bg-card px-6 py-4 flex items-center">
          <SidebarTrigger />
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  )
}
