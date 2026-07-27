import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";
import Logo from "../assests/smit-logo.jpg";

const navClass = ({ isActive }) =>
  `block rounded-lg px-4 py-3 text-sm font-medium transition ${
    isActive
      ? "bg-blue-600 text-white"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
  }`;

export default function AdminShell({ title, subtitle, actions, children }) {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link className="flex h-24 items-center justify-center border-b border-slate-200 px-5" to="/admin">
          <img className="h-16 w-auto max-w-[190px] object-contain" src={Logo} alt="SMIT Logo" />
        </Link>

        <nav className="flex-1 space-y-2 p-4">
          <NavLink className={navClass} end to="/admin">
            Dashboard
          </NavLink>
          <NavLink className={navClass} end to="/">
            Student View
          </NavLink>
        </nav>

        <div className="border-t border-slate-200 p-4">
          <p className="mb-3 truncate text-xs text-slate-500" title={user?.email}>
            {user?.email}
          </p>
          <button
            className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={handleLogout}
            type="button"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <div className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6 lg:hidden">
          <Link to="/admin">
            <img className="h-14 w-auto max-w-[160px] object-contain" src={Logo} alt="SMIT Logo" />
          </Link>
          <div className="flex items-center gap-2">
            <Link className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" to="/">
              Student
            </Link>
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
              onClick={handleLogout}
              type="button"
            >
              Sign Out
            </button>
          </div>
        </div>

        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
          </header>

          {children}
        </main>
      </div>
    </div>
  );
}
