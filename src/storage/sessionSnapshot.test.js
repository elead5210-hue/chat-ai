import { describe, it, expect } from "vitest";
import {
  SNAPSHOT_VERSION,
  createSessionSnapshot,
  restoreSessionSnapshot,
} from "./sessionSnapshot.js";

const CONTEXT = {
  conversation_id: "conv-1",
  context_version: 3,
  summary: "User is writing a report.",
  decisions: ["Use plain language"],
  user_preferences: { tone: "formal" },
  current_state: { step: "scope" },
  open_questions: ["How long should it be?"],
};

const MESSAGES = [
  { id: "welcome", role: "assistant", content: "What would you like to work on?" },
  { id: "m1", role: "user", content: "A report on churn." },
  { id: "m2", role: "assistant", content: "Who is it for?" },
];

const RESPONSE = {
  protocol: "nexus",
  version: "1.0",
  message: { role: "assistant", content: "Who is it for?" },
  components: [{ id: "audience", type: "text", label: "Audience" }],
  context_updates: [],
  state_updates: [],
  next_action: "await_user",
};

const CHECKLIST = [
  { id: "audience", label: "Who the document is for", satisfied: true },
  { id: "scope", label: "What it covers", satisfied: false },
];

function makeState(overrides = {}) {
  return {
    messages: MESSAGES,
    context: CONTEXT,
    uiState: { audience: "Executives" },
    instruction: "Be brief.",
    lastResponse: RESPONSE,
    checklist: CHECKLIST,
    documentMarkdown: "# Report",
    ...overrides,
  };
}

function makeSnapshot(overrides = {}) {
  return { ...createSessionSnapshot(makeState(), 1000), ...overrides };
}

