import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUp, Camera, Copy, ImageIcon, Menu, MessageCirclePlus, Sparkles, Square, Trash2, X } from "lucide-react";
import api, { errorMessage, streamPost } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { cn, colorOf } from "../lib/utils";
import { Select, Spinner } from "../components/ui";
import Markdown from "../components/Markdown";

const SUGGESTIONS = [
  "Explain this topic like I'm seeing it for the first time",
  "Give me the 10 most likely exam questions on this",
  "Make a one-page revision sheet with all formulas",
  "Quiz me with 5 quick questions, one at a time",
];

function ThreadList({ threads, activeId, subjectsById, onSelect, onNew, onDelete }) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <button onClick={onNew} className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
          <MessageCirclePlus className="h-4 w-4" /> New chat
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {threads?.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">Your conversations will appear here.</p>}
        {threads?.map((t) => {
          const subject = subjectsById[t.subject_id];
          return (
            <div
              key={t.id}
              className={cn(
                "group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition",
                t.id === activeId ? "bg-brand-500/10 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
              onClick={() => onSelect(t.id)}
            >
              <span className={cn("h-2 w-2 shrink-0 rounded-full", subject ? colorOf(subject.color).dot : "bg-slate-400")} />
              <span className="flex-1 truncate">{t.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(t.id);
                }}
                className="rounded p-1 opacity-0 hover:text-rose-500 group-hover:opacity-100"
                aria-label="Delete chat"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Message({ m }) {
  const isUser = m.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm leading-relaxed text-white">
          {m.has_image && (
            <div className="mb-1 flex items-center gap-1.5 text-xs text-white/80">
              <ImageIcon className="h-3.5 w-3.5" /> Photo attached
            </div>
          )}
          <div className="whitespace-pre-wrap">{m.content}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-600 text-white">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 pt-1">
        {m.content ? <Markdown>{m.content}</Markdown> : <Spinner className="h-4 w-4" />}
        {m.content && !m.streaming && (
          <button
            onClick={() => navigator.clipboard.writeText(m.content).then(() => toast.success("Copied"))}
            className="mt-2 flex items-center gap-1 text-xs text-muted opacity-0 transition hover:text-fg group-hover:opacity-100"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
        )}
      </div>
    </div>
  );
}

export default function Tutor() {
  const { threadId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { refresh: refreshCredits } = useAuth();
  const threadsQ = useApi("/api/tutor/threads");
  const subjectsQ = useApi("/api/subjects");
  const subjectsById = Object.fromEntries((subjectsQ.data || []).map((s) => [s.id, s]));

  const [messages, setMessages] = useState([]);
  const [thread, setThread] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [input, setInput] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [newSubject, setNewSubject] = useState(params.get("subject") || "");
  const [drawer, setDrawer] = useState(false);

  const bottom = useRef(null);
  const fileRef = useRef(null);
  const textRef = useRef(null);
  const abortRef = useRef(null);
  const autoAsked = useRef(false);

  // Load selected thread
  useEffect(() => {
    if (!threadId) {
      setThread(null);
      setMessages([]);
      return;
    }
    if (thread?.id === Number(threadId)) return;
    setLoadingThread(true);
    api
      .get(`/api/tutor/threads/${threadId}`)
      .then(({ data }) => {
        setThread(data);
        setMessages(data.messages);
      })
      .catch((err) => {
        toast.error(errorMessage(err));
        navigate("/tutor", { replace: true });
      })
      .finally(() => setLoadingThread(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: streaming ? "auto" : "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    if (!image) return setPreview(null);
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const send = useCallback(
    async (text, attached = image) => {
      const content = (text ?? input).trim();
      if ((!content && !attached) || streaming) return;

      let active = thread;
      if (!active) {
        try {
          const { data } = await api.post("/api/tutor/threads", { subject_id: newSubject ? Number(newSubject) : null });
          active = data;
          setThread(data);
          navigate(`/tutor/${data.id}`, { replace: true });
        } catch (err) {
          toast.error(errorMessage(err));
          return;
        }
      }

      const form = new FormData();
      form.append("content", content);
      if (attached) form.append("image", attached);

      setMessages((m) => [
        ...m,
        { id: `u${Date.now()}`, role: "user", content: content || "Please solve the question in this image step by step.", has_image: Boolean(attached) },
        { id: `a${Date.now()}`, role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      setImage(null);
      setStreaming(true);
      if (active.title === "New chat") setThread({ ...active, title: (content || "Photo question").slice(0, 60) });
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamPost(
          `/api/tutor/threads/${active.id}/messages`,
          form,
          (full) => setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, content: full } : msg))),
          controller.signal,
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          toast.error(err.message);
          setMessages((m) => m.slice(0, -1));
        }
      } finally {
        setMessages((m) => m.map((msg, i) => (i === m.length - 1 ? { ...msg, streaming: false } : msg)));
        setStreaming(false);
        threadsQ.reload();
        refreshCredits();
      }
    },
    [image, input, streaming, thread, newSubject, navigate, threadsQ, refreshCredits],
  );

  // Deep link: /tutor?subject=1&ask=... starts a fresh chat and asks immediately.
  useEffect(() => {
    const ask = params.get("ask");
    if (ask && !autoAsked.current && !threadId) {
      autoAsked.current = true;
      setParams({}, { replace: true });
      send(ask, null);
    }
  }, [params, threadId, send, setParams]);

  const newChat = () => {
    setThread(null);
    setMessages([]);
    setDrawer(false);
    navigate("/tutor");
    setTimeout(() => textRef.current?.focus(), 50);
  };

  const deleteThread = async (id) => {
    if (!confirm("Delete this conversation?")) return;
    await api.delete(`/api/tutor/threads/${id}`).catch(() => {});
    threadsQ.reload();
    if (thread?.id === id) newChat();
  };

  const onPaste = (e) => {
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      setImage(file);
    }
  };

  const activeSubject = subjectsById[thread?.subject_id ?? (newSubject ? Number(newSubject) : null)];

  return (
    <div className="flex h-[calc(100dvh-61px)] lg:h-dvh">
      {/* Threads sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface md:block">
        <ThreadList threads={threadsQ.data} activeId={thread?.id} subjectsById={subjectsById} onSelect={(id) => navigate(`/tutor/${id}`)} onNew={newChat} onDelete={deleteThread} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-surface">
            <ThreadList
              threads={threadsQ.data}
              activeId={thread?.id}
              subjectsById={subjectsById}
              onSelect={(id) => {
                setDrawer(false);
                navigate(`/tutor/${id}`);
              }}
              onNew={newChat}
              onDelete={deleteThread}
            />
          </div>
        </div>
      )}

      {/* Chat */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
          <button onClick={() => setDrawer(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 md:hidden" aria-label="Chats">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-fg">{thread?.title || "New conversation"}</div>
            <div className="truncate text-xs text-muted">{activeSubject ? `Context: ${activeSubject.name} syllabus` : "General tutor"}</div>
          </div>
          {!thread && subjectsQ.data?.length > 0 && (
            <Select value={newSubject} onChange={(e) => setNewSubject(e.target.value)} className="h-9 w-40 text-xs sm:w-48">
              <option value="">Any subject</option>
              {subjectsQ.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            {loadingThread ? (
              <div className="grid place-items-center py-20">
                <Spinner />
              </div>
            ) : messages.length === 0 ? (
              <div className="pt-6 text-center sm:pt-14">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-600/30">
                  <Sparkles className="h-7 w-7" />
                </div>
                <h2 className="mt-4 text-xl font-bold text-fg">Kya padhna hai aaj?</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted">Ask any doubt in English or Hinglish, or snap a photo of a question for a step-by-step solution.</p>
                <div className="mx-auto mt-8 grid max-w-xl gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        setInput(s + (activeSubject ? ` — ${activeSubject.name}: ` : ": "));
                        textRef.current?.focus();
                      }}
                      className="rounded-xl border border-line bg-surface px-4 py-3 text-left text-sm text-fg transition hover:border-brand-400 hover:bg-surface-2"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => <Message key={m.id} m={m} />)
            )}
            <div ref={bottom} />
          </div>
        </div>

        <div className="border-t border-line bg-surface/80 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            {preview && (
              <div className="relative mb-2 inline-block">
                <img src={preview} alt="Attached question" className="h-20 rounded-xl border border-line object-cover" />
                <button onClick={() => setImage(null)} className="absolute -right-2 -top-2 rounded-full bg-fg p-1 text-[var(--bg)]" aria-label="Remove image" style={{ background: "var(--text)" }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10">
              <button onClick={() => fileRef.current?.click()} className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg" title="Attach a photo of a question" aria-label="Attach photo">
                <Camera className="h-5 w-5" />
              </button>
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setImage(e.target.files?.[0] || null)} />
              <textarea
                ref={textRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
                }}
                onPaste={onPaste}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Ask a doubt, paste a question, or attach a photo…"
                className="max-h-44 flex-1 resize-none bg-transparent py-2 text-sm text-fg placeholder:text-muted/70 focus:outline-none focus-visible:outline-none"
              />
              {streaming ? (
                <button onClick={() => abortRef.current?.abort()} className="rounded-xl bg-surface-2 p-2 text-fg" aria-label="Stop">
                  <Square className="h-5 w-5" />
                </button>
              ) : (
                <button
                  onClick={() => send()}
                  disabled={!input.trim() && !image}
                  className="rounded-xl bg-brand-600 p-2 text-white transition hover:bg-brand-700 disabled:opacity-40"
                  aria-label="Send"
                >
                  <ArrowUp className="h-5 w-5" />
                </button>
              )}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted">AI can make mistakes. Double-check important facts with your textbook.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
