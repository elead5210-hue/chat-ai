import { describe, it, expect } from "vitest";
import {
  COMPLETION_MESSAGE,
  COMPLETION_MESSAGE_ID,
  CONVERSATION_PHASES,
  CONVERSATION_PHASE_BOUNDARIES,
  CONVERSATION_PHASE_CONTEXT,
  CONVERSATION_ROLES,
  CONVERSATION_STATUS_ACTIVE,
  CONVERSATION_STATUS_COMPLETE,
  MESSAGE_ROLE_ASSISTANT,
  MESSAGE_ROLE_USER,
  PHASE_ADVANCE_MESSAGE,
  PHASE_ADVANCE_MESSAGE_ID,
  WELCOME_MESSAGE,
  advancePhase,
  appendAssistantMessage,
  appendMessage,
  appendUserMessage,
  completeConversation,
  createConversation,
  createMessage,
  getConversationPhase,
  getConversationStatus,
  isConversationComplete,
  isNexusMessage,
  resetConversation,
  restoreConversation,
} from "./conversationStore.js";

describe("constants", () => {
  it("defines the user and assistant roles", () => {
    expect(MESSAGE_ROLE_USER).toBe("user");
    expect(MESSAGE_ROLE_ASSISTANT).toBe("assistant");
    expect(CONVERSATION_ROLES).toEqual(["user", "assistant"]);
  });

  it("defines a welcome message from the assistant", () => {
    expect(WELCOME_MESSAGE).toEqual({
      id: "welcome",
      role: "assistant",
      content: "What would you like to work on?",
    });
  });

  it("freezes the welcome message so it cannot be changed by accident", () => {
    expect(Object.isFrozen(WELCOME_MESSAGE)).toBe(true);
  });
});

describe("createMessage", () => {
  it("creates a message with a role, content and id", () => {
    const message = createMessage("user", "Hello");
    expect(message.role).toBe("user");
    expect(message.content).toBe("Hello");
    expect(typeof message.id).toBe("string");
    expect(message.id.length).toBeGreaterThan(0);
  });

  it("has only the id, role and content fields", () => {
    expect(Object.keys(createMessage("user", "Hello")).sort()).toEqual(["content", "id", "role"]);
  });

  it("gives every message a unique id", () => {
    const ids = Array.from({ length: 50 }, () => createMessage("user", "x").id);
    expect(new Set(ids).size).toBe(50);
  });

  it("never reuses the welcome message id", () => {
    expect(createMessage("assistant", "x").id).not.toBe(WELCOME_MESSAGE.id);
  });
});

describe("createConversation", () => {
  it("starts with only the welcome message", () => {
    expect(createConversation()).toEqual([WELCOME_MESSAGE]);
  });

  it("returns a new array each time", () => {
    expect(createConversation()).not.toBe(createConversation());
  });

  it("is not affected by changes to an earlier result", () => {
    const first = createConversation();
    first.push(createMessage("user", "Hi"));
    expect(createConversation()).toEqual([WELCOME_MESSAGE]);
  });

  it("holds messages only, with no context or UI state", () => {
    const conversation = createConversation();
    expect(Array.isArray(conversation)).toBe(true);
    for (const message of conversation) {
      expect(Object.keys(message).sort()).toEqual(["content", "id", "role"]);
    }
  });
});

