import { findFeatureByApiPath } from "@/lib/featureRegistry";

// Extra boundaries for shared APIs. Keep these more specific than their parent
// feature so granting a report does not grant all finance or all administration.
export function namedRoleApiFeature(path: string) {
  const mappings: [string, string][] = [
    ["/api/fees/analytics", "feeDashboard"], ["/api/fees/credit-monitoring", "creditMonitoring"],
    ["/api/fees/credit-eligibility", "studentFees"], ["/api/fees/reports", "feeReports"], ["/api/fees/invoices", "invoices"],
    ["/api/admin/activity-tracker", "activityTracker"], ["/api/admin/reports", "reportsCenter"],
    ["/api/admin/attendance-diagnostics", "attendance"],
    ["/api/coach-pay", "coachPay"],
  ];
  return mappings.find(([prefix]) => path === prefix || path.startsWith(prefix + "/"))?.[1] || findFeatureByApiPath(path)?.key;
}

export function namedRoleApiPermissions(path: string, method: string): string[] {
  if (method === "GET" || method === "HEAD") return [/(?:\/export|\/fair-play-report|\/participation-report)$/.test(path) ? "export" : "view"];
  if (path.startsWith("/api/profile/password")) return ["security"];
  if (path.startsWith("/api/profile")) return ["edit"];
  if (path === "/api/notifications" && method === "PATCH") return ["view"]; // Own read receipts only; handler enforces ownership.
  if (path.startsWith("/api/sales/crm/")) return ["stage", "note"]; // Handler checks the selected action.
  if (path.startsWith("/api/admin/crm")) return ["manage"];
  if (path.startsWith("/api/admin/whatsapp/templates")) return ["manage"];
  if (path.startsWith("/api/admin/whatsapp/")) return ["create"];
  if (path.startsWith("/api/admin/student-pauses")) return ["manage"];
  if (path.startsWith("/api/admin/google-")) return ["manage"];
  if (path.startsWith("/api/coach-pay/rates") || path.startsWith("/api/coach-pay/overrides")) return ["manage_rates"];
  if (path.startsWith("/api/coach-pay/no-show-rulings")) return ["rule"];
  if (path === "/api/fees/reminders" && method === "POST") return ["invoice", "credit"];
  if (path.startsWith("/api/payments")) return ["payment"];
  if (path.startsWith("/api/attendance")) return ["edit"];
  if (path.startsWith("/api/chess/accounts")) return ["manage_accounts"];
  if (path.startsWith("/api/chess/sync")) return ["sync"];
  if (path.startsWith("/api/availability")) return ["edit", "approve"];
  if (path.startsWith("/api/bookings") && method === "PATCH") return ["approve"];
  if (path === "/api/classrooms" && method === "POST") return ["create"];
  if (/^\/api\/classrooms\/[^/]+$/.test(path)) {
    if (method === "DELETE") return ["cancel"];
    if (method === "PATCH") return ["edit", "cancel", "assign", "create", "attendance"];
  }
  if (/\/assignment-templates\/[^/]+\/assign$/.test(path)) return ["assign"];
  if (path.startsWith("/api/ask-coach/moderation")) return ["moderate"];
  if (path.startsWith("/api/tournaments")) {
    if (/\/(join|withdraw|queue|chat|presence|move)$/.test(path)) return ["join"];
    if (/\/(participants|players)(\/|$)/.test(path)) return ["participants"];
    if (/\/(next-round|start)$/.test(path)) return ["pairings"];
    if (/\/result$/.test(path)) return ["results"];
    if (/\/(cancel|end)$/.test(path)) return ["cancel"];
    if (/\/(pause|resume|admin-pause)$/.test(path)) return ["edit"];
    if (/\/announce$/.test(path)) return ["edit"];
  }
  if (path.startsWith("/api/classrooms/") && path.includes("/live")) return ["join", "edit"]; // Live handler additionally enforces teacher/participant actions.
  if (path.startsWith("/api/play/computer")) return ["play"];
  if (/^\/api\/(learn|square-trainer|tactics-trainer)/.test(path)) return ["practice"];
  if (method === "DELETE") return ["delete"];
  return method === "POST" ? ["create"] : ["edit"];
}
