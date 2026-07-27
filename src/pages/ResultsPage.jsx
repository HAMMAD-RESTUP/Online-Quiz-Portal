import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import { db } from "../lib/firebase";
import { csvEscape, formatDate, readableError } from "../lib/helpers";

const eventLabels = {
  tab_hidden: "Tab changed",
  window_blur: "Window changed",
  fullscreen_exit: "Left fullscreen",
  page_reload: "Page reloaded",
  back_button: "Back button",
  copy_attempt: "Copy attempt",
  paste_attempt: "Paste attempt",
  context_menu: "Right-click",
  keyboard_shortcut: "Blocked shortcut",
};

function calculateAttemptResult(attempt, questions, answerKeyMap, answers) {
  const answerMap = new Map(
    answers.map((answer) => [answer.questionId || answer.id, answer]),
  );
  const scoringReady = questions.every((question) =>
    Number.isInteger(answerKeyMap.get(question.id)),
  );
  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  let answeredCount = 0;

  questions.forEach((question) => {
    const answer = answerMap.get(question.id);

    if (!answer) {
      if (attempt.status === "completed") skippedCount += 1;
      return;
    }

    answeredCount += 1;
    const selectedIndex = answer.selectedOriginalIndex;

    if (!Number.isInteger(selectedIndex)) {
      skippedCount += 1;
      return;
    }

    if (!scoringReady) return;

    if (selectedIndex === answerKeyMap.get(question.id)) {
      correctCount += 1;
      score += Math.max(1, Number(question.marks) || 1);
    } else {
      wrongCount += 1;
    }
  });

  return {
    ...attempt,
    score: scoringReady ? score : null,
    totalMarks: questions.reduce(
      (sum, question) => sum + Math.max(1, Number(question.marks) || 1),
      0,
    ),
    correctCount: scoringReady ? correctCount : null,
    wrongCount: scoringReady ? wrongCount : null,
    skippedCount,
    answeredCount,
    scoringReady,
  };
}

