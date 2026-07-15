import type { NextApiRequest, NextApiResponse } from "next";
import { Server as SocketIOServer } from "socket.io";

type SocketServerWithIO = NextApiResponse["socket"] & {
  server: {
    io?: SocketIOServer;
  } & Record<string, unknown>;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(_: NextApiRequest, res: NextApiResponse) {
  const socket = res.socket as SocketServerWithIO;

  if (!socket.server.io) {
    const io = new SocketIOServer(socket.server as any, {
      path: "/api/socket/io",
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    io.on("connection", (client) => {
      client.on("join:tournament", ({ tournamentId }: { tournamentId?: string }) => {
        if (!tournamentId) return;
        client.join(`tournament:${tournamentId}`);
      });

      client.on("leave:tournament", ({ tournamentId }: { tournamentId?: string }) => {
        if (!tournamentId) return;
        client.leave(`tournament:${tournamentId}`);
      });

      client.on("tournament:changed", ({ tournamentId, reason }: { tournamentId?: string; reason?: string }) => {
        if (!tournamentId) return;
        io.to(`tournament:${tournamentId}`).emit("tournament:update", {
          tournamentId,
          reason: reason || "changed",
          at: Date.now(),
        });
      });

      client.on("presence:ping", ({ tournamentId, playerKey }: { tournamentId?: string; playerKey?: string }) => {
        if (!tournamentId) return;
        client.to(`tournament:${tournamentId}`).emit("presence:update", {
          tournamentId,
          playerKey: playerKey || "",
          status: "online",
          at: Date.now(),
        });
      });

      client.on("presence:leave", ({ tournamentId, playerKey }: { tournamentId?: string; playerKey?: string }) => {
        if (!tournamentId) return;
        client.to(`tournament:${tournamentId}`).emit("presence:update", {
          tournamentId,
          playerKey: playerKey || "",
          status: "leaving",
          at: Date.now(),
        });
      });
    });

    socket.server.io = io;
  }

  res.status(200).json({ ok: true });
}
