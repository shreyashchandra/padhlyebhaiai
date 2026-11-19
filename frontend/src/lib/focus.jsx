import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import api from "./api";

const FocusContext = createContext(null);
const KEY = "plb_focus_state";

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
};

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880, 990].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {
    /* audio unavailable */
  }
}

function notify(title, body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
  } catch {
    /* ignore */
  }
}

/**
 * Pomodoro timer that lives above the router so it keeps running across pages
 * (and survives a refresh, since state is derived from an end timestamp).
 */
export function FocusProvider({ children }) {
  const saved = load();
  const [settings, setSettings] = useState(saved?.settings || { focus: 25, short: 5, long: 15, rounds: 4 });
  const [mode, setMode] = useState(saved?.mode || "focus"); // focus | short | long
  const [endAt, setEndAt] = useState(saved?.endAt || null); // ms timestamp while running
  const [pausedLeft, setPausedLeft] = useState(saved?.pausedLeft ?? null); // seconds while paused
  const [round, setRound] = useState(saved?.round || 1);
  const [subjectId, setSubjectId] = useState(saved?.subjectId || "");
  const [topicId, setTopicId] = useState(saved?.topicId || "");
  const [now, setNow] = useState(() => Date.now());
  const [completedToday, setCompletedToday] = useState(0);
  const finishing = useRef(false);

  const duration = settings[mode] * 60;
  const running = Boolean(endAt);
  const remaining = running
    ? Math.max(0, Math.round((endAt - now) / 1000))
    : pausedLeft ?? duration;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ settings, mode, endAt, pausedLeft, round, subjectId, topicId }));
    } catch {
      /* ignore */
    }
  }, [settings, mode, endAt, pausedLeft, round, subjectId, topicId]);


  useEffect(() => {
    if (!running) {
      document.title = "PadhLeBhai AI — Study smarter";
      return;
    }
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, "0");
    document.title = `${m}:${s} · ${mode === "focus" ? "Focus" : "Break"} — PadhLeBhai`;
  }, [remaining, running, mode]);

  const logMinutes = useCallback(
    async (minutes) => {
      if (minutes < 1) return;
      try {
        await api.post("/api/sessions", {
          minutes,
          subject_id: subjectId ? Number(subjectId) : null,
          topic_id: topicId ? Number(topicId) : null,
        });
        setCompletedToday((c) => c + minutes);
      } catch {
        toast.error("Couldn't save this session. Check your connection.");
      }
    },
    [subjectId, topicId],
  );

  const switchMode = useCallback((next) => {
    setMode(next);
    setEndAt(null);
    setPausedLeft(null);
  }, []);

  // Called from the ticking interval when the current phase runs out.
  const finishPhase = useCallback(() => {
    chime();
    if (mode === "focus") {
      logMinutes(settings.focus);
      const next = round % settings.rounds === 0 ? "long" : "short";
      toast.success(`Focus session done! +${settings.focus} min logged. Take a ${settings[next]}-minute break.`);
      notify("Focus session complete 🎉", `Time for a ${settings[next]}-minute break.`);
      setMode(next);
      setEndAt(Date.now() + settings[next] * 60 * 1000);
    } else {
      toast("Break over — back to it! 💪");
      notify("Break over", "Ready for the next focus session?");
      setRound((r) => r + 1);
      setMode("focus");
      setEndAt(null);
    }
    setPausedLeft(null);
  }, [mode, round, settings, logMinutes]);

  const finishRef = useRef(finishPhase);
  useEffect(() => {
    finishRef.current = finishPhase;
  }, [finishPhase]);

  useEffect(() => {
    if (!endAt) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= endAt && !finishing.current) {
        finishing.current = true;
        finishRef.current();
        setTimeout(() => (finishing.current = false), 500);
      }
    }, 250);
    return () => clearInterval(id);
  }, [endAt]);

  const start = useCallback(() => {
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission().catch(() => {});
    setEndAt(Date.now() + (pausedLeft ?? settings[mode] * 60) * 1000);
    setPausedLeft(null);
    setNow(Date.now());
  }, [pausedLeft, settings, mode]);

  const pause = useCallback(() => {
    setPausedLeft(remaining);
    setEndAt(null);
  }, [remaining]);

  const reset = useCallback(() => {
    setEndAt(null);
    setPausedLeft(null);
  }, []);

  /** Stop a focus phase early but keep the minutes already studied. */
  const finishEarly = useCallback(() => {
    if (mode === "focus") {
      const studied = Math.floor((settings.focus * 60 - remaining) / 60);
      if (studied >= 1) {
        logMinutes(studied);
        toast.success(`Logged ${studied} min of focus.`);
      }
    }
    setEndAt(null);
    setPausedLeft(null);
  }, [mode, settings.focus, remaining, logMinutes]);

  const value = useMemo(
    () => ({
      settings,
      setSettings,
      mode,
      switchMode,
      running,
      paused: pausedLeft != null,
      remaining,
      duration,
      round,
      start,
      pause,
      reset,
      finishEarly,
      subjectId,
      setSubjectId,
      topicId,
      setTopicId,
      completedToday,
      logMinutes,
    }),
    [settings, mode, switchMode, running, pausedLeft, remaining, duration, round, start, pause, reset, finishEarly, subjectId, topicId, completedToday, logMinutes],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useFocusTimer = () => useContext(FocusContext);
