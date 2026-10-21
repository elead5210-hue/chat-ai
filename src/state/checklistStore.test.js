import { describe, it, expect } from "vitest";
import {
  applyChecklistUpdates,
  countSatisfied,
  createChecklist,
  createChecklistFromItems,
  getPendingItems,
  hasChecklist,
  isChecklistComplete,
  resetChecklist,
} from "./checklistStore.js";

const ITEMS = [
  { id: "audience", label: "Who the document is for" },
  { id: "scope", label: "What the document covers" },
  { id: "length", label: "How long it should be" },
];

describe("createChecklist", () => {
  it("starts empty", () => {
    expect(createChecklist()).toEqual([]);
  });

  it("returns a new array each time", () => {
    expect(createChecklist()).not.toBe(createChecklist());
  });

  it("resetChecklist gives the same result as a new checklist", () => {
    expect(resetChecklist()).toEqual(createChecklist());
  });
});

describe("createChecklistFromItems", () => {
  it("creates unsatisfied items with an id, label and satisfied flag", () => {
    expect(createChecklistFromItems(ITEMS)).toEqual([
      { id: "audience", label: "Who the document is for", satisfied: false },
      { id: "scope", label: "What the document covers", satisfied: false },
      { id: "length", label: "How long it should be", satisfied: false },
    ]);
  });

  it("keeps the order of the items", () => {
    const ids = createChecklistFromItems(ITEMS).map((item) => item.id);
    expect(ids).toEqual(["audience", "scope", "length"]);
  });

  it("trims ids and labels", () => {
    const checklist = createChecklistFromItems([{ id: "  a  ", label: "  Label  " }]);
    expect(checklist).toEqual([{ id: "a", label: "Label", satisfied: false }]);
  });

  it("honours an explicit satisfied: true", () => {
    const checklist = createChecklistFromItems([{ id: "a", label: "A", satisfied: true }]);
    expect(checklist[0].satisfied).toBe(true);
  });

  it("treats any other satisfied value as false", () => {
    const checklist = createChecklistFromItems([
      { id: "a", label: "A", satisfied: "yes" },
      { id: "b", label: "B", satisfied: 1 },
    ]);
    expect(checklist.map((item) => item.satisfied)).toEqual([false, false]);
  });

  it("ignores items without a usable id or label", () => {
    const checklist = createChecklistFromItems([
      { id: "ok", label: "Fine" },
      { label: "No id" },
      { id: "no_label" },
      { id: "", label: "Empty id" },
      { id: "empty_label", label: "   " },
      { id: 5, label: "Numeric id" },
    ]);
    expect(checklist.map((item) => item.id)).toEqual(["ok"]);
  });

  it("ignores items that are not objects", () => {
    const checklist = createChecklistFromItems([null, undefined, "text", 42, ["x"], ITEMS[0]]);
    expect(checklist.map((item) => item.id)).toEqual(["audience"]);
  });

  it("ignores an item that repeats an earlier id", () => {
    const checklist = createChecklistFromItems([
      { id: "a", label: "First" },
      { id: "a", label: "Second" },
    ]);
    expect(checklist).toEqual([{ id: "a", label: "First", satisfied: false }]);
  });

  it.each([[null], [undefined], ["x"], [42], [{}]])(
    "returns an empty checklist for %s",
    (value) => {
      expect(createChecklistFromItems(value)).toEqual([]);
    }
  );

  it("does not mutate the items it is given", () => {
    const items = [{ id: "a", label: "A" }];
    const copy = JSON.parse(JSON.stringify(items));
    createChecklistFromItems(items);
    expect(items).toEqual(copy);
  });
});

describe("hasChecklist", () => {
  it("is false for an empty checklist", () => {
    expect(hasChecklist(createChecklist())).toBe(false);
  });

  it("is true once there is at least one item", () => {
    expect(hasChecklist(createChecklistFromItems(ITEMS))).toBe(true);
  });

  it.each([[null], [undefined], ["x"], [42], [{}]])("is false for %s", (value) => {
    expect(hasChecklist(value)).toBe(false);
  });
});

