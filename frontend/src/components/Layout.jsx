import React, { useState, useEffect, useCallback } from "react";
import { NavLink } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import CopilotDock from "@/components/CopilotDock";
import CommandPalette from "@/components/CommandPalette";
import {
  LayoutDashboard, Users, FolderKanban, Clock, FileText,
  Bot, Settings, LogOut, ChevronLeft, ChevronRight, Menu, X, Sun, Moon, Palette,
  Building2, ChevronDown, Check, Sparkles, Search, Command,
} from "lucide-react";

const navSections = [
  {
    label: "Operate",
    items: [
      { icon: LayoutDashboard, label: "Dashboard", href: "/" },
      { icon: Users,           label: "Clients",   href: "/clients" },
      { icon: FolderKanban,    label: "Projects",  href: "/projects" },
    ],
  },
  {
    label: "Money",
    items: [
      { icon: Clock,    label: "Billing",   href: "/billing" },
      { icon: FileText, label: "Contracts", href: "/contracts" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { icon: Bot, label: "AI Ops", href: "/agents" },
    ],
  },
  {
    label: "System",
    items: [
      { icon: Settings, label: "Settings", href: "/settings" },
    ],
  },
];

/* ─── Iconic cdxi wordmark — text-led, no chrome ─────────── */
function CdxiLogo({ collapsed }) {
  if (collapsed) {
    return (
      <span
        data-cdxi-logo
        className="font-righteous text-[22px] leading-none tracking-tight select-none"
        style={{ fontFamily: "'Righteous', system-ui, sans-serif" }}
      >c</span>
    );
  }
  return (
    <span
      data-cdxi-logo
      className="font-righteous text-[28px] leading-none tracking-tight select-none"
      style={{ fontFamily: "'Righteous', system-ui, sans-serif" }}
    >cdxi</span>
  );
}

/* ─── Tenant Switcher ──────────────────────────────────── */
function TenantSwitcher({ user, onSwitch }) {
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const isAdmin = user?.role === "admin";
  const currentTenant = user?.tenant_id || "default";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tenants");
      setTenants(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const switchTo = async (slug) => {
    if (slug === currentTenant) { setOpen(false); return; }
    if (!isAdmin) { toast.error("Only admins can switch tenants"); return; }
    try {
      await api.post(`/tenants/${slug}/switch`);
      toast.success(`Switched to ${tenants.find(t => t.id === slug)?.name || slug}`);
      setOpen(false);
      // Reload page so all data refreshes under the new tenant scope
      if (onSwitch) onSwitch();
      else window.location.reload();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to switch tenant");
    }
  };

  const current = tenants.find(t => t.id === currentTenant);
  const label = current?.name || currentTenant;

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        data-testid="tenant-switcher-btn"
        onClick={() => setOpen(o => !o)}
        title={isAdmin ? "Switch tenant" : "Current tenant"}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white transition-colors max-w-[200px]"
      >
        <Building2 size={12} className="text-indigo-400 shrink-0" />
        <span className="truncate font-medium">{label}</span>
        {isAdmin && <ChevronDown size={12} className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && isAdmin && (
        <div
          data-testid="tenant-switcher-dropdown"
          className="absolute right-0 mt-1.5 w-64 rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/40 overflow-hidden z-50"
        >
          <div className="px-3 py-2 border-b border-zinc-800/70 flex items-center justify-between">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Tenants</span>
            <span className="text-[10px] text-zinc-600">{tenants.length}</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && <div className="px-3 py-2 text-xs text-zinc-500">Loading…</div>}
            {!loading && tenants.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-600">No tenants found</div>
            )}
            {tenants.map(t => (
              <button
                key={t.id}
                data-testid={`tenant-option-${t.slug}`}
                onClick={() => switchTo(t.id)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-zinc-800/50 transition-colors ${
                  t.id === currentTenant ? "text-indigo-300" : "text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={12} className="shrink-0 text-zinc-500" />
                  <div className="min-w-0">
                    <div className="text-sm truncate">{t.name}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{t.slug}</div>
                  </div>
                </div>
                {t.id === currentTenant && <Check size={13} className="text-indigo-400 shrink-0" />}
              </button>
            ))}
          </div>
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            className="block border-t border-zinc-800/70 px-3 py-2 text-[11px] text-indigo-400 hover:bg-zinc-800/40 hover:text-indigo-300 transition-colors"
          >
            Manage tenants →
          </NavLink>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isDark = theme === "dark";

  // Global Cmd/Ctrl + K = palette, Cmd/Ctrl + / = copilot
  useEffect(() => {
    const onKey = (e) => {
      const k = (e.key || "").toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setCopilotOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside
        className={`cdxi-sidebar
          fixed inset-y-0 left-0 z-40 flex flex-col border-r border-zinc-800 bg-[#0b0b0f] shadow-xl shadow-black/30
          transition-all duration-200 ease-in-out
          ${collapsed ? "w-[68px]" : "w-60"}
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}
      >
        {/* Logo */}
        <div className={`flex items-center h-14 border-b border-zinc-800 ${collapsed ? "justify-center" : "px-5"}`}>
          <CdxiLogo collapsed={collapsed} />
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {navSections.map((section, sIdx) => (
            <div key={section.label}>
              {!collapsed && (
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 cdxi-nav-section">
                  {section.label}
                </div>
              )}
              {collapsed && sIdx > 0 && (
                <div className="mx-3 mb-2 h-px bg-zinc-800/70" />
              )}
              <div className="space-y-0.5">
                {section.items.map(({ icon: Icon, label, href }) => (
                  <NavLink
                    key={href}
                    to={href}
                    end={href === "/"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `group relative flex items-center rounded-lg text-sm transition-colors
                       ${collapsed ? "h-10 w-10 mx-auto justify-center" : "h-9 px-3 gap-3"}
                       ${isActive
                         ? "bg-indigo-500/12 text-white font-medium"
                         : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"}`
                    }
                    title={collapsed ? label : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className={`absolute top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-400 ${collapsed ? "left-0" : "left-0"}`} />
                        )}
                        <Icon
                          size={16}
                          strokeWidth={isActive ? 2.2 : 1.8}
                          className={`shrink-0 transition-colors ${isActive ? "text-indigo-300" : ""}`}
                        />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — user + sign out */}
        <div className="border-t border-zinc-800 p-2">
          {!collapsed ? (
            <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-zinc-900/70 transition-colors">
              <div className="h-7 w-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-indigo-300">
                  {(user?.name || user?.email || "?")[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-medium text-zinc-200 truncate leading-tight">
                  {user?.name || user?.display_name || user?.email}
                </div>
                <div className="text-[10px] text-zinc-500 capitalize leading-tight mt-0.5">{user?.role || "—"}</div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="h-7 w-7 grid place-items-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <div className="h-7 w-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 grid place-items-center">
                <span className="text-[11px] font-semibold text-indigo-300">
                  {(user?.name || user?.email || "?")[0].toUpperCase()}
                </span>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="h-8 w-8 grid place-items-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Collapse toggle (desktop) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden lg:flex absolute -right-3 top-[52px] z-50 h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-[#0b0b0f] text-zinc-400 hover:text-white hover:border-zinc-500 shadow transition-colors"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* ── Main ────────────────────────────────────────── */}
      <div className={`flex flex-col flex-1 overflow-hidden transition-all duration-200 ${collapsed ? "lg:pl-[68px]" : "lg:pl-60"}`}>
        {/* Top bar */}
        <header className="cdxi-topbar sticky top-0 z-20 flex h-14 items-center justify-between border-b border-zinc-800 bg-[#0b0b0f] px-4 lg:px-6">
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="lg:hidden text-zinc-400 hover:text-white"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="hidden lg:flex items-center gap-2 text-xs text-zinc-600 font-mono">
            {new Date().toLocaleDateString("en-AU", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </div>

          <div className="flex items-center gap-2">
            {/* Tenant switcher */}
            <TenantSwitcher user={user} />

            {/* Live pill */}
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">Live</span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {/* Atlas copilot */}
            <button
              onClick={() => setCopilotOpen(true)}
              title="Atlas — AI copilot  (⌘/)"
              className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 text-indigo-300 hover:bg-indigo-500/20 hover:border-indigo-500/50 transition-colors"
              data-testid="open-copilot"
            >
              <Sparkles size={13} />
              <span className="text-xs font-medium">Atlas</span>
            </button>

            {/* Command palette */}
            <button
              onClick={() => setPaletteOpen(true)}
              title="Command palette  (⌘K)"
              className="hidden sm:flex h-8 items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200 transition-colors"
              data-testid="open-palette"
            >
              <Search size={12} />
              <kbd className="flex items-center gap-0.5 font-mono text-[10px]">
                <Command size={10} />K
              </kbd>
            </button>

            {/* Avatar */}
            <div className="h-7 w-7 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <span className="text-xs font-semibold text-indigo-300">
                {(user?.name || user?.email || "?")[0].toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-y-auto bg-zinc-950">
          {children}
        </main>
      </div>

      {/* Atlas copilot dock + Cmd+K palette */}
      <CopilotDock open={copilotOpen} onClose={() => setCopilotOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenCopilot={() => setCopilotOpen(true)}
      />
    </div>
  );
}
