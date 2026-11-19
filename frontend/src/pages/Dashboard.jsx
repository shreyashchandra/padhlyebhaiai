import { useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  CalendarPlus,
  Clock,
  Flame,
  Layers,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { cn, colorOf, formatMinutes, greeting, relativeDay } from "../lib/utils";
import { Button, Card, CardHeader, EmptyState, ErrorBanner, PageLoader, Progress, Ring, Stat } from "../components/ui";
import TaskItem from "../components/TaskItem";

function Countdown({ subject }) {
  const color = colorOf(subject.color);
  const d = subject.days_left;
  const urgent = d != null && d <= 7;
  return (
    <Link to={`/subjects/${subject.id}`} className="group block rounded-xl border border-line p-3.5 transition hover:border-brand-400/60 hover:bg-surface-2/50">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color.dot)} />
          <span className="truncate text-sm font-semibold text-fg">{subject.name}</span>
        </div>
        <span className={cn("shrink-0 text-xs font-semibold", urgent ? "text-rose-500" : "text-muted")}>
          {d == null ? "No date" : d < 0 ? "Exam over" : d === 0 ? "Today!" : `${d}d left`}
        </span>
      </div>
      <Progress value={subject.progress} className="mt-3 h-1.5" barClassName={color.bar} />
      <div className="mt-1.5 flex justify-between text-[11px] text-muted">
        <span>
          {subject.done_count}/{subject.topic_count} topics
        </span>
        <span>{subject.progress}%</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { data, setData, error, loading, reload } = useApi("/api/dashboard");
  const subjectsById = useMemo(() => Object.fromEntries((data?.subjects || []).map((s) => [s.id, s])), [data]);

  const toggleTask = async (task) => {
    const done = !task.done;
    const patch = (list) => list.map((t) => (t.id === task.id ? { ...t, done } : t));
    setData((d) => ({ ...d, today: { ...d.today, tasks: patch(d.today.tasks) }, overdue: patch(d.overdue) }));
    try {
      await api.patch(`/api/tasks/${task.id}`, { done });
      if (done) toast.success("Nice! One step closer. ✅");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
      reload();
    }
  };

  const rebalance = async () => {
    if (!data?.active_plan) return;
    try {
      await api.post(`/api/plans/${data.active_plan.id}/rebalance`);
      toast.success("Plan rebalanced — missed work spread over the coming days.");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;

  const { today, streak, week, week_minutes, subjects, weak_topics, due_cards, overdue_count, user } = data;
  const firstName = (user.name || "").split(" ")[0];
  const goalPct = today.goal_minutes ? (today.minutes / today.goal_minutes) * 100 : 0;
  const tasksDone = today.tasks.filter((t) => t.done).length;
  const remainingMin = today.tasks.filter((t) => !t.done).reduce((a, t) => a + t.minutes, 0);
  const isNew = subjects.length === 0;

  if (isNew) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {greeting()}
          {firstName ? `, ${firstName}` : ""} 👋
        </h1>
        <p className="mt-1 text-muted">Let's set up your exam prep. It takes about two minutes.</p>
        <div className="mt-8 grid gap-4">
          {[
            { n: 1, icon: BookOpen, title: "Choose your exam", text: "JEE, NEET, CBSE, CAT, SAT, IELTS and more — the full syllabus is added for you.", to: "/exams", cta: "Choose exam" },
            { n: 2, icon: Sparkles, title: "Set exam dates & tweak the syllabus", text: "Edit any topic, or create a custom subject and upload its syllabus." },
            { n: 3, icon: CalendarPlus, title: "Generate your study plan", text: "A realistic day-by-day plan that fits your daily hours." },
          ].map((s) => (
            <Card key={s.n} className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Step {s.n}</div>
                <div className="font-semibold text-fg">{s.title}</div>
                <div className="text-sm text-muted">{s.text}</div>
              </div>
              {s.to && (
                <Link to={s.to}>
                  <Button>
                    {s.cta} <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              )}
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">{new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            {greeting()}
            {firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-muted">
            {today.tasks.length === 0
              ? "No tasks planned for today."
              : remainingMin > 0
                ? `${today.tasks.length - tasksDone} tasks left today · about ${formatMinutes(remainingMin)} of study.`
                : "All of today's tasks are done. Brilliant! 🎉"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/focus">
            <Button variant="secondary">
              <Clock className="h-4 w-4" /> Start focus
            </Button>
          </Link>
          <Link to="/tutor">
            <Button>
              <Sparkles className="h-4 w-4" /> Ask AI tutor
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="flex items-center gap-4 p-4">
          <Ring value={goalPct} size={58} stroke={6}>
            <Target className="h-4 w-4 text-brand-500" />
          </Ring>
          <div>
            <div className="text-sm text-muted">Today</div>
            <div className="text-xl font-bold text-fg">{formatMinutes(today.minutes)}</div>
            <div className="text-xs text-muted">of {formatMinutes(today.goal_minutes)} goal</div>
          </div>
        </Card>
        <Stat label="Study streak" value={`${streak} day${streak === 1 ? "" : "s"}`} sub={streak ? "Keep it alive today!" : "Study today to start one"} icon={Flame} tone="orange" />
        <Stat label="This week" value={formatMinutes(week_minutes)} sub="Total focused study" icon={CalendarDays} tone="sky" />
        <Link to="/flashcards">
          <Stat label="Cards due" value={due_cards} sub={due_cards ? "Review now →" : "All caught up"} icon={Layers} tone="emerald" />
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Today's plan"
              subtitle={today.tasks.length ? `${tasksDone}/${today.tasks.length} done` : undefined}
              icon={CalendarDays}
              action={
                <Link to="/planner" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
                  Full plan
                </Link>
              }
            />
            <div className="px-3 pb-3 pt-2">
              {overdue_count > 0 && (
                <div className="mx-2 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-300">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {overdue_count} task{overdue_count === 1 ? "" : "s"} from earlier days not done.
                  </span>
                  <Button size="sm" variant="secondary" onClick={rebalance}>
                    <RefreshCw className="h-3.5 w-3.5" /> Rebalance plan
                  </Button>
                </div>
              )}
              {today.tasks.length === 0 ? (
                <EmptyState
                  icon={CalendarPlus}
                  title={data.active_plan ? "Rest day — or get ahead!" : "No study plan yet"}
                  description={data.active_plan ? "Nothing scheduled today. Review flashcards or take a quiz." : "Generate a plan and your daily tasks will show up here."}
                  action={
                    !data.active_plan && (
                      <Link to="/planner">
                        <Button>Create study plan</Button>
                      </Link>
                    )
                  }
                  className="py-8"
                />
              ) : (
                today.tasks.map((t) => <TaskItem key={t.id} task={t} subject={subjectsById[t.subject_id]} onToggle={toggleTask} />)
              )}
              {data.overdue.length > 0 && (
                <details className="mx-2 mt-2">
                  <summary className="cursor-pointer py-1 text-xs font-medium text-muted">Show overdue tasks</summary>
                  {data.overdue.slice(0, 8).map((t) => (
                    <TaskItem key={t.id} task={t} subject={subjectsById[t.subject_id]} onToggle={toggleTask} showDate={relativeDay(t.date)} />
                  ))}
                </details>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="This week" subtitle="Minutes studied per day" icon={Clock} />
            <div className="h-44 px-3 pb-3 pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={week}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "var(--surface-2)" }}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 }}
                    formatter={(v) => [formatMinutes(v), "Studied"]}
                    labelStyle={{ color: "var(--text)" }}
                  />
                  <Bar dataKey="minutes" radius={[6, 6, 6, 6]} fill="var(--color-brand-500)" maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Exam countdown"
              icon={Target}
              action={
                <Link to="/subjects" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-300">
                  All
                </Link>
              }
            />
            <div className="space-y-2.5 p-4">
              {subjects.slice(0, 5).map((s) => (
                <Countdown key={s.id} subject={s} />
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Needs attention" subtitle="Weak topics from quizzes & self-rating" icon={AlertTriangle} />
            <div className="p-4">
              {weak_topics.length === 0 ? (
                <p className="text-sm text-muted">No weak spots detected yet. Take a quiz to find out where you stand.</p>
              ) : (
                <ul className="space-y-2">
                  {weak_topics.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2/60 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-fg">{t.name}</div>
                        <div className="text-xs text-muted">
                          {t.subject_name}
                          {t.quiz_accuracy != null && ` · ${t.quiz_accuracy}% in quizzes`}
                        </div>
                      </div>
                      <Link to={`/quiz?subject=${t.subject_id}&topic=${t.id}`}>
                        <Button size="sm" variant="soft">
                          <Brain className="h-3.5 w-3.5" /> Practise
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
