import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ classrooms: vi.fn(), user: vi.fn(), batches: vi.fn() }));
vi.mock("@/models/Classroom", () => ({ Classroom: { find: mocks.classrooms } }));
vi.mock("@/models/User", () => ({ User: { findById: mocks.user } }));
vi.mock("@/models/Batch", () => ({ Batch: { find: mocks.batches } }));

import { studentHomeworkFilter } from "./studentHomeworkVisibility";

const STUDENT = "aaaaaaaaaaaaaaaaaaaaaaa1";
const OLD_CLASSROOM = "cccccccccccccccccccccc01";
const NEW_CLASSROOM = "cccccccccccccccccccccc02";
const OLD_BATCH = "bbbbbbbbbbbbbbbbbbbbbb01";
const NEW_BATCH = "bbbbbbbbbbbbbbbbbbbbbb02";
const EXIT = new Date("2026-09-10T12:00:00.000Z");

const lean = (value: unknown) => ({ lean: vi.fn().mockResolvedValue(value) });

function setup(classrooms: unknown[], batchIds: string[]) {
  mocks.classrooms.mockReturnValue(lean(classrooms));
  mocks.user.mockReturnValue(lean({ batches: batchIds }));
  mocks.batches.mockReturnValue(lean(batchIds.map((id) => ({ _id: id }))));
}

/** Would this clause set let the given homework through? */
function matches(filter: any, homework: Record<string, any>) {
  return filter.$or.some((clause: any) =>
    Object.entries(clause).every(([field, expected]: [string, any]) => {
      const actual = homework[field];
      if (expected && typeof expected === "object" && "$in" in expected) {
        return (expected.$in as any[]).map(String).includes(String(actual));
      }
      if (expected && typeof expected === "object" && "$lte" in expected) {
        return actual instanceof Date && actual.getTime() <= (expected.$lte as Date).getTime();
      }
      if (expected && typeof expected === "object" && "$size" in expected) {
        return Array.isArray(actual) && actual.length === expected.$size;
      }
      if (Array.isArray(actual)) return actual.map(String).includes(String(expected));
      return String(actual) === String(expected);
    }),
  );
}

const wholeClass = (classroom: string, createdAt: Date) => ({
  classroom,
  createdAt,
  assignAllStudents: true,
  assignedStudents: [],
  assignedBatches: [],
});
const toBatch = (batch: string, createdAt: Date) => ({
  createdAt,
  assignedStudents: [],
  assignedBatches: [batch],
  assignAllStudents: false,
});

beforeEach(() => vi.resetAllMocks());

describe("studentHomeworkFilter after a batch change", () => {
  beforeEach(() => {
    setup(
      [
        { _id: OLD_CLASSROOM, studentExits: [{ student: STUDENT, exitedAt: EXIT, fromBatch: OLD_BATCH }] },
        { _id: NEW_CLASSROOM, studentExits: [] },
      ],
      [NEW_BATCH],
    );
  });

  it("keeps homework the old classroom set before they left", async () => {
    const filter = await studentHomeworkFilter(STUDENT);
    expect(matches(filter, wholeClass(OLD_CLASSROOM, new Date("2026-09-01T10:00:00.000Z")))).toBe(true);
  });

  it("hides homework the old classroom set after they left", async () => {
    const filter = await studentHomeworkFilter(STUDENT);
    expect(matches(filter, wholeClass(OLD_CLASSROOM, new Date("2026-09-20T10:00:00.000Z")))).toBe(false);
  });

  it("keeps batch-wide homework from before the move and hides it afterwards", async () => {
    const filter = await studentHomeworkFilter(STUDENT);
    expect(matches(filter, toBatch(OLD_BATCH, new Date("2026-09-01T10:00:00.000Z")))).toBe(true);
    expect(matches(filter, toBatch(OLD_BATCH, new Date("2026-09-20T10:00:00.000Z")))).toBe(false);
  });

  it("gives them everything from the new batch, whenever it was set", async () => {
    const filter = await studentHomeworkFilter(STUDENT);
    expect(matches(filter, wholeClass(NEW_CLASSROOM, new Date("2026-12-01T10:00:00.000Z")))).toBe(true);
    expect(matches(filter, toBatch(NEW_BATCH, new Date("2026-12-01T10:00:00.000Z")))).toBe(true);
  });

  it("still delivers homework addressed to them by name after the move", async () => {
    const filter = await studentHomeworkFilter(STUDENT);
    expect(
      matches(filter, {
        classroom: OLD_CLASSROOM,
        createdAt: new Date("2026-12-01T10:00:00.000Z"),
        assignedStudents: [STUDENT],
        assignedBatches: [],
      }),
    ).toBe(true);
  });

  it("does not cut a batch the student is still sitting in", async () => {
    // Same classroom, two batches: leaving one must not hide the other's work.
    setup(
      [{ _id: OLD_CLASSROOM, studentExits: [{ student: STUDENT, exitedAt: EXIT, fromBatch: NEW_BATCH }] }],
      [NEW_BATCH],
    );
    const filter = await studentHomeworkFilter(STUDENT);
    expect(matches(filter, toBatch(NEW_BATCH, new Date("2026-12-01T10:00:00.000Z")))).toBe(true);
  });

  it("leaves a student who has never moved with the plain filter", async () => {
    setup([{ _id: NEW_CLASSROOM, studentExits: [] }], [NEW_BATCH]);
    const filter = await studentHomeworkFilter(STUDENT);
    expect(filter.$or).toHaveLength(4);
    expect(matches(filter, wholeClass(NEW_CLASSROOM, new Date("2026-12-01T10:00:00.000Z")))).toBe(true);
  });
});
