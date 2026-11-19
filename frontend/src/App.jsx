import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./lib/auth";
import { FocusProvider } from "./lib/focus";
import Layout from "./components/Layout";
import { PageLoader, Spinner } from "./components/ui";
import AuthPage from "./pages/Auth";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Subjects = lazy(() => import("./pages/Subjects"));
const Exams = lazy(() => import("./pages/Exams"));
const SubjectDetail = lazy(() => import("./pages/SubjectDetail"));
const Planner = lazy(() => import("./pages/Planner"));
const Tutor = lazy(() => import("./pages/Tutor"));
const Quizzes = lazy(() => import("./pages/Quizzes"));
const QuizPlay = lazy(() => import("./pages/QuizPlay"));
const Flashcards = lazy(() => import("./pages/Flashcards"));
const Focus = lazy(() => import("./pages/Focus"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));

function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-app">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }
  if (!user) return <AuthPage />;
  return (
    <FocusProvider>
      <Layout />
    </FocusProvider>
  );
}

const page = (el) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Protected />}>
            <Route index element={page(<Dashboard />)} />
            <Route path="subjects" element={page(<Subjects />)} />
            <Route path="exams" element={page(<Exams />)} />
            <Route path="subjects/:id" element={page(<SubjectDetail />)} />
            <Route path="planner" element={page(<Planner />)} />
            <Route path="tutor" element={page(<Tutor />)} />
            <Route path="tutor/:threadId" element={page(<Tutor />)} />
            <Route path="quiz" element={page(<Quizzes />)} />
            <Route path="quiz/:id" element={page(<QuizPlay />)} />
            <Route path="flashcards" element={page(<Flashcards />)} />
            <Route path="focus" element={page(<Focus />)} />
            <Route path="analytics" element={page(<Analytics />)} />
            <Route path="settings" element={page(<Settings />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <Toaster position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
      </AuthProvider>
    </BrowserRouter>
  );
}
