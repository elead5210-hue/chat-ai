import { describe, it, expect } from "vitest";
import {
  EMPTY_PACKAGE_TEXT,
  buildContextPackage,
  buildContinuationPrompt,
} from "./contextPackage.js";
import { createSnapshot, updateSnapshot } from "./contextSnapshot.js";
import { computeContextFingerprint } from "./contextFingerprint.js";
import {
  RESPONSE_SCHEMA_EXAMPLE,
  RESPONSE_SCHEMA_RULES,
} from "../protocol/schema.js";

function fullSnapshot() {
  return {
    conversation_id: "conv-test-1",
    context_version: 4,
    summary: "User is planning a 7-day holiday.",
    decisions: ["Trip will be 7 days long", "Travel in December"],
    user_preferences: { travel_style: "Comfort", companions: 2, pets: false },
    current_state: { step: "choose_destination", shortlist: ["Lisbon", "Cape Town"] },
    open_questions: ["What is the budget?", "Which airport?"],
  };
}

describe("buildContextPackage", () => {
  describe("with a full snapshot", () => {
    it("includes the header with conversation id, version and fingerprint", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text.startsWith("CONTEXT PACKAGE")).toBe(true);
      expect(text).toContain("Conversation: conv-test-1");
      expect(text).toContain("Version: 4");
      expect(text).toContain(
        `Fingerprint: ${computeContextFingerprint(fullSnapshot())}`
      );
    });

    it("contains every snapshot section", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toContain("Summary:");
      expect(text).toContain("Important decisions:");
      expect(text).toContain("User preferences:");
      expect(text).toContain("Current state:");
      expect(text).toContain("Outstanding questions:");
    });

    it("includes the content of every section", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toContain("User is planning a 7-day holiday.");
      expect(text).toContain("Trip will be 7 days long");
      expect(text).toContain("Travel in December");
      expect(text).toContain("What is the budget?");
      expect(text).toContain("Which airport?");
    });

    it("numbers decisions and open questions", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toContain("1. Trip will be 7 days long");
      expect(text).toContain("2. Travel in December");
      expect(text).toContain("1. What is the budget?");
      expect(text).toContain("2. Which airport?");
    });

    it("renders preferences and state as key/value lines", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toContain("- travel_style: Comfort");
      expect(text).toContain("- companions: 2");
      expect(text).toContain("- pets: false");
      expect(text).toContain("- step: choose_destination");
    });

    it("renders nested values as single-line JSON", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toContain('- shortlist: ["Lisbon","Cape Town"]');
    });

    it("renders null values as the word null", () => {
      const text = buildContextPackage({
        ...fullSnapshot(),
        current_state: { selected: null },
      });
      expect(text).toContain("- selected: null");
    });

    it("lists sections in a stable order", () => {
      const text = buildContextPackage(fullSnapshot());
      const order = [
        "Summary:",
        "Important decisions:",
        "User preferences:",
        "Current state:",
        "Outstanding questions:",
      ].map((label) => text.indexOf(label));
      expect(order.every((index) => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    });

    it("separates sections with a blank line", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toMatch(/Fingerprint: CTX-[0-9A-F]{6}\n\nSummary:/);
      expect(text).toContain("\n\nImportant decisions:");
    });
  });

  describe("fingerprint", () => {
    function fingerprintOf(text) {
      return text.match(/^Fingerprint: (CTX-[0-9A-F]{6})$/m)[1];
    }

    it("includes a Fingerprint line in the CTX-XXXXXX format", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).toMatch(/^Fingerprint: CTX-[0-9A-F]{6}$/m);
    });

    it("uses the fingerprint computed from the snapshot", () => {
      const snapshot = fullSnapshot();
      expect(fingerprintOf(buildContextPackage(snapshot))).toBe(
        computeContextFingerprint(snapshot)
      );
    });

    it("sits in the header after the conversation and version lines", () => {
      const text = buildContextPackage(fullSnapshot());
      const conversation = text.indexOf("Conversation:");
      const version = text.indexOf("Version:");
      const fingerprint = text.indexOf("Fingerprint:");
      const summary = text.indexOf("Summary:");
      expect(conversation).toBeGreaterThan(-1);
      expect(version).toBeGreaterThan(conversation);
      expect(fingerprint).toBeGreaterThan(version);
      expect(summary).toBeGreaterThan(fingerprint);
    });

    it("appears exactly once", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text.match(/Fingerprint:/g)).toHaveLength(1);
    });

    it("is the same for separate copies of the same snapshot", () => {
      expect(fingerprintOf(buildContextPackage(fullSnapshot()))).toBe(
        fingerprintOf(buildContextPackage(fullSnapshot()))
      );
    });

    it("is the same when only the key order of the snapshot differs", () => {
      const reordered = {
        open_questions: ["What is the budget?", "Which airport?"],
        current_state: { shortlist: ["Lisbon", "Cape Town"], step: "choose_destination" },
        user_preferences: { pets: false, companions: 2, travel_style: "Comfort" },
        decisions: ["Trip will be 7 days long", "Travel in December"],
        summary: "User is planning a 7-day holiday.",
        context_version: 4,
        conversation_id: "conv-test-1",
      };
      expect(fingerprintOf(buildContextPackage(reordered))).toBe(
        fingerprintOf(buildContextPackage(fullSnapshot()))
      );
    });

    describe("changes when the content changes", () => {
      const changes = [
        ["the summary", { summary: "User is planning a 10-day holiday." }],
        ["a decision", { decisions: ["Trip will be 7 days long"] }],
        ["a preference", { user_preferences: { travel_style: "Luxury" } }],
        ["the current state", { current_state: { step: "choose_hotel" } }],
        ["an open question", { open_questions: ["What is the budget?"] }],
        ["the version", { context_version: 5 }],
      ];

      it.each(changes)("%s", (_label, change) => {
        const before = fingerprintOf(buildContextPackage(fullSnapshot()));
        const after = fingerprintOf(buildContextPackage({ ...fullSnapshot(), ...change }));
        expect(after).not.toBe(before);
      });

      it("after a user edit made through updateSnapshot", () => {
        const before = fullSnapshot();
        const after = updateSnapshot(before, { summary: "Now planning a 10-day holiday." });
        expect(fingerprintOf(buildContextPackage(after))).not.toBe(
          fingerprintOf(buildContextPackage(before))
        );
      });
    });

    it("is included for an empty snapshot", () => {
      const snapshot = createSnapshot({ conversationId: "empty-fp" });
      const text = buildContextPackage(snapshot);
      expect(fingerprintOf(text)).toBe(computeContextFingerprint(snapshot));
    });

    it("is omitted when the header is disabled", () => {
      const full = buildContextPackage(fullSnapshot(), { includeHeader: false });
      const empty = buildContextPackage(createSnapshot({ conversationId: "empty-fp" }), {
        includeHeader: false,
      });
      expect(full).not.toContain("Fingerprint");
      expect(full).not.toMatch(/CTX-[0-9A-F]{6}/);
      expect(empty).not.toContain("Fingerprint");
    });

    it("leaves the sections themselves unchanged", () => {
      const withHeader = buildContextPackage(fullSnapshot());
      const withoutHeader = buildContextPackage(fullSnapshot(), { includeHeader: false });
      expect(withHeader.endsWith(withoutHeader)).toBe(true);
    });
  });

  describe("compactness", () => {
    it("is plain text, not pretty-printed JSON", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).not.toContain("{\n");
      expect(text).not.toContain('"decisions"');
      expect(text).not.toContain('"open_questions"');
    });

    it("is shorter than the pretty-printed snapshot JSON", () => {
      const snapshot = fullSnapshot();
      const text = buildContextPackage(snapshot);
      expect(text.length).toBeLessThan(JSON.stringify(snapshot, null, 2).length);
    });

    it("does not repeat raw snapshot field names", () => {
      const text = buildContextPackage(fullSnapshot());
      expect(text).not.toContain("user_preferences");
      expect(text).not.toContain("current_state");
      expect(text).not.toContain("context_version");
    });

    it("grows only with the content it is given", () => {
      const small = buildContextPackage({ ...createSnapshot({ conversationId: "c" }), summary: "Hi" });
      const large = buildContextPackage(fullSnapshot());
      expect(small.length).toBeLessThan(large.length);
    });
  });

  describe("omitting empty sections", () => {
    it("omits every empty section", () => {
      const text = buildContextPackage({
        conversation_id: "c1",
        context_version: 1,
        summary: "Only a summary",
        decisions: [],
        user_preferences: {},
        current_state: {},
        open_questions: [],
      });
      expect(text).toContain("Summary:");
      expect(text).not.toContain("Important decisions:");
      expect(text).not.toContain("User preferences:");
      expect(text).not.toContain("Current state:");
      expect(text).not.toContain("Outstanding questions:");
    });

    it("omits the summary when it is blank", () => {
      const text = buildContextPackage({
        ...fullSnapshot(),
        summary: "   ",
      });
      expect(text).not.toContain("Summary:");
      expect(text).toContain("Important decisions:");
    });

    it("omits only the sections that are empty", () => {
      const text = buildContextPackage({
        ...fullSnapshot(),
        decisions: [],
        current_state: {},
      });
      expect(text).toContain("Summary:");
      expect(text).not.toContain("Important decisions:");
      expect(text).toContain("User preferences:");
      expect(text).not.toContain("Current state:");
      expect(text).toContain("Outstanding questions:");
    });

    it("keeps a section that has a single entry", () => {
      const text = buildContextPackage({
        ...createSnapshot({ conversationId: "c1" }),
        open_questions: ["Who is travelling?"],
      });
      expect(text).toContain("Outstanding questions:\n1. Who is travelling?");
      expect(text).not.toContain("Summary:");
    });

    it("ignores list items that are blank or duplicated", () => {
      const text = buildContextPackage({
        ...createSnapshot({ conversationId: "c1" }),
        decisions: ["Go by train", "  ", "Go by train"],
      });
      expect(text).toContain("1. Go by train");
      expect(text).not.toContain("2.");
    });
  });

  describe("empty snapshots", () => {
    it("returns a header and the empty notice", () => {
      const text = buildContextPackage(createSnapshot({ conversationId: "empty-1" }));
      expect(text).toContain("CONTEXT PACKAGE");
      expect(text).toContain("Conversation: empty-1");
      expect(text).toContain("Version: 1");
      expect(text).toContain(
        `Fingerprint: ${computeContextFingerprint(createSnapshot({ conversationId: "empty-1" }))}`
      );
      expect(text).toContain(EMPTY_PACKAGE_TEXT);
    });

    it("returns only the empty notice when the header is disabled", () => {
      const text = buildContextPackage(createSnapshot({ conversationId: "empty-2" }), {
        includeHeader: false,
      });
      expect(text).toBe(EMPTY_PACKAGE_TEXT);
    });

    it("treats non-object input as an empty snapshot", () => {
      expect(buildContextPackage(null, { includeHeader: false })).toBe(EMPTY_PACKAGE_TEXT);
      expect(buildContextPackage(undefined, { includeHeader: false })).toBe(EMPTY_PACKAGE_TEXT);
      expect(buildContextPackage("nope", { includeHeader: false })).toBe(EMPTY_PACKAGE_TEXT);
    });

    it("does not list any section for an empty snapshot", () => {
      const text = buildContextPackage(createSnapshot({ conversationId: "empty-3" }));
      expect(text).not.toContain("Summary:");
      expect(text).not.toContain("Important decisions:");
      expect(text).not.toContain("User preferences:");
      expect(text).not.toContain("Current state:");
      expect(text).not.toContain("Outstanding questions:");
    });
  });

  describe("options", () => {
    it("omits the header when includeHeader is false", () => {
      const text = buildContextPackage(fullSnapshot(), { includeHeader: false });
      expect(text).not.toContain("CONTEXT PACKAGE");
      expect(text).not.toContain("Conversation:");
      expect(text).not.toContain("Version:");
      expect(text).not.toContain("Fingerprint:");
      expect(text.startsWith("Summary:")).toBe(true);
    });

    it("includes the header by default", () => {
      expect(buildContextPackage(fullSnapshot())).toContain("CONTEXT PACKAGE");
    });
  });

  describe("input handling", () => {
    it("normalises partial snapshots", () => {
      const text = buildContextPackage({
        conversation_id: "partial-1",
        summary: "Partial summary",
      });
      expect(text).toContain("Conversation: partial-1");
      expect(text).toContain("Version: 1");
      expect(text).toContain("Partial summary");
      expect(text).not.toContain("Important decisions:");
    });

    it("does not mutate the snapshot it is given", () => {
      const snapshot = fullSnapshot();
      const copy = JSON.parse(JSON.stringify(snapshot));
      buildContextPackage(snapshot);
      expect(snapshot).toEqual(copy);
    });

    it("is deterministic for the same snapshot", () => {
      const snapshot = fullSnapshot();
      expect(buildContextPackage(snapshot)).toBe(buildContextPackage(snapshot));
    });
  });
});

