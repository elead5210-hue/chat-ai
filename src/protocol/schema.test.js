import { describe, it, expect, afterEach } from "vitest";
import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  COMPONENT_TYPES,
  COMPONENTS_WITH_OPTIONS,
  NEXT_ACTIONS,
  NEXT_ACTION_DESCRIPTIONS,
  MESSAGE_ROLES,
  CONTEXT_LIST_FIELDS,
  CONTEXT_OBJECT_FIELDS,
  CONTEXT_LIST_OPS,
  CONTEXT_OBJECT_OPS,
  CONTEXT_UPDATE_SHAPES,
  RESPONSE_FIELDS,
  RESPONSE_SCHEMA_EXAMPLE,
  RESPONSE_SCHEMA_RULES,
  getComponentTypes,
  getComponentTypesWithOptions,
} from "./schema.js";
import { validateResponse, validateResponseObject } from "./validateResponse.js";
import {
  listComponentDefinitions,
  listComponentTypes,
  registerComponent,
  unregisterComponent,
} from "../components/registry/componentRegistry.js";
import { SNAPSHOT_LIST_FIELDS, SNAPSHOT_OBJECT_FIELDS } from "../context/contextSnapshot.js";

const EXPECTED_FIELD_NAMES = [
  "protocol",
  "version",
  "message",
  "components",
  "context_updates",
  "state_updates",
  "next_action",
];

const rulesText = RESPONSE_SCHEMA_RULES.join("\n");

function field(name) {
  return RESPONSE_FIELDS.find((item) => item.name === name);
}

