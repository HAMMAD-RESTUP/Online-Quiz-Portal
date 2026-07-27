import { Link, useLocation } from "react-router-dom";
import Logo from "../assests/smit-logo.jpg";

export default function QuizCompletePage() {
  const location = useLocation();
  const result = location.state?.result;
  const quiz = location.state?.quiz;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex h-24 items-center justify-center border-b border-slate-200 bg-white">
        <img className="h-16 w-auto max-w-[230px] object-contain sm:h-20" src={Logo} alt="SMIT Logo" />
      </header>

      <main className="flex min-h-[calc(100vh-96px)] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 text-center shadow-md sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl font-bold text-green-700">
            ✓
          </div>

          <h1 className="mt-5 text-2xl font-bold text-slate-900">Quiz Completed</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {quiz?.title
              ? `${quiz.title} has been submitted successfully.`
              : "Your answers have been submitted successfully."}
          </p>

          {result?.showScore ? (
            <>
              <div className="mx-auto mt-6 flex h-32 w-32 flex-col items-center justify-center rounded-full border-8 border-blue-100 bg-blue-50">
                <strong className="text-3xl font-bold text-blue-700">{result.score}</strong>
                <span className="text-xs text-slate-500">out of {result.totalMarks}</span>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-green-50 p-3">
                  <strong className="block text-xl text-green-700">{result.correctCount}</strong>
                  <span className="text-xs text-slate-500">Correct</span>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <strong className="block text-xl text-red-700">{result.wrongCount}</strong>
                  <span className="text-xs text-slate-500">Wrong</span>
                </div>
                <div className="rounded-lg bg-slate-100 p-3">
                  <strong className="block text-xl text-slate-700">{result.skippedCount}</strong>
                  <span className="text-xs text-slate-500">Skipped</span>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-lg bg-slate-100 p-4 text-sm leading-6 text-slate-600">
              Your answers have been saved. The score is available to the admin in the Results page.
            </div>
          )}

          <Link
            className="mt-7 block w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
            to="/"
          >
            Return Home
          </Link>
        </div>
      </main>
    </div>
  );
}
