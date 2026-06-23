import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2, RotateCcw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { api, getErrorMessage } from "@/lib/api";

export default function CopilotDock({ open, onClose, seedPrompt = "" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  const scroller = useRef(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open && seedPrompt) setInput(seedPrompt);
  }, [open, seedPrompt]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    try {
      const { data } = await api.post("/copilot/chat", { session_id: sessionId, message: text });
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${getErrorMessage(e, "Copilot error")}` }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "Summarize this brand's open AR and which invoices are at risk",
    "Which clients are at risk and why?",
    "Draft a 3-step outreach for a cdxi prospect",
    "Plan this week's delivery priorities",
  ];

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />}
      <aside
        className={`fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[440px] border-l bg-background flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        data-testid="copilot-dock"
      >
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/15 via-violet-500/5 to-amber-500/10 pointer-events-none" />
          <div className="relative flex items-center gap-3 p-4 border-b">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center shadow-lg shadow-indigo-900/40">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <div className="text-lg font-semibold tracking-tight">Atlas</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Helix · Copilot · gpt-5.2</div>
            </div>
            <button onClick={() => setMessages([])} className="p-2 rounded-lg hover:bg-muted transition" title="Clear">
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div ref={scroller} className="flex-1 overflow-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground leading-relaxed">
                Hi — I'm <span className="font-semibold text-foreground">Atlas</span>, cdxi's in-house copilot. I can see this brand's clients, projects and invoices. Ask me to summarize AR, flag risks, draft outreach or plan delivery.
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Try</div>
              <div className="space-y-2">
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(p)}
                    className="w-full text-left px-3 py-2.5 rounded-xl border hover:bg-muted transition text-sm"
                  >{p}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`w-7 h-7 shrink-0 rounded-lg grid place-items-center text-xs font-semibold ${m.role === "user" ? "bg-foreground text-background" : "bg-gradient-to-br from-indigo-500 to-violet-600 text-white"}`}>
                {m.role === "user" ? "You" : <Sparkles className="w-3.5 h-3.5" />}
              </div>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm ${m.role === "user" ? "bg-foreground text-background" : "bg-muted border"}`}>
                {m.role === "assistant" ? (
                  <div className="prose-copilot"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Atlas is thinking…
            </div>
          )}
        </div>

        <div className="p-4 border-t">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Message Atlas… (Enter to send)"
              rows={2}
              className="flex-1 resize-none rounded-xl bg-background border p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="h-11 w-11 grid place-items-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:pointer-events-none transition"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
