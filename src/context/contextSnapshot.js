/**
 * Context Snapshot: what is currently important in a conversation, kept
 * separate from the raw message history and from UI state.
 *
 * Shape:
 *   {
 *     conversation_id:  string
 *     context_version:  number   (bumped on every change)
 *     summary:          string
 *     decisions:        string[]
 *     user_preferences: { [key]: any }
 *     current_state:    { [key]: any }
 *     open_questions:   string[]
 *   }
 *
 * Every helper here is pure: it returns a new snapshot (or the same one when
 * nothing changed) and never mutates its input.
 */

export const SNAPSHOT_LIST_FIELDS = ["decisions", "open_questions"];
export const SNAPSHOT_OBJECT_FIELDS = ["user_preferences", "current_state"];

let nextConversationNumber = 1;

export function generateConversationId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `conv-${Date.now().toString(36)}-${nextConversationNumber++}-${random}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const text = cleanString(item);
    if (text && !seen.has(text)) {
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}

function cleanObject(value) {
  return isPlainObject(value) ? { ...value } : {};
}

/** Create an empty snapshot. */
export function createSnapshot({ conversationId } = {}) {
  return {
    conversation_id: conversationId ?? generateConversationId(),
    context_version: 1,
    summary: "",
    decisions: [],
    user_preferences: {},
    current_state: {},
    open_questions: [],
  };
}

/**
 * Coerce any value (including partial or legacy objects) into a well-formed
 * snapshot. Unknown keys are ignored.
 */
export function normalizeSnapshot(input) {
  const base = isPlainObject(input) ? input : {};
  const version = Number.isInteger(base.context_version) && base.context_version > 0
    ? base.context_version
    : 1;

  return {
    conversation_id: cleanString(base.conversation_id) || generateConversationId(),
    context_version: version,
    summary: cleanString(base.summary),
    decisions: cleanList(base.decisions),
    user_preferences: cleanObject(base.user_preferences),
    current_state: cleanObject(base.current_state),
    open_questions: cleanList(base.open_questions),
  };
}

/** True when the snapshot holds no content besides its identity fields. */
export function isSnapshotEmpty(snapshot) {
  const s = normalizeSnapshot(snapshot);
  return (
    s.summary === "" &&
    s.decisions.length === 0 &&
    s.open_questions.length === 0 &&
    Object.keys(s.user_preferences).length === 0 &&
    Object.keys(s.current_state).length === 0
  );
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function addToList(list, text) {
  const item = cleanString(text);
  if (!item || list.includes(item)) return list;
  return [...list, item];
}

function removeFromList(list, text) {
  const item = cleanString(text);
  return list.filter((existing) => existing !== item);
}

/**
 * Apply one context update to a snapshot (without bumping the version).
 *
 * Supported update shapes:
 *   "plain string"                              -> added to decisions
 *   { key: "summary", value: "..." }            -> sets the summary
 *   { key: "decisions", value: ["a", "b"] }     -> replaces the list
 *   { key: "open_questions", value: [...] }     -> replaces the list
 *   { key: "user_preferences", value: {...} }   -> merges into the object
 *   { key: "current_state", value: {...} }      -> merges into the object
 *   { op: "add", field: "decisions", value }    -> appends to a list
 *   { op: "remove", field: "open_questions", value } -> removes from a list
 *   { op: "set", field: "current_state", key: "step", value: 2 }
 *                                               -> sets one key in an object
 *   { key: "anything_else", value: ... }        -> legacy: stored in current_state
 */
function applyOne(snapshot, update) {
  if (typeof update === "string") {
    return { ...snapshot, decisions: addToList(snapshot.decisions, update) };
  }
  if (!isPlainObject(update)) return snapshot;

  // Explicit operations on a named field.
  if (typeof update.op === "string" && typeof update.field === "string") {
    const { op, field } = update;

    if (SNAPSHOT_LIST_FIELDS.includes(field)) {
      if (op === "add") {
        return { ...snapshot, [field]: addToList(snapshot[field], update.value) };
      }
      if (op === "remove") {
        return { ...snapshot, [field]: removeFromList(snapshot[field], update.value) };
      }
      if (op === "set") {
        return { ...snapshot, [field]: cleanList(update.value) };
      }
      return snapshot;
    }

    if (SNAPSHOT_OBJECT_FIELDS.includes(field)) {
      if (op === "set" && typeof update.key === "string" && update.key) {
        return { ...snapshot, [field]: { ...snapshot[field], [update.key]: update.value } };
      }
      if (op === "remove" && typeof update.key === "string") {
        const next = { ...snapshot[field] };
        delete next[update.key];
        return { ...snapshot, [field]: next };
      }
      if (op === "merge" && isPlainObject(update.value)) {
        return { ...snapshot, [field]: { ...snapshot[field], ...update.value } };
      }
      return snapshot;
    }

    if (field === "summary" && op === "set") {
      return { ...snapshot, summary: cleanString(update.value) };
    }
    return snapshot;
  }

  // { key, value } or legacy { path, value } updates.
  const key = update.key ?? update.path;
  if (typeof key !== "string" || key === "") return snapshot;

  if (key === "summary") {
    return { ...snapshot, summary: cleanString(update.value) };
  }
  if (SNAPSHOT_LIST_FIELDS.includes(key)) {
    const items = Array.isArray(update.value) ? update.value : [update.value];
    return { ...snapshot, [key]: cleanList(items) };
  }
  if (SNAPSHOT_OBJECT_FIELDS.includes(key)) {
    if (!isPlainObject(update.value)) return snapshot;
    return { ...snapshot, [key]: { ...snapshot[key], ...update.value } };
  }

  // Legacy free-form key: keep it as part of the current state.
  return { ...snapshot, current_state: { ...snapshot.current_state, [key]: update.value } };
}

/**
 * Apply a list of context updates from an AI response. The version is bumped
 * once, and only when something actually changed.
 */
export function applyContextUpdates(snapshot, updates) {
  const current = normalizeSnapshot(snapshot);
  if (!Array.isArray(updates) || updates.length === 0) return current;

  let next = current;
  for (const update of updates) {
    next = applyOne(next, update);
  }

  const { context_version: _ignoredA, ...nextContent } = next;
  const { context_version: _ignoredB, ...currentContent } = current;
  if (sameValue(nextContent, currentContent)) return current;

  return { ...next, context_version: current.context_version + 1 };
}

/**
 * Replace parts of the snapshot directly (for example when the user edits a
 * decision by hand). Bumps the version when something changed.
 */
export function updateSnapshot(snapshot, changes) {
  const current = normalizeSnapshot(snapshot);
  if (!isPlainObject(changes)) return current;

  const merged = normalizeSnapshot({
    ...current,
    ...changes,
    conversation_id: current.conversation_id,
    context_version: current.context_version,
  });

  const { context_version: _a, ...mergedContent } = merged;
  const { context_version: _b, ...currentContent } = current;
  if (sameValue(mergedContent, currentContent)) return current;

  return { ...merged, context_version: current.context_version + 1 };
}