export default function ResultsPage() {
  const { quizId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    getDoc(doc(db, "quizzes", quizId))
      .then((snapshot) => {
        if (snapshot.exists() && !cancelled) {
          setQuiz({ id: snapshot.id, ...snapshot.data() });
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(readableError(loadError, "Unable to load quiz."));
        }
      });

    const attemptsQuery = query(
      collection(db, "attempts"),
      where("quizId", "==", quizId),
    );
    const unsubscribe = onSnapshot(
      attemptsQuery,
      async (snapshot) => {
        try {
          const [questionSnapshot, answerKeySnapshot] = await Promise.all([
            getDocs(collection(db, "quizzes", quizId, "questions")),
            getDocs(collection(db, "quizzes", quizId, "answerKeys")),
          ]);
          const questions = questionSnapshot.docs.map((questionDoc) => ({
            id: questionDoc.id,
            ...questionDoc.data(),
          }));
          const answerKeyMap = new Map(
            answerKeySnapshot.docs.map((keyDoc) => [
              keyDoc.id,
              Number(keyDoc.data().correctIndex),
            ]),
          );

          const rows = await Promise.all(
            snapshot.docs.map(async (attemptDoc) => {
              const answersSnapshot = await getDocs(
                collection(db, "attempts", attemptDoc.id, "answers"),
              );
              const answers = answersSnapshot.docs.map((answerDoc) => ({
                id: answerDoc.id,
                ...answerDoc.data(),
              }));

              return calculateAttemptResult(
                { id: attemptDoc.id, ...attemptDoc.data() },
                questions,
                answerKeyMap,
                answers,
              );
            }),
          );

          rows.sort((a, b) => {
            const aTime = a.startedAt?.toMillis?.() || 0;
            const bTime = b.startedAt?.toMillis?.() || 0;
            return bTime - aTime;
          });

          if (!cancelled) {
            setAttempts(rows);
            setLoading(false);
          }
        } catch (snapshotError) {
          if (!cancelled) {
            setError(readableError(snapshotError, "Unable to calculate results."));
            setLoading(false);
          }
        }
      },
      (snapshotError) => {
        if (!cancelled) {
          setError(readableError(snapshotError, "Unable to load results."));
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [quizId]);

  const filteredAttempts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return attempts.filter((attempt) => {
      const matchesSearch =
        !term ||
        [attempt.studentName, attempt.rollNumber]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "suspicious" && attempt.isSuspicious) ||
        (statusFilter === "normal" && !attempt.isSuspicious) ||
        (statusFilter === "completed" && attempt.status === "completed") ||
        (statusFilter === "in_progress" && attempt.status === "in_progress");
      return matchesSearch && matchesStatus;
    });
  }, [attempts, search, statusFilter]);

  const completed = attempts.filter((attempt) => attempt.status === "completed");
  const scoredCompleted = completed.filter((attempt) => attempt.scoringReady);
  const suspiciousCount = attempts.filter((attempt) => attempt.isSuspicious).length;
  const averageScore = scoredCompleted.length
    ? scoredCompleted.reduce((sum, attempt) => {
        const percentage = attempt.totalMarks
          ? (Number(attempt.score) / Number(attempt.totalMarks)) * 100
          : 0;
        return sum + percentage;
      }, 0) / scoredCompleted.length
    : 0;

  function exportCsv() {
    const headings = [
      "Student Name",
      "Roll Number",
      "Status",
      "Score",
      "Total Marks",
      "Correct",
      "Wrong",
      "Skipped",
      "Cheat Flags",
      "Flag Types",
      "Started At",
      "Submitted At",
    ];
    const rows = filteredAttempts.map((attempt) => [
      attempt.studentName,
      attempt.rollNumber,
      attempt.status,
      attempt.scoringReady ? attempt.score : "Answer key missing",
      attempt.totalMarks,
      attempt.scoringReady ? attempt.correctCount : "",
      attempt.scoringReady ? attempt.wrongCount : "",
      attempt.skippedCount,
      attempt.cheatCount,
      (attempt.cheatTypes || [])
        .map((type) => eventLabels[type] || type)
        .join("; "),
      formatDate(attempt.startedAt),
      formatDate(attempt.submittedAt),
    ]);

    const csv = [headings, ...rows]
      .map((row) => row.map(csvEscape).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${quiz?.code || "quiz"}-results.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <AdminShell
      title={`${quiz?.title || "Quiz"} Results`}
      subtitle={`Code: ${quiz?.code || "—"} • Scores are calculated in the admin panel.`}
      actions={
        <>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            to={`/admin/quizzes/${quizId}`}
          >
            Questions
          </Link>
          <button
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!filteredAttempts.length}
            onClick={exportCsv}
            type="button"
          >
            Export CSV
          </button>
        </>
      }
    >
      {error ? (
        <div className="mb-5 rounded-lg bg-red-100 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total Attempts", attempts.length, ""],
          ["Completed", completed.length, ""],
          [
            "Flagged Students",
            suspiciousCount,
            suspiciousCount ? "text-red-600" : "",
          ],
          ["Average Score", `${averageScore.toFixed(1)}%`, ""],
        ].map(([label, value, valueClass]) => (
          <article
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            key={label}
          >
            <p className="text-sm text-slate-500">{label}</p>
            <strong
              className={`mt-2 block text-3xl font-bold text-slate-900 ${valueClass}`}
            >
              {value}
            </strong>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Student Attempts</h2>
            <p className="mt-1 text-sm text-slate-500">
              A flag is only an activity signal for admin review.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:w-64"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name or roll no..."
              value={search}
            />
            <select
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onChange={(event) => setStatusFilter(event.target.value)}
              value={statusFilter}
            >
              <option value="all">All Attempts</option>
              <option value="suspicious">Flagged Only</option>
              <option value="normal">Normal Only</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Loading student results...
          </div>
        ) : filteredAttempts.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold text-slate-900">No attempts found</h3>
            <p className="mt-1 text-sm text-slate-500">
              Student attempts will appear here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Roll No.</th>
                  <th className="px-5 py-3 font-semibold">Score</th>
                  <th className="px-5 py-3 font-semibold">Answers</th>
                  <th className="px-5 py-3 font-semibold">Activity</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredAttempts.map((attempt) => (
                  <tr
                    className={
                      attempt.isSuspicious
                        ? "bg-red-50 hover:bg-red-100/60"
                        : "hover:bg-slate-50"
                    }
                    key={attempt.id}
                  >
                    <td className="px-5 py-4">
                      <strong className="block text-slate-900">
                        {attempt.studentName}
                      </strong>
                      <span
                        className={`mt-1 block text-xs ${
                          attempt.isSuspicious
                            ? "text-red-600"
                            : "text-slate-500"
                        }`}
                      >
                        {attempt.isSuspicious
                          ? "Review required"
                          : "Normal activity"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {attempt.rollNumber}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-900">
                      {attempt.status !== "completed"
                        ? "—"
                        : attempt.scoringReady
                          ? `${attempt.score || 0}/${attempt.totalMarks || 0}`
                          : "Answer key missing"}
                    </td>
                    <td className="px-5 py-4">
                      <div className="space-y-1 whitespace-nowrap text-xs text-slate-600">
                        {attempt.scoringReady ? (
                          <>
                            <p className="text-green-700">
                              {attempt.correctCount || 0} correct
                            </p>
                            <p>{attempt.wrongCount || 0} wrong</p>
                          </>
                        ) : (
                          <p className="text-amber-700">Open Questions once</p>
                        )}
                        <p>{attempt.skippedCount || 0} skipped</p>
                      </div>
                    </td>
                    <td className="max-w-xs px-5 py-4">
                      {attempt.isSuspicious ? (
                        <div>
                          <strong className="text-sm text-red-700">
                            {attempt.cheatCount || 0} flags
                          </strong>
                          <p className="mt-1 text-xs leading-5 text-red-600">
                            {(attempt.cheatTypes || [])
                              .map((type) => eventLabels[type] || type)
                              .join(", ") || "Activity flagged"}
                          </p>
                        </div>
                      ) : (
                        <span className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-700">
                          No Flags
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          attempt.status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {attempt.status === "completed"
                          ? "Completed"
                          : "In Progress"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(attempt.submittedAt || attempt.startedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
