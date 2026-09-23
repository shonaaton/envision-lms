# Learn Chess Architecture

Structured learn-to-play curriculum at `/learn`, with coach authoring at `/admin/learn`.

## Where it sits in the LMS

- Frontend: Next.js App Router, server-rendered lesson pages, client board player.
- Backend: route handlers under `/api/learn` (student) and `/api/admin/learn` (authoring).
- Database: Mongoose models in `src/models/Learning.ts`.
- Auth: NextAuth; feature key `learnChess` in `src/lib/featureRegistry.ts`.
- Chess foundation: `chess.js`, `react-chessboard`, and the shared board wrapper
  `src/components/homework/AssignmentChessboard.tsx`.

## The rules engine

`src/lib/learning/engine.ts` is the single source of truth for what counts as solved.
It is pure and isomorphic: the board player runs it in the browser for instant feedback,
and `/api/learn/attempt` replays the reported moves through the same functions before it
awards stars or XP. A completion cannot be claimed by posting to the API.

Three rules modes:

| Mode | Validator | Used for |
| --- | --- | --- |
| `MOVEMENT_TRAINER` | Own board model and geometry | Piece movement lessons |
| `LEGAL_CHESS` | `chess.js` | Everything with real chess rules |
| `QUESTION` | Answer key | Multiple-choice lessons |

`MOVEMENT_TRAINER` does not use chess.js, because chess.js rejects any FEN without both
kings and a movement lesson wants exactly that kind of position: one knight and three
target squares. `parseMovementBoard` reads the placement field into a map and
`movementMoveIsLegal` checks geometry only, with no turn order, check or pins. Sliding
pieces are stopped by pieces and by `obstacles` (wall squares); knights jump both.

Interaction modes: `BOARD_MOVE`, `BOARD_SEQUENCE` (multi-move, with scripted opponent
replies auto-played from `opponentScript`), `COLLECT_TARGETS` (visit every target square),
`SELECT_SQUARE` (click the answer, no moving), `MULTIPLE_CHOICE`, and `INFORMATION`
(a teaching slide, described below).

Goal types: `REACH_SQUARE`, `COLLECT_TARGETS`, `CAPTURE_TARGET`, `SELECT_CORRECT_SQUARE`,
`GIVE_CHECK`, `ESCAPE_CHECK`, `CHECKMATE`, `CASTLE`, `PROMOTE`, `EN_PASSANT`,
`MULTIPLE_CHOICE`. Setting `goalConfig.acceptAnyGoalMove` rewards any move that genuinely
achieves the goal rather than only the authored line, which is what most rule lessons want.

## Content

`src/lib/learning/content.ts` holds the curriculum: 4 sections, 15 lessons, 15 intro
slides and 100 exercises, each one written out by hand with its own position, hint and
explanation. Nothing is generated or cycled to fill a lesson.

`src/lib/learning/content.test.ts` replays every model solution through the engine and
checks that escape-check positions really start in check, that checkmate lines really end
in mate, that scripted mate replies are black's only legal move, and that no lesson repeats
a position. A broken FEN fails `npm test` rather than stranding a student mid-lesson.

Bump `LEARNING_CONTENT_VERSION` to re-seed. The seeder upserts by stable key and archives
exercises a lesson no longer lists.

## Lesson intros (INFORMATION)

Every lesson opens with a teaching slide before its first puzzle: three or four key points
and, usually, a worked line the student steps through on the board a move at a time.
`buildDemoTimeline` replays `goalConfig.demoMoves` and returns every position along the
way, plus the first problem it hits, so a bad demo move is reported rather than silently
stopping the board halfway.

A slide is replayed with its lesson's own rules, which means a movement lesson can
demonstrate on a king-less position and a chess lesson can demonstrate en passant. In a
`LEGAL_CHESS` demo the moves are a real game and must alternate colours.

Three things keep slides from distorting the numbers:

- They are keyed `<lesson>.intro` at `order: 0`, not `.01`. Adding a slide never renumbers
  a puzzle a student has already solved.
- They earn no stars, and they are left out of the star denominator, so "18 of 18 stars"
  still means eighteen solved puzzles.
- They pay XP only the first time. A button that cannot be failed would otherwise be a
  way to farm rewards.

## Student experience

- `/learn` - sections, lessons, progress and stars
- `/learn/[lessonSlug]` - exercise list with sequential unlocking
- `/learn/[lessonSlug]/[exerciseKey]` - the board player

The player shows the goal, highlights targets and blocked squares, marks legal
destinations for the piece being moved, offers a hint, enforces move budgets, and asks
which piece to promote to instead of assuming a queen. Three stars means no wrong moves,
no hints and no restarts.

## Authoring and analytics

- `/admin/learn` - pick an exercise, edit the FEN, goal, solution, script, hints and
  messages, with a live board preview. **Check** runs the draft through the student engine
  and reports what failed. A draft may be saved half-finished; publishing is refused unless
  the engine can solve it.
- `/admin/learn/analytics` - completion rate per lesson, star distribution, the ten
  hardest exercises (once at least three students have tried them), and recent attempts.

Coaches reach these screens too. `/admin/learn` is the one `/admin` route instructors may
open (see `auth.config.ts`); the `learnChess` permission is still checked on the page and
on every `/api/admin/learn` call via `requireLearnAuthoring`.

## Not built yet

- Section and lesson CRUD. The authoring screen edits exercises and slides; sections and
  lessons still come from the seed file.
- Per-student progress drill-down. Analytics is aggregate only.
- Assigning specific lessons to a batch, though the `assign` permission exists.
