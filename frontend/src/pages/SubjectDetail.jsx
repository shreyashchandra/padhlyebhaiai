import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  Brain,
  CalendarClock,
  Check,
  ChevronDown,
  FolderPlus,
  Layers,
  MessageCircle,
  Pencil,
  PlayCircle,
  Plus,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { cn, colorOf, daysUntil, formatDate, formatMinutes, PRIORITY_META, STATUS_META } from "../lib/utils";
import { Badge, Button, Card, ErrorBanner, Input, Modal, PageLoader, Progress, Ring, Segmented, Select, Textarea } from "../components/ui";
import FileDrop from "../components/FileDrop";
import SubjectForm from "../components/SubjectForm";
import VideoModal from "../components/VideoModal";

const STATUS_ORDER = ["not_started", "learning", "done", "revised"];

function SyllabusImporter({ subject, onDone, compact }) {
  const [mode, setMode] = useState("file");
  const [file, setFile] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(true);

  const canDraft = Boolean(subject.exam_name || subject.board_university || subject.class_semester);

  const submit = async () => {
    if (mode === "ai") {
      setBusy(true);
      try {
        const { data } = await api.post(`/api/subjects/${subject.id}/syllabus/generate`, null, { params: { replace } });
        toast.success(`AI drafted ${data.topic_count} topics. Please check them against your official syllabus.`);
        onDone(data);
      } catch (err) {
        toast.error(errorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    const form = new FormData();
    if (mode === "file") {
      if (!file) return toast.error("Choose a syllabus file first.");
      form.append("file", file);
    } else {
      if (text.trim().length < 20) return toast.error("Paste a bit more of the syllabus.");
      form.append("text", text);
    }
    form.append("replace", String(replace));
    setBusy(true);
    try {
      const { data } = await api.post(`/api/subjects/${subject.id}/syllabus`, form);
      toast.success(`Found ${data.topic_count} topics across ${data.units.length} units.`);
      onDone(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "file", label: "Upload" },
          { value: "text", label: "Paste text" },
          { value: "ai", label: "AI draft" },
        ]}
      />
      {mode === "ai" ? (
        <div className="rounded-xl bg-surface-2 p-4 text-sm">
          <p className="text-fg">
            AI will draft the syllabus for <strong>{subject.name}</strong>
            {subject.exam_name && <> · {subject.exam_name}</>}
            {subject.board_university && <> · {subject.board_university}</>}
            {subject.class_semester && <> · {subject.class_semester}</>} from what it knows about the official syllabus.
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {canDraft ? "Best for well-known exams and courses. Always compare with your official syllabus and edit as needed." : "Add the exam, board/university or class to this subject first (pencil icon above)."}
          </p>
        </div>
      ) : mode === "file" ? (
        <FileDrop file={file} onChange={setFile} />
      ) : (
        <Textarea rows={8} placeholder={"Unit 1: Electrostatics — Coulomb's law, electric field, Gauss's law…\nUnit 2: …"} value={text} onChange={(e) => setText(e.target.value)} />
      )}
      {compact && subject.topic_count > 0 && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="h-4 w-4 accent-[var(--color-brand-600)]" />
          Replace existing topics (uncheck to add to them)
        </label>
      )}
      <Button onClick={submit} loading={busy} disabled={mode === "ai" && !canDraft} className="w-full sm:w-auto">
        <Sparkles className="h-4 w-4" /> {busy ? (mode === "ai" ? "Drafting syllabus…" : "Reading syllabus…") : mode === "ai" ? "Draft syllabus with AI" : "Extract topics with AI"}
      </Button>
      {busy && <p className="text-xs text-muted">This usually takes 10–30 seconds for a full syllabus.</p>}
    </div>
  );
}

function Confidence({ value, onChange }) {
  return (
    <div className="flex" title="How confident do you feel? (click to rate)">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n === value ? 0 : n)} className="p-0.5" aria-label={`Confidence ${n}`}>
          <Star className={cn("h-3.5 w-3.5", n <= value ? "fill-amber-400 text-amber-400" : "text-line")} />
        </button>
      ))}
    </div>
  );
}

