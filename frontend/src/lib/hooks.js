import { useCallback, useEffect, useRef, useState } from "react";
import api, { errorMessage } from "./api";

/** Fetch JSON from the API with loading/error state and a reload function. */
export function useApi(path, { enabled = true, params } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const key = JSON.stringify(params || {});
  const latest = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled || !path) return;
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await api.get(path, { params: JSON.parse(key) });
      if (id === latest.current) {
        setData(res.data);
        setError("");
      }
    } catch (err) {
      if (id === latest.current) setError(errorMessage(err));
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [path, key, enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

export function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }, [key, value]);
  return [value, setValue];
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = useCallback(() => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      try {
        localStorage.setItem("plb_theme", next ? "dark" : "light");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [dark, toggle];
}
