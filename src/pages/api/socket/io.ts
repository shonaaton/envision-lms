import type { NextApiRequest, NextApiResponse } from "next";
import { Server as SocketIOServer } from "socket.io";
import { getToken } from "next-auth/jwt";
import { dbConnect } from "@/lib/db";
import { Tournament } from "@/models/Tournament";
import { User } from "@/models/User";
import { resolvePublicAppUrl } from "@/lib/appUrl";
import { getTournamentGuestSessionFromCookieHeader } from "@/lib/tournamentGuests";
import { TournamentGame } from "@/models/TournamentGame";
import { registerTournamentSocketServer, tournamentGameRoomName, tournamentRoomName } from "@/lib/tournamentSocketServer";
import { pruneExpiredEntries } from "@/lib/requestSecurity";
import { playerSocketClosed, playerSocketOpened } from "@/lib/tournament/presence";

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
/**
 * Per IP address. A whole branch or classroom shares one address on its
 * Wi-Fi, so this is sized for a room of players opening and reconnecting
 * pages, not for one person: at 60 the 61st page open in a minute was refused.
 */
const SOCKET_ATTEMPT_LIMIT = 1_200;
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
    // One entry per address that ever connected; without this the map only grows.
    pruneExpiredEntries(socketAttempts, now);
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

class SocketRateLimited extends Error {}

/**
 * Whether this connection may join the tournament room, and which players it
 * speaks for (an LMS session, a guest seat, or both in one browser). `null`
 * means refused; an empty list is a spectator.
 */
async function admitToTournamentRoom(tournamentId: string, headers: Record<string, string | string[] | undefined>): Promise<string[] | null> {
  if (!tournamentId) return null;
  const ip = socketIpAddress(headers);
  if (!consumeSocketAttempt(ip)) throw new SocketRateLimited();

  await dbConnect();
  const tournament: any = await Tournament.findById(tournamentId).select("participants access externalInvite externalParticipants").lean();
  if (!tournament) return null;

  const session = await resolveSocketSession(headers);
  const userId = session?.id || "";
  const role = session?.role || "";

  const playerKeys: string[] = [];
  let memberAllowed = false;
  if (userId) {
    if (role === "student") {
      const student: any = await User.findById(userId).select("role isActive").lean();
      if (!student || student.role !== "student" || student.isActive === false) return null;
    }
    if (
      role === "admin" ||
      role === "sub-admin" ||
      role === "instructor" ||
      tournament.access?.allActiveStudents ||
      (tournament.access?.users || []).map((id: any) => String(id)).includes(userId) ||
      (tournament.participants || []).some((player: any) => String(player) === userId)
    ) {
      memberAllowed = true;
      // Recorded even before they register: someone who opens the event and
      // then registers is already in the room. A spectator's key is never in
      // the standings, so it pairs nobody.
      playerKeys.push(`user:${userId}`);
    }
  }

  const guestToken = String(tournament.externalInvite?.token || "");
  const guestSession = guestToken ? getTournamentGuestSessionFromCookieHeader(String(headers.cookie || ""), guestToken) : null;
  const guestSeated = Boolean(
    guestSession?.username &&
      (tournament.externalParticipants || []).some(
        (player: any) => String(player.username || "").toLowerCase() === guestSession.username.toLowerCase()
      )
  );
  if (guestSeated) playerKeys.push(`external:${guestSession!.username.trim().toLowerCase()}`);
  if (!memberAllowed && !guestSeated) return null;
  return playerKeys;
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

const SOCKET_PATH = "/api/socket/io";

/**
 * Next registers its own "upgrade" listener on the HTTP server. For a path it
 * recognises as a route - and /api/socket/io is one, this file - it calls
 * socket.end() a few milliseconds after socket.io has accepted the WebSocket,
 * so every tournament client dropped before its handshake finished. engine.io
 * already shields its path from Next's "request" listener; this does the same
 * for upgrades, leaving every other upgrade (dev HMR included) to Next.
 */
function shieldSocketPathFromNextUpgrades(server: any) {
  const nextListeners = server.listeners("upgrade") as Array<(...args: any[]) => void>;
  for (const listener of nextListeners) {
    server.off("upgrade", listener);
    server.on("upgrade", (req: any, rawSocket: any, head: any) => {
      const pathname = String(req.url || "").split("?")[0];
      if (pathname === SOCKET_PATH || pathname.startsWith(`${SOCKET_PATH}/`)) return;
      listener.call(server, req, rawSocket, head);
    });
  }
}

export default function handler(_: NextApiRequest, res: NextApiResponse) {
  const socket = res.socket as SocketServerWithIO;

  if (!socket.server.io) {
    const allowedOrigins = socketCorsOrigins();
    shieldSocketPathFromNextUpgrades(socket.server);
    const io = new SocketIOServer(socket.server as any, {
      path: SOCKET_PATH,
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
        const playerKeys = await admitToTournamentRoom(tournamentId, client.handshake.headers as any);
        if (!playerKeys) return next(new Error("forbidden"));
        client.data.tournamentId = tournamentId;
        client.data.playerKeys = playerKeys;
        return next();
      } catch (error) {
        // The client retries either way; the name tells it to back off.
        return next(new Error(error instanceof SocketRateLimited ? "rate_limited" : "forbidden"));
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

      // Presence: an Arena only pairs players who are in the room.
      const playerKeys: string[] = Array.isArray(client.data.playerKeys) ? client.data.playerKeys : [];
      for (const key of playerKeys) playerSocketOpened(tournamentId, key);
      client.on("disconnect", () => {
        for (const key of playerKeys) playerSocketClosed(tournamentId, key);
      });

      // Board subscriptions. The handshake already established that this
      // client may see this tournament; here we only confirm the board it asks
      // for belongs to that tournament, so a socket cannot listen in on an
      // event it was never admitted to.
      client.on("subscribe:game", async (raw: unknown, ack?: (result: { ok: boolean }) => void) => {
        try {
          const gameId = String((raw as any)?.gameId || "").trim();
          if (!/^[a-f0-9]{24}$/i.test(gameId)) return ack?.({ ok: false });
          await dbConnect();
          const game: any = await TournamentGame.findById(gameId).select("tournament").lean();
          if (!game || String(game.tournament) !== tournamentId) return ack?.({ ok: false });
          for (const room of client.rooms) {
            if (room.startsWith("tournament-game:")) client.leave(room);
          }
          client.join(tournamentGameRoomName(gameId));
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      });

      client.on("unsubscribe:game", (raw: unknown) => {
        const gameId = String((raw as any)?.gameId || "").trim();
        if (gameId) client.leave(tournamentGameRoomName(gameId));
      });
    });

    socket.server.io = io;
    registerTournamentSocketServer(io);
  }

  res.status(200).json({ ok: true });
}
