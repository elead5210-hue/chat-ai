# Nexus protocol v1.0

The Nexus protocol is the contract between this application and any external AI (ChatGPT, Claude, Gemini, or anything else that can follow instructions). There is no API integration. The application generates a prompt, the user copies it to the AI, and the user pastes the AI's reply back. This document describes what that reply must look like.

If your AI returns a response that follows this specification, the application will validate it, show the message, render the requested form fields, and update its stored context.

## How the loop works

1. The application builds a prompt from the instruction, the Context Package, the conversation so far, the current form values, the available components and the response schema.
2. The user copies the prompt to the AI.
3. The AI replies with a single JSON object (the *response*).
4. The user pastes the response into the **AI response** box and submits it.
5. The application validates the whole response. If it is valid, it is applied. If not, nothing is applied and the errors are shown so the user can fix the JSON or ask the AI to correct it.

The prompt already contains the field list, the rules and an example, so an AI does not need this document. It is here for people who are wiring up a new AI, writing a test response by hand, or extending the protocol.

## The response object

A response is one JSON object with exactly these seven top-level fields. All seven are required. Use `[]` when there is nothing to send for an array field. Any other top-level field is rejected.

| Field | Type | Meaning |
|---|---|---|
| `protocol` | string | Protocol identifier. Always `"nexus"`. |
| `version` | string | Protocol version. Currently `"1.0"`. |
| `message` | object `{ role, content }` | What the assistant says to the user, shown in the conversation. |
| `components` | array of component objects | Input fields to show the user, described declaratively. `[]` when no input is needed. |
| `context_updates` | array of context update items | Changes to the Context Snapshot. `[]` when nothing changed. |
| `state_updates` | array of `{ id, value }` | Values to set in the form fields shown to the user, by component id. `[]` when nothing needs setting. |
| `next_action` | string | What the application should do next. See [next_action values](#next_action-values). |

### Formatting rules

- Return only the JSON object. No text before or after it.
- A single surrounding markdown code fence is tolerated and stripped before parsing, but the AI should not add one.
- Describe the UI declaratively. Never return HTML.

### `message`

```json
{ "role": "assistant", "content": "When would you like to travel?" }
```

- `role` must be `"assistant"`.
- `content` must be a non-empty string.

### `next_action` values

| Value | Meaning |
|---|---|
| `await_user` | Wait for the user to reply or fill in the components shown. |
| `complete` | The task is finished and no further input is needed. |
| `request_clarification` | The AI needs the user to clarify something before it can continue. |

Any other value is rejected.

## Components

Each item in `components` describes one form field. The user's input is stored by component `id` and sent back to the AI in the next prompt under `CURRENT UI STATE`.

### Common fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Non-empty string, unique within the response. Used as the key for the field's value and in `state_updates`. |
| `type` | yes | One of the supported types below. |
| `label` | yes | Non-empty string shown to the user. |
| `value` | no | Default value for the field. `null` or omitted means no default. A default never overwrites something the user has already entered. |
| `options` | for option types | Non-empty array. See [Options](#options). |

Other optional fields depend on the type, as listed below.

### Supported types

| Type | Value | Extra optional fields |
|---|---|---|
| `text` | string | `placeholder` |
| `textarea` | string | `placeholder` |
| `number` | number | `min`, `max`, `step` |
| `date` | string, `YYYY-MM-DD` | none |
| `time` | string, `HH:MM` (24-hour) | none |
| `datetime` | string, `YYYY-MM-DDTHH:MM` | none |
| `boolean` | `true` or `false` | none |
| `select` | the chosen option | requires `options` |
| `multiselect` | array of the chosen options | requires `options` |
| `radio` | the chosen option | requires `options` |
| `checkbox` | array of the ticked options | requires `options` |
| `slider` | number | `min`, `max`, `step` |

For `number` and `slider`, `min`, `max` and `step` must be numbers when given, and `min` must not be greater than `max`.

The supported types come from the component registry, so the live list in a generated prompt is authoritative. If new types are registered later, they appear in the prompt and are accepted by the validator without a change to the protocol.

### Options

Types `select`, `multiselect`, `radio` and `checkbox` require a non-empty `options` array. Each option is one of:

- a string, for example `"Comfort"`
- a number, for example `3`
- an object with a `value` and a non-empty `label`, for example `{ "value": "lux", "label": "Luxury" }`

For object options the `value` is what is stored and the `label` is what the user sees.

## Context updates

The application keeps a **Context Snapshot**: what currently matters in the conversation, separate from the message history and from form values.

```json
{
  "conversation_id": "string",
  "context_version": 1,
  "summary": "",
  "decisions": [],
  "user_preferences": {},
  "current_state": {},
  "open_questions": []
}
```

Use `context_updates` to keep it current. Updates are applied in order, as one batch.

### Accepted update shapes

| Shape | Effect |
|---|---|
| `"a plain string"` | Added to `decisions` (ignored if already present). |
| `{ "key": "summary", "value": string }` | Sets the summary. |
| `{ "key": "decisions" \| "open_questions", "value": string[] }` | Replaces the list. A single string is treated as a one-item list. |
| `{ "key": "user_preferences" \| "current_state", "value": object }` | Merges the object into the existing one. |
| `{ "op": "add" \| "remove", "field": "decisions" \| "open_questions", "value": string }` | Adds an item to, or removes an item from, a list. |
| `{ "op": "set" \| "remove", "field": "user_preferences" \| "current_state", "key": string, "value": any }` | Sets or removes one key in an object. `value` is not needed for `remove`. |

Also accepted:

- `{ "op": "set", "field": "summary", "value": string }` sets the summary.
- `{ "op": "set", "field": "decisions" \| "open_questions", "value": string[] }` replaces a list.
- `{ "op": "merge", "field": "user_preferences" \| "current_state", "value": object }` merges an object.
- Legacy form: `{ "key": "<anything else>", "value": any }` stores the value under that key in `current_state`.

Notes:

- Use `{ "op": "remove", "field": "open_questions", "value": ... }` once the user has answered a question.
- Strings are trimmed, and list items are de-duplicated.
- Fields in an `op` update must be named exactly: `summary`, `decisions`, `open_questions`, `user_preferences` or `current_state`. Any other field name is rejected.

### Versioning

Each snapshot has a `context_version` that starts at 1. It increases by one when a response changes the snapshot's content, and only then, and never more than once per response. A response with no `context_updates`, or whose updates repeat what the snapshot already holds, leaves the version unchanged.

The application also derives a fingerprint of the form `CTX-XXXXXX` from the snapshot content and version. It appears in the Context Package so that two AIs holding the same fingerprint can be known to share the same context. Typing into form fields and sending messages do not change it.

## State updates

`state_updates` sets the value of fields in the form that is shown.

```json
[{ "id": "travel_style", "value": "Comfort" }]
```

- `id` must be a non-empty string, normally the `id` of one of the components.
- `value` must be present. Use `null` to clear a field.

State updates are applied after values for components that are no longer shown are dropped, and before defaults for the new components are filled in.

## Validation and error handling

The application validates the entire response before applying any part of it.

- If the pasted text is empty or is not valid JSON, it is rejected.
- If any field is wrong, the response is rejected. Nothing is applied: no message is added, the context and its version are unchanged, form values are unchanged and the form is not re-rendered.
- Each problem is listed as its own error, naming the field and, for array items, the index. Examples:
  - `"protocol" must be "nexus".`
  - `components[1].options must be a non-empty array for type "select".`
  - `context_updates[2].value must be a non-empty string for op "add" on "decisions".`
  - `state_updates[0].value is required (use null to clear a field).`
  - `Unknown field "answer". Allowed fields: protocol, version, message, components, context_updates, state_updates, next_action.`
- The text stays in the paste box so it can be corrected and submitted again.
- A valid response replaces any earlier errors.

## Complete example

This response passes validation. It shows the message, asks for three fields, updates the context in several ways, pre-fills one field, and waits for the user.

```json
{
  "protocol": "nexus",
  "version": "1.0",
  "message": {
    "role": "assistant",
    "content": "A week in December sounds lovely. Tell me a little more about the trip."
  },
  "components": [
    {
      "id": "destination",
      "type": "text",
      "label": "Destination",
      "placeholder": "e.g. Cape Town",
      "value": null
    },
    {
      "id": "travel_style",
      "type": "select",
      "label": "Travel style",
      "options": ["Budget", "Comfort", "Luxury"],
      "value": null
    },
    {
      "id": "trip_length_days",
      "type": "slider",
      "label": "Trip length (days)",
      "min": 1,
      "max": 30,
      "step": 1,
      "value": 7
    }
  ],
  "context_updates": [
    { "key": "summary", "value": "User is planning a 7-day holiday." },
    "Trip will be 7 days long",
    { "key": "user_preferences", "value": { "travel_month": "December" } },
    { "op": "add", "field": "open_questions", "value": "What is the budget?" }
  ],
  "state_updates": [
    { "id": "travel_style", "value": "Comfort" }
  ],
  "next_action": "await_user"
}
```

## Where the protocol is defined in the code

| Concern | File |
|---|---|
| Field list, `next_action` values, update shapes, rules, example | `src/protocol/schema.js` |
| Validation and error messages | `src/protocol/validateResponse.js` |
| Component types, per-type rules and prompt catalog entries | `src/components/registry/` |
| Context Snapshot and how context updates are applied | `src/context/contextSnapshot.js` |
| Context fingerprint | `src/context/contextFingerprint.js` |
| How form values are applied from a response | `src/state/uiStateStore.js` |

`RESPONSE_FIELDS` in `src/protocol/schema.js` is the single definition of the response fields. The example in the generated prompt and the field list the AI sees are both built from it, so this document should be updated alongside it when the protocol changes.