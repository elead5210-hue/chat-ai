
/**
 * Session snapshot: the saved form of a chat session.
 *
 * A snapshot is a plain, JSON-safe object holding everything needed to bring
 * a session back after the page is closed:
 *
 *   {
 *     version:          number   snapshot format version
 *     savedAt:          number   milliseconds since the epoch
 *     messages:         [{ id, role, content }]
 *     context:          Context Snapshot
 *     uiState:          { [componentId]: value }
 *     instruction:      string | null
 *     lastResponse:     last validated AI response | null
 *     checklist:        [{ id, label, satisfied }]
 *     documentMarkdown: string
 *   }
 *
 * Both helpers are pure. createSessionSnapshot copies the data so later
 * changes to the live state cannot alter a snapshot, and restoreSessionSnapshot
 * never trusts what it reads: stored data may be corrupted, edited by hand or
 * written by an older version of the app, so anything that does not have the
 * expected shape is rejected as a whole rather than half-restored.
 */

export const SNAPSHOT_VERSION = 1;

const MESSAGE_ROLES = ["user", "assistant"];

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** Deep copy through JSON, so the result holds plain data only. */
function toPlainData(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Build a snapshot from the live session state.
 *
 * @param {object} state
 * @param {Array}  state.messages
 * @param {object} state.context
 * @param {object} [state.uiState]
 * @param {string} [state.instruction]
 * @param {object} [state.lastResponse]
 * @param {Array}  [state.checklist]
 * @param {string} [state.documentMarkdown]
 * @param {number} [now]  Time to record as savedAt. Defaults to the current time.
 */
export function createSessionSnapshot(
  {
    messages,
    context,
    uiState = {},
    instruction = null,
    lastResponse = null,
    checklist = [],
    documentMarkdown = "",
  } = {},
  now = Date.now()
) {
  return toPlainData({
    version: SNAPSHOT_VERSION,
    savedAt: now,
    messages: Array.isArray(messages) ? messages : [],
    context: isPlainObject(context) ? context : {},
    uiState: isPlainObject(uiState) ? uiState : {},
    instruction: typeof instruction === "string" ? instruction : null,
    lastResponse: isPlainObject(lastResponse) ? lastResponse : null,
    checklist: Array.isArray(checklist) ? checklist : [],
    documentMarkdown: typeof documentMarkdown === "string" ? documentMarkdown : "",
  });
}

function validateMessages(messages, errors) {
  if (!Array.isArray(messages) || messages.length === 0) {
    errors.push("messages must be a non-empty array.");
    return null;
  }

  const seen = new Set();
  const restored = [];

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const where = `messages[${index}]`;

    if (!isPlainObject(message)) {
      errors.push(`${where} must be an object.`);
      return null;
    }
    if (!isNonEmptyString(message.id)) {
      errors.push(`${where}.id must be a non-empty string.`);
      return null;
    }
    if (seen.has(message.id)) {
      errors.push(`${where}.id "${message.id}" is a duplicate.`);
      return null;
    }
    if (!MESSAGE_ROLES.includes(message.role)) {
      errors.push(`${where}.role must be one of: ${MESSAGE_ROLES.join(", ")}.`);
      return null;
    }
    if (!isNonEmptyString(message.content)) {
      errors.push(`${where}.content must be a non-empty string.`);
      return null;
    }

    seen.add(message.id);
    restored.push({ id: message.id, role: message.role, content: message.content });
  }

  return restored;
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateContext(context, errors) {
  if (!isPlainObject(context)) {
    errors.push("context must be an object.");
    return null;
  }
  if (!isNonEmptyString(context.conversation_id)) {
    errors.push("context.conversation_id must be a non-empty string.");
    return null;
  }
  if (!Number.isInteger(context.context_version) || context.context_version < 1) {
    errors.push("context.context_version must be a positive integer.");
    return null;
  }
  if (typeof context.summary !== "string") {
    errors.push("context.summary must be a string.");
    return null;
  }
  for (const field of ["decisions", "open_questions"]) {
    if (!isStringList(context[field])) {
      errors.push(`context.${field} must be an array of strings.`);
      return null;
    }
  }
  for (const field of ["user_preferences", "current_state"]) {
    if (!isPlainObject(context[field])) {
      errors.push(`context.${field} must be an object.`);
      return null;
    }
  }
  return context;
}

function validateChecklist(checklist, errors) {
  if (checklist === undefined) return [];
  if (!Array.isArray(checklist)) {
    errors.push("checklist must be an array.");
    return null;
  }

  const seen = new Set();
  const restored = [];

  for (let index = 0; index < checklist.length; index += 1) {
    const item = checklist[index];
    const where = `checklist[${index}]`;

    if (!isPlainObject(item)) {
      errors.push(`${where} must be an object.`);
      return null;
    }
    if (!isNonEmptyString(item.id) || seen.has(item.id)) {
      errors.push(`${where}.id must be a unique non-empty string.`);
      return null;
    }
    if (!isNonEmptyString(item.label)) {
      errors.push(`${where}.label must be a non-empty string.`);
      return null;
    }
    if (typeof item.satisfied !== "boolean") {
      errors.push(`${where}.satisfied must be a boolean.`);
      return null;
    }

    seen.add(item.id);
    restored.push({ id: item.id, label: item.label, satisfied: item.satisfied });
  }

  return restored;
}

/**
 * Check a stored snapshot and turn it back into session state.
 *
 * Returns { ok: true, value } where value has messages, context, uiState,
 * instruction (null when none was saved), lastResponse, checklist,
 * documentMarkdown and savedAt, or { ok: false, errors: string[] } when the
 * data is missing, malformed or from an unsupported version. Nothing is
 * restored in the failure case, so the caller can start a fresh session.
 */
export function restoreSessionSnapshot(raw) {
  const errors = [];

  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["The saved session is not an object."] };
  }

  if (raw.version !== SNAPSHOT_VERSION) {
    return {
      ok: false,
      errors: [`The saved session has an unsupported version: ${String(raw.version)}.`],
    };
  }

  const messages = validateMessages(raw.messages, errors);
  const context = messages ? validateContext(raw.context, errors) : null;
  const checklist = messages && context ? validateChecklist(raw.checklist, errors) : null;

  if (!messages || !context || !checklist) {
    return { ok: false, errors };
  }

  if (raw.uiState !== undefined && !isPlainObject(raw.uiState)) {
    return { ok: false, errors: ["uiState must be an object."] };
  }
  if (raw.instruction !== undefined && raw.instruction !== null && typeof raw.instruction !== "string") {
    return { ok: false, errors: ["instruction must be a string."] };
  }
  if (raw.lastResponse !== undefined && raw.lastResponse !== null && !isPlainObject(raw.lastResponse)) {
    return { ok: false, errors: ["lastResponse must be an object."] };
  }
  if (raw.documentMarkdown !== undefined && typeof raw.documentMarkdown !== "string") {
    return { ok: false, errors: ["documentMarkdown must be a string."] };
  }

  return {
    ok: true,
    value: toPlainData({
      messages,
      context,
      uiState: raw.uiState ?? {},
      instruction: typeof raw.instruction === "string" ? raw.instruction : null,
      lastResponse: raw.lastResponse ?? null,
      checklist,
      documentMarkdown: raw.documentMarkdown ?? "",
      savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : null,
    }),
  };
}