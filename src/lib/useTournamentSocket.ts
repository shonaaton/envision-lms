"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

type TournamentSocketOptions = {
  tournamentId: string;
  playerKey?: string;
  onUpdate: (payload?: any) => void | Promise<void>;
  onPresence?: (payload?: any) => void;
};

export function useTournamentSocket({ tournamentId, playerKey, onUpdate, onPresence }: TournamentSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const updateRef = useRef(onUpdate);
  const presenceRef = useRef(onPresence);
  const lastUpdateAtRef = useRef(0);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    updateRef.current = onUpdate;
    presenceRef.current = onPresence;
  }, [onUpdate, onPresence]);

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
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelayMax: 5000,
      });
      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        socket.emit("join:tournament", { tournamentId });
        socket.emit("presence:ping", { tournamentId, playerKey });
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("tournament:update", (payload) => {
        if (payload?.tournamentId && payload.tournamentId !== tournamentId) return;
        const at = Number(payload?.at || 0);
        if (at && at < lastUpdateAtRef.current) return;
        if (at) lastUpdateAtRef.current = at;
        void updateRef.current(payload);
      });
      socket.on("presence:update", (payload) => {
        if (payload?.tournamentId && payload.tournamentId !== tournamentId) return;
        presenceRef.current?.(payload);
      });
    }

    void connect();
    const presenceTimer = window.setInterval(() => {
      socketRef.current?.emit("presence:ping", { tournamentId, playerKey });
    }, 10_000);
    const leave = () => {
      socketRef.current?.emit("presence:leave", { tournamentId, playerKey });
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("beforeunload", leave);

    return () => {
      cancelled = true;
      window.clearInterval(presenceTimer);
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("beforeunload", leave);
      socketRef.current?.emit("leave:tournament", { tournamentId });
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [playerKey, tournamentId]);

  const broadcastTournamentUpdate = useCallback((reason = "changed") => {
    socketRef.current?.emit("tournament:changed", { tournamentId, reason });
  }, [tournamentId]);

  const emitPresence = useCallback(() => {
    socketRef.current?.emit("presence:ping", { tournamentId, playerKey });
  }, [playerKey, tournamentId]);

  return { connected, broadcastTournamentUpdate, emitPresence };
}
