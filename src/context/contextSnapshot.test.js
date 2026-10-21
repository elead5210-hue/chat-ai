import { describe, it, expect } from "vitest";
import {
  applyContextUpdates,
  createSnapshot,
  generateConversationId,
  isSnapshotEmpty,
  normalizeSnapshot,
  updateSnapshot,
} from "./contextSnapshot.js";

function fresh() {
  return createSnapshot({ conversationId: "abc123" });
}

describe("generateConversationId", () => {
  it("returns unique non-empty ids", () => {
    const a = generateConversationId();
    const b = generateConversationId();
    expect(typeof a).toBe("string");
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe("createSnapshot", () => {
  it("creates an empty snapshot at version 1", () => {
    expect(fresh()).toEqual({
      conversation_id: "abc123",
      context_version: 1,
      summary: "",
      decisions: [],
      user_preferences: {},
      current_state: {},
      open_questions: [],
    });
  });

  it("generates a conversation id when none is given", () => {
    expect(createSnapshot().conversation_id).toMatch(/^conv-/);
  });
});

describe("normalizeSnapshot", () => {
  it("fills in defaults for missing or invalid input", () => {
    for (const input of [undefined, null, "text", 42, []]) {
      const s = normalizeSnapshot(input);
      expect(s.context_version).toBe(1);
      expect(s.summary).toBe("");
      expect(s.decisions).toEqual([]);
      expect(s.user_preferences).toEqual({});
      expect(s.current_state).toEqual({});
      expect(s.open_questions).toEqual([]);
      expect(s.conversation_id.length).toBeGreaterThan(0);
    }
  });

  it("keeps valid fields and trims strings", () => {
    const s = normalizeSnapshot({
      conversation_id: "  id1  ",
      context_version: 4,
      summary: "  Planning a trip  ",
      decisions: ["  Use React ", "Use React", "", 5, "Copy/paste only"],
      user_preferences: { tone: "brief" },
      current_state: { step: 2 },
      open_questions: ["Budget?"],
    });
    expect(s).toEqual({
      conversation_id: "id1",
      context_version: 4,
      summary: "Planning a trip",
      decisions: ["Use React", "Copy/paste only"],
      user_preferences: { tone: "brief" },
      current_state: { step: 2 },
      open_questions: ["Budget?"],
    });
  });

  it("resets invalid versions to 1", () => {
    for (const context_version of [0, -2, 1.5, "3", null]) {
      expect(normalizeSnapshot({ context_version }).context_version).toBe(1);
    }
  });

  it("ignores unknown keys and non-object preference fields", () => {
    const s = normalizeSnapshot({ extra: true, user_preferences: [1], current_state: "x" });
    expect(s).not.toHaveProperty("extra");
    expect(s.user_preferences).toEqual({});
    expect(s.current_state).toEqual({});
  });

  it("does not share object references with its input", () => {
    const input = { user_preferences: { a: 1 } };
    const s = normalizeSnapshot(input);
    s.user_preferences.a = 2;
    expect(input.user_preferences.a).toBe(1);
  });
});

describe("isSnapshotEmpty", () => {
  it("is true for a fresh snapshot and false once content exists", () => {
    expect(isSnapshotEmpty(fresh())).toBe(true);
    expect(isSnapshotEmpty({ ...fresh(), summary: "x" })).toBe(false);
    expect(isSnapshotEmpty({ ...fresh(), decisions: ["a"] })).toBe(false);
    expect(isSnapshotEmpty({ ...fresh(), open_questions: ["a"] })).toBe(false);
    expect(isSnapshotEmpty({ ...fresh(), user_preferences: { a: 1 } })).toBe(false);
    expect(isSnapshotEmpty({ ...fresh(), current_state: { a: 1 } })).toBe(false);
  });
});

describe("applyContextUpdates: basics", () => {
  it("returns a normalised snapshot unchanged for empty or invalid updates", () => {
    const s = fresh();
    expect(applyContextUpdates(s, [])).toEqual(s);
    expect(applyContextUpdates(s, undefined)).toEqual(s);
    expect(applyContextUpdates(s, "nope")).toEqual(s);
  });

  it("does not mutate its input", () => {
    const s = fresh();
    const copy = JSON.parse(JSON.stringify(s));
    applyContextUpdates(s, ["A decision", { key: "summary", value: "Hi" }]);
    expect(s).toEqual(copy);
  });

  it("bumps the version once per call, however many updates apply", () => {
    const next = applyContextUpdates(fresh(), [
      "One",
      "Two",
      { key: "summary", value: "S" },
    ]);
    expect(next.context_version).toBe(2);
  });

  it("does not bump the version when nothing changes", () => {
    const s = applyContextUpdates(fresh(), ["One"]);
    const again = applyContextUpdates(s, ["One"]);
    expect(again.context_version).toBe(s.context_version);
    expect(again).toEqual(s);
  });

  it("ignores malformed updates without bumping the version", () => {
    const s = fresh();
    const next = applyContextUpdates(s, [null, 42, {}, { key: "" }, { key: 5, value: 1 }]);
    expect(next).toEqual(s);
  });
});

describe("applyContextUpdates: string and key/value updates", () => {
  it("adds a plain string to decisions without duplicates", () => {
    const next = applyContextUpdates(fresh(), ["Use React", "Use React", "  "]);
    expect(next.decisions).toEqual(["Use React"]);
  });

  it("sets the summary", () => {
    const next = applyContextUpdates(fresh(), [{ key: "summary", value: "  New summary " }]);
    expect(next.summary).toBe("New summary");
  });

  it("replaces decisions and open_questions lists", () => {
    const s = applyContextUpdates(fresh(), [
      { key: "decisions", value: ["a", "b"] },
      { key: "open_questions", value: ["q1"] },
    ]);
    expect(s.decisions).toEqual(["a", "b"]);
    expect(s.open_questions).toEqual(["q1"]);

    const replaced = applyContextUpdates(s, [{ key: "decisions", value: ["c"] }]);
    expect(replaced.decisions).toEqual(["c"]);
  });

  it("treats a single non-array list value as one item", () => {
    const next = applyContextUpdates(fresh(), [{ key: "open_questions", value: "Budget?" }]);
    expect(next.open_questions).toEqual(["Budget?"]);
  });

  it("merges objects into user_preferences and current_state", () => {
    let s = applyContextUpdates(fresh(), [
      { key: "user_preferences", value: { tone: "brief" } },
      { key: "current_state", value: { step: 1 } },
    ]);
    s = applyContextUpdates(s, [
      { key: "user_preferences", value: { month: "December" } },
      { key: "current_state", value: { step: 2 } },
    ]);
    expect(s.user_preferences).toEqual({ tone: "brief", month: "December" });
    expect(s.current_state).toEqual({ step: 2 });
  });

  it("ignores non-object values for object fields", () => {
    const s = fresh();
    expect(applyContextUpdates(s, [{ key: "user_preferences", value: "x" }])).toEqual(s);
  });

  it("stores legacy free-form keys in current_state", () => {
    const next = applyContextUpdates(fresh(), [{ key: "goal", value: "Plan a trip" }]);
    expect(next.current_state).toEqual({ goal: "Plan a trip" });
  });

  it("accepts the legacy path form", () => {
    const next = applyContextUpdates(fresh(), [{ path: "goal", value: "Plan" }]);
    expect(next.current_state.goal).toBe("Plan");
  });
});

describe("applyContextUpdates: explicit operations", () => {
  it("adds and removes list items", () => {
    let s = applyContextUpdates(fresh(), [
      { op: "add", field: "open_questions", value: "Budget?" },
      { op: "add", field: "open_questions", value: "Dates?" },
      { op: "add", field: "open_questions", value: "Budget?" },
    ]);
    expect(s.open_questions).toEqual(["Budget?", "Dates?"]);

    s = applyContextUpdates(s, [{ op: "remove", field: "open_questions", value: "Budget?" }]);
    expect(s.open_questions).toEqual(["Dates?"]);
  });

  it("sets a whole list with op set", () => {
    const s = applyContextUpdates(fresh(), [
      { op: "set", field: "decisions", value: ["x", "y"] },
    ]);
    expect(s.decisions).toEqual(["x", "y"]);
  });

  it("sets, removes and merges keys in object fields", () => {
    let s = applyContextUpdates(fresh(), [
      { op: "set", field: "current_state", key: "step", value: 2 },
      { op: "set", field: "user_preferences", key: "tone", value: "brief" },
    ]);
    expect(s.current_state).toEqual({ step: 2 });
    expect(s.user_preferences).toEqual({ tone: "brief" });

    s = applyContextUpdates(s, [
      { op: "remove", field: "current_state", key: "step" },
      { op: "merge", field: "user_preferences", value: { month: "May" } },
    ]);
    expect(s.current_state).toEqual({});
    expect(s.user_preferences).toEqual({ tone: "brief", month: "May" });
  });

  it("sets the summary with op set", () => {
    const s = applyContextUpdates(fresh(), [{ op: "set", field: "summary", value: "Hello" }]);
    expect(s.summary).toBe("Hello");
  });

  it("ignores unknown operations and fields", () => {
    const s = fresh();
    const next = applyContextUpdates(s, [
      { op: "explode", field: "decisions", value: "x" },
      { op: "add", field: "nonsense", value: "x" },
      { op: "set", field: "current_state", value: 1 },
    ]);
    expect(next).toEqual(s);
  });
});

describe("updateSnapshot", () => {
  it("changes fields directly and bumps the version", () => {
    const s = fresh();
    const next = updateSnapshot(s, { summary: "Edited", decisions: ["a"] });
    expect(next.summary).toBe("Edited");
    expect(next.decisions).toEqual(["a"]);
    expect(next.context_version).toBe(2);
  });

  it("keeps identity fields even if the changes try to override them", () => {
    const next = updateSnapshot(fresh(), {
      conversation_id: "other",
      context_version: 99,
      summary: "x",
    });
    expect(next.conversation_id).toBe("abc123");
    expect(next.context_version).toBe(2);
  });

  it("returns the same content without a version bump when nothing changed", () => {
    const s = fresh();
    expect(updateSnapshot(s, { summary: "" })).toEqual(s);
    expect(updateSnapshot(s, null)).toEqual(s);
  });
});