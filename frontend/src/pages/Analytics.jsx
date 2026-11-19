import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, BookOpen, CalendarCheck, Flame, Timer, TrendingUp } from "lucide-react";
import { useApi } from "../lib/hooks";
import { cn, colorOf, formatDate, formatMinutes } from "../lib/utils";
import { Card, CardHeader, EmptyState, ErrorBanner, PageHeader, PageLoader, Progress, Segmented, Stat } from "../components/ui";

const tooltipStyle = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "var(--text)" },
};

function Heatmap({ daily }) {
  const max = Math.max(60, ...daily.map((d) => d.minutes));
  const level = (m) => (m === 0 ? 0 : m < max * 0.25 ? 1 : m < max * 0.5 ? 2 : m < max * 0.75 ? 3 : 4);
  const shades = ["bg-surface-2", "bg-brand-500/25", "bg-brand-500/50", "bg-brand-500/75", "bg-brand-600"];
  return (
    <div className="flex flex-wrap gap-1">
      {daily.map((d) => (
        <div key={d.date} title={`${formatDate(d.date, { weekday: "short", day: "numeric", month: "short" })}: ${formatMinutes(d.minutes)}`} className={cn("h-4 w-4 rounded-[4px]", shades[level(d.minutes)])} />
      ))}
    </div>
  );
}

export default function Analytics() {
  const [days, setDays] = useState(30);
  const { data, error, loading, reload } = useApi("/api/analytics", { params: { days } });

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorBanner message={error} onRetry={reload} />;

  const avg = Math.round(data.total_minutes / days);
  const daily = data.daily.map((d) => ({ ...d, label: formatDate(d.date) }));
  const hasActivity = data.total_minutes > 0;

  return (
    <>
      <PageHeader
        title="Progress"
        subtitle="See where your time goes and how your scores are moving."
        actions={
          <Segmented
            value={days}
            onChange={setDays}
            options={[
              { value: 7, label: "7d" },
              { value: 30, label: "30d" },
              { value: 90, label: "90d" },
            ]}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total studied" value={formatMinutes(data.total_minutes)} sub={`Last ${days} days`} icon={Timer} />
        <Stat label="Daily average" value={formatMinutes(avg)} icon={TrendingUp} tone="sky" />
        <Stat label="Active days" value={`${data.active_days}/${days}`} icon={CalendarCheck} tone="emerald" />
        <Stat label="Current streak" value={`${data.streak}d`} icon={Flame} tone="orange" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Study time" icon={BarChart3} subtitle="Minutes per day" />
          <div className="h-64 px-2 pb-3 pt-4">
            {hasActivity ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <defs>
                    <linearGradient id="fillStudy" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} width={32} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [formatMinutes(v), "Studied"]} />
                  <Area type="monotone" dataKey="minutes" stroke="var(--color-brand-500)" strokeWidth={2} fill="url(#fillStudy)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={Timer} title="No study time logged yet" description="Use the focus timer or tick off plan tasks and your chart will fill up." className="py-6" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="By subject" icon={BookOpen} subtitle="Focus-timer minutes" />
          <div className="h-64 px-2 pb-3 pt-4">
            {data.by_subject.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_subject} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={90} tick={{ fill: "var(--text)", fontSize: 12 }} />
                  <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-2)" }} formatter={(v) => [formatMinutes(v), "Studied"]} />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]} maxBarSize={22}>
                    {data.by_subject.map((s) => (
                      <Cell key={s.name} fill={colorOf(s.color).hex} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-4 text-sm text-muted">Pick a subject on the focus timer to see the split here.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Consistency" icon={CalendarCheck} subtitle="Each square is a day" />
          <div className="p-5">
            <Heatmap daily={data.daily} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Quiz scores" icon={TrendingUp} subtitle="Your last 20 quizzes" />
          <div className="h-52 px-2 pb-3 pt-4">
            {data.quiz_trend.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.quiz_trend.map((q, i) => ({ ...q, n: i + 1 }))}>
                  <XAxis dataKey="n" axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} width={32} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${v}%`, "Score"]} labelFormatter={(n) => data.quiz_trend[n - 1]?.title} />
                  <Line type="monotone" dataKey="percent" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="p-4 text-sm text-muted">Take a couple of quizzes to see your score trend.</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Syllabus coverage" icon={BookOpen} />
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {data.subjects.map((s) => (
            <div key={s.id}>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className="font-medium text-fg">{s.name}</span>
                <span className="text-muted">
                  {s.done_count}/{s.topic_count} · {s.progress}%
                </span>
              </div>
              <Progress value={s.progress} barClassName={colorOf(s.color).bar} />
            </div>
          ))}
          {data.subjects.length === 0 && <p className="text-sm text-muted">Add subjects to track coverage.</p>}
        </div>
      </Card>
    </>
  );
}
