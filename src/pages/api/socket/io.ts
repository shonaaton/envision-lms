import type { NextApiRequest, NextApiResponse } from "next";
import { Server as SocketIOServer } from "socket.io";
import { getToken } from "next-auth/jwt";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { User } from "@/models/User";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { getTournamentGuestSessionFromCookieHeader } from "@/lib/tournamentGuests";
import { registerTournamentSocketServer, tournamentRoomName } from "@/lib/tournamentSocketServer";

type SocketServerWithIO = NextApiResponse["socket"] & {
  server: {
    io?: SocketIOServer;
  } & Record<string, unknown>;
};

type SocketSession = {
  id?: string;
  role?: string;
};

type AttemptEntry = {
  count: number;
  resetAt: number;
};

declare global {
  var _tournamentSocketAttempts: Map<string, AttemptEntry> | undefined;
}

const SOCKET_ATTEMPT_WINDOW_MS = 60_000;
const SOCKET_ATTEMPT_LIMIT = 60;
const socketAttempts = global._tournamentSocketAttempts ?? new Map<string, AttemptEntry>();
if (!global._tournamentSocketAttempts) global._tournamentSocketAttempts = socketAttempts;

function socketIpAddress(headers: Record<string, string | string[] | undefined>) {
  const forwardedFor = String(headers["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwardedFor || String(headers["x-real-ip"] || "").trim() || "unknown";
}

function consumeSocketAttempt(ip: string) {
  const now = Date.now();
  const existing = socketAttempts.get(ip);
  if (!existing || existing.resetAt <= now) {
    socketAttempts.set(ip, { count: 1, resetAt: now + SOCKET_ATTEMPT_WINDOW_MS });
    return true;
  }
  if (existing.count >= SOCKET_ATTEMPT_LIMIT) return false;
  existing.count += 1;
  socketAttempts.set(ip, existing);
  return true;
}

async function resolveSocketSession(headers: Record<string, string | string[] | undefined>) {
  const cookieHeader = String(headers.cookie || "");
  const secureCookie = process.env.NODE_ENV === "production";
  const cookieName = secureCookie ? "__Secure-authjs.session-token" : "authjs.session-token";
  const token = await getToken({
    req: {
      headers: {
        cookie: cookieHeader,
      },
    } as any,
    secret: String(process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || ""),
    secureCookie,
    cookieName,
    salt: cookieName,
  });
  if (!token) return null;
  return {
    id: typeof token.id === "string" ? token.id : "",
    role: typeof token.role === "string" ? token.role : "",
  } satisfies SocketSession;
}

async function canJoinTournamentRoom(tournamentId: string, headers: Record<string, string | string[] | undefined>) {
  if (!tournamentId) return false;
  const ip = socketIpAddress(headers);
  if (!consumeSocketAttempt(ip)) return false;

  await dbConnect();
  const tournament: any = await Tournament.findById(tournamentId).select("participants access externalInvite externalParticipants").lean();
  if (!tournament) return false;

  const session = await resolveSocketSession(headers);
  const userId = session?.id || "";
  const role = session?.role || "";

  if (userId) {
    if (role === "student") {
      const student: any = await User.findById(userId).select("role isActive").lean();
      if (!student || student.role !== "student" || student.isActive === false) return false;
    }
    if (
      role === "admin" ||
      role === "sub-admin" ||
      role === "instructor" ||
      tournament.access?.allActiveStudents ||
      (tournament.access?.users || []).map((id: any) => String(id)).includes(userId) ||
      (tournament.participants || []).some((player: any) => String(player) === userId)
    ) {
      return true;
    }
  }

  const guestToken = String(tournament.externalInvite?.token || "");
  if (!guestToken) return false;
  const guestSession = getTournamentGuestSessionFromCookieHeader(String(headers.cookie || ""), guestToken);
  if (!guestSession?.username) return false;
  return (tournament.externalParticipants || []).some(
    (player: any) => String(player.username || "").toLowerCase() === guestSession.username.toLowerCase()
  );
}

function socketCorsOrigins() {
  const configured = resolvePublicAppUrl(undefined, { allowRequestHeaders: false });
  if (!configured) return [];
  return [configured];
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(_: NextApiRequest, res: NextApiResponse) {
  const socket = res.socket as SocketServerWithIO;

  if (!socket.server.io) {
    const allowedOrigins = socketCorsOrigins();
    const io = new SocketIOServer(socket.server as any, {
      path: "/api/socket/io",
      addTrailingSlash: false,
      cors: {
        origin: allowedOrigins.length ? allowedOrigins : undefined,
        methods: ["GET", "POST"],
        credentials: true,
      },
      allowRequest: (req, callback) => {
        const origin = String(req.headers.origin || "");
        if (!allowedOrigins.length) {
          callback(null, process.env.NODE_ENV !== "production");
          return;
        }
        callback(null, allowedOrigins.includes(origin));
      },
    });

    io.use(async (client, next) => {
      try {
        const tournamentId = String(client.handshake.auth?.tournamentId || client.handshake.query?.tournamentId || "").trim();
        if (!tournamentId) return next(new Error("missing_tournament"));
        const allowed = await canJoinTournamentRoom(tournamentId, client.handshake.headers as any);
        if (!allowed) return next(new Error("forbidden"));
        client.data.tournamentId = tournamentId;
        return next();
      } catch {
        return next(new Error("forbidden"));
      }
    });

    io.on("connection", (client) => {
      const tournamentId = String(client.data.tournamentId || "");
      if (!tournamentId) {
        client.disconnect(true);
        return;
      }
      client.join(tournamentRoomName(tournamentId));
      client.emit("tournament:ready", { tournamentId });
    });

    socket.server.io = io;
    registerTournamentSocketServer(io);
  }

  res.status(200).json({ ok: true });
}
