import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, GraduationCap, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui";

const STEPS = [
  { id: "welcome", title: "Welcome to PadhLeBhai{name}! 👋", body: "Here's a one-minute tour of everything that'll help you crack your exam. You can skip anytime." },
  { id: "today", target: "today", title: "Today", body: "Your daily home: today's tasks, study streak, exam countdowns and weak topics, all at a glance." },
  { id: "subjects", target: "subjects", title: "Subjects & exams", body: "Pick from popular exams like JEE, NEET, CBSE, CAT, SAT and IELTS to load the full syllabus instantly, or create your own. Every unit and topic stays editable." },
  { id: "planner", target: "planner", title: "Study planner", body: "A realistic day-by-day plan built around your exam dates and daily hours. Missed a day? Hit Rebalance and it adjusts." },
  { id: "tutor", target: "tutor", title: "AI tutor", body: "Ask doubts in English or Hinglish, or snap a photo of a question for a step-by-step solution. It knows your syllabus." },
  { id: "quiz", target: "quiz", title: "Quizzes", body: "Exam-style MCQs with explanations. Your scores automatically flag weak topics." },
  { id: "flashcards", target: "flashcards", title: "Flashcards", body: "Spaced repetition shows each card right before you'd forget it. Generate cards from any topic or your own notes." },
  { id: "focus", target: "focus", title: "Focus timer", body: "Pomodoro sessions that log study time to each subject. It keeps ticking while you use the rest of the app." },
  { id: "analytics", target: "analytics", title: "Progress", body: "See your study hours, consistency heatmap, time per subject and quiz score trend." },
  { id: "credits", target: "credits", title: "AI credits", body: "Your free monthly AI allowance. The timer, flashcard reviews and plan rebalancing never use credits." },
  { id: "finish", title: "You're all set! 🎉", body: "Start by choosing your exam. The syllabus loads in seconds. You can replay this tour anytime from Settings.", final: true },
];

const PAD = 6;
const POP_W = 320;

function findTarget(name) {
  if (!name) return null;
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
  }
  return null;
}

function placePopover(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (!rect || vw < 640) {
    // Centered card (mobile, or a step without a visible target)
    if (rect && vw < 640) {
      const below = rect.bottom + 12;
      const top = rect.top > vh / 2 ? Math.max(12, rect.top - 12 - 210) : Math.min(below, vh - 230);
      return { left: 12, top, width: vw - 24 };
    }
    return { left: Math.max(12, (vw - 380) / 2), top: Math.max(24, vh / 2 - 140), width: Math.min(380, vw - 24) };
  }
  // Prefer to the right of the target (sidebar items), else below.
  if (rect.right + 16 + POP_W < vw) {
    return { left: rect.right + 16, top: Math.min(Math.max(12, rect.top - 8), vh - 230), width: POP_W };
  }
  return { left: Math.min(Math.max(12, rect.left), vw - POP_W - 12), top: Math.min(rect.bottom + 12, vh - 230), width: POP_W };
}

export default function Tour({ open, name, onClose }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const step = STEPS[index];

  const measure = useCallback(() => {
    const el = findTarget(step?.target);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = findTarget(step?.target);
    el?.scrollIntoView({ block: "nearest" });
    // Measure on the next frame, after any scroll has settled.
    const id = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(id);
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  const finish = useCallback(
    (goTo) => {
      onClose();
      setIndex(0);
      if (goTo) navigate(goTo);
    },
    [onClose, navigate],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open || !step) return null;

  const pos = placePopover(rect);
  const first = (name || "").split(" ")[0];
  const title = step.title.replace("{name}", first ? `, ${first}` : "");

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="App tour">
      {/* Dim layer with a spotlight cut-out around the target */}
      {rect ? (
        <div
          className="pointer-events-none fixed rounded-xl ring-2 ring-brand-400 transition-all duration-300"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(8, 10, 20, 0.62)",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[rgba(8,10,20,0.62)] animate-fade-in" />
      )}
      {/* Click-catcher so the app underneath isn't used mid-tour */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        key={step.id}
        className="fixed rounded-2xl border border-line bg-surface p-5 shadow-2xl animate-pop"
        style={{ left: pos.left, top: pos.top, width: pos.width }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {(step.id === "welcome" || step.final) && (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white">
                <GraduationCap className="h-5 w-5" />
              </div>
            )}
            <h3 className="font-semibold leading-snug text-fg">{title}</h3>
          </div>
          {!step.final && (
            <button onClick={() => finish()} className="-mr-1 -mt-1 rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Skip tour">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>

        {step.final ? (
          // Two wide buttons don't fit beside the dots, so give them their own row.
          <div className="mt-5 space-y-4">
            <Dots index={index} />
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="secondary" onClick={() => finish()}>
                Explore myself
              </Button>
              <Button size="sm" onClick={() => finish("/exams")}>
                Choose my exam
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex items-center justify-between gap-3">
            <Dots index={index} />
            <div className="flex shrink-0 gap-2">
              {index > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setIndex((i) => i - 1)} aria-label="Previous">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Button size="sm" onClick={() => setIndex((i) => i + 1)}>
                {index === 0 ? "Show me around" : "Next"} <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dots({ index }) {
  return (
    <div className="flex min-w-0 gap-1">
      {STEPS.map((s, i) => (
        <span key={s.id} className={cn("h-1.5 shrink-0 rounded-full transition-all", i === index ? "w-5 bg-brand-600" : "w-1.5 bg-surface-2")} />
      ))}
    </div>
  );
}
