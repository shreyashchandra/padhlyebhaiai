import { useState } from "react";
import { Check, Clock, MessageCircle, PlayCircle, Timer } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn, colorOf, formatMinutes, KIND_META } from "../lib/utils";
import { Badge } from "./ui";
import { useFocusTimer } from "../lib/focus";
import VideoModal from "./VideoModal";

export default function TaskItem({ task, subject, onToggle, showDate, compact }) {
  const navigate = useNavigate();
  const focus = useFocusTimer();
  const [video, setVideo] = useState(false);
  const kind = KIND_META[task.kind] || KIND_META.learn;
  const hasVideo = Boolean(task.topic_id || task.subject_id);
  const color = colorOf(subject?.color);

  const startFocus = () => {
    focus?.setSubjectId(task.subject_id ? String(task.subject_id) : "");
    focus?.setTopicId(task.topic_id ? String(task.topic_id) : "");
    navigate("/focus");
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-xl border border-transparent px-2 py-2.5 transition hover:border-line hover:bg-surface-2/60",
        task.done && "opacity-60",
      )}
    >
      <button
        onClick={() => onToggle(task)}
        aria-label={task.done ? "Mark as not done" : "Mark as done"}
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition",
          task.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-line hover:border-brand-500",
        )}
      >
        {task.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm font-medium text-fg", task.done && "line-through decoration-muted")}>{task.title}</div>
        {!compact && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {subject && (
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", color.dot)} />
                {subject.name}
              </span>
            )}
            <Badge className={kind.cls}>{kind.label}</Badge>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatMinutes(task.minutes)}
            </span>
            {showDate && <span>· {showDate}</span>}
            {hasVideo && (
              <button
                onClick={() => setVideo(true)}
                className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 font-medium text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-300"
                title="Best YouTube lecture for this topic"
              >
                <PlayCircle className="h-3 w-3" /> Video
              </button>
            )}
          </div>
        )}
        {video && <VideoModal taskId={task.id} title={task.title} onClose={() => setVideo(false)} />}
      </div>
      {!task.done && !compact && (
        <div className="flex shrink-0 gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          {task.topic_id && (
            <button
              onClick={() => navigate(`/tutor?subject=${task.subject_id}&ask=${encodeURIComponent(`Teach me "${task.title.replace(/^(Learn|Revise weak topic|Quick recall): /, "").replace(/ \(part \d+\)$/, "")}" from scratch, exam-focused.`)}`)}
              className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-brand-600"
              title="Learn with AI tutor"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
          <button onClick={startFocus} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-brand-600" title="Start focus timer">
            <Timer className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
