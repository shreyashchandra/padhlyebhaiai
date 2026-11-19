import { useEffect, useState } from "react";
import { Coffee, Pause, Play, RotateCcw, Settings2, SkipForward, Target } from "lucide-react";
import { useFocusTimer } from "../lib/focus";
import { useApi } from "../lib/hooks";
import { cn, formatMinutes } from "../lib/utils";
import { Button, Card, CardHeader, Field, Input, Modal, PageHeader, Select } from "../components/ui";

const MODE_META = {
  focus: { label: "Focus", color: "var(--color-brand-500)", tip: "Phone away. One topic. Full attention." },
  short: { label: "Short break", color: "#10b981", tip: "Stand up, stretch, drink water. No scrolling!" },
  long: { label: "Long break", color: "#0ea5e9", tip: "Great work. Take a proper rest before the next round." },
};

export default function Focus() {
  const f = useFocusTimer();
  const subjectsQ = useApi("/api/subjects");
  const detailQ = useApi(f.subjectId ? `/api/subjects/${f.subjectId}` : null, { enabled: Boolean(f.subjectId) });
  const sessionsQ = useApi("/api/sessions", { params: { days: 1 } });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reloadSessions = sessionsQ.reload;
  useEffect(() => {
    if (f.completedToday) reloadSessions();
  }, [f.completedToday, reloadSessions]);
  const [draft, setDraft] = useState(f.settings);

  const meta = MODE_META[f.mode];
  const size = 280;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = 1 - f.remaining / f.duration;
  const mm = String(Math.floor(f.remaining / 60)).padStart(2, "0");
  const ss = String(f.remaining % 60).padStart(2, "0");
  const subjectsById = Object.fromEntries((subjectsQ.data || []).map((s) => [s.id, s]));
  const todayMinutes = (sessionsQ.data || []).reduce((a, s) => a + s.minutes, 0);

  return (
    <>
      <PageHeader
        title="Focus timer"
        subtitle="Pomodoro sessions are logged to your subject automatically."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setDraft(f.settings);
              setSettingsOpen(true);
            }}
          >
            <Settings2 className="h-4 w-4" /> Timer settings
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col items-center px-4 py-8 sm:py-10">
          <div className="mb-8 inline-flex rounded-xl bg-surface-2 p-1">
            {Object.entries(MODE_META).map(([key, m]) => (
              <button
                key={key}
                onClick={() => !f.running && f.switchMode(key)}
                disabled={f.running && f.mode !== key}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40",
                  f.mode === key ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className="relative" style={{ width: size, height: size, maxWidth: "80vw", maxHeight: "80vw" }}>
            <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
              <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-2)" strokeWidth={stroke} fill="none" />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={meta.color}
                strokeWidth={stroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - progress)}
                style={{ transition: "stroke-dashoffset 0.3s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-6xl font-medium tracking-tight text-fg tabular-nums sm:text-7xl">
                {mm}:{ss}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                {f.mode === "focus" ? <Target className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                {meta.label} · round {((f.round - 1) % f.settings.rounds) + 1}/{f.settings.rounds}
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-sm text-muted">{meta.tip}</p>

          <div className="mt-6 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={f.reset} aria-label="Reset" title="Reset">
              <RotateCcw className="h-5 w-5" />
            </Button>
            {f.running ? (
              <Button size="lg" className="w-40" onClick={f.pause}>
                <Pause className="h-5 w-5" /> Pause
              </Button>
            ) : (
              <Button size="lg" className="w-40" onClick={f.start}>
                <Play className="h-5 w-5" /> {f.paused ? "Resume" : "Start"}
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={f.finishEarly} aria-label="Finish now" title={f.mode === "focus" ? "Finish now & log time" : "Skip break"}>
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="What are you studying?" subtitle="Time is logged against this subject & topic." icon={Target} />
            <div className="space-y-3 p-5">
              <Select
                value={f.subjectId}
                onChange={(e) => {
                  f.setSubjectId(e.target.value);
                  f.setTopicId("");
                }}
              >
                <option value="">General study</option>
                {subjectsQ.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              {f.subjectId && (
                <Select value={f.topicId} onChange={(e) => f.setTopicId(e.target.value)}>
                  <option value="">Any topic</option>
                  {detailQ.data?.topics
                    .filter((t) => t.status !== "revised")
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </Select>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Today's focus" subtitle={`${formatMinutes(todayMinutes)} logged`} icon={Coffee} />
            <div className="space-y-1 p-3">
              {(sessionsQ.data || []).length === 0 ? (
                <p className="px-2 py-4 text-sm text-muted">No sessions yet today. Start your first one!</p>
              ) : (
                (sessionsQ.data || []).slice(0, 8).map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm">
                    <span className="text-fg">{subjectsById[s.subject_id]?.name || "General"}</span>
                    <span className="text-muted">
                      {formatMinutes(s.minutes)} · {new Date(s.started_at.endsWith("Z") || s.started_at.includes("+") ? s.started_at : `${s.started_at}Z`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Timer settings"
        size="sm"
        footer={
          <Button
            onClick={() => {
              f.setSettings({
                focus: Math.min(180, Math.max(5, Number(draft.focus) || 25)),
                short: Math.min(60, Math.max(1, Number(draft.short) || 5)),
                long: Math.min(60, Math.max(1, Number(draft.long) || 15)),
                rounds: Math.min(8, Math.max(1, Number(draft.rounds) || 4)),
              });
              f.reset();
              setSettingsOpen(false);
            }}
          >
            Save
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {[
            ["focus", "Focus (min)"],
            ["short", "Short break (min)"],
            ["long", "Long break (min)"],
            ["rounds", "Rounds before long break"],
          ].map(([k, label]) => (
            <Field key={k} label={label}>
              {(id) => <Input id={id} type="number" value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />}
            </Field>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            ["Classic 25/5", { focus: 25, short: 5, long: 15, rounds: 4 }],
            ["Deep work 50/10", { focus: 50, short: 10, long: 20, rounds: 3 }],
            ["Exam sitting 90/15", { focus: 90, short: 15, long: 30, rounds: 2 }],
          ].map(([label, preset]) => (
            <Button key={label} size="sm" variant="soft" onClick={() => setDraft(preset)}>
              {label}
            </Button>
          ))}
        </div>
      </Modal>
    </>
  );
}
