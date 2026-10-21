
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

export const WELCOME_MESSAGE = Object.freeze({
  id: "welcome",
  role: MESSAGE_ROLE_ASSISTANT,
  content: "What would you like to work on?",
});

/**
 * True for lines written by Nexus itself (currently only the welcome message),
 * as opposed to replies the user pastes in from the external AI. Both have the
 * role "assistant"; Nexus's own lines are recognised by their id, so the
 * message shape stays the same.
 */
export function isNexusMessage(message) {
  return (
    message !== null &&
    typeof message === "object" &&
    message.role === MESSAGE_ROLE_ASSISTANT &&
    (message.id === WELCOME_MESSAGE.id || message.id === COMPLETION_MESSAGE_ID)
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