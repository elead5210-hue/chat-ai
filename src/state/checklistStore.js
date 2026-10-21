
/**
 * Checklist store: what still has to be settled before the final document.
 *
 * Once phase one (the document boundaries) is complete, the AI defines a
 * checklist of items. Each time the user responds, the AI reports which items
 * that response satisfies. When every item is satisfied, the conversation is
 * ready for the final document-generation step.
 *
 * Item shape:
 *   { id: string, label: string, satisfied: boolean }
 *
 * The checklist is an array of items. An empty array means "no checklist yet".
 *
 * Every helper is pure: it returns a new array (or the same one when nothing
 * changed) and never mutates its input.
 */

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

/** Create an empty checklist. */
export function createChecklist() {
  return [];
}

/** Start over. Same result as creating a new checklist. */
export function resetChecklist() {
  return createChecklist();
}

/**
 * Create a checklist from the items the AI defined.
 *
 * Each item needs a non-empty string id and label. Items without them, and
 * items that repeat an earlier id, are ignored. Every item starts unsatisfied
 * unless it explicitly says `satisfied: true`.
 */
export function createChecklistFromItems(items) {
  if (!Array.isArray(items)) return createChecklist();

  const seen = new Set();
  const checklist = [];

  for (const item of items) {
    if (!isPlainObject(item)) continue;
    if (!isNonEmptyString(item.id) || !isNonEmptyString(item.label)) continue;

    const id = item.id.trim();
    if (seen.has(id)) continue;
    seen.add(id);

    checklist.push({
      id,
      label: item.label.trim(),
      satisfied: item.satisfied === true,
    });
  }

  return checklist;
}

/** True when the checklist has at least one item. */
export function hasChecklist(checklist) {
  return Array.isArray(checklist) && checklist.length > 0;
}

/**
 * Apply the AI's checklist updates.
 *
 * Each update is { id: string, satisfied: boolean }. Updates for ids that are
 * not on the checklist, and malformed updates, are ignored. Returns the same
 * array when nothing changed.
 */
export function applyChecklistUpdates(checklist, updates) {
  const current = Array.isArray(checklist) ? checklist : [];
  if (current.length === 0 || !Array.isArray(updates) || updates.length === 0) {
    return current;
  }

  // Later updates for the same id win.
  const wanted = new Map();
  for (const update of updates) {
    if (!isPlainObject(update)) continue;
    if (!isNonEmptyString(update.id) || typeof update.satisfied !== "boolean") continue;
    wanted.set(update.id.trim(), update.satisfied);
  }
  if (wanted.size === 0) return current;

  let changed = false;
  const next = current.map((item) => {
    if (!wanted.has(item.id)) return item;
    const satisfied = wanted.get(item.id);
    if (item.satisfied === satisfied) return item;
    changed = true;
    return { ...item, satisfied };
  });

  return changed ? next : current;
}

/** Number of satisfied items. */
export function countSatisfied(checklist) {
  return Array.isArray(checklist)
    ? checklist.filter((item) => item && item.satisfied === true).length
    : 0;
}

/** The items that are not satisfied yet. */
export function getPendingItems(checklist) {
  return Array.isArray(checklist)
    ? checklist.filter((item) => item && item.satisfied !== true)
    : [];
}

/**
 * True when the checklist has items and every one of them is satisfied.
 * An empty checklist is never complete, so a conversation cannot finish
 * before the AI has defined what needs to be settled.
 */
export function isChecklistComplete(checklist) {
  return hasChecklist(checklist) && getPendingItems(checklist).length === 0;
}