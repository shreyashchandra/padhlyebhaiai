import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, Compass, HelpCircle, LifeBuoy, RotateCcw, Square, X } from "lucide-react";
import { streamPost } from "../lib/api";
import { cn } from "../lib/utils";
import Markdown from "./Markdown";
import { Spinner } from "./ui";

const SUGGESTIONS = [
  "How do I add my exam's syllabus?",
  "How does Rebalance work?",
  "How much AI can I use per day?",
  "How do I edit or move a topic?",
];
const STORAGE_KEY = "plb_help_chat";

function loadChat() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** Floating "?" button with a panel: replay the tour, or ask about using the app. */
export default function HelpWidget({ showButton = true }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(loadChat);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("plb:open-help", onOpen);
    return () => window.removeEventListener("plb:open-help", onOpen);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((m) => !m.streaming).slice(-20)));
    } catch {
      /* ignore */
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const ask = useCallback(
    async (text) => {
      const question = (text ?? input).trim();
      if (!question || streaming) return;
      const history = messages.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
      setMessages((m) => [...m, { role: "user", content: question }, { role: "assistant", content: "", streaming: true }]);
      setInput("");
      setStreaming(true);
      const form = new FormData();
      form.append("question", question);
      form.append("history", JSON.stringify(history.slice(-6)));
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamPost("/api/help/ask", form, (full) => setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, content: full } : msg))), controller.signal);
      } catch (err) {
        if (err.name !== "AbortError") {
          setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, content: err.message, error: true } : msg)));
        }
      } finally {
        setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, streaming: false } : msg)));
        setStreaming(false);
      }
    },
    [input, messages, streaming],
  );

  const startTour = () => {
    setOpen(false);
    window.dispatchEvent(new Event("plb:start-tour"));
  };

  return (
    <>
      {showButton && !open && (
        <button
          onClick={() => setOpen(true)}
          className="no-print fixed bottom-24 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:scale-105 hover:bg-brand-700 lg:bottom-6 lg:right-6"
          aria-label="Help & guide"
          title="Help & guide"
        >
          <HelpCircle className="h-6 w-6" />
        </button>
      )}

      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-end sm:inset-auto sm:bottom-6 sm:right-6" role="dialog" aria-label="Help & guide">
            <div className="absolute inset-0 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
            <div className="relative flex h-[min(600px,85dvh)] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl animate-pop sm:w-[380px] sm:rounded-2xl">
              <div className="flex items-center gap-3 bg-gradient-to-br from-brand-600 to-violet-600 px-4 py-3.5 text-white">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-white/15">
                  <LifeBuoy className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">Help & guide</div>
                  <div className="text-xs text-white/80">Questions about using PadhLeBhai</div>
                </div>
                {messages.length > 0 && (
                  <button onClick={() => setMessages([])} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white" title="Clear chat" aria-label="Clear chat">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white" aria-label="Close help">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <button
                  onClick={startTour}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3 text-left transition hover:border-brand-400 hover:bg-surface-2"
                >
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-300">
                    <Compass className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-fg">Take the app tour</div>
                    <div className="text-xs text-muted">A one-minute walkthrough of every feature</div>
                  </div>
                </button>

                {messages.length === 0 ? (
                  <div className="pt-2">
                    <p className="text-sm text-muted">Ask me anything about how the app works. For study doubts, use the AI Tutor.</p>
                    <div className="mt-3 flex flex-col gap-2">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => ask(s)} className="rounded-xl border border-line px-3 py-2 text-left text-sm text-fg transition hover:border-brand-400 hover:bg-surface-2">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((m, i) =>
                    m.role === "user" ? (
                      <div key={i} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm text-white">{m.content}</div>
                      </div>
                    ) : (
                      <div key={i} className={cn("max-w-[95%] rounded-2xl rounded-bl-md bg-surface-2 px-3.5 py-2.5 text-sm", m.error && "text-rose-600 dark:text-rose-300")}>
                        {m.content ? <Markdown className="!text-sm [&_.prose-ai]:leading-relaxed" onNavigate={() => setOpen(false)}>{m.content}</Markdown> : <Spinner className="h-4 w-4" />}
                      </div>
                    ),
                  )
                )}
                <div ref={bottomRef} />
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  ask();
                }}
                className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              >
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-2 focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10">
                  <input
                    ref={inputRef}
                    value={input}
                    maxLength={600}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="How do I…?"
                    className="h-10 flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-muted/70 focus:outline-none focus-visible:outline-none"
                  />
                  {streaming ? (
                    <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-lg bg-surface-2 p-1.5 text-fg" aria-label="Stop">
                      <Square className="h-4 w-4" />
                    </button>
                  ) : (
                    <button type="submit" disabled={!input.trim()} className="rounded-lg bg-brand-600 p-1.5 text-white disabled:opacity-40" aria-label="Ask">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-center text-[11px] text-muted">Only answers questions about using this app · free</p>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
