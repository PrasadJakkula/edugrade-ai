import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileCheck2,
  BookOpenCheck,
  RefreshCw,
  Layers,
  BarChart3,
  FlaskConical,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { EvaloraLogo } from "./EvaloraLogo";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/grade-exam", label: "Grade Answer", icon: FileCheck2 },
  { to: "/rubrics", label: "Rubric Library", icon: BookOpenCheck },
  { to: "/regrade", label: "Instant Regrade", icon: RefreshCw },
  { to: "/batch", label: "Batch Grading", icon: Layers },
  { to: "/agreement", label: "Teacher Agreement", icon: BarChart3 },
  { to: "/evaluation", label: "Evaluation Lab", icon: FlaskConical },
  { to: "/settings", label: "Settings & Export", icon: Settings },
];

export function AppShell({
  title,
  breadcrumb,
  children,
}: {
  title: string;
  breadcrumb: string;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    document.title = `${title} · Evalora`;
  }, [title]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-[#0F1E33] text-slate-200">
      <div className="px-5 py-4 border-b border-slate-800/80 flex items-center justify-between">
        <Link to="/dashboard" aria-label="Evalora Dashboard">
          <EvaloraLogo theme="dark" size="sm" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden text-slate-400 hover:text-white"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-[#1D4ED8] text-white"
                    : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-slate-700 shrink-0 flex items-center justify-center text-xs font-semibold text-white">
            <img
              src="/src/assets/images/avatar_educator_profile_1794937044278.jpg"
              alt={user?.name || "Educator profile"}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-white truncate">{user?.name || "Teacher"}</div>
            <div className="text-[11px] text-slate-400 truncate">{user?.email}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800/90 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
        <div className="mt-3 pt-2.5 border-t border-slate-800/70 text-[10px] text-slate-400 text-center">
          Evalora · Smarter Grading. Fairer Evaluation.
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-[252px] shrink-0 border-r border-slate-200 sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-64 h-full shadow-xl">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-slate-500 truncate">{breadcrumb}</div>
              <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/grade-exam"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Grade Answer</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-[1320px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