function TopicEditor({ topic, units, onSave, onCancel }) {
  const [form, setForm] = useState({ name: topic.name, unit_id: topic.unit_id ?? "", priority: topic.priority, est_minutes: topic.est_minutes });
  const save = () => {
    if (!form.name.trim()) return;
    onSave({
      name: form.name.trim(),
      priority: form.priority,
      est_minutes: Math.min(600, Math.max(10, Number(form.est_minutes) || 60)),
      ...(form.unit_id !== "" && Number(form.unit_id) !== topic.unit_id ? { unit_id: Number(form.unit_id) } : {}),
    });
  };
  return (
    <div className="space-y-2 rounded-xl border border-brand-500/40 bg-brand-500/5 p-3">
      <Input autoFocus value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && save()} />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <Select value={form.unit_id} onChange={(e) => setForm((f) => ({ ...f, unit_id: e.target.value }))} aria-label="Unit">
          {topic.unit_id == null && <option value="">Other topics</option>}
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} aria-label="Priority" className="sm:w-36">
          {Object.entries(PRIORITY_META).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="number" min={10} max={600} value={form.est_minutes} onChange={(e) => setForm((f) => ({ ...f, est_minutes: e.target.value }))} className="w-20" aria-label="Estimated minutes" />
          <span className="text-xs text-muted">min</span>
        </div>
        <div className="flex gap-1">
          <Button size="icon" onClick={save} aria-label="Save">
            <Check className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onCancel} aria-label="Cancel">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TopicRow({ topic, units, onUpdate, onDelete, subjectId }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [video, setVideo] = useState(false);
  const status = STATUS_META[topic.status];
  const nextStatus = STATUS_ORDER[(STATUS_ORDER.indexOf(topic.status) + 1) % STATUS_ORDER.length];

  if (editing) {
    return (
      <div className="px-1 py-1.5">
        <TopicEditor
          topic={topic}
          units={units}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            await onUpdate(topic, patch);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="group flex flex-col gap-2 rounded-xl px-3 py-2.5 transition hover:bg-surface-2/60 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <button
          onClick={() => onUpdate(topic, { status: nextStatus })}
          className={cn("mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition hover:ring-2 hover:ring-brand-500/30", status.cls)}
          title={`Click to mark as "${STATUS_META[nextStatus].label}"`}
        >
          {status.label}
        </button>
        <div className="min-w-0">
          <div className={cn("text-sm font-medium text-fg", topic.status === "revised" && "text-muted")}>{topic.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <Badge className={PRIORITY_META[topic.priority].cls}>{PRIORITY_META[topic.priority].label}</Badge>
            <span>~{formatMinutes(topic.est_minutes)}</span>
            {topic.quiz_accuracy != null && (
              <span className={cn(topic.quiz_accuracy < 60 ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400")}>Quiz {topic.quiz_accuracy}%</span>
            )}
            {topic.note && <span className="italic">— {topic.note}</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1 pl-[4.5rem] sm:pl-0">
        <Confidence value={topic.confidence} onChange={(confidence) => onUpdate(topic, { confidence })} />
        <div className="ml-2 flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button title="Watch the best YouTube lecture" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-rose-500" onClick={() => setVideo(true)}>
            <PlayCircle className="h-4 w-4" />
          </button>
          <button
            title="Explain with AI tutor"
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-brand-600"
            onClick={() => navigate(`/tutor?subject=${subjectId}&ask=${encodeURIComponent(`Explain "${topic.name}" clearly for my exam, with examples and likely questions.`)}`)}
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button title="Quiz me on this" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-brand-600" onClick={() => navigate(`/quiz?subject=${subjectId}&topic=${topic.id}`)}>
            <Brain className="h-4 w-4" />
          </button>
          <button
            title="Make flashcards"
            className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-brand-600"
            onClick={() => navigate(`/flashcards?subject=${subjectId}&topic=${topic.id}&generate=1`)}
          >
            <Layers className="h-4 w-4" />
          </button>
          <button title="Edit, move or re-prioritise" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-brand-600" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />
          </button>
          <button title="Delete topic" className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-rose-500" onClick={() => onDelete(topic)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      {video && <VideoModal topicId={topic.id} title={topic.name} onClose={() => setVideo(false)} />}
    </div>
  );
}

function UnitHeader({ unit, done, total, collapsed, onToggle, onRename, onDelete, barClassName }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(unit.name);
  const editable = unit.id != null;

  if (editing) {
    const save = async () => {
      if (name.trim() && name.trim() !== unit.name) await onRename(unit, name.trim());
      setEditing(false);
    };
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? save() : e.key === "Escape" && setEditing(false))} />
        <Button size="icon" onClick={save} aria-label="Save unit name">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setEditing(false)} aria-label="Cancel">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-3 px-5 py-4">
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onToggle}>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition", collapsed && "-rotate-90")} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-fg">{unit.name}</div>
          <div className="text-xs text-muted">
            {done}/{total} done
          </div>
        </div>
      </button>
      {editable && (
        <div className="flex gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
          <button onClick={() => setEditing(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-brand-600" title="Rename unit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(unit)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-rose-500" title="Delete unit and its topics">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
      <Progress value={total ? (done / total) * 100 : 0} className="hidden h-1.5 w-28 sm:block" barClassName={barClassName} />
    </div>
  );
}

function AddTopicInline({ onAdd }) {
  const [name, setName] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName("");
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2 px-3 pb-2 pt-1">
      <Plus className="h-4 w-4 shrink-0 text-muted" />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a topic to this unit…"
        className="h-8 flex-1 bg-transparent text-sm text-fg placeholder:text-muted/70 focus:outline-none focus-visible:outline-none"
      />
      {name && (
        <Button type="submit" size="sm" variant="soft">
          Add
        </Button>
      )}
    </form>
  );
}

export default function SubjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: subject, setData, error, loading, reload } = useApi(`/api/subjects/${id}`);
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [newTopic, setNewTopic] = useState("");
  const [newUnit, setNewUnit] = useState(null);

  const groups = useMemo(() => {
    if (!subject) return [];
    const match = (t) =>
      filter === "all" ||
      (filter === "pending" && (t.status === "not_started" || t.status === "learning")) ||
      (filter === "weak" && ((t.quiz_accuracy != null && t.quiz_accuracy < 60) || (t.confidence > 0 && t.confidence <= 2))) ||
      (filter === "must" && t.priority === "must");
    const units = [...subject.units, { id: null, name: "Other topics" }];
    return units
      .map((u) => ({ ...u, topics: subject.topics.filter((t) => t.unit_id === u.id && match(t)), all: subject.topics.filter((t) => t.unit_id === u.id) }))
      .filter((u) => u.topics.length || (filter === "all" && u.id != null));
  }, [subject, filter]);

  if (loading && !subject) return <PageLoader />;
  if (error && !subject) return <ErrorBanner message={error} onRetry={reload} />;

  const color = colorOf(subject.color);
  const d = daysUntil(subject.exam_date);
  const remainingMin = subject.topics.filter((t) => t.status === "not_started" || t.status === "learning").reduce((a, t) => a + t.est_minutes, 0);

  const updateTopic = async (topic, patch) => {
    setData((s) => ({ ...s, topics: s.topics.map((t) => (t.id === topic.id ? { ...t, ...patch } : t)) }));
    try {
      await api.patch(`/api/subjects/topics/${topic.id}`, patch);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
      reload();
    }
  };

  const addTopicTo = async (unitId, name) => {
    try {
      await api.post(`/api/subjects/${id}/topics`, { name, unit_id: unitId });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const renameUnit = async (unit, name) => {
    try {
      await api.patch(`/api/subjects/units/${unit.id}`, { name });
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const deleteUnit = async (unit) => {
    const count = subject.topics.filter((t) => t.unit_id === unit.id).length;
    if (!confirm(`Delete "${unit.name}"${count ? ` and its ${count} topic${count === 1 ? "" : "s"}` : ""}?`)) return;
    try {
      await api.delete(`/api/subjects/units/${unit.id}`);
      toast.success("Unit deleted");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const addUnit = async (e) => {
    e.preventDefault();
    if (!newUnit?.trim()) return;
    try {
      await api.post(`/api/subjects/${id}/units`, { name: newUnit.trim() });
      setNewUnit(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const deleteTopic = async (topic) => {
    if (!confirm(`Delete "${topic.name}"?`)) return;
    await api.delete(`/api/subjects/topics/${topic.id}`).catch((e) => toast.error(errorMessage(e)));
    reload();
  };

  const addTopic = async (e) => {
    e.preventDefault();
    if (!newTopic.trim()) return;
    try {
      await api.post(`/api/subjects/${id}/topics`, { name: newTopic.trim() });
      setNewTopic("");
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const deleteSubject = async () => {
    if (!confirm(`Delete ${subject.name} and all its topics, cards and quizzes? This can't be undone.`)) return;
    try {
      await api.delete(`/api/subjects/${id}`);
      toast.success("Subject deleted");
      navigate("/subjects");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/subjects" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Subjects
      </Link>

      <Card className="relative overflow-hidden p-5 sm:p-6">
        <div className={cn("absolute inset-x-0 top-0 h-1", color.bar)} />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Ring value={subject.progress} size={72} stroke={7} color={color.hex}>
              <span className="text-sm font-bold text-fg">{subject.progress}%</span>
            </Ring>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight text-fg">{subject.name}</h1>
              <p className="text-sm text-muted">{[subject.exam_name, subject.board_university, subject.class_semester].filter(Boolean).join(" · ") || "No exam details yet"}</p>
              {subject.syllabus_source === "catalog" && (
                <Badge className="mt-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" title="Pre-loaded from the official syllabus. Edit anything to match your course.">
                  <BadgeCheck className="h-3 w-3" /> Official syllabus · editable
                </Badge>
              )}
              {subject.syllabus_source === "ai" && (
                <Badge className="mt-1.5 bg-amber-500/10 text-amber-700 dark:text-amber-300" title="Drafted by AI — verify against your official syllabus.">
                  <Sparkles className="h-3 w-3" /> AI-drafted · please verify
                </Badge>
              )}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {subject.exam_date && (
                  <span className={cn("inline-flex items-center gap-1", d != null && d <= 7 && d >= 0 && "font-semibold text-rose-500")}>
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDate(subject.exam_date, { day: "numeric", month: "short", year: "numeric" })}
                    {d != null && d >= 0 && ` · ${d} days left`}
                  </span>
                )}
                {subject.topic_count > 0 && (
                  <span>
                    {subject.done_count}/{subject.topic_count} topics · ~{formatMinutes(remainingMin)} of study left
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {subject.topic_count > 0 && (
              <>
                <Button variant="soft" onClick={() => navigate(`/quiz?subject=${id}`)}>
                  <Brain className="h-4 w-4" /> Quiz
                </Button>
                <Button variant="soft" onClick={() => navigate(`/tutor?subject=${id}`)}>
                  <MessageCircle className="h-4 w-4" /> Tutor
                </Button>
                <Button variant="secondary" onClick={() => setImportOpen(true)}>
                  <Upload className="h-4 w-4" /> Syllabus
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={() => setEditing(true)} aria-label="Edit subject">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={deleteSubject} aria-label="Delete subject" className="hover:text-rose-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {subject.topic_count === 0 ? (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-fg">Add the syllabus</h2>
          <p className="mb-5 mt-1 text-sm text-muted">
            Upload the official syllabus (PDF or a clear photo), paste it, or let AI draft it. AI organises it into units and topics, flags must-do topics and estimates study time.{" "}
            Preparing for a popular exam?{" "}
            <Link to="/exams" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
              Pick it from the exam list
            </Link>{" "}
            to get the syllabus instantly.
          </p>
          <SyllabusImporter subject={subject} onDone={setData} />
          <p className="mt-6 text-xs text-muted">Prefer doing it yourself? Add topics one by one:</p>
          <form onSubmit={addTopic} className="mt-2 flex gap-2">
            <Input placeholder="Topic name" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <Button type="submit" variant="secondary">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "pending", label: "To do" },
                { value: "must", label: "Must do" },
                { value: "weak", label: "Weak" },
              ]}
            />
            {newUnit != null ? (
              <form onSubmit={addUnit} className="flex gap-2">
                <Input autoFocus placeholder="New unit name…" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="sm:w-56" />
                <Button type="submit" size="icon" aria-label="Create unit">
                  <Check className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => setNewUnit(null)} aria-label="Cancel">
                  <X className="h-4 w-4" />
                </Button>
              </form>
            ) : (
              <Button variant="secondary" onClick={() => setNewUnit("")}>
                <FolderPlus className="h-4 w-4" /> Add unit
              </Button>
            )}
          </div>

          {groups.length === 0 && <p className="py-10 text-center text-sm text-muted">No topics match this filter.</p>}

          <div className="space-y-4">
            {groups.map((u) => {
              const key = u.id ?? "none";
              const done = u.all.filter((t) => t.status === "done" || t.status === "revised").length;
              return (
                <Card key={key}>
                  <UnitHeader
                    unit={u}
                    done={done}
                    total={u.all.length}
                    collapsed={collapsed[key]}
                    onToggle={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
                    onRename={renameUnit}
                    onDelete={deleteUnit}
                    barClassName={color.bar}
                  />
                  {!collapsed[key] && (
                    <div className="border-t border-line px-2 py-2">
                      {u.topics.map((t) => (
                        <TopicRow key={t.id} topic={t} units={subject.units} subjectId={id} onUpdate={updateTopic} onDelete={deleteTopic} />
                      ))}
                      {u.topics.length === 0 && <p className="px-3 py-2 text-sm text-muted">No topics yet.</p>}
                      {u.id != null && <AddTopicInline onAdd={(name) => addTopicTo(u.id, name)} />}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}

      {editing && <SubjectForm open subject={subject} onClose={() => setEditing(false)} onSaved={setData} />}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Update syllabus" description="Upload a new syllabus to rebuild or extend the topic list.">
        <SyllabusImporter
          compact
          subject={subject}
          onDone={(data) => {
            setData(data);
            setImportOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}
