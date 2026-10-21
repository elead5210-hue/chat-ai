import { describe, it, expect } from "vitest";
import {
  stripCodeFence,
  parseResponseText,
  validateResponseObject,
  validateResponse,
} from "./validateResponse.js";
import { PROTOCOL_NAME, PROTOCOL_VERSION, COMPONENT_TYPES } from "./schema.js";

function makeValid(overrides = {}) {
  return {
    protocol: PROTOCOL_NAME,
    version: PROTOCOL_VERSION,
    message: { role: "assistant", content: "When would you like to travel?" },
    components: [
      { id: "departure_date", type: "date", label: "Departure date", value: null },
    ],
    context_updates: [],
    state_updates: [],
    next_action: "await_user",
    ...overrides,
  };
}

describe("stripCodeFence", () => {
  it("returns unfenced text trimmed", () => {
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
  });

  it("removes a json code fence", () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("removes a plain code fence", () => {
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});

describe("parseResponseText", () => {
  it("rejects empty input", () => {
    const result = parseResponseText("   ");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/empty/i);
  });

  it("rejects non-string input", () => {
    expect(parseResponseText(undefined).ok).toBe(false);
  });

  it("reports malformed JSON", () => {
    const result = parseResponseText("{ not json");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/not valid JSON/i);
  });

  it("parses valid JSON", () => {
    const result = parseResponseText('{"a":1}');
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });
});

describe("validateResponseObject", () => {
  it("accepts a valid response", () => {
    const data = makeValid();
    const result = validateResponseObject(data);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(data);
  });

  it("accepts an empty components array", () => {
    expect(validateResponseObject(makeValid({ components: [] })).ok).toBe(true);
  });

  it("rejects non-object input", () => {
    for (const input of [null, [], "text", 42]) {
      const result = validateResponseObject(input);
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toMatch(/JSON object/);
    }
  });

  it("rejects the wrong protocol name and version", () => {
    const result = validateResponseObject(makeValid({ protocol: "other", version: "9.9" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/"protocol"/);
    expect(result.errors.join(" ")).toMatch(/"version"/);
  });

  it("rejects a missing message", () => {
    const result = validateResponseObject(makeValid({ message: undefined }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/"message"/);
  });

  it("rejects an invalid message role and empty content", () => {
    const result = validateResponseObject(
      makeValid({ message: { role: "user", content: "  " } })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/message\.role/);
    expect(result.errors.join(" ")).toMatch(/message\.content/);
  });

  it("rejects components that is not an array", () => {
    const result = validateResponseObject(makeValid({ components: {} }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/"components"/);
  });

  it("rejects an unsupported component type", () => {
    const result = validateResponseObject(
      makeValid({ components: [{ id: "x", type: "hologram", label: "X" }] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/not supported/);
  });

  it("accepts every supported component type with valid fields", () => {
    for (const type of COMPONENT_TYPES) {
      const component = { id: `field_${type}`, type, label: type };
      if (["select", "multiselect", "radio", "checkbox"].includes(type)) {
        component.options = ["A", "B"];
      }
      const result = validateResponseObject(makeValid({ components: [component] }));
      expect(result.errors ?? []).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });

  it("rejects a component with a missing id or label", () => {
    const result = validateResponseObject(
      makeValid({ components: [{ type: "text" }] })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/\.id/);
    expect(result.errors.join(" ")).toMatch(/\.label/);
  });

  it("rejects a non-object component", () => {
    const result = validateResponseObject(makeValid({ components: ["text"] }));
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/must be an object/);
  });

  it("rejects duplicate component ids", () => {
    const result = validateResponseObject(
      makeValid({
        components: [
          { id: "dup", type: "text", label: "One" },
          { id: "dup", type: "text", label: "Two" },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/duplicate/);
  });

  it("requires options for select-like components", () => {
    for (const type of ["select", "multiselect", "radio", "checkbox"]) {
      const missing = validateResponseObject(
        makeValid({ components: [{ id: "c", type, label: "C" }] })
      );
      expect(missing.ok).toBe(false);
      expect(missing.errors.join(" ")).toMatch(/options/);

      const empty = validateResponseObject(
        makeValid({ components: [{ id: "c", type, label: "C", options: [] }] })
      );
      expect(empty.ok).toBe(false);
    }
  });

  it("accepts string, number and labelled-object options", () => {
    const result = validateResponseObject(
      makeValid({
        components: [
          {
            id: "choice",
            type: "select",
            label: "Choice",
            options: ["A", 2, { value: "c", label: "Option C" }],
          },
        ],
      })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects malformed options", () => {
    const result = validateResponseObject(
      makeValid({
        components: [
          {
            id: "choice",
            type: "radio",
            label: "Choice",
            options: [{ value: "x" }, null, true],
          },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBe(3);
  });

  it("rejects non-numeric min, max and step on sliders and numbers", () => {
    const result = validateResponseObject(
      makeValid({
        components: [
          { id: "s", type: "slider", label: "S", min: "0", max: 10 },
          { id: "n", type: "number", label: "N", step: "1" },
        ],
      })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/\.min/);
    expect(result.errors.join(" ")).toMatch(/\.step/);
  });

  it("requires context_updates and state_updates to be arrays", () => {
    const result = validateResponseObject(
      makeValid({ context_updates: null, state_updates: {} })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/context_updates/);
    expect(result.errors.join(" ")).toMatch(/state_updates/);
  });

  it("rejects an invalid next_action", () => {
    const result = validateResponseObject(makeValid({ next_action: "explode" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/next_action/);
  });

  it("collects multiple errors in one pass", () => {
    const result = validateResponseObject({ protocol: "x" });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

function errorsFor(overrides) {
  const result = validateResponseObject(makeValid(overrides));
  return result.ok ? [] : result.errors;
}

describe("unknown top-level fields", () => {
  it("rejects a field that is not part of the protocol and names it", () => {
    const result = validateResponseObject(makeValid({ html: "<div>Hello</div>" }));
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Unknown field "html"/);
  });

  it("lists the allowed fields in the error", () => {
    const [error] = errorsFor({ extra: 1 });
    for (const name of [
      "protocol",
      "version",
      "message",
      "components",
      "context_updates",
      "state_updates",
      "next_action",
    ]) {
      expect(error).toContain(name);
    }
  });

  it("reports every unknown field separately", () => {
    const errors = errorsFor({ foo: 1, bar: 2 });
    expect(errors.filter((error) => /Unknown field/.test(error))).toHaveLength(2);
    expect(errors.join(" ")).toMatch(/"foo"/);
    expect(errors.join(" ")).toMatch(/"bar"/);
  });

  it("rejects a misspelled field name", () => {
    const errors = errorsFor({ context_update: [] });
    expect(errors.join(" ")).toMatch(/Unknown field "context_update"/);
  });

  it("accepts a response with exactly the protocol fields", () => {
    expect(validateResponseObject(makeValid()).ok).toBe(true);
  });
});

describe("context_updates items", () => {
  it("accepts every documented update shape", () => {
    const result = validateResponseObject(
      makeValid({
        context_updates: [
          "Trip will be 7 days long",
          { key: "summary", value: "User is planning a holiday." },
          { key: "decisions", value: ["Go in December"] },
          { key: "open_questions", value: ["What is the budget?"] },
          { key: "user_preferences", value: { travel_month: "December" } },
          { key: "current_state", value: { step: 2 } },
          { op: "add", field: "decisions", value: "Book flights first" },
          { op: "remove", field: "open_questions", value: "What is the budget?" },
          { op: "set", field: "user_preferences", key: "seat", value: "aisle" },
          { op: "remove", field: "current_state", key: "step" },
        ],
      })
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("still accepts legacy free-form key/value updates", () => {
    const result = validateResponseObject(
      makeValid({
        context_updates: [
          { key: "goal", value: "Plan a trip" },
          { key: "budget", value: 30000 },
          { key: "flags", value: { a: 1 } },
          { key: "cleared", value: null },
        ],
      })
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("still accepts the legacy path/value form", () => {
    const result = validateResponseObject(
      makeValid({ context_updates: [{ path: "goal", value: "Plan a trip" }] })
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an item that is neither a string nor an object", () => {
    const errors = errorsFor({ context_updates: [42, null, ["x"]] });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/context_updates\[0\] must be a string or an object/);
    expect(errors[1]).toMatch(/context_updates\[1\]/);
    expect(errors[2]).toMatch(/context_updates\[2\]/);
  });

  it("rejects an empty string update and names its index", () => {
    const errors = errorsFor({ context_updates: ["Fine", "   "] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[1\] must not be an empty string/);
  });

  it("rejects an object with no key, op or field", () => {
    const errors = errorsFor({ context_updates: [{ value: "orphan" }] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[0\]/);
    expect(errors[0]).toMatch(/"key"/);
  });

  it("rejects a key/value update with no value", () => {
    const errors = errorsFor({ context_updates: [{ key: "goal" }] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[0\]\.value is required/);
  });

  it("rejects a summary that is not a string", () => {
    const errors = errorsFor({ context_updates: [{ key: "summary", value: 5 }] });
    expect(errors[0]).toMatch(/context_updates\[0\]\.value must be a string/);
    expect(errors[0]).toMatch(/summary/);
  });

  it("rejects list fields that are not a string or an array of strings", () => {
    const errors = errorsFor({
      context_updates: [
        { key: "decisions", value: { a: 1 } },
        { key: "open_questions", value: ["ok", 3] },
      ],
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/context_updates\[0\].*"decisions"/);
    expect(errors[1]).toMatch(/context_updates\[1\].*"open_questions"/);
  });

  it("rejects object fields that are not objects", () => {
    const errors = errorsFor({
      context_updates: [
        { key: "user_preferences", value: "dark mode" },
        { key: "current_state", value: ["a"] },
      ],
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/context_updates\[0\].*"user_preferences"/);
    expect(errors[1]).toMatch(/context_updates\[1\].*"current_state"/);
  });

  it("requires op and field to be given together", () => {
    const errors = errorsFor({
      context_updates: [{ op: "add", value: "x" }, { field: "decisions", value: "y" }],
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/context_updates\[0\].*"op" and "field"/);
    expect(errors[1]).toMatch(/context_updates\[1\].*"op" and "field"/);
  });

  it("rejects an operation on an unknown field and lists the allowed ones", () => {
    const errors = errorsFor({
      context_updates: [{ op: "add", field: "secrets", value: "x" }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[0\]\.field "secrets"/);
    expect(errors[0]).toMatch(/decisions/);
    expect(errors[0]).toMatch(/current_state/);
  });

  it("rejects an unsupported op on a list field", () => {
    const errors = errorsFor({
      context_updates: [{ op: "explode", field: "decisions", value: "x" }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[0\]\.op "explode".*"decisions"/);
  });

  it("requires a non-empty string value for add and remove on lists", () => {
    const errors = errorsFor({
      context_updates: [
        { op: "add", field: "decisions", value: "" },
        { op: "remove", field: "open_questions", value: 7 },
      ],
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/context_updates\[0\]\.value.*"add".*"decisions"/);
    expect(errors[1]).toMatch(/context_updates\[1\]\.value.*"remove".*"open_questions"/);
  });

  it("requires a key for set and remove on object fields", () => {
    const errors = errorsFor({
      context_updates: [
        { op: "set", field: "user_preferences", value: "x" },
        { op: "remove", field: "current_state" },
      ],
    });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/context_updates\[0\]\.key/);
    expect(errors[1]).toMatch(/context_updates\[1\]\.key/);
  });

  it("requires a value for set on object fields", () => {
    const errors = errorsFor({
      context_updates: [{ op: "set", field: "current_state", key: "step" }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[0\]\.value is required/);
  });

  it("rejects an unsupported op on an object field", () => {
    const errors = errorsFor({
      context_updates: [{ op: "add", field: "current_state", key: "a", value: 1 }],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[0\]\.op "add".*"current_state"/);
  });

  it("only reports the bad items and keeps the good ones valid", () => {
    const errors = errorsFor({
      context_updates: [
        "A fine decision",
        { key: "summary", value: "Fine" },
        { op: "add", field: "decisions", value: "" },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/context_updates\[2\]/);
  });
});

describe("state_updates items", () => {
  it("accepts { id, value } items with any kind of value", () => {
    const result = validateResponseObject(
      makeValid({
        state_updates: [
          { id: "destination", value: "Lisbon" },
          { id: "budget", value: 500 },
          { id: "international", value: false },
          { id: "tags", value: ["a", "b"] },
          { id: "cleared", value: null },
        ],
      })
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects an item that is not an object and names its index", () => {
    const errors = errorsFor({ state_updates: [{ id: "a", value: 1 }, "b", null] });
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/state_updates\[1\] must be an object with "id" and "value"/);
    expect(errors[1]).toMatch(/state_updates\[2\]/);
  });

  it("rejects a missing, empty or non-string id", () => {
    const errors = errorsFor({
      state_updates: [{ value: 1 }, { id: "", value: 1 }, { id: 5, value: 1 }],
    });
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/state_updates\[0\]\.id must be a non-empty string/);
    expect(errors[1]).toMatch(/state_updates\[1\]\.id/);
    expect(errors[2]).toMatch(/state_updates\[2\]\.id/);
  });

  it("rejects an item with no value and says how to clear a field", () => {
    const errors = errorsFor({ state_updates: [{ id: "destination" }] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/state_updates\[0\]\.value is required/);
    expect(errors[0]).toMatch(/null/);
  });

  it("reports a bad id and a missing value on the same item separately", () => {
    const errors = errorsFor({ state_updates: [{}] });
    expect(errors).toHaveLength(2);
    expect(errors.every((error) => error.includes("state_updates[0]"))).toBe(true);
  });
});

describe("conversation_complete signal", () => {
  it("accepts a response without the field", () => {
    expect(validateResponseObject(makeValid()).ok).toBe(true);
  });

  it("accepts true and false", () => {
    expect(validateResponseObject(makeValid({ conversation_complete: true })).ok).toBe(true);
    expect(validateResponseObject(makeValid({ conversation_complete: false })).ok).toBe(true);
  });

  it("accepts a completing response with next_action complete", () => {
    const result = validateResponseObject(
      makeValid({ next_action: "complete", conversation_complete: true, components: [] })
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.each([["true"], [1], [0], [null], [{}], [[]]])(
    "rejects %s as a non-boolean value",
    (value) => {
      const errors = errorsFor({ conversation_complete: value });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/conversation_complete.*boolean/);
    }
  );

  it("does not treat the field as unknown", () => {
    const errors = errorsFor({ conversation_complete: true });
    expect(errors.join(" ")).not.toMatch(/Unknown field/);
  });

  it("accepts the field through the full pipeline", () => {
    const text = JSON.stringify(makeValid({ conversation_complete: true }));
    const result = validateResponse(text);
    expect(result.ok).toBe(true);
    expect(result.value.conversation_complete).toBe(true);
  });
});

describe("phase_complete signal", () => {
  it("accepts a response without the field", () => {
    expect(validateResponseObject(makeValid()).ok).toBe(true);
  });

  it("accepts true and false", () => {
    expect(validateResponseObject(makeValid({ phase_complete: true })).ok).toBe(true);
    expect(validateResponseObject(makeValid({ phase_complete: false })).ok).toBe(true);
  });

  it("accepts phase_complete together with conversation_complete", () => {
    const result = validateResponseObject(
      makeValid({ phase_complete: true, conversation_complete: false })
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it.each([["true"], [1], [0], [null], [{}], [[]]])(
    "rejects %s as a non-boolean value",
    (value) => {
      const errors = errorsFor({ phase_complete: value });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/phase_complete.*boolean/);
    }
  );

  it("does not treat the field as unknown", () => {
    const errors = errorsFor({ phase_complete: true });
    expect(errors.join(" ")).not.toMatch(/Unknown field/);
  });

  it("accepts the field through the full pipeline", () => {
    const text = JSON.stringify(makeValid({ phase_complete: true }));
    const result = validateResponse(text);
    expect(result.ok).toBe(true);
    expect(result.value.phase_complete).toBe(true);
  });
});

describe("update errors through the full pipeline", () => {
  it("returns field-specific errors for pasted JSON with a malformed update", () => {
    const text = JSON.stringify(
      makeValid({
        context_updates: [{ op: "add", field: "decisions", value: "" }],
        state_updates: [{ value: 1 }],
      })
    );
    const result = validateResponse(text);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/context_updates\[0\]/);
    expect(result.errors.join(" ")).toMatch(/state_updates\[0\]/);
  });

  it("accepts a fenced response with legacy and current updates mixed", () => {
    const text =
      "```json\n" +
      JSON.stringify(
        makeValid({
          context_updates: [{ key: "goal", value: "Plan a trip" }, "Trip is international"],
          state_updates: [{ id: "destination", value: "Lisbon" }],
        }),
        null,
        2
      ) +
      "\n```";
    expect(validateResponse(text).ok).toBe(true);
  });
});

describe("validateResponse (full pipeline)", () => {
  it("accepts a valid JSON string", () => {
    const result = validateResponse(JSON.stringify(makeValid()));
    expect(result.ok).toBe(true);
    expect(result.value.message.content).toBe("When would you like to travel?");
  });

  it("accepts a valid response wrapped in a code fence", () => {
    const text = "```json\n" + JSON.stringify(makeValid(), null, 2) + "\n```";
    expect(validateResponse(text).ok).toBe(true);
  });

  it("returns a parse error for malformed JSON", () => {
    const result = validateResponse("{ nope");
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/not valid JSON/i);
  });

  it("returns schema errors for valid JSON that breaks the protocol", () => {
    const result = validateResponse(JSON.stringify({ answer: "hello" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/"protocol"/);
  });

  it("returns an error for empty input", () => {
    const result = validateResponse("");
    expect(result.ok).toBe(false);
  });
});