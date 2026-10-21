import { describe, it, expect } from "vitest";
import {
  applyResponseToUiState,
  applyStateUpdates,
  createUiState,
  pruneStale,
  resetUiState,
  seedFromComponents,
  setValue,
} from "./uiStateStore.js";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

describe("createUiState / resetUiState", () => {
  it("creates an empty object", () => {
    expect(createUiState()).toEqual({});
  });

  it("returns a new object each time", () => {
    expect(createUiState()).not.toBe(createUiState());
  });

  it("resets to an empty object", () => {
    expect(resetUiState()).toEqual({});
    expect(resetUiState()).toEqual(createUiState());
  });

  it("does not touch the state it replaces", () => {
    const filled = { destination: "Cape Town" };
    resetUiState();
    expect(filled).toEqual({ destination: "Cape Town" });
  });

  it("holds form values only, never messages or context", () => {
    const state = setValue(setValue(createUiState(), "destination", "Cape Town"), "budget", 30000);
    expect(Object.keys(state).sort()).toEqual(["budget", "destination"]);
  });
});

describe("setValue", () => {
  it("sets a value for a new id", () => {
    expect(setValue({}, "destination", "Cape Town")).toEqual({ destination: "Cape Town" });
  });

  it("replaces an existing value", () => {
    expect(setValue({ destination: "Cape Town" }, "destination", "Lisbon")).toEqual({
      destination: "Lisbon",
    });
  });

  it("keeps the other values", () => {
    expect(setValue({ a: 1, b: 2 }, "b", 3)).toEqual({ a: 1, b: 3 });
  });

  it("stores any kind of value", () => {
    let state = {};
    state = setValue(state, "text", "hello");
    state = setValue(state, "number", 0);
    state = setValue(state, "flag", false);
    state = setValue(state, "empty", "");
    state = setValue(state, "nothing", null);
    state = setValue(state, "many", ["a", "b"]);
    expect(state).toEqual({
      text: "hello",
      number: 0,
      flag: false,
      empty: "",
      nothing: null,
      many: ["a", "b"],
    });
  });

  it("returns the same object when the value is already set", () => {
    const state = { destination: "Cape Town", flag: false };
    expect(setValue(state, "destination", "Cape Town")).toBe(state);
    expect(setValue(state, "flag", false)).toBe(state);
  });

  it("treats NaN as equal to NaN", () => {
    const state = { n: NaN };
    expect(setValue(state, "n", NaN)).toBe(state);
  });

  it("returns a new object when the value changes", () => {
    const state = { destination: "Cape Town" };
    expect(setValue(state, "destination", "Lisbon")).not.toBe(state);
  });

  it("does not mutate the original", () => {
    const state = deepFreeze({ destination: "Cape Town" });
    const next = setValue(state, "budget", 100);
    expect(state).toEqual({ destination: "Cape Town" });
    expect(next).toEqual({ destination: "Cape Town", budget: 100 });
  });

  it.each([[""], [null], [undefined], [42], [{}], ["__proto__"]])(
    "ignores the invalid id %s",
    (id) => {
      const state = { a: 1 };
      expect(setValue(state, id, "x")).toBe(state);
    }
  );

  it("treats a missing state as empty", () => {
    expect(setValue(undefined, "a", 1)).toEqual({ a: 1 });
    expect(setValue(null, "a", 1)).toEqual({ a: 1 });
    expect(setValue([1, 2], "a", 1)).toEqual({ a: 1 });
  });

  it("does not change the prototype when given __proto__", () => {
    const next = setValue({}, "__proto__", { polluted: true });
    expect(Object.getPrototypeOf(next)).toBe(Object.prototype);
    expect(next.polluted).toBeUndefined();
    expect({}.polluted).toBeUndefined();
  });
});

