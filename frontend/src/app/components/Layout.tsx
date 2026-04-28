import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Home, BarChart3, ClipboardList, Settings, UserRound } from "lucide-react";
import { getSession, logout } from "../lib/auth";
import feedbackLogo from "./image/feedback_logo.png";
import {
  applyBrandingTheme,
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [branding, setBranding] = useState(() => getBrandingSettings());

  const session = getSession();
  const isAdmin = session?.role === "admin";
  const path = location.pathname;
  const isStaffRoute =
    path.includes("staff") ||
    path.includes("dashboard") ||
    path.includes("management") ||
    path.includes("ticket") ||
    path.includes("admin");
  const showHeaderActions = Boolean(session) && isStaffRoute;
  const showBottomNav =
    Boolean(session) &&
    [
      "/dashboard",
      "/staff",
      "/management",
      "/admin",
      "/admin/management-overview",
      "/admin/departments",
      "/admin/tickets",
      "/admin/users",
      "/admin/settings",
    ].includes(path);

  const isAdminShell = isAdmin && path.startsWith("/admin");

  useEffect(() => {
    applyBrandingTheme(branding);
  }, [branding]);

  useEffect(() => {
    void loadBrandingSettings();
    return onBrandingSettingsChange(() => {
      setBranding(getBrandingSettings());
    });
  }, []);

  const activePrimaryStyle = { color: branding.primaryColor };
  const activePrimaryBackgroundStyle = {
    backgroundColor: branding.primaryColor,
    color: "#ffffff",
  };
  const appLogo = branding.logoDataUrl || feedbackLogo;

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: branding.pageBackgroundColor }}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full max-w-[min(100%,1600px)] mx-auto px-3 sm:px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={appLogo}
                alt="MAPIMS feedback system"
                className="h-11 w-auto max-h-12 max-w-[min(160px,40vw)] shrink-0 object-contain sm:h-12 sm:max-w-[180px]"
              />
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-800">MAPIMS Hospital</h1>
                <p className="text-sm text-gray-500">Patient Feedback System</p>
              </div>
            </div>
            {(showHeaderActions || session) && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {showHeaderActions && (
                  <>
                {isAdminShell ? (
                  <nav
                    className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 shadow-sm"
                    role="tablist"
                    aria-label="Admin sections"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin"}
                      onClick={() => navigate("/admin")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin" ? activePrimaryStyle : undefined}
                    >
                      Analytics
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin/management-overview"}
                      onClick={() => navigate("/admin/management-overview")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/management-overview"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/management-overview" ? activePrimaryStyle : undefined}
                    >
                      Management
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin/departments"}
                      onClick={() => navigate("/admin/departments")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/departments"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/departments" ? activePrimaryStyle : undefined}
                    >
                      Departments
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin/tickets"}
                      onClick={() => navigate("/admin/tickets")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/tickets"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/tickets" ? activePrimaryStyle : undefined}
                    >
                      Tickets
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin/users"}
                      onClick={() => navigate("/admin/users")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/users"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/users" ? activePrimaryStyle : undefined}
                    >
                      Users
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin/settings"}
                      onClick={() => navigate("/admin/settings")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/settings"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/settings" ? activePrimaryStyle : undefined}
                    >
                      Settings
                    </button>
                  </nav>
                ) : isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate("/admin")}
                      className="px-4 py-2 text-white rounded-lg transition-all duration-200"
                      style={activePrimaryBackgroundStyle}
                    >
                      Analytics
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/admin/management-overview")}
                      className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                        path === "/admin/management-overview"
                          ? "border-[#2A6FDB] text-[#2A6FDB] bg-blue-50"
                          : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Management overview
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/management")}
                      className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                        path === "/management"
                          ? "border-[#2A6FDB] text-[#2A6FDB] bg-blue-50"
                          : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Operations
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => navigate("/feedback")}
                      className="px-4 py-2 text-white rounded-lg transition-all duration-200"
                      style={activePrimaryBackgroundStyle}
                    >
                      Submit feedback
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/management")}
                      className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                        path === "/management"
                          ? "border-[#2A6FDB] text-[#2A6FDB] bg-blue-50"
                          : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Management
                    </button>
                  </>
                )}
                {!isAdminShell && (
                  <button
                    type="button"
                    onClick={() => navigate("/welcome")}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all duration-200"
                  >
                    Patient View
                  </button>
                )}
                  </>
                )}
                {session && (
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all duration-200"
                  >
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content — wider canvas so dashboards use horizontal space */}
      <main className="flex-1 w-full max-w-[min(100%,1600px)] mx-auto px-3 sm:px-5 py-6">
        <Outlet />
      </main>

      {/* Bottom Navigation - Only for staff views */}
      {showBottomNav && (
        <nav className="bg-white border-t border-gray-200 shadow-lg md:hidden">
          <div className="flex justify-around items-center h-16">
            {isAdmin ? (
              <div className="flex w-full justify-around overflow-x-auto">
                <button
                  type="button"
                  onClick={() => navigate("/admin")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin" ? activePrimaryStyle : undefined}
                >
                  <Home size={22} />
                  <span className="text-[10px] sm:text-xs">Analytics</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/management-overview")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/management-overview" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/management-overview" ? activePrimaryStyle : undefined}
                >
                  <BarChart3 size={22} />
                  <span className="text-[10px] sm:text-xs">Mgmt</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/departments")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/departments" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/departments" ? activePrimaryStyle : undefined}
                >
                  <ClipboardList size={22} />
                  <span className="text-[10px] sm:text-xs">Depts</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/users")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/users" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/users" ? activePrimaryStyle : undefined}
                >
                  <UserRound size={22} />
                  <span className="text-[10px] sm:text-xs">Users</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/tickets")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/tickets" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/tickets" ? activePrimaryStyle : undefined}
                >
                  <ClipboardList size={22} />
                  <span className="text-[10px] sm:text-xs">Tickets</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/settings")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/settings" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/settings" ? activePrimaryStyle : undefined}
                >
                  <Settings size={22} />
                  <span className="text-[10px] sm:text-xs">Settings</span>
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/management")}
                  className={`flex flex-col items-center gap-1 px-4 py-2 ${
                    path === "/management" || path === "/staff" || path === "/dashboard"
                      ? ""
                      : "text-gray-500"
                  }`}
                  style={
                    path === "/management" || path === "/staff" || path === "/dashboard"
                      ? activePrimaryStyle
                      : undefined
                  }
                >
                  <Home size={24} />
                  <span className="text-xs">Management</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/feedback")}
                  className={`flex flex-col items-center gap-1 px-4 py-2 ${
                    path === "/feedback" ? "" : "text-gray-500"
                  }`}
                  style={path === "/feedback" ? activePrimaryStyle : undefined}
                >
                  <ClipboardList size={24} />
                  <span className="text-xs">Feedback</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/welcome")}
                  className="flex flex-col items-center gap-1 px-4 py-2 text-gray-500"
                >
                  <UserRound size={24} />
                  <span className="text-xs">Patient</span>
                </button>
              </>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