describe("buildContinuationPrompt", () => {
  it("tells the AI it is continuing an existing conversation", () => {
    const prompt = buildContinuationPrompt(fullSnapshot());
    expect(prompt).toContain("You are continuing an existing conversation.");
    expect(prompt).toContain("Continue from this state.");
  });

  it("wraps the full context package", () => {
    const snapshot = fullSnapshot();
    const prompt = buildContinuationPrompt(snapshot);
    expect(prompt).toContain(buildContextPackage(snapshot));
  });

  it("includes the context fingerprint so the receiving AI knows which snapshot it holds", () => {
    const snapshot = fullSnapshot();
    const prompt = buildContinuationPrompt(snapshot);
    expect(prompt).toContain(`Fingerprint: ${computeContextFingerprint(snapshot)}`);
  });

  it("shows a different fingerprint once the context has changed", () => {
    const before = fullSnapshot();
    const after = updateSnapshot(before, { summary: "Now planning a 10-day holiday." });
    const fingerprintBefore = computeContextFingerprint(before);
    const fingerprintAfter = computeContextFingerprint(after);

    expect(fingerprintAfter).not.toBe(fingerprintBefore);

    const prompt = buildContinuationPrompt(after);
    expect(prompt).toContain(`Fingerprint: ${fingerprintAfter}`);
    expect(prompt).not.toContain(fingerprintBefore);
  });

  it("places the context package before the response schema", () => {
    const prompt = buildContinuationPrompt(fullSnapshot());
    const packageIndex = prompt.indexOf("CONTEXT PACKAGE");
    const schemaIndex = prompt.indexOf("Return responses using the following schema.");
    expect(packageIndex).toBeGreaterThan(-1);
    expect(schemaIndex).toBeGreaterThan(packageIndex);
  });

  it("includes every response schema rule, numbered", () => {
    const prompt = buildContinuationPrompt(fullSnapshot());
    expect(prompt).toContain("Rules:");
    RESPONSE_SCHEMA_RULES.forEach((rule, index) => {
      expect(prompt).toContain(`${index + 1}. ${rule}`);
    });
  });

  it("includes the example response as pretty-printed JSON", () => {
    const prompt = buildContinuationPrompt(fullSnapshot());
    expect(prompt).toContain("Example of a valid response:");
    expect(prompt).toContain(JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2));
  });

  it("ends by asking for the JSON object only", () => {
    const prompt = buildContinuationPrompt(fullSnapshot());
    expect(prompt.trimEnd().endsWith("Respond now with the JSON object only.")).toBe(true);
  });

  it("includes the latest user message when provided", () => {
    const prompt = buildContinuationPrompt(fullSnapshot(), {
      latestMessage: "Let's pick a destination.",
    });
    expect(prompt).toContain("The user's latest message:");
    expect(prompt).toContain("Let's pick a destination.");
  });

  it("trims the latest user message", () => {
    const prompt = buildContinuationPrompt(fullSnapshot(), {
      latestMessage: "   Hello there   \n",
    });
    expect(prompt).toContain("The user's latest message:\nHello there\n");
  });

  it("omits the latest message block when none is provided", () => {
    expect(buildContinuationPrompt(fullSnapshot())).not.toContain("The user's latest message:");
  });

  it("omits the latest message block when the message is blank or not a string", () => {
    expect(buildContinuationPrompt(fullSnapshot(), { latestMessage: "   " })).not.toContain(
      "The user's latest message:"
    );
    expect(buildContinuationPrompt(fullSnapshot(), { latestMessage: 42 })).not.toContain(
      "The user's latest message:"
    );
  });

  it("places the latest message between the context and the schema", () => {
    const prompt = buildContinuationPrompt(fullSnapshot(), { latestMessage: "Next step?" });
    const messageIndex = prompt.indexOf("The user's latest message:");
    expect(messageIndex).toBeGreaterThan(prompt.indexOf("Continue from this state."));
    expect(messageIndex).toBeLessThan(prompt.indexOf("Return responses using the following schema."));
  });

  it("still wraps the schema when the snapshot is empty", () => {
    const prompt = buildContinuationPrompt(createSnapshot({ conversationId: "empty-9" }));
    expect(prompt).toContain("Conversation: empty-9");
    expect(prompt).toContain(EMPTY_PACKAGE_TEXT);
    expect(prompt).toContain("Return responses using the following schema.");
    expect(prompt).toContain(JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2));
  });

  it("does not mutate the snapshot it is given", () => {
    const snapshot = fullSnapshot();
    const copy = JSON.parse(JSON.stringify(snapshot));
    buildContinuationPrompt(snapshot, { latestMessage: "Hi" });
    expect(snapshot).toEqual(copy);
  });
});