describe("RESPONSE_FIELDS", () => {
  it("covers exactly the seven protocol fields, in order", () => {
    expect(RESPONSE_FIELDS.map((item) => item.name)).toEqual(EXPECTED_FIELD_NAMES);
  });

  it("has no duplicate field names", () => {
    const names = RESPONSE_FIELDS.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("describes every field with a required flag, a type and a description", () => {
    for (const item of RESPONSE_FIELDS) {
      expect(typeof item.required).toBe("boolean");
      expect(typeof item.type).toBe("string");
      expect(item.type.trim()).not.toBe("");
      expect(typeof item.description).toBe("string");
      expect(item.description.trim()).not.toBe("");
      expect(item.example).not.toBeUndefined();
    }
  });

  it("marks every field required in v1", () => {
    expect(RESPONSE_FIELDS.every((item) => item.required === true)).toBe(true);
  });

  it("is frozen, along with each field definition", () => {
    expect(Object.isFrozen(RESPONSE_FIELDS)).toBe(true);
    for (const item of RESPONSE_FIELDS) {
      expect(Object.isFrozen(item)).toBe(true);
    }
  });

  it("uses the protocol name and version constants as the example values", () => {
    expect(field("protocol").example).toBe(PROTOCOL_NAME);
    expect(field("version").example).toBe(PROTOCOL_VERSION);
    expect(field("protocol").description).toContain(PROTOCOL_NAME);
    expect(field("version").description).toContain(PROTOCOL_VERSION);
  });

  it("lists every next_action value in the next_action field type", () => {
    for (const action of NEXT_ACTIONS) {
      expect(field("next_action").type).toContain(action);
    }
  });
});

describe("RESPONSE_SCHEMA_EXAMPLE", () => {
  it("has exactly the protocol fields", () => {
    expect(Object.keys(RESPONSE_SCHEMA_EXAMPLE)).toEqual(EXPECTED_FIELD_NAMES);
  });

  it("is built from the example value of each field", () => {
    for (const item of RESPONSE_FIELDS) {
      expect(RESPONSE_SCHEMA_EXAMPLE[item.name]).toEqual(item.example);
    }
  });

  it("is a copy, so changing it cannot change the field definitions", () => {
    const original = JSON.stringify(field("message").example);
    RESPONSE_SCHEMA_EXAMPLE.message.content = "changed";
    expect(JSON.stringify(field("message").example)).toBe(original);
    RESPONSE_SCHEMA_EXAMPLE.message.content = field("message").example.content;
  });

  it("passes validateResponseObject", () => {
    const result = validateResponseObject(RESPONSE_SCHEMA_EXAMPLE);
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("passes validateResponse as pasted JSON text", () => {
    const result = validateResponse(JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2));
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("passes validateResponse when wrapped in a code fence", () => {
    const text = "```json\n" + JSON.stringify(RESPONSE_SCHEMA_EXAMPLE, null, 2) + "\n```";
    expect(validateResponse(text).ok).toBe(true);
  });

  it("uses an allowed message role and next_action", () => {
    expect(MESSAGE_ROLES).toContain(RESPONSE_SCHEMA_EXAMPLE.message.role);
    expect(NEXT_ACTIONS).toContain(RESPONSE_SCHEMA_EXAMPLE.next_action);
  });

  it("uses registered component types with unique ids", () => {
    const types = listComponentTypes();
    const ids = RESPONSE_SCHEMA_EXAMPLE.components.map((component) => component.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const component of RESPONSE_SCHEMA_EXAMPLE.components) {
      expect(types).toContain(component.type);
    }
  });

  it("only sets state for components that it shows", () => {
    const ids = RESPONSE_SCHEMA_EXAMPLE.components.map((component) => component.id);
    for (const update of RESPONSE_SCHEMA_EXAMPLE.state_updates) {
      expect(ids).toContain(update.id);
    }
  });

  it("includes at least one component with options and one context update of each kind", () => {
    expect(
      RESPONSE_SCHEMA_EXAMPLE.components.some((component) => Array.isArray(component.options))
    ).toBe(true);
    const updates = RESPONSE_SCHEMA_EXAMPLE.context_updates;
    expect(updates.some((update) => typeof update === "string")).toBe(true);
    expect(updates.some((update) => update && update.key !== undefined)).toBe(true);
    expect(updates.some((update) => update && update.op !== undefined)).toBe(true);
  });
});

describe("NEXT_ACTIONS", () => {
  it("has a description for every action and no extra ones", () => {
    expect(Object.keys(NEXT_ACTION_DESCRIPTIONS).sort()).toEqual([...NEXT_ACTIONS].sort());
  });

  it("describes each action with a non-empty string", () => {
    for (const action of NEXT_ACTIONS) {
      expect(typeof NEXT_ACTION_DESCRIPTIONS[action]).toBe("string");
      expect(NEXT_ACTION_DESCRIPTIONS[action].trim()).not.toBe("");
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(NEXT_ACTION_DESCRIPTIONS)).toBe(true);
  });
});

describe("context update definitions", () => {
  it("lists the same list and object fields as the Context Snapshot", () => {
    expect([...CONTEXT_LIST_FIELDS]).toEqual([...SNAPSHOT_LIST_FIELDS]);
    expect([...CONTEXT_OBJECT_FIELDS]).toEqual([...SNAPSHOT_OBJECT_FIELDS]);
  });

  it("names the operations for list and object fields", () => {
    expect([...CONTEXT_LIST_OPS]).toEqual(["add", "remove"]);
    expect([...CONTEXT_OBJECT_OPS]).toEqual(["set", "remove"]);
  });

  it("is frozen", () => {
    for (const list of [
      CONTEXT_LIST_FIELDS,
      CONTEXT_OBJECT_FIELDS,
      CONTEXT_LIST_OPS,
      CONTEXT_OBJECT_OPS,
      CONTEXT_UPDATE_SHAPES,
    ]) {
      expect(Object.isFrozen(list)).toBe(true);
    }
  });

  it("gives every update shape a unique name and a format description", () => {
    const names = CONTEXT_UPDATE_SHAPES.map((shape) => shape.name);
    expect(new Set(names).size).toBe(names.length);
    for (const shape of CONTEXT_UPDATE_SHAPES) {
      expect(typeof shape.format).toBe("string");
      expect(shape.format.trim()).not.toBe("");
    }
  });

  it("mentions every context field and operation in the shape formats", () => {
    const formats = CONTEXT_UPDATE_SHAPES.map((shape) => shape.format).join("\n");
    for (const name of [...CONTEXT_LIST_FIELDS, ...CONTEXT_OBJECT_FIELDS, "summary"]) {
      expect(formats).toContain(`"${name}"`);
    }
    for (const op of [...CONTEXT_LIST_OPS, ...CONTEXT_OBJECT_OPS]) {
      expect(formats).toContain(`"${op}"`);
    }
  });

  // One sample per documented shape. The validator must accept each of them,
  // and every shape in the schema must have a sample here.
  const SAMPLES = {
    decision: "Trip will be 7 days long",
    summary: { key: "summary", value: "A summary" },
    replace_list: { key: "open_questions", value: ["One", "Two"] },
    merge_object: { key: "user_preferences", value: { seat: "aisle" } },
    list_op: { op: "add", field: "decisions", value: "Go in December" },
    object_op: { op: "set", field: "current_state", key: "step", value: 2 },
  };

  function responseWith(update) {
    return { ...RESPONSE_SCHEMA_EXAMPLE, context_updates: [update] };
  }

  it("has a sample for every documented shape", () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(
      CONTEXT_UPDATE_SHAPES.map((shape) => shape.name).sort()
    );
  });

  it("is accepted by the validator for every documented shape", () => {
    for (const shape of CONTEXT_UPDATE_SHAPES) {
      const result = validateResponseObject(responseWith(SAMPLES[shape.name]));
      expect(result.errors ?? [], shape.name).toEqual([]);
      expect(result.ok, shape.name).toBe(true);
    }
  });
});

describe("RESPONSE_SCHEMA_RULES", () => {
  it("is a list of non-empty strings", () => {
    expect(Array.isArray(RESPONSE_SCHEMA_RULES)).toBe(true);
    expect(RESPONSE_SCHEMA_RULES.length).toBeGreaterThan(0);
    for (const rule of RESPONSE_SCHEMA_RULES) {
      expect(typeof rule).toBe("string");
      expect(rule.trim()).not.toBe("");
    }
  });

  it("states the protocol name and version", () => {
    expect(rulesText).toContain(`"${PROTOCOL_NAME}"`);
    expect(rulesText).toContain(`"${PROTOCOL_VERSION}"`);
  });

  it("states the allowed message role", () => {
    for (const role of MESSAGE_ROLES) {
      expect(rulesText).toContain(`"${role}"`);
    }
  });

  it("lists every registered component type", () => {
    for (const type of listComponentTypes()) {
      expect(rulesText).toContain(type);
    }
  });

  it("names the types that need options", () => {
    expect(COMPONENTS_WITH_OPTIONS.length).toBeGreaterThan(0);
    for (const type of COMPONENTS_WITH_OPTIONS) {
      expect(rulesText).toContain(type);
    }
    expect(rulesText).toContain('"options"');
  });

  it("lists every next_action value", () => {
    for (const action of NEXT_ACTIONS) {
      expect(rulesText).toContain(action);
    }
  });

  it("describes every context update shape", () => {
    for (const shape of CONTEXT_UPDATE_SHAPES) {
      expect(rulesText).toContain(shape.format);
    }
  });

  it("names every context field", () => {
    for (const name of ["summary", ...CONTEXT_LIST_FIELDS, ...CONTEXT_OBJECT_FIELDS]) {
      expect(rulesText).toContain(`"${name}"`);
    }
  });

  it("mentions every protocol field that has to be an array or object", () => {
    for (const name of ["message", "components", "context_updates", "state_updates"]) {
      expect(rulesText).toContain(`"${name}"`);
    }
    expect(rulesText).toContain('"next_action"');
  });

  it("tells the AI not to return HTML", () => {
    expect(rulesText).toMatch(/never return html/i);
  });
});

describe("registry sync", () => {
  const added = [];

  afterEach(() => {
    while (added.length > 0) {
      unregisterComponent(added.pop());
    }
  });

  it("derives COMPONENT_TYPES from the registry", () => {
    expect(COMPONENT_TYPES).toEqual(listComponentTypes());
    expect(COMPONENT_TYPES.length).toBeGreaterThanOrEqual(12);
  });

  it("derives COMPONENTS_WITH_OPTIONS from the registry", () => {
    const expected = listComponentDefinitions()
      .filter((definition) => definition.hasOptions)
      .map((definition) => definition.type);
    expect([...COMPONENTS_WITH_OPTIONS].sort()).toEqual([...expected].sort());
  });

  it("returns the live registry from getComponentTypes", () => {
    expect(getComponentTypes()).toEqual(listComponentTypes());

    registerComponent({
      type: "schema_test_type",
      description: "Only for the schema test.",
      example: { id: "x", type: "schema_test_type", label: "X" },
    });
    added.push("schema_test_type");

    expect(getComponentTypes()).toContain("schema_test_type");
    expect(COMPONENT_TYPES).not.toContain("schema_test_type");
  });

  it("returns the live registry from getComponentTypesWithOptions", () => {
    registerComponent({
      type: "schema_test_options",
      description: "Only for the schema test.",
      hasOptions: true,
      example: { id: "x", type: "schema_test_options", label: "X", options: ["A"] },
    });
    added.push("schema_test_options");

    expect(getComponentTypesWithOptions()).toContain("schema_test_options");
  });

  it("lets the validator accept a newly registered type", () => {
    registerComponent({
      type: "schema_test_type",
      description: "Only for the schema test.",
      example: { id: "x", type: "schema_test_type", label: "X" },
    });
    added.push("schema_test_type");

    const response = {
      ...RESPONSE_SCHEMA_EXAMPLE,
      components: [{ id: "x", type: "schema_test_type", label: "X" }],
      state_updates: [],
    };
    expect(validateResponseObject(response).ok).toBe(true);
  });

  it("lets the validator reject the type again after it is unregistered", () => {
    registerComponent({
      type: "schema_test_type",
      description: "Only for the schema test.",
      example: { id: "x", type: "schema_test_type", label: "X" },
    });
    unregisterComponent("schema_test_type");

    const response = {
      ...RESPONSE_SCHEMA_EXAMPLE,
      components: [{ id: "x", type: "schema_test_type", label: "X" }],
      state_updates: [],
    };
    expect(validateResponseObject(response).ok).toBe(false);
  });
});