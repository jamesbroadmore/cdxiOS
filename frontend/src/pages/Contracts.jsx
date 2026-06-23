import React, { useEffect, useState, useCallback } from "react";
import { api, formatDate, formatDateTime } from "@/lib/api";
import { toast } from "sonner";
import { Plus, FileText, Send, CheckCircle, X, ChevronDown } from "lucide-react";

const CONTRACT_TYPES = ["msa","sow","nda","proposal","change_order","renewal"];

function ContractStatusBadge({ status }) {
  const map = {
    draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
    review: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    sent: "bg-violet-500/10 text-violet-400 border-violet-500/20",
    signed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    active: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    expired: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    terminated: "bg-red-500/10 text-red-400 border-red-500/20",
    voided: "bg-zinc-700 text-zinc-500 border-zinc-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

function GenerateContractModal({ open, onClose, onCreated, clients, templates }) {
  const [form, setForm] = useState({ client_id: "", template_id: "", contract_type: "sow", title: "", effective_date: "", expiry_date: "" });
  const [vars, setVars] = useState({});
  const [loading, setLoading] = useState(false);

  const selectedTemplate = templates.find(t => t.id === form.template_id);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/contracts/generate", { ...form, variables_used: vars });
      toast.success(`Contract ${data.contract_number} generated`);
      onCreated(data);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to generate contract");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Generate Contract</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Client *</label>
            <select required value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Select client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Template *</label>
            <select required value={form.template_id} onChange={e => {
              const t = templates.find(t => t.id === e.target.value);
              setForm({...form, template_id: e.target.value, contract_type: t?.template_type || "sow"});
              setVars({});
            }} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
              <option value="">Select template…</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Title *</label>
            <input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
              placeholder="e.g. Website Redesign SOW"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Effective Date</label>
              <input type="date" value={form.effective_date} onChange={e=>setForm({...form,effective_date:e.target.value})}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Expiry Date</label>
              <input type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
            </div>
          </div>
          {selectedTemplate?.variables?.map(v => (
            <div key={v}>
              <label className="block text-xs text-zinc-400 mb-1 capitalize">{v.replace(/_/g, " ")}</label>
              <textarea value={vars[v]||""} onChange={e=>setVars({...vars,[v]:e.target.value})}
                rows={2} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white focus:outline-none resize-none" />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
            <button type="submit" disabled={loading} className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50">
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("contracts");
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState(null);

  // New template form
  const [tmplForm, setTmplForm] = useState({ name:"", template_type:"sow", body_template:"", variables:"" });
  const [savingTmpl, setSavingTmpl] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conRes, tmplRes, cRes] = await Promise.all([
        api.get("/contracts"),
        api.get("/contract-templates"),
        api.get("/clients"),
      ]);
      setContracts(conRes.data);
      setTemplates(tmplRes.data);
      setClients(cRes.data);
    } catch { toast.error("Failed to load contracts"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id, newStatus) => {
    try {
      const { data } = await api.patch(`/contracts/${id}`, { status: newStatus });
      setContracts(prev => prev.map(c => c.id === id ? data : c));
      toast.success(`Contract ${newStatus}`);
    } catch { toast.error("Update failed"); }
  };

  const sendContract = async (id) => {
    try {
      await api.post(`/contracts/${id}/send`);
      setContracts(prev => prev.map(c => c.id === id ? {...c, status: "sent"} : c));
      toast.success("Contract sent");
    } catch { toast.error("Failed to send contract"); }
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    setSavingTmpl(true);
    try {
      const vars = tmplForm.variables.split(",").map(v=>v.trim()).filter(Boolean);
      const { data } = await api.post("/contract-templates", { ...tmplForm, variables: vars });
      setTemplates(prev => [data, ...prev]);
      setTmplForm({ name:"", template_type:"sow", body_template:"", variables:"" });
      toast.success("Template created");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create template");
    } finally { setSavingTmpl(false); }
  };

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / contracts</p>
          <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">Contracts</h1>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-600">
          <Plus size={15} /> New Contract
        </button>
      </div>

      <div className="flex gap-1 border-b border-zinc-800">
        {[{k:"contracts",l:"Contracts"},{k:"templates",l:"Templates"}].map(({k,l}) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab===k ? "border-indigo-500 text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>{l}
          </button>
        ))}
      </div>

      {tab === "contracts" && (
        <div className="space-y-3">
          {contracts.length === 0 && <div className="py-12 text-center text-xs text-zinc-600">No contracts yet. Generate one from a template.</div>}
          {contracts.map(con => (
            <div key={con.id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div
                className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-zinc-800/30"
                onClick={() => setExpanded(expanded === con.id ? null : con.id)}
              >
                <div className="flex items-center gap-3">
                  <FileText size={15} className="text-zinc-500" />
                  <div>
                    <div className="text-sm font-medium text-white">{con.title}</div>
                    <div className="text-xs text-zinc-500">{con.contract_number} · {con.client_name} · {con.contract_type?.toUpperCase()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ContractStatusBadge status={con.status} />
                  <ChevronDown size={14} className={`text-zinc-500 transition-transform ${expanded===con.id?"rotate-180":""}`} />
                </div>
              </div>
              {expanded === con.id && (
                <div className="border-t border-zinc-800 px-5 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                      {label:"Type",value:con.contract_type?.toUpperCase()},
                      {label:"Effective",value:formatDate(con.effective_date)||"—"},
                      {label:"Expires",value:formatDate(con.expiry_date)||"—"},
                      {label:"Created",value:formatDate(con.created_at)},
                    ].map(({label,value}) => (
                      <div key={label}>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</div>
                        <div className="text-sm text-zinc-300">{value}</div>
                      </div>
                    ))}
                  </div>
                  {con.rendered_body && (
                    <div className="rounded-lg bg-zinc-800/50 border border-zinc-700 p-3 max-h-48 overflow-y-auto">
                      <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">{con.rendered_body}</pre>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {con.status === "draft" && (
                      <button onClick={() => sendContract(con.id)}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 text-xs text-blue-400 hover:bg-blue-500/20">
                        <Send size={11} /> Send for Signing
                      </button>
                    )}
                    {con.status === "sent" && (
                      <button onClick={() => updateStatus(con.id, "signed")}
                        className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20">
                        <CheckCircle size={11} /> Mark Signed
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4">New Template</h3>
            <form onSubmit={saveTemplate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Name *</label>
                  <input required value={tmplForm.name} onChange={e=>setTmplForm({...tmplForm,name:e.target.value})}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Type</label>
                  <select value={tmplForm.template_type} onChange={e=>setTmplForm({...tmplForm,template_type:e.target.value})}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none">
                    {CONTRACT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Variables (comma-separated, e.g. scope,deliverables)</label>
                <input value={tmplForm.variables} onChange={e=>setTmplForm({...tmplForm,variables:e.target.value})}
                  placeholder="scope, deliverables, payment_terms"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Template Body * (use {`{{variable}}`} for placeholders)</label>
                <textarea required value={tmplForm.body_template} onChange={e=>setTmplForm({...tmplForm,body_template:e.target.value})}
                  rows={8} className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white font-mono focus:outline-none resize-none" />
              </div>
              <button type="submit" disabled={savingTmpl}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white font-medium hover:bg-indigo-600 disabled:opacity-50">
                {savingTmpl ? "Saving…" : "Save Template"}
              </button>
            </form>
          </div>

          <div className="space-y-3">
            {templates.map(t => (
              <div key={t.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">{t.name}</div>
                    <div className="text-xs text-zinc-500 uppercase">{t.template_type} · v{t.version} · {t.variables?.length || 0} variables</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <GenerateContractModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={(c) => setContracts(prev => [c, ...prev])}
        clients={clients}
        templates={templates}
      />
    </div>
  );
}