describe("applyStateUpdates", () => {
  it("applies each { id, value } update", () => {
    const next = applyStateUpdates({}, [
      { id: "destination", value: "Lisbon" },
      { id: "budget", value: 5000 },
    ]);
    expect(next).toEqual({ destination: "Lisbon", budget: 5000 });
  });

  it("overwrites values the user entered", () => {
    expect(applyStateUpdates({ destination: "Cape Town" }, [{ id: "destination", value: "Lisbon" }])).toEqual({
      destination: "Lisbon",
    });
  });

  it("applies the last update when an id repeats", () => {
    expect(
      applyStateUpdates({}, [
        { id: "a", value: 1 },
        { id: "a", value: 2 },
      ])
    ).toEqual({ a: 2 });
  });

  it("can set a value to null or false", () => {
    const next = applyStateUpdates({ a: 1, b: true }, [
      { id: "a", value: null },
      { id: "b", value: false },
    ]);
    expect(next).toEqual({ a: null, b: false });
  });

  it("keeps values that are not mentioned", () => {
    expect(applyStateUpdates({ a: 1, b: 2 }, [{ id: "a", value: 9 }])).toEqual({ a: 9, b: 2 });
  });

  it("skips malformed updates", () => {
    const next = applyStateUpdates({ a: 1 }, [
      null,
      undefined,
      "text",
      42,
      [],
      {},
      { value: 5 },
      { id: "", value: 5 },
      { id: 7, value: 5 },
      { id: "__proto__", value: 5 },
      { id: "ok", value: "yes" },
    ]);
    expect(next).toEqual({ a: 1, ok: "yes" });
  });

  it.each([[undefined], [null], [[]], ["updates"], [{ id: "a", value: 1 }]])(
    "returns the same object when updates is %s",
    (updates) => {
      const state = { a: 1 };
      expect(applyStateUpdates(state, updates)).toBe(state);
    }
  );

  it("returns the same object when nothing changes", () => {
    const state = { a: 1 };
    expect(applyStateUpdates(state, [{ id: "a", value: 1 }])).toBe(state);
  });

  it("does not mutate the original or the updates", () => {
    const state = deepFreeze({ a: 1 });
    const updates = deepFreeze([{ id: "a", value: 2 }, { id: "b", value: 3 }]);
    const next = applyStateUpdates(state, updates);
    expect(state).toEqual({ a: 1 });
    expect(next).toEqual({ a: 2, b: 3 });
  });

  it("treats a missing state as empty", () => {
    expect(applyStateUpdates(undefined, [{ id: "a", value: 1 }])).toEqual({ a: 1 });
  });
});

