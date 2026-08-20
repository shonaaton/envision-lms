"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type TournamentSocketOptions = {
  tournamentId: string;
  onUpdate: (payload?: any) => void | Promise<void>;
};

export function useTournamentSocket({ tournamentId, onUpdate }: TournamentSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const updateRef = useRef(onUpdate);
  const lastUpdateAtRef = useRef(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    updateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!tournamentId) return;
    let cancelled = false;

    async function connect() {
      await fetch("/api/socket/io", { cache: "no-store" }).catch(() => null);
      if (cancelled) return;

      const socket = io({
        path: "/api/socket/io",
        addTrailingSlash: false,
        transports: ["websocket"],
        auth: { tournamentId },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));
      socket.on("tournament:update", (payload) => {
        if (payload?.tournamentId && payload.tournamentId !== tournamentId) return;
        const at = Number(payload?.at || 0);
        if (at && at < lastUpdateAtRef.current) return;
        if (at) lastUpdateAtRef.current = at;
        void updateRef.current(payload);
      });
    }

    void connect();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [tournamentId]);

  return { connected };
}
