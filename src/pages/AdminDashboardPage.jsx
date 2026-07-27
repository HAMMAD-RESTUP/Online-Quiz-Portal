import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import Modal from "../components/Modal";
import { db } from "../lib/firebase";
import { createQuizCode, formatDate, readableError } from "../lib/helpers";

const emptyQuiz = {
  title: "",
  subject: "",
  code: "",
  shuffleQuestions: true,
  shuffleOptions: true,
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function AdminDashboardPage() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ ...emptyQuiz, code: createQuizCode() });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const quizzesQuery = query(collection(db, "quizzes"), orderBy("createdAt", "desc"));
    return onSnapshot(
      quizzesQuery,
      (snapshot) => {
        setQuizzes(snapshot.docs.map((quizDoc) => ({ id: quizDoc.id, ...quizDoc.data() })));
        setLoading(false);
      },
      (snapshotError) => {
        setError(readableError(snapshotError, "Unable to load quizzes."));
        setLoading(false);
      },
    );
  }, []);

  const filteredQuizzes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return quizzes;
    return quizzes.filter((quiz) =>
      [quiz.title, quiz.subject, quiz.code]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [quizzes, search]);

  function openCreateModal() {
    setForm({ ...emptyQuiz, code: createQuizCode() });
    setError("");
    setShowCreateModal(true);
  }

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]:
        type === "checkbox"
          ? checked
          : name === "code"
            ? value.toUpperCase().replace(/[^A-Z0-9_-]/g, "")
            : value,
    }));
  }

  async function createQuiz(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const title = form.title.trim();
      const code = form.code.trim().toUpperCase();

      if (!title) {
        throw new Error("Quiz title is required.");
      }

      if (!code || !/^[A-Z0-9_-]{2,24}$/.test(code)) {
        throw new Error("Quiz code must contain 2 to 24 letters, numbers, underscores or hyphens.");
      }

      const duplicateQuery = query(collection(db, "quizzes"), where("code", "==", code));
      const duplicateSnapshot = await getDocs(duplicateQuery);

      if (!duplicateSnapshot.empty) {
        throw new Error("This quiz code is already in use.");
      }

      await addDoc(collection(db, "quizzes"), {
        title,
        subject: form.subject.trim(),
        code,
        showScore: false,
        sparkSchemaVersion: 1,
        shuffleQuestions: form.shuffleQuestions,
        shuffleOptions: form.shuffleOptions,
        isActive: false,
        questionCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShowCreateModal(false);
      setForm({ ...emptyQuiz, code: createQuizCode() });
    } catch (createError) {
      setError(readableError(createError, "Unable to create quiz."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleQuiz(quiz) {
    try {
      if (!quiz.isActive && !quiz.questionCount) {
        throw new Error("Add at least one question before activating this quiz.");
      }

      if (!quiz.isActive) {
        const [questionSnapshot, answerKeySnapshot] = await Promise.all([
          getDocs(collection(db, "quizzes", quiz.id, "questions")),
          getDocs(collection(db, "quizzes", quiz.id, "answerKeys")),
        ]);
        const hasUnmigratedQuestions = questionSnapshot.docs.some((questionDoc) => {
          const data = questionDoc.data();
          return (
            data.studentReadable !== true ||
            Object.prototype.hasOwnProperty.call(data, "correctIndex")
          );
        });

        if (
          hasUnmigratedQuestions ||
          answerKeySnapshot.size !== questionSnapshot.size
        ) {
          throw new Error(
            "Open this quiz's Questions page once so its answer keys can be prepared for the Spark plan.",
          );
        }
      }

      await updateDoc(doc(db, "quizzes", quiz.id), {
        isActive: !quiz.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch (toggleError) {
      setError(readableError(toggleError, "Unable to update quiz status."));
    }
  }

  async function deleteQuiz(quiz) {
    const confirmed = window.confirm(
      `Delete “${quiz.title}”? Questions will be deleted, but old student results will remain.`,
    );
    if (!confirmed) return;

    try {
      const [questionSnapshot, answerKeySnapshot] = await Promise.all([
        getDocs(collection(db, "quizzes", quiz.id, "questions")),
        getDocs(collection(db, "quizzes", quiz.id, "answerKeys")),
      ]);
      const batch = writeBatch(db);
      questionSnapshot.docs.forEach((questionDoc) => batch.delete(questionDoc.ref));
      answerKeySnapshot.docs.forEach((keyDoc) => batch.delete(keyDoc.ref));
      batch.delete(doc(db, "quizzes", quiz.id));
      await batch.commit();
    } catch (deleteError) {
      setError(readableError(deleteError, "Unable to delete quiz."));
    }
  }

  const activeCount = quizzes.filter((quiz) => quiz.isActive).length;
  const totalQuestions = quizzes.reduce(
    (sum, quiz) => sum + (Number(quiz.questionCount) || 0),
    0,
  );

  return (
    <AdminShell
      title="Quiz Dashboard"
      subtitle="Create quizzes, manage questions and review student results."
      actions={
        <button
          className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
          onClick={openCreateModal}
          type="button"
        >
          + New Quiz
        </button>
      }
    >
      {error && !showCreateModal ? (
        <div className="mb-5 rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Total Quizzes", quizzes.length],
          ["Active Quizzes", activeCount],
          ["Total Questions", totalQuestions],
        ].map(([label, value]) => (
          <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <strong className="mt-2 block text-3xl font-bold text-slate-900">{value}</strong>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Your Quizzes</h2>
            <p className="mt-1 text-sm text-slate-500">Activate a quiz when its questions are ready.</p>
          </div>
          <input
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:max-w-xs"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search quizzes..."
            value={search}
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading quizzes...</div>
        ) : filteredQuizzes.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold text-slate-900">No quizzes found</h3>
            <p className="mt-1 text-sm text-slate-500">Create your first quiz to begin.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Quiz</th>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Questions</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                  <th className="px-5 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredQuizzes.map((quiz) => (
                  <tr className="hover:bg-slate-50" key={quiz.id}>
                    <td className="px-5 py-4">
                      <strong className="block text-slate-900">{quiz.title}</strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        {quiz.subject || "No subject"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-700">
                        {quiz.code}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{quiz.questionCount || 0}</td>
                    <td className="px-5 py-4">
                      <button
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          quiz.isActive
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                        onClick={() => toggleQuiz(quiz)}
                        type="button"
                      >
                        {quiz.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(quiz.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-3 text-sm font-semibold">
                        <Link className="text-blue-600 hover:text-blue-800" to={`/admin/quizzes/${quiz.id}`}>
                          Questions
                        </Link>
                        <Link className="text-blue-600 hover:text-blue-800" to={`/admin/quizzes/${quiz.id}/results`}>
                          Results
                        </Link>
                        <button className="text-red-600 hover:text-red-800" onClick={() => deleteQuiz(quiz)} type="button">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showCreateModal ? (
        <Modal title="Create New Quiz" onClose={() => setShowCreateModal(false)}>
          {error ? <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</div> : null}

          <form className="space-y-4" onSubmit={createQuiz}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="title">
                Quiz Title
              </label>
              <input
                className={inputClass}
                id="title"
                name="title"
                onChange={updateField}
                placeholder="Mathematics Chapter 1"
                required
                value={form.title}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="subject">
                Subject
              </label>
              <input
                className={inputClass}
                id="subject"
                name="subject"
                onChange={updateField}
                placeholder="Mathematics"
                value={form.subject}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="code">
                Quiz Code
              </label>
              <div className="flex gap-2">
                <input
                  className={`${inputClass} font-mono uppercase`}
                  id="code"
                  maxLength="24"
                  name="code"
                  onChange={updateField}
                  required
                  value={form.code}
                />
                <button
                  className="rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  type="button"
                  onClick={() => setForm((current) => ({ ...current, code: createQuizCode() }))}
                >
                  Generate
                </button>
              </div>
            </div>

            <div className="space-y-3 rounded-lg bg-slate-50 p-4">
              {[
                ["shuffleQuestions", "Shuffle question order"],
                ["shuffleOptions", "Shuffle answer options"],
              ].map(([name, label]) => (
                <label className="flex cursor-pointer items-center gap-3 text-sm text-slate-700" key={name}>
                  <input
                    checked={form[name]}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    name={name}
                    onChange={updateField}
                    type="checkbox"
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className="rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-700">
              On the Spark plan, scores are calculated only inside the admin Results page. Students receive a submission confirmation without the answer key.
            </p>

            <button
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Creating..." : "Create Quiz"}
            </button>
          </form>
        </Modal>
      ) : null}
    </AdminShell>
  );
}
