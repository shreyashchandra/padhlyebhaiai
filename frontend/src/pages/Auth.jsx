import { useState } from "react";
import { BookOpenCheck, Brain, CalendarCheck2, Camera, GraduationCap, Layers, MessageCircle, Timer } from "lucide-react";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/api";
import { Button, Field, Input, Segmented } from "../components/ui";

const FEATURES = [
  { icon: BookOpenCheck, title: "Syllabus → topic tracker", text: "Upload a PDF or photo; AI breaks it into units and topics you can tick off." },
  { icon: CalendarCheck2, title: "Plans that adapt", text: "Day-by-day plan around every exam date. Missed a day? Rebalance in one tap." },
  { icon: MessageCircle, title: "24×7 AI tutor", text: "Ask doubts in English or Hinglish. Snap a question photo for step-by-step help." },
  { icon: Brain, title: "Quizzes that find gaps", text: "Exam-style MCQs. Scores flag your weak topics automatically." },
  { icon: Layers, title: "Flashcards that stick", text: "Spaced repetition schedules each card right before you'd forget it." },
  { icon: Timer, title: "Focus timer + streaks", text: "Pomodoro sessions logged per subject, with streaks to keep you going." },
];

export default function AuthPage() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState("register");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (mode === "register" && form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await signIn(mode, {
        email: form.email.trim(),
        password: form.password,
        ...(mode === "register" ? { name: form.name.trim() || null } : {}),
      });
    } catch (err) {
      setError(errorMessage(err, "Couldn't sign you in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-app lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/* Story panel */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-violet-700 px-6 py-10 text-white sm:px-12 lg:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-violet-400/20 blur-3xl" />
        <div className="relative mx-auto max-w-xl">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">PadhLeBhai AI</span>
          </div>

          <h1 className="mt-10 text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">
            Your whole exam prep,
            <br />
            <span className="text-brand-200">one smart workspace.</span>
          </h1>
          <p className="mt-4 max-w-md text-base text-white/80 sm:text-lg">
            From syllabus to exam day: plan, learn, practise and revise with an AI that knows your syllabus and your weak spots.
          </p>

          <div className="mt-10 hidden gap-3 sm:grid sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-2xl bg-white/[0.08] p-4 ring-1 ring-white/15 backdrop-blur-sm">
                <Icon className="h-5 w-5 text-brand-200" />
                <div className="mt-2 text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs leading-relaxed text-white/70">{text}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-2 text-sm text-white/70 sm:hidden">
            <Camera className="h-4 w-4" /> Planner · AI tutor · Quizzes · Flashcards · Focus timer
          </div>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center px-6 py-10 sm:px-12">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold tracking-tight text-fg">{mode === "login" ? "Welcome back 👋" : "Create your free account"}</h2>
          <p className="mt-1.5 text-sm text-muted">
            {mode === "login" ? "Pick up right where you left off." : "Free monthly AI credits. No card needed."}
          </p>

          <Segmented
            className="mt-6 w-full"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setError("");
            }}
            options={[
              { value: "register", label: "Sign up" },
              { value: "login", label: "Log in" },
            ]}
          />

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "register" && (
              <Field label="Your name">
                {(id) => <Input id={id} autoComplete="name" placeholder="Asha Sharma" value={form.name} onChange={set("name")} />}
              </Field>
            )}
            <Field label="Email">
              {(id) => (
                <Input id={id} type="email" required autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set("email")} />
              )}
            </Field>
            <Field label="Password" hint={mode === "register" ? "At least 8 characters" : undefined}>
              {(id) => (
                <Input
                  id={id}
                  type="password"
                  required
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set("password")}
                />
              )}
            </Field>
            {error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {mode === "login" ? "Log in" : "Get started"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
