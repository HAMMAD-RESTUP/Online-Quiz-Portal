import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminShell from "../components/AdminShell";
import Modal from "../components/Modal";
import { db } from "../lib/firebase";
import { readableError } from "../lib/helpers";

const emptyQuestion = {
  text: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  timeLimitSec: 30,
  marks: 1,
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export default function QuizEditorPage() {
  const { quizId } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [form, setForm] = useState(emptyQuestion);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getDoc(doc(db, "quizzes", quizId))
      .then((snapshot) => {
        if (!snapshot.exists()) throw new Error("Quiz not found.");
        if (!cancelled) setQuiz({ id: snapshot.id, ...snapshot.data() });
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(readableError(loadError, "Unable to load quiz."));
        }
      });

    const questionsQuery = query(
      collection(db, "quizzes", quizId, "questions"),
      orderBy("order", "asc"),
    );

    const unsubscribe = onSnapshot(
      questionsQuery,
      async (snapshot) => {
        try {
          const answerKeysSnapshot = await getDocs(
            collection(db, "quizzes", quizId, "answerKeys"),
          );
          const answerKeyMap = new Map(
            answerKeysSnapshot.docs.map((keyDoc) => [
              keyDoc.id,
              Number(keyDoc.data().correctIndex),
            ]),
          );
          const migrationBatch = writeBatch(db);
          let needsMigration = false;

          const rows = snapshot.docs.map((questionDoc) => {
            const question = questionDoc.data();
            const storedKey = answerKeyMap.get(questionDoc.id);
            const legacyKey = Number(question.correctIndex);
            const storedKeyIsValid =
              Number.isInteger(storedKey) && storedKey >= 0 && storedKey <= 3;
            const legacyKeyIsValid =
              Number.isInteger(legacyKey) && legacyKey >= 0 && legacyKey <= 3;
            const correctIndex = storedKeyIsValid
              ? storedKey
              : legacyKeyIsValid
                ? legacyKey
                : 0;

            const needsPublicMigration = question.studentReadable !== true;

            if (legacyKeyIsValid || needsPublicMigration) {
              needsMigration = true;
              if (legacyKeyIsValid) {
                migrationBatch.set(
                doc(db, "quizzes", quizId, "answerKeys", questionDoc.id),
                {
                  correctIndex: legacyKey,
                  updatedAt: serverTimestamp(),
                },
                  { merge: true },
                );
              }
              migrationBatch.update(questionDoc.ref, {
                studentReadable: true,
                ...(legacyKeyIsValid ? { correctIndex: deleteField() } : {}),
                updatedAt: serverTimestamp(),
              });
            }

            return {
              id: questionDoc.id,
              ...question,
              correctIndex,
            };
          });

          if (needsMigration) {
            migrationBatch.set(
              doc(db, "quizzes", quizId),
              {
                sparkSchemaVersion: 1,
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
            await migrationBatch.commit();
          }

          if (!cancelled) {
            setQuestions(rows);
            setLoading(false);
          }
        } catch (snapshotError) {
          if (!cancelled) {
            setError(
              readableError(snapshotError, "Unable to load questions."),
            );
            setLoading(false);
          }
        }
      },
      (snapshotError) => {
        if (!cancelled) {
          setError(readableError(snapshotError, "Unable to load questions."));
          setLoading(false);
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [quizId]);

  const totalMarks = useMemo(
    () => questions.reduce((sum, question) => sum + (Number(question.marks) || 0), 0),
    [questions],
  );

  function openAddQuestion() {
    setEditingQuestionId(null);
    setForm({ ...emptyQuestion, options: [...emptyQuestion.options] });
    setError("");
    setShowQuestionModal(true);
  }

  function openEditQuestion(question) {
    setEditingQuestionId(question.id);
    setForm({
      text: question.text || "",
      options: Array.isArray(question.options) ? [...question.options] : ["", "", "", ""],
      correctIndex: Number(question.correctIndex) || 0,
      timeLimitSec: Number(question.timeLimitSec) || 30,
      marks: Number(question.marks) || 1,
    });
    setError("");
    setShowQuestionModal(true);
  }

  function updateOption(index, value) {
    setForm((current) => {
      const nextOptions = [...current.options];
      nextOptions[index] = value;
      return { ...current, options: nextOptions };
    });
  }

  async function saveQuestion(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (!form.text.trim()) {
        throw new Error("Question text is required.");
      }

      if (form.options.some((option) => !option.trim())) {
        throw new Error("All four options are required.");
      }

      const correctIndex = Number(form.correctIndex);
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        throw new Error("Select one valid correct option.");
      }

      const publicPayload = {
        text: form.text.trim(),
        options: form.options.map((option) => option.trim()),
        timeLimitSec: Math.max(5, Number(form.timeLimitSec) || 30),
        marks: Math.max(1, Number(form.marks) || 1),
        studentReadable: true,
        updatedAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      let questionRef;

      if (editingQuestionId) {
        questionRef = doc(
          db,
          "quizzes",
          quizId,
          "questions",
          editingQuestionId,
        );
        batch.update(questionRef, {
          ...publicPayload,
          correctIndex: deleteField(),
        });
      } else {
        const maxOrder = questions.reduce(
          (max, question) => Math.max(max, Number(question.order) || 0),
          0,
        );
        questionRef = doc(collection(db, "quizzes", quizId, "questions"));
        batch.set(questionRef, {
          ...publicPayload,
          order: maxOrder + 1,
          createdAt: serverTimestamp(),
        });
        batch.update(doc(db, "quizzes", quizId), {
          questionCount: questions.length + 1,
          sparkSchemaVersion: 1,
          updatedAt: serverTimestamp(),
        });
      }

      batch.set(
        doc(db, "quizzes", quizId, "answerKeys", questionRef.id),
        {
          correctIndex,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await batch.commit();

      if (!editingQuestionId) {
        setQuiz((current) =>
          current ? { ...current, questionCount: questions.length + 1 } : current,
        );
      }

      setShowQuestionModal(false);
    } catch (saveError) {
      setError(readableError(saveError, "Unable to save question."));
    } finally {
      setSaving(false);
    }
  }

  async function removeQuestion(question) {
    if (!window.confirm(`Delete question ${question.order}?`)) return;

    try {
      const nextCount = Math.max(0, questions.length - 1);
      const batch = writeBatch(db);
      batch.delete(doc(db, "quizzes", quizId, "questions", question.id));
      batch.delete(doc(db, "quizzes", quizId, "answerKeys", question.id));
      batch.update(doc(db, "quizzes", quizId), {
        questionCount: nextCount,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setQuiz((current) =>
        current ? { ...current, questionCount: nextCount } : current,
      );
    } catch (deleteError) {
      setError(readableError(deleteError, "Unable to delete question."));
    }
  }

  return (
    <AdminShell
      title={quiz?.title || "Quiz Questions"}
      subtitle={
        quiz
          ? `Code: ${quiz.code} • ${questions.length} questions • ${totalMarks} marks`
          : "Manage quiz questions."
      }
      actions={
        <>
          <Link
            className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            to="/admin"
          >
            Dashboard
          </Link>
          <button
            className="rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={openAddQuestion}
            type="button"
          >
            + Add Question
          </button>
        </>
      }
    >
      {error && !showQuestionModal ? (
        <div className="mb-5 rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Questions</h2>
            <p className="mt-1 text-sm text-slate-500">Correct answers are stored in an admin-only collection for Spark-plan use.</p>
          </div>
          {quiz ? (
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                quiz.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {quiz.isActive ? "Quiz Active" : "Quiz Inactive"}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Loading questions...</div>
        ) : questions.length === 0 ? (
          <div className="p-10 text-center">
            <h3 className="font-semibold text-slate-900">No questions yet</h3>
            <p className="mt-1 text-sm text-slate-500">Add the first question to continue.</p>
            <button
              className="mt-5 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              onClick={openAddQuestion}
              type="button"
            >
              Add First Question
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {questions.map((question, index) => (
              <article className="p-5 sm:p-6" key={question.id}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                    {index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-6 text-slate-900">{question.text}</h3>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {question.options?.map((option, optionIndex) => {
                        const isCorrect = optionIndex === Number(question.correctIndex);
                        return (
                          <div
                            className={`rounded-lg border px-3 py-2.5 text-sm ${
                              isCorrect
                                ? "border-green-300 bg-green-50 font-medium text-green-800"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                            key={`${question.id}-${optionIndex}`}
                          >
                            <span className="mr-2 font-bold">{String.fromCharCode(65 + optionIndex)}.</span>
                            {option}
                            {isCorrect ? " ✓" : ""}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                      <span className="rounded-full bg-slate-100 px-3 py-1.5">
                        {question.timeLimitSec || 30} seconds
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1.5">
                        {question.marks || 1} {(question.marks || 1) === 1 ? "mark" : "marks"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-3 sm:flex-col">
                    <button
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                      onClick={() => openEditQuestion(question)}
                      type="button"
                    >
                      Edit
                    </button>
                    <button
                      className="text-sm font-semibold text-red-600 hover:text-red-800"
                      onClick={() => removeQuestion(question)}
                      type="button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {showQuestionModal ? (
        <Modal
          title={editingQuestionId ? "Edit Question" : "Add Question"}
          onClose={() => setShowQuestionModal(false)}
        >
          {error ? <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</div> : null}

          <form className="space-y-5" onSubmit={saveQuestion}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="questionText">
                Question
              </label>
              <textarea
                className={inputClass}
                id="questionText"
                maxLength="1000"
                onChange={(event) =>
                  setForm((current) => ({ ...current, text: event.target.value }))
                }
                placeholder="Write the question here"
                required
                rows="4"
                value={form.text}
              />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Answer Options</p>
              <div className="space-y-3">
                {form.options.map((option, index) => (
                  <label
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      Number(form.correctIndex) === index
                        ? "border-green-400 bg-green-50"
                        : "border-slate-200"
                    }`}
                    key={index}
                  >
                    <input
                      checked={Number(form.correctIndex) === index}
                      className="h-4 w-4 text-green-600 focus:ring-green-500"
                      name="correctIndex"
                      onChange={() =>
                        setForm((current) => ({ ...current, correctIndex: index }))
                      }
                      type="radio"
                    />
                    <span className="w-5 text-sm font-bold text-slate-600">
                      {String.fromCharCode(65 + index)}
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                      onChange={(event) => updateOption(index, event.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + index)}`}
                      required
                      value={option}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Select the radio button beside the correct answer.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="timeLimitSec">
                  Time in Seconds
                </label>
                <input
                  className={inputClass}
                  id="timeLimitSec"
                  min="5"
                  max="3600"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timeLimitSec: event.target.value }))
                  }
                  required
                  type="number"
                  value={form.timeLimitSec}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="marks">
                  Marks
                </label>
                <input
                  className={inputClass}
                  id="marks"
                  min="1"
                  max="100"
                  onChange={(event) =>
                    setForm((current) => ({ ...current, marks: event.target.value }))
                  }
                  required
                  type="number"
                  value={form.marks}
                />
              </div>
            </div>

            <button
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Saving..." : editingQuestionId ? "Update Question" : "Add Question"}
            </button>
          </form>
        </Modal>
      ) : null}
    </AdminShell>
  );
}
