import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  NEXT_ACTIONS,
  MESSAGE_ROLES,
  RESPONSE_FIELDS,
  OPTIONAL_RESPONSE_FIELDS,
  CONTEXT_LIST_FIELDS,
  CONTEXT_OBJECT_FIELDS,
  getComponentTypes,
} from "./schema.js";
import { getComponentDefinition } from "../components/registry/componentRegistry.js";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Pasted text often arrives wrapped in a markdown code fence even when the
 * AI was told not to. Strip a single surrounding fence if present.
 */
export function stripCodeFence(text) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

/**
 * Parse raw pasted text into JSON.
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 */
export function parseResponseText(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return { ok: false, errors: ["The response is empty. Paste the JSON returned by the AI."] };
  }

  const cleaned = stripCodeFence(text);

  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (err) {
    return {
      ok: false,
      errors: [`The response is not valid JSON: ${err.message}`],
    };
  }
}

function validateComponent(component, index, seenIds, errors) {
  const where = `components[${index}]`;

  if (!isPlainObject(component)) {
    errors.push(`${where} must be an object.`);
    return;
  }

  if (!isNonEmptyString(component.id)) {
    errors.push(`${where}.id must be a non-empty string.`);
  } else if (seenIds.has(component.id)) {
    errors.push(`${where}.id "${component.id}" is a duplicate. Component ids must be unique.`);
  } else {
    seenIds.add(component.id);
  }

  const definition = getComponentDefinition(component.type);
  if (!definition) {
    errors.push(
      `${where}.type "${component.type}" is not supported. Allowed types: ${getComponentTypes().join(", ")}.`
    );
  }

  if (!isNonEmptyString(component.label)) {
    errors.push(`${where}.label must be a non-empty string.`);
  }

  if (definition?.hasOptions) {
    if (!Array.isArray(component.options) || component.options.length === 0) {
      errors.push(`${where}.options must be a non-empty array for type "${component.type}".`);
    } else {
      component.options.forEach((option, optionIndex) => {
        const isPrimitive = typeof option === "string" || typeof option === "number";
        const isLabelled =
          isPlainObject(option) &&
          option.value !== undefined &&
          isNonEmptyString(String(option.label ?? ""));
        if (!isPrimitive && !isLabelled) {
          errors.push(
            `${where}.options[${optionIndex}] must be a string, a number, or an object with "value" and "label".`
          );
        }
      });
    }
  }

  if (definition?.validate) {
    definition.validate(component, where, errors);
  }
}

function hasValue(update) {
  return Object.prototype.hasOwnProperty.call(update, "value");
}

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** { op, field, ... } updates: explicit operations on one snapshot field. */
function validateContextOperation(update, where, errors) {
  const { op, field } = update;

  if (!isNonEmptyString(op) || !isNonEmptyString(field)) {
    errors.push(`${where} must have both "op" and "field" as non-empty strings when either is used.`);
    return;
  }

  if (CONTEXT_LIST_FIELDS.includes(field)) {
    if (op === "add" || op === "remove") {
      if (!isNonEmptyString(update.value)) {
        errors.push(`${where}.value must be a non-empty string for op "${op}" on "${field}".`);
      }
    } else if (op === "set") {
      if (!isStringList(update.value)) {
        errors.push(`${where}.value must be an array of strings for op "set" on "${field}".`);
      }
    } else {
      errors.push(`${where}.op "${op}" is not supported on "${field}". Use: add, remove.`);
    }
    return;
  }

  if (CONTEXT_OBJECT_FIELDS.includes(field)) {
    if (op === "set" || op === "remove") {
      if (!isNonEmptyString(update.key)) {
        errors.push(`${where}.key must be a non-empty string for op "${op}" on "${field}".`);
      }
      if (op === "set" && !hasValue(update)) {
        errors.push(`${where}.value is required for op "set" on "${field}".`);
      }
    } else if (op === "merge") {
      if (!isPlainObject(update.value)) {
        errors.push(`${where}.value must be an object for op "merge" on "${field}".`);
      }
    } else {
      errors.push(`${where}.op "${op}" is not supported on "${field}". Use: set, remove.`);
    }
    return;
  }

  if (field === "summary") {
    if (op !== "set") {
      errors.push(`${where}.op "${op}" is not supported on "summary". Use: set.`);
    } else if (typeof update.value !== "string") {
      errors.push(`${where}.value must be a string for op "set" on "summary".`);
    }
    return;
  }

  const allowed = ["summary", ...CONTEXT_LIST_FIELDS, ...CONTEXT_OBJECT_FIELDS];
  errors.push(`${where}.field "${field}" is not a context field. Allowed fields: ${allowed.join(", ")}.`);
}