describe("createSessionSnapshot", () => {
  it("records the version, the time and every part of the session", () => {
    const snapshot = createSessionSnapshot(makeState(), 1234);

    expect(snapshot).toEqual({
      version: SNAPSHOT_VERSION,
      savedAt: 1234,
      messages: MESSAGES,
      context: CONTEXT,
      uiState: { audience: "Executives" },
      instruction: "Be brief.",
      lastResponse: RESPONSE,
      checklist: CHECKLIST,
      documentMarkdown: "# Report",
    });
  });

  it("uses the current time when none is given", () => {
    const before = Date.now();
    const snapshot = createSessionSnapshot(makeState());
    expect(snapshot.savedAt).toBeGreaterThanOrEqual(before);
    expect(snapshot.savedAt).toBeLessThanOrEqual(Date.now());
  });

  it("fills in empty defaults for missing parts", () => {
    const snapshot = createSessionSnapshot({}, 1);
    expect(snapshot.messages).toEqual([]);
    expect(snapshot.context).toEqual({});
    expect(snapshot.uiState).toEqual({});
    expect(snapshot.instruction).toBeNull();
    expect(snapshot.lastResponse).toBeNull();
    expect(snapshot.checklist).toEqual([]);
    expect(snapshot.documentMarkdown).toBe("");
  });

  it("works with no argument at all", () => {
    expect(createSessionSnapshot().version).toBe(SNAPSHOT_VERSION);
  });

  it("replaces parts of the wrong type with empty defaults", () => {
    const snapshot = createSessionSnapshot(
      {
        messages: "x",
        context: [],
        uiState: 5,
        instruction: 7,
        lastResponse: "x",
        checklist: {},
        documentMarkdown: null,
      },
      1
    );
    expect(snapshot.messages).toEqual([]);
    expect(snapshot.context).toEqual({});
    expect(snapshot.uiState).toEqual({});
    expect(snapshot.instruction).toBeNull();
    expect(snapshot.lastResponse).toBeNull();
    expect(snapshot.checklist).toEqual([]);
    expect(snapshot.documentMarkdown).toBe("");
  });

  it("copies the data so later changes do not alter the snapshot", () => {
    const state = makeState({ uiState: { audience: "Executives" } });
    const snapshot = createSessionSnapshot(state, 1);

    state.uiState.audience = "Changed";
    state.messages.push({ id: "m3", role: "user", content: "More" });

    expect(snapshot.uiState.audience).toBe("Executives");
    expect(snapshot.messages).toHaveLength(MESSAGES.length);
  });

  it("does not mutate the state it is given", () => {
    const state = makeState();
    const copy = JSON.parse(JSON.stringify(state));
    createSessionSnapshot(state, 1);
    expect(state).toEqual(copy);
  });

  it("produces data that survives a JSON round trip unchanged", () => {
    const snapshot = createSessionSnapshot(makeState(), 1);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe("restoreSessionSnapshot", () => {
  it("restores every part of a valid snapshot", () => {
    const result = restoreSessionSnapshot(makeSnapshot({ savedAt: 4321 }));

    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      messages: MESSAGES,
      context: CONTEXT,
      uiState: { audience: "Executives" },
      instruction: "Be brief.",
      lastResponse: RESPONSE,
      checklist: CHECKLIST,
      documentMarkdown: "# Report",
      savedAt: 4321,
    });
  });

  it("round-trips what createSessionSnapshot produced", () => {
    const snapshot = createSessionSnapshot(makeState(), 99);
    const result = restoreSessionSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(result.ok).toBe(true);
    expect(result.value.messages).toEqual(MESSAGES);
    expect(result.value.context).toEqual(CONTEXT);
    expect(result.value.checklist).toEqual(CHECKLIST);
  });

  it("returns copies so the stored object is not shared with the live state", () => {
    const snapshot = makeSnapshot();
    const result = restoreSessionSnapshot(snapshot);
    expect(result.value.messages).not.toBe(snapshot.messages);
    expect(result.value.context).not.toBe(snapshot.context);
    result.value.uiState.audience = "Changed";
    expect(snapshot.uiState.audience).toBe("Executives");
  });

  it("restores a null instruction and last response", () => {
    const result = restoreSessionSnapshot(
      makeSnapshot({ instruction: null, lastResponse: null })
    );
    expect(result.ok).toBe(true);
    expect(result.value.instruction).toBeNull();
    expect(result.value.lastResponse).toBeNull();
  });

  it("fills in defaults for optional parts that are missing", () => {
    const snapshot = makeSnapshot();
    delete snapshot.uiState;
    delete snapshot.instruction;
    delete snapshot.lastResponse;
    delete snapshot.checklist;
    delete snapshot.documentMarkdown;
    delete snapshot.savedAt;

    const result = restoreSessionSnapshot(snapshot);

    expect(result.ok).toBe(true);
    expect(result.value.uiState).toEqual({});
    expect(result.value.instruction).toBeNull();
    expect(result.value.lastResponse).toBeNull();
    expect(result.value.checklist).toEqual([]);
    expect(result.value.documentMarkdown).toBe("");
    expect(result.value.savedAt).toBeNull();
  });

  it("keeps only id, role and content on each message", () => {
    const result = restoreSessionSnapshot(
      makeSnapshot({
        messages: [{ id: "m1", role: "user", content: "Hi", extra: "ignored" }],
      })
    );
    expect(result.value.messages).toEqual([{ id: "m1", role: "user", content: "Hi" }]);
  });

  it.each([[null], [undefined], ["x"], [42], [[]]])("rejects %s", (value) => {
    const result = restoreSessionSnapshot(value);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/not an object/);
  });

  it.each([[0], [2], ["1"], [undefined], [null]])(
    "rejects version %s as unsupported",
    (version) => {
      const result = restoreSessionSnapshot(makeSnapshot({ version }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/unsupported version/);
    }
  );

  describe("messages", () => {
    it.each([[undefined], [null], ["x"], [{}], [[]]])("rejects %s", (messages) => {
      const result = restoreSessionSnapshot(makeSnapshot({ messages }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/messages must be a non-empty array/);
    });

    it("rejects a message that is not an object", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ messages: ["hello"] }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/messages\[0\] must be an object/);
    });

    it("rejects a missing or empty id", () => {
      for (const id of [undefined, "", "   ", 5]) {
        const result = restoreSessionSnapshot(
          makeSnapshot({ messages: [{ id, role: "user", content: "Hi" }] })
        );
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/messages\[0\]\.id/);
      }
    });

    it("rejects duplicate ids", () => {
      const result = restoreSessionSnapshot(
        makeSnapshot({
          messages: [
            { id: "m1", role: "user", content: "One" },
            { id: "m1", role: "user", content: "Two" },
          ],
        })
      );
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/messages\[1\]\.id "m1" is a duplicate/);
    });

    it("rejects an unknown role", () => {
      const result = restoreSessionSnapshot(
        makeSnapshot({ messages: [{ id: "m1", role: "system", content: "Hi" }] })
      );
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/messages\[0\]\.role/);
    });

    it("rejects blank or non-string content", () => {
      for (const content of [undefined, "", "   ", 5, null]) {
        const result = restoreSessionSnapshot(
          makeSnapshot({ messages: [{ id: "m1", role: "user", content }] })
        );
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/messages\[0\]\.content/);
      }
    });
  });

  describe("context", () => {
    function withContext(changes) {
      return makeSnapshot({ context: { ...CONTEXT, ...changes } });
    }

    it.each([[undefined], [null], ["x"], [[]]])("rejects %s", (context) => {
      const result = restoreSessionSnapshot(makeSnapshot({ context }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/context must be an object/);
    });

    it("rejects a missing conversation id", () => {
      const result = restoreSessionSnapshot(withContext({ conversation_id: "" }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/conversation_id/);
    });

    it.each([[0], [-1], [1.5], ["3"], [undefined]])(
      "rejects context_version %s",
      (context_version) => {
        const result = restoreSessionSnapshot(withContext({ context_version }));
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/context_version/);
      }
    );

    it("rejects a summary that is not a string", () => {
      const result = restoreSessionSnapshot(withContext({ summary: 5 }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/summary/);
    });

    it("rejects list fields that are not arrays of strings", () => {
      for (const field of ["decisions", "open_questions"]) {
        for (const value of ["x", [1], {}, undefined]) {
          const result = restoreSessionSnapshot(withContext({ [field]: value }));
          expect(result.ok).toBe(false);
          expect(result.errors[0]).toContain(field);
        }
      }
    });

    it("rejects object fields that are not objects", () => {
      for (const field of ["user_preferences", "current_state"]) {
        for (const value of ["x", [], null, undefined]) {
          const result = restoreSessionSnapshot(withContext({ [field]: value }));
          expect(result.ok).toBe(false);
          expect(result.errors[0]).toContain(field);
        }
      }
    });
  });

  describe("checklist", () => {
    it("accepts an empty checklist", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ checklist: [] }));
      expect(result.ok).toBe(true);
      expect(result.value.checklist).toEqual([]);
    });

    it.each([["x"], [{}], [5], [null]])("rejects %s", (checklist) => {
      const result = restoreSessionSnapshot(makeSnapshot({ checklist }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/checklist must be an array/);
    });

    it("rejects an item that is not an object", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ checklist: ["a"] }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/checklist\[0\] must be an object/);
    });

    it("rejects a missing or duplicate id", () => {
      for (const checklist of [
        [{ label: "A", satisfied: false }],
        [
          { id: "a", label: "A", satisfied: false },
          { id: "a", label: "B", satisfied: false },
        ],
      ]) {
        const result = restoreSessionSnapshot(makeSnapshot({ checklist }));
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/\.id must be a unique non-empty string/);
      }
    });

    it("rejects a missing label", () => {
      const result = restoreSessionSnapshot(
        makeSnapshot({ checklist: [{ id: "a", satisfied: false }] })
      );
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/\.label/);
    });

    it.each([["true"], [1], [null], [undefined]])(
      "rejects satisfied value %s",
      (satisfied) => {
        const result = restoreSessionSnapshot(
          makeSnapshot({ checklist: [{ id: "a", label: "A", satisfied }] })
        );
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toMatch(/\.satisfied must be a boolean/);
      }
    );
  });

  describe("other parts", () => {
    it("rejects a uiState that is not an object", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ uiState: "x" }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/uiState/);
    });

    it("rejects an instruction that is not a string", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ instruction: 5 }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/instruction/);
    });

    it("rejects a last response that is not an object", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ lastResponse: "x" }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/lastResponse/);
    });

    it("rejects a document that is not a string", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ documentMarkdown: 5 }));
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/documentMarkdown/);
    });

    it("ignores a savedAt that is not a number", () => {
      const result = restoreSessionSnapshot(makeSnapshot({ savedAt: "yesterday" }));
      expect(result.ok).toBe(true);
      expect(result.value.savedAt).toBeNull();
    });
  });

  it("does not mutate the snapshot it is given", () => {
    const snapshot = makeSnapshot();
    const copy = JSON.parse(JSON.stringify(snapshot));
    restoreSessionSnapshot(snapshot);
    expect(snapshot).toEqual(copy);
  });
});