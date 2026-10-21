import {
  RESPONSE_FIELDS,
  OPTIONAL_RESPONSE_FIELDS,
  RESPONSE_SCHEMA_EXAMPLE,
  RESPONSE_SCHEMA_RULES,
} from "../protocol/schema.js";
import { buildComponentCatalog } from "./componentCatalog.js";
import { buildContextPackage, buildContinuationPrompt } from "../context/contextPackage.js";
import {
  CONVERSATION_PHASE_BOUNDARIES,
  CONVERSATION_PHASE_CONTEXT,
  isNexusMessage,
} from "../state/conversationStore.js";

export const DEFAULT_INSTRUCTION =
  "You are the AI behind Nexus, a structured interface between a user and an AI. " +
  "Continue the conversation below. Reply to the user's latest message and, when you need " +
  "information from them, describe the input fields to show using the available components. " +
  "Your reply is parsed by an application, so it must follow the response schema exactly. " +
  "The conversation must end: once you have everything you need and the task is finished, " +
  "set next_action to \"complete\" and conversation_complete to true, and do not ask any further questions.";

const PHASE_INSTRUCTION_INTRO =
  "You are the AI behind Nexus, a structured interface between a user and an AI. " +
  "The conversation has two phases and is used to prepare a final document. " +
  "Reply to the user's latest message and, when you need information from them, describe the input fields to show using the available components. " +
  "Your reply is parsed by an application, so it must follow the response schema exactly. ";

/** Instruction for phase one: define the boundaries of the document. */
export const BOUNDARIES_PHASE_INSTRUCTION =
  PHASE_INSTRUCTION_INTRO +
  "You are in PHASE ONE: defining the boundaries of the document. " +
  "Work out with the user what the document is for, who it is for, what it must cover and what is out of scope. " +
  "Record each boundary you settle in context_updates. " +
  "Once the boundaries are clear, set phase_complete to true to move to phase two, and in the same reply send a checklist of the items that must still be settled before the final document can be written. " +
  "Do not set conversation_complete to true during phase one.";

/** Instruction for phase two: capture the context needed for the final document. */
export const CONTEXT_PHASE_INSTRUCTION =
  PHASE_INSTRUCTION_INTRO +
  "You are in PHASE TWO: capturing the context needed to write the final document within the boundaries already defined. " +
  "Ask only for the facts, details and preferences the document still needs, and record each answer in context_updates. " +
  "Do not reopen the boundaries. " +
  "A checklist of items to settle is shown below. After each user response, send checklist_updates marking every checklist item that the response now satisfies. " +
  "The conversation completes automatically once every checklist item is satisfied. " +
  "Once you have everything needed, set next_action to \"complete\" and conversation_complete to true, and do not ask any further questions.";

const PHASE_INSTRUCTIONS = Object.freeze({
  [CONVERSATION_PHASE_BOUNDARIES]: BOUNDARIES_PHASE_INSTRUCTION,
  [CONVERSATION_PHASE_CONTEXT]: CONTEXT_PHASE_INSTRUCTION,
});

function toJson(value) {
  return JSON.stringify(value, null, 2);
}

/**
 * The instruction text. A custom instruction is always used as given. When the
 * instruction is blank or the default and a known phase is supplied, the
 * phase-specific instruction is used instead.
 */
function resolveInstruction(instruction, phase = null) {
  const isDefault =
    typeof instruction !== "string" ||
    instruction.trim() === "" ||
    instruction === DEFAULT_INSTRUCTION;
  if (isDefault) {
    return PHASE_INSTRUCTIONS[phase] ?? DEFAULT_INSTRUCTION;
  }
  return instruction;
}

/**
 * The checklist as JSON, or null when there is no checklist yet. Only the
 * fields the AI needs are included: id, label and whether it is satisfied.
 */
function formatChecklist(checklist) {
  if (!Array.isArray(checklist) || checklist.length === 0) return null;
  return toJson(
    checklist.map((item) => ({
      id: item.id,
      label: item.label,
      satisfied: item.satisfied === true,
    }))
  );
}

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * One line per protocol field: name, whether it is required, its type and what
 * it means. Built from RESPONSE_FIELDS so the prompt cannot drift from the
 * protocol definition.
 */
