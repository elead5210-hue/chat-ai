import { describe, it, expect } from "vitest";
import {
  CONVERSATION_ROLES,
  MESSAGE_ROLE_ASSISTANT,
  MESSAGE_ROLE_USER,
  WELCOME_MESSAGE,
  appendAssistantMessage,
  appendMessage,
  appendUserMessage,
  createConversation,
  createMessage,
  isNexusMessage,
  resetConversation,
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