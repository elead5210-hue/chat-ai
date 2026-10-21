import {
  listComponentTypes,
  listComponentTypesWithOptions,
} from "../components/registry/componentRegistry.js";
// Imported for its side effect: registers the 12 core component types before
// the lists below are read from the registry.
import "../components/registry/coreComponents.js";

export const PROTOCOL_NAME = "nexus";
export const PROTOCOL_VERSION = "1.0";

/**
 * Supported component types, derived from the component registry rather than
 * hard-coded. These are snapshots taken when this module loads (after the core
 * types are registered). Code that must see types registered later should call
 * getComponentTypes() / getComponentTypesWithOptions(), which always read the
 * live registry.
 */
export const COMPONENT_TYPES = listComponentTypes();

export const COMPONENTS_WITH_OPTIONS = listComponentTypesWithOptions();

export const getComponentTypes = listComponentTypes;

export const getComponentTypesWithOptions = listComponentTypesWithOptions;

export const NEXT_ACTIONS = ["await_user", "complete", "request_clarification"];

export const MESSAGE_ROLES = ["assistant"];

/**
 * What each next_action value tells the application. Keys match NEXT_ACTIONS.
 */
export const NEXT_ACTION_DESCRIPTIONS = Object.freeze({
  await_user: "Wait for the user to reply or fill in the components shown.",
  complete:
    "The task is finished and no further input is needed. The conversation ends and no further turns are accepted.",
  request_clarification: "The AI needs the user to clarify something before it can continue.",
});

/** Context Snapshot fields that hold a list of strings. */
export const CONTEXT_LIST_FIELDS = Object.freeze(["decisions", "open_questions"]);

/** Context Snapshot fields that hold an object of key/value pairs. */
export const CONTEXT_OBJECT_FIELDS = Object.freeze(["user_preferences", "current_state"]);

/** Operations allowed on list fields: {"op", "field", "value"}. */
export const CONTEXT_LIST_OPS = Object.freeze(["add", "remove"]);

/** Operations allowed on object fields: {"op", "field", "key", "value"}. */
export const CONTEXT_OBJECT_OPS = Object.freeze(["set", "remove"]);

/**
 * The shapes a single item in "context_updates" may take. The `format` text is
 * what the external AI is told; the context-updates rule below is built from it.
 */
export const CONTEXT_UPDATE_SHAPES = Object.freeze([
  Object.freeze({
    name: "decision",
    format: "a plain string (added to decisions)",
  }),
  Object.freeze({
    name: "summary",
    format: '{"key": "summary", "value": string}',
  }),
  Object.freeze({
    name: "replace_list",
    format: '{"key": "decisions" or "open_questions", "value": string[]} which replaces the list',
  }),
  Object.freeze({
    name: "merge_object",
    format: '{"key": "user_preferences" or "current_state", "value": object} which merges into it',
  }),
  Object.freeze({
    name: "list_op",
    format: '{"op": "add" or "remove", "field": "decisions" or "open_questions", "value": string}',
  }),
  Object.freeze({
    name: "object_op",
    format:
      '{"op": "set" or "remove", "field": "user_preferences" or "current_state", "key": string, "value": any}',
  }),
]);

function defineField(definition) {
  return Object.freeze(definition);
}

/**
 * The formal definition of the Nexus response, one entry per top-level field.
 * This is the single place the protocol is described: the example response is
 * built from the `example` values below, and the generated prompt and the
 * validator read the same field names.
 *
 *   name         the JSON key
 *   required     every field is required in v1; use [] for "nothing to send"
 *   type         short description of the value's JSON type
 *   description  what the field means to the application
 *   example      the value used in the example response
 */
export const RESPONSE_FIELDS = Object.freeze([
  defineField({
    name: "protocol",
    required: true,
    type: "string",
    description: `Protocol identifier. Always "${PROTOCOL_NAME}".`,
    example: PROTOCOL_NAME,
  }),
  defineField({
    name: "version",
    required: true,
    type: "string",
    description: `Protocol version. Currently "${PROTOCOL_VERSION}".`,
    example: PROTOCOL_VERSION,
  }),
  defineField({
    name: "message",
    required: true,
    type: "object { role, content }",
    description: "What the assistant says to the user, shown in the conversation.",
    example: {
      role: "assistant",
      content: "When would you like to travel?",
    },
  }),
  defineField({
    name: "components",
    required: true,
    type: "array of component objects",
    description:
      "Input fields to show the user, described declaratively. Use [] when no input is needed.",
    example: [
      {
        id: "departure_date",
        type: "date",
        label: "Departure date",
        value: null,
      },
      {
        id: "travel_style",
        type: "select",
        label: "Travel style",
        options: ["Budget", "Comfort", "Luxury"],
        value: null,
      },
    ],
  }),
  defineField({
    name: "context_updates",
    required: true,
    type: "array of context update items",
    description:
      "Changes to the Context Snapshot (summary, decisions, preferences, state, open questions). Use [] when nothing changed.",
    example: [
      { key: "summary", value: "User is planning a 7-day holiday." },
      "Trip will be 7 days long",
      { key: "user_preferences", value: { travel_month: "December" } },
      { op: "add", field: "open_questions", value: "What is the budget?" },
    ],
  }),
  defineField({
    name: "state_updates",
    required: true,
    type: "array of { id, value }",
    description:
      "Values to set in the form fields shown to the user, by component id. Use [] when nothing needs setting.",
    example: [{ id: "travel_style", value: "Comfort" }],
  }),
  defineField({
    name: "next_action",
    required: true,
    type: `string (${NEXT_ACTIONS.join(" | ")})`,
    description: "What the application should do next.",
    example: "await_user",
  }),
]);

