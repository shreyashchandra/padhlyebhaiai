import clsx from "clsx";

export const cn = (...args) => clsx(...args);

// Full class strings so Tailwind can see them at build time.
export const SUBJECT_COLORS = {
  indigo: { dot: "bg-indigo-500", soft: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300", bar: "bg-indigo-500", ring: "ring-indigo-500/30", hex: "#6366f1" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-500/10 text-violet-600 dark:text-violet-300", bar: "bg-violet-500", ring: "ring-violet-500/30", hex: "#8b5cf6" },
  pink: { dot: "bg-pink-500", soft: "bg-pink-500/10 text-pink-600 dark:text-pink-300", bar: "bg-pink-500", ring: "ring-pink-500/30", hex: "#ec4899" },
  rose: { dot: "bg-rose-500", soft: "bg-rose-500/10 text-rose-600 dark:text-rose-300", bar: "bg-rose-500", ring: "ring-rose-500/30", hex: "#f43f5e" },
  orange: { dot: "bg-orange-500", soft: "bg-orange-500/10 text-orange-600 dark:text-orange-300", bar: "bg-orange-500", ring: "ring-orange-500/30", hex: "#f97316" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-500/10 text-amber-700 dark:text-amber-300", bar: "bg-amber-500", ring: "ring-amber-500/30", hex: "#f59e0b" },
  emerald: { dot: "bg-emerald-500", soft: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", bar: "bg-emerald-500", ring: "ring-emerald-500/30", hex: "#10b981" },
  teal: { dot: "bg-teal-500", soft: "bg-teal-500/10 text-teal-700 dark:text-teal-300", bar: "bg-teal-500", ring: "ring-teal-500/30", hex: "#14b8a6" },
  sky: { dot: "bg-sky-500", soft: "bg-sky-500/10 text-sky-700 dark:text-sky-300", bar: "bg-sky-500", ring: "ring-sky-500/30", hex: "#0ea5e9" },
  slate: { dot: "bg-slate-500", soft: "bg-slate-500/10 text-slate-600 dark:text-slate-300", bar: "bg-slate-500", ring: "ring-slate-500/30", hex: "#64748b" },
};
export const COLOR_NAMES = Object.keys(SUBJECT_COLORS).filter((c) => c !== "slate");
export const colorOf = (name) => SUBJECT_COLORS[name] || SUBJECT_COLORS.indigo;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Local YYYY-MM-DD (never toISOString, which shifts to UTC). */
export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function formatDate(iso, opts = { day: "numeric", month: "short" }) {
  if (!iso) return "";
  return parseDate(iso.slice(0, 10)).toLocaleDateString(undefined, opts);
}

export function relativeDay(iso) {
  const today = isoDate();
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  return formatDate(iso, { weekday: "short", day: "numeric", month: "short" });
}

export function formatMinutes(min) {
  const m = Math.round(min || 0);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((parseDate(iso) - parseDate(isoDate())) / 86400000);
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const STATUS_META = {
  not_started: { label: "Not started", cls: "bg-slate-500/10 text-slate-600 dark:text-slate-300" },
  learning: { label: "Learning", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  done: { label: "Done", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  revised: { label: "Revised", cls: "bg-brand-500/15 text-brand-700 dark:text-brand-300" },
};

export const PRIORITY_META = {
  must: { label: "Must do", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-300" },
  should: { label: "Should do", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  low: { label: "Low priority", cls: "bg-slate-500/10 text-slate-500 dark:text-slate-400" },
};

export const KIND_META = {
  learn: { label: "Learn", cls: "text-brand-600 dark:text-brand-300 bg-brand-500/10" },
  revise: { label: "Revise", cls: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10" },
  practice: { label: "Task", cls: "text-sky-700 dark:text-sky-300 bg-sky-500/10" },
  mock: { label: "Mock test", cls: "text-rose-600 dark:text-rose-300 bg-rose-500/10" },
};
