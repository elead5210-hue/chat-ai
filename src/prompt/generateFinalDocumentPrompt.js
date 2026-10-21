import { buildContextPackage } from "../context/contextPackage.js";
import { isNexusMessage } from "../state/conversationStore.js";

/**
 * Final-step prompt. Once the conversation is complete, this is the last
 * prompt the user sends to their external AI. Unlike the normal Nexus prompt,
 * it does NOT ask for the JSON response schema: it asks for the finished
 * document as plain Markdown, which the application then renders so it can be
 * saved as a PDF or printed.
 */

export const FINAL_DOCUMENT_INSTRUCTION =
  "The conversation below is complete. Using everything that was discussed and decided, " +
  "write the final document as a single Markdown (.md) document. " +
  "Do not ask any further questions.";

export const FINAL_DOCUMENT_RULES = Object.freeze([
  "Return ONLY the Markdown document. No JSON, no explanation, and no text before or after it.",
  "Do not wrap the document in a code fence.",
  "Start with a single top-level heading (#) that gives the document a title.",
  "Organise the content with headings (##, ###), paragraphs, bullet or numbered lists, and tables where they help.",
  "Use only standard Markdown. Do not use HTML tags.",
  "Base the document on the decisions, preferences and current state in the context, and on the conversation. Do not invent facts that were not discussed.",
  "Write it so it reads well when printed or saved as a PDF.",
]);

function formatConversation(messages) {
  // Nexus's own lines (welcome / completion notices) were never said by the
  // user or the AI, so they are left out.
  const spoken = Array.isArray(messages)
    ? messages.filter((message) => !isNexusMessage(message))
    : [];
  if (spoken.length === 0) {
    return "(No messages.)";
  }
  return spoken
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
}

function resolveInstruction(instruction) {
  if (typeof instruction !== "string" || instruction.trim() === "") {
    return FINAL_DOCUMENT_INSTRUCTION;
  }
  return instruction.trim();
}

/**
 * Build the individual sections of the final prompt, returned separately so
 * the UI can show them on their own.
 *
 * @param {object} input
 * @param {string} [input.instruction]  Overrides the default instruction.
 * @param {object} [input.context]      Context Snapshot.
 * @param {Array}  [input.messages]     Conversation so far: { role, content }.
 */
export function generateFinalDocumentPromptSections({
  instruction = FINAL_DOCUMENT_INSTRUCTION,
  context = {},
  messages = [],
} = {}) {
  return {
    instruction: resolveInstruction(instruction),
    context: buildContextPackage(context),
    conversation: formatConversation(messages),
    rules: FINAL_DOCUMENT_RULES.map((rule, index) => `${index + 1}. ${rule}`).join("\n"),
  };
}

/**
 * Join the sections into the single text the user copies into their AI.
 */
export function generateFinalDocumentPrompt(input = {}) {
  const sections = generateFinalDocumentPromptSections(input);

  return [
    "## INSTRUCTION",
    sections.instruction,
    "",
    "## CONTEXT",
    "This is the final context package. Treat it as the agreed state of the project.",
    sections.context,
    "",
    "## CONVERSATION",
    sections.conversation,
    "",
    "## OUTPUT RULES",
    sections.rules,
    "",
    "Respond now with the Markdown document only.",
  ].join("\n");
}