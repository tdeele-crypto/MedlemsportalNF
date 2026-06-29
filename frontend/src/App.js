import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LoginPage from "@/pages/LoginPage";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import MembersPage from "@/pages/MembersPage";
import MemberDetailPage from "@/pages/MemberDetailPage";
import EventsPage from "@/pages/EventsPage";
import EventDetailPage from "@/pages/EventDetailPage";
import QuickCheckInPage from "@/pages/QuickCheckInPage";
import UsersPage from "@/pages/UsersPage";
import PublicEventsPage from "@/pages/PublicEventsPage";

function ProtectedRoute({ children, adminOnly = false, allowEditor = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Indlæser...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly) {
    const isAdmin = user.role === "admin";
    const isEditor = allowEditor && user.role === "editor";
    if (!isAdmin && !isEditor) return <Navigate to="/arrangementer" replace />;
  }
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/p/:token" element={<PublicEventsPage />} />
          <Route
            path="/arrangementer/:id/check-in"
            element={
              <ProtectedRoute adminOnly allowEditor>
                <QuickCheckInPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route
              index
              element={
                <ProtectedRoute adminOnly>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="medlemmer"
              element={
                <ProtectedRoute adminOnly>
                  <MembersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="medlemmer/:id"
              element={
                <ProtectedRoute adminOnly>
                  <MemberDetailPage />
                </ProtectedRoute>
              }
            />
            <Route path="arrangementer" element={<EventsPage />} />
            <Route path="arrangementer/:id" element={<EventDetailPage />} />
            <Route
              path="brugere"
              element={
                <ProtectedRoute adminOnly>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
