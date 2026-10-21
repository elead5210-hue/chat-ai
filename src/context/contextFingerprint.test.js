import { describe, it, expect } from "vitest";
import {
  FINGERPRINT_HEX_LENGTH,
  FINGERPRINT_PATTERN,
  FINGERPRINT_PREFIX,
  canonicalJson,
  computeContextFingerprint,
  hashText,
  isSameSnapshot,
  isValidFingerprint,
  matchesFingerprint,
} from "./contextFingerprint.js";
import {
  applyContextUpdates,
  createSnapshot,
  normalizeSnapshot,
  updateSnapshot,
} from "./contextSnapshot.js";

function baseSnapshot() {
  return {
    conversation_id: "conv-fixed",
    context_version: 2,
    summary: "User is planning a 7-day holiday.",
    decisions: ["Trip will be 7 days long"],
    user_preferences: { travel_style: "Comfort" },
    current_state: { step: "choose_dates" },
    open_questions: ["What is the budget?"],
  };
}

describe("constants", () => {
  it("describes the CTX-XXXXXX format", () => {
    expect(FINGERPRINT_PREFIX).toBe("CTX-");
    expect(FINGERPRINT_HEX_LENGTH).toBe(6);
    expect(FINGERPRINT_PATTERN.test("CTX-7F92A1")).toBe(true);
  });
});