/**
 * Optional top-level fields. These are not part of RESPONSE_FIELDS (which are
 * all required in v1) and are therefore left out of the example response.
 *
 *   conversation_complete  set to true to signal that the conversation has
 *                          reached its end point and must terminate.
 *   phase_complete         set to true to signal that phase one (defining the
 *                          boundaries of the document) is finished and the
 *                          conversation should move to phase two (capturing
 *                          the context for the final document).
 *   checklist              the checklist of items that must be settled before
 *                          the final document. Sent together with
 *                          phase_complete when phase one finishes.
 *   checklist_updates      which checklist items the user's latest response
 *                          now satisfies. Sent during phase two.
 */
export const OPTIONAL_RESPONSE_FIELDS = Object.freeze([
  defineField({
    name: "conversation_complete",
    required: false,
    type: "boolean",
    description:
      "Set to true when the conversation has reached its end point. The application then stops accepting further turns. Omit or use false otherwise.",
    example: false,
  }),
  defineField({
    name: "phase_complete",
    required: false,
    type: "boolean",
    description:
      "Set to true when phase one (defining the boundaries of the document) is finished. The application then moves to phase two (capturing the context needed for the final document). Omit or use false otherwise.",
    example: false,
  }),
  defineField({
    name: "checklist",
    required: false,
    type: "array of { id, label }",
    description:
      "The checklist of items that must be settled before the final document can be written. Send it once, together with phase_complete, when phase one finishes. Each item has a unique string id and a short label. Omit otherwise.",
    example: [
      { id: "audience", label: "Who the document is for" },
      { id: "scope", label: "What the document must cover" },
    ],
  }),
  defineField({
    name: "checklist_updates",
    required: false,
    type: "array of { id, satisfied }",
    description:
      "Checklist items that the user's latest response satisfies, by item id. Use satisfied true when the item is settled. The conversation completes automatically once every item is satisfied. Omit when nothing changed.",
    example: [{ id: "audience", satisfied: true }],
  }),
]);

/**
 * Example of a valid response. Built from RESPONSE_FIELDS so it cannot drift
 * from the field definitions, and embedded in the generated prompt so the
 * external AI knows exactly what to return.
 */
export const RESPONSE_SCHEMA_EXAMPLE = JSON.parse(
  JSON.stringify(
    Object.fromEntries(RESPONSE_FIELDS.map((field) => [field.name, field.example]))
  )
);

export const RESPONSE_SCHEMA_RULES = [
  "Return ONLY a single valid JSON object. No text before or after it and no code fence.",
  `"protocol" must be "${PROTOCOL_NAME}" and "version" must be "${PROTOCOL_VERSION}".`,
  '"message" must be an object with "role" set to "assistant" and a non-empty string "content".',
  `Each item in "components" must have a unique string "id", a "type" (one of: ${COMPONENT_TYPES.join(", ")}) and a string "label".`,
  `Components of type ${COMPONENTS_WITH_OPTIONS.join(", ")} must include a non-empty "options" array.`,
  '"context_updates" and "state_updates" must be arrays (use [] when there is nothing to update).',
  'The context is a snapshot with these parts: "summary" (string), "decisions" (list of strings), "user_preferences" (object), "current_state" (object) and "open_questions" (list of strings). Use "context_updates" to keep it current.',
  `Each item in "context_updates" is one of: ${CONTEXT_UPDATE_SHAPES.slice(0, -1)
    .map((shape) => shape.format)
    .join("; ")}; or ${CONTEXT_UPDATE_SHAPES[CONTEXT_UPDATE_SHAPES.length - 1].format}.`,
  'Remove an open question with {"op": "remove", "field": "open_questions", "value": string} once the user has answered it.',
  'Each item in "state_updates" is an object {"id": string, "value": any} that sets the value of the component with that id.',
  `"next_action" must be one of: ${NEXT_ACTIONS.join(", ")}.`,
  'When the task is finished and nothing further is needed, set "next_action" to "complete" and add "conversation_complete": true. Do not ask further questions after that. "conversation_complete" is optional and must be a boolean when present.',
  'The conversation has two phases. Phase one defines the boundaries of the document (its purpose, audience, scope and what is out of scope). When those are settled, add "phase_complete": true to move to phase two, which captures the context needed to write the final document. "phase_complete" is optional and must be a boolean when present. Do not set "conversation_complete" during phase one.',
  'When you set "phase_complete" to true, also send "checklist": an array of {"id": string, "label": string} items, each with a unique id, listing everything that must still be settled before the final document can be written. "checklist" is optional and is only used once, when phase one finishes.',
  'In phase two, after each user response, send "checklist_updates": an array of {"id": string, "satisfied": boolean} for every checklist item that the response now satisfies. Use only ids from the checklist. "checklist_updates" is optional. The conversation completes automatically once every item is satisfied.',
  "Describe the UI declaratively. Never return HTML.",
];