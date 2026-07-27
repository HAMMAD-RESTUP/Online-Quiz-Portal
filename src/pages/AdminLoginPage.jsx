import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import { readableError } from "../lib/helpers";
import Logo from "../assests/smit-logo.jpg";

export default function AdminLoginPage() {
  const { login, user, isAdmin, loading } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user && isAdmin) {
      navigate(location.state?.from || "/admin", { replace: true });
    }
  }, [isAdmin, loading, location.state, navigate, user]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email.trim(), password);
      navigate(location.state?.from || "/admin", { replace: true });
    } catch (loginError) {
      setError(readableError(loginError, "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex h-24 items-center justify-center border-b border-slate-200 bg-white">
        <Link to="/">
          <img className="h-16 w-auto max-w-[230px] object-contain sm:h-20" src={Logo} alt="SMIT Logo" />
        </Link>
      </header>

      <main className="flex min-h-[calc(100vh-96px)] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-md sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-900">Admin Login</h1>
            <p className="mt-2 text-sm text-slate-500">Sign in to manage quizzes and results.</p>
          </div>

          {error ? <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-700">{error}</div> : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
                Email Address
              </label>
              <input
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@example.com"
                required
                type="email"
                value={email}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
                Password
              </label>
              <input
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="password"
                minLength="6"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </div>

            <button
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <Link className="mt-5 block text-center text-sm font-medium text-blue-600 hover:text-blue-700" to="/">
            Back to Student Page
          </Link>
        </div>
      </main>
    </div>
  );
}