function formatResponseFields() {
  return [...RESPONSE_FIELDS, ...OPTIONAL_RESPONSE_FIELDS].map((field) => {
    const flag = field.required ? "required" : "optional";
    return `- ${field.name} (${flag}, ${field.type}): ${field.description}`;
  }).join("\n");
}

function formatConversation(messages) {
  // Nexus's own lines (the welcome message) were never said by the AI or the
  // user, so they are not part of the conversation the AI is shown.
  const spoken = Array.isArray(messages)
    ? messages.filter((message) => !isNexusMessage(message))
    : [];
  if (spoken.length === 0) {
    return "(No messages yet. Start the conversation.)";
  }
  return spoken
    .map((message) => {
      const speaker = message.role === "user" ? "User" : "Assistant";
      return `${speaker}: ${message.content}`;
    })
    .join("\n");
}

/**
 * Build the individual prompt sections. Returned separately so the UI can show
 * each one on its own, and joined by generatePrompt for copying.
 *
 * @param {object} input
 * @param {string} [input.instruction]  What the AI is being asked to do.
 * @param {object} [input.context]      Context Snapshot (summary, decisions, preferences,
 *                                      current state, open questions). Rendered as a
 *                                      compact Context Package.
 * @param {Array}  [input.messages]     Conversation so far: { role, content }.
 * @param {object} [input.uiState]      Values the user entered in generated forms.
 * @param {string} [input.contextFingerprint]  Optional id for the context version.
 * @param {string} [input.phase]        "boundaries" (phase one) or "context" (phase two).
 *                                      Selects the phase-specific instruction when the
 *                                      instruction is the default.
 * @param {Array}  [input.checklist]    Completion checklist: { id, label, satisfied }.
 *                                      Shown to the AI as JSON once it exists.
 */
export function generatePromptSections({
  instruction = DEFAULT_INSTRUCTION,
  context = {},
  messages = [],
  uiState = {},
  contextFingerprint = null,
  phase = null,
  checklist = [],
} = {}) {
  const contextBlock = buildContextPackage(context);

  const uiStateBlock = isEmpty(uiState)
    ? "(The user has not filled in any fields yet.)"
    : toJson(uiState);

  return {
    instruction: resolveInstruction(instruction, phase).trim(),
    context: contextFingerprint
      ? `Context fingerprint: ${contextFingerprint}\n${contextBlock}`
      : contextBlock,
    conversation: formatConversation(messages),
    uiState: uiStateBlock,
    checklist: formatChecklist(checklist),
    availableComponents: toJson(buildComponentCatalog()),
    responseSchema: [
      "Fields:",
      formatResponseFields(),
      "",
      "Rules:",
      ...RESPONSE_SCHEMA_RULES.map((rule, index) => `${index + 1}. ${rule}`),
      "",
      "Example of a valid response:",
      toJson(RESPONSE_SCHEMA_EXAMPLE),
    ].join("\n"),
  };
}

/**
 * Build a prompt that hands an existing conversation to a different AI using
 * only the Context Package, so the full transcript does not need to be copied.
 *
 * @param {object} input
 * @param {object} [input.context]  Context Snapshot.
 * @param {Array}  [input.messages] Used only to find the latest user message.
 */
export function generateContinuationPrompt({ context = {}, messages = [] } = {}) {
  const lastUser = Array.isArray(messages)
    ? [...messages].reverse().find((message) => message.role === "user")
    : null;
  return buildContinuationPrompt(context, { latestMessage: lastUser?.content ?? "" });
}

/**
 * Join the sections into the single text the user copies into an external AI.
 */
export function generatePrompt(input = {}) {
  const sections = generatePromptSections(input);

  return [
    "## INSTRUCTION",
    sections.instruction,
    "",
    "## CONTEXT",
    "This is the current context package. Treat it as the state of the conversation so far and continue from it.",
    sections.context,
    "",
    "## CONVERSATION SO FAR",
    sections.conversation,
    "",
    ...(sections.checklist
      ? [
          "## CHECKLIST",
          "These are the items to settle before the final document. Mark an item satisfied with checklist_updates once the user's response settles it.",
          sections.checklist,
          "",
        ]
      : []),
    "## CURRENT UI STATE (values the user has entered)",
    sections.uiState,
    "",
    "## AVAILABLE COMPONENTS",
    sections.availableComponents,
    "",
    "## RESPONSE SCHEMA",
    sections.responseSchema,
    "",
    "Respond now with the JSON object only.",
  ].join("\n");
}