describe("canonicalJson", () => {
  it("sorts object keys", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys at every level", () => {
    expect(canonicalJson({ z: 1, a: { d: 1, c: { y: 2, x: 1 } } })).toBe(
      '{"a":{"c":{"x":1,"y":2},"d":1},"z":1}'
    );
  });

  it("sorts keys of objects inside arrays", () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("preserves array order", () => {
    expect(canonicalJson({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
    expect(canonicalJson(["b", "a"])).not.toBe(canonicalJson(["a", "b"]));
  });

  it("emits no whitespace between tokens", () => {
    expect(canonicalJson({ a: [1, 2], b: { c: "x y" } })).toBe('{"a":[1,2],"b":{"c":"x y"}}');
  });

  it("gives the same output regardless of key insertion order", () => {
    const a = { one: 1, two: { x: 1, y: 2 }, three: [1, 2] };
    const b = { three: [1, 2], two: { y: 2, x: 1 }, one: 1 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });

  it("serialises primitives like JSON", () => {
    expect(canonicalJson("text")).toBe('"text"');
    expect(canonicalJson(5)).toBe("5");
    expect(canonicalJson(-1.5)).toBe("-1.5");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson(null)).toBe("null");
  });

  it("escapes strings and keys", () => {
    expect(canonicalJson('say "hi"\n')).toBe(JSON.stringify('say "hi"\n'));
    expect(canonicalJson({ 'a"b': 1 })).toBe('{"a\\"b":1}');
  });

  it("drops undefined, function and symbol members", () => {
    expect(canonicalJson({ a: undefined, b: 1, c: () => 1, d: Symbol("x") })).toBe('{"b":1}');
  });

  it("writes null for unrepresentable array items", () => {
    expect(canonicalJson([1, undefined, () => 1])).toBe("[1,null,null]");
  });

  it("writes null for non-finite numbers", () => {
    expect(canonicalJson({ n: NaN, i: Infinity })).toBe('{"i":null,"n":null}');
  });

  it("writes null for a top-level undefined", () => {
    expect(canonicalJson(undefined)).toBe("null");
  });

  it("uses toJSON when a value provides one", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(canonicalJson({ when: date })).toBe('{"when":"2026-01-01T00:00:00.000Z"}');
  });

  it("serialises bigint values as strings", () => {
    expect(canonicalJson({ big: 12n })).toBe('{"big":"12"}');
  });

  it("accepts the same object referenced twice", () => {
    const shared = { a: 1 };
    expect(canonicalJson({ x: shared, y: shared })).toBe('{"x":{"a":1},"y":{"a":1}}');
  });

  it("throws on circular references", () => {
    const loop = { name: "loop" };
    loop.self = loop;
    expect(() => canonicalJson(loop)).toThrow(TypeError);
  });

  it("does not mutate its input", () => {
    const value = { b: [2, 1], a: { d: 1, c: 2 } };
    const copy = JSON.parse(JSON.stringify(value));
    canonicalJson(value);
    expect(value).toEqual(copy);
    expect(Object.keys(value)).toEqual(["b", "a"]);
  });
});

describe("hashText", () => {
  it("returns six uppercase hex characters", () => {
    for (const text of ["", "a", "hello world", "x".repeat(1000), "héllo ✓"]) {
      expect(hashText(text)).toMatch(/^[0-9A-F]{6}$/);
    }
  });

  it("is deterministic", () => {
    expect(hashText("same input")).toBe(hashText("same input"));
  });

  it("matches known values", () => {
    expect(hashText("")).toBe("1C9D44");
    expect(hashText("a")).toBe("0C29C8");
    expect(hashText("abc")).toBe("47E911");
  });

  it("pads short results with leading zeros", () => {
    expect(hashText("a")).toHaveLength(6);
    expect(hashText("a").startsWith("0")).toBe(true);
  });

  it("is sensitive to small changes and to order", () => {
    expect(hashText("abc")).not.toBe(hashText("abd"));
    expect(hashText("abc")).not.toBe(hashText("cba"));
    expect(hashText("abc")).not.toBe(hashText("abc "));
  });

  it("spreads many different inputs across distinct values", () => {
    const seen = new Set();
    for (let i = 0; i < 500; i += 1) seen.add(hashText(`input-${i}`));
    expect(seen.size).toBe(500);
  });

  it("converts non-string input to text", () => {
    expect(hashText(123)).toBe(hashText("123"));
  });
});

describe("computeContextFingerprint", () => {
  describe("format", () => {
    it("looks like CTX-XXXXXX", () => {
      const fingerprint = computeContextFingerprint(baseSnapshot());
      expect(fingerprint).toMatch(/^CTX-[0-9A-F]{6}$/);
      expect(FINGERPRINT_PATTERN.test(fingerprint)).toBe(true);
      expect(fingerprint.startsWith(FINGERPRINT_PREFIX)).toBe(true);
    });

    it("is valid for a freshly created snapshot", () => {
      expect(computeContextFingerprint(createSnapshot({ conversationId: "c1" }))).toMatch(
        /^CTX-[0-9A-F]{6}$/
      );
    });

    it("is valid even when the input has no conversation id", () => {
      expect(computeContextFingerprint({ summary: "x" })).toMatch(/^CTX-[0-9A-F]{6}$/);
      expect(computeContextFingerprint(null)).toMatch(/^CTX-[0-9A-F]{6}$/);
    });

    it("matches a known value for a fixed snapshot", () => {
      expect(computeContextFingerprint(baseSnapshot())).toBe("CTX-C09833");
    });
  });

  describe("determinism", () => {
    it("returns the same fingerprint for the same snapshot", () => {
      const snapshot = baseSnapshot();
      expect(computeContextFingerprint(snapshot)).toBe(computeContextFingerprint(snapshot));
    });

    it("returns the same fingerprint for separate copies with the same content", () => {
      expect(computeContextFingerprint(baseSnapshot())).toBe(
        computeContextFingerprint(baseSnapshot())
      );
    });

    it("survives a JSON round trip", () => {
      const snapshot = baseSnapshot();
      const copy = JSON.parse(JSON.stringify(snapshot));
      expect(computeContextFingerprint(copy)).toBe(computeContextFingerprint(snapshot));
    });

    it("does not mutate the snapshot", () => {
      const snapshot = baseSnapshot();
      const copy = JSON.parse(JSON.stringify(snapshot));
      computeContextFingerprint(snapshot);
      expect(snapshot).toEqual(copy);
    });
  });

  describe("key-order independence", () => {
    it("ignores the order of top-level keys", () => {
      const reordered = {
        open_questions: ["What is the budget?"],
        current_state: { step: "choose_dates" },
        user_preferences: { travel_style: "Comfort" },
        decisions: ["Trip will be 7 days long"],
        summary: "User is planning a 7-day holiday.",
        context_version: 2,
        conversation_id: "conv-fixed",
      };
      expect(computeContextFingerprint(reordered)).toBe(computeContextFingerprint(baseSnapshot()));
    });

    it("ignores the order of keys inside preferences and state", () => {
      const a = {
        ...baseSnapshot(),
        user_preferences: { travel_style: "Comfort", month: "December", companions: 2 },
        current_state: { step: "choose_dates", shortlist: ["Lisbon"] },
      };
      const b = {
        ...baseSnapshot(),
        user_preferences: { companions: 2, month: "December", travel_style: "Comfort" },
        current_state: { shortlist: ["Lisbon"], step: "choose_dates" },
      };
      expect(computeContextFingerprint(a)).toBe(computeContextFingerprint(b));
    });

    it("ignores the order of keys in nested values", () => {
      const a = { ...baseSnapshot(), current_state: { filter: { min: 1, max: 5 } } };
      const b = { ...baseSnapshot(), current_state: { filter: { max: 5, min: 1 } } };
      expect(computeContextFingerprint(a)).toBe(computeContextFingerprint(b));
    });

    it("does not ignore the order of list items", () => {
      const a = { ...baseSnapshot(), decisions: ["First", "Second"] };
      const b = { ...baseSnapshot(), decisions: ["Second", "First"] };
      expect(computeContextFingerprint(a)).not.toBe(computeContextFingerprint(b));
    });
  });

  describe("normalisation", () => {
    it("treats a partial snapshot like its normalised form", () => {
      const partial = { conversation_id: "conv-fixed", summary: "Only a summary" };
      expect(computeContextFingerprint(partial)).toBe(
        computeContextFingerprint(normalizeSnapshot(partial))
      );
    });

    it("ignores surrounding whitespace in text", () => {
      const a = { ...baseSnapshot(), summary: "  User is planning a 7-day holiday.  " };
      expect(computeContextFingerprint(a)).toBe(computeContextFingerprint(baseSnapshot()));
    });

    it("ignores duplicate and blank list items", () => {
      const a = {
        ...baseSnapshot(),
        decisions: ["Trip will be 7 days long", "Trip will be 7 days long", "  "],
      };
      expect(computeContextFingerprint(a)).toBe(computeContextFingerprint(baseSnapshot()));
    });

    it("ignores unknown keys", () => {
      const a = { ...baseSnapshot(), goal: "Plan a trip", extra: { nested: true } };
      expect(computeContextFingerprint(a)).toBe(computeContextFingerprint(baseSnapshot()));
    });
  });

  describe("different content gives a different fingerprint", () => {
    const base = computeContextFingerprint(baseSnapshot());

    const changes = [
      ["conversation id", { conversation_id: "conv-other" }],
      ["context version", { context_version: 3 }],
      ["summary", { summary: "User is planning a 10-day holiday." }],
      ["an added decision", { decisions: ["Trip will be 7 days long", "Travel in December"] }],
      ["a removed decision", { decisions: [] }],
      ["an edited decision", { decisions: ["Trip will be 8 days long"] }],
      ["a preference value", { user_preferences: { travel_style: "Luxury" } }],
      ["an added preference", { user_preferences: { travel_style: "Comfort", month: "May" } }],
      ["a state value", { current_state: { step: "choose_hotel" } }],
      ["a state value type", { current_state: { step: 2 } }],
      ["an added state key", { current_state: { step: "choose_dates", nights: 7 } }],
      ["an added open question", { open_questions: ["What is the budget?", "Which airport?"] }],
      ["a removed open question", { open_questions: [] }],
      ["an edited open question", { open_questions: ["What is the total budget?"] }],
    ];

    it.each(changes)("changes when %s changes", (_label, change) => {
      const changed = computeContextFingerprint({ ...baseSnapshot(), ...change });
      expect(changed).not.toBe(base);
    });

    it("gives every single-field change its own fingerprint", () => {
      const fingerprints = changes.map(([, change]) =>
        computeContextFingerprint({ ...baseSnapshot(), ...change })
      );
      expect(new Set([base, ...fingerprints]).size).toBe(changes.length + 1);
    });

    it("does not confuse the same text in different fields", () => {
      const asSummary = { ...createSnapshot({ conversationId: "c" }), summary: "Same text" };
      const asDecision = { ...createSnapshot({ conversationId: "c" }), decisions: ["Same text"] };
      const asQuestion = { ...createSnapshot({ conversationId: "c" }), open_questions: ["Same text"] };
      const fingerprints = [asSummary, asDecision, asQuestion].map(computeContextFingerprint);
      expect(new Set(fingerprints).size).toBe(3);
    });
  });

  describe("versioning", () => {
    it("gives a new fingerprint when the user changes something", () => {
      const before = createSnapshot({ conversationId: "conv-v" });
      const after = updateSnapshot(before, { summary: "A new summary" });

      expect(after.context_version).toBe(before.context_version + 1);
      expect(computeContextFingerprint(after)).not.toBe(computeContextFingerprint(before));
    });

    it("gives a new fingerprint when an AI response updates the context", () => {
      const before = createSnapshot({ conversationId: "conv-v" });
      const after = applyContextUpdates(before, [{ key: "summary", value: "Planning a trip." }]);

      expect(after.context_version).toBe(2);
      expect(computeContextFingerprint(after)).not.toBe(computeContextFingerprint(before));
    });

    it("keeps the fingerprint when an update changes nothing", () => {
      const before = applyContextUpdates(createSnapshot({ conversationId: "conv-v" }), [
        { key: "summary", value: "Planning a trip." },
      ]);
      const same = applyContextUpdates(before, [{ key: "summary", value: "Planning a trip." }]);
      const none = applyContextUpdates(before, []);

      expect(computeContextFingerprint(same)).toBe(computeContextFingerprint(before));
      expect(computeContextFingerprint(none)).toBe(computeContextFingerprint(before));
    });

    it("gives a different fingerprint to every step in a chain of changes", () => {
      let snapshot = createSnapshot({ conversationId: "conv-chain" });
      const fingerprints = [computeContextFingerprint(snapshot)];

      for (const update of [
        [{ key: "summary", value: "Step one" }],
        ["A decision"],
        [{ op: "add", field: "open_questions", value: "A question?" }],
        [{ key: "current_state", value: { step: 2 } }],
      ]) {
        snapshot = applyContextUpdates(snapshot, update);
        fingerprints.push(computeContextFingerprint(snapshot));
      }

      expect(new Set(fingerprints).size).toBe(fingerprints.length);
    });

    it("gives the same fingerprint to two sessions that reach the same snapshot", () => {
      const updates = [{ key: "summary", value: "Shared state" }, "Shared decision"];
      const first = applyContextUpdates(createSnapshot({ conversationId: "conv-shared" }), updates);
      const second = applyContextUpdates(createSnapshot({ conversationId: "conv-shared" }), updates);
      expect(computeContextFingerprint(first)).toBe(computeContextFingerprint(second));
    });
  });
});

describe("isValidFingerprint", () => {
  it("accepts well-formed fingerprints", () => {
    expect(isValidFingerprint("CTX-7F92A1")).toBe(true);
    expect(isValidFingerprint("CTX-000000")).toBe(true);
    expect(isValidFingerprint(computeContextFingerprint(baseSnapshot()))).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isValidFingerprint("CTX-7f92a1")).toBe(false);
    expect(isValidFingerprint("CTX-7F92A")).toBe(false);
    expect(isValidFingerprint("CTX-7F92A1B")).toBe(false);
    expect(isValidFingerprint("CTX-7F92G1")).toBe(false);
    expect(isValidFingerprint("ABC-7F92A1")).toBe(false);
    expect(isValidFingerprint("7F92A1")).toBe(false);
    expect(isValidFingerprint(" CTX-7F92A1")).toBe(false);
    expect(isValidFingerprint("CTX-7F92A1 ")).toBe(false);
    expect(isValidFingerprint("")).toBe(false);
  });

  it("rejects values that are not strings", () => {
    expect(isValidFingerprint(null)).toBe(false);
    expect(isValidFingerprint(undefined)).toBe(false);
    expect(isValidFingerprint(123456)).toBe(false);
    expect(isValidFingerprint({})).toBe(false);
  });
});

describe("isSameSnapshot", () => {
  it("is true for identical content", () => {
    expect(isSameSnapshot(baseSnapshot(), baseSnapshot())).toBe(true);
  });

  it("is true when only key order differs", () => {
    const reordered = {
      current_state: { step: "choose_dates" },
      summary: "User is planning a 7-day holiday.",
      conversation_id: "conv-fixed",
      open_questions: ["What is the budget?"],
      decisions: ["Trip will be 7 days long"],
      user_preferences: { travel_style: "Comfort" },
      context_version: 2,
    };
    expect(isSameSnapshot(reordered, baseSnapshot())).toBe(true);
  });

  it("is true when a partial snapshot normalises to the same content", () => {
    const partial = { conversation_id: "conv-x", summary: "Hello" };
    expect(isSameSnapshot(partial, normalizeSnapshot(partial))).toBe(true);
  });

  it("is false when any field differs", () => {
    expect(isSameSnapshot(baseSnapshot(), { ...baseSnapshot(), summary: "Different" })).toBe(false);
    expect(isSameSnapshot(baseSnapshot(), { ...baseSnapshot(), decisions: [] })).toBe(false);
    expect(
      isSameSnapshot(baseSnapshot(), { ...baseSnapshot(), current_state: { step: "other" } })
    ).toBe(false);
  });

  it("is false when only the version differs", () => {
    expect(isSameSnapshot(baseSnapshot(), { ...baseSnapshot(), context_version: 3 })).toBe(false);
  });

  it("is false when only the conversation differs", () => {
    expect(isSameSnapshot(baseSnapshot(), { ...baseSnapshot(), conversation_id: "conv-2" })).toBe(
      false
    );
  });

  it("agrees with fingerprint equality for these cases", () => {
    const a = baseSnapshot();
    const b = { ...baseSnapshot(), summary: "Different" };
    expect(isSameSnapshot(a, b)).toBe(
      computeContextFingerprint(a) === computeContextFingerprint(b)
    );
  });
});

describe("matchesFingerprint", () => {
  it("is true for the snapshot's own fingerprint", () => {
    const snapshot = baseSnapshot();
    expect(matchesFingerprint(snapshot, computeContextFingerprint(snapshot))).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    const snapshot = baseSnapshot();
    const fingerprint = computeContextFingerprint(snapshot);
    expect(matchesFingerprint(snapshot, fingerprint.toLowerCase())).toBe(true);
    expect(matchesFingerprint(snapshot, `  ${fingerprint}\n`)).toBe(true);
  });

  it("is false for another snapshot's fingerprint", () => {
    const other = computeContextFingerprint({ ...baseSnapshot(), summary: "Different" });
    expect(matchesFingerprint(baseSnapshot(), other)).toBe(false);
  });

  it("is false for malformed or non-string values", () => {
    expect(matchesFingerprint(baseSnapshot(), "CTX-ZZZZZZ")).toBe(false);
    expect(matchesFingerprint(baseSnapshot(), "")).toBe(false);
    expect(matchesFingerprint(baseSnapshot(), null)).toBe(false);
    expect(matchesFingerprint(baseSnapshot(), undefined)).toBe(false);
    expect(matchesFingerprint(baseSnapshot(), 12345)).toBe(false);
  });
});