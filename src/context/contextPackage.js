import { isSnapshotEmpty, normalizeSnapshot } from "./contextSnapshot.js";
import { computeContextFingerprint } from "./contextFingerprint.js";
import { RESPONSE_SCHEMA_EXAMPLE, RESPONSE_SCHEMA_RULES } from "../protocol/schema.js";

/**
 * Context Package: a compact text rendering of a Context Snapshot that can be
 * pasted into any AI so a conversation can move between AIs without copying
 * the whole transcript.
 *
 * Empty sections are omitted to keep the package short.
 */

export const EMPTY_PACKAGE_TEXT = "(No context yet.)";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatValue(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  // Single-line JSON keeps nested values compact.
  return JSON.stringify(value);
}

function formatNumberedList(items) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function formatKeyValues(object) {
  return Object.entries(object)
    .map(([key, value]) => `- ${key}: ${formatValue(value)}`)
    .join("\n");
}

function hasEntries(object) {
  return isPlainObject(object) && Object.keys(object).length > 0;
}

/**
 * Header lines identifying this exact context version. The fingerprint is
 * computed from the normalised snapshot, so any AI receiving the package can
 * see (and report back) which snapshot it holds.
 */
function formatHeader(snapshot) {
  return [
    "CONTEXT PACKAGE",
    "",
    `Conversation: ${snapshot.conversation_id}`,
    `Version: ${snapshot.context_version}`,
    `Fingerprint: ${computeContextFingerprint(snapshot)}`,
  ];
}

/**
 * Build the Context Package text for a snapshot.
 *
 * @param {object} snapshot  A Context Snapshot (partial objects are normalised).
 * @param {object} [options]
 * @param {boolean} [options.includeHeader=true]  Include the "CONTEXT PACKAGE" header
 *                                                with conversation id, version and fingerprint.
 */
export function buildContextPackage(snapshot, { includeHeader = true } = {}) {
  const s = normalizeSnapshot(snapshot);

  if (isSnapshotEmpty(s)) {
    return includeHeader
      ? [...formatHeader(s), "", EMPTY_PACKAGE_TEXT].join("\n")
      : EMPTY_PACKAGE_TEXT;
  }

  const blocks = [];

  if (includeHeader) {
    blocks.push(formatHeader(s).join("\n"));
  }

  if (s.summary) {
    blocks.push(`Summary:\n${s.summary}`);
  }
  if (s.decisions.length > 0) {
    blocks.push(`Important decisions:\n${formatNumberedList(s.decisions)}`);
  }
  if (hasEntries(s.user_preferences)) {
    blocks.push(`User preferences:\n${formatKeyValues(s.user_preferences)}`);
  }
  if (hasEntries(s.current_state)) {
    blocks.push(`Current state:\n${formatKeyValues(s.current_state)}`);
  }
  if (s.open_questions.length > 0) {
    blocks.push(`Outstanding questions:\n${formatNumberedList(s.open_questions)}`);
  }

  return blocks.join("\n\n");
}

/**
 * Wrap a Context Package in a prompt that hands an existing conversation to a
 * different AI: explains it is continuing, includes the package, and states
 * the response schema it must follow.
 *
 * @param {object} snapshot
 * @param {object} [options]
 * @param {string} [options.latestMessage]  Optional latest user message to answer.
 */
export function buildContinuationPrompt(snapshot, { latestMessage = "" } = {}) {
  const packageText = buildContextPackage(snapshot);
  const message = typeof latestMessage === "string" ? latestMessage.trim() : "";

  const lines = [
    "You are continuing an existing conversation.",
    "",
    "Here is the conversation context:",
    "",
    packageText,
    "",
    "Continue from this state.",
  ];

  if (message) {
    lines.push("", "The user's latest message:", message);
  }

  lines.push(
    "",
    "Return responses using the following schema.",
    "",
    "Rules:",
    ...RESPONSE_SCHEMA_RULES.map((rule, index) => `${index + 1}. ${rule}`),
    "",
    "Example of a valid response:",
    JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2),
    "",
    "Respond now with the JSON object only."
  );

  return lines.join("\n");
}