import { useState } from "react";
import { toast } from "sonner";
import { Compass, CreditCard, KeyRound, Moon, Palette, Sun, Trash2, User } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/hooks";
import { formatMinutes } from "../lib/utils";
import { Button, Card, CardHeader, Field, Input, PageHeader, Progress, Segmented } from "../components/ui";

export default function Settings() {
  const { user, setUser, billing, logout } = useAuth();
  const [dark, toggleTheme] = useTheme();
  const [name, setName] = useState(user?.name || "");
  const [goal, setGoal] = useState(user?.daily_goal_minutes || 120);
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [pwSaving, setPwSaving] = useState(false);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch("/api/auth/me", { name: name.trim(), daily_goal_minutes: Number(goal) });
      setUser(data);
      toast.success("Profile saved");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pw.next.length < 8) return toast.error("New password must be at least 8 characters.");
    setPwSaving(true);
    try {
      await api.post("/api/auth/change-password", { current_password: pw.current, new_password: pw.next });
      setPw({ current: "", next: "" });
      toast.success("Password changed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPwSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (prompt('This permanently deletes your account and all study data. Type "DELETE" to confirm.') !== "DELETE") return;
    try {
      await api.delete("/api/auth/me");
      logout();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };


  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Profile" icon={User} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label="Email">{(id) => <Input id={id} value={user?.email || ""} disabled className="opacity-70" />}</Field>
            <Field label={`Daily study goal: ${formatMinutes(goal)}`} className="sm:col-span-2" hint="Shown as the ring on your Today page.">
              <input type="range" min={15} max={720} step={15} value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full accent-[var(--color-brand-600)]" />
            </Field>
            <div className="sm:col-span-2">
              <Button onClick={saveProfile} loading={saving}>
                Save profile
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Appearance" icon={Palette} />
          <div className="p-5">
            <Segmented
              value={dark ? "dark" : "light"}
              onChange={(v) => (v === "dark") !== dark && toggleTheme()}
              options={[
                {
                  value: "light",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Sun className="h-4 w-4" /> Light
                    </span>
                  ),
                },
                {
                  value: "dark",
                  label: (
                    <span className="flex items-center gap-1.5">
                      <Moon className="h-4 w-4" /> Dark
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="App tour" icon={Compass} subtitle="A one-minute walkthrough of every feature." />
          <div className="p-5">
            <Button variant="secondary" onClick={() => window.dispatchEvent(new Event("plb:start-tour"))}>
              <Compass className="h-4 w-4" /> Replay tour
            </Button>
          </div>
        </Card>

        {billing?.daily && (
          <Card>
            <CardHeader title="AI usage" icon={CreditCard} subtitle="Your free AI allowance refreshes every day." />
            <div className="space-y-5 p-5">
              {[
                ["Today", billing.daily, `Refreshes at ${new Date(billing.daily.reset_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`],
                ["This month", billing.monthly, `Refreshes on ${new Date(billing.monthly.reset_at).toLocaleDateString(undefined, { day: "numeric", month: "long" })}`],
              ].map(([label, b, reset]) => {
                const used = 100 - b.percent_left;
                return (
                  <div key={label}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-medium text-fg">{label}</span>
                      <span className="text-muted">
                        {used}% used · {b.request_count} AI request{b.request_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <Progress value={used} barClassName={used > 85 ? "bg-rose-500" : used > 60 ? "bg-amber-500" : "bg-emerald-500"} />
                    <p className="mt-1.5 text-xs text-muted">{reset}</p>
                  </div>
                );
              })}
              <div className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
                <p>
                  <span className="font-semibold text-fg">≈{billing.approx_messages_left} tutor questions left today.</span> A quiz or a set of flashcards uses about as much as 2 questions; reading a syllabus photo or PDF uses a little more.
                </p>
                <p className="mt-1.5">
                  <span className="font-semibold text-fg">Always free:</span> adding exams from the catalog, editing topics, rebalancing plans, ticking tasks, flashcard reviews, the focus timer, progress and Help.
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Password" icon={KeyRound} />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Current password">
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />}
            </Field>
            <Field label="New password">
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />}
            </Field>
            <div className="sm:col-span-2">
              <Button variant="secondary" onClick={changePassword} loading={pwSaving} disabled={!pw.current || !pw.next}>
                Change password
              </Button>
            </div>
          </div>
        </Card>

        <Card className="border-rose-500/30">
          <CardHeader title="Danger zone" icon={Trash2} subtitle="Permanently delete your account and all of your data." />
          <div className="p-5">
            <Button variant="danger" onClick={deleteAccount}>
              Delete account
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