describe("seedFromComponents", () => {
  it("seeds the default value of each component", () => {
    const next = seedFromComponents({}, [
      { id: "days", type: "slider", label: "Days", value: 7 },
      { id: "style", type: "select", label: "Style", value: "Comfort" },
    ]);
    expect(next).toEqual({ days: 7, style: "Comfort" });
  });

  it("does not overwrite what the user already entered", () => {
    const next = seedFromComponents({ days: 14 }, [
      { id: "days", type: "slider", label: "Days", value: 7 },
    ]);
    expect(next).toEqual({ days: 14 });
  });

  it("does not overwrite a value the user cleared to an empty string", () => {
    const next = seedFromComponents({ name: "" }, [{ id: "name", type: "text", label: "Name", value: "Sam" }]);
    expect(next).toEqual({ name: "" });
  });

  it("does not overwrite a value the user set to null or false", () => {
    const next = seedFromComponents({ a: null, b: false }, [
      { id: "a", type: "text", label: "A", value: "x" },
      { id: "b", type: "boolean", label: "B", value: true },
    ]);
    expect(next).toEqual({ a: null, b: false });
  });

  it("seeds falsy defaults that are real values", () => {
    const next = seedFromComponents({}, [
      { id: "count", type: "number", label: "Count", value: 0 },
      { id: "flag", type: "boolean", label: "Flag", value: false },
      { id: "text", type: "text", label: "Text", value: "" },
    ]);
    expect(next).toEqual({ count: 0, flag: false, text: "" });
  });

  it("skips components without a default", () => {
    const next = seedFromComponents({}, [
      { id: "a", type: "text", label: "A" },
      { id: "b", type: "text", label: "B", value: null },
      { id: "c", type: "text", label: "C", value: undefined },
    ]);
    expect(next).toEqual({});
  });

  it("skips malformed components", () => {
    const next = seedFromComponents({}, [
      null,
      "text",
      42,
      { value: 1 },
      { id: "", value: 1 },
      { id: 9, value: 1 },
      { id: "__proto__", value: 1 },
      { id: "ok", value: "yes" },
    ]);
    expect(next).toEqual({ ok: "yes" });
  });

  it("keeps values for ids that are not in the components", () => {
    const next = seedFromComponents({ other: "kept" }, [{ id: "days", value: 7 }]);
    expect(next).toEqual({ other: "kept", days: 7 });
  });

  it.each([[undefined], [null], ["components"], [{}]])(
    "returns the same object when components is %s",
    (components) => {
      const state = { a: 1 };
      expect(seedFromComponents(state, components)).toBe(state);
    }
  );

  it("returns the same object when nothing is seeded", () => {
    const state = { days: 14 };
    expect(seedFromComponents(state, [{ id: "days", value: 7 }])).toBe(state);
    expect(seedFromComponents(state, [])).toBe(state);
  });

  it("does not mutate the original or the components", () => {
    const state = deepFreeze({ a: 1 });
    const components = deepFreeze([{ id: "b", type: "text", label: "B", value: "x" }]);
    const next = seedFromComponents(state, components);
    expect(state).toEqual({ a: 1 });
    expect(next).toEqual({ a: 1, b: "x" });
  });
});

describe("pruneStale", () => {
  const previous = [
    { id: "destination", type: "text", label: "Destination" },
    { id: "budget", type: "number", label: "Budget" },
  ];

  it("drops entries for components the next response no longer shows", () => {
    const next = pruneStale(
      { destination: "Cape Town", budget: 100 },
      previous,
      [{ id: "departure_date", type: "date", label: "Departure date" }]
    );
    expect(next).toEqual({});
  });

  it("keeps entries for components that are still shown", () => {
    const next = pruneStale(
      { destination: "Cape Town", budget: 100 },
      previous,
      [{ id: "destination", type: "text", label: "Destination" }]
    );
    expect(next).toEqual({ destination: "Cape Town" });
  });

  it("keeps values that were not tied to the previous form", () => {
    const next = pruneStale(
      { destination: "Cape Town", from_state_update: "kept" },
      previous,
      [{ id: "departure_date", type: "date", label: "Departure date" }]
    );
    expect(next).toEqual({ from_state_update: "kept" });
  });

  it("drops every previous component when the next response has none", () => {
    expect(pruneStale({ destination: "x", budget: 1 }, previous, [])).toEqual({});
    expect(pruneStale({ destination: "x", budget: 1 }, previous, undefined)).toEqual({});
    expect(pruneStale({ destination: "x", budget: 1 }, previous, null)).toEqual({});
  });

  it("does nothing when there was no previous form", () => {
    const state = { a: 1 };
    expect(pruneStale(state, [], [{ id: "x" }])).toBe(state);
    expect(pruneStale(state, undefined, [{ id: "x" }])).toBe(state);
    expect(pruneStale(state, null, [{ id: "x" }])).toBe(state);
  });

  it("returns the same object when nothing needs dropping", () => {
    const state = { destination: "Cape Town" };
    expect(pruneStale(state, previous, previous)).toBe(state);
    // "budget" was never filled in, so there is nothing to drop.
    expect(pruneStale(state, previous, [{ id: "destination" }])).toBe(state);
  });

  it("ignores malformed components in either list", () => {
    const next = pruneStale(
      { a: 1, b: 2 },
      [null, "text", { id: "" }, { id: "a" }, { id: "b" }],
      [null, 5, { id: "b" }]
    );
    expect(next).toEqual({ b: 2 });
  });

  it("does not mutate the original or the component lists", () => {
    const state = deepFreeze({ destination: "Cape Town", budget: 100 });
    const prev = deepFreeze([...previous]);
    const nextComponents = deepFreeze([{ id: "destination" }]);
    const next = pruneStale(state, prev, nextComponents);
    expect(state).toEqual({ destination: "Cape Town", budget: 100 });
    expect(next).toEqual({ destination: "Cape Town" });
  });
});

