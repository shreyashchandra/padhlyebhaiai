import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  ExternalLink,
  Globe,
  History,
  Lightbulb,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { addDays, cn, colorOf, formatDate, formatMinutes, isoDate, relativeDay, WEEKDAYS } from "../lib/utils";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, PageLoader, Progress, Segmented, Select } from "../components/ui";
import TaskItem from "../components/TaskItem";
import Markdown from "../components/Markdown";

const MODES = [
  { value: "full-prep", label: "Full prep" },
  { value: "last-month", label: "Last month" },
  { value: "crash-prep", label: "Crash course" },
];

function PlanForm({ subjects, onCreated, onCancel }) {
  const usable = subjects.filter((s) => s.topic_count > 0);
  const latestExam = usable.map((s) => s.exam_date).filter((d) => d && d >= isoDate()).sort().pop();
  const [form, setForm] = useState({
    subject_ids: usable.map((s) => s.id),
    start_date: isoDate(),
    end_date: latestExam ? addDays(latestExam, -1) : addDays(isoDate(), 30),
    hours: 3,
    session_minutes: 60,
    study_days: [...WEEKDAYS],
    prep_mode: "full-prep",
    use_ai_priorities: true,
    web_research: false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const days = Math.max(0, Math.round((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1);
  const studyDays = Math.round((days * form.study_days.length) / 7);
  const neededMin = usable.filter((s) => form.subject_ids.includes(s.id)).reduce((a, s) => a + (s.remaining_minutes || 0), 0);

  const submit = async () => {
    if (!form.subject_ids.length) return toast.error("Pick at least one subject.");
    if (!form.study_days.length) return toast.error("Pick at least one study day.");
    if (form.end_date < form.start_date) return toast.error("End date must be after the start date.");
    setBusy(true);
    try {
      const { data } = await api.post("/api/plans", {
        subject_ids: form.subject_ids,
        start_date: form.start_date,
        end_date: form.end_date,
        daily_minutes: Math.round(form.hours * 60),
        session_minutes: Number(form.session_minutes),
        study_days: form.study_days,
        prep_mode: form.prep_mode,
        use_ai_priorities: form.use_ai_priorities,
        web_research: form.web_research,
      });
      toast.success(`Plan ready: ${data.task_count} tasks scheduled.`);
      onCreated(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (usable.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={CalendarPlus}
          title="Add a syllabus first"
          description="The planner schedules your actual syllabus topics. Add a subject and upload its syllabus to get started."
          action={
            <Link to="/subjects">
              <Button>Go to subjects</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-fg">Create a study plan</h2>
          <p className="mt-1 text-sm text-muted">AI ranks your topics by importance; the planner fits them around your exam dates and daily time.</p>
        </div>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <div className="space-y-6">
        <Field label="Subjects to include">
          <div className="flex flex-wrap gap-2">
            {usable.map((s) => {
              const on = form.subject_ids.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle("subject_ids", s.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                    on ? "border-brand-500 bg-brand-500/10 text-fg" : "border-line text-muted hover:text-fg",
                  )}
                >
                  <span className={cn("h-2.5 w-2.5 rounded-full", colorOf(s.color).dot)} />
                  {s.name}
                  {s.exam_date && <span className="text-xs text-muted">· {formatDate(s.exam_date)}</span>}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">{(id) => <Input id={id} type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />}</Field>
          <Field label="End date" hint="Usually the day before your last exam">
            {(id) => <Input id={id} type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} />}
          </Field>
        </div>

        <Field label={`Study time per day: ${form.hours} hour${form.hours === 1 ? "" : "s"}`}>
          <input type="range" min={0.5} max={12} step={0.5} value={form.hours} onChange={(e) => set("hours", Number(e.target.value))} className="w-full accent-[var(--color-brand-600)]" />
        </Field>

        <Field label="Study days">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggle("study_days", d)}
                className={cn(
                  "rounded-lg py-2 text-xs font-semibold transition",
                  form.study_days.includes(d) ? "bg-brand-600 text-white" : "bg-surface-2 text-muted hover:text-fg",
                )}
              >
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preparation mode" hint={form.prep_mode === "crash-prep" ? "Skips low-priority topics and compresses time." : undefined}>
            <Segmented value={form.prep_mode} onChange={(v) => set("prep_mode", v)} options={MODES} className="w-full" />
          </Field>
          <Field label="Longest single session">
            {(id) => (
              <Select id={id} value={form.session_minutes} onChange={(e) => set("session_minutes", e.target.value)}>
                {[30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <div className="space-y-2 rounded-xl bg-surface-2/70 p-4">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={form.use_ai_priorities} onChange={(e) => set("use_ai_priorities", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-brand-600)]" />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <Sparkles className="h-4 w-4 text-brand-500" /> AI topic prioritisation & strategy
              </span>
              <span className="text-xs text-muted">Ranks topics by weightage, re-estimates time using your confidence & quiz scores. Uses a little AI credit.</span>
            </span>
          </label>
          <label className={cn("flex items-start gap-3", !form.use_ai_priorities && "opacity-50")}>
            <input
              type="checkbox"
              disabled={!form.use_ai_priorities}
              checked={form.web_research && form.use_ai_priorities}
              onChange={(e) => set("web_research", e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-brand-600)]"
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                <Globe className="h-4 w-4 text-brand-500" /> Research past papers on the web
              </span>
              <span className="text-xs text-muted">Looks up chapter weightage and repeated questions for your exam. Slower, uses more credit.</span>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {studyDays} study days × {formatMinutes(form.hours * 60)} = <strong className="text-fg">{formatMinutes(studyDays * form.hours * 60)}</strong> available
            {neededMin > 0 && (
              <>
                {" "}
                · ~{formatMinutes(neededMin)} of topics
              </>
            )}
          </p>
          <Button size="lg" onClick={submit} loading={busy}>
            <Sparkles className="h-4 w-4" /> {busy ? "Building your plan…" : "Generate plan"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function AgendaDay({ date, tasks, subjectsById, onToggle, onAdd }) {
  const today = isoDate();
  const total = tasks.reduce((a, t) => a + t.minutes, 0);
  const done = tasks.filter((t) => t.done).length;
  const isPast = date < today;
  return (
    <div className={cn("rounded-2xl border border-line bg-surface", date === today && "ring-2 ring-brand-500/40")}>
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="flex items-baseline gap-2">
          <span className={cn("font-semibold", date === today ? "text-brand-600 dark:text-brand-300" : "text-fg")}>{relativeDay(date)}</span>
          <span className="text-xs text-muted">{formatDate(date, { weekday: "long" })}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {isPast && done < tasks.length && <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">{tasks.length - done} missed</Badge>}
          <span>
            {done}/{tasks.length} · {formatMinutes(total)}
          </span>
          <button onClick={() => onAdd(date)} className="rounded-md p-1 hover:bg-surface-2 hover:text-fg" title="Add your own task">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="px-2 pb-2 pt-1">
        {tasks.map((t) => (
          <TaskItem key={t.id} task={t} subject={subjectsById[t.subject_id]} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

export default function Planner() {
  const subjectsQ = useApi("/api/subjects");
  const plansQ = useApi("/api/plans");
  const activeId = plansQ.data?.find((p) => p.is_active)?.id;
  const [planId, setPlanId] = useState(null);
  const currentId = planId ?? activeId;
  const planQ = useApi(currentId ? `/api/plans/${currentId}` : null, { enabled: Boolean(currentId) });
  const plan = planQ.data;

  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState("schedule");
  const [showPast, setShowPast] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adding, setAdding] = useState(null);
  const [newTask, setNewTask] = useState({ title: "", minutes: 30, subject_id: "" });
  const [rebalancing, setRebalancing] = useState(false);

  useEffect(() => {
    if (plansQ.data && plansQ.data.length === 0) setCreating(true);
  }, [plansQ.data]);

  const subjectsById = useMemo(() => Object.fromEntries((subjectsQ.data || []).map((s) => [s.id, s])), [subjectsQ.data]);

  const days = useMemo(() => {
    if (!plan) return [];
    const today = isoDate();
    const map = new Map();
    for (const t of plan.tasks) {
      if (!showPast && t.date < today && t.done) continue;
      if (!map.has(t.date)) map.set(t.date, []);
      map.get(t.date).push(t);
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  }, [plan, showPast]);

  // Subjects with remaining-minute estimates for the form summary.
  const subjectsForForm = useMemo(() => subjectsQ.data || [], [subjectsQ.data]);

  if ((subjectsQ.loading && !subjectsQ.data) || (plansQ.loading && !plansQ.data)) return <PageLoader />;

  const toggleTask = async (task) => {
    const done = !task.done;
    planQ.setData((p) => ({ ...p, tasks: p.tasks.map((t) => (t.id === task.id ? { ...t, done } : t)), done_count: p.done_count + (done ? 1 : -1) }));
    try {
      await api.patch(`/api/tasks/${task.id}`, { done });
    } catch (err) {
      toast.error(errorMessage(err));
      planQ.reload();
    }
  };

  const rebalance = async () => {
    setRebalancing(true);
    try {
      const { data } = await api.post(`/api/plans/${plan.id}/rebalance`);
      planQ.setData(data);
      toast.success("Rebalanced! Unfinished work has been spread across the remaining days.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRebalancing(false);
    }
  };

  const deletePlan = async (id) => {
    if (!confirm("Delete this plan and all its tasks?")) return;
    await api.delete(`/api/plans/${id}`).catch((e) => toast.error(errorMessage(e)));
    setPlanId(null);
    plansQ.reload();
  };

  const activate = async (id) => {
    await api.post(`/api/plans/${id}/activate`);
    setPlanId(id);
    setHistoryOpen(false);
    plansQ.reload();
    toast.success("Plan activated — its tasks now show on your Today page.");
  };

  const addTask = async () => {
    if (!newTask.title.trim()) return;
    try {
      const { data } = await api.post("/api/tasks", {
        title: newTask.title.trim(),
        date: adding,
        minutes: Number(newTask.minutes) || 30,
        subject_id: newTask.subject_id ? Number(newTask.subject_id) : null,
      });
      // Manual tasks aren't attached to a plan; show them here for context.
      planQ.setData((p) => ({ ...p, tasks: [...p.tasks, data] }));
      setAdding(null);
      setNewTask({ title: "", minutes: 30, subject_id: "" });
      toast.success("Task added");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const showForm = creating || (!currentId && plansQ.data?.length === 0);

  return (
    <>
      <PageHeader
        title="Study planner"
        subtitle="A day-by-day plan built from your syllabus and exam dates."
        actions={
          !showForm && (
            <>
              {plansQ.data?.length > 1 && (
                <Button variant="ghost" onClick={() => setHistoryOpen(true)}>
                  <History className="h-4 w-4" /> Past plans
                </Button>
              )}
              <Button variant="secondary" onClick={() => setCreating(true)}>
                <CalendarPlus className="h-4 w-4" /> New plan
              </Button>
            </>
          )
        }
      />

      {showForm ? (
        <PlanForm
          subjects={subjectsForForm}
          onCancel={plansQ.data?.length ? () => setCreating(false) : undefined}
          onCreated={(p) => {
            setCreating(false);
            setPlanId(p.id);
            planQ.setData(p);
            plansQ.reload();
          }}
        />
      ) : !plan ? (
        planQ.error ? <ErrorBanner message={planQ.error} onRetry={planQ.reload} /> : <PageLoader />
      ) : (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-fg">{plan.title}</h2>
                  {plan.is_active ? <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Active</Badge> : <Badge className="bg-surface-2 text-muted">Inactive</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {formatDate(plan.start_date)} → {formatDate(plan.end_date)} · {formatMinutes(plan.daily_minutes)}/day · {MODES.find((m) => m.value === plan.prep_mode)?.label}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <Progress value={(plan.done_count / Math.max(1, plan.task_count)) * 100} className="h-2 w-48" />
                  <span className="text-xs text-muted">
                    {plan.done_count}/{plan.task_count} tasks
                  </span>
                </div>
              </div>
              <div className="no-print flex flex-wrap gap-2">
                {!plan.is_active && <Button onClick={() => activate(plan.id)}>Make active</Button>}
                <Button variant={plan.overdue_count ? "primary" : "secondary"} onClick={rebalance} loading={rebalancing}>
                  <RefreshCw className="h-4 w-4" /> {plan.overdue_count ? `Rebalance ${plan.overdue_count} missed` : "Rebalance"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="Print plan" title="Print / save as PDF">
                  <Printer className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deletePlan(plan.id)} aria-label="Delete plan" className="hover:text-rose-500">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {plan.unscheduled?.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" /> {plan.unscheduled.length} topic{plan.unscheduled.length === 1 ? "" : "s"} didn't fit
                </div>
                <p className="mt-1 text-xs opacity-90">
                  {plan.unscheduled
                    .slice(0, 6)
                    .map((u) => u.name)
                    .join(", ")}
                  {plan.unscheduled.length > 6 && ` and ${plan.unscheduled.length - 6} more`}. Add more study hours or days, or use crash mode to focus on must-do topics.
                </p>
              </div>
            )}
          </Card>

          <div className="no-print flex items-center justify-between gap-3">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "schedule", label: "Schedule" },
                { value: "strategy", label: "AI strategy" },
              ]}
            />
            {tab === "schedule" && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-600)]" />
                Show completed past days
              </label>
            )}
          </div>

          {tab === "schedule" ? (
            days.length === 0 ? (
              <Card>
                <EmptyState icon={CalendarDays} title="Nothing left to schedule" description="Every task in this plan is complete. Time for a new plan or some quizzes!" />
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {days.map(([date, tasks]) => (
                  <AgendaDay key={date} date={date} tasks={tasks} subjectsById={subjectsById} onToggle={toggleTask} onAdd={setAdding} />
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <Card>
                <CardHeader title="Strategy" icon={Lightbulb} subtitle="Personalised by AI for this plan" />
                <div className="p-5">
                  {plan.insights_markdown ? <Markdown>{plan.insights_markdown}</Markdown> : <p className="text-sm text-muted">This plan was created without AI prioritisation.</p>}
                </div>
              </Card>
              <Card>
                <CardHeader title="Sources" icon={Globe} subtitle="Web research used" />
                <div className="space-y-2 p-4">
                  {plan.sources?.length ? (
                    plan.sources.map((s) => (
                      <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="block rounded-xl p-3 transition hover:bg-surface-2">
                        <div className="flex items-start gap-2 text-sm font-medium text-fg">
                          <span className="line-clamp-2 flex-1">{s.title}</span>
                          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted">{s.snippet}</p>
                      </a>
                    ))
                  ) : (
                    <p className="p-1 text-sm text-muted">No web research for this plan. Enable it when creating a plan to include past-paper insights.</p>
                  )}
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Your plans">
        <div className="space-y-2">
          {plansQ.data?.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{p.title}</div>
                <div className="text-xs text-muted">
                  {formatDate(p.start_date)} → {formatDate(p.end_date)} · {p.done_count}/{p.task_count} done
                </div>
              </div>
              <div className="flex gap-1">
                {p.is_active ? (
                  <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">Active</Badge>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => activate(p.id)}>
                    Activate
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPlanId(p.id);
                    setHistoryOpen(false);
                  }}
                >
                  View
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(adding)}
        onClose={() => setAdding(null)}
        title={`Add task · ${adding ? relativeDay(adding) : ""}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button onClick={addTask}>Add task</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="What will you do?">
            {(id) => <Input id={id} placeholder="e.g. Solve 2019 board paper" value={newTask.title} onChange={(e) => setNewTask((t) => ({ ...t, title: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && addTask()} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minutes">{(id) => <Input id={id} type="number" min={5} max={600} value={newTask.minutes} onChange={(e) => setNewTask((t) => ({ ...t, minutes: e.target.value }))} />}</Field>
            <Field label="Subject">
              {(id) => (
                <Select id={id} value={newTask.subject_id} onChange={(e) => setNewTask((t) => ({ ...t, subject_id: e.target.value }))}>
                  <option value="">General</option>
                  {subjectsQ.data?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}
