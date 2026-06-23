import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, ArrowRight, Sparkles, Command, Users, FolderKanban, Clock, FileText, Bot, LayoutDashboard, Settings,
} from "lucide-react";
import { api } from "@/lib/api";

const STATIC = [
  { id: "go-home",       title: "Go to Dashboard", kind: "Navigate", icon: LayoutDashboard, to: "/" },
  { id: "go-clients",    title: "Go to Clients",   kind: "Navigate", icon: Users,           to: "/clients" },
  { id: "go-projects",   title: "Go to Projects",  kind: "Navigate", icon: FolderKanban,    to: "/projects" },
  { id: "go-billing",    title: "Go to Billing",   kind: "Navigate", icon: Clock,           to: "/billing" },
  { id: "go-contracts",  title: "Go to Contracts", kind: "Navigate", icon: FileText,        to: "/contracts" },
  { id: "go-agents",     title: "Go to AI Ops",    kind: "Navigate", icon: Bot,             to: "/agents" },
  { id: "go-settings",   title: "Go to Settings",  kind: "Navigate", icon: Settings,        to: "/settings" },
  { id: "ask-atlas",     title: "Ask Atlas — AI copilot", kind: "AI", icon: Sparkles,      action: "copilot" },
];

export default function CommandPalette({ open, onClose, onOpenCopilot }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [entities, setEntities] = useState({ clients: [], projects: [], invoices: [] });
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [c, p, i] = await Promise.all([api.get("/clients"), api.get("/projects"), api.get("/invoices")]);
        setEntities({
          clients: Array.isArray(c.data) ? c.data : c.data.items || [],
          projects: Array.isArray(p.data) ? p.data : p.data.items || [],
          invoices: Array.isArray(i.data) ? i.data : i.data.items || [],
        });
      } catch {}
    })();
  }, [open]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => { if (!open) setQ(""); }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const filteredStatic = STATIC.filter((a) => !s || a.title.toLowerCase().includes(s) || a.kind.toLowerCase().includes(s));
    if (!s) return filteredStatic;
    const hits = (arr, type, icon, route, getName, getSub) => arr
      .filter((x) => (getName(x) || "").toLowerCase().includes(s))
      .slice(0, 4)
      .map((x) => ({ id: `${type}-${x.id}`, title: getName(x), subtitle: getSub(x) || "", kind: type, icon, to: route }));
    return [
      ...hits(entities.clients, "Client", Users, "/clients", (c) => c.name, (c) => c.trading_name || c.email || c.lifecycle_stage),
      ...hits(entities.projects, "Project", FolderKanban, "/projects", (p) => p.name, (p) => p.status),
      ...hits(entities.invoices, "Invoice", FileText, "/billing", (i) => i.invoice_number, (i) => i.status),
      ...filteredStatic,
    ];
  }, [q, entities]);

  const run = (a) => {
    onClose?.();
    if (a.action === "copilot") onOpenCopilot?.();
    else if (a.to) nav(a.to);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && results[idx]) { e.preventDefault(); run(results[idx]); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, idx, results]); // eslint-disable-line

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-24 p-4" onClick={onClose}>
      <div className="bg-background border rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Search clients, projects, invoices or run a command…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none text-lg tracking-tight"
          />
          <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border text-muted-foreground">ESC</kbd>
        </div>
        <div className="max-h-96 overflow-auto p-1.5">
          {results.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No results</div>}
          {results.map((a, i) => {
            const Icon = a.icon || Command;
            return (
              <button
                key={a.id}
                onClick={() => run(a)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition ${i === idx ? "bg-muted" : ""}`}
              >
                <div className="w-7 h-7 rounded-lg bg-muted grid place-items-center">
                  {a.kind === "AI" ? <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> : <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{a.title}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate">
                    {a.kind}{a.subtitle ? ` · ${a.subtitle}` : ""}
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t flex items-center justify-between text-[10px] text-muted-foreground font-mono">
          <span>↑↓ navigate · ↵ select</span>
          <span className="flex items-center gap-1"><Command className="w-2.5 h-2.5" /> K</span>
        </div>
      </div>
    </div>
  );
}
