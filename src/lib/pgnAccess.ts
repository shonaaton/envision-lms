export { normalizeFolderPath } from "@/lib/pgnLibrary";

export function requestedPgnVisibility(session: any, visibility?: string) {
  if ((session?.user as any)?.role === "admin" && visibility === "shared") return "shared";
  return visibility === "classroom" ? "classroom" : "private";
}

export function buildPgnLibraryFilter(session: any, extra: Record<string, any> = {}) {
  const userId = (session.user as any).id;
  return {
    $and: [
      {
        $or: [
          { uploadedBy: userId },
          { visibility: "shared" },
        ],
      },
      extra,
    ],
  };
}

export function buildPgnFolderFilter(session: any, extra: Record<string, any> = {}) {
  const userId = (session.user as any).id;
  return {
    $and: [
      {
        $or: [
          { uploadedBy: userId, visibility: "private" },
          { visibility: "shared" },
        ],
      },
      extra,
    ],
  };
}

export function buildOwnedFolderFilter(session: any, extra: Record<string, any> = {}) {
  const userId = (session.user as any).id;
  return {
    $and: [
      { uploadedBy: userId },
      extra,
    ],
  };
}

export function buildManageablePgnFilter(session: any, extra: Record<string, any> = {}) {
  const userId = (session.user as any).id;
  const isAdmin = (session?.user as any)?.role === "admin";
  return {
    $and: [
      isAdmin
        ? {
            $or: [
              { uploadedBy: userId },
              { visibility: "shared" },
            ],
          }
        : { uploadedBy: userId },
      extra,
    ],
  };
}

export function buildManageableFolderFilter(session: any, extra: Record<string, any> = {}) {
  const userId = (session.user as any).id;
  const isAdmin = (session?.user as any)?.role === "admin";
  return {
    $and: [
      isAdmin
        ? {
            $or: [
              { uploadedBy: userId },
              { visibility: "shared" },
            ],
          }
        : { uploadedBy: userId },
      extra,
    ],
  };
}

export function canManageSharedFolder(session: any) {
  return (session?.user as any)?.role === "admin";
}
