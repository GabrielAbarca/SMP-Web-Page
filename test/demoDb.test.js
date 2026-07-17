import { describe, it, expect, beforeEach, vi } from "vitest";

// demoDb imports the Supabase client at module load; stub it out (the roster /
// student methods under test overlay deltas on realDb only and never touch it).
vi.mock("../src/js/supabaseClient.js", () => ({ supabase: {} }));

const { wrapDbForDemo } = await import("../src/js/demoDb.js");

let realDb;
let writes;
let db;

beforeEach(() => {
  const server = {
    21: [
      { id: 101, first_name: "Ana", last_name: "García", status: "active" },
      { id: 102, first_name: "Luis", last_name: "Martínez", status: "active" },
    ],
  };
  realDb = {
    fetchRoster: async (classId) => server[classId].map((s) => ({ ...s })),
    fetchActiveCountByClass: async () => ({ 21: 2 }),
  };
  writes = 0;
  db = wrapDbForDemo(realDb, { onWrite: () => writes++ });
});

describe("demoDb write sandbox — student deltas overlay reads", () => {
  it("insert appears in the roster and fires onWrite", async () => {
    await db.insertStudent({
      first_name: "New",
      last_name: "Student",
      class_id: 21,
      status: "active",
    });
    const roster = await db.fetchRoster(21);
    expect(roster).toHaveLength(3);
    expect(roster.some((s) => s.last_name === "Student")).toBe(true);
    // Local rows get negative ids so they never collide with server rows.
    expect(roster.find((s) => s.last_name === "Student").id).toBeLessThan(0);
    expect(writes).toBe(1);
  });

  it("delete removes a server row from the roster", async () => {
    await db.deleteStudent(101);
    const roster = await db.fetchRoster(21);
    expect(roster.find((s) => s.id === 101)).toBeUndefined();
    expect(roster).toHaveLength(1);
    expect(writes).toBe(1);
  });

  it("update patches a server row in place", async () => {
    await db.updateStudent(102, { last_name: "Changed" });
    const roster = await db.fetchRoster(21);
    expect(roster.find((s) => s.id === 102).last_name).toBe("Changed");
  });

  it("a class move edits the student out of the old roster", async () => {
    await db.updateStudent(102, { class_id: 99 });
    const roster = await db.fetchRoster(21);
    expect(roster.find((s) => s.id === 102)).toBeUndefined();
  });

  it("active counts reflect a local insert then delete", async () => {
    // The console always loads the roster before editing; that read warms the
    // pristine status/class the delete-decrement below keys off.
    await db.fetchRoster(21);
    await db.insertStudent({ class_id: 21, status: "active" });
    expect((await db.fetchActiveCountByClass())[21]).toBe(3);
    await db.deleteStudent(101);
    expect((await db.fetchActiveCountByClass())[21]).toBe(2);
  });
});
