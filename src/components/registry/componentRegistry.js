/**
 * Component registry: the single place where each UI component type is
 * defined. A definition describes everything the app needs to know about a
 * type, so adding a new type means registering one object:
 *
 *   {
 *     type:         string, unique protocol name used in a component's "type"
 *     field:        React component that renders the type (optional for
 *                   definitions that are protocol-only, e.g. in tests)
 *     description:  what the component is for and what value it produces
 *     required:     extra required fields besides id, type, label
 *     optional:     optional fields the AI may include
 *     example:      a valid component object
 *     hasOptions:   true when the type takes an "options" array
 *     validate:     (component, where, errors) => void, optional per-type
 *                   validation hook that pushes error strings onto `errors`
 *   }
 *
 * This module has no dependencies so that the protocol, prompt and renderer
 * layers can all import it without creating cycles.
 */

const definitions = new Map();

function assertValidDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new Error("Component definition must be an object.");
  }
  if (typeof definition.type !== "string" || definition.type.trim() === "") {
    throw new Error("Component definition needs a non-empty string 'type'.");
  }
  if (definition.validate !== undefined && typeof definition.validate !== "function") {
    throw new Error(`Component '${definition.type}': 'validate' must be a function.`);
  }
}

function normalizeDefinition(definition) {
  return {
    type: definition.type,
    field: definition.field ?? null,
    description: definition.description ?? "",
    required: Array.isArray(definition.required) ? [...definition.required] : [],
    optional: Array.isArray(definition.optional) ? [...definition.optional] : [],
    example: definition.example ?? null,
    hasOptions: definition.hasOptions === true,
    validate: definition.validate ?? null,
  };
}

/**
 * Register a component definition. Throws when the type is already registered
 * so two modules can never silently overwrite each other.
 */
export function registerComponent(definition) {
  assertValidDefinition(definition);
  if (definitions.has(definition.type)) {
    throw new Error(`Component type '${definition.type}' is already registered.`);
  }
  const normalized = normalizeDefinition(definition);
  definitions.set(normalized.type, normalized);
  return normalized;
}

/**
 * Remove a registered type. Mainly useful for tests that register temporary
 * types. Returns true when something was removed.
 */
export function unregisterComponent(type) {
  return definitions.delete(type);
}

export function hasComponent(type) {
  return definitions.has(type);
}

/** Return the definition for a type, or null when it is not registered. */
export function getComponentDefinition(type) {
  return definitions.get(type) ?? null;
}

/** All definitions, in registration order. */
export function listComponentDefinitions() {
  return Array.from(definitions.values());
}

/** Type names, in registration order. */
export function listComponentTypes() {
  return Array.from(definitions.keys());
}

/** Type names whose definitions take an "options" array. */
export function listComponentTypesWithOptions() {
  return listComponentDefinitions()
    .filter((definition) => definition.hasOptions)
    .map((definition) => definition.type);
}

/** The React field component for a type, or null. */
export function getFieldComponent(type) {
  return definitions.get(type)?.field ?? null;
}