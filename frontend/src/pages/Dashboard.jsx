import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, formatCurrency, formatDateTime } from "@/lib/api";
import { toast } from "sonner";
import {
  Users, FolderKanban, TrendingUp, AlertCircle, Clock,
  Bot, ArrowUpRight, Activity, ChevronRight, Timer, Eye
} from "lucide-react";

function KpiCard({ label, value, sub, icon: Icon, accent = "default", trend }) {
  const accents = {
    default: "text-zinc-400 bg-zinc-800/50 border-zinc-700/50",
    success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    danger: "text-red-400 bg-red-500/10 border-red-500/20",
    warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  };
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`rounded-lg border p-2 ${accents[accent]}`}>
          <Icon size={16} />
        </div>
        {trend !== undefined && (
          <span className={`text-xs font-mono ${ trend >= 0 ? "text-emerald-400" : "text-red-400" }`}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-white tracking-tight">{value}</div>
        <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function AgentStatusBadge({ status }) {
  const map = {
    complete: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    escalated: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status] || map.cancelled}`}>
      {status}
    </span>
  );
}

function HealthBar({ score }) {
  const color = score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-full bg-zinc-800 h-1.5">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-zinc-400 font-mono w-8 text-right">{Math.round(score)}</span>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: d } = await api.get("/dashboard");
      setData(d);
    } catch (err) {
      if (err?.response?.status !== 401) toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
      </div>
    );
  }

  const kpis = data || {};

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / overview</p>
        <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">Control Centre</h1>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Total Clients"
          value={kpis.total_clients ?? 0}
          sub={`${kpis.active_clients ?? 0} active`}
          icon={Users}
          accent="indigo"
        />
        <KpiCard
          label="Active Projects"
          value={kpis.active_projects ?? 0}
          icon={FolderKanban}
          accent="default"
        />
        <KpiCard
          label="Revenue Pipeline"
          value={formatCurrency(kpis.revenue_pipeline ?? 0)}
          sub="outstanding"
          icon={TrendingUp}
          accent="success"
        />
        <KpiCard
          label="Overdue AR"
          value={formatCurrency(kpis.overdue_payments ?? 0)}
          sub="past due date"
          icon={AlertCircle}
          accent={kpis.overdue_payments > 0 ? "danger" : "default"}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500">Active Timers</span>
          </div>
          <div className="text-xl font-bold text-white">{kpis.active_timers ?? 0}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bot size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500">Pending Reviews</span>
          </div>
          <div className="text-xl font-bold text-white">
            <span className={kpis.pending_reviews > 0 ? "text-amber-400" : ""}>{kpis.pending_reviews ?? 0}</span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-zinc-500" />
            <span className="text-xs text-zinc-500">At-Risk Clients</span>
          </div>
          <div className="text-xl font-bold text-white">
            <span className={kpis.at_risk_clients > 0 ? "text-red-400" : ""}>{kpis.at_risk_clients ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Two-col layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Recent Activity */}
        <div className="lg:col-span-3 rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-zinc-500" />
              <span className="text-sm font-medium text-zinc-200">Recent Activity</span>
            </div>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {(kpis.recent_events || []).slice(0, 8).map((evt) => (
              <div key={evt.event_id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-300 font-medium">{evt.event_name}</div>
                  <div className="text-xs text-zinc-500">{evt.object_type} · {formatDateTime(evt.occurred_at)}</div>
                </div>
              </div>
            ))}
            {(!kpis.recent_events || kpis.recent_events.length === 0) && (
              <div className="px-4 py-8 text-center text-xs text-zinc-600">No activity yet</div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2 space-y-4">
          {/* Agent runs */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-200">Recent Agent Runs</span>
              </div>
              <Link to="/agents" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                View all <ChevronRight size={12} />
              </Link>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {(kpis.recent_agent_runs || []).slice(0, 4).map((run) => (
                <div key={run.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <div className="text-xs text-zinc-300 capitalize">{run.agent_type?.replace(/_/g, " ")}</div>
                    <div className="text-[10px] text-zinc-600">{formatDateTime(run.started_at)}</div>
                  </div>
                  <AgentStatusBadge status={run.execution_status} />
                </div>
              ))}
              {(!kpis.recent_agent_runs || kpis.recent_agent_runs.length === 0) && (
                <div className="px-4 py-6 text-center text-xs text-zinc-600">No agent runs yet</div>
              )}
            </div>
          </div>

          {/* Health distribution */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={14} className="text-zinc-500" />
              <span className="text-sm font-medium text-zinc-200">Client Health</span>
            </div>
            <div className="space-y-2">
              {[
                { label: "Healthy (75–100)", key: "healthy", color: "bg-emerald-500" },
                { label: "Moderate (50–74)", key: "moderate", color: "bg-amber-500" },
                { label: "At Risk (0–49)", key: "at_risk", color: "bg-red-500" },
              ].map(({ label, key, color }) => {
                const total = Object.values(kpis.health_distribution || {}).reduce((a, b) => a + b, 0) || 1;
                const count = kpis.health_distribution?.[key] || 0;
                const pct = Math.round((count / total) * 100);
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs text-zinc-500 mb-1">
                      <span>{label}</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-800">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent invoices */}
      {kpis.recent_invoices && kpis.recent_invoices.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="text-sm font-medium text-zinc-200">Recent Invoices</span>
            <Link to="/billing" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {kpis.recent_invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-xs font-medium text-zinc-300">{inv.invoice_number}</div>
                  <div className="text-xs text-zinc-500">{inv.client_name} · due {inv.due_date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-white">{formatCurrency(inv.total_amount)}</div>
                  <InvoiceStatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceStatusBadge({ status }) {
  const map = {
    draft: "text-zinc-400",
    sent: "text-blue-400",
    paid: "text-emerald-400",
    overdue: "text-red-400",
    disputed: "text-amber-400",
  };
  return <span className={`text-[10px] font-medium uppercase ${map[status] || "text-zinc-500"}`}>{status}</span>;
}
