import React, { useEffect, useState, useCallback } from "react";
import { api, formatDateTime } from "@/lib/api";
import { toast } from "sonner";
import {
  Bot, Play, CheckCircle, XCircle, Clock, AlertCircle,
  RefreshCw, ChevronDown, Zap, Eye, Sparkles, ArrowRight, Workflow
} from "lucide-react";

const AGENT_TYPES = [
  { type: "chief_orchestrator", label: "Chief Orchestrator", desc: "Event routing & prioritisation", color: "indigo" },
  { type: "finance", label: "Finance Agent", desc: "AR monitoring & invoice risk", color: "emerald" },
  { type: "client_success", label: "Client Success", desc: "Health & churn detection", color: "blue" },
  { type: "delivery_ops", label: "Delivery Ops", desc: "Project risk & deadlines", color: "amber" },
  { type: "revenue_ops", label: "Revenue Ops", desc: "Pipeline & upsell signals", color: "violet" },
  { type: "compliance_sentinel", label: "Compliance Sentinel", desc: "Policy & audit monitoring", color: "red" },
];

const COLOR_MAP = {
  indigo: { bg: "bg-indigo-500/10", border: "border-indigo-500/20", text: "text-indigo-400" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400" },
  blue: { bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-400" },
  amber: { bg: "bg-amber-500/10", border: "border-amber-500/20", text: "text-amber-400" },
  violet: { bg: "bg-violet-500/10", border: "border-violet-500/20", text: "text-violet-400" },
  red: { bg: "bg-red-500/10", border: "border-red-500/20", text: "text-red-400" },
};

function StatusBadge({ status }) {
  const map = {
    complete: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    escalated: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    running: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    cancelled: "bg-zinc-700 text-zinc-400 border-zinc-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${map[status] || map.cancelled}`}>
      {status}
    </span>
  );
}

function DemoStat({ label, value }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2">
      <div className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">{label}</div>
      <div className="text-sm text-white truncate mt-0.5">{value || "—"}</div>
    </div>
  );
}

function DemoField({ label, value, multiline = false }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className={multiline ? "" : "flex items-baseline gap-2"}>
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider w-24 shrink-0">{label}</div>
      <div className={`text-xs ${multiline ? "text-zinc-300 mt-0.5 leading-relaxed whitespace-pre-wrap" : "text-zinc-200 capitalize"}`}>{String(value)}</div>
    </div>
  );
}

