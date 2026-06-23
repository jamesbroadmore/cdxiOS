import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, formatCurrency, formatDate } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, Search, Filter, ArrowUpRight, Users, TrendingUp,
  ChevronDown, Tag, AlertCircle, RefreshCw
} from "lucide-react";

const LIFECYCLE_OPTS = ["lead","qualified","onboarding","active","renewal","churned"];
const STATUS_OPTS = ["prospect","active","at_risk","churned","paused"];
const BILLING_OPTS = ["hourly","retainer","consumption","hybrid","fixed"];

function StatusBadge({ status }) {
  const map = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    at_risk: "bg-red-500/10 text-red-400 border-red-500/20",
    churned: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status] || "bg-zinc-800 text-zinc-400"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function LifecycleBadge({ stage }) {
  const map = {
    lead: "text-zinc-400",
    qualified: "text-blue-400",
    onboarding: "text-violet-400",
    active: "text-emerald-400",
    renewal: "text-amber-400",
    churned: "text-red-400",
  };
  return <span className={`text-xs font-medium ${map[stage] || "text-zinc-500"}`}>{stage}</span>;
}

function HealthBar({ score }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-400">{Math.round(score)}</span>
    </div>
  );
}

function NewClientModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", email: "", billing_model: "hourly", lifecycle_stage: "lead", status: "prospect" });
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/clients", form);
      toast.success(`Client "${data.name}" created`);
      onCreated(data);
      onClose();
      setForm({ name: "", email: "", billing_model: "hourly", lifecycle_stage: "lead", status: "prospect" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create client");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-sm font-semibold text-white mb-4">New Client</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Name *</label>
            <input
              required value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500/60 focus:outline-none"
              placeholder="Company or person name"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Email</label>
            <input
              type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500/60 focus:outline-none"
              placeholder="contact@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Billing Model</label>
              <select value={form.billing_model} onChange={e => setForm({...form, billing_model: e.target.value})}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                {BILLING_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Lifecycle Stage</label>
              <select value={form.lifecycle_stage} onChange={e => setForm({...form, lifecycle_stage: e.target.value})}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                {LIFECYCLE_OPTS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50 transition-colors">
              {loading ? "Creating…" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/clients", { params });
      setClients(data);
    } catch (err) {
      if (err?.response?.status !== 401) toast.error("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / crm</p>
          <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">Clients</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors"
        >
          <Plus size={15} />
          New Client
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            className="rounded-lg border border-zinc-700 bg-zinc-900 pl-8 pr-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500/60 focus:outline-none w-56"
          />
        </div>
        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 focus:outline-none"
        >
          <option value="">All statuses</option>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
          <RefreshCw size={12} />
          Refresh
        </button>
        <span className="ml-auto text-xs text-zinc-500">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        {/* Header row */}
        <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 border-b border-zinc-800 bg-zinc-900/50 px-5 py-3">
          {["Client","Status","Lifecycle","Billing Model","Health",""].map(h => (
            <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
            Loading…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-xs text-zinc-600">
            {search || statusFilter ? "No clients match filters" : "No clients yet"}
          </div>
        )}

        {!loading && filtered.map((c, idx) => (
          <button
            key={c.id}
            onClick={() => navigate(`/clients/${c.id}`)}
            className="group grid w-full grid-cols-1 gap-2 border-b border-zinc-800/50 last:border-b-0 px-5 py-4 text-left hover:bg-zinc-800/30 transition-colors lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] lg:items-center lg:gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                {c.name[0].toUpperCase()}
              </div>
              <div>
                <div className="text-sm font-medium text-white">{c.name}</div>
                {c.email && <div className="text-xs text-zinc-500">{c.email}</div>}
              </div>
            </div>
            <div><StatusBadge status={c.status} /></div>
            <div><LifecycleBadge stage={c.lifecycle_stage} /></div>
            <div className="text-xs text-zinc-400 capitalize">{c.billing_model}</div>
            <div><HealthBar score={c.health_score ?? 100} /></div>
            <div className="hidden lg:flex justify-end">
              <ArrowUpRight size={15} className="text-zinc-600 group-hover:text-indigo-400 transition-colors" />
            </div>
          </button>
        ))}
      </div>

      <NewClientModal open={showModal} onClose={() => setShowModal(false)} onCreated={c => { setClients(prev => [c, ...prev]); }} />
    </div>
  );
}
