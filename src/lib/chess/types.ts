export type ChessPlatform = "CHESS_COM" | "LICHESS";
export type ChessRatingType = "rapid" | "blitz" | "bullet" | "classical" | "correspondence";
export type ChessResult = "win" | "draw" | "loss";
export type ChessColor = "white" | "black";
export type TimeControlCategory = "ultrabullet" | "bullet" | "blitz" | "rapid" | "classical" | "correspondence" | "unknown";
export type SyncStatus = "PENDING" | "SYNCING" | "COMPLETED" | "FAILED";

export type PlatformProfile = {
  platformUserId?: string;
  username: string;
  displayName?: string;
};

export type PlatformRating = {
  ratingType: ChessRatingType;
  rating: number;
  recordedAt: Date;
};

export type GameFetchOptions = {
  since?: Date;
  maxGames?: number;
};

export type NormalizedGame = {
  platform: ChessPlatform;
  platformGameId?: string;
  playedAt: Date;
  whiteUsername: string;
  blackUsername: string;
  whiteRating?: number;
  blackRating?: number;
  studentColor: ChessColor;
  studentRating?: number;
  opponentUsername: string;
  opponentRating?: number;
  ratingChange?: number;
  result: ChessResult;
  termination?: string;
  timeControl?: string;
  timeControlCategory: TimeControlCategory;
  rated: boolean;
  opening?: string;
  eco?: string;
  pgn?: string;
  gameUrl?: string;
  gameHash: string;
  moveCount?: number;
};

export interface ChessPlatformProvider {
  validateUsername(username: string): Promise<boolean>;
  getProfile(username: string): Promise<PlatformProfile>;
  getRatings(username: string): Promise<PlatformRating[]>;
  getGames(username: string, options?: GameFetchOptions): Promise<NormalizedGame[]>;
}
