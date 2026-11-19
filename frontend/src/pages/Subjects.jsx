import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, CalendarClock, GraduationCap, PenLine, Sparkles } from "lucide-react";
import { useApi } from "../lib/hooks";
import { cn, colorOf, daysUntil, formatDate } from "../lib/utils";
import { Button, Card, EmptyState, ErrorBanner, PageHeader, PageLoader, Progress } from "../components/ui";
import SubjectForm from "../components/SubjectForm";

export default function Subjects() {
  const { data, error, loading, reload } = useApi("/api/subjects");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (loading && !data) return <PageLoader />;

  return (
    <>
      <PageHeader
        title="Subjects"
        subtitle="Each subject has its own exam date, syllabus and topic tracker."
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(true)}>
              <PenLine className="h-4 w-4" /> Custom subject
            </Button>
            <Button onClick={() => navigate("/exams")}>
              <GraduationCap className="h-4 w-4" /> Browse exams
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {data?.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="No subjects yet"
            description="Pick your exam (JEE, NEET, CBSE, CAT, SAT, IELTS and more) and the full syllabus is added for you, or create a custom subject."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => navigate("/exams")}>
                  <GraduationCap className="h-4 w-4" /> Choose your exam
                </Button>
                <Button variant="secondary" onClick={() => setOpen(true)}>
                  <PenLine className="h-4 w-4" /> Custom subject
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.map((s) => {
            const color = colorOf(s.color);
            const d = daysUntil(s.exam_date);
            return (
              <Link key={s.id} to={`/subjects/${s.id}`}>
                <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className={cn("grid h-11 w-11 place-items-center rounded-xl text-lg font-bold", color.soft)}>{s.name.charAt(0).toUpperCase()}</div>
                    {d != null && (
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          d < 0 ? "bg-surface-2 text-muted" : d <= 7 ? "bg-rose-500/10 text-rose-600 dark:text-rose-300" : "bg-surface-2 text-fg",
                        )}
                      >
                        {d < 0 ? "Done" : d === 0 ? "Today" : `${d} days`}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-4 truncate text-lg font-semibold text-fg">{s.name}</h3>
                  <p className="truncate text-sm text-muted">{[s.exam_name, s.board_university, s.class_semester].filter(Boolean).join(" · ") || "Add exam details"}</p>
                  {s.topic_count ? (
                    <>
                      <Progress value={s.progress} className="mt-5 h-1.5" barClassName={color.bar} />
                      <div className="mt-2 flex justify-between text-xs text-muted">
                        <span>
                          {s.done_count}/{s.topic_count} topics done
                        </span>
                        <span className="font-semibold text-fg">{s.progress}%</span>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 flex items-center gap-2 rounded-xl bg-brand-500/10 px-3 py-2 text-xs font-medium text-brand-700 dark:text-brand-300">
                      <Sparkles className="h-3.5 w-3.5" /> Upload syllabus to build the topic list
                    </div>
                  )}
                  {s.exam_date && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                      <CalendarClock className="h-3.5 w-3.5" /> Exam {formatDate(s.exam_date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {open && <SubjectForm open onClose={() => setOpen(false)} onSaved={(s) => navigate(`/subjects/${s.id}`)} />}
    </>
  );
}
