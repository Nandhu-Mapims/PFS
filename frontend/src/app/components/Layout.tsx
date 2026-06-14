import React, { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { Home, BarChart3, Building2, ClipboardList, Settings, UserRound } from "lucide-react";
import { getSession, logout } from "../lib/auth";
import feedbackLogo from "./image/feedback_logo.png";
import {
  applyBrandingTheme,
  getBrandingSettings,
  loadBrandingSettings,
  onBrandingSettingsChange,
} from "../lib/branding";
import { FeedbackOutboxStatus } from "./FeedbackOutboxStatus";
import { MOBILE_NETWORK_BAR_OFFSET_CLASS, NetworkStatusIndicator } from "./NetworkStatusIndicator";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [branding, setBranding] = useState(() => getBrandingSettings());

  const session = getSession();
  const isAdmin = session?.role === "admin";
  const path = location.pathname;
  const isPatientFeedbackArea = path === "/feedback" || path.startsWith("/feedback/");
  const isPatientKioskScreen =
    path === "/welcome" || path === "/thank-you" || isPatientFeedbackArea;
  const isStaffRoute =
    path.includes("staff") ||
    path.includes("dashboard") ||
    path.includes("management") ||
    path.includes("analytics") ||
    path.includes("ticket") ||
    path.includes("admin");
  const showHeaderActions = Boolean(session) && isStaffRoute;
  const onInsightsArea =
    path.startsWith("/management") ||
    path === "/analytics" ||
    path === "/insights" ||
    path.startsWith("/admin/management-overview") ||
    path === "/admin/insights" ||
    path === "/admin/analytics";

  const showBottomNav =
    Boolean(session) &&
    (onInsightsArea ||
      [
        "/dashboard",
        "/staff",
        "/admin",
        "/admin/departments",
        "/admin/services",
        "/admin/tickets",
        "/admin/users",
        "/admin/settings",
        "/admin/bot-conversation",
      ].includes(path));

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
    <div
      className={`min-h-screen flex flex-col ${MOBILE_NETWORK_BAR_OFFSET_CLASS}`}
      style={{ backgroundColor: branding.pageBackgroundColor }}
    >
      <NetworkStatusIndicator variant="mobile-fixed" />
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="w-full max-w-[min(100%,1600px)] mx-auto px-3 sm:px-5 py-3 lg:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
              <img
                src={appLogo}
                alt="MAPIMS feedback system"
                className="h-10 w-auto max-h-11 max-w-[min(140px,36vw)] shrink-0 object-contain sm:h-11 lg:h-12 lg:max-w-[180px]"
              />
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-gray-800 sm:text-xl">MAPIMS Hospital</h1>
                <p className="truncate text-xs text-gray-500 sm:text-sm">Patient Feedback System</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <NetworkStatusIndicator variant="inline" />
              {(showHeaderActions || (session && !isPatientKioskScreen)) && (
                <>
                {showHeaderActions && (
                  <>
                {isAdminShell ? (
                  <nav
                    className="hidden md:inline-flex flex-wrap items-center gap-1 rounded-xl border border-gray-200 bg-gray-100/80 p-1 shadow-sm"
                    role="tablist"
                    aria-label="Admin sections"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={onInsightsArea}
                      onClick={() => navigate("/admin/management-overview/submissions")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        onInsightsArea
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={onInsightsArea ? activePrimaryStyle : undefined}
                    >
                      Insights
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path === "/admin" || path === "/admin/delete"}
                      onClick={() => navigate("/admin")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin" || path === "/admin/delete"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin" || path === "/admin/delete" ? activePrimaryStyle : undefined}
                    >
                      Overview
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
                      aria-selected={path === "/admin/services"}
                      onClick={() => navigate("/admin/services")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/services"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/services" ? activePrimaryStyle : undefined}
                    >
                      Services
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={path.startsWith("/admin/tickets")}
                      onClick={() => navigate("/admin/tickets")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path.startsWith("/admin/tickets")
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path.startsWith("/admin/tickets") ? activePrimaryStyle : undefined}
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
                      aria-selected={path === "/admin/bot-conversation"}
                      onClick={() => navigate("/admin/bot-conversation")}
                      className={`rounded-lg px-3 py-2 text-xs sm:text-sm font-semibold transition-all ${
                        path === "/admin/bot-conversation"
                          ? "bg-white shadow-sm"
                          : "text-gray-600 hover:text-gray-900"
                      }`}
                      style={path === "/admin/bot-conversation" ? activePrimaryStyle : undefined}
                    >
                      Bot Q&amp;A
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
                      onClick={() => navigate("/admin/management-overview/submissions")}
                      className="px-4 py-2 text-white rounded-lg transition-all duration-200"
                      style={activePrimaryBackgroundStyle}
                    >
                      Insights
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/management/submissions")}
                      className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                        onInsightsArea
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
                      onClick={() => navigate("/management/submissions")}
                      className={`px-4 py-2 rounded-lg border transition-all duration-200 ${
                        onInsightsArea
                          ? "border-[#2A6FDB] text-[#2A6FDB] bg-blue-50"
                          : "border-gray-300 text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      Insights
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
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content — wider canvas so dashboards use horizontal space */}
      <main
        className={`flex-1 w-full max-w-[min(100%,1600px)] mx-auto px-3 sm:px-5 py-6 ${
          showBottomNav ? "pb-24 md:pb-6" : ""
        }`}
      >
        {isPatientKioskScreen && <FeedbackOutboxStatus />}
        <Outlet />
      </main>

      {/* Bottom Navigation - Only for staff views */}
      {showBottomNav && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-lg md:hidden">
          <div className="flex justify-around items-center h-16">
            {isAdmin ? (
              <div className="flex w-full justify-around overflow-x-auto">
                <button
                  type="button"
                  onClick={() => navigate("/admin/management-overview/submissions")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    onInsightsArea ? "" : "text-gray-500"
                  }`}
                  style={onInsightsArea ? activePrimaryStyle : undefined}
                >
                  <BarChart3 size={22} />
                  <span className="text-[10px] sm:text-xs">Insights</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin" || path === "/admin/delete" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin" || path === "/admin/delete" ? activePrimaryStyle : undefined}
                >
                  <Home size={22} />
                  <span className="text-[10px] sm:text-xs">Overview</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/departments")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/departments" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/departments" ? activePrimaryStyle : undefined}
                >
                  <Building2 size={22} />
                  <span className="text-[10px] sm:text-xs">Depts</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/admin/services")}
                  className={`flex flex-col items-center gap-1 px-2 py-2 shrink-0 ${
                    path === "/admin/services" ? "" : "text-gray-500"
                  }`}
                  style={path === "/admin/services" ? activePrimaryStyle : undefined}
                >
                  <Building2 size={22} />
                  <span className="text-[10px] sm:text-xs">Services</span>
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
                    path.startsWith("/admin/tickets") ? "" : "text-gray-500"
                  }`}
                  style={path.startsWith("/admin/tickets") ? activePrimaryStyle : undefined}
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
                  onClick={() => navigate("/management/submissions")}
                  className={`flex flex-col items-center gap-1 px-4 py-2 ${
                    onInsightsArea || path === "/staff" || path === "/dashboard"
                      ? ""
                      : "text-gray-500"
                  }`}
                  style={
                    onInsightsArea || path === "/staff" || path === "/dashboard"
                      ? activePrimaryStyle
                      : undefined
                  }
                >
                  <BarChart3 size={24} />
                  <span className="text-xs">Insights</span>
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/feedback")}
                  className={`flex flex-col items-center gap-1 px-4 py-2 ${
                    isPatientFeedbackArea ? "" : "text-gray-500"
                  }`}
                  style={isPatientFeedbackArea ? activePrimaryStyle : undefined}
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

