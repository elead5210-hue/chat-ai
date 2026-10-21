import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSession } from "./useSession.js";
import { PROTOCOL_NAME, PROTOCOL_VERSION } from "../protocol/schema.js";

function makeResponse(overrides = {}) {
  return {
    protocol: PROTOCOL_NAME,
    version: PROTOCOL_VERSION,
    message: { role: "assistant", content: "Tell me about your trip." },
    components: [
      { id: "destination", type: "text", label: "Destination" },
      { id: "budget", type: "number", label: "Budget", min: 0 },
    ],
    context_updates: [],
    state_updates: [],
    next_action: "await_user",
    ...overrides,
  };
}

function submit(result, response) {
  let ok;
  act(() => {
    ok = result.current.submitResponse(
      typeof response === "string" ? response : JSON.stringify(response)
    );
  });
  return ok;
}

function setup() {
  return renderHook(() => useSession());
}

describe("initial state", () => {
  it("starts with each store in its own empty state", () => {
    const { result } = setup();

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
    expect(result.current.uiState).toEqual({});
    expect(result.current.context.summary).toBe("");
    expect(result.current.context.context_version).toBe(1);
  });

  it("keeps the three stores as different objects", () => {
    const { result } = setup();
    expect(result.current.messages).not.toBe(result.current.context);
    expect(result.current.context).not.toBe(result.current.uiState);
    expect(result.current.uiState).not.toBe(result.current.messages);
  });
});

describe("a message leaves context and UI state untouched", () => {
  it("only changes the conversation when the user sends a message", () => {
    const { result } = setup();
    submit(
      result,
      makeResponse({
        context_updates: [{ key: "summary", value: "Planning a trip" }],
        state_updates: [{ id: "destination", value: "Cape Town" }],
      })
    );

    const contextBefore = result.current.context;
    const uiStateBefore = result.current.uiState;
    const messagesBefore = result.current.messages;
    const fingerprintBefore = result.current.contextFingerprint;

    act(() => result.current.sendUserMessage("I prefer the coast"));

    expect(result.current.messages).toHaveLength(messagesBefore.length + 1);
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "user",
      content: "I prefer the coast",
    });
    expect(result.current.context).toBe(contextBefore);
    expect(result.current.uiState).toBe(uiStateBefore);
    expect(result.current.contextFingerprint).toBe(fingerprintBefore);
    expect(result.current.context.context_version).toBe(contextBefore.context_version);
  });

  it("ignores a blank message without touching any store", () => {
    const { result } = setup();
    const { messages, context, uiState } = result.current;

    act(() => result.current.sendUserMessage("   "));

    expect(result.current.messages).toBe(messages);
    expect(result.current.context).toBe(context);
    expect(result.current.uiState).toBe(uiState);
  });
});

describe("a field edit leaves messages and context untouched", () => {
  it("only changes the UI state when the user edits a field", () => {
    const { result } = setup();
    submit(result, makeResponse({ context_updates: [{ key: "summary", value: "Trip" }] }));

    const messagesBefore = result.current.messages;
    const contextBefore = result.current.context;
    const fingerprintBefore = result.current.contextFingerprint;

    act(() => result.current.updateUiState("destination", "Lisbon"));

    expect(result.current.uiState.destination).toBe("Lisbon");
    expect(result.current.messages).toBe(messagesBefore);
    expect(result.current.context).toBe(contextBefore);
    expect(result.current.contextFingerprint).toBe(fingerprintBefore);
  });

  it("does not put the typed value into the conversation or the context", () => {
    const { result } = setup();
    act(() => result.current.updateUiState("destination", "Zanzibar-Stone-Town"));

    expect(JSON.stringify(result.current.messages)).not.toContain("Zanzibar-Stone-Town");
    expect(JSON.stringify(result.current.context)).not.toContain("Zanzibar-Stone-Town");
    expect(result.current.contextPackage).not.toContain("Zanzibar-Stone-Town");
  });

  it("keeps the context version and fingerprint the same after a field edit", () => {
    const { result } = setup();
    const versionBefore = result.current.contextVersion;
    const fingerprintBefore = result.current.contextFingerprint;

    act(() => result.current.updateUiState("budget", 30000));

    expect(result.current.contextVersion).toBe(versionBefore);
    expect(result.current.contextFingerprint).toBe(fingerprintBefore);
  });
});

