
/**
 * Conversation store: what was said.
 *
 * The conversation is an ordered list of messages and nothing else. It holds
 * no context (what currently matters) and no UI state (what the user has typed
 * into generated forms); those live in their own stores. All three are
 * combined only when the prompt is generated.
 *
 * Message shape:
 *   { id: string, role: "user" | "assistant", content: string }
 *
 * Every helper is pure: it returns a new array (or the same one when nothing
 * changed) and never mutates its input.
 *
 * Completion: a conversation is complete once it contains a message with the
 * id COMPLETION_MESSAGE_ID. After that point no further messages are appended,
 * so the chat terminates instead of looping forever.
 *
 * Phases: before it completes, the conversation runs in two phases. Phase one
 * ("boundaries") defines the boundaries of the document. Phase two ("context")
 * captures the context needed to generate the final document. The conversation
 * is in phase two once it contains a message with the id PHASE_ADVANCE_MESSAGE_ID.
 */

export const MESSAGE_ROLE_USER = "user";
export const MESSAGE_ROLE_ASSISTANT = "assistant";
export const CONVERSATION_ROLES = [MESSAGE_ROLE_USER, MESSAGE_ROLE_ASSISTANT];

export const CONVERSATION_STATUS_ACTIVE = "active";
export const CONVERSATION_STATUS_COMPLETE = "complete";
export const COMPLETION_MESSAGE_ID = "complete";

export const COMPLETION_MESSAGE = Object.freeze({
  id: COMPLETION_MESSAGE_ID,
  role: MESSAGE_ROLE_ASSISTANT,
  content: "This conversation is complete.",
});

export const CONVERSATION_PHASE_BOUNDARIES = "boundaries";
export const CONVERSATION_PHASE_CONTEXT = "context";
export const CONVERSATION_PHASES = [CONVERSATION_PHASE_BOUNDARIES, CONVERSATION_PHASE_CONTEXT];
export const PHASE_ADVANCE_MESSAGE_ID = "phase_context";

export const PHASE_ADVANCE_MESSAGE = Object.freeze({
  id: PHASE_ADVANCE_MESSAGE_ID,
  role: MESSAGE_ROLE_ASSISTANT,
  content: "The document boundaries are defined. Now capturing the context needed for the final document.",
});

export const WELCOME_MESSAGE = Object.freeze({
  id: "welcome",
  role: MESSAGE_ROLE_ASSISTANT,
  content: "What would you like to work on?",
});

/**
 * True for lines written by Nexus itself (the welcome, phase-advance and
 * completion messages),
 * as opposed to replies the user pastes in from the external AI. Both have the
 * role "assistant"; Nexus's own lines are recognised by their id, so the
 * message shape stays the same.
 */
export function isNexusMessage(message) {
  return (
    message !== null &&
    typeof message === "object" &&
    message.role === MESSAGE_ROLE_ASSISTANT &&
    (message.id === WELCOME_MESSAGE.id ||
      message.id === PHASE_ADVANCE_MESSAGE_ID ||
      message.id === COMPLETION_MESSAGE_ID)
  );
}

/** True once the conversation has reached its end point. */
export function isConversationComplete(messages) {
  return (
    Array.isArray(messages) &&
    messages.some((message) => message && message.id === COMPLETION_MESSAGE_ID)
  );
}

/** The conversation status: "active" or "complete". */
export function getConversationStatus(messages) {
  return isConversationComplete(messages)
    ? CONVERSATION_STATUS_COMPLETE
    : CONVERSATION_STATUS_ACTIVE;
}

/**
 * Mark the conversation as complete by appending the completion message.
 * Returns the same array when it is already complete.
 */
export function completeConversation(messages) {
  const current = Array.isArray(messages) ? messages : [];
  if (isConversationComplete(current)) return current;
  return [...current, COMPLETION_MESSAGE];
}

/**
 * The current phase: "boundaries" (phase one) until the phase-advance message
 * is present, then "context" (phase two).
 */
