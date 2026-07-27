import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedAdminRoute from "./components/ProtectedAdminRoute";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import QuizCompletePage from "./pages/QuizCompletePage";
import QuizEditorPage from "./pages/QuizEditorPage";
import QuizPage from "./pages/QuizPage";
import ResultsPage from "./pages/ResultsPage";
import StudentStartPage from "./pages/StudentStartPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StudentStartPage />} />
      <Route path="/quiz" element={<QuizPage />} />
      <Route path="/complete" element={<QuizCompletePage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedAdminRoute>
            <AdminDashboardPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/quizzes/:quizId"
        element={
          <ProtectedAdminRoute>
            <QuizEditorPage />
          </ProtectedAdminRoute>
        }
      />
      <Route
        path="/admin/quizzes/:quizId/results"
        element={
          <ProtectedAdminRoute>
            <ResultsPage />
          </ProtectedAdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
