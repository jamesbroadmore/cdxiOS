import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, formatCurrency } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Search, RefreshCw, List, LayoutGrid, AlertTriangle, ArrowUpRight } from "lucide-react";

const KANBAN_COLS = [
  { id: "draft",     label: "Draft",     color: "zinc",   accent: "text-zinc-400",   ring: "border-zinc-700" },
  { id: "active",    label: "Active",    color: "blue",   accent: "text-blue-400",   ring: "border-blue-500/30" },
  { id: "blocked",   label: "Blocked",   color: "red",    accent: "text-red-400",    ring: "border-red-500/30" },
  { id: "review",    label: "Review",    color: "violet", accent: "text-violet-400", ring: "border-violet-500/30" },
  { id: "delivered", label: "Delivered", color: "emerald",accent: "text-emerald-400",ring: "border-emerald-500/30" },
];

function statusToCol(status) {
  const s = status?.toLowerCase();
  if (!s || s === "not started") return "draft";
  if (s === "in progress" || s === "active" || s === "queued") return "active";
  if (s === "completed" || s === "delivered" || s === "closed") return "delivered";
  if (s === "blocked") return "blocked";
  if (s === "review") return "review";
  return "draft";
}

function RiskBadge({ level }) {
  const map = {
    low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    high: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium uppercase ${map[level] || map.low}`}>
      {level}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = status?.toLowerCase();
  const map = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    "in progress": "bg-blue-500/10 text-blue-400 border-blue-500/20",
    completed: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    blocked: "bg-red-500/10 text-red-400 border-red-500/20",
    draft: "bg-zinc-600/10 text-zinc-500 border-zinc-600/20",
    review: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[s] || "bg-zinc-800 text-zinc-400 border-zinc-700"}`}>
      {status}
    </span>
  );
}