export function getConversationPhase(messages) {
  const inContextPhase =
    Array.isArray(messages) &&
    messages.some((message) => message && message.id === PHASE_ADVANCE_MESSAGE_ID);
  return inContextPhase ? CONVERSATION_PHASE_CONTEXT : CONVERSATION_PHASE_BOUNDARIES;
}

/**
 * Move from phase one to phase two by appending the phase-advance message.
 * Returns the same array when already in phase two or when the conversation
 * is complete.
 */
export function advancePhase(messages) {
  const current = Array.isArray(messages) ? messages : [];
  if (isConversationComplete(current)) return current;
  if (getConversationPhase(current) === CONVERSATION_PHASE_CONTEXT) return current;
  return [...current, PHASE_ADVANCE_MESSAGE];
}

let nextMessageId = 1;

/** Create a message with a unique id. */
export function createMessage(role, content) {
  return { id: `m${nextMessageId++}`, role, content };
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** Create a new conversation containing only the welcome message. */
export function createConversation() {
  return [WELCOME_MESSAGE];
}

/** Start over. Same result as creating a new conversation. */
export function resetConversation() {
  return createConversation();
}

const NEXUS_MESSAGES_BY_ID = Object.freeze({
  [WELCOME_MESSAGE.id]: WELCOME_MESSAGE,
  [PHASE_ADVANCE_MESSAGE_ID]: PHASE_ADVANCE_MESSAGE,
  [COMPLETION_MESSAGE_ID]: COMPLETION_MESSAGE,
});

/**
 * Bring a stored conversation back.
 *
 * Every message must be an object with a unique non-empty string id, a known
 * role and non-blank string content. If the list is missing, empty or any
 * message is invalid, nothing is restored and a fresh conversation (with just
 * the welcome message) is returned. Nexus's own lines (welcome, phase-advance
 * and completion) are restored from their canonical definitions, so the phase
 * and completion state come back exactly as they were.
 *
 * The message id counter is moved past every restored "m<number>" id so
 * messages created afterwards never reuse an id.
 */
export function restoreConversation(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return createConversation();

  const seen = new Set();
  const restored = [];
  let highest = 0;

  for (const message of messages) {
    if (message === null || typeof message !== "object") return createConversation();
    if (typeof message.id !== "string" || message.id.trim() === "") return createConversation();
    if (seen.has(message.id)) return createConversation();
    if (!CONVERSATION_ROLES.includes(message.role) || !hasText(message.content)) {
      return createConversation();
    }
    seen.add(message.id);

    const nexusMessage = NEXUS_MESSAGES_BY_ID[message.id];
    if (nexusMessage && message.role === MESSAGE_ROLE_ASSISTANT) {
      restored.push(nexusMessage);
      continue;
    }

    const match = /^m(\d+)$/.exec(message.id);
    if (match) highest = Math.max(highest, Number(match[1]));
    restored.push({ id: message.id, role: message.role, content: message.content });
  }

  if (highest >= nextMessageId) nextMessageId = highest + 1;
  return restored;
}

/**
 * Append a message to the end of the conversation.
 *
 * The content is stored exactly as given. Messages with an unknown role or
 * with blank / non-string content are ignored, and the original array is
 * returned unchanged.
 */
export function appendMessage(messages, role, content) {
  const current = Array.isArray(messages) ? messages : [];
  if (isConversationComplete(current)) return current;
  if (!CONVERSATION_ROLES.includes(role) || !hasText(content)) return current;
  return [...current, createMessage(role, content)];
}

/** Append what the user typed, trimmed. Blank input is ignored. */
export function appendUserMessage(messages, text) {
  const content = typeof text === "string" ? text.trim() : "";
  return appendMessage(messages, MESSAGE_ROLE_USER, content);
}

/** Append a message written by the AI. */
export function appendAssistantMessage(messages, content) {
  return appendMessage(messages, MESSAGE_ROLE_ASSISTANT, content);
}