describe("a context update leaves the other stores untouched", () => {
  it("changes the context without touching earlier messages or UI state", () => {
    const { result } = setup();
    submit(result, makeResponse());
    act(() => result.current.sendUserMessage("Somewhere warm"));
    act(() => result.current.updateUiState("destination", "Durban"));

    const messagesBefore = result.current.messages;
    const uiStateBefore = result.current.uiState;
    const contextBefore = result.current.context;

    // Same components as before and no state_updates, so the UI state has
    // nothing to change; only the context gets new content.
    submit(
      result,
      makeResponse({
        message: { role: "assistant", content: "Noted." },
        context_updates: [{ key: "summary", value: "Warm coastal trip" }],
      })
    );

    expect(result.current.context).not.toBe(contextBefore);
    expect(result.current.context.summary).toBe("Warm coastal trip");
    expect(result.current.context.context_version).toBe(contextBefore.context_version + 1);

    // The conversation only gained the assistant message; earlier ones are the same objects.
    expect(result.current.messages).toHaveLength(messagesBefore.length + 1);
    messagesBefore.forEach((message, index) => {
      expect(result.current.messages[index]).toBe(message);
    });

    expect(result.current.uiState).toEqual(uiStateBefore);
    expect(result.current.uiState.destination).toBe("Durban");
  });

  it("changes the fingerprint when the context changes", () => {
    const { result } = setup();
    const before = result.current.contextFingerprint;

    submit(result, makeResponse({ context_updates: [{ key: "summary", value: "New" }] }));

    expect(result.current.contextFingerprint).not.toBe(before);
  });

  it("does not put context data into the UI state", () => {
    const { result } = setup();
    submit(
      result,
      makeResponse({
        components: [],
        context_updates: [{ key: "summary", value: "Only for the context" }],
      })
    );

    expect(result.current.uiState).toEqual({});
  });
});

describe("applying a response updates each store separately", () => {
  it("sends the message, context updates and state updates to their own stores", () => {
    const { result } = setup();

    const ok = submit(
      result,
      makeResponse({
        message: { role: "assistant", content: "Where to?" },
        context_updates: [{ key: "summary", value: "User plans a trip" }],
        state_updates: [{ id: "destination", value: "Cape Town" }],
      })
    );

    expect(ok).toBe(true);
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "Where to?",
    });
    expect(result.current.context.summary).toBe("User plans a trip");
    expect(result.current.uiState.destination).toBe("Cape Town");

    expect(JSON.stringify(result.current.messages)).not.toContain("User plans a trip");
    expect(JSON.stringify(result.current.context)).not.toContain("Where to?");
    expect(result.current.uiState).not.toHaveProperty("summary");
  });

  it("seeds component defaults into the UI state without overwriting entered values", () => {
    const { result } = setup();
    act(() => result.current.updateUiState("destination", "Typed by user"));

    submit(
      result,
      makeResponse({
        components: [
          { id: "destination", type: "text", label: "Destination", value: "Default" },
          { id: "budget", type: "number", label: "Budget", value: 100 },
        ],
      })
    );

    expect(result.current.uiState.destination).toBe("Typed by user");
    expect(result.current.uiState.budget).toBe(100);
  });

  it("drops UI state for components that are no longer shown", () => {
    const { result } = setup();
    submit(result, makeResponse());
    act(() => result.current.updateUiState("destination", "Lisbon"));
    act(() => result.current.updateUiState("budget", 500));

    submit(
      result,
      makeResponse({
        components: [{ id: "budget", type: "number", label: "Budget", min: 0 }],
      })
    );

    expect(result.current.uiState).not.toHaveProperty("destination");
    expect(result.current.uiState.budget).toBe(500);
  });

  it("leaves all three stores untouched when the response is invalid", () => {
    const { result } = setup();
    submit(result, makeResponse({ context_updates: [{ key: "summary", value: "Trip" }] }));
    act(() => result.current.updateUiState("destination", "Lisbon"));

    const { messages, context, uiState } = result.current;

    const ok = submit(result, "this is not json");

    expect(ok).toBe(false);
    expect(result.current.validationErrors.length).toBeGreaterThan(0);
    expect(result.current.messages).toBe(messages);
    expect(result.current.context).toBe(context);
    expect(result.current.uiState).toBe(uiState);
  });
});

