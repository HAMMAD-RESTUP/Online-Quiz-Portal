import { signInAnonymously, signOut } from "firebase/auth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase";
import { readableError } from "../lib/helpers";
import { startQuizAttempt } from "../lib/quizApi";
import Logo from "../assests/smit-logo.jpg";

export default function StudentStartPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    quizCode: "",
    studentName: "",
    rollNumber: "",
  });

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]:
        name === "quizCode"
          ? value.toUpperCase().replace(/\s/g, "")
          : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        // Fullscreen block ho to bhi quiz chalega.
      }

      let studentUser = auth.currentUser;

      if (!studentUser || !studentUser.isAnonymous) {
        if (studentUser) {
          await signOut(auth);
        }

        const credential = await signInAnonymously(auth);
        studentUser = credential.user;
      }

      // Make sure the anonymous ID token is ready before the callable request.
      await studentUser.getIdToken(true);

      const attempt = await startQuizAttempt(form);

      sessionStorage.setItem(
        "activeQuizAttemptId",
        attempt.attemptId
      );

      sessionStorage.setItem("activeQuizStarted", "true");

      if (attempt.done) {
        navigate("/complete", {
          replace: true,
          state: {
            result: attempt.result,
            quiz: attempt.quiz,
          },
        });

        return;
      }

      navigate("/quiz", {
        replace: true,
        state: attempt,
      });
    } catch (submitError) {
      try {
        await document.exitFullscreen?.();
      } catch {
        // Ignore fullscreen error.
      }

      setError(
        readableError(
          submitError,
          "Unable to start this quiz."
        )
      );

      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <header className="flex h-24 items-center justify-center border-b border-slate-200 bg-white">
        <img
          className="h-16 w-auto max-w-[230px] object-contain sm:h-20"
          src={Logo}
          alt="SMIT Logo"
        />
      </header>

      {/* Form Card */}
      <main className="flex min-h-[calc(100vh-96px)] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-md sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900">
              Start Your Quiz
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Enter your details to continue.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label
                className="mb-1 block text-sm font-medium text-slate-700"
                htmlFor="quizCode"
              >
                Quiz Code
              </label>

              <input
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="quizCode"
                name="quizCode"
                maxLength="24"
                placeholder="Example: MATH10"
                value={form.quizCode}
                onChange={updateField}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium text-slate-700"
                htmlFor="studentName"
              >
                Student Name
              </label>

              <input
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="studentName"
                name="studentName"
                maxLength="80"
                placeholder="Enter your full name"
                value={form.studentName}
                onChange={updateField}
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label
                className="mb-1 block text-sm font-medium text-slate-700"
                htmlFor="rollNumber"
              >
                Roll Number
              </label>

              <input
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="rollNumber"
                name="rollNumber"
                maxLength="40"
                placeholder="Enter your roll number"
                value={form.rollNumber}
                onChange={updateField}
                autoComplete="off"
                required
              />
            </div>

            <button
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Starting..." : "Start Quiz"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}