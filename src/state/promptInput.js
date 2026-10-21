
/**
 * The one place where the separate stores are combined for prompt generation.
 *
 * The session keeps three distinct stores:
 *   - conversation: what was said            (messages)
 *   - context:      what currently matters   (Context Snapshot)
 *   - UI state:     what the user entered into generated forms
 *
 * They never hold each other's data. They meet only here, where each one is
 * mapped to its own field of the input that generatePrompt() and
 * generatePromptSections() take. The values are passed through as they are,
 * not copied or merged, so a store that has not changed keeps the same
 * reference and memoised results built from it stay valid.
 */

/** Which prompt input field each store feeds. */
export const PROMPT_INPUT_SOURCES = Object.freeze({
  conversation: "messages",
  context: "context",
  uiState: "uiState",
});

/**
 * Build the input for generatePrompt() / generatePromptSections().
 *
 * @param {object} stores
 * @param {string} [stores.instruction]  What the AI is being asked to do.
 * @param {Array}  [stores.messages]     Conversation store.
 * @param {object} [stores.context]      Context store (Context Snapshot).
 * @param {object} [stores.uiState]      UI state store.
 * @param {string} [stores.phase]        Current phase: "boundaries" or "context".
 * @param {Array}  [stores.checklist]    Checklist store: { id, label, satisfied } items.
 */
export function buildPromptInput({
  instruction,
  messages,
  context,
  uiState,
  phase,
  checklist,
} = {}) {
  return {
    instruction,
    messages,
    context,
    uiState,
    phase,
    checklist,
  };
}

/**
 * Build the input for generateContinuationPrompt(). A continuation hands the
 * conversation to a new AI using the context alone, so the UI state is left
 * out; the messages are only used to find the latest user message.
 *
 * @param {object} stores
 * @param {Array}  [stores.messages]  Conversation store.
 * @param {object} [stores.context]   Context store (Context Snapshot).
 */
export function buildContinuationInput({ messages, context } = {}) {
  return {
    context,
    messages,
  };
}