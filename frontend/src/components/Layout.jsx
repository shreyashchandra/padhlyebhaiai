import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  HelpCircle,
  BookOpen,
  Brain,
  CalendarDays,
  GraduationCap,
  Home,
  Layers,
  LogOut,
  Menu,
  MessageCircle,
  Moon,
  Settings,
  Sun,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/hooks";
import { cn } from "../lib/utils";
import { useFocusTimer } from "../lib/focus";
import api from "../lib/api";
import Tour from "./Tour";
import HelpWidget from "./HelpWidget";

const NAV = [
  { to: "/", label: "Today", icon: Home, end: true, tour: "today" },
  { to: "/subjects", label: "Subjects", icon: BookOpen, tour: "subjects" },
  { to: "/planner", label: "Planner", icon: CalendarDays, tour: "planner" },
  { to: "/tutor", label: "AI Tutor", icon: MessageCircle, tour: "tutor" },
  { to: "/quiz", label: "Quizzes", icon: Brain, tour: "quiz" },
  { to: "/flashcards", label: "Flashcards", icon: Layers, tour: "flashcards" },
  { to: "/focus", label: "Focus", icon: Timer, tour: "focus" },
  { to: "/analytics", label: "Progress", icon: BarChart3, tour: "analytics" },
];

const MOBILE_NAV = [NAV[0], NAV[2], NAV[3], NAV[5], NAV[6]];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-lg shadow-brand-600/25">
        <GraduationCap className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <div className="font-bold tracking-tight text-fg">PadhLeBhai</div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted">AI study companion</div>
      </div>
    </div>
  );
}

function CreditMeter() {
  const { billing } = useAuth();
  if (!billing?.daily) return null;
  const { daily, monthly, limited_by } = billing;
  const pct = Math.min(daily.percent_left, monthly.percent_left);
  const resetAt = new Date(limited_by === "monthly" ? monthly.reset_at : daily.reset_at);
  const resetLabel =
    limited_by === "monthly"
      ? `Refreshes ${resetAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
      : `Refreshes daily at ${resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  return (
    <div data-tour="credits" className="rounded-xl border border-line bg-surface-2 p-3" title="Free AI allowance. Planner rebalancing, flashcard reviews, the focus timer and help are always free.">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-fg">AI today</span>
        <span className="text-muted">{limited_by ? "Used up" : `≈${billing.approx_messages_left} questions left`}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className={cn("h-full rounded-full transition-[width]", pct < 15 ? "bg-rose-500" : pct < 40 ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-muted">{resetLabel}</p>
    </div>
  );
}

function FocusPill() {
  const { running, remaining, mode } = useFocusTimer();
  const { pathname } = useLocation();
  if (!running || pathname === "/focus") return null;
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, "0");
  return (
    <NavLink
      to="/focus"
      className="flex items-center gap-2 rounded-full bg-brand-600 px-3 py-1.5 font-mono text-xs font-medium text-white shadow-lg shadow-brand-600/30"
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      {mode === "focus" ? "Focus" : "Break"} {m}:{s}
    </NavLink>
  );
}

function SideNav({ onNavigate }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [dark, toggleTheme] = useTheme();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-1 pt-1">
        <Logo />
      </div>
      <nav className="flex flex-1 flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end, tour }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            data-tour={tour}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                isActive || (to === "/subjects" && pathname === "/exams") ? "bg-brand-500/10 text-brand-700 dark:text-brand-300" : "text-muted hover:bg-surface-2 hover:text-fg",
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-3">
        <button
          onClick={() => {
            onNavigate?.();
            window.dispatchEvent(new Event("plb:open-help"));
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          <HelpCircle className="h-[18px] w-[18px]" />
          Help & guide
        </button>
        <CreditMeter />
        <div className="flex items-center gap-2 rounded-xl px-1">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-violet-500 text-sm font-semibold text-white">
            {(user?.name || user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg">{user?.name || "Student"}</div>
            <div className="truncate text-xs text-muted">{user?.email}</div>
          </div>
        </div>
        <div className="flex gap-1">
          <NavLink
            to="/settings"
            onClick={onNavigate}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-muted hover:bg-surface-2 hover:text-fg"
          >
            <Settings className="h-4 w-4" /> Settings
          </NavLink>
          <button onClick={toggleTheme} className="rounded-lg px-3 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={logout} className="rounded-lg px-3 text-muted hover:bg-surface-2 hover:text-rose-500" aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { user, setUser } = useAuth();
  const [tourOpen, setTourOpen] = useState(() => user && !user.tour_completed);

  useEffect(() => {
    const start = () => setTourOpen(true);
    window.addEventListener("plb:start-tour", start);
    return () => window.removeEventListener("plb:start-tour", start);
  }, []);

  const closeTour = () => {
    setTourOpen(false);
    if (!user?.tour_completed) {
      setUser((u) => ({ ...u, tour_completed: true }));
      api.patch("/api/auth/me", { tour_completed: true }).catch(() => {});
    }
  };
  const fullBleed = location.pathname.startsWith("/tutor");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-app">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">
        <SideNav />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface/85 px-4 py-3 backdrop-blur lg:hidden">
        <Logo />
        <div className="flex items-center gap-2">
          <FocusPill />
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 border-r border-line bg-surface animate-fade-in">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main className={cn("lg:pl-64", fullBleed ? "" : "pb-24 lg:pb-10")}>
        <div className="pointer-events-none fixed bottom-8 right-24 z-30 hidden lg:block">
          <div className="pointer-events-auto">
            <FocusPill />
          </div>
        </div>
        <div className={cn(fullBleed ? "" : "mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8", "animate-fade-in")} key={location.pathname.split("/")[1]}>
          <Outlet />
        </div>
      </main>

      <Tour open={tourOpen} name={user?.name} onClose={closeTour} />
      <HelpWidget showButton={!fullBleed && !tourOpen} />

      {/* Mobile bottom nav */}
      {!fullBleed && (
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end, tour }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-tour={tour}
              className={({ isActive }) =>
                cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium", isActive ? "text-brand-600 dark:text-brand-300" : "text-muted")
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
