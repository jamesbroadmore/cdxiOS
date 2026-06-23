import React, { useEffect, useState, useCallback, useRef } from "react";
import { api, formatCurrency, formatDate, formatDateTime, formatDuration } from "@/lib/api";
import { toast } from "sonner";
import {
  Plus, Play, Square, Clock, FileText, Send, CheckCircle,
  RefreshCw, ChevronDown, Zap, CreditCard
} from "lucide-react";

function InvoiceStatusBadge({ status }) {
  const map = {
    draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
    review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    sent: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    overdue: "bg-red-500/10 text-red-400 border-red-500/20",
    disputed: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    voided: "bg-zinc-700 text-zinc-500 border-zinc-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

function ActiveTimer({ timer, onStop }) {
  const [elapsed, setElapsed] = useState(timer.elapsed_secs || 0);

  useEffect(() => {
    const started = new Date(timer.started_at);
    const tick = () => {
      setElapsed(Math.floor((Date.now() - started.getTime()) / 1000));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timer.started_at]);

  return (
    <div className="flex items-center justify-between rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      <div className="flex items-center gap-3">
        <div className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
        <div>
          <div className="text-sm font-medium text-white">{timer.client_name}</div>
          <div className="text-xs text-zinc-400">{timer.description || "No description"}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-lg font-mono font-bold text-indigo-300">{formatDuration(elapsed)}</div>
          <div className="text-[10px] text-zinc-500">elapsed</div>
        </div>
        <button
          onClick={() => onStop(timer.id)}
          className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
        >
          <Square size={11} fill="currentColor" /> Stop
        </button>
      </div>
    </div>
  );
}

export default function Billing() {
  const [clients, setClients] = useState([]);
  const [activeTimers, setActiveTimers] = useState([]);
  const [timers, setTimers] = useState([]);
  const [usageEvents, setUsageEvents] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [rateCards, setRateCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("timers");

  // Timer start form
  const [timerForm, setTimerForm] = useState({ client_id: "", description: "", is_billable: true });

  // Invoice generate form
  const [invForm, setInvForm] = useState({
    client_id: "", period_start: new Date().toISOString().slice(0,7)+"-01",
    period_end: new Date().toISOString().slice(0,10), due_date: "", notes: ""
  });
  const [generatingInv, setGeneratingInv] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, atRes, tRes, ueRes, invRes, rcRes] = await Promise.all([
        api.get("/clients"),
        api.get("/timers/active"),
        api.get("/timers", { params: { status_filter: "stopped" } }),
        api.get("/usage-events"),
        api.get("/invoices"),
        api.get("/rate-cards"),
      ]);
      setClients(cRes.data);
      setActiveTimers(atRes.data);
      setTimers(tRes.data);
      setUsageEvents(ueRes.data);
      setInvoices(invRes.data);
      setRateCards(rcRes.data);
    } catch (err) {
      if (err?.response?.status !== 401) toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const startTimer = async () => {
    if (!timerForm.client_id) { toast.error("Select a client"); return; }
    try {
      const { data } = await api.post("/timers/start", timerForm);
      setActiveTimers(prev => [...prev, data]);
      setTimerForm(prev => ({ ...prev, description: "" }));
      toast.success("Timer started");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to start timer");
    }
  };

  const stopTimer = async (id) => {
    try {
      const { data } = await api.post(`/timers/${id}/stop`);
      setActiveTimers(prev => prev.filter(t => t.id !== id));
      setTimers(prev => [data.timer, ...prev]);
      if (data.usage_event) setUsageEvents(prev => [data.usage_event, ...prev]);
      toast.success(`Timer stopped — ${formatCurrency(data.usage_event?.billable_amount || 0)} logged`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to stop timer");
    }
  };

  const generateInvoice = async (e) => {
    e.preventDefault();
    if (!invForm.client_id) { toast.error("Select a client"); return; }
    setGeneratingInv(true);
    try {
      const { data } = await api.post("/invoices/generate", invForm);
      setInvoices(prev => [data, ...prev]);
      toast.success(`Invoice ${data.invoice_number} generated — ${formatCurrency(data.total_amount)}`);
      setTab("invoices");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to generate invoice");
    } finally {
      setGeneratingInv(false);
    }
  };

  const sendInvoice = async (id) => {
    try {
      await api.post(`/invoices/${id}/send`);
      setInvoices(prev => prev.map(inv => inv.id === id ? {...inv, status: "sent"} : inv));
      toast.success("Invoice marked as sent");
    } catch { toast.error("Failed to send invoice"); }
  };

  const markPaid = async (id, total) => {
    try {
      const { data } = await api.patch(`/invoices/${id}`, { amount_paid: total });
      setInvoices(prev => prev.map(inv => inv.id === id ? data : inv));
      toast.success("Invoice marked as paid");
    } catch { toast.error("Failed to update invoice"); }
  };

  const payWithStripe = async (id) => {
    try {
      const { data } = await api.post(`/invoices/${id}/checkout`, { origin_url: window.location.origin });
      if (data?.url) {
        toast.success("Redirecting to Stripe…");
        window.location.href = data.url;
      } else {
        toast.error("Stripe session URL missing");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Stripe checkout failed");
    }
  };

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
    </div>
  );

  const totalUnbilled = usageEvents
    .filter(e => !e.invoice_id && e.is_billable)
    .reduce((s, e) => s + (e.billable_amount || 0), 0);

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / billing</p>
        <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">Time &amp; Billing</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2"><Clock size={13} className="text-zinc-500" /><span className="text-xs text-zinc-500">Active Timers</span></div>
          <div className="text-2xl font-bold text-white">{activeTimers.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2"><Zap size={13} className="text-zinc-500" /><span className="text-xs text-zinc-500">Unbilled</span></div>
          <div className="text-2xl font-bold text-amber-400">{formatCurrency(totalUnbilled)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2"><FileText size={13} className="text-zinc-500" /><span className="text-xs text-zinc-500">Total Invoices</span></div>
          <div className="text-2xl font-bold text-white">{invoices.length}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-2 mb-2"><CheckCircle size={13} className="text-zinc-500" /><span className="text-xs text-zinc-500">Paid Invoices</span></div>
          <div className="text-2xl font-bold text-emerald-400">{invoices.filter(i=>i.status==="paid").length}</div>
        </div>
      </div>

      {/* Active timers */}
      {activeTimers.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-300">Active Timers</h3>
          {activeTimers.map(t => <ActiveTimer key={t.id} timer={t} onStop={stopTimer} />)}
        </div>
      )}

      {/* Start timer */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="text-sm font-semibold text-zinc-300 mb-3">Start Timer</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={timerForm.client_id} onChange={e=>setTimerForm({...timerForm,client_id:e.target.value})}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
            <option value="">Select client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input value={timerForm.description} onChange={e=>setTimerForm({...timerForm,description:e.target.value})}
            placeholder="Description (optional)"
            className="flex-1 min-w-40 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none" />
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input type="checkbox" checked={timerForm.is_billable} onChange={e=>setTimerForm({...timerForm,is_billable:e.target.checked})}
              className="rounded accent-indigo-500" />
            Billable
          </label>
          <button onClick={startTimer}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600 transition-colors">
            <Play size={13} fill="currentColor" /> Start
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex gap-1 border-b border-zinc-800 mb-4">
          {[{k:"timers",l:"Timer History"},{k:"usage",l:"Usage Events"},{k:"invoices",l:"Invoices"},{k:"generate",l:"Generate Invoice"},{k:"rate-cards",l:"Rate Cards"}].map(({k,l}) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab===k ? "border-indigo-500 text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "timers" && (
          <div className="space-y-2">
            {timers.length === 0 && <div className="py-8 text-center text-xs text-zinc-600">No completed timers yet</div>}
            {timers.slice(0,20).map(t => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <div>
                  <div className="text-sm text-white">{t.client_name}</div>
                  <div className="text-xs text-zinc-500">{t.description || "No description"} · {formatDateTime(t.started_at)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-mono text-zinc-300">{formatDuration(t.duration_secs)}</div>
                  {t.is_billable && <div className="text-xs text-emerald-400">{formatCurrency(t.duration_secs / 3600 * 150)}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "usage" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-zinc-800 px-5 py-3">
              {["Client","Units","Rate","Amount","Date"].map(h=>
                <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
              )}
            </div>
            {usageEvents.length === 0 && <div className="py-8 text-center text-xs text-zinc-600">No usage events yet</div>}
            {usageEvents.slice(0,30).map(e => (
              <div key={e.id} className="grid grid-cols-1 gap-2 border-b border-zinc-800/50 last:border-0 px-5 py-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr] lg:items-center lg:gap-4">
                <div>
                  <div className="text-sm text-white">{e.client_name}</div>
                  <div className="text-xs text-zinc-500 truncate">{e.description}</div>
                </div>
                <div className="text-xs text-zinc-400">{e.units?.toFixed(2)} {e.unit_label}</div>
                <div className="text-xs text-zinc-400">{formatCurrency(e.unit_rate)}/hr</div>
                <div className="text-sm font-medium">
                  <span className={e.invoice_id ? "text-zinc-500" : "text-emerald-400"}>{formatCurrency(e.billable_amount)}</span>
                  {e.invoice_id && <span className="ml-1 text-[10px] text-zinc-600">invoiced</span>}
                </div>
                <div className="text-xs text-zinc-500">{formatDate(e.occurred_at)}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "invoices" && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
            <div className="hidden lg:grid grid-cols-[1fr_2fr_1fr_1fr_1fr_180px] gap-4 border-b border-zinc-800 px-5 py-3">
              {["Invoice #","Client","Total","Due","Status","Actions"].map(h=>
                <div key={h} className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">{h}</div>
              )}
            </div>
            {invoices.length === 0 && <div className="py-8 text-center text-xs text-zinc-600">No invoices yet</div>}
            {invoices.map(inv => (
              <div key={inv.id} data-testid={`invoice-row-${inv.invoice_number}`} className="grid grid-cols-1 gap-2 border-b border-zinc-800/50 last:border-0 px-5 py-4 lg:grid-cols-[1fr_2fr_1fr_1fr_1fr_180px] lg:items-center lg:gap-4">
                <div className="font-mono text-xs text-zinc-300">{inv.invoice_number}</div>
                <div className="text-sm text-white">{inv.client_name}</div>
                <div className="text-sm font-semibold text-white">{formatCurrency(inv.total_amount)}</div>
                <div className="text-xs text-zinc-400">{formatDate(inv.due_date)}</div>
                <div><InvoiceStatusBadge status={inv.status} /></div>
                <div className="flex items-center gap-2 flex-wrap">
                  {inv.status === "draft" && (
                    <button data-testid={`invoice-send-btn-${inv.invoice_number}`} onClick={() => sendInvoice(inv.id)}
                      className="flex items-center gap-1 rounded-lg bg-blue-500/10 border border-blue-500/20 px-2 py-1 text-[10px] text-blue-400 hover:bg-blue-500/20">
                      <Send size={10} /> Send
                    </button>
                  )}
                  {["sent","overdue","draft"].includes(inv.status) && (
                    <button data-testid={`invoice-stripe-pay-btn-${inv.invoice_number}`} onClick={() => payWithStripe(inv.id)}
                      className="flex items-center gap-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-2 py-1 text-[10px] text-indigo-300 hover:bg-indigo-500/20">
                      <CreditCard size={10} /> Pay
                    </button>
                  )}
                  {["sent","overdue"].includes(inv.status) && (
                    <button data-testid={`invoice-mark-paid-btn-${inv.invoice_number}`} onClick={() => markPaid(inv.id, inv.total_amount)}
                      className="flex items-center gap-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-400 hover:bg-emerald-500/20">
                      <CheckCircle size={10} /> Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "generate" && (
          <div className="max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4">Generate Invoice from Usage</h3>
            <form onSubmit={generateInvoice} className="space-y-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Client *</label>
                <select required value={invForm.client_id} onChange={e=>setInvForm({...invForm,client_id:e.target.value})}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Period Start</label>
                  <input type="date" value={invForm.period_start} onChange={e=>setInvForm({...invForm,period_start:e.target.value})}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Period End</label>
                  <input type="date" value={invForm.period_end} onChange={e=>setInvForm({...invForm,period_end:e.target.value})}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Due Date</label>
                <input type="date" value={invForm.due_date} onChange={e=>setInvForm({...invForm,due_date:e.target.value})}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Notes</label>
                <textarea value={invForm.notes} onChange={e=>setInvForm({...invForm,notes:e.target.value})}
                  rows={2} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none resize-none" />
              </div>
              <button type="submit" disabled={generatingInv}
                className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
                {generatingInv ? "Generating…" : "Generate Invoice"}
              </button>
            </form>
          </div>
        )}

        {tab === "rate-cards" && (
          <div className="space-y-3">
            {rateCards.length === 0 && <div className="py-8 text-center text-xs text-zinc-600">No rate cards</div>}
            {rateCards.map(rc => (
              <div key={rc.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{rc.name}</div>
                    <div className="text-xs text-zinc-500">{rc.currency} · From {rc.effective_from}</div>
                  </div>
                  {rc.is_default && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5">Default</span>}
                </div>
                <div className="mt-2 flex gap-4">
                  {Object.entries(rc.rates || {}).map(([k, v]) => (
                    <div key={k}>
                      <div className="text-[10px] text-zinc-500 uppercase">{k}</div>
                      <div className="text-sm font-semibold text-white">{formatCurrency(v, rc.currency)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
