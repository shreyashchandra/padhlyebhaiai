import { useState } from "react";
import { ExternalLink, Eye, PlayCircle, Search, ThumbsUp } from "lucide-react";
import { useApi, useLocalStorage } from "../lib/hooks";
import { cn } from "../lib/utils";
import { Button, Modal, Segmented, Skeleton } from "./ui";

function formatViews(n) {
  if (n >= 1e7) return `${Math.round(n / 1e6)}M`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const decode = (s) => {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
};

/** YouTube lecture suggestions for a plan task or a syllabus topic. */
export default function VideoModal({ taskId, topicId, title, onClose }) {
  const [lang, setLang] = useLocalStorage("plb_video_lang", "en");
  const path = taskId ? `/api/videos/task/${taskId}` : `/api/videos/topic/${topicId}`;
  const { data: fetched, error, loading: fetching } = useApi(path, { params: { lang } });
  // Ignore a previous language's response while the new one loads.
  const data = fetched?.lang === lang ? fetched : null;
  const loading = fetching || (!data && !error);
  const [picked, setPicked] = useState(null);
  const selected = data?.videos.some((v) => v.id === picked) ? picked : data?.videos[0]?.id;
  const setSelected = setPicked;
  const current = data?.videos.find((v) => v.id === selected);

  return (
    <Modal open onClose={onClose} size="lg" title="Watch & learn" description={title}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Segmented
            value={lang}
            onChange={setLang}
            options={[
              { value: "en", label: "English" },
              { value: "hi", label: "हिंदी Hindi" },
            ]}
          />
          {data?.search_url && (
            <a href={data.search_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              More on YouTube <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-16" />
          </div>
        ) : error ? (
          <p className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-600 dark:text-rose-300">{error}</p>
        ) : !data.videos.length ? (
          <div className="flex flex-col items-center gap-3 rounded-xl bg-surface-2 px-4 py-10 text-center">
            <PlayCircle className="h-10 w-10 text-brand-500" />
            <p className="max-w-sm text-sm text-muted">
              {data.reason === "not_configured"
                ? "Ranked video picks aren't switched on yet. Search YouTube for the best lectures on this topic:"
                : data.reason === "busy"
                  ? "Video suggestions are busy right now. Search YouTube directly:"
                  : "Couldn't find a good full-length lecture automatically. Search YouTube:"}
            </p>
            <a href={data.search_url} target="_blank" rel="noreferrer">
              <Button>
                <Search className="h-4 w-4" /> Search on YouTube
              </Button>
            </a>
            <p className="max-w-full break-words text-xs text-muted">“{data.query}”</p>
          </div>
        ) : (
          <>
            {current && (
              <div>
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    key={current.id}
                    className="h-full w-full"
                    src={`https://www.youtube-nocookie.com/embed/${current.id}?rel=0&modestbranding=1`}
                    title={decode(current.title)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                  />
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-sm font-semibold text-fg">{decode(current.title)}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted">
                      <span>{current.channel}</span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> {formatViews(current.views)} views
                      </span>
                      {current.likes > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <ThumbsUp className="h-3.5 w-3.5" /> {formatViews(current.likes)}
                        </span>
                      )}
                      <span>{formatDuration(current.duration_seconds)}</span>
                    </p>
                  </div>
                  <a href={current.url} target="_blank" rel="noreferrer" className="shrink-0">
                    <Button size="sm" variant="secondary">
                      YouTube <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </div>
            )}

            {data.videos.length > 1 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Other top picks</div>
                <div className="space-y-1.5">
                  {data.videos
                    .filter((v) => v.id !== selected)
                    .map((v) => (
                      <button key={v.id} onClick={() => setSelected(v.id)} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-left transition hover:bg-surface-2">
                        <div className="relative w-28 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                          <img src={v.thumbnail} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[10px] font-medium text-white">{formatDuration(v.duration_seconds)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="line-clamp-2 text-sm font-medium text-fg">{decode(v.title)}</div>
                          <div className="mt-0.5 text-xs text-muted">
                            {v.channel} · {formatViews(v.views)} views
                          </div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
            <p className={cn("text-[11px] text-muted")}>Picked from YouTube by popularity and relevance. Watch actively — pause and take notes.</p>
          </>
        )}
      </div>
    </Modal>
  );
}
