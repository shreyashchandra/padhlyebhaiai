import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Layers, PartyPopper, Plus, Sparkles, Trash2 } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { cn, colorOf } from "../lib/utils";
import { Button, Card, EmptyState, Field, Modal, PageHeader, PageLoader, Progress, Segmented, Select, Textarea } from "../components/ui";
import { InlineMarkdown } from "../components/Markdown";
import FileDrop from "../components/FileDrop";

const GRADES = [
  { key: "again", label: "Again", hint: "<1d", cls: "bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300" },
  { key: "hard", label: "Hard", hint: "", cls: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300" },
  { key: "good", label: "Good", hint: "", cls: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300" },
  { key: "easy", label: "Easy", hint: "", cls: "bg-sky-500/10 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300" },
];

function Review({ cards: initial, onExit }) {
  const [queue, setQueue] = useState(initial);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const total = initial.length;
  const card = queue[0];

  const grade = useCallback(
    async (g) => {
      if (!card || !flipped) return;
      setFlipped(false);
      setReviewed((r) => r + 1);
      // "Again" goes to the back of this session's queue so you see it once more.
      setQueue((q) => (g === "again" ? [...q.slice(1), q[0]] : q.slice(1)));
      try {
        await api.post(`/api/flashcards/${card.id}/review`, { grade: g });
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [card, flipped],
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
      const i = ["1", "2", "3", "4"].indexOf(e.key);
      if (i >= 0) grade(GRADES[i].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade]);

  if (!card) {
    return (
      <Card>
        <EmptyState
          icon={PartyPopper}
          title="Session complete!"
          description={`You reviewed ${reviewed} card${reviewed === 1 ? "" : "s"}. Spaced repetition will bring each one back right before you'd forget it.`}
          action={<Button onClick={onExit}>Back to decks</Button>}
        />
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onExit}>
          <ArrowLeft className="h-4 w-4" /> Exit
        </Button>
        <span className="text-sm text-muted">{queue.length} left</span>
      </div>
      <Progress value={(Math.min(reviewed, total) / total) * 100} className="mb-6 h-1.5" />

      <button onClick={() => setFlipped((f) => !f)} className={cn("flip block w-full text-left", flipped && "flipped")} aria-label="Flip card">
        <div className="flip-inner relative min-h-[300px]">
          <Card className="flip-face absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <span className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted">Question</span>
            <div className="text-xl font-semibold leading-snug text-fg">
              <InlineMarkdown>{card.front}</InlineMarkdown>
            </div>
            <span className="mt-8 text-xs text-muted">Tap or press space to reveal</span>
          </Card>
          <Card className="flip-face flip-back absolute inset-0 flex flex-col items-center justify-center bg-surface p-8 text-center">
            <span className="mb-4 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">Answer</span>
            <div className="text-lg leading-relaxed text-fg">
              <InlineMarkdown>{card.back}</InlineMarkdown>
            </div>
          </Card>
        </div>
      </button>

      <div className={cn("mt-6 grid grid-cols-4 gap-2 transition", !flipped && "pointer-events-none opacity-40")}>
        {GRADES.map((g, i) => (
          <button key={g.key} onClick={() => grade(g.key)} className={cn("rounded-xl py-3 text-sm font-semibold transition", g.cls)}>
            {g.label}
            <span className="block text-[10px] font-normal opacity-70">key {i + 1}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GenerateModal({ open, onClose, subjects, initialSubject, initialTopic, onDone }) {
  const { refresh } = useAuth();
  const [subjectId, setSubjectId] = useState(initialSubject || subjects[0]?.id || "");
  const [topicId, setTopicId] = useState(initialTopic || "");
  const [source, setSource] = useState("topic");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const [count, setCount] = useState(12);
  const [busy, setBusy] = useState(false);
  const detail = useApi(subjectId ? `/api/subjects/${subjectId}` : null, { enabled: Boolean(subjectId) });

  const submit = async () => {
    setBusy(true);
    try {
      let data;
      if (source === "file") {
        if (!file) throw new Error("Choose a notes file first.");
        const form = new FormData();
        form.append("subject_id", subjectId);
        form.append("count", count);
        form.append("file", file);
        ({ data } = await api.post("/api/flashcards/generate-from-file", form));
      } else {
        if (source === "notes" && notes.trim().length < 30) throw new Error("Paste a bit more of your notes.");
        ({ data } = await api.post("/api/flashcards/generate", {
          subject_id: Number(subjectId),
          topic_id: source === "topic" && topicId ? Number(topicId) : null,
          source_text: source === "notes" ? notes : null,
          count,
        }));
      }
      toast.success(`${data.length} flashcards created`);
      refresh();
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.response ? errorMessage(err) : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate flashcards with AI"
      description="From a syllabus topic, your own notes, or a PDF/photo of notes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            <Sparkles className="h-4 w-4" /> Generate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Subject">
          {(id) => (
            <Select id={id} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Segmented
          className="w-full"
          value={source}
          onChange={setSource}
          options={[
            { value: "topic", label: "Topic" },
            { value: "notes", label: "Paste notes" },
            { value: "file", label: "Upload notes" },
          ]}
        />
        {source === "topic" && (
          <Field label="Topic" hint="Leave as 'Whole subject' for a mix across the syllabus.">
            {(id) => (
              <Select id={id} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                <option value="">Whole subject</option>
                {detail.data?.topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {source === "notes" && <Textarea rows={7} placeholder="Paste your class notes or textbook section…" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        {source === "file" && <FileDrop file={file} onChange={setFile} />}
        <Field label="Number of cards">
          {(id) => (
            <Select id={id} value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[8, 12, 20, 30].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Modal>
  );
}

export default function Flashcards() {
  const [params, setParams] = useSearchParams();
  const subjectsQ = useApi("/api/subjects");
  const statsQ = useApi("/api/flashcards/stats");
  const [reviewing, setReviewing] = useState(null);
  const [browsing, setBrowsing] = useState(null);
  const [genOpen, setGenOpen] = useState(params.get("generate") === "1");
  const [addOpen, setAddOpen] = useState(false);
  const [manual, setManual] = useState({ front: "", back: "", subject_id: "" });
  const browseQ = useApi(browsing ? "/api/flashcards" : null, { enabled: Boolean(browsing), params: { subject_id: browsing } });

  const subjects = useMemo(() => subjectsQ.data || [], [subjectsQ.data]);
  const stats = useMemo(() => Object.fromEntries((statsQ.data || []).map((s) => [s.subject_id, s])), [statsQ.data]);
  const totalDue = (statsQ.data || []).reduce((a, s) => a + s.due, 0);

  const startReview = async (subjectId) => {
    try {
      const { data } = await api.get("/api/flashcards", { params: { due_only: true, subject_id: subjectId ?? undefined, limit: 100 } });
      if (!data.length) return toast("Nothing due here. Come back later or generate more cards.");
      setReviewing(data.sort(() => Math.random() - 0.5));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const addManual = async () => {
    if (!manual.front.trim() || !manual.back.trim()) return;
    try {
      await api.post("/api/flashcards", { front: manual.front, back: manual.back, subject_id: manual.subject_id ? Number(manual.subject_id) : null });
      toast.success("Card added");
      setManual((m) => ({ ...m, front: "", back: "" }));
      statsQ.reload();
      browseQ.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (subjectsQ.loading && !subjectsQ.data) return <PageLoader />;

  if (reviewing) {
    return (
      <Review
        cards={reviewing}
        onExit={() => {
          setReviewing(null);
          statsQ.reload();
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Flashcards"
        subtitle="Spaced repetition: review a few minutes a day, remember for the exam."
        actions={
          subjects.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add card
              </Button>
              <Button onClick={() => setGenOpen(true)}>
                <Sparkles className="h-4 w-4" /> Generate
              </Button>
            </>
          )
        }
      />

      {subjects.length === 0 ? (
        <Card>
          <EmptyState icon={Layers} title="Add a subject first" description="Flashcards are organised by subject." action={<Link to="/subjects"><Button>Go to subjects</Button></Link>} />
        </Card>
      ) : (
        <>
          <Card className="mb-6 flex flex-col items-start justify-between gap-4 bg-gradient-to-br from-brand-600 to-violet-600 p-6 text-white sm:flex-row sm:items-center">
            <div>
              <div className="text-sm text-white/80">Due for review today</div>
              <div className="text-4xl font-extrabold tracking-tight">{totalDue}</div>
              <div className="text-sm text-white/80">{totalDue ? `About ${Math.max(1, Math.round(totalDue * 0.15))} min` : "You're all caught up ✨"}</div>
            </div>
            <Button size="lg" className="bg-white !text-brand-700 hover:bg-white/90" disabled={!totalDue} onClick={() => startReview(null)}>
              Review all due
            </Button>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {subjects.map((s) => {
              const st = stats[s.id] || { total: 0, due: 0 };
              return (
                <Card key={s.id} className="p-5">
                  <div className="flex items-center gap-3">
                    <div className={cn("grid h-10 w-10 place-items-center rounded-xl", colorOf(s.color).soft)}>
                      <Layers className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-fg">{s.name}</div>
                      <div className="text-xs text-muted">
                        {st.total} cards · <span className={cn(st.due && "font-semibold text-brand-600 dark:text-brand-300")}>{st.due} due</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" className="flex-1" disabled={!st.due} onClick={() => startReview(s.id)}>
                      Review
                    </Button>
                    <Button size="sm" variant="secondary" disabled={!st.total} onClick={() => setBrowsing(s.id)}>
                      Browse
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        setParams({ subject: s.id });
                        setGenOpen(true);
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {genOpen && subjects.length > 0 && (
        <GenerateModal
          open
          onClose={() => {
            setGenOpen(false);
            setParams({});
          }}
          subjects={subjects}
          initialSubject={params.get("subject")}
          initialTopic={params.get("topic")}
          onDone={() => statsQ.reload()}
        />
      )}

      <Modal open={Boolean(browsing)} onClose={() => setBrowsing(null)} title="Cards" size="lg">
        <div className="space-y-2">
          {browseQ.data?.map((c) => (
            <div key={c.id} className="group flex gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-medium text-fg">
                  <InlineMarkdown>{c.front}</InlineMarkdown>
                </div>
                <div className="mt-1 text-muted">
                  <InlineMarkdown>{c.back}</InlineMarkdown>
                </div>
                <div className="mt-1 text-[11px] text-muted">Next review: {c.due}</div>
              </div>
              <button
                onClick={async () => {
                  await api.delete(`/api/flashcards/${c.id}`);
                  browseQ.reload();
                  statsQ.reload();
                }}
                className="self-start rounded p-1 text-muted hover:text-rose-500"
                aria-label="Delete card"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a flashcard"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Done
            </Button>
            <Button onClick={addManual}>Add card</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Subject">
            {(id) => (
              <Select id={id} value={manual.subject_id} onChange={(e) => setManual((m) => ({ ...m, subject_id: e.target.value }))}>
                <option value="">Choose…</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Front (question)">{(id) => <Textarea id={id} rows={2} value={manual.front} onChange={(e) => setManual((m) => ({ ...m, front: e.target.value }))} />}</Field>
          <Field label="Back (answer)" hint="Supports $math$ with LaTeX.">
            {(id) => <Textarea id={id} rows={3} value={manual.back} onChange={(e) => setManual((m) => ({ ...m, back: e.target.value }))} />}
          </Field>
        </div>
      </Modal>
    </>
  );
}
