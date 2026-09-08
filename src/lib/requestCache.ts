import { cache } from "react";

// Next 14 supplies cache in the RSC runtime; React 18's Node/API runtime may
// not expose it. Never substitute a process-wide cache for authorization data.
export const requestCache: typeof cache = typeof cache === "function" ? cache : (fn => fn);
