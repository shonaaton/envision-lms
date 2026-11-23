"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Who is online in a tournament room, for the dots on player bars and
 * standings.
 *
 * The state read gives the list (`onlinePlayerKeys`); after that the
 * "tournament:presence" socket event adds or removes one player at a time.
 * Every full refresh replaces the list, which also corrects anything missed
 * while this page's own socket was down.
 */
/**
 * While players gather or play, a dot means something. Before and after,
 * nobody is in the room and every dot would be grey.
 */
export function isRoomOpenStatus(status: unknown) {
  return ["starting_soon", "live", "playing"].includes(String(status || ""));
}

export function useOnlinePlayers(serverKeys: string[] | null | undefined) {
  const [online, setOnline] = useState<Set<string>>(() => new Set(serverKeys || []));

  useEffect(() => {
    if (Array.isArray(serverKeys)) setOnline(new Set(serverKeys));
  }, [serverKeys]);

  const onPresence = useCallback((payload: { playerKey?: string; online?: boolean } | null | undefined) => {
    const key = String(payload?.playerKey || "");
    if (!key) return;
    setOnline((current) => {
      if (current.has(key) === Boolean(payload?.online)) return current;
      const next = new Set(current);
      if (payload?.online) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return { online, onPresence };
}
