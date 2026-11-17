import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { DashboardPage } from "./pages/DashboardPage";
import { RubricsPage } from "./pages/RubricsPage";
import { GradeSinglePage } from "./pages/GradeSinglePage";
import { ResultDetailPage } from "./pages/ResultDetailPage";
import { RegradeStudioPage } from "./pages/RegradeStudioPage";
import { BatchGradingPage } from "./pages/BatchGradingPage";
import { AgreementPage } from "./pages/AgreementPage";
import { EvaluationLabPage } from "./pages/EvaluationLabPage";
import { SettingsPage } from "./pages/SettingsPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/rubrics"
              element={
                <ProtectedRoute>
                  <RubricsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/grade-exam"
              element={
                <ProtectedRoute>
                  <GradeSinglePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/results/:id"
              element={
                <ProtectedRoute>
                  <ResultDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/regrade"
              element={
                <ProtectedRoute>
                  <RegradeStudioPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/batch"
              element={
                <ProtectedRoute>
                  <BatchGradingPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/agreement"
              element={
                <ProtectedRoute>
                  <AgreementPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/evaluation"
              element={
                <ProtectedRoute>
                  <EvaluationLabPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
