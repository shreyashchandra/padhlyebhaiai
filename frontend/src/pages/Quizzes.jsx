import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Brain, ChevronRight, Sparkles, Target, Trash2 } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { useAuth } from "../lib/auth";
import { cn, colorOf, formatDate } from "../lib/utils";
import { Button, Card, CardHeader, EmptyState, Field, PageHeader, PageLoader, Segmented, Select } from "../components/ui";

export default function Quizzes() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const subjectsQ = useApi("/api/subjects");
  const quizzesQ = useApi("/api/quizzes");
  const [subjectId, setSubjectId] = useState(params.get("subject") || "");
  const [topicId, setTopicId] = useState(params.get("topic") || "");
  const [mode, setMode] = useState(params.get("topic") ? "topic" : "mixed");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState("medium");
  const [busy, setBusy] = useState(false);

  const subjects = useMemo(() => (subjectsQ.data || []).filter((s) => s.topic_count > 0), [subjectsQ.data]);
  const subjectDetail = useApi(subjectId ? `/api/subjects/${subjectId}` : null, { enabled: Boolean(subjectId) });
  const subjectsById = Object.fromEntries((subjectsQ.data || []).map((s) => [s.id, s]));

  useEffect(() => {
    if (!subjectId && subjects.length) setSubjectId(String(subjects[0].id));
  }, [subjects, subjectId]);

  const start = async () => {
    if (!subjectId) return toast.error("Pick a subject.");
    if (mode === "topic" && !topicId) return toast.error("Pick a topic.");
    setBusy(true);
    try {
      const { data } = await api.post("/api/quizzes", {
        subject_id: Number(subjectId),
        topic_ids: mode === "topic" ? [Number(topicId)] : [],
        focus_weak: mode === "weak",
        count,
        difficulty,
      });
      refresh();
      navigate(`/quiz/${data.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    await api.delete(`/api/quizzes/${id}`).catch(() => {});
    quizzesQ.reload();
  };

  if (subjectsQ.loading && !subjectsQ.data) return <PageLoader />;

  return (
    <>
      <PageHeader title="Quizzes" subtitle="Exam-style practice. Every answer updates your topic strength." />

      {subjects.length === 0 ? (
        <Card>
          <EmptyState
            icon={Brain}
            title="No topics to quiz on yet"
            description="Add a subject and its syllabus, then come back for AI-generated practice questions."
            action={
              <Link to="/subjects">
                <Button>Go to subjects</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <Card className="h-fit p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-fg">New quiz</h2>
                <p className="text-sm text-muted">Takes ~10 seconds to generate</p>
              </div>
            </div>
            <div className="space-y-4">
              <Field label="Subject">
                {(id) => (
                  <Select
                    id={id}
                    value={subjectId}
                    onChange={(e) => {
                      setSubjectId(e.target.value);
                      setTopicId("");
                    }}
                  >
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Focus">
                <Segmented
                  className="w-full"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "mixed", label: "Whole subject" },
                    { value: "topic", label: "One topic" },
                    { value: "weak", label: "My weak spots" },
                  ]}
                />
              </Field>
              {mode === "topic" && (
                <Field label="Topic">
                  {(id) => (
                    <Select id={id} value={topicId} onChange={(e) => setTopicId(e.target.value)}>
                      <option value="">Choose a topic…</option>
                      {subjectDetail.data?.topics.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Questions">
                  {(id) => (
                    <Select id={id} value={count} onChange={(e) => setCount(Number(e.target.value))}>
                      {[5, 10, 15, 20].map((n) => (
                        <option key={n} value={n}>
                          {n} questions
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Difficulty">
                  {(id) => (
                    <Select id={id} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="exam">Exam level</option>
                    </Select>
                  )}
                </Field>
              </div>
              <Button size="lg" className="w-full" onClick={start} loading={busy}>
                <Brain className="h-4 w-4" /> {busy ? "Writing your questions…" : "Start quiz"}
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="History" icon={Target} subtitle="Your recent attempts" />
            <div className="p-3">
              {!quizzesQ.data?.length ? (
                <p className="px-2 py-8 text-center text-sm text-muted">No quizzes yet. Your first one is a click away.</p>
              ) : (
                quizzesQ.data.map((q) => {
                  const subject = subjectsById[q.subject_id];
                  const pct = q.score != null ? Math.round((q.score / q.total) * 100) : null;
                  return (
                    <div key={q.id} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2/60">
                      <Link to={`/quiz/${q.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                          className={cn(
                            "grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold",
                            pct == null
                              ? "bg-surface-2 text-muted"
                              : pct >= 80
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                                : pct >= 50
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                                  : "bg-rose-500/10 text-rose-600 dark:text-rose-300",
                          )}
                        >
                          {pct == null ? "—" : `${pct}%`}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-fg">{q.title}</div>
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                            {subject && <span className={cn("h-1.5 w-1.5 rounded-full", colorOf(subject.color).dot)} />}
                            {subject?.name} · {q.total} Qs · {q.difficulty} · {formatDate(q.created_at.slice(0, 10))}
                            {q.score == null && <span className="font-medium text-brand-600 dark:text-brand-300"> · Resume</span>}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </Link>
                      <button onClick={() => remove(q.id)} className="rounded p-1 text-muted opacity-0 hover:text-rose-500 group-hover:opacity-100" aria-label="Delete quiz">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
