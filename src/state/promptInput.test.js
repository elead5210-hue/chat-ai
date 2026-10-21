import { describe, it, expect } from "vitest";
import {
  PROMPT_INPUT_SOURCES,
  buildContinuationInput,
  buildPromptInput,
} from "./promptInput.js";
import {
  generateContinuationPrompt,
  generatePrompt,
  generatePromptSections,
} from "../prompt/generatePrompt.js";
import { createSnapshot, updateSnapshot } from "../context/contextSnapshot.js";
import {
  appendAssistantMessage,
  appendUserMessage,
  createConversation,
} from "./conversationStore.js";
import { createUiState, setValue } from "./uiStateStore.js";

const CONVERSATION_MARKER = "Looking for a quiet beach town";
const CONTEXT_MARKER = "Traveller wants a slow-paced coastal trip";
const UI_MARKER = "Zanzibar-Stone-Town";

function makeMessages(text = CONVERSATION_MARKER) {
  return appendUserMessage(createConversation(), text);
}

function makeContext(summary = CONTEXT_MARKER) {
  return updateSnapshot(createSnapshot({ conversationId: "conv-test" }), { summary });
}

function makeUiState(value = UI_MARKER) {
  return setValue(createUiState(), "destination", value);
}

/** Pull one "## HEADING" section out of a generated prompt. */
function section(prompt, heading) {
  const lines = prompt.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${heading}`));
  if (start === -1) return "";
  let end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join("\n");
}

describe("PROMPT_INPUT_SOURCES", () => {
  it("names the prompt field each store feeds", () => {
    expect(PROMPT_INPUT_SOURCES).toEqual({
      conversation: "messages",
      context: "context",
      uiState: "uiState",
    });
  });

  it("is frozen so the mapping cannot be changed at runtime", () => {
    expect(Object.isFrozen(PROMPT_INPUT_SOURCES)).toBe(true);
  });

  it("maps each store to a different field", () => {
    const fields = Object.values(PROMPT_INPUT_SOURCES);
    expect(new Set(fields).size).toBe(fields.length);
  });
});

describe("buildPromptInput", () => {
  it("maps each store to its own field", () => {
    const messages = makeMessages();
    const context = makeContext();
    const uiState = makeUiState();

    const input = buildPromptInput({ instruction: "Do it", messages, context, uiState });

    expect(input.instruction).toBe("Do it");
    expect(input[PROMPT_INPUT_SOURCES.conversation]).toBe(messages);
    expect(input[PROMPT_INPUT_SOURCES.context]).toBe(context);
    expect(input[PROMPT_INPUT_SOURCES.uiState]).toBe(uiState);
  });

  it("passes each store through by reference without copying or merging", () => {
    const messages = makeMessages();
    const context = makeContext();
    const uiState = makeUiState();

    const input = buildPromptInput({ messages, context, uiState });

    expect(input.messages).toBe(messages);
    expect(input.context).toBe(context);
    expect(input.uiState).toBe(uiState);
  });

  it("keeps the stores' data apart", () => {
    const messages = makeMessages();
    const context = makeContext();
    const uiState = makeUiState();

    const input = buildPromptInput({ messages, context, uiState });

    expect(input.messages).toEqual(messages);
    expect(input.context).toEqual(context);
    expect(input.uiState).toEqual(uiState);
    expect(input.messages).not.toBe(input.context);
    expect(input.context).not.toBe(input.uiState);
    expect(input.uiState).not.toBe(input.messages);
  });

  it("returns only instruction and the three store fields", () => {
    const input = buildPromptInput({
      instruction: "x",
      messages: [],
      context: {},
      uiState: {},
      extra: "ignored",
    });
    expect(Object.keys(input).sort()).toEqual(["context", "instruction", "messages", "uiState"]);
  });

  it("leaves a missing store undefined so generatePrompt applies its own default", () => {
    const input = buildPromptInput({ messages: makeMessages() });
    expect(input.context).toBeUndefined();
    expect(input.uiState).toBeUndefined();
    expect(input.instruction).toBeUndefined();
  });

  it("does not let one missing store affect the others", () => {
    const context = makeContext();
    const input = buildPromptInput({ context });
    expect(input.context).toBe(context);
    expect(input.messages).toBeUndefined();
    expect(input.uiState).toBeUndefined();
  });

  it("accepts no argument at all", () => {
    expect(buildPromptInput()).toEqual({
      instruction: undefined,
      messages: undefined,
      context: undefined,
      uiState: undefined,
    });
  });

  it("does not mutate the stores it is given", () => {
    const messages = Object.freeze([...makeMessages()]);
    const context = Object.freeze({ ...makeContext() });
    const uiState = Object.freeze({ ...makeUiState() });

    expect(() => buildPromptInput({ messages, context, uiState })).not.toThrow();
    expect(messages).toHaveLength(2);
    expect(uiState.destination).toBe(UI_MARKER);
  });

  it("returns a new object on each call", () => {
    const stores = { messages: makeMessages(), context: makeContext(), uiState: makeUiState() };
    expect(buildPromptInput(stores)).not.toBe(buildPromptInput(stores));
  });
});

describe("buildContinuationInput", () => {
  it("maps the conversation and context stores to their own fields", () => {
    const messages = makeMessages();
    const context = makeContext();

    const input = buildContinuationInput({ messages, context });

    expect(input.messages).toBe(messages);
    expect(input.context).toBe(context);
  });

  it("leaves UI state out, even if it is passed in", () => {
    const input = buildContinuationInput({
      messages: makeMessages(),
      context: makeContext(),
      uiState: makeUiState(),
    });
    expect(Object.keys(input).sort()).toEqual(["context", "messages"]);
    expect(input).not.toHaveProperty("uiState");
  });

  it("accepts no argument at all", () => {
    expect(buildContinuationInput()).toEqual({ context: undefined, messages: undefined });
  });
});

describe("generatePrompt fed by buildPromptInput", () => {
  it("includes data from all three stores", () => {
    const prompt = generatePrompt(
      buildPromptInput({
        messages: makeMessages(),
        context: makeContext(),
        uiState: makeUiState(),
      })
    );

    expect(prompt).toContain(CONVERSATION_MARKER);
    expect(prompt).toContain(CONTEXT_MARKER);
    expect(prompt).toContain(UI_MARKER);
  });

  it("puts each store's data in its own section only", () => {
    const prompt = generatePrompt(
      buildPromptInput({
        messages: makeMessages(),
        context: makeContext(),
        uiState: makeUiState(),
      })
    );

    const contextSection = section(prompt, "CONTEXT");
    const conversationSection = section(prompt, "CONVERSATION SO FAR");
    const uiSection = section(prompt, "CURRENT UI STATE");

    expect(contextSection).toContain(CONTEXT_MARKER);
    expect(contextSection).not.toContain(CONVERSATION_MARKER);
    expect(contextSection).not.toContain(UI_MARKER);

    expect(conversationSection).toContain(CONVERSATION_MARKER);
    expect(conversationSection).not.toContain(CONTEXT_MARKER);
    expect(conversationSection).not.toContain(UI_MARKER);

    expect(uiSection).toContain(UI_MARKER);
    expect(uiSection).not.toContain(CONTEXT_MARKER);
    expect(uiSection).not.toContain(CONVERSATION_MARKER);
  });

  it("matches the section builder for the same input", () => {
    const input = buildPromptInput({
      messages: makeMessages(),
      context: makeContext(),
      uiState: makeUiState(),
    });
    const sections = generatePromptSections(input);
    const prompt = generatePrompt(input);

    expect(prompt).toContain(sections.context);
    expect(prompt).toContain(sections.conversation);
    expect(prompt).toContain(sections.uiState);
  });

  it("uses the instruction when one is given", () => {
    const prompt = generatePrompt(
      buildPromptInput({ instruction: "Plan a weekend in Durban." })
    );
    expect(section(prompt, "INSTRUCTION")).toContain("Plan a weekend in Durban.");
  });

  it("falls back to the default instruction when none is given", () => {
    const prompt = generatePrompt(buildPromptInput({}));
    expect(section(prompt, "INSTRUCTION")).toContain("Nexus");
  });

  it("falls back to each store's empty text when the stores are missing", () => {
    const prompt = generatePrompt(buildPromptInput({}));
    expect(section(prompt, "CONTEXT")).toContain("(No context yet.)");
    expect(section(prompt, "CONVERSATION SO FAR")).toContain("(No messages yet.");
    expect(section(prompt, "CURRENT UI STATE")).toContain("has not filled in any fields");
  });
});

describe("generatePrompt reflects each store independently", () => {
  const baseMessages = makeMessages();
  const baseContext = makeContext();
  const baseUiState = makeUiState();

  function promptFor(overrides = {}) {
    return generatePrompt(
      buildPromptInput({
        messages: baseMessages,
        context: baseContext,
        uiState: baseUiState,
        ...overrides,
      })
    );
  }

  it("changing only the conversation changes only the conversation section", () => {
    const before = promptFor();
    const after = promptFor({
      messages: appendAssistantMessage(baseMessages, "Which month are you travelling?"),
    });

    expect(section(after, "CONVERSATION SO FAR")).toContain("Which month are you travelling?");
    expect(section(after, "CONVERSATION SO FAR")).not.toBe(
      section(before, "CONVERSATION SO FAR")
    );
    expect(section(after, "CONTEXT")).toBe(section(before, "CONTEXT"));
    expect(section(after, "CURRENT UI STATE")).toBe(section(before, "CURRENT UI STATE"));
  });

  it("changing only the context changes only the context section", () => {
    const before = promptFor();
    const after = promptFor({
      context: updateSnapshot(baseContext, { summary: "Budget is now the main concern" }),
    });

    expect(section(after, "CONTEXT")).toContain("Budget is now the main concern");
    expect(section(after, "CONTEXT")).not.toBe(section(before, "CONTEXT"));
    expect(section(after, "CONVERSATION SO FAR")).toBe(section(before, "CONVERSATION SO FAR"));
    expect(section(after, "CURRENT UI STATE")).toBe(section(before, "CURRENT UI STATE"));
  });

  it("changing only the UI state changes only the UI state section", () => {
    const before = promptFor();
    const after = promptFor({ uiState: setValue(baseUiState, "budget", 45000) });

    expect(section(after, "CURRENT UI STATE")).toContain("45000");
    expect(section(after, "CURRENT UI STATE")).not.toBe(section(before, "CURRENT UI STATE"));
    expect(section(after, "CONTEXT")).toBe(section(before, "CONTEXT"));
    expect(section(after, "CONVERSATION SO FAR")).toBe(section(before, "CONVERSATION SO FAR"));
  });

  it("clearing one store does not remove the data of the other two", () => {
    const withoutMessages = promptFor({ messages: [] });
    expect(withoutMessages).not.toContain(CONVERSATION_MARKER);
    expect(withoutMessages).toContain(CONTEXT_MARKER);
    expect(withoutMessages).toContain(UI_MARKER);

    const withoutContext = promptFor({ context: createSnapshot({ conversationId: "conv-test" }) });
    expect(withoutContext).not.toContain(CONTEXT_MARKER);
    expect(withoutContext).toContain(CONVERSATION_MARKER);
    expect(withoutContext).toContain(UI_MARKER);

    const withoutUiState = promptFor({ uiState: createUiState() });
    expect(withoutUiState).not.toContain(UI_MARKER);
    expect(withoutUiState).toContain(CONVERSATION_MARKER);
    expect(withoutUiState).toContain(CONTEXT_MARKER);
  });

  it("does not show one store's data in another store's section when only one is filled", () => {
    const onlyMessages = generatePrompt(buildPromptInput({ messages: baseMessages }));
    expect(section(onlyMessages, "CONVERSATION SO FAR")).toContain(CONVERSATION_MARKER);
    expect(section(onlyMessages, "CONTEXT")).not.toContain(CONVERSATION_MARKER);
    expect(section(onlyMessages, "CURRENT UI STATE")).not.toContain(CONVERSATION_MARKER);

    const onlyUiState = generatePrompt(buildPromptInput({ uiState: baseUiState }));
    expect(section(onlyUiState, "CURRENT UI STATE")).toContain(UI_MARKER);
    expect(section(onlyUiState, "CONTEXT")).not.toContain(UI_MARKER);
    expect(section(onlyUiState, "CONVERSATION SO FAR")).not.toContain(UI_MARKER);
  });
});

describe("generateContinuationPrompt fed by buildContinuationInput", () => {
  it("uses the conversation and context stores and leaves UI state out", () => {
    const prompt = generateContinuationPrompt(
      buildContinuationInput({
        messages: makeMessages(),
        context: makeContext(),
        uiState: makeUiState(),
      })
    );

    expect(prompt).toContain(CONTEXT_MARKER);
    expect(prompt).toContain(CONVERSATION_MARKER);
    expect(prompt).not.toContain(UI_MARKER);
  });
});