/** { key, value } updates (and the legacy { path, value } form). */
function validateContextKeyValue(update, where, errors) {
  const key = update.key ?? update.path;

  if (!isNonEmptyString(key)) {
    errors.push(
      `${where} must be a plain string, an object with a non-empty string "key", or an object with "op" and "field".`
    );
    return;
  }

  if (!hasValue(update)) {
    errors.push(`${where}.value is required.`);
    return;
  }

  if (key === "summary") {
    if (typeof update.value !== "string") {
      errors.push(`${where}.value must be a string when key is "summary".`);
    }
  } else if (CONTEXT_LIST_FIELDS.includes(key)) {
    if (typeof update.value !== "string" && !isStringList(update.value)) {
      errors.push(`${where}.value must be a string or an array of strings when key is "${key}".`);
    }
  } else if (CONTEXT_OBJECT_FIELDS.includes(key)) {
    if (!isPlainObject(update.value)) {
      errors.push(`${where}.value must be an object when key is "${key}".`);
    }
  }
  // Any other key is the legacy free-form form and may hold any value.
}

function validateContextUpdate(update, index, errors) {
  const where = `context_updates[${index}]`;

  if (typeof update === "string") {
    if (!isNonEmptyString(update)) {
      errors.push(`${where} must not be an empty string.`);
    }
    return;
  }

  if (!isPlainObject(update)) {
    errors.push(`${where} must be a string or an object.`);
    return;
  }

  if (update.op !== undefined || update.field !== undefined) {
    validateContextOperation(update, where, errors);
  } else {
    validateContextKeyValue(update, where, errors);
  }
}

function validateStateUpdate(update, index, errors) {
  const where = `state_updates[${index}]`;

  if (!isPlainObject(update)) {
    errors.push(`${where} must be an object with "id" and "value".`);
    return;
  }

  if (!isNonEmptyString(update.id)) {
    errors.push(`${where}.id must be a non-empty string.`);
  }
  if (!hasValue(update)) {
    errors.push(`${where}.value is required (use null to clear a field).`);
  }
}

/**
 * Validate an already-parsed object against the Nexus protocol.
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 */
export function validateResponseObject(data) {
  const errors = [];

  if (!isPlainObject(data)) {
    return { ok: false, errors: ["The response must be a JSON object."] };
  }

  const knownFields = [...RESPONSE_FIELDS, ...OPTIONAL_RESPONSE_FIELDS].map(
    (field) => field.name
  );
  for (const key of Object.keys(data)) {
    if (!knownFields.includes(key)) {
      errors.push(`Unknown field "${key}". Allowed fields: ${knownFields.join(", ")}.`);
    }
  }

  if (data.protocol !== PROTOCOL_NAME) {
    errors.push(`"protocol" must be "${PROTOCOL_NAME}".`);
  }

  if (data.version !== PROTOCOL_VERSION) {
    errors.push(`"version" must be "${PROTOCOL_VERSION}".`);
  }

  if (!isPlainObject(data.message)) {
    errors.push('"message" must be an object with "role" and "content".');
  } else {
    if (!MESSAGE_ROLES.includes(data.message.role)) {
      errors.push(`"message.role" must be one of: ${MESSAGE_ROLES.join(", ")}.`);
    }
    if (!isNonEmptyString(data.message.content)) {
      errors.push('"message.content" must be a non-empty string.');
    }
  }

  if (!Array.isArray(data.components)) {
    errors.push('"components" must be an array (use [] when no input is needed).');
  } else {
    const seenIds = new Set();
    data.components.forEach((component, index) =>
      validateComponent(component, index, seenIds, errors)
    );
  }

  if (!Array.isArray(data.context_updates)) {
    errors.push('"context_updates" must be an array (use [] when there is nothing to update).');
  } else {
    data.context_updates.forEach((update, index) => validateContextUpdate(update, index, errors));
  }

  if (!Array.isArray(data.state_updates)) {
    errors.push('"state_updates" must be an array (use [] when there is nothing to update).');
  } else {
    data.state_updates.forEach((update, index) => validateStateUpdate(update, index, errors));
  }

  if (!NEXT_ACTIONS.includes(data.next_action)) {
    errors.push(`"next_action" must be one of: ${NEXT_ACTIONS.join(", ")}.`);
  }

  if (
    data.conversation_complete !== undefined &&
    typeof data.conversation_complete !== "boolean"
  ) {
    errors.push('"conversation_complete" must be a boolean when present.');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: data };
}

/**
 * Full pipeline for pasted text: strip fence, parse, validate.
 * Returns { ok: true, value } or { ok: false, errors: string[] }.
 */
export function validateResponse(text) {
  const parsed = parseResponseText(text);
  if (!parsed.ok) return parsed;
  return validateResponseObject(parsed.value);
}