/* ── Kanban card ─────────────────────────────────────── */
function KanbanCard({ project, onDragStart }) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, project)}
      className="group rounded-xl border border-zinc-800 bg-zinc-900 p-3 cursor-grab active:cursor-grabbing hover:border-zinc-700 transition-all space-y-2.5 shadow-sm"
    >
      <div>
        <div className="text-sm font-medium text-white leading-tight">{project.name}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{project.client_name}</div>
      </div>

      <div className="flex items-center justify-between">
        <RiskBadge level={project.risk_level || "low"} />
        <span className="text-xs font-mono text-zinc-400">{formatCurrency(project.budget || project.total_amount)}</span>
      </div>

      {project.milestones?.length > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-zinc-600 mb-1">
            <span>Progress</span><span>{project.progress}%</span>
          </div>
          <div className="h-1 rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                project.progress >= 75 ? "bg-emerald-500" :
                project.progress > 0 ? "bg-indigo-500" : "bg-zinc-700"
              }`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <span>{project.milestones?.length || 0}M</span>
        <span>·</span>
        <span>{project.tasks_total || 0}T</span>
        {project.project_type && (
          <>
            <span>·</span>
            <span className="capitalize">{project.project_type.replace(/_/g, " ")}</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Kanban column ───────────────────────────────────── */
function KanbanColumn({ col, projects, onDrop, onDragOver }) {
  const [isDragOver, setIsDragOver] = useState(false);

  const colorMap = {
    zinc:   "bg-zinc-500/10 text-zinc-400",
    blue:   "bg-blue-500/10 text-blue-400",
    red:    "bg-red-500/10 text-red-400",
    violet: "bg-violet-500/10 text-violet-400",
    emerald:"bg-emerald-500/10 text-emerald-400",
  };

  return (
    <div
      className={`flex-shrink-0 w-64 flex flex-col rounded-xl border transition-colors ${
        isDragOver ? "border-indigo-500/40 bg-indigo-500/5" : "border-zinc-800 bg-zinc-900/30"
      }`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); onDragOver && onDragOver(e); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { setIsDragOver(false); onDrop(e, col.id); }}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${col.accent}`}>{col.label}</span>
        </div>
        <span className={`rounded-full px-1.5 py-px text-[10px] font-mono ${colorMap[col.color]}`}>
          {projects.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
        {projects.map((p) => (
          <KanbanCard key={p.id} project={p} onDragStart={(e, proj) => {
            e.dataTransfer.setData("projectId", proj.id);
            e.dataTransfer.effectAllowed = "move";
          }} />
        ))}
        {projects.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-zinc-700 select-none">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

/* ── New Project Modal ────────────────────────────────── */
function NewProjectModal({ open, onClose, onCreated, clients }) {
  const [form, setForm] = useState({ client_id: "", name: "", project_type: "service", status: "active", risk_level: "low", budget: "" });
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form, budget: form.budget ? parseFloat(form.budget) : null };
      const { data } = await api.post("/projects", payload);
      toast.success(`Project "${data.name}" created`);
      onCreated(data);
      onClose();
      setForm({ client_id: "", name: "", project_type: "service", status: "active", risk_level: "low", budget: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-sm font-semibold text-white mb-4">New Project</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Client *</label>
            <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Project Name *</label>
            <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Type</label>
              <select value={form.project_type} onChange={e => setForm({ ...form, project_type: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                {["service", "retainer", "fixed_price", "internal"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Risk Level</label>
              <select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                {["low", "medium", "high", "critical"].map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Budget (AUD)</label>
            <input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50">
              {loading ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────── */
export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("kanban"); // "list" | "kanban"
  const [showModal, setShowModal] = useState(false);
  const dragProject = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([
        api.get("/projects"),
        api.get("/clients"),
      ]);
      setProjects(pRes.data);
      setClients(cRes.data);
    } catch (err) {
      if (err?.response?.status !== 401) toast.error("Failed to load projects");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = projects.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.client_name?.toLowerCase().includes(search.toLowerCase())
  );

  /* Kanban DnD */
  const handleDragStart = (e, project) => {
    dragProject.current = project;
    e.dataTransfer.setData("projectId", project.id);
  };

  const handleDrop = async (e, targetColId) => {
    e.preventDefault();
    const projectId = e.dataTransfer.getData("projectId");
    if (!projectId) return;
    const colStatusMap = {
      draft: "draft", active: "active", blocked: "blocked",
      review: "review", delivered: "delivered",
    };
    const newStatus = colStatusMap[targetColId] || targetColId;
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: newStatus } : p));
    try {
      await api.patch(`/projects/${projectId}`, { status: newStatus });
    } catch {
      toast.error("Failed to update status");
      load();
    }
  };

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / projects</p>
          <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">Projects</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
        >
          <Plus size={15} /> New Project
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search projects…"
            className="rounded-lg border border-zinc-700 bg-zinc-900 pl-8 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none w-52"
          />
        </div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
          <RefreshCw size={12} /> Refresh
        </button>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          <button
            onClick={() => setView("kanban")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${view === "kanban" ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            <LayoutGrid size={12} /> Kanban
          </button>
          <button
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors ${view === "list" ? "bg-indigo-500 text-white" : "text-zinc-400 hover:text-white"}`}
          >
            <List size={12} /> List
          </button>
        </div>

        <span className="text-xs text-zinc-500">{filtered.length} project{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Kanban View ── */}
      {view === "kanban" && (
        <div className="overflow-x-auto pb-2 -mx-2 px-2">
          <div className="flex gap-3 min-w-max">
            {KANBAN_COLS.map(col => (
              <KanbanColumn
                key={col.id}
                col={col}
                projects={filtered.filter(p => statusToCol(p.status) === col.id)}
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
              />
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-xs text-zinc-600">No projects found</div>
          )}
        </div>
      )}

      {/* ── List View ── */}
      {view === "list" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
          <div className="hidden lg:grid grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_40px] gap-4 border-b border-zinc-800 bg-zinc-900/50 px-5 py-3">
            {["Project", "Client", "Type", "Status", "Risk", "Budget", ""].map(h =>
              <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
            )}
          </div>

          {filtered.length === 0 && (
            <div className="py-12 text-center text-xs text-zinc-600">No projects found</div>
          )}

          {filtered.map(p => (
            <div key={p.id} className="group grid grid-cols-1 gap-2 border-b border-zinc-800/50 last:border-0 px-5 py-4 hover:bg-zinc-800/20 lg:grid-cols-[2fr_1.5fr_1fr_1fr_1fr_1fr_40px] lg:items-center lg:gap-4">
              <div>
                <div className="text-sm font-medium text-white">{p.name}</div>
                <div className="text-xs text-zinc-500">{p.milestones?.length || 0} milestones</div>
              </div>
              <div className="text-sm text-zinc-400">{p.client_name}</div>
              <div className="text-xs text-zinc-500 capitalize">{p.project_type?.replace(/_/g, " ")}</div>
              <div><StatusBadge status={p.status} /></div>
              <div><RiskBadge level={p.risk_level || "low"} /></div>
              <div className="text-sm text-zinc-300">{formatCurrency(p.budget || p.total_amount)}</div>
              <div className="hidden lg:flex justify-end">
                <ArrowUpRight size={14} className="text-zinc-600 group-hover:text-indigo-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}

      <NewProjectModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(p) => { setProjects(prev => [p, ...prev]); }}
        clients={clients}
      />
    </div>
  );
}
