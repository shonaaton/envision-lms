# Learn Chess Architecture

## Current LMS fit

- Frontend: Next.js App Router with server-rendered dashboard pages and client training components.
- Backend: Next.js route handlers with shared server utilities.
- Database: MongoDB through Mongoose models in `src/models`.
- Auth: NextAuth credentials flow in `src/lib/auth.ts`.
- Permissions: feature access and role permissions in `src/lib/featureRegistry.ts` and `src/lib/featureAccess.ts`.
- Chess foundation already present:
  - `react-chessboard`
  - `chess.js`
  - PGN/FEN helpers in `src/lib/pgnLibrary.ts`
  - responsive board wrapper in `src/components/homework/AssignmentChessboard.tsx`

## Learn Chess foundations added

- Feature wiring:
  - `learnChess` feature registry entry
  - sidebar navigation entry
  - student dashboard practice entry
- Data models:
  - `LearningSection`
  - `LearningLesson`
  - `LearningExercise`
  - `LearningAttempt`
  - `LearningExerciseProgress`
- Seeded curriculum:
  - 4 sections
  - 15 lessons
  - 100 published seeded exercise records
- Student pages:
  - `/learn`
  - `/learn/[lessonSlug]`

## Notes for the next phase

- The current slice establishes the LMS-native curriculum, progress rollups, and seeded content structure.
- The next implementation phase should add:
  - exercise player route and interaction engine
  - movement trainer validators
  - legal chess validation flow
  - attempt persistence APIs
  - star scoring and replay handling
  - coach/admin authoring and analytics screens
