import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Check, ChevronDown, Globe2, GraduationCap, Info, PenLine, Search, Sparkles } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { cn, colorOf } from "../lib/utils";
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, PageLoader, Segmented } from "../components/ui";
import SubjectForm from "../components/SubjectForm";

const REGION_FLAG = { India: "🇮🇳", Global: "🌍" };

function ExamModal({ examId, onClose, onAdded }) {
  const { data: exam, loading } = useApi(`/api/catalog/${examId}`);
  const list = useApi("/api/catalog");
  const added = useMemo(() => {
    const e = list.data?.find((x) => x.id === examId);
    return new Set(e?.subjects.filter((s) => s.added).map((s) => s.key) || []);
  }, [list.data, examId]);
  const [picked, setPicked] = useState(null);
  const [open, setOpen] = useState({});
  const [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = picked ?? exam?.subjects.filter((s) => !added.has(s.key)).map((s) => s.key) ?? [];
  const toggle = (k) => setPicked((p) => ((p ?? selected).includes(k) ? (p ?? selected).filter((x) => x !== k) : [...(p ?? selected), k]));

  const submit = async () => {
    if (!selected.length) return toast.error("Pick at least one subject.");
    setBusy(true);
    try {
      const { data } = await api.post(`/api/catalog/${examId}/add`, { subject_keys: selected, exam_date: examDate || null });
      const n = data.created.length;
      toast.success(n ? `Added ${n} subject${n === 1 ? "" : "s"} with the full ${exam.name} syllabus.` : "Those subjects were already added.");
      onAdded(data.created);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={exam ? exam.name : "Loading…"}
      description={exam?.full_name}
      footer={
        exam && (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!selected.length}>
              Add {selected.length || ""} subject{selected.length === 1 ? "" : "s"}
            </Button>
          </>
        )
      }
    >
      {loading || !exam ? (
        <PageLoader />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge className="bg-surface-2 text-muted">{exam.conducted_by}</Badge>
            <Badge className="bg-surface-2 text-muted">Held: {exam.held}</Badge>
            <Badge className="bg-surface-2 text-muted">{exam.category}</Badge>
          </div>
          <p className="text-sm text-muted">{exam.description}</p>

          <Field label="Your exam date (optional)" hint="Powers your countdown and study plan. You can change it later.">
            {(id) => <Input id={id} type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="sm:w-56" />}
          </Field>

          <div>
            <div className="mb-2 text-sm font-medium text-fg">Subjects / papers</div>
            <div className="space-y-2">
              {exam.subjects.map((s) => {
                const isAdded = added.has(s.key);
                const on = selected.includes(s.key);
                return (
                  <div key={s.key} className={cn("rounded-xl border transition", on ? "border-brand-500 bg-brand-500/5" : "border-line")}>
                    <div className="flex items-center gap-3 p-3">
                      <button
                        type="button"
                        disabled={isAdded}
                        onClick={() => toggle(s.key)}
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition disabled:opacity-50",
                          on ? "border-brand-600 bg-brand-600 text-white" : "border-line",
                        )}
                        aria-label={`Select ${s.name}`}
                      >
                        {(on || isAdded) && <Check className="h-3 w-3" strokeWidth={3} />}
                      </button>
                      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorOf(s.color).dot)} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-fg">{s.name}</div>
                        <div className="text-xs text-muted">
                          {s.unit_count} units · {s.topic_count} topics{isAdded && " · already in your subjects"}
                        </div>
                      </div>
                      <button onClick={() => setOpen((o) => ({ ...o, [s.key]: !o[s.key] }))} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg">
                        Syllabus <ChevronDown className={cn("h-3.5 w-3.5 transition", open[s.key] && "rotate-180")} />
                      </button>
                    </div>
                    {open[s.key] && (
                      <div className="space-y-3 border-t border-line px-4 py-3">
                        {s.units.map((u) => (
                          <div key={u.name}>
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{u.name}</div>
                            <ul className="mt-1 flex flex-wrap gap-1.5">
                              {u.topics.map((t) => (
                                <li key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-fg">
                                  {t}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="flex gap-2 rounded-xl bg-surface-2 p-3 text-xs text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {exam.note} After adding, you can rename, add, move or delete any unit or topic.
          </p>
        </div>
      )}
    </Modal>
  );
}

export default function Exams() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi("/api/catalog");
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("all");
  const [category, setCategory] = useState("All");
  const [openExam, setOpenExam] = useState(null);
  const [custom, setCustom] = useState(false);

  const categories = useMemo(() => ["All", ...new Set((data || []).map((e) => e.category))], [data]);
  const exams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter(
      (e) =>
        (region === "all" || e.region === region) &&
        (category === "All" || e.category === category) &&
        (!q || [e.name, e.full_name, e.conducted_by, e.category, ...e.subjects.map((s) => s.name)].join(" ").toLowerCase().includes(q)),
    );
  }, [data, query, region, category]);

  if (loading && !data) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Choose your exam"
        subtitle="Pick an exam and its full syllabus is added for you. Every topic stays editable."
        actions={
          <Button variant="secondary" onClick={() => setCustom(true)}>
            <PenLine className="h-4 w-4" /> Custom subject
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Search JEE, NEET, CBSE, SAT, IELTS…" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-10" />
        </div>
        <Segmented
          value={region}
          onChange={setRegion}
          options={[
            { value: "all", label: "All" },
            { value: "India", label: "🇮🇳 India" },
            { value: "Global", label: "🌍 Global" },
          ]}
        />
      </div>
      <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition",
              category === c ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-line text-muted hover:text-fg",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {exams.map((e) => {
          const addedCount = e.subjects.filter((s) => s.added).length;
          const topics = e.subjects.reduce((a, s) => a + s.topic_count, 0);
          return (
            <button key={e.id} onClick={() => setOpenExam(e.id)} className="text-left">
              <Card className="flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:border-brand-400/60 hover:shadow-lg hover:shadow-black/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-500/10 text-xl">{REGION_FLAG[e.region]}</div>
                  {addedCount > 0 ? (
                    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                      <Check className="h-3 w-3" /> Added
                    </Badge>
                  ) : (
                    <Badge className="bg-surface-2 text-muted">{e.category}</Badge>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-fg">{e.name}</h3>
                <p className="line-clamp-2 text-sm text-muted">{e.description}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                  {e.subjects.slice(0, 4).map((s) => (
                    <span key={s.key} className={cn("rounded-md px-2 py-0.5 text-xs font-medium", colorOf(s.color).soft)}>
                      {s.name}
                    </span>
                  ))}
                  {e.subjects.length > 4 && <span className="rounded-md bg-surface-2 px-2 py-0.5 text-xs text-muted">+{e.subjects.length - 4}</span>}
                </div>
                <div className="mt-3 text-xs text-muted">
                  {e.conducted_by} · {topics} topics
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Card className="mt-8 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-300">
          {exams.length === 0 ? <Globe2 className="h-5 w-5" /> : <GraduationCap className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-fg">{exams.length === 0 ? "We don't have that exam yet" : "Exam not listed?"}</h3>
          <p className="text-sm text-muted">
            Create a custom subject, then upload or paste the official syllabus. You can also let <Sparkles className="inline h-3.5 w-3.5" /> AI draft it from the exam name.
          </p>
        </div>
        <Button onClick={() => setCustom(true)}>
          <PenLine className="h-4 w-4" /> Create custom subject
        </Button>
      </Card>

      {openExam && (
        <ExamModal
          examId={openExam}
          onClose={() => setOpenExam(null)}
          onAdded={(created) => {
            setOpenExam(null);
            reload();
            if (created.length === 1) navigate(`/subjects/${created[0].id}`);
            else if (created.length) navigate("/subjects");
          }}
        />
      )}
      {custom && <SubjectForm open onClose={() => setCustom(false)} onSaved={(s) => navigate(`/subjects/${s.id}`)} />}
      <p className="mt-6 text-center text-xs text-muted">
        Already set up? <Link to="/subjects" className="font-medium text-brand-600 hover:underline dark:text-brand-300">Go to your subjects</Link>
      </p>
    </>
  );
}