function AgentCard({ agent, onRun, running }) {
  const c = COLOR_MAP[agent.color] || COLOR_MAP.indigo;
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ trigger_event: "", context_text: "" });

  const triggerRun = async () => {
    let ctx = {};
    try { ctx = form.context_text ? JSON.parse(form.context_text) : {}; } catch { toast.error("Context must be valid JSON"); return; }
    await onRun(agent.type, form.trigger_event, ctx);
    setShowForm(false);
    setForm({ trigger_event: "", context_text: "" });
  };

  return (
    <div className={`rounded-xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-sm font-semibold ${c.text}`}>{agent.label}</div>
          <div className="text-xs text-zinc-500 mt-0.5">{agent.desc}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${c.text.replace("text","bg")}`} />
          <span className="text-[10px] text-zinc-500">active</span>
        </div>
      </div>
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          disabled={running}
          className={`mt-3 flex items-center gap-1.5 rounded-lg border ${c.border} px-3 py-1.5 text-xs ${c.text} hover:opacity-80 disabled:opacity-40 transition-opacity`}
        >
          <Play size={10} fill="currentColor" /> Run Agent
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            value={form.trigger_event}
            onChange={e => setForm({...form, trigger_event: e.target.value})}
            placeholder="Trigger event (e.g. invoice.overdue_detected)"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none"
          />
          <textarea
            value={form.context_text}
            onChange={e => setForm({...form, context_text: e.target.value})}
            placeholder='Context JSON (e.g. {"client_id": "...", "amount": 5000})'
            rows={3}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-xs text-white font-mono placeholder-zinc-500 focus:outline-none resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="text-xs text-zinc-500 hover:text-white px-2 py-1">Cancel</button>
            <button onClick={triggerRun} disabled={!form.trigger_event || running}
              className={`rounded-lg border ${c.border} px-3 py-1 text-xs ${c.text} hover:opacity-80 disabled:opacity-40`}>
              {running ? "Running…" : "Execute"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AgentOps() {
  const [runs, setRuns] = useState([]);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("agents");
  const [expanded, setExpanded] = useState(null);

  // Workflow Demo state
  const [demo, setDemo] = useState(null);              // result payload
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoActiveStep, setDemoActiveStep] = useState(-1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [runRes, rvRes] = await Promise.all([
        api.get("/agents/runs"),
        api.get("/agents/review-queue"),
      ]);
      setRuns(runRes.data);
      setReviewQueue(rvRes.data);
    } catch { toast.error("Failed to load agent data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runAgent = async (agentType, triggerEvent, context) => {
    if (!triggerEvent) { toast.error("Trigger event is required"); return; }
    setRunning(true);
    try {
      const { data } = await api.post("/agents/run", {
        agent_type: agentType,
        trigger_event: triggerEvent,
        context,
      });
      setRuns(prev => [{ ...data, agent_type: agentType, started_at: new Date().toISOString(), execution_status: data.execution_status }, ...prev]);
      if (data.escalation_flag) {
        load(); // refresh review queue
        toast.warning(`Agent escalated for human review (confidence: ${(data.confidence_score * 100).toFixed(0)}%)`);
      } else {
        toast.success(`Agent run complete (confidence: ${(data.confidence_score * 100).toFixed(0)}%)`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Agent run failed");
    } finally {
      setRunning(false);
    }
  };

  const reviewRun = async (runId, decision) => {
    try {
      await api.post(`/agents/runs/${runId}/review`, { decision, notes: `Human ${decision} via UI` });
      setReviewQueue(prev => prev.filter(r => r.id !== runId));
      setRuns(prev => prev.map(r => r.id === runId ? {...r, human_reviewed: true, execution_status: decision === "approved" ? "complete" : "cancelled"} : r));
      toast.success(`Run ${decision}`);
    } catch { toast.error("Review failed"); }
  };

  const runWorkflowDemo = async () => {
    setDemoRunning(true);
    setDemo(null);
    setDemoActiveStep(0);
    // staged shimmer to suggest progression while backend runs
    const shimmer = setInterval(() => {
      setDemoActiveStep(s => (s < 2 ? s + 1 : s));
    }, 1800);
    try {
      const { data } = await api.post("/agents/workflow-demo");
      clearInterval(shimmer);
      setDemo(data);
      setDemoActiveStep(data.steps.length - 1);
      toast.success(`Workflow complete · avg confidence ${(data.summary.average_confidence*100).toFixed(0)}%`);
      // refresh background lists too
      load();
    } catch (err) {
      clearInterval(shimmer);
      toast.error(err?.response?.data?.detail || "Workflow demo failed");
    } finally {
      setDemoRunning(false);
    }
  };

  if (loading) return (
    <div className="flex h-96 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
    </div>
  );

  return (
    <div className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">cdxi / ai operations</p>
        <h1 className="mt-1 text-2xl font-bold text-white tracking-tight">AI Ops</h1>
      </div>

      {/* Review queue alert */}
      {reviewQueue.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-amber-300">{reviewQueue.length} run{reviewQueue.length>1?"s":""} awaiting human review</div>
            <div className="text-xs text-zinc-400 mt-0.5">Agent confidence below threshold — human decision required before execution.</div>
          </div>
          <button onClick={() => setTab("review")} className="ml-auto text-xs text-amber-400 hover:text-amber-300">View queue</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {[
          {k:"agents",l:"Agents"},
          {k:"workflow",l:"Workflow Demo"},
          {k:"review",l:`Review Queue ${reviewQueue.length > 0 ? `(${reviewQueue.length})` : ""}`},
          {k:"runs",l:"Run History"},
        ].map(({k,l}) => (
          <button key={k} data-testid={`agentops-tab-${k}`} onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab===k ? "border-indigo-500 text-indigo-300" : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}>{l}
          </button>
        ))}
      </div>

      {tab === "agents" && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {AGENT_TYPES.map(agent => (
            <AgentCard key={agent.type} agent={agent} onRun={runAgent} running={running} />
          ))}
        </div>
      )}

      {tab === "workflow" && (
        <div className="space-y-4">
          {/* Hero card */}
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-zinc-900 p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="max-w-xl">
                <div className="flex items-center gap-2 text-xs font-mono text-indigo-300 uppercase tracking-widest mb-2">
                  <Workflow size={12} /> end-to-end demo
                </div>
                <h2 className="text-lg font-semibold text-white">Overdue invoice → orchestrated recovery</h2>
                <p className="mt-1.5 text-sm text-zinc-400">
                  Chains <span className="text-indigo-300">Chief Orchestrator</span> →
                  <span className="text-emerald-300"> Finance</span> →
                  <span className="text-blue-300"> Client Success</span>.
                  Pulls a real invoice + client from your DB, runs each agent on Claude, and shows confidence,
                  reasoning, and any escalations.
                </p>
              </div>
              <button
                data-testid="run-workflow-demo-btn"
                onClick={runWorkflowDemo}
                disabled={demoRunning}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-60 transition-colors shadow-lg shadow-indigo-900/30"
              >
                {demoRunning ? (
                  <><div className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Running…</>
                ) : (
                  <><Sparkles size={14} /> Run Workflow</>
                )}
              </button>
            </div>

            {demo?.context && (
              <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <DemoStat label="Client" value={demo.context.client_name} />
                <DemoStat label="Invoice" value={demo.context.invoice_number} />
                <DemoStat label="Outstanding" value={`${demo.context.currency} ${(demo.context.amount_outstanding||0).toLocaleString()}`} />
                <DemoStat label="Days overdue" value={demo.context.days_overdue ?? 0} />
              </div>
            )}
          </div>

          {/* Step pipeline */}
          {(demoRunning || demo) && (
            <div className="space-y-3">
              {[
                { agent: "chief_orchestrator", label: "Chief Orchestrator", color: "indigo" },
                { agent: "finance", label: "Finance Agent", color: "emerald" },
                { agent: "client_success", label: "Client Success", color: "blue" },
              ].map((meta, idx) => {
                const c = COLOR_MAP[meta.color];
                const step = demo?.steps?.[idx];
                const isActive = demoRunning && idx === demoActiveStep;
                const isPending = demoRunning && idx > demoActiveStep;
                const isDone = !!step;

                return (
                  <div key={meta.agent} data-testid={`workflow-step-${meta.agent}`} className={`rounded-xl border ${isPending ? "border-zinc-800 bg-zinc-900/30" : `${c.border} bg-zinc-900`} overflow-hidden transition-all`}>
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/70">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${isDone ? `${c.bg} ${c.text}` : isActive ? "bg-indigo-500/20 text-indigo-300 animate-pulse" : "bg-zinc-800 text-zinc-600"}`}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className={`text-sm font-medium ${isDone ? c.text : "text-zinc-400"}`}>{meta.label}</div>
                        {step?.trigger && <div className="text-[10px] font-mono text-zinc-500">{step.trigger}</div>}
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-1.5 text-xs text-indigo-300">
                          <div className="h-3 w-3 rounded-full border-2 border-indigo-300/30 border-t-indigo-300 animate-spin" />
                          thinking
                        </div>
                      )}
                      {isDone && (
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-mono text-zinc-500">{step.latency_ms ? `${step.latency_ms}ms` : ""}</span>
                          <span className={`text-xs font-mono ${step.confidence_score >= 0.85 ? "text-emerald-400" : "text-amber-400"}`}>
                            {(step.confidence_score * 100).toFixed(0)}%
                          </span>
                          <StatusBadge status={step.execution_status} />
                        </div>
                      )}
                    </div>

                    {isDone && step.output && (
                      <div className="px-4 py-3 space-y-2">
                        {/* Pretty output for orchestrator */}
                        {meta.agent === "chief_orchestrator" && (
                          <>
                            <DemoField label="Routed to" value={step.output.primary_agent} />
                            <DemoField label="Priority" value={step.output.priority} />
                            <DemoField label="Summary" value={step.output.summary} multiline />
                          </>
                        )}
                        {meta.agent === "finance" && (
                          <>
                            <DemoField label="Action" value={step.output.action_type} />
                            <DemoField label="Risk" value={step.output.risk_level} />
                            {step.output.subject && <DemoField label="Subject" value={step.output.subject} />}
                            {step.output.body && <DemoField label="Drafted message" value={step.output.body} multiline />}
                            <DemoField label="Recommended next" value={step.output.recommended_action} multiline />
                          </>
                        )}
                        {meta.agent === "client_success" && (
                          <>
                            <DemoField label="Health impact" value={step.output.health_impact || step.output.risk_level} />
                            <DemoField label="Recommended action" value={step.output.recommended_action} multiline />
                            {step.output.outreach && <DemoField label="Outreach plan" value={step.output.outreach} multiline />}
                          </>
                        )}

                        {step.escalation_flag && step.escalation_reason && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300">
                            ⚠ Escalated: {step.escalation_reason}
                          </div>
                        )}

                        <details className="group">
                          <summary className="cursor-pointer text-[10px] font-mono text-zinc-600 hover:text-zinc-400 select-none">view raw JSON</summary>
                          <pre className="mt-2 rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(step.output, null, 2)}</pre>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}

              {demo?.summary && (
                <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div className="text-xs text-zinc-500">
                    {demo.summary.total_steps} agents · avg confidence{" "}
                    <span className="font-mono text-zinc-300">{(demo.summary.average_confidence*100).toFixed(0)}%</span>
                  </div>
                  {demo.summary.any_escalated ? (
                    <div className="text-xs text-amber-400 flex items-center gap-1.5"><AlertCircle size={12}/> One or more steps escalated for review</div>
                  ) : (
                    <div className="text-xs text-emerald-400 flex items-center gap-1.5"><CheckCircle size={12}/> All steps auto-executed</div>
                  )}
                </div>
              )}
            </div>
          )}

          {!demoRunning && !demo && (
            <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-10 text-center">
              <Workflow size={28} className="text-zinc-700 mx-auto mb-3" />
              <div className="text-sm text-zinc-500">Click <span className="text-indigo-300">Run Workflow</span> to execute the demo</div>
              <div className="text-[11px] text-zinc-600 mt-1">Real data · real Claude calls · ~10–15s end to end</div>
            </div>
          )}
        </div>
      )}

      {tab === "review" && (
        <div className="space-y-3">
          {reviewQueue.length === 0 && (
            <div className="py-12 text-center">
              <CheckCircle size={32} className="text-emerald-500/30 mx-auto mb-3" />
              <div className="text-sm text-zinc-500">Review queue is clear</div>
            </div>
          )}
          {reviewQueue.map(run => (
            <div key={run.id} className="rounded-xl border border-amber-500/20 bg-zinc-900">
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-medium text-white capitalize">{run.agent_type?.replace(/_/g," ")}</div>
                    <div className="text-xs text-zinc-500">{run.trigger_event} · {formatDateTime(run.started_at)}</div>
                    {run.escalation_reason && (
                      <div className="text-xs text-amber-400 mt-1">{run.escalation_reason}</div>
                    )}
                  </div>
                  <StatusBadge status={run.execution_status} />
                </div>
                {run.output && (
                  <div className="mt-3 rounded-lg bg-zinc-800 p-3">
                    <pre className="text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(run.output, null, 2)}</pre>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-xs text-zinc-500">Confidence: {run.confidence_score ? `${(run.confidence_score*100).toFixed(0)}%` : "—"}</span>
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => reviewRun(run.id, "rejected")}
                      className="flex items-center gap-1.5 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20">
                      <XCircle size={11} /> Reject
                    </button>
                    <button onClick={() => reviewRun(run.id, "approved")}
                      className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-500/20">
                      <CheckCircle size={11} /> Approve
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "runs" && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <button onClick={load} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white">
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
          {runs.length === 0 && <div className="py-8 text-center text-xs text-zinc-600">No agent runs yet. Trigger an agent above.</div>}
          {runs.map(run => (
            <div key={run.id} className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/30"
                onClick={() => setExpanded(expanded === run.id ? null : run.id)}
              >
                <div className="flex items-center gap-3">
                  <Bot size={14} className="text-zinc-500" />
                  <div>
                    <div className="text-sm text-white capitalize">{run.agent_type?.replace(/_/g," ")}</div>
                    <div className="text-xs text-zinc-500">{run.trigger_event} · {formatDateTime(run.started_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {run.confidence_score && (
                    <span className="text-xs font-mono text-zinc-500">{(run.confidence_score*100).toFixed(0)}%</span>
                  )}
                  <StatusBadge status={run.execution_status} />
                  <ChevronDown size={13} className={`text-zinc-600 transition-transform ${expanded===run.id?"rotate-180":""}`} />
                </div>
              </div>
              {expanded === run.id && run.output && (
                <div className="border-t border-zinc-800 px-4 py-3">
                  <pre className="text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(run.output, null, 2)}</pre>
                  {run.latency_ms && <div className="text-[10px] text-zinc-600 mt-2">Latency: {run.latency_ms}ms</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
