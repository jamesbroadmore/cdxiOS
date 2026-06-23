import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatCurrency, formatDate, formatDateTime } from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowLeft, Edit2, Save, X, Plus, Trash2, Tag,
  Mail, Globe, Hash, MessageSquare, Phone, CheckCircle, AlertCircle
} from "lucide-react";

const TABS = ["Overview", "Contacts", "Notes", "Projects", "Billing"];

function StatusBadge({ status }) {
  const map = {
    active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    prospect: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    at_risk: "bg-red-500/10 text-red-400 border-red-500/20",
    churned: "bg-zinc-700 text-zinc-400 border-zinc-600",
    paused: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || "bg-zinc-800 text-zinc-400"}`}>
      {status?.replace(/_/g, " ")}
    </span>
  );
}

function HealthRing({ score }) {
  const color = score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  return (
    <div className="flex flex-col items-center">
      <div className={`text-3xl font-bold ${color}`}>{Math.round(score)}</div>
      <div className="text-xs text-zinc-500">Health Score</div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Overview");
  const [contacts, setContacts] = useState([]);
  const [notes, setNotes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [health, setHealth] = useState(null);
  const [newNote, setNewNote] = useState({ body: "", note_type: "general" });
  const [newContact, setNewContact] = useState({ first_name: "", last_name: "", email: "", phone: "", title: "", is_primary: false });
  const [showContactForm, setShowContactForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, contRes, noteRes, projRes, invRes, healthRes] = await Promise.all([
        api.get(`/clients/${id}`),
        api.get(`/clients/${id}/contacts`),
        api.get(`/clients/${id}/notes`),
        api.get(`/projects`, { params: { client_id: id } }),
        api.get(`/invoices`, { params: { client_id: id } }),
        api.get(`/clients/${id}/health`),
      ]);
      setClient(cRes.data);
      setEditForm(cRes.data);
      setContacts(contRes.data);
      setNotes(noteRes.data);
      setProjects(projRes.data);
      setInvoices(invRes.data);
      setHealth(healthRes.data);
    } catch (err) {
      if (err?.response?.status !== 401) toast.error("Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const saveEdit = async () => {
    try {
      const { data } = await api.patch(`/clients/${id}`, {
        name: editForm.name, email: editForm.email, status: editForm.status,
        lifecycle_stage: editForm.lifecycle_stage, billing_model: editForm.billing_model,
        trading_name: editForm.trading_name, website: editForm.website, abn: editForm.abn,
      });
      setClient(data);
      setEditing(false);
      toast.success("Client updated");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    }
  };

  const addNote = async () => {
    if (!newNote.body.trim()) return;
    try {
      const { data } = await api.post(`/clients/${id}/notes`, newNote);
      setNotes(prev => [data, ...prev]);
      setNewNote({ body: "", note_type: "general" });
      toast.success("Note added");
    } catch (err) {
      toast.error("Failed to add note");
    }
  };

  const addContact = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/clients/${id}/contacts`, newContact);
      setContacts(prev => [...prev, data]);
      setNewContact({ first_name: "", last_name: "", email: "", phone: "", title: "", is_primary: false });
      setShowContactForm(false);
      toast.success("Contact added");
    } catch (err) {
      toast.error("Failed to add contact");
    }
  };

  const deleteContact = async (cid) => {
    try {
      await api.delete(`/contacts/${cid}`);
      setContacts(prev => prev.filter(c => c.id !== cid));
      toast.success("Contact removed");
    } catch { toast.error("Failed to delete contact"); }
  };

  const deleteNote = async (nid) => {
    try {
      await api.delete(`/notes/${nid}`);
      setNotes(prev => prev.filter(n => n.id !== nid));
    } catch { toast.error("Failed to delete note"); }
  };

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
    </div>
  );

  if (!client) return (
    <div className="p-8 text-center text-zinc-500">
      Client not found.
      <button onClick={() => navigate("/clients")} className="ml-2 text-indigo-400">Go back</button>
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      {/* Back */}
      <button onClick={() => navigate("/clients")} className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
        <ArrowLeft size={13} /> Back to Clients
      </button>

      {/* Client header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl font-bold text-indigo-300">
              {client.name[0].toUpperCase()}
            </div>
            <div>
              {editing ? (
                <input
                  value={editForm.name}
                  onChange={e => setEditForm({...editForm, name: e.target.value})}
                  className="text-xl font-bold bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 text-white focus:outline-none"
                />
              ) : (
                <h1 className="text-xl font-bold text-white">{client.name}</h1>
              )}
              {client.trading_name && <div className="text-sm text-zinc-400">{client.trading_name}</div>}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <StatusBadge status={client.status} />
                <span className="text-xs text-zinc-500 capitalize">{client.lifecycle_stage}</span>
                <span className="text-xs text-zinc-600">·</span>
                <span className="text-xs text-zinc-500 capitalize">{client.billing_model}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {health && <HealthRing score={health.health_score} />}
            {editing ? (
              <div className="flex gap-2">
                <button onClick={saveEdit} className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                  <Save size={12} /> Save
                </button>
                <button onClick={() => { setEditing(false); setEditForm(client); }} className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 transition-colors">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors">
                <Edit2 size={12} /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Quick info */}
        {!editing && (
          <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-800 pt-4">
            {client.email && <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Mail size={12} className="text-zinc-600" />{client.email}</div>}
            {client.website && <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Globe size={12} className="text-zinc-600" />{client.website}</div>}
            {client.abn && <div className="flex items-center gap-1.5 text-xs text-zinc-400"><Hash size={12} className="text-zinc-600" />ABN: {client.abn}</div>}
          </div>
        )}

        {editing && (
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-800 pt-4 lg:grid-cols-3">
            {[{label:"Email",key:"email"},{label:"Website",key:"website"},{label:"ABN",key:"abn"},{label:"Trading Name",key:"trading_name"}].map(({label,key}) => (
              <div key={key}>
                <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                <input value={editForm[key]||""} onChange={e=>setEditForm({...editForm,[key]:e.target.value})}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-white focus:outline-none" />
              </div>
            ))}
            {[{label:"Status",key:"status",opts:["prospect","active","at_risk","churned","paused"]},
              {label:"Lifecycle",key:"lifecycle_stage",opts:["lead","qualified","onboarding","active","renewal","churned"]},
              {label:"Billing",key:"billing_model",opts:["hourly","retainer","consumption","hybrid","fixed"]},
            ].map(({label,key,opts}) => (
              <div key={key}>
                <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                <select value={editForm[key]||""} onChange={e=>setEditForm({...editForm,[key]:e.target.value})}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-white focus:outline-none">
                  {opts.map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* Health signals */}
        {health?.signals?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
            {health.signals.map((sig, i) => (
              <div key={i} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs
                ${sig.type === "danger" ? "border-red-500/20 bg-red-500/5 text-red-400" :
                  sig.type === "warning" ? "border-amber-500/20 bg-amber-500/5 text-amber-400" :
                  "border-zinc-700 bg-zinc-800 text-zinc-400"}`}>
                <AlertCircle size={10} />{sig.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t ? "border-indigo-500 text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "Overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">Client Details</h3>
            <div className="space-y-2">
              {[
                {label:"Currency",value:client.primary_currency||"AUD"},
                {label:"Tags",value:client.tags?.join(", ")||"None"},
                {label:"Created",value:formatDate(client.created_at)},
                {label:"Last Updated",value:formatDate(client.updated_at)},
              ].map(({label,value}) => (
                <div key={label} className="flex justify-between">
                  <span className="text-xs text-zinc-500">{label}</span>
                  <span className="text-xs text-zinc-300">{value}</span>
                </div>
              ))}
            </div>
          </div>
          {health && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">Health Signals</h3>
              <div className="space-y-2">
                {[
                  {label:"Overdue Invoices",value:health.overdue_invoices,danger:health.overdue_invoices>0},
                  {label:"Blocked Projects",value:health.blocked_projects,danger:health.blocked_projects>0},
                  {label:"Days since last note",value:health.last_note_days===999?"N/A":health.last_note_days,warn:health.last_note_days>30},
                ].map(({label,value,danger,warn}) => (
                  <div key={label} className="flex justify-between">
                    <span className="text-xs text-zinc-500">{label}</span>
                    <span className={`text-xs font-medium ${danger?"text-red-400":warn?"text-amber-400":"text-zinc-300"}`}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "Contacts" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowContactForm(v=>!v)} className="flex items-center gap-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/20 transition-colors">
              <Plus size={12} /> Add Contact
            </button>
          </div>
          {showContactForm && (
            <form onSubmit={addContact} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[{label:"First Name *",key:"first_name",req:true},{label:"Last Name *",key:"last_name",req:true},{label:"Email",key:"email"},{label:"Phone",key:"phone"},{label:"Title",key:"title"}].map(({label,key,req}) => (
                  <div key={key}>
                    <label className="block text-xs text-zinc-500 mb-1">{label}</label>
                    <input required={req} value={newContact[key]} onChange={e=>setNewContact({...newContact,[key]:e.target.value})}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-white focus:outline-none" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setShowContactForm(false)} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5">Cancel</button>
                <button type="submit" className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white hover:bg-indigo-600">Save</button>
              </div>
            </form>
          )}
          {contacts.length === 0 && <div className="text-center py-8 text-xs text-zinc-600">No contacts yet</div>}
          <div className="grid gap-3 lg:grid-cols-2">
            {contacts.map(c => (
              <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex items-start justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{c.first_name} {c.last_name}</div>
                  {c.title && <div className="text-xs text-zinc-500">{c.title}</div>}
                  {c.email && <div className="text-xs text-zinc-400 mt-1">{c.email}</div>}
                  {c.phone && <div className="text-xs text-zinc-400">{c.phone}</div>}
                  <div className="flex gap-2 mt-2">
                    {c.is_primary && <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full px-2 py-0.5">Primary</span>}
                    {c.is_billing && <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2 py-0.5">Billing</span>}
                    {c.is_signatory && <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5">Signatory</span>}
                  </div>
                </div>
                <button onClick={() => deleteContact(c.id)} className="text-zinc-600 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Notes" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h3 className="text-xs font-semibold text-zinc-400">Add Note</h3>
            <textarea
              value={newNote.body}
              onChange={e => setNewNote({...newNote, body: e.target.value})}
              placeholder="What happened? Record a meeting, risk, or opportunity…"
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-indigo-500/60 focus:outline-none resize-none"
            />
            <div className="flex items-center gap-3">
              <select value={newNote.note_type} onChange={e => setNewNote({...newNote, note_type: e.target.value})}
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 focus:outline-none">
                {["general","meeting","call","email","risk","opportunity"].map(t=><option key={t}>{t}</option>)}
              </select>
              <button onClick={addNote} disabled={!newNote.body.trim()}
                className="ml-auto rounded-lg bg-indigo-500 px-3 py-1.5 text-xs text-white font-medium hover:bg-indigo-600 disabled:opacity-40 transition-colors">
                Add Note
              </button>
            </div>
          </div>
          {notes.length === 0 && <div className="text-center py-8 text-xs text-zinc-600">No notes yet</div>}
          <div className="space-y-3">
            {notes.map(n => (
              <div key={n.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5">{n.note_type}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-600">{formatDateTime(n.created_at)}</span>
                    <button onClick={() => deleteNote(n.id)} className="text-zinc-600 hover:text-red-400"><X size={12} /></button>
                  </div>
                </div>
                <p className="text-sm text-zinc-300 whitespace-pre-wrap">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "Projects" && (
        <div className="space-y-3">
          {projects.length === 0 && <div className="text-center py-8 text-xs text-zinc-600">No projects</div>}
          {projects.map(p => (
            <Link key={p.id} to={`/projects`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-zinc-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 capitalize">{p.project_type} · {p.status}</div>
                </div>
                <div className="text-sm font-semibold text-white">{formatCurrency(p.budget || p.total_amount)}</div>
              </div>
              {p.milestones?.length > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-zinc-500 mb-1">
                    <span>Progress</span><span>{p.progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-indigo-500" style={{width:`${p.progress}%`}} />
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}

      {tab === "Billing" && (
        <div className="space-y-3">
          {invoices.length === 0 && <div className="text-center py-8 text-xs text-zinc-600">No invoices</div>}
          {invoices.map(inv => (
            <div key={inv.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white">{inv.invoice_number}</div>
                  <div className="text-xs text-zinc-500">Due: {formatDate(inv.due_date)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">{formatCurrency(inv.total_amount)}</div>
                  <span className="text-xs capitalize text-zinc-500">{inv.status}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