describe("applyResponseToUiState", () => {
  const previousComponents = [
    { id: "destination", type: "text", label: "Destination" },
    { id: "budget", type: "number", label: "Budget" },
  ];

  it("drops stale values, applies state_updates and seeds defaults", () => {
    const next = applyResponseToUiState(
      { destination: "Cape Town", budget: 100 },
      previousComponents,
      {
        components: [
          { id: "days", type: "slider", label: "Days", value: 7 },
          { id: "style", type: "select", label: "Style", options: ["A", "B"] },
        ],
        state_updates: [{ id: "style", value: "B" }],
      }
    );
    expect(next).toEqual({ days: 7, style: "B" });
  });

  it("keeps what the user entered for components that are still shown", () => {
    const next = applyResponseToUiState({ days: 14 }, [{ id: "days" }], {
      components: [{ id: "days", type: "slider", label: "Days", value: 7 }],
      state_updates: [],
    });
    expect(next).toEqual({ days: 14 });
  });

  it("lets a state_update override a value the user entered", () => {
    const next = applyResponseToUiState({ destination: "Cape Town" }, previousComponents, {
      components: [{ id: "destination", type: "text", label: "Destination" }],
      state_updates: [{ id: "destination", value: "Lisbon" }],
    });
    expect(next).toEqual({ destination: "Lisbon" });
  });

  it("does not let a seeded default override a state_update", () => {
    const next = applyResponseToUiState({}, [], {
      components: [{ id: "destination", type: "text", label: "Destination", value: "Paris" }],
      state_updates: [{ id: "destination", value: "Lisbon" }],
    });
    expect(next).toEqual({ destination: "Lisbon" });
  });

  it("applies a state_update even to a component that is being dropped", () => {
    const next = applyResponseToUiState({ destination: "Cape Town" }, previousComponents, {
      components: [{ id: "days", type: "slider", label: "Days" }],
      state_updates: [{ id: "destination", value: "Lisbon" }],
    });
    expect(next).toEqual({ destination: "Lisbon" });
  });

  it("works for the first response, when there is no previous form", () => {
    const next = applyResponseToUiState({}, [], {
      components: [{ id: "days", type: "slider", label: "Days", value: 7 }],
      state_updates: [],
    });
    expect(next).toEqual({ days: 7 });
  });

  it("tolerates a response without components or updates", () => {
    const state = { other: 1 };
    expect(applyResponseToUiState(state, [], {})).toBe(state);
    expect(applyResponseToUiState(state, [], undefined)).toBe(state);
  });

  it("returns the same object when the response changes nothing", () => {
    const state = { destination: "Cape Town" };
    const next = applyResponseToUiState(state, [{ id: "destination" }], {
      components: [{ id: "destination", type: "text", label: "Destination" }],
      state_updates: [],
    });
    expect(next).toBe(state);
  });

  it("does not mutate the original, the previous components or the response", () => {
    const state = deepFreeze({ destination: "Cape Town", budget: 100 });
    const prev = deepFreeze([...previousComponents]);
    const response = deepFreeze({
      components: [{ id: "days", type: "slider", label: "Days", value: 7 }],
      state_updates: [{ id: "style", value: "B" }],
    });
    const next = applyResponseToUiState(state, prev, response);
    expect(state).toEqual({ destination: "Cape Town", budget: 100 });
    expect(next).toEqual({ days: 7, style: "B" });
  });
});