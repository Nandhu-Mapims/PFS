/**
 * The complete capability vocabulary.
 *
 * Deliberately dependency-free: roles.js and auth.js both import it, so keeping
 * it standalone avoids a cycle between the role registry and the auth guards.
 *
 * A capability is a single thing a user may do. Guards check these, never role
 * names, so a new role is a row in the `roles` collection rather than a code
 * change.
 */

export const CAPABILITIES = {
  FEEDBACK_READ_ALL: "feedback.read.all",
  FEEDBACK_READ_ASSIGNED: "feedback.read.assigned",
  FEEDBACK_ASSIGN: "feedback.assign",
  FEEDBACK_RESOLVE: "feedback.resolve",
  FEEDBACK_DELETE: "feedback.delete",
  CAPA_WRITE: "capa.write",
  INSIGHTS_VIEW: "insights.view",
  INSIGHTS_OVERVIEW: "insights.overview",
  REPORTS_GENERATE: "reports.generate",
  USERS_MANAGE: "users.manage",
  ROLES_MANAGE: "roles.manage",
  DEPARTMENTS_MANAGE: "departments.manage",
  SERVICES_MANAGE: "services.manage",
  SETTINGS_MANAGE: "settings.manage",
  BRANDING_MANAGE: "branding.manage",
  MAINTENANCE_RUN: "maintenance.run",
};

/** Every capability key, for validation and for the RBAC screen's matrix. */
export const ALL_CAPABILITIES = Object.values(CAPABILITIES);

/** Human-readable metadata, grouped so the RBAC screen can render sections. */
export const CAPABILITY_CATALOG = [
  {
    group: "Feedback & tickets",
    items: [
      { key: CAPABILITIES.FEEDBACK_READ_ALL, label: "View all feedback", description: "Read every feedback row and ticket in the system." },
      { key: CAPABILITIES.FEEDBACK_READ_ASSIGNED, label: "View assigned queue", description: "Read only tickets assigned to this user." },
      { key: CAPABILITIES.FEEDBACK_ASSIGN, label: "Assign tickets", description: "Route tickets to a department head." },
      { key: CAPABILITIES.FEEDBACK_RESOLVE, label: "Resolve tickets", description: "Change ticket status, including closing it." },
      { key: CAPABILITIES.CAPA_WRITE, label: "Write CAPA", description: "Record root cause and corrective/preventive actions." },
      { key: CAPABILITIES.FEEDBACK_DELETE, label: "Delete feedback", description: "Permanently remove a feedback record." },
    ],
  },
  {
    group: "Insights & reporting",
    items: [
      { key: CAPABILITIES.INSIGHTS_VIEW, label: "View insights", description: "Open the management dashboards and analytics." },
      { key: CAPABILITIES.INSIGHTS_OVERVIEW, label: "View overview screen", description: "Open the Management overview tab of the insights dashboards." },
      { key: CAPABILITIES.REPORTS_GENERATE, label: "Generate reports", description: "Trigger summary report generation." },
    ],
  },
  {
    group: "Administration",
    items: [
      { key: CAPABILITIES.USERS_MANAGE, label: "Manage users", description: "Create, edit and remove user accounts." },
      { key: CAPABILITIES.ROLES_MANAGE, label: "Manage roles", description: "Change which capabilities each role grants." },
      { key: CAPABILITIES.DEPARTMENTS_MANAGE, label: "Manage departments", description: "Maintain the department catalog and HOD mapping." },
      { key: CAPABILITIES.SERVICES_MANAGE, label: "Manage services", description: "Maintain the routing service catalog." },
      { key: CAPABILITIES.SETTINGS_MANAGE, label: "Manage settings", description: "Edit system settings and the AI voice guide." },
      { key: CAPABILITIES.BRANDING_MANAGE, label: "Manage branding", description: "Change colours and logo." },
      { key: CAPABILITIES.MAINTENANCE_RUN, label: "Run maintenance", description: "Execute repair and bulk ticket jobs." },
    ],
  },
];
