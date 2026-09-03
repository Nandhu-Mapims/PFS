import { createBrowserRouter, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { LoginPage } from "./components/LoginPage";
import { AdminGuard, RequireCapability, StaffGuard } from "./components/RouteGuards";

/**
 * Only the shell, the guards and the landing route are bundled eagerly. Every
 * screen below is fetched on first navigation, so a patient opening the kiosk no
 * longer downloads the admin console, the Recharts dashboards or the xlsx
 * exporter before anything renders.
 */

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: LoginPage },
      { path: "login", Component: LoginPage },

      {
        path: "welcome",
        lazy: async () => ({ Component: (await import("./components/Welcome")).Welcome }),
      },
      {
        path: "feedback/give",
        lazy: async () => ({
          Component: (await import("./components/FeedbackForm")).FeedbackForm,
        }),
      },
      {
        path: "feedback/bot",
        lazy: async () => ({
          Component: (await import("./components/BotConversationFeedback"))
            .BotConversationFeedback,
        }),
      },
      { path: "feedback/review", element: <Navigate to="/feedback/give" replace /> },
      {
        path: "feedback",
        lazy: async () => ({
          Component: (await import("./components/FeedbackMode")).FeedbackMode,
        }),
      },
      {
        path: "paper-upload",
        lazy: async () => ({
          Component: (await import("./components/PaperUpload")).PaperUpload,
        }),
      },
      {
        path: "thank-you",
        lazy: async () => ({ Component: (await import("./components/ThankYou")).ThankYou }),
      },
      { path: "feedback-mode", element: <Navigate to="/feedback" replace /> },
      { path: "feedback-form", element: <Navigate to="/feedback/give" replace /> },
      { path: "voice-feedback", element: <Navigate to="/feedback/give?mode=voice" replace /> },
      { path: "bot-feedback", element: <Navigate to="/feedback/bot" replace /> },

      { path: "userfeed", element: <Navigate to="/welcome" replace /> },
      { path: "userfeed/mode", element: <Navigate to="/feedback" replace /> },
      { path: "userfeed/give", element: <Navigate to="/feedback/give" replace /> },
      { path: "userfeed/bot", element: <Navigate to="/feedback/bot" replace /> },
      { path: "userfeed/paper", element: <Navigate to="/paper-upload" replace /> },
      { path: "userfeed/thank-you", element: <Navigate to="/thank-you" replace /> },

      {
        Component: StaffGuard,
        children: [
          {
            path: "staff",
            lazy: async () => ({
              Component: (await import("./components/Dashboard")).Dashboard,
            }),
          },
          {
            path: "dashboard",
            lazy: async () => ({
              Component: (await import("./components/Dashboard")).Dashboard,
            }),
          },
          {
            path: "ticket/:id",
            lazy: async () => ({
              Component: (await import("./components/TicketDetail")).TicketDetail,
            }),
          },
          {
            path: "ticket/:id/delete",
            lazy: async () => ({
              Component: (await import("./components/TicketDetail")).TicketDetail,
            }),
          },
          {
            // Pathless layout route: gates every /management screen on
            // insights.view without adding a URL segment.
            element: <RequireCapability anyOf={["insights.view"]} />,
            children: [
              {
                path: "management",
                lazy: async () => ({
                  Component: (await import("./components/insights/InsightsHub")).InsightsHub,
                }),
                children: [
              {
                path: "overview",
                lazy: async () => ({
                  Component: (await import("./components/insights/ManagementOverviewRoute"))
                    .ManagementOverviewRoute,
                }),
              },
              {
                path: "submissions",
                lazy: async () => ({
                  Component: (await import("./components/insights/SubmissionTrendsRoute"))
                    .SubmissionTrendsRoute,
                }),
              },
              {
                path: "tickets",
                lazy: async () => ({
                  Component: (await import("./components/insights/TicketsTrendsRoute"))
                    .TicketsTrendsRoute,
                }),
              },
              {
                path: "sentiment",
                lazy: async () => ({
                  Component: (await import("./components/insights/SentimentLeaderboardRoute"))
                    .SentimentLeaderboardRoute,
                }),
              },
              {
                path: "summary-report",
                lazy: async () => ({
                  Component: (await import("./components/insights/SummaryReportRoute"))
                    .SummaryReportRoute,
                }),
              },
                ],
              },
            ],
          },
          { path: "analytics", element: <Navigate to="/management/submissions" replace /> },
          { path: "insights", element: <Navigate to="/management/submissions" replace /> },
          {
            path: "workflow",
            lazy: async () => ({
              Component: (await import("./components/WorkflowDiagram")).WorkflowDiagram,
            }),
          },
        ],
      },
      {
        Component: AdminGuard,
        children: [
          {
            path: "admin/management-overview",
            lazy: async () => ({
              Component: (await import("./components/insights/InsightsHub")).InsightsHub,
            }),
            children: [
              {
                path: "overview",
                lazy: async () => ({
                  Component: (await import("./components/insights/ManagementOverviewRoute"))
                    .ManagementOverviewRoute,
                }),
              },
              {
                path: "submissions",
                lazy: async () => ({
                  Component: (await import("./components/insights/SubmissionTrendsRoute"))
                    .SubmissionTrendsRoute,
                }),
              },
              {
                path: "tickets",
                lazy: async () => ({
                  Component: (await import("./components/insights/TicketsTrendsRoute"))
                    .TicketsTrendsRoute,
                }),
              },
              {
                path: "sentiment",
                lazy: async () => ({
                  Component: (await import("./components/insights/SentimentLeaderboardRoute"))
                    .SentimentLeaderboardRoute,
                }),
              },
              {
                path: "summary-report",
                lazy: async () => ({
                  Component: (await import("./components/insights/SummaryReportRoute"))
                    .SummaryReportRoute,
                }),
              },
            ],
          },
          {
            path: "admin/insights",
            element: <Navigate to="/admin/management-overview/submissions" replace />,
          },
          {
            path: "admin/analytics",
            element: <Navigate to="/admin/management-overview/submissions" replace />,
          },
          {
            path: "admin/departments",
            lazy: async () => ({
              Component: (await import("./components/AdminHospitalDepartmentsPage"))
                .AdminHospitalDepartmentsPage,
            }),
          },
          {
            path: "admin/services",
            lazy: async () => ({
              Component: (await import("./components/AdminServicesPage")).AdminServicesPage,
            }),
          },
          {
            path: "admin/users",
            lazy: async () => ({
              Component: (await import("./components/AdminUsersPage")).AdminUsersPage,
            }),
          },
          {
            path: "admin/roles",
            lazy: async () => ({
              Component: (await import("./components/AdminRolesPage")).AdminRolesPage,
            }),
          },
          { path: "admin/usercreation", element: <Navigate to="/admin/users" replace /> },
          { path: "usercreation", element: <Navigate to="/admin/users" replace /> },
          { path: "manage/access", element: <Navigate to="/admin/users" replace /> },
          {
            path: "admin/tickets",
            lazy: async () => ({
              Component: (await import("./components/AdminTicketsPage")).AdminTicketsPage,
            }),
          },
          {
            path: "admin/tickets/delete",
            lazy: async () => ({
              Component: (await import("./components/AdminTicketsPage")).AdminTicketsPage,
            }),
          },
          {
            path: "admin/settings",
            lazy: async () => ({
              Component: (await import("./components/AdminSettingsPage")).AdminSettingsPage,
            }),
          },
          {
            path: "admin/bot-conversation",
            lazy: async () => ({
              Component: (await import("./components/AdminBotConversationPage"))
                .AdminBotConversationPage,
            }),
          },
          {
            path: "admin",
            lazy: async () => ({ Component: (await import("./components/AdminPage")).AdminPage }),
          },
          {
            path: "admin/delete",
            lazy: async () => ({ Component: (await import("./components/AdminPage")).AdminPage }),
          },
        ],
      },
    ],
  },
]);
