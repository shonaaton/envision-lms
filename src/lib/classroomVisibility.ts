/**
 * Which classrooms a viewer may be shown in a list.
 *
 * A sandbox classroom (`isTestClassroom`) can only ever be entered by the super
 * admin who owns it - `/classrooms/[id]/live` turns everyone else away before
 * it renders anything. So a list that surfaces one to anybody else is offering
 * a Join button that can only bounce the viewer straight back where they came
 * from. That is exactly what happened on the student dashboard, which was the
 * one classroom list that had never been given this rule.
 *
 * Every list that can lead to a live room filters on this, so the rule lives
 * here once instead of being spelled out at each call site and drifting again.
 *
 * Callers spread the result into their query LAST. The super-admin form uses
 * `$or`, so it must not be combined with another `$or` in the same object -
 * `coachClassroomQuery` returns one, but a coach never reaches that branch.
 */
export function visibleClassroomFilter({
  role,
  userId,
  isSuperAdmin,
}: {
  role: string | undefined | null;
  userId: string;
  isSuperAdmin?: boolean;
}) {
  return role === "admin" && isSuperAdmin
    ? { $or: [{ isTestClassroom: { $ne: true } }, { isTestClassroom: true, testOwner: userId }] }
    : { isTestClassroom: { $ne: true } };
}