describe("applyChecklistUpdates", () => {
  it("marks the named item as satisfied", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [{ id: "scope", satisfied: true }]);
    expect(next.find((item) => item.id === "scope").satisfied).toBe(true);
    expect(next.find((item) => item.id === "audience").satisfied).toBe(false);
    expect(next.find((item) => item.id === "length").satisfied).toBe(false);
  });

  it("can mark an item as unsatisfied again", () => {
    const checklist = createChecklistFromItems([{ id: "a", label: "A", satisfied: true }]);
    const next = applyChecklistUpdates(checklist, [{ id: "a", satisfied: false }]);
    expect(next[0].satisfied).toBe(false);
  });

  it("applies several updates at once", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [
      { id: "audience", satisfied: true },
      { id: "length", satisfied: true },
    ]);
    expect(next.map((item) => item.satisfied)).toEqual([true, false, true]);
  });

  it("lets a later update for the same id win", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [
      { id: "scope", satisfied: true },
      { id: "scope", satisfied: false },
    ]);
    expect(next.find((item) => item.id === "scope").satisfied).toBe(false);
  });

  it("keeps the order and labels of the items", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [{ id: "scope", satisfied: true }]);
    expect(next.map((item) => item.id)).toEqual(["audience", "scope", "length"]);
    expect(next.map((item) => item.label)).toEqual(ITEMS.map((item) => item.label));
  });

  it("ignores updates for ids that are not on the checklist", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [{ id: "unknown", satisfied: true }]);
    expect(next).toBe(checklist);
  });

  it("applies the known updates and skips the unknown ones in the same batch", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [
      { id: "unknown", satisfied: true },
      { id: "audience", satisfied: true },
    ]);
    expect(next.map((item) => item.satisfied)).toEqual([true, false, false]);
  });

  it("ignores malformed updates", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [
      null,
      "scope",
      { id: "scope" },
      { id: "scope", satisfied: "true" },
      { id: "", satisfied: true },
      { satisfied: true },
      { id: 5, satisfied: true },
    ]);
    expect(next).toBe(checklist);
  });

  it("returns the same array when nothing changes", () => {
    const checklist = createChecklistFromItems([{ id: "a", label: "A", satisfied: true }]);
    expect(applyChecklistUpdates(checklist, [{ id: "a", satisfied: true }])).toBe(checklist);
  });

  it("returns the same array for no updates", () => {
    const checklist = createChecklistFromItems(ITEMS);
    expect(applyChecklistUpdates(checklist, [])).toBe(checklist);
    expect(applyChecklistUpdates(checklist, undefined)).toBe(checklist);
    expect(applyChecklistUpdates(checklist, null)).toBe(checklist);
    expect(applyChecklistUpdates(checklist, "x")).toBe(checklist);
  });

  it("does not mutate the original checklist or its items", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const copy = JSON.parse(JSON.stringify(checklist));
    const firstItem = checklist[0];
    const next = applyChecklistUpdates(checklist, [{ id: "audience", satisfied: true }]);
    expect(next).not.toBe(checklist);
    expect(checklist).toEqual(copy);
    expect(checklist[0]).toBe(firstItem);
    expect(firstItem.satisfied).toBe(false);
  });

  it("keeps the same item objects for items that did not change", () => {
    const checklist = createChecklistFromItems(ITEMS);
    const next = applyChecklistUpdates(checklist, [{ id: "audience", satisfied: true }]);
    expect(next[1]).toBe(checklist[1]);
    expect(next[2]).toBe(checklist[2]);
  });

  it("treats a missing checklist as empty", () => {
    expect(applyChecklistUpdates(undefined, [{ id: "a", satisfied: true }])).toEqual([]);
    expect(applyChecklistUpdates(null, [{ id: "a", satisfied: true }])).toEqual([]);
  });
});

describe("countSatisfied and getPendingItems", () => {
  it("counts satisfied items", () => {
    const checklist = applyChecklistUpdates(createChecklistFromItems(ITEMS), [
      { id: "audience", satisfied: true },
      { id: "scope", satisfied: true },
    ]);
    expect(countSatisfied(checklist)).toBe(2);
  });

  it("counts zero for an empty or missing checklist", () => {
    expect(countSatisfied(createChecklist())).toBe(0);
    expect(countSatisfied(undefined)).toBe(0);
  });

  it("lists the items that are not satisfied yet", () => {
    const checklist = applyChecklistUpdates(createChecklistFromItems(ITEMS), [
      { id: "scope", satisfied: true },
    ]);
    expect(getPendingItems(checklist).map((item) => item.id)).toEqual(["audience", "length"]);
  });

  it("lists nothing pending for an empty or missing checklist", () => {
    expect(getPendingItems(createChecklist())).toEqual([]);
    expect(getPendingItems(undefined)).toEqual([]);
  });
});

describe("isChecklistComplete", () => {
  it("is false for an empty checklist", () => {
    expect(isChecklistComplete(createChecklist())).toBe(false);
  });

  it.each([[null], [undefined], ["x"], [42], [{}]])("is false for %s", (value) => {
    expect(isChecklistComplete(value)).toBe(false);
  });

  it("is false while any item is unsatisfied", () => {
    const checklist = applyChecklistUpdates(createChecklistFromItems(ITEMS), [
      { id: "audience", satisfied: true },
      { id: "scope", satisfied: true },
    ]);
    expect(isChecklistComplete(checklist)).toBe(false);
  });

  it("is true once every item is satisfied", () => {
    const checklist = applyChecklistUpdates(createChecklistFromItems(ITEMS), [
      { id: "audience", satisfied: true },
      { id: "scope", satisfied: true },
      { id: "length", satisfied: true },
    ]);
    expect(isChecklistComplete(checklist)).toBe(true);
  });

  it("becomes false again when an item is marked unsatisfied", () => {
    let checklist = applyChecklistUpdates(createChecklistFromItems(ITEMS), [
      { id: "audience", satisfied: true },
      { id: "scope", satisfied: true },
      { id: "length", satisfied: true },
    ]);
    checklist = applyChecklistUpdates(checklist, [{ id: "scope", satisfied: false }]);
    expect(isChecklistComplete(checklist)).toBe(false);
  });

  it("is true for a checklist created with every item already satisfied", () => {
    const checklist = createChecklistFromItems([
      { id: "a", label: "A", satisfied: true },
      { id: "b", label: "B", satisfied: true },
    ]);
    expect(isChecklistComplete(checklist)).toBe(true);
  });
});