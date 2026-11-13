import { getSessionStart, type ScheduledSessionLike } from "@/lib/classroomSessions";

type RevisionSession = ScheduledSessionLike & { summary?: { topicCompleted?: boolean } };

function words(value?: string | null) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isRevisionTopic(topic?: string | null) {
  return /^(?:revision(?: class| session)?)(?: (?:and )?practice(?: session)?)?$/.test(words(topic));
}

function isPracticeTopic(topic?: string | null) {
  const name = words(topic);
  return /^practice(?: session| (?:and )?(?:analysis|application))?$/.test(name)
    || (isRevisionTopic(topic) && /\bpractice\b/.test(name));
}

export function revisionTopics(earlierTopics: string[]) {
  const topics: string[] = [];
  for (const topic of earlierTopics) {
    if (isPracticeTopic(topic)) topics.length = 0;
    else if (!isRevisionTopic(topic)) topics.push(topic);
  }
  return topics;
}

export function taughtTopicsBeforeRevision(sessions: RevisionSession[], current: RevisionSession) {
  const start = getSessionStart(current);
  if (!start) return [];
  const earlier = sessions.flatMap((session) => {
    const date = getSessionStart(session);
    return date && date < start && session.status === "completed" ? [{ date, session }] : [];
  }).sort((a, b) => a.date.getTime() - b.date.getTime());

  return revisionTopics(earlier.flatMap(({ session }) => (
    session.topicName && (session.summary?.topicCompleted !== false || isPracticeTopic(session.topicName))
      ? [session.topicName]
      : []
  )));
}

export function revisionPgnTopicKey(value?: string | null) {
  return words(String(value || "").replace(/\.pgn$/i, ""))
    .replace(/\b(?:cw|hw|class\s?work|home\s?work|and|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function revisionPgnKind(folder: string | undefined, fileName: string, courseNames: string[], levelName: string) {
  const parts = String(folder || "").split("/").map(words).filter(Boolean);
  const courseKey = (name: string) => words(name).replace(/\b(?:chess|courses?)\b/g, "").replace(/\s/g, "").replace(/s$/, "");
  if (!courseNames.some((name) => courseKey(name) && courseKey(name) === courseKey(parts[0] || ""))) return;

  const levelNumber = words(levelName).match(/\blevel\s*(\d+)\b/)?.[1];
  const levelIndex = parts.findIndex((part, index) => index > 0 && (
    part === words(levelName) || (levelNumber && part.match(/\blevel\s*(\d+)\b/)?.[1] === levelNumber)
  ));
  if (levelIndex < 0) return;

  for (const label of [...parts.slice(levelIndex + 1), words(fileName)]) {
    if (/\b(?:cw|class\s?work)\b/.test(label)) return "CW";
    if (/\b(?:hw|home\s?work)\b/.test(label)) return "HW";
  }
}
