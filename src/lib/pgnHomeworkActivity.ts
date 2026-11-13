export type HomeworkPgn = {
  _id: unknown;
  title: string;
  pgn: string;
  folder?: string;
};

export function pgnHomeworkActivity(topicName: string, pgns: HomeworkPgn[]) {
  return {
    type: "study_pgn",
    title: `${topicName} PGN Study`,
    instructions: "Study the selected PGNs and solve the board tasks.",
    difficulty: "beginner",
    points: 1,
    timeLimitMinutes: 0,
    topic: topicName,
    source: { kind: "pgn_quiz", folder: pgns[0]?.folder || "", maxAttempts: 1 },
    items: pgns.map((pgn) => ({
      id: String(pgn._id),
      title: pgn.title,
      pgnTitle: pgn.title,
      pgnSourceId: String(pgn._id),
      pgn: pgn.pgn,
      source: { kind: "pgn", folder: pgn.folder || "Unfiled" },
      points: 1,
    })),
  };
}