describe("all three stores feed the prompt", () => {
  it("includes the conversation, the context and the UI state", () => {
    const { result } = setup();
    submit(
      result,
      makeResponse({
        context_updates: [{ key: "summary", value: "Context-marker-summary" }],
      })
    );
    act(() => result.current.sendUserMessage("Conversation-marker-message"));
    act(() => result.current.updateUiState("destination", "UiState-marker-value"));

    const { prompt, promptSections } = result.current;

    expect(prompt).toContain("Conversation-marker-message");
    expect(prompt).toContain("Context-marker-summary");
    expect(prompt).toContain("UiState-marker-value");

    expect(promptSections.conversation).toContain("Conversation-marker-message");
    expect(promptSections.context).toContain("Context-marker-summary");
    expect(promptSections.uiState).toContain("UiState-marker-value");
  });

  it("keeps each store's data in its own prompt section", () => {
    const { result } = setup();
    submit(
      result,
      makeResponse({
        context_updates: [{ key: "summary", value: "Context-marker-summary" }],
      })
    );
    act(() => result.current.sendUserMessage("Conversation-marker-message"));
    act(() => result.current.updateUiState("destination", "UiState-marker-value"));

    const { promptSections } = result.current;

    expect(promptSections.conversation).not.toContain("Context-marker-summary");
    expect(promptSections.conversation).not.toContain("UiState-marker-value");
    expect(promptSections.context).not.toContain("Conversation-marker-message");
    expect(promptSections.context).not.toContain("UiState-marker-value");
    expect(promptSections.uiState).not.toContain("Conversation-marker-message");
    expect(promptSections.uiState).not.toContain("Context-marker-summary");
  });

  it("updates only the matching section when one store changes", () => {
    const { result } = setup();
    submit(result, makeResponse());
    const before = result.current.promptSections;

    act(() => result.current.updateUiState("destination", "Durban"));
    const after = result.current.promptSections;

    expect(after.uiState).not.toBe(before.uiState);
    expect(after.conversation).toBe(before.conversation);
    expect(after.context).toBe(before.context);
  });

  it("uses the edited instruction in the prompt without changing the stores", () => {
    const { result } = setup();
    const { messages, context, uiState } = result.current;

    act(() => result.current.updateInstruction("Answer in one sentence."));

    expect(result.current.prompt).toContain("Answer in one sentence.");
    expect(result.current.messages).toBe(messages);
    expect(result.current.context).toBe(context);
    expect(result.current.uiState).toBe(uiState);
  });

  it("builds the continuation prompt from the context and conversation, not the UI state", () => {
    const { result } = setup();
    submit(
      result,
      makeResponse({
        context_updates: [{ key: "summary", value: "Context-marker-summary" }],
      })
    );
    act(() => result.current.updateUiState("destination", "UiState-marker-value"));

    expect(result.current.continuationPrompt).toContain("Context-marker-summary");
    expect(result.current.continuationPrompt).not.toContain("UiState-marker-value");
  });
});

describe("resetSession clears each store", () => {
  function fillAllStores(result) {
    submit(
      result,
      makeResponse({
        context_updates: [{ key: "summary", value: "Context-marker-summary" }],
        state_updates: [{ id: "destination", value: "Cape Town" }],
      })
    );
    act(() => result.current.sendUserMessage("Conversation-marker-message"));
    act(() => result.current.updateUiState("budget", 1234));
    act(() => result.current.updateInstruction("Custom instruction"));
  }

  it("clears the conversation back to the welcome message", () => {
    const { result } = setup();
    fillAllStores(result);
    expect(result.current.messages.length).toBeGreaterThan(1);

    act(() => result.current.resetSession());

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe("assistant");
    expect(JSON.stringify(result.current.messages)).not.toContain("Conversation-marker-message");
  });

  it("clears the context to a fresh snapshot", () => {
    const { result } = setup();
    fillAllStores(result);
    const oldConversationId = result.current.context.conversation_id;
    const oldFingerprint = result.current.contextFingerprint;

    act(() => result.current.resetSession());

    expect(result.current.context.summary).toBe("");
    expect(result.current.context.context_version).toBe(1);
    expect(result.current.context.conversation_id).not.toBe(oldConversationId);
    expect(result.current.contextFingerprint).not.toBe(oldFingerprint);
    expect(result.current.contextPackage).not.toContain("Context-marker-summary");
  });

  it("clears the UI state", () => {
    const { result } = setup();
    fillAllStores(result);
    expect(Object.keys(result.current.uiState).length).toBeGreaterThan(0);

    act(() => result.current.resetSession());

    expect(result.current.uiState).toEqual({});
  });

  it("clears the last response, validation errors and instruction", () => {
    const { result } = setup();
    fillAllStores(result);
    submit(result, "not json");
    expect(result.current.validationErrors.length).toBeGreaterThan(0);

    act(() => result.current.resetSession());

    expect(result.current.lastResponse).toBeNull();
    expect(result.current.validationErrors).toEqual([]);
    expect(result.current.instruction).not.toBe("Custom instruction");
  });

  it("leaves no data from any store in the next prompt", () => {
    const { result } = setup();
    fillAllStores(result);

    act(() => result.current.resetSession());

    expect(result.current.prompt).not.toContain("Conversation-marker-message");
    expect(result.current.prompt).not.toContain("Context-marker-summary");
    expect(result.current.prompt).not.toContain("1234");
    expect(result.current.prompt).not.toContain("Custom instruction");
  });

  it("forgets the previous components so the next response is not pruned against them", () => {
    const { result } = setup();
    submit(result, makeResponse());
    act(() => result.current.resetSession());

    act(() => result.current.updateUiState("destination", "Lisbon"));
    submit(
      result,
      makeResponse({ components: [{ id: "budget", type: "number", label: "Budget" }] })
    );

    // "destination" was not part of the new session's previous form, so it is kept.
    expect(result.current.uiState.destination).toBe("Lisbon");
  });
});