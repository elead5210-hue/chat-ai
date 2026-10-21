import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSession } from "./useSession.js";
import { PROTOCOL_NAME, PROTOCOL_VERSION } from "../protocol/schema.js";
import { createSnapshot } from "../context/contextSnapshot.js";
import { WELCOME_MESSAGE } from "./conversationStore.js";
import { createSessionSnapshot } from "../storage/sessionSnapshot.js";

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

describe("checklist", () => {
  const ITEMS = [
    { id: "audience", label: "Who the document is for" },
    { id: "scope", label: "What the document covers" },
  ];

  function finishPhaseOne(result, items = ITEMS) {
    return submit(result, makeResponse({ phase_complete: true, checklist: items }));
  }

  it("starts with an empty checklist", () => {
    const { result } = setup();
    expect(result.current.checklist).toEqual([]);
  });

  it("creates the checklist from the response that completes phase one", () => {
    const { result } = setup();

    expect(finishPhaseOne(result)).toBe(true);

    expect(result.current.phase).toBe("context");
    expect(result.current.checklist).toEqual([
      { id: "audience", label: "Who the document is for", satisfied: false },
      { id: "scope", label: "What the document covers", satisfied: false },
    ]);
    expect(result.current.isComplete).toBe(false);
  });

  it("ignores a checklist sent without phase_complete", () => {
    const { result } = setup();

    submit(result, makeResponse({ checklist: ITEMS }));

    expect(result.current.phase).toBe("boundaries");
    expect(result.current.checklist).toEqual([]);
  });

  it("does not create a checklist when phase one completes without one", () => {
    const { result } = setup();

    submit(result, makeResponse({ phase_complete: true }));

    expect(result.current.phase).toBe("context");
    expect(result.current.checklist).toEqual([]);
    expect(result.current.isComplete).toBe(false);
  });

  it("does not replace the checklist when a later response sends another", () => {
    const { result } = setup();
    finishPhaseOne(result);

    submit(
      result,
      makeResponse({
        phase_complete: true,
        checklist: [{ id: "other", label: "Something else" }],
      })
    );

    expect(result.current.checklist.map((item) => item.id)).toEqual(["audience", "scope"]);
  });

  it("marks an item satisfied from checklist_updates", () => {
    const { result } = setup();
    finishPhaseOne(result);

    submit(
      result,
      makeResponse({ checklist_updates: [{ id: "audience", satisfied: true }] })
    );

    expect(result.current.checklist.map((item) => item.satisfied)).toEqual([true, false]);
    expect(result.current.isComplete).toBe(false);
  });

  it("ignores updates for ids that are not on the checklist", () => {
    const { result } = setup();
    finishPhaseOne(result);
    const before = result.current.checklist;

    submit(result, makeResponse({ checklist_updates: [{ id: "unknown", satisfied: true }] }));

    expect(result.current.checklist).toBe(before);
    expect(result.current.isComplete).toBe(false);
  });

  it("leaves the checklist untouched when the response is invalid", () => {
    const { result } = setup();
    finishPhaseOne(result);
    const before = result.current.checklist;

    const ok = submit(
      result,
      makeResponse({ checklist_updates: [{ id: "audience", satisfied: "yes" }] })
    );

    expect(ok).toBe(false);
    expect(result.current.checklist).toBe(before);
  });

  it("completes the conversation automatically once every item is satisfied", () => {
    const { result } = setup();
    finishPhaseOne(result);

    submit(
      result,
      makeResponse({
        checklist_updates: [
          { id: "audience", satisfied: true },
          { id: "scope", satisfied: true },
        ],
      })
    );

    expect(result.current.isComplete).toBe(true);
    expect(result.current.conversationStatus).toBe("complete");
  });

  it("completes once the last item is satisfied across several responses", () => {
    const { result } = setup();
    finishPhaseOne(result);

    submit(result, makeResponse({ checklist_updates: [{ id: "audience", satisfied: true }] }));
    expect(result.current.isComplete).toBe(false);

    submit(result, makeResponse({ checklist_updates: [{ id: "scope", satisfied: true }] }));
    expect(result.current.isComplete).toBe(true);
  });

  it("does not complete if the checklist was defined already satisfied-free and has no items", () => {
    const { result } = setup();
    submit(result, makeResponse({ phase_complete: true, checklist: [] }));

    submit(result, makeResponse({ checklist_updates: [{ id: "audience", satisfied: true }] }));

    expect(result.current.isComplete).toBe(false);
  });

  it("accepts no further responses once the checklist completes the conversation", () => {
    const { result } = setup();
    finishPhaseOne(result);
    submit(
      result,
      makeResponse({
        checklist_updates: [
          { id: "audience", satisfied: true },
          { id: "scope", satisfied: true },
        ],
      })
    );
    const messages = result.current.messages;

    const ok = submit(result, makeResponse());

    expect(ok).toBe(false);
    expect(result.current.messages).toBe(messages);
  });

  it("still completes on conversation_complete before the checklist is satisfied", () => {
    const { result } = setup();
    finishPhaseOne(result);

    submit(
      result,
      makeResponse({ next_action: "complete", conversation_complete: true, components: [] })
    );

    expect(result.current.isComplete).toBe(true);
    expect(result.current.checklist.every((item) => item.satisfied === false)).toBe(true);
  });

  it("shows the checklist in the prompt only once it exists", () => {
    const { result } = setup();
    expect(result.current.prompt).not.toContain("## CHECKLIST");
    expect(result.current.promptSections.checklist).toBeNull();

    finishPhaseOne(result);

    expect(result.current.prompt).toContain("## CHECKLIST");
    expect(result.current.prompt).toContain("Who the document is for");
    expect(JSON.parse(result.current.promptSections.checklist)).toEqual(result.current.checklist);
  });

  it("shows updated satisfied flags in the next prompt", () => {
    const { result } = setup();
    finishPhaseOne(result);

    submit(result, makeResponse({ checklist_updates: [{ id: "scope", satisfied: true }] }));

    const parsed = JSON.parse(result.current.promptSections.checklist);
    expect(parsed.find((item) => item.id === "scope").satisfied).toBe(true);
    expect(parsed.find((item) => item.id === "audience").satisfied).toBe(false);
  });

  it("does not change the context or UI state when the checklist changes", () => {
    const { result } = setup();
    finishPhaseOne(result);
    const { context, uiState } = result.current;

    submit(
      result,
      makeResponse({
        components: [],
        checklist_updates: [{ id: "audience", satisfied: true }],
      })
    );

    expect(result.current.context).toBe(context);
    expect(result.current.contextFingerprint).toBeDefined();
    expect(JSON.stringify(result.current.context)).not.toContain("Who the document is for");
    expect(JSON.stringify(uiState)).not.toContain("audience");
  });

  it("clears the checklist on reset", () => {
    const { result } = setup();
    finishPhaseOne(result);
    expect(result.current.checklist.length).toBeGreaterThan(0);

    act(() => result.current.resetSession());

    expect(result.current.checklist).toEqual([]);
    expect(result.current.phase).toBe("boundaries");
    expect(result.current.prompt).not.toContain("## CHECKLIST");
  });

  it("lets a new session define a fresh checklist after a reset", () => {
    const { result } = setup();
    finishPhaseOne(result);
    act(() => result.current.resetSession());

    finishPhaseOne(result, [{ id: "tone", label: "The tone of the document" }]);

    expect(result.current.checklist).toEqual([
      { id: "tone", label: "The tone of the document", satisfied: false },
    ]);
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

describe("persistence with a storage", () => {
  /** In-memory stand-in for the IndexedDB storage: { load, save, clear }. */
  function createMemoryStorage(initial = null) {
    const storage = {
      data: initial,
      loadCalls: 0,
      saveCalls: 0,
      clearCalls: 0,
      async load() {
        storage.loadCalls += 1;
        return storage.data;
      },
      async save(snapshot) {
        storage.saveCalls += 1;
        storage.data = snapshot;
        return true;
      },
      async clear() {
        storage.clearCalls += 1;
        storage.data = null;
        return true;
      },
    };
    return storage;
  }

  // The storage object must stay the same between renders, so it is created
  // outside the hook callback.
  function setupWithStorage(storage) {
    const hook = renderHook(() => useSession(storage));
    return hook;
  }

  async function setupLoaded(storage) {
    const hook = setupWithStorage(storage);
    await waitFor(() => expect(hook.result.current.isLoaded).toBe(true));
    return hook;
  }

  function savedSession(overrides = {}) {
    return createSessionSnapshot({
      messages: [
        { id: WELCOME_MESSAGE.id, role: "assistant", content: WELCOME_MESSAGE.content },
        { id: "m9999", role: "user", content: "Saved-marker-message" },
      ],
      context: { ...createSnapshot(), context_version: 3, summary: "Saved-marker-summary" },
      uiState: { destination: "Saved-marker-value" },
      instruction: "Saved instruction",
      checklist: [
        { id: "audience", label: "Who the document is for", satisfied: true },
        { id: "scope", label: "What the document covers", satisfied: false },
      ],
      documentMarkdown: "",
      ...overrides,
    });
  }

  describe("restoring on mount", () => {
    it("is not loaded until the saved session has been read", async () => {
      const storage = createMemoryStorage(savedSession());
      const { result } = setupWithStorage(storage);

      expect(result.current.isLoaded).toBe(false);

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(storage.loadCalls).toBe(1);
    });

    it("restores messages, context, UI state, instruction and checklist", async () => {
      const { result } = await setupLoaded(createMemoryStorage(savedSession()));

      expect(result.current.messages.map((message) => message.content)).toContain(
        "Saved-marker-message"
      );
      expect(result.current.context.summary).toBe("Saved-marker-summary");
      expect(result.current.context.context_version).toBe(3);
      expect(result.current.uiState.destination).toBe("Saved-marker-value");
      expect(result.current.instruction).toBe("Saved instruction");
      expect(result.current.checklist.map((item) => item.satisfied)).toEqual([true, false]);
    });

    it("uses the restored data in the next prompt", async () => {
      const { result } = await setupLoaded(createMemoryStorage(savedSession()));

      expect(result.current.prompt).toContain("Saved-marker-message");
      expect(result.current.prompt).toContain("Saved-marker-summary");
      expect(result.current.prompt).toContain("Saved-marker-value");
    });

    it("restores the pasted document and the completed state", async () => {
      const storage = createMemoryStorage(
        savedSession({
          messages: [
            { id: WELCOME_MESSAGE.id, role: "assistant", content: WELCOME_MESSAGE.content },
            { id: "complete", role: "assistant", content: "All done." },
          ],
          documentMarkdown: "# Saved document",
        })
      );
      const { result } = await setupLoaded(storage);

      expect(result.current.documentMarkdown).toBe("# Saved document");
      expect(result.current.isComplete).toBe(true);
    });

    it("does not reuse a restored message id for a new message", async () => {
      const { result } = await setupLoaded(createMemoryStorage(savedSession()));

      act(() => result.current.sendUserMessage("A new message"));

      const ids = result.current.messages.map((message) => message.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.current.messages.at(-1).id).not.toBe("m9999");
    });

    it("starts a fresh session when nothing was saved", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.context.summary).toBe("");
      expect(result.current.uiState).toEqual({});
      expect(result.current.checklist).toEqual([]);
    });

    it("starts a fresh session when the saved data is malformed", async () => {
      const storage = createMemoryStorage({ version: 1, messages: "nope" });
      const { result } = await setupLoaded(storage);

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.context.summary).toBe("");
    });

    it("starts a fresh session when the saved data is from another version", async () => {
      const storage = createMemoryStorage({ ...savedSession(), version: 999 });
      const { result } = await setupLoaded(storage);

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.context.summary).toBe("");
    });

    it("still becomes loaded when reading the saved session fails", async () => {
      const storage = createMemoryStorage();
      storage.load = async () => {
        throw new Error("read failed");
      };
      const { result } = await setupLoaded(storage);

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.isLoaded).toBe(true);
    });
  });

  describe("saving after changes", () => {
    it("does not save a blank session", async () => {
      const storage = createMemoryStorage(null);
      await setupLoaded(storage);

      expect(storage.saveCalls).toBe(0);
      expect(storage.data).toBeNull();
    });

    it("saves the conversation after the user sends a message", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);

      act(() => result.current.sendUserMessage("Persisted-marker-message"));

      await waitFor(() => expect(storage.data).not.toBeNull());
      expect(JSON.stringify(storage.data.messages)).toContain("Persisted-marker-message");
    });

    it("saves context, UI state and the last response after a response", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);

      submit(
        result,
        makeResponse({
          message: { role: "assistant", content: "Where to?" },
          context_updates: [{ key: "summary", value: "Persisted-marker-summary" }],
          state_updates: [{ id: "destination", value: "Persisted-marker-value" }],
        })
      );

      await waitFor(() => expect(storage.data?.context.summary).toBe("Persisted-marker-summary"));
      expect(storage.data.uiState.destination).toBe("Persisted-marker-value");
      expect(storage.data.lastResponse.message.content).toBe("Where to?");
      expect(JSON.stringify(storage.data.messages)).toContain("Where to?");
    });

    it("saves a field edit", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);

      act(() => result.current.updateUiState("budget", 4321));

      await waitFor(() => expect(storage.data?.uiState.budget).toBe(4321));
    });

    it("saves an edited instruction", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);

      act(() => result.current.updateInstruction("Persisted instruction"));

      await waitFor(() => expect(storage.data?.instruction).toBe("Persisted instruction"));
    });

    it("saves the checklist and its updates", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);

      submit(
        result,
        makeResponse({
          phase_complete: true,
          checklist: [
            { id: "audience", label: "Who the document is for" },
            { id: "scope", label: "What the document covers" },
          ],
        })
      );
      await waitFor(() => expect(storage.data?.checklist).toHaveLength(2));

      submit(result, makeResponse({ checklist_updates: [{ id: "audience", satisfied: true }] }));
      await waitFor(() =>
        expect(storage.data.checklist.map((item) => item.satisfied)).toEqual([true, false])
      );
    });

    it("saves the pasted document", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);
      submit(result, makeResponse({ conversation_complete: true, next_action: "complete" }));

      act(() => {
        result.current.submitDocument("# Persisted document");
      });

      await waitFor(() => expect(storage.data?.documentMarkdown).toBe("# Persisted document"));
    });

    it("does not save before the saved session has been restored", async () => {
      const storage = createMemoryStorage(savedSession());
      const { result } = setupWithStorage(storage);

      // Changes made while loading must not overwrite the saved session with
      // a blank one.
      expect(result.current.isLoaded).toBe(false);
      expect(storage.saveCalls).toBe(0);

      await waitFor(() => expect(result.current.isLoaded).toBe(true));
      expect(JSON.stringify(storage.data.messages)).toContain("Saved-marker-message");
    });

    it("keeps working when saving fails", async () => {
      const storage = createMemoryStorage(null);
      storage.save = async () => {
        throw new Error("write failed");
      };
      const { result } = await setupLoaded(storage);

      act(() => result.current.sendUserMessage("Still works"));

      expect(result.current.messages.at(-1)).toMatchObject({
        role: "user",
        content: "Still works",
      });
    });

    it("keeps working when saving returns a rejected promise", async () => {
      const storage = createMemoryStorage(null);
      storage.save = () => Promise.reject(new Error("write failed"));
      const { result } = await setupLoaded(storage);

      act(() => result.current.updateUiState("budget", 1));

      expect(result.current.uiState.budget).toBe(1);
    });

    it("brings a saved session back in a new hook using the same storage", async () => {
      const storage = createMemoryStorage(null);
      const first = await setupLoaded(storage);

      submit(
        first.result,
        makeResponse({ context_updates: [{ key: "summary", value: "Round-trip-summary" }] })
      );
      act(() => first.result.current.sendUserMessage("Round-trip-message"));
      await waitFor(() =>
        expect(JSON.stringify(storage.data?.messages)).toContain("Round-trip-message")
      );
      first.unmount();

      const second = await setupLoaded(storage);

      expect(second.result.current.context.summary).toBe("Round-trip-summary");
      expect(second.result.current.messages.at(-1)).toMatchObject({
        role: "user",
        content: "Round-trip-message",
      });
    });
  });

  describe("clearing on reset", () => {
    it("clears the saved session when the session is reset", async () => {
      const storage = createMemoryStorage(savedSession());
      const { result } = await setupLoaded(storage);

      act(() => result.current.resetSession());

      await waitFor(() => expect(storage.data).toBeNull());
      expect(storage.clearCalls).toBe(1);
    });

    it("does not write the blank session back after a reset", async () => {
      const storage = createMemoryStorage(null);
      const { result } = await setupLoaded(storage);
      act(() => result.current.sendUserMessage("About to be reset"));
      await waitFor(() => expect(storage.data).not.toBeNull());

      act(() => result.current.resetSession());

      await waitFor(() => expect(storage.data).toBeNull());
      // Give a stray save a chance to run before checking.
      await act(async () => {
        await Promise.resolve();
      });
      expect(storage.data).toBeNull();
      expect(result.current.messages).toHaveLength(1);
    });

    it("saves again once the new session changes", async () => {
      const storage = createMemoryStorage(savedSession());
      const { result } = await setupLoaded(storage);
      act(() => result.current.resetSession());
      await waitFor(() => expect(storage.data).toBeNull());

      act(() => result.current.sendUserMessage("Fresh-start-message"));

      await waitFor(() => expect(storage.data).not.toBeNull());
      expect(JSON.stringify(storage.data.messages)).toContain("Fresh-start-message");
      expect(JSON.stringify(storage.data.messages)).not.toContain("Saved-marker-message");
    });

    it("keeps working when clearing fails", async () => {
      const storage = createMemoryStorage(savedSession());
      storage.clear = () => Promise.reject(new Error("clear failed"));
      const { result } = await setupLoaded(storage);

      act(() => result.current.resetSession());

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.checklist).toEqual([]);
    });
  });

  describe("without a storage", () => {
    it("is loaded at once", () => {
      const { result } = renderHook(() => useSession());
      expect(result.current.isLoaded).toBe(true);
    });

    it("is loaded at once when the storage is null", () => {
      const { result } = renderHook(() => useSession(null));
      expect(result.current.isLoaded).toBe(true);
    });

    it("works as an in-memory session", () => {
      const { result } = renderHook(() => useSession(null));

      act(() => result.current.sendUserMessage("Memory only"));
      act(() => result.current.updateUiState("budget", 7));

      expect(result.current.messages.at(-1).content).toBe("Memory only");
      expect(result.current.uiState.budget).toBe(7);
    });

    it("resets without needing a storage", () => {
      const { result } = renderHook(() => useSession());
      act(() => result.current.sendUserMessage("Memory only"));

      expect(() => act(() => result.current.resetSession())).not.toThrow();
      expect(result.current.messages).toHaveLength(1);
    });
  });
});