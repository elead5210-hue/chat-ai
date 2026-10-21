import { describe, it, expect } from "vitest";
import {
  FINAL_DOCUMENT_INSTRUCTION,
  FINAL_DOCUMENT_RULES,
  generateFinalDocumentPrompt,
  generateFinalDocumentPromptSections,
} from "./generateFinalDocumentPrompt.js";
import {
  appendAssistantMessage,
  appendUserMessage,
  completeConversation,
  createConversation,
} from "../state/conversationStore.js";
import { createSnapshot } from "../context/contextSnapshot.js";

function makeMessages() {
  let messages = createConversation();
  messages = appendUserMessage(messages, "I want a one-page trip plan.");
  messages = appendAssistantMessage(messages, "Where would you like to go?");
  messages = appendUserMessage(messages, "Lisbon in December.");
  return messages;
}

describe("generateFinalDocumentPromptSections", () => {
  it("uses the default instruction when none is given", () => {
    const sections = generateFinalDocumentPromptSections({});
    expect(sections.instruction).toBe(FINAL_DOCUMENT_INSTRUCTION);
  });

  it("uses the default instruction when the given one is blank", () => {
    const sections = generateFinalDocumentPromptSections({ instruction: "   " });
    expect(sections.instruction).toBe(FINAL_DOCUMENT_INSTRUCTION);
  });

  it("uses a custom instruction, trimmed", () => {
    const sections = generateFinalDocumentPromptSections({ instruction: "  Write a memo.  " });
    expect(sections.instruction).toBe("Write a memo.");
  });

  it("includes the spoken messages with speaker labels", () => {
    const sections = generateFinalDocumentPromptSections({ messages: makeMessages() });
    expect(sections.conversation).toContain("User: I want a one-page trip plan.");
    expect(sections.conversation).toContain("Assistant: Where would you like to go?");
    expect(sections.conversation).toContain("User: Lisbon in December.");
  });

  it("leaves out Nexus's own lines", () => {
    const messages = completeConversation(makeMessages());
    const { conversation } = generateFinalDocumentPromptSections({ messages });
    expect(conversation).not.toContain("What would you like to work on?");
    expect(conversation).not.toContain("This conversation is complete.");
  });

  it("handles a missing or empty conversation", () => {
    expect(generateFinalDocumentPromptSections({ messages: undefined }).conversation).toMatch(
      /No messages/
    );
    expect(
      generateFinalDocumentPromptSections({ messages: createConversation() }).conversation
    ).toMatch(/No messages/);
  });

  it("numbers the output rules", () => {
    const { rules } = generateFinalDocumentPromptSections({});
    expect(rules.split("\n")).toHaveLength(FINAL_DOCUMENT_RULES.length);
    expect(rules.startsWith("1. ")).toBe(true);
  });

  it("is not affected by the context being omitted", () => {
    expect(typeof generateFinalDocumentPromptSections({}).context).toBe("string");
  });
});

describe("generateFinalDocumentPrompt", () => {
  it("asks for a Markdown document", () => {
    const prompt = generateFinalDocumentPrompt({});
    expect(prompt).toMatch(/Markdown/);
    expect(prompt).toMatch(/\.md/);
    expect(prompt).toContain("Respond now with the Markdown document only.");
  });

  it("tells the AI not to ask further questions", () => {
    expect(generateFinalDocumentPrompt({})).toMatch(/Do not ask any further questions/);
  });

  it("does not ask for the JSON response schema", () => {
    const prompt = generateFinalDocumentPrompt({});
    expect(prompt).not.toContain("## RESPONSE SCHEMA");
    expect(prompt).not.toContain("## AVAILABLE COMPONENTS");
    expect(prompt).toMatch(/No JSON/);
  });

  it("contains all the main sections in order", () => {
    const prompt = generateFinalDocumentPrompt({});
    const headings = ["## INSTRUCTION", "## CONTEXT", "## CONVERSATION", "## OUTPUT RULES"];
    const positions = headings.map((heading) => prompt.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("includes the conversation", () => {
    const prompt = generateFinalDocumentPrompt({ messages: makeMessages() });
    expect(prompt).toContain("Lisbon in December.");
  });

  it("includes the context package built from the snapshot", () => {
    const context = createSnapshot();
    const sections = generateFinalDocumentPromptSections({ context });
    const prompt = generateFinalDocumentPrompt({ context });
    expect(prompt).toContain(sections.context);
  });

  it("includes every output rule", () => {
    const prompt = generateFinalDocumentPrompt({});
    for (const rule of FINAL_DOCUMENT_RULES) {
      expect(prompt).toContain(rule);
    }
  });

  it("works with no input at all", () => {
    expect(() => generateFinalDocumentPrompt()).not.toThrow();
    expect(generateFinalDocumentPrompt().length).toBeGreaterThan(0);
  });
});