describe("appendMessage", () => {
  it("adds the message to the end", () => {
    const next = appendMessage(createConversation(), "user", "Hello");
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(WELCOME_MESSAGE);
    expect(next[1].role).toBe("user");
    expect(next[1].content).toBe("Hello");
  });

  it("keeps the order of earlier messages", () => {
    let messages = createConversation();
    messages = appendMessage(messages, "user", "One");
    messages = appendMessage(messages, "assistant", "Two");
    messages = appendMessage(messages, "user", "Three");
    expect(messages.map((message) => message.content)).toEqual([
      WELCOME_MESSAGE.content,
      "One",
      "Two",
      "Three",
    ]);
  });

  it("gives each appended message a unique id", () => {
    let messages = createConversation();
    messages = appendMessage(messages, "user", "One");
    messages = appendMessage(messages, "user", "One");
    const ids = messages.map((message) => message.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not mutate the original array", () => {
    const original = createConversation();
    const copy = [...original];
    const next = appendMessage(original, "user", "Hello");
    expect(next).not.toBe(original);
    expect(original).toEqual(copy);
    expect(original).toHaveLength(1);
  });

  it("keeps the content exactly as given", () => {
    const next = appendMessage([], "assistant", "  Line one\nLine two  ");
    expect(next[0].content).toBe("  Line one\nLine two  ");
  });

  it("accepts a conversation that does not start with the welcome message", () => {
    const next = appendMessage([], "user", "First");
    expect(next).toHaveLength(1);
    expect(next[0].content).toBe("First");
  });

  describe("ignoring invalid input", () => {
    it.each([
      ["an empty string", ""],
      ["whitespace only", "   \n\t "],
      ["null", null],
      ["undefined", undefined],
      ["a number", 42],
      ["an object", { text: "hi" }],
    ])("ignores %s as content", (_label, content) => {
      const original = createConversation();
      expect(appendMessage(original, "user", content)).toBe(original);
    });

    it.each([["system"], ["bot"], [""], [null], [undefined], [42]])(
      "ignores the role %s",
      (role) => {
        const original = createConversation();
        expect(appendMessage(original, role, "Hello")).toBe(original);
      }
    );

    it("treats a missing message list as empty", () => {
      expect(appendMessage(undefined, "user", "Hello")).toHaveLength(1);
      expect(appendMessage(null, "user", "Hello")).toHaveLength(1);
    });

    it("returns an empty list when the list is missing and the message is invalid", () => {
      expect(appendMessage(undefined, "user", "")).toEqual([]);
    });
  });
});

describe("appendUserMessage", () => {
  it("adds a user message", () => {
    const next = appendUserMessage(createConversation(), "I want to plan a trip.");
    expect(next).toHaveLength(2);
    expect(next[1].role).toBe("user");
    expect(next[1].content).toBe("I want to plan a trip.");
  });

  it("trims what the user typed", () => {
    const next = appendUserMessage(createConversation(), "   Somewhere warm please \n");
    expect(next[1].content).toBe("Somewhere warm please");
  });

  it("ignores blank or non-string input", () => {
    const original = createConversation();
    expect(appendUserMessage(original, "")).toBe(original);
    expect(appendUserMessage(original, "    ")).toBe(original);
    expect(appendUserMessage(original, null)).toBe(original);
    expect(appendUserMessage(original, undefined)).toBe(original);
    expect(appendUserMessage(original, 5)).toBe(original);
  });

  it("does not mutate the original array", () => {
    const original = createConversation();
    appendUserMessage(original, "Hello");
    expect(original).toEqual([WELCOME_MESSAGE]);
  });
});

describe("appendAssistantMessage", () => {
  it("adds an assistant message", () => {
    const next = appendAssistantMessage(createConversation(), "Tell me about your trip.");
    expect(next).toHaveLength(2);
    expect(next[1].role).toBe("assistant");
    expect(next[1].content).toBe("Tell me about your trip.");
  });

  it("ignores blank or non-string content", () => {
    const original = createConversation();
    expect(appendAssistantMessage(original, "")).toBe(original);
    expect(appendAssistantMessage(original, "  ")).toBe(original);
    expect(appendAssistantMessage(original, null)).toBe(original);
    expect(appendAssistantMessage(original, { content: "x" })).toBe(original);
  });

  it("does not mutate the original array", () => {
    const original = createConversation();
    appendAssistantMessage(original, "Hello");
    expect(original).toEqual([WELCOME_MESSAGE]);
  });
});

describe("isNexusMessage", () => {
  it("is true for the welcome message", () => {
    expect(isNexusMessage(WELCOME_MESSAGE)).toBe(true);
  });

  it("is true for the welcome message in a new conversation", () => {
    expect(isNexusMessage(createConversation()[0])).toBe(true);
  });

  it("is false for user messages", () => {
    const messages = appendUserMessage(createConversation(), "Hello");
    expect(isNexusMessage(messages[1])).toBe(false);
  });

  it("is false for replies relayed from the external AI", () => {
    const messages = appendAssistantMessage(createConversation(), "Tell me about your trip.");
    expect(messages[1].role).toBe("assistant");
    expect(isNexusMessage(messages[1])).toBe(false);
  });

  it("is false for an AI reply that repeats the welcome text", () => {
    const messages = appendAssistantMessage(createConversation(), WELCOME_MESSAGE.content);
    expect(isNexusMessage(messages[1])).toBe(false);
  });

  it("is false for a user message that reuses the welcome id", () => {
    expect(isNexusMessage({ id: WELCOME_MESSAGE.id, role: "user", content: "Hi" })).toBe(false);
  });

  it.each([[null], [undefined], ["welcome"], [42], [[]], [{}]])(
    "is false for %s",
    (value) => {
      expect(isNexusMessage(value)).toBe(false);
    }
  );

  it("is true for exactly one message in a conversation with replies", () => {
    let messages = createConversation();
    messages = appendUserMessage(messages, "Hello");
    messages = appendAssistantMessage(messages, "Hi there");
    messages = appendUserMessage(messages, "Plan a trip");
    expect(messages.filter(isNexusMessage)).toEqual([WELCOME_MESSAGE]);
  });

  it("is true for the welcome message again after a reset", () => {
    let messages = appendAssistantMessage(createConversation(), "Hi there");
    messages = resetConversation();
    expect(messages).toHaveLength(1);
    expect(isNexusMessage(messages[0])).toBe(true);
  });

  it("does not change the message shape", () => {
    expect(Object.keys(WELCOME_MESSAGE).sort()).toEqual(["content", "id", "role"]);
  });
});

describe("conversation completion", () => {
  it("defines the completion message and statuses", () => {
    expect(COMPLETION_MESSAGE.id).toBe(COMPLETION_MESSAGE_ID);
    expect(COMPLETION_MESSAGE.role).toBe("assistant");
    expect(Object.isFrozen(COMPLETION_MESSAGE)).toBe(true);
    expect(CONVERSATION_STATUS_ACTIVE).toBe("active");
    expect(CONVERSATION_STATUS_COMPLETE).toBe("complete");
  });

  it("is active for a new conversation", () => {
    const messages = createConversation();
    expect(isConversationComplete(messages)).toBe(false);
    expect(getConversationStatus(messages)).toBe("active");
  });

  it.each([[null], [undefined], ["x"], [42], [{}]])(
    "is not complete for %s",
    (value) => {
      expect(isConversationComplete(value)).toBe(false);
      expect(getConversationStatus(value)).toBe("active");
    }
  );

  it("completeConversation appends the completion message", () => {
    const original = appendUserMessage(createConversation(), "Hello");
    const next = completeConversation(original);
    expect(next).not.toBe(original);
    expect(original).toHaveLength(2);
    expect(next).toHaveLength(3);
    expect(next[2]).toBe(COMPLETION_MESSAGE);
    expect(isConversationComplete(next)).toBe(true);
    expect(getConversationStatus(next)).toBe("complete");
  });

  it("completeConversation is idempotent", () => {
    const done = completeConversation(createConversation());
    expect(completeConversation(done)).toBe(done);
  });

  it("completeConversation treats a missing list as empty", () => {
    expect(completeConversation(undefined)).toEqual([COMPLETION_MESSAGE]);
  });

  it("ignores further messages once complete", () => {
    const done = completeConversation(createConversation());
    expect(appendMessage(done, "user", "More")).toBe(done);
    expect(appendUserMessage(done, "More")).toBe(done);
    expect(appendAssistantMessage(done, "More")).toBe(done);
  });

  it("treats the completion message as a Nexus message", () => {
    expect(isNexusMessage(COMPLETION_MESSAGE)).toBe(true);
  });

  it("returns to active after a reset", () => {
    const done = completeConversation(createConversation());
    expect(isConversationComplete(done)).toBe(true);
    const fresh = resetConversation();
    expect(isConversationComplete(fresh)).toBe(false);
    expect(appendUserMessage(fresh, "Hi")).toHaveLength(2);
  });
});

describe("conversation phases", () => {
  it("defines the two phases and the phase-advance message", () => {
    expect(CONVERSATION_PHASE_BOUNDARIES).toBe("boundaries");
    expect(CONVERSATION_PHASE_CONTEXT).toBe("context");
    expect(CONVERSATION_PHASES).toEqual(["boundaries", "context"]);
    expect(PHASE_ADVANCE_MESSAGE.id).toBe(PHASE_ADVANCE_MESSAGE_ID);
    expect(PHASE_ADVANCE_MESSAGE.role).toBe("assistant");
    expect(Object.isFrozen(PHASE_ADVANCE_MESSAGE)).toBe(true);
  });

  it("starts in phase one (boundaries)", () => {
    expect(getConversationPhase(createConversation())).toBe("boundaries");
  });

  it.each([[null], [undefined], ["x"], [42], [{}]])(
    "is in phase one for %s",
    (value) => {
      expect(getConversationPhase(value)).toBe("boundaries");
    }
  );

  it("advancePhase appends the phase-advance message and moves to phase two", () => {
    const original = appendUserMessage(createConversation(), "Hello");
    const next = advancePhase(original);
    expect(next).not.toBe(original);
    expect(original).toHaveLength(2);
    expect(next).toHaveLength(3);
    expect(next[2]).toBe(PHASE_ADVANCE_MESSAGE);
    expect(getConversationPhase(next)).toBe("context");
  });

  it("advancePhase is idempotent", () => {
    const advanced = advancePhase(createConversation());
    expect(advancePhase(advanced)).toBe(advanced);
  });

  it("advancePhase treats a missing list as empty", () => {
    expect(advancePhase(undefined)).toEqual([PHASE_ADVANCE_MESSAGE]);
  });

  it("advancePhase does nothing once the conversation is complete", () => {
    const done = completeConversation(createConversation());
    expect(advancePhase(done)).toBe(done);
    expect(getConversationPhase(done)).toBe("boundaries");
  });

  it("keeps accepting messages in phase two", () => {
    const advanced = advancePhase(createConversation());
    const next = appendUserMessage(advanced, "More detail");
    expect(next).toHaveLength(3);
    expect(getConversationPhase(next)).toBe("context");
  });

  it("can still complete after advancing to phase two", () => {
    const done = completeConversation(advancePhase(createConversation()));
    expect(isConversationComplete(done)).toBe(true);
    expect(getConversationPhase(done)).toBe("context");
  });

  it("treats the phase-advance message as a Nexus message", () => {
    expect(isNexusMessage(PHASE_ADVANCE_MESSAGE)).toBe(true);
  });

  it("does not treat a user message with the phase-advance id as a Nexus message", () => {
    expect(isNexusMessage({ id: PHASE_ADVANCE_MESSAGE_ID, role: "user", content: "Hi" })).toBe(
      false
    );
  });

  it("returns to phase one after a reset", () => {
    const advanced = advancePhase(createConversation());
    expect(getConversationPhase(advanced)).toBe("context");
    expect(getConversationPhase(resetConversation())).toBe("boundaries");
  });
});

describe("restoreConversation", () => {
  const STORED = [
    { id: "welcome", role: "assistant", content: "What would you like to work on?" },
    { id: "m1", role: "user", content: "A report on churn." },
    { id: "m2", role: "assistant", content: "Who is it for?" },
  ];

  it("restores a valid list of messages in order", () => {
    const restored = restoreConversation(STORED);
    expect(restored).toHaveLength(3);
    expect(restored.map((message) => message.id)).toEqual(["welcome", "m1", "m2"]);
    expect(restored[1]).toEqual({ id: "m1", role: "user", content: "A report on churn." });
    expect(restored[2]).toEqual({ id: "m2", role: "assistant", content: "Who is it for?" });
  });

  it("returns new message objects and does not mutate the input", () => {
    const input = JSON.parse(JSON.stringify(STORED));
    const restored = restoreConversation(input);
    expect(restored).not.toBe(input);
    expect(restored[1]).not.toBe(input[1]);
    expect(input).toEqual(STORED);
  });

  it("keeps only id, role and content on each message", () => {
    const restored = restoreConversation([
      { id: "m1", role: "user", content: "Hi", extra: "ignored" },
    ]);
    expect(Object.keys(restored[0]).sort()).toEqual(["content", "id", "role"]);
  });

  it("keeps the content exactly as stored", () => {
    const restored = restoreConversation([
      { id: "m1", role: "assistant", content: "  Line one\nLine two  " },
    ]);
    expect(restored[0].content).toBe("  Line one\nLine two  ");
  });

  describe("invalid input", () => {
    it.each([[undefined], [null], ["x"], [42], [{}], [[]]])(
      "returns a fresh conversation for %s",
      (value) => {
        expect(restoreConversation(value)).toEqual([WELCOME_MESSAGE]);
      }
    );

    it.each([
      ["a message that is not an object", ["hello"]],
      ["a null message", [null]],
      ["a missing id", [{ role: "user", content: "Hi" }]],
      ["an empty id", [{ id: "  ", role: "user", content: "Hi" }]],
      ["a non-string id", [{ id: 5, role: "user", content: "Hi" }]],
      ["an unknown role", [{ id: "m1", role: "system", content: "Hi" }]],
      ["blank content", [{ id: "m1", role: "user", content: "   " }]],
      ["non-string content", [{ id: "m1", role: "user", content: 5 }]],
      [
        "duplicate ids",
        [
          { id: "m1", role: "user", content: "One" },
          { id: "m1", role: "user", content: "Two" },
        ],
      ],
    ])("returns a fresh conversation for %s", (_label, input) => {
      expect(restoreConversation(input)).toEqual([WELCOME_MESSAGE]);
    });

    it("restores nothing when only one message in the list is invalid", () => {
      const restored = restoreConversation([
        { id: "m1", role: "user", content: "Fine" },
        { id: "m2", role: "user", content: "" },
      ]);
      expect(restored).toEqual([WELCOME_MESSAGE]);
    });

    it("returns a new array each time it falls back", () => {
      expect(restoreConversation(null)).not.toBe(restoreConversation(null));
    });
  });

  describe("Nexus messages and phase", () => {
    it("restores the welcome message as the canonical Nexus message", () => {
      const restored = restoreConversation(STORED);
      expect(restored[0]).toBe(WELCOME_MESSAGE);
      expect(isNexusMessage(restored[0])).toBe(true);
    });

    it("stays in phase one when there is no phase-advance message", () => {
      expect(getConversationPhase(restoreConversation(STORED))).toBe("boundaries");
    });

    it("restores phase two when the phase-advance message was stored", () => {
      const stored = [
        ...STORED,
        { id: PHASE_ADVANCE_MESSAGE_ID, role: "assistant", content: "anything" },
      ];
      const restored = restoreConversation(stored);
      expect(getConversationPhase(restored)).toBe("context");
      expect(restored.at(-1)).toBe(PHASE_ADVANCE_MESSAGE);
      expect(isNexusMessage(restored.at(-1))).toBe(true);
    });

    it("restores a completed conversation as complete", () => {
      const stored = [
        ...STORED,
        { id: COMPLETION_MESSAGE_ID, role: "assistant", content: "anything" },
      ];
      const restored = restoreConversation(stored);
      expect(isConversationComplete(restored)).toBe(true);
      expect(getConversationStatus(restored)).toBe("complete");
      expect(restored.at(-1)).toBe(COMPLETION_MESSAGE);
    });

    it("restores a completed phase-two conversation with both markers", () => {
      const stored = [
        ...STORED,
        { id: PHASE_ADVANCE_MESSAGE_ID, role: "assistant", content: "x" },
        { id: COMPLETION_MESSAGE_ID, role: "assistant", content: "x" },
      ];
      const restored = restoreConversation(stored);
      expect(getConversationPhase(restored)).toBe("context");
      expect(isConversationComplete(restored)).toBe(true);
    });

    it("round-trips a conversation built with the store helpers", () => {
      let messages = createConversation();
      messages = appendUserMessage(messages, "Hello");
      messages = appendAssistantMessage(messages, "Who is it for?");
      messages = advancePhase(messages);
      messages = appendUserMessage(messages, "Executives");
      messages = completeConversation(messages);

      const restored = restoreConversation(JSON.parse(JSON.stringify(messages)));

      expect(restored).toEqual(messages);
      expect(getConversationPhase(restored)).toBe("context");
      expect(isConversationComplete(restored)).toBe(true);
    });

    it("does not treat a user message with a Nexus id as a Nexus message", () => {
      const restored = restoreConversation([
        { id: PHASE_ADVANCE_MESSAGE_ID, role: "user", content: "Hi" },
      ]);
      expect(isNexusMessage(restored[0])).toBe(false);
      expect(restored[0].role).toBe("user");
    });
  });

  describe("message ids after restoring", () => {
    it("never reuses a restored id for a new message", () => {
      const restored = restoreConversation([
        { id: "m9000", role: "user", content: "One" },
        { id: "m9001", role: "assistant", content: "Two" },
      ]);

      const next = appendUserMessage(restored, "Three");
      const ids = next.map((message) => message.id);

      expect(new Set(ids).size).toBe(ids.length);
      expect(Number(next.at(-1).id.slice(1))).toBeGreaterThan(9001);
    });

    it("gives every message created after restoring a unique id", () => {
      let messages = restoreConversation([
        { id: "m7000", role: "user", content: "One" },
      ]);
      for (let index = 0; index < 20; index += 1) {
        messages = appendUserMessage(messages, `Message ${index}`);
      }
      const ids = messages.map((message) => message.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("does not move the counter backwards when restoring lower ids", () => {
      restoreConversation([{ id: "m8000", role: "user", content: "High" }]);
      const afterHigh = Number(createMessage("user", "x").id.slice(1));

      restoreConversation([{ id: "m2", role: "user", content: "Low" }]);
      const afterLow = Number(createMessage("user", "x").id.slice(1));

      expect(afterHigh).toBeGreaterThan(8000);
      expect(afterLow).toBeGreaterThan(afterHigh);
    });

    it("ignores ids that do not look like generated message ids", () => {
      const before = Number(createMessage("user", "x").id.slice(1));
      restoreConversation([
        { id: "custom-id", role: "user", content: "One" },
        { id: "message-999999", role: "assistant", content: "Two" },
      ]);
      const after = Number(createMessage("user", "x").id.slice(1));
      expect(after).toBe(before + 1);
    });

    it("does not move the counter when nothing could be restored", () => {
      const before = Number(createMessage("user", "x").id.slice(1));
      restoreConversation([
        { id: "m99999", role: "user", content: "Fine" },
        { id: "m99999", role: "user", content: "Duplicate" },
      ]);
      const after = Number(createMessage("user", "x").id.slice(1));
      expect(after).toBe(before + 1);
    });
  });
});

describe("resetConversation", () => {
  it("returns only the welcome message", () => {
    expect(resetConversation()).toEqual([WELCOME_MESSAGE]);
  });

  it("returns the same result as a new conversation", () => {
    expect(resetConversation()).toEqual(createConversation());
  });

  it("returns a new array each time", () => {
    expect(resetConversation()).not.toBe(resetConversation());
  });

  it("does not touch a conversation that was built earlier", () => {
    let messages = appendUserMessage(createConversation(), "Hello");
    messages = appendAssistantMessage(messages, "Hi there");
    const before = [...messages];
    resetConversation();
    expect(messages).toEqual(before);
    expect(messages).toHaveLength(3);
  });

  it("discards earlier messages when its result replaces them", () => {
    let messages = appendUserMessage(createConversation(), "Hello");
    messages = resetConversation();
    expect(messages).toEqual([WELCOME_MESSAGE]);
  });
});