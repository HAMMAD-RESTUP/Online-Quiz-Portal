import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import LoadingScreen from "../components/LoadingScreen";
import useCheatDetection from "../hooks/useCheatDetection";
import { readableError } from "../lib/helpers";
import { resumeQuizAttempt, submitQuizAnswer } from "../lib/quizApi";
import Logo from "../assests/smit-logo.jpg";

export default function QuizPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(location.state || null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [loading, setLoading] = useState(!location.state);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const autoSubmitLock = useRef(false);

  const attemptId = attempt?.attemptId || sessionStorage.getItem("activeQuizAttemptId");
  useCheatDetection(attemptId, Boolean(attempt?.question));

  useEffect(() => {
    if (attempt) return;
    const storedAttemptId = sessionStorage.getItem("activeQuizAttemptId");

    if (!storedAttemptId) {
      navigate("/", { replace: true });
      return;
    }

    resumeQuizAttempt(storedAttemptId)
      .then((resumedAttempt) => {
        if (resumedAttempt.done) {
          navigate("/complete", {
            replace: true,
            state: { result: resumedAttempt.result, quiz: resumedAttempt.quiz },
          });
          return;
        }
        setAttempt(resumedAttempt);
      })
      .catch((resumeError) => {
        setError(readableError(resumeError, "Unable to restore this quiz."));
      })
      .finally(() => setLoading(false));
  }, [attempt, navigate]);

  const submitCurrentAnswer = useCallback(
    async (reason = "manual") => {
      if (!attempt?.question || submitting) return;

      setSubmitting(true);
      setError("");

      try {
        const response = await submitQuizAnswer({
          attemptId: attempt.attemptId,
          questionId: attempt.question.questionId,
          selectedIndex: reason === "timeout" ? null : selectedIndex,
          reason,
        });

        setSelectedIndex(null);
        autoSubmitLock.current = false;

        if (response.done) {
          sessionStorage.removeItem("activeQuizAttemptId");
          sessionStorage.removeItem("activeQuizStarted");

          try {
            await document.exitFullscreen?.();
          } catch {
            // Browser may already have left fullscreen.
          }

          navigate("/complete", {
            replace: true,
            state: { result: response.result, quiz: attempt.quiz },
          });
          return;
        }

        setAttempt((current) => ({ ...current, question: response.question }));
      } catch (submitError) {
        setError(readableError(submitError, "Unable to save the answer."));

        try {
          const resumed = await resumeQuizAttempt(attempt.attemptId);
          if (resumed.done) {
            navigate("/complete", {
              replace: true,
              state: { result: resumed.result, quiz: resumed.quiz },
            });
          } else {
            setAttempt(resumed);
            setSelectedIndex(null);
          }
        } catch {
          // Keep the original error visible.
        }
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, navigate, selectedIndex, submitting],
  );

  useEffect(() => {
    if (!attempt?.question?.deadlineMs) return undefined;

    autoSubmitLock.current = false;

    function updateTimer() {
      const seconds = Math.max(
        0,
        Math.ceil((attempt.question.deadlineMs - Date.now()) / 1000),
      );
      setRemainingSeconds(seconds);

      if (seconds === 0 && !autoSubmitLock.current) {
        autoSubmitLock.current = true;
        submitCurrentAnswer("timeout");
      }
    }

    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [attempt?.question?.deadlineMs, submitCurrentAnswer]);

  if (loading) return <LoadingScreen label="Restoring your quiz..." />;

  if (!attempt?.question) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-md">
          <h1 className="text-2xl font-bold text-slate-900">Quiz Unavailable</h1>
          <p className="mt-3 text-sm text-slate-500">
            {error || "This quiz session could not be loaded."}
          </p>
          <button
            className="mt-6 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
            type="button"
            onClick={() => navigate("/", { replace: true })}
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  const { question, quiz } = attempt;
  const progress = (question.questionNumber / question.totalQuestions) * 100;
  const timerStyle =
    remainingSeconds <= 5
      ? "bg-red-100 text-red-700"
      : remainingSeconds <= 10
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-24 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <img className="h-14 w-auto max-w-[150px] object-contain sm:h-16" src={Logo} alt="SMIT Logo" />
            <div className="hidden min-w-0 border-l border-slate-200 pl-4 sm:block">
              <h1 className="truncate text-lg font-bold text-slate-900">{quiz?.title || "Quiz"}</h1>
              {quiz?.subject ? <p className="mt-1 text-sm text-slate-500">{quiz.subject}</p> : null}
            </div>
          </div>

          <div className={`rounded-lg px-4 py-2 text-center ${timerStyle}`} aria-live="polite">
            <span className="block text-xs font-medium">Time Left</span>
            <strong className="block text-xl font-bold">00:{String(remainingSeconds).padStart(2, "0")}</strong>
          </div>
        </div>
      </header>

      <div className="h-2 bg-slate-200" aria-hidden="true">
        <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-4 flex items-center justify-between text-sm font-medium text-slate-600">
          <span>
            Question {question.questionNumber} of {question.totalQuestions}
          </span>
          <span>
            {question.marks} {question.marks === 1 ? "Mark" : "Marks"}
          </span>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold leading-8 text-slate-900 sm:text-2xl">{question.text}</h2>

          <div className="mt-7 grid gap-3">
            {question.options.map((option, index) => {
              const selected = selectedIndex === index;
              return (
                <button
                  className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-blue-600 bg-blue-50 ring-2 ring-blue-100"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  disabled={submitting}
                  key={`${question.questionId}-${index}`}
                  onClick={() => setSelectedIndex(index)}
                  type="button"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      selected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="font-medium text-slate-800">{option}</span>
                </button>
              );
            })}
          </div>

          {error ? <div className="mt-5 rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</div> : null}

          <button
            className="mt-7 w-full rounded-lg bg-blue-600 px-5 py-3.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={selectedIndex === null || submitting}
            onClick={() => submitCurrentAnswer("manual")}
            type="button"
          >
            {submitting
              ? "Saving..."
              : question.questionNumber === question.totalQuestions
                ? "Submit Quiz"
                : "Save & Next"}
          </button>
        </section>
      </main>
    </div>
  );
}
