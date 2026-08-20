import type { Server as SocketIOServer } from "socket.io";

declare global {
  var _tournamentSocketIo: SocketIOServer | undefined;
}

export function tournamentRoomName(tournamentId: string) {
  return `tournament:${String(tournamentId || "").trim()}`;
}

export function registerTournamentSocketServer(io: SocketIOServer) {
  global._tournamentSocketIo = io;
}

export function getTournamentSocketServer() {
  return global._tournamentSocketIo;
}

export function emitTournamentUpdate(tournamentId: string, reason = "changed") {
  const io = getTournamentSocketServer();
  if (!io || !tournamentId) return;
  io.to(tournamentRoomName(tournamentId)).emit("tournament:update", {
    tournamentId,
    reason,
    at: Date.now(),
  });
}
