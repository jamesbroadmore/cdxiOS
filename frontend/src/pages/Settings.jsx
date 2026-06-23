import React, { useEffect, useState, useCallback } from "react";
import { api, formatDateTime, formatDate } from "@/lib/api";
import { toast } from "sonner";
import { Plus, RefreshCw, Building2, X } from "lucide-react";

const ROLES = ["admin", "account_manager", "viewer"];

function RoleBadge({ role }) {
  const map = {
    admin: "bg-red-500/10 text-red-400 border-red-500/20",
    account_manager: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    viewer: "bg-zinc-700 text-zinc-400 border-zinc-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${map[role] || map.viewer}`}>
      {role?.replace(/_/g, " ")}
    </span>
  );
}

function NewUserModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ email: "", display_name: "", role: "account_manager", password: "" });
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/users", form);
      toast.success(`User ${data.display_name} created`);
      onCreated(data);
      onClose();
      setForm({ email: "", display_name: "", role: "account_manager", password: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create user");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-sm font-semibold text-white mb-4">New User</h3>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Display Name *</label>
            <input required value={form.display_name} onChange={e=>setForm({...form,display_name:e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Password *</label>
            <input required type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Role</label>
            <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50">
              {loading ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Settings() {
  const [users, setUsers] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("users");
  const [showModal, setShowModal] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);

  // New rate card form
  const [rcForm, setRcForm] = useState({ name: "", currency: "AUD", effective_from: new Date().toISOString().slice(0,10), rates: "{\"hourly\": 150}" });
  const [savingRc, setSavingRc] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rcRes, auRes, tRes] = await Promise.all([
        api.get("/users"),
        api.get("/rate-cards"),
        api.get("/audit-log", { params: { limit: 30 } }),
        api.get("/tenants"),
      ]);
      setUsers(uRes.data);
      setRateCards(rcRes.data);
      setAuditLog(auRes.data);
      setTenants(tRes.data);
    } catch { toast.error("Failed to load settings"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveRateCard = async (e) => {
    e.preventDefault();
    setSavingRc(true);
    try {
      let rates;
      try { rates = JSON.parse(rcForm.rates); } catch { toast.error("Rates must be valid JSON"); setSavingRc(false); return; }
      const { data } = await api.post("/rate-cards", { ...rcForm, rates });
      setRateCards(prev => [data, ...prev]);
      setRcForm({ name: "", currency: "AUD", effective_from: new Date().toISOString().slice(0,10), rates: '{"hourly": 150}' });
      toast.success("Rate card created");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create rate card");
    } finally { setSavingRc(false); }
  };

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / settings</p>
        <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">Settings</h1>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {[
          {k:"users",l:"Users & Roles"},
          {k:"tenants",l:"Tenants"},
          {k:"rate-cards",l:"Rate Cards"},
          {k:"audit",l:"Audit Log"},
        ].map(({k,l}) => (
          <button key={k} data-testid={`settings-tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab===k ? "border-indigo-500 text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>{l}
          </button>
        ))}
      </div>

      {tab === "tenants" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="text-xs text-zinc-500">
              Tenants isolate clients, projects, billing, and audit logs.
              {tenants.length > 0 && <> Currently {tenants.length} tenant{tenants.length !== 1 ? "s" : ""}.</>}
            </div>
            <button
              data-testid="add-tenant-btn"
              onClick={() => setShowTenantModal(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600"
            >
              <Plus size={14} /> New Tenant
            </button>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="hidden lg:grid grid-cols-[2fr_1.5fr_1fr_1fr] gap-4 border-b border-zinc-800 px-5 py-3">
              {["Name", "Slug", "Status", "Created"].map(h =>
                <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
              )}
            </div>
            {tenants.length === 0 && (
              <div className="py-12 text-center text-xs text-zinc-600">No tenants yet</div>
            )}
            {tenants.map(t => (
              <div key={t.id} data-testid={`tenant-row-${t.slug}`} className="grid grid-cols-1 gap-2 border-b border-zinc-800/50 last:border-0 px-5 py-4 lg:grid-cols-[2fr_1.5fr_1fr_1fr] lg:items-center lg:gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center">
                    <Building2 size={14} className="text-indigo-300" />
                  </div>
                  <span className="text-sm font-medium text-white">{t.name}</span>
                </div>
                <div className="font-mono text-xs text-zinc-400">{t.slug}</div>
                <div>
                  <span className={`text-xs capitalize ${t.status === "active" ? "text-emerald-400" : "text-zinc-500"}`}>
                    {t.status}
                  </span>
                </div>
                <div className="text-xs text-zinc-500">{formatDate(t.created_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "users" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600">
              <Plus size={14} /> Add User
            </button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="hidden lg:grid grid-cols-[2fr_2fr_1fr_1fr] gap-4 border-b border-zinc-800 px-5 py-3">
              {["Name","Email","Role","Status"].map(h=>
                <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
              )}
            </div>
            {users.map(u => (
              <div key={u.id} className="grid grid-cols-1 gap-2 border-b border-zinc-800/50 last:border-0 px-5 py-4 lg:grid-cols-[2fr_2fr_1fr_1fr] lg:items-center lg:gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xs font-bold text-indigo-300">
                    {(u.display_name || u.name || u.email)[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-white">{u.display_name || u.name}</span>
                </div>
                <div className="text-sm text-zinc-400">{u.email}</div>
                <div><RoleBadge role={u.role} /></div>
                <div>
                  <span className={`text-xs capitalize ${ u.status === "active" ? "text-emerald-400" : "text-zinc-500" }`}>
                    {u.status || "active"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "rate-cards" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4">New Rate Card</h3>
            <form onSubmit={saveRateCard} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Name *</label>
                  <input required value={rcForm.name} onChange={e=>setRcForm({...rcForm,name:e.target.value})}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Currency</label>
                  <select value={rcForm.currency} onChange={e=>setRcForm({...rcForm,currency:e.target.value})}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                    {["AUD","USD","GBP","EUR"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Effective From</label>
                <input type="date" value={rcForm.effective_from} onChange={e=>setRcForm({...rcForm,effective_from:e.target.value})}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Rates (JSON) *</label>
                <textarea value={rcForm.rates} onChange={e=>setRcForm({...rcForm,rates:e.target.value})}
                  rows={3} placeholder='{"hourly": 150, "daily": 1200}'
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none resize-none" />
              </div>
              <button type="submit" disabled={savingRc}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50">
                {savingRc ? "Saving…" : "Create Rate Card"}
              </button>
            </form>
          </div>

          <div className="space-y-3">
            {rateCards.map(rc => (
              <div key={rc.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{rc.name}</div>
                    <div className="text-xs text-zinc-500">{rc.currency} · Effective {formatDate(rc.effective_from)}</div>
                  </div>
                  {rc.is_default && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5">Default</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-4">
                  {Object.entries(rc.rates || {}).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[10px] text-zinc-500 uppercase">{k}</div>
                      <div className="text-sm font-semibold text-white">{rc.currency} {v}/unit</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="hidden lg:grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 border-b border-zinc-800 px-5 py-3">
              {["Event","Object","Actor","When"].map(h=>
                <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
              )}
            </div>
            {auditLog.length === 0 && <div className="py-8 text-center text-xs text-zinc-600">No audit entries</div>}
            {auditLog.map(e => (
              <div key={e.event_id} className="grid grid-cols-1 gap-1 border-b border-zinc-800/50 last:border-0 px-5 py-3 lg:grid-cols-[2fr_1fr_1.5fr_1fr] lg:items-center lg:gap-4">
                <div className="text-sm text-white font-medium">{e.event_name}</div>
                <div className="text-xs text-zinc-500 capitalize">{e.object_type}</div>
                <div className="text-xs text-zinc-400 font-mono truncate">{e.actor_id?.slice(0,8)}…</div>
                <div className="text-xs text-zinc-500">{formatDateTime(e.occurred_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <NewUserModal open={showModal} onClose={() => setShowModal(false)} onCreated={u => setUsers(prev => [...prev, u])} />
      <NewTenantModal
        open={showTenantModal}
        onClose={() => setShowTenantModal(false)}
        onCreated={t => setTenants(prev => [...prev, t])}
      />
    </div>
  );
}

function NewTenantModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", slug: "" });
  const [loading, setLoading] = useState(false);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { name: form.name.trim() };
      if (form.slug.trim()) payload.slug = form.slug.trim();
      const { data } = await api.post("/tenants", payload);
      toast.success(`Tenant "${data.name}" created`);
      onCreated(data);
      onClose();
      setForm({ name: "", slug: "" });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create tenant");
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Building2 size={14} className="text-indigo-400" /> New Tenant
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Tenant Name *</label>
            <input
              required autoFocus
              data-testid="new-tenant-name-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Cosmic Brand Portal"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Slug (optional)</label>
            <input
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value })}
              placeholder="auto-generated from name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50"
            />
            <div className="mt-1 text-[10px] text-zinc-600">URL-safe identifier. Will be auto-derived if left blank.</div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
            New tenants start empty. Admin users can switch into them from the header pill, then create clients/projects scoped to that tenant.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800">Cancel</button>
            <button
              type="submit"
              data-testid="new-tenant-submit-btn"
              disabled={loading || !form.name.trim()}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50"
            >
              {loading ? "Creating…" : "Create Tenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
