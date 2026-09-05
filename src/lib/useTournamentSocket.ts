"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";

/**
 * Tournament realtime.
 *
 * Previously this listened for one contentless "something changed" event and
 * answered every one of them by refetching the whole tournament — so a move on
 * any board made every connected client re-run the heaviest endpoint in the
 * application. Events now carry their payload and are addressed to the room
 * that needs them, and the client patches what it already has.
 *
 * A full refetch is kept for reconnect and for genuinely structural changes,
 * where there is no smaller correct answer.
 */

export type TournamentSocketHandlers = {
  /** A move on the subscribed board. */
  onGameMove?: (payload: any) => void;
  /** The subscribed board finished. */
  onGameEnded?: (payload: any) => void;
  /** Draw offer, berserk: small per-game flags. */
  onGameFlags?: (payload: any) => void;
  onClockSync?: (payload: any) => void;
  onPairingCreated?: (payload: any) => void;
  onStandings?: (payload: any) => void;
  onRoundStarted?: (payload: any) => void;
  onRoundCompleted?: (payload: any) => void;
  onTournamentStatus?: (payload: any) => void;
  onTournamentEnded?: (payload: any) => void;
  /** Structural change, or reconnect: reload from the server. */
  onResync?: (reason: string) => void;
};

type Options = {
  tournamentId: string;
  /** Board to subscribe to. Changing it moves the subscription. */
  gameId?: string | null;
  handlers: TournamentSocketHandlers;
};

export function useTournamentSocket({ tournamentId, gameId, handlers }: Options) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  const [connected, setConnected] = useState(false);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

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

      socket.on("connect", () => {
        setConnected(true);
        // A reconnect may have missed events, so the authoritative position,
        // clocks and standings are pulled once rather than guessed at.
        if (hasConnectedRef.current) handlersRef.current.onResync?.("reconnect");
        hasConnectedRef.current = true;
      });
      socket.on("disconnect", () => setConnected(false));

      const forward = (event: string, handler: keyof TournamentSocketHandlers) => {
        socket.on(event, (payload: any) => {
          (handlersRef.current[handler] as ((value: any) => void) | undefined)?.(payload);
        });
      };

      forward("game:move", "onGameMove");
      forward("game:ended", "onGameEnded");
      forward("game:flags", "onGameFlags");
      forward("game:clock-sync", "onClockSync");
      forward("tournament:pairing-created", "onPairingCreated");
      forward("tournament:standing-updated", "onStandings");
      forward("tournament:round-started", "onRoundStarted");
      forward("tournament:round-completed", "onRoundCompleted");
      forward("tournament:status", "onTournamentStatus");
      forward("tournament:ended", "onTournamentEnded");
      forward("tournament:game-ended", "onGameEnded");

      socket.on("tournament:update", (payload: any) => {
        handlersRef.current.onResync?.(String(payload?.reason || "changed"));
      });
    }

    void connect();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
      hasConnectedRef.current = false;
    };
  }, [tournamentId]);

  // Follow the board the player is actually on.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !gameId) return;
    const subscribe = () => socket.emit("subscribe:game", { gameId });
    if (socket.connected) subscribe();
    socket.on("connect", subscribe);
    return () => {
      socket.off("connect", subscribe);
      socket.emit("unsubscribe:game", { gameId });
    };
  }, [gameId, connected]);

  const resync = useCallback((reason = "manual") => {
    handlersRef.current.onResync?.(reason);
  }, []);

  return { connected, resync };
}
