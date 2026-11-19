import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, MessageCircle, RotateCcw, Trophy, X } from "lucide-react";
import api, { errorMessage } from "../lib/api";
import { useApi } from "../lib/hooks";
import { cn } from "../lib/utils";
import { Button, Card, ErrorBanner, PageLoader, Progress, Ring } from "../components/ui";
import { InlineMarkdown } from "../components/Markdown";

const LETTERS = ["A", "B", "C", "D"];

function Results({ quiz }) {
  const navigate = useNavigate();
  const pct = Math.round((quiz.score / quiz.total) * 100);
  const wrong = quiz.questions.filter((q) => q.chosen !== q.answer);
  const message = pct >= 90 ? "Outstanding! 🏆" : pct >= 70 ? "Great work! 💪" : pct >= 50 ? "Good effort — a bit more revision." : "Let's strengthen these topics.";

  const askTutor = () => {
    const list = wrong
      .slice(0, 5)
      .map((q, i) => `${i + 1}. ${q.question}`)
      .join("\n");
    navigate(`/tutor?subject=${quiz.subject_id}&ask=${encodeURIComponent(`I got these wrong in a quiz. Explain the concepts behind each so I don't repeat the mistake:\n${list}`)}`);
  };

  return (
    <div className="space-y-6">
      <Card className="flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
        <Ring value={pct} size={110} stroke={10} color={pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#f43f5e"}>
          <div>
            <div className="text-2xl font-bold text-fg">{pct}%</div>
            <div className="text-xs text-muted">
              {quiz.score}/{quiz.total}
            </div>
          </div>
        </Ring>
        <div className="flex-1">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="text-xl font-bold text-fg">{message}</h2>
          </div>
          <p className="mt-1 text-sm text-muted">{quiz.title}. Your topic strengths have been updated from these answers.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            {wrong.length > 0 && (
              <Button onClick={askTutor}>
                <MessageCircle className="h-4 w-4" /> Explain my mistakes
              </Button>
            )}
            <Link to={`/quiz?subject=${quiz.subject_id}`}>
              <Button variant="secondary">
                <RotateCcw className="h-4 w-4" /> New quiz
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {quiz.questions.map((q, i) => {
          const correct = q.chosen === q.answer;
          return (
            <Card key={i} className="p-5">
              <div className="flex gap-3">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-white", correct ? "bg-emerald-500" : "bg-rose-500")}>
                  {correct ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-fg">
                    <InlineMarkdown>{q.question}</InlineMarkdown>
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    {q.options.map((o, oi) => (
                      <div
                        key={oi}
                        className={cn(
                          "rounded-lg px-3 py-2 text-sm",
                          oi === q.answer
                            ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                            : oi === q.chosen
                              ? "bg-rose-500/10 text-rose-700 line-through dark:text-rose-300"
                              : "text-muted",
                        )}
                      >
                        <span className="mr-2 font-semibold">{LETTERS[oi]}.</span>
                        <InlineMarkdown>{o}</InlineMarkdown>
                      </div>
                    ))}
                  </div>
                  {q.explanation && (
                    <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-muted">
                      <span className="font-semibold text-fg">Why: </span>
                      <InlineMarkdown>{q.explanation}</InlineMarkdown>
                    </p>
                  )}
                  {q.chosen == null && <p className="mt-2 text-xs text-muted">Skipped</p>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default function QuizPlay() {
  const { id } = useParams();
  const { data: quiz, setData, error, loading, reload } = useApi(`/api/quizzes/${id}`);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (quiz && !quiz.completed_at && answers.length === 0) setAnswers(Array(quiz.total).fill(null));
  }, [quiz, answers.length]);

  useEffect(() => {
    if (!quiz || quiz.completed_at) return;
    const onKey = (e) => {
      if (["1", "2", "3", "4"].includes(e.key)) choose(Number(e.key) - 1);
      if (["a", "b", "c", "d"].includes(e.key.toLowerCase()) && !e.metaKey && !e.ctrlKey) choose("abcd".indexOf(e.key.toLowerCase()));
      if (e.key === "ArrowRight" || e.key === "Enter") setIndex((i) => Math.min(quiz.total - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quiz, index]);

  if (loading && !quiz) return <PageLoader />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;

  const choose = (oi) => setAnswers((a) => a.map((v, i) => (i === index ? oi : v)));

  const submit = async () => {
    const unanswered = answers.filter((a) => a == null).length;
    if (unanswered && !confirm(`${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered. Submit anyway?`)) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/api/quizzes/${id}/submit`, { answers });
      setData(data);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/quiz" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> Quizzes
      </Link>

      {quiz.completed_at ? (
        <Results quiz={quiz} />
      ) : (
        (() => {
          const q = quiz.questions[index];
          const answered = answers.filter((a) => a != null).length;
          const isLast = index === quiz.total - 1;
          return (
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-fg">{quiz.title}</span>
                  <span className="text-muted">
                    {index + 1} / {quiz.total}
                  </span>
                </div>
                <Progress value={((index + 1) / quiz.total) * 100} className="h-1.5" />
              </div>

              <Card className="p-5 sm:p-7" key={index}>
                <div className="animate-fade-in">
                  <h2 className="text-lg font-semibold leading-snug text-fg">
                    <InlineMarkdown>{q.question}</InlineMarkdown>
                  </h2>
                  <div className="mt-6 grid gap-2.5">
                    {q.options.map((o, oi) => {
                      const selected = answers[index] === oi;
                      return (
                        <button
                          key={oi}
                          onClick={() => choose(oi)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition",
                            selected ? "border-brand-500 bg-brand-500/10 text-fg" : "border-line text-fg hover:border-brand-300 hover:bg-surface-2/60",
                          )}
                        >
                          <span
                            className={cn(
                              "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold",
                              selected ? "bg-brand-600 text-white" : "bg-surface-2 text-muted",
                            )}
                          >
                            {LETTERS[oi]}
                          </span>
                          <InlineMarkdown>{o}</InlineMarkdown>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
                <div className="hidden gap-1 sm:flex">
                  {quiz.questions.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setIndex(i)}
                      className={cn("h-2.5 w-2.5 rounded-full transition", i === index ? "w-6 bg-brand-600" : answers[i] != null ? "bg-brand-300" : "bg-surface-2")}
                      aria-label={`Question ${i + 1}`}
                    />
                  ))}
                </div>
                {isLast ? (
                  <Button onClick={submit} loading={submitting}>
                    Submit ({answered}/{quiz.total})
                  </Button>
                ) : (
                  <Button onClick={() => setIndex((i) => i + 1)}>
                    Next <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <p className="hidden text-center text-xs text-muted sm:block">Tip: press 1–4 or A–D to answer, ← → to move.</p>
            </div>
          );
        })()
      )}
    </div>
  );
}
