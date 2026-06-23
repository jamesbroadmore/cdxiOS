import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { Toaster } from "@/components/ui/sonner";
import ErrorBoundary from "@/components/ErrorBoundary";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Projects from "@/pages/Projects";
import Billing from "@/pages/Billing";
import Contracts from "@/pages/Contracts";
import AgentOps from "@/pages/AgentOps";
import Settings from "@/pages/Settings";
import PaymentStatus from "@/pages/PaymentStatus";

function Protected({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-indigo-400" />
          <span className="text-sm font-mono tracking-widest uppercase text-zinc-500">Booting OS…</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientDetail />} />
                <Route path="/projects" element={<Projects />} />
                <Route path="/billing" element={<Billing />} />
                <Route path="/contracts" element={<Contracts />} />
                <Route path="/agents" element={<AgentOps />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/payment-status" element={<PaymentStatus />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </Protected>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <ErrorBoundary>
        <BrowserRouter>
          <ThemeProvider>
            <AuthProvider>
              <AppRoutes />
              <Toaster
                theme="dark"
                position="top-right"
                toastOptions={{
                  style: {
                    background: "#18181b",
                    border: "1px solid #3f3f46",
                    color: "#ffffff",
                    borderRadius: "8px",
                    fontFamily: "Inter, sans-serif",
                    fontSize: "13px",
                  },
                }}
              />
            </AuthProvider>
          </ThemeProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </div>
  );
}
