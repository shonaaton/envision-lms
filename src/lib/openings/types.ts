/**
 * The shape of an opening course.
 *
 * Openings are written in code (lib/openings/content/*), one file per opening,
 * and `content.test.ts` replays every move in them. Nothing here touches the
 * database: who may open a chapter is decided in lib/openings/access.ts.
 *
 * Text fields understand three small marks:
 *   **bold**      emphasis
 *   {Nf3}         a move, shown as a move chip
 *   [f7]          a square, shown as a chip that lights the square on the board
 * A blank line starts a new paragraph.
 */

export type ArrowColor = "green" | "red" | "blue" | "yellow";

/** [from, to, colour]. Colour defaults to green. */
export type OpeningArrow = [from: string, to: string, color?: ArrowColor];

/** [square, colour]. Colour defaults to yellow. */
export type OpeningHighlight = [square: string, color?: ArrowColor];

type StepBase = {
  /** Short heading over the text, e.g. "The Italian bishop". */
  title?: string;
  text: string;
  arrows?: OpeningArrow[];
  highlights?: OpeningHighlight[];
};

/** Text on the current position: history, a plan, a warning. */
export type IntroStep = StepBase & { kind: "intro" };

/** One move of the line, in SAN, played by whichever side is to move. */
export type MoveStep = StepBase & { kind: "move"; move: string };

/** A position worth stopping on: arrows and squares, no move. */
export type IdeaStep = StepBase & { kind: "idea" };

/**
 * "Find the move". The student plays it on the board. Any move in `answer` is
 * accepted; the first one is what the line continues with. `text` is shown
 * once it is found (or revealed), so it should explain why the move is good.
 */
export type QuizStep = StepBase & {
  kind: "quiz";
  prompt: string;
  answer: string[];
  hint?: string;
};

/** The chapter's closing recap. */
export type SummaryStep = StepBase & { kind: "summary"; points?: string[] };

export type OpeningStep = IntroStep | MoveStep | IdeaStep | QuizStep | SummaryStep;

export type OpeningChapter = {
  slug: string;
  title: string;
  summary: string;
  /** The one chapter everybody may play, logged in or not. Exactly one per opening. */
  preview?: true;
  /**
   * Moves (SAN) already on the board when the chapter opens, so chapter three
   * can start from the position chapter one reached without retelling it.
   */
  setupMoves?: string[];
  steps: OpeningStep[];
};

export type OpeningLevel = "beginner" | "intermediate" | "advanced";

export type Opening = {
  slug: string;
  name: string;
  /** ECO codes the course covers, e.g. ["C50", "C53", "C54"]. */
  eco: string[];
  /** The moves that define the opening. The test checks the lichess name here starts with `name`. */
  definingMoves: string[];
  /** Which side the course teaches; the board is shown from this side. */
  side: "white" | "black";
  level: OpeningLevel;
  /** One line for cards and the page subtitle. */
  tagline: string;
  /** Paragraphs, oldest story first. */
  history: string[];
  /** The handful of ideas a student should leave with. */
  keyIdeas: string[];
  chapters: OpeningChapter[];
};
