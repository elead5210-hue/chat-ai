
/**
 * UI state store: what the user has entered into generated forms.
 *
 * UI state is a flat object that maps a component id to its current value:
 *   { destination: "Cape Town", budget: 30000, international: true }
 *
 * It holds no conversation (what was said) and no context (what currently
 * matters); those live in their own stores. All three are combined only when
 * the prompt is generated.
 *
 * Every helper is pure: it returns a new object when something changed, the
 * same object when nothing did (so React can skip re-rendering), and never
 * mutates its input.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Assigning to "__proto__" would change the object's prototype instead of
// adding a field, so it is never accepted as a component id.
function isValidId(id) {
  return typeof id === "string" && id !== "" && id !== "__proto__";
}

function asUiState(uiState) {
  return isPlainObject(uiState) ? uiState : {};
}

/** Create an empty UI state. */
export function createUiState() {
  return {};
}

/** Clear everything the user entered. Same result as creating a new UI state. */
export function resetUiState() {
  return createUiState();
}

/**
 * Set the value of one field, for example when the user types into it.
 * An invalid id is ignored, and the same object is returned when the value is
 * already set to that exact value.
 */
export function setValue(uiState, id, value) {
  const current = asUiState(uiState);
  if (!isValidId(id)) return current;
  if (Object.prototype.hasOwnProperty.call(current, id) && Object.is(current[id], value)) {
    return current;
  }
  return { ...current, [id]: value };
}

/**
 * Apply state_updates from an AI response. Each update looks like
 * { id, value }; anything else is skipped.
 */
export function applyStateUpdates(uiState, updates) {
  const current = asUiState(uiState);
  if (!Array.isArray(updates) || updates.length === 0) return current;

  let next = current;
  for (const update of updates) {
    if (isPlainObject(update) && isValidId(update.id)) {
      next = setValue(next, update.id, update.value);
    }
  }
  return next;
}

/**
 * Seed UI state with the default values supplied by the AI's components,
 * without overwriting anything the user has already entered. A default of
 * null or undefined is not a value and is skipped.
 */
export function seedFromComponents(uiState, components) {
  const current = asUiState(uiState);
  if (!Array.isArray(components)) return current;

  let next = current;
  for (const component of components) {
    if (!isPlainObject(component) || !isValidId(component.id)) continue;
    if (component.value === undefined || component.value === null) continue;
    if (next[component.id] !== undefined) continue;
    next = setValue(next, component.id, component.value);
  }
  return next;
}

/**
 * Drop the entries for components that the previous response asked for but
 * the new response no longer shows. Values that were not tied to the previous
 * form (for example set through state_updates) are kept.
 */
export function pruneStale(uiState, previousComponents, nextComponents) {
  const current = asUiState(uiState);
  if (!Array.isArray(previousComponents) || previousComponents.length === 0) return current;

  const nextIds = new Set(
    Array.isArray(nextComponents)
      ? nextComponents.filter(isPlainObject).map((component) => component.id)
      : []
  );

  let next = current;
  for (const component of previousComponents) {
    if (!isPlainObject(component) || !isValidId(component.id)) continue;
    if (nextIds.has(component.id)) continue;
    if (!Object.prototype.hasOwnProperty.call(next, component.id)) continue;

    if (next === current) next = { ...current };
    delete next[component.id];
  }
  return next;
}

/**
 * Apply a whole validated AI response to the UI state, in this order:
 * drop values for components that are gone, apply state_updates, then seed
 * defaults for the new components.
 *
 * @param {object} uiState
 * @param {Array}  previousComponents  Components of the previous response.
 * @param {object} response            Validated response: { components, state_updates }.
 */
export function applyResponseToUiState(uiState, previousComponents, response) {
  const components = isPlainObject(response) ? response.components : undefined;
  const updates = isPlainObject(response) ? response.state_updates : undefined;

  return seedFromComponents(
    applyStateUpdates(pruneStale(uiState, previousComponents, components), updates),
    components
  );
}