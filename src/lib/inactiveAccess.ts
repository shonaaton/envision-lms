const inactiveRestrictedPrefixes = [
  "/classrooms",
  "/instructor",
  "/availability",
  "/booking",
  "/calendar",
  "/attendance",
  "/homework",
  "/ask-coach",
  "/tournaments",
  "/admin/homework-templates",
  "/api/classrooms",
  "/api/availability",
  "/api/bookings",
  "/api/attendance",
  "/api/homework",
  "/api/ask-coach",
  "/api/tournaments",
  "/api/admin/assignment-templates",
];

export function isInactiveRestrictedPath(pathname: string) {
  return inactiveRestrictedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
