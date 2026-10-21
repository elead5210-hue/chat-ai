import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import {
  registerComponent,
  unregisterComponent,
  hasComponent,
  getComponentDefinition,
  getFieldComponent,
  listComponentDefinitions,
  listComponentTypes,
  listComponentTypesWithOptions,
} from "./componentRegistry.js";
import { CORE_COMPONENT_DEFINITIONS, registerCoreComponents } from "./coreComponents.js";
import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  getComponentTypes,
  getComponentTypesWithOptions,
} from "../../protocol/schema.js";
import { validateResponseObject } from "../../protocol/validateResponse.js";
import {
  buildComponentCatalog,
  getCatalogEntry,
  getComponentCatalog,
} from "../../prompt/componentCatalog.js";
import ComponentRenderer from "../renderer/ComponentRenderer.jsx";

const CORE_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "datetime",
  "boolean",
  "select",
  "multiselect",
  "radio",
  "checkbox",
  "slider",
];

const OPTION_TYPES = ["select", "multiselect", "radio", "checkbox"];

// Types registered by individual tests, removed again after each test so
// tests cannot affect each other.
const TEMP_TYPES = ["rating", "tags", "bad"];

afterEach(() => {
  cleanup();
  for (const type of TEMP_TYPES) unregisterComponent(type);
});

function wrap(component) {
  return {
    protocol: PROTOCOL_NAME,
    version: PROTOCOL_VERSION,
    message: { role: "assistant", content: "Test" },
    components: [component],
    context_updates: [],
    state_updates: [],
    next_action: "await_user",
  };
}

function RatingField({ component, value, onChange }) {
  return React.createElement(
    "button",
    { type: "button", onClick: () => onChange((value ?? 0) + 1) },
    `${component.label}: ${value ?? 0}`
  );
}

function registerRating(overrides = {}) {
  return registerComponent({
    type: "rating",
    field: RatingField,
    description: "A star rating. The value is a number.",
    optional: ["max", "value"],
    example: { id: "stars", type: "rating", label: "Stars", max: 5, value: null },
    validate(component, where, errors) {
      if (component.max !== undefined && typeof component.max !== "number") {
        errors.push(`${where}.max must be a number when provided.`);
      }
    },
    ...overrides,
  });
}

describe("core component registration", () => {
  it("registers all 12 core types in order", () => {
    expect(listComponentTypes()).toEqual(CORE_TYPES);
    expect(CORE_COMPONENT_DEFINITIONS.map((d) => d.type)).toEqual(CORE_TYPES);
  });

  it("marks exactly the option-based types as having options", () => {
    expect(listComponentTypesWithOptions()).toEqual(OPTION_TYPES);
  });

  it("gives every core type a field component, description and example", () => {
    for (const type of CORE_TYPES) {
      const definition = getComponentDefinition(type);
      expect(definition, type).not.toBeNull();
      expect(typeof getFieldComponent(type), type).toBe("function");
      expect(definition.description.length, type).toBeGreaterThan(0);
      expect(definition.example.type, type).toBe(type);
    }
  });

  it("requires options in the catalog for option-based types only", () => {
    for (const definition of listComponentDefinitions()) {
      expect(definition.required.includes("options"), definition.type).toBe(
        OPTION_TYPES.includes(definition.type)
      );
    }
  });

  it("can be called again without throwing or duplicating types", () => {
    expect(() => registerCoreComponents()).not.toThrow();
    expect(listComponentTypes()).toEqual(CORE_TYPES);
  });
});

describe("registry lookups", () => {
  it("returns null or false for unknown types", () => {
    expect(hasComponent("hologram")).toBe(false);
    expect(getComponentDefinition("hologram")).toBeNull();
    expect(getFieldComponent("hologram")).toBeNull();
  });
});

describe("duplicate and invalid registrations", () => {
  it("rejects registering a type that already exists", () => {
    expect(() => registerComponent({ type: "text" })).toThrow(/already registered/);
    expect(listComponentTypes()).toEqual(CORE_TYPES);
  });

  it("rejects a new type registered twice", () => {
    registerRating();
    expect(() => registerRating()).toThrow(/already registered/);
  });

  it("rejects definitions without a usable type", () => {
    expect(() => registerComponent(null)).toThrow();
    expect(() => registerComponent({})).toThrow(/type/);
    expect(() => registerComponent({ type: "  " })).toThrow(/type/);
  });

  it("rejects a validate hook that is not a function", () => {
    expect(() => registerComponent({ type: "bad", validate: "nope" })).toThrow(/validate/);
    expect(hasComponent("bad")).toBe(false);
  });

  it("reports whether unregistering removed anything", () => {
    registerRating();
    expect(unregisterComponent("rating")).toBe(true);
    expect(unregisterComponent("rating")).toBe(false);
  });
});

describe("registering a new type", () => {
  it("normalises missing fields to safe defaults", () => {
    const definition = registerComponent({ type: "tags" });
    expect(definition).toMatchObject({
      type: "tags",
      field: null,
      description: "",
      required: [],
      optional: [],
      example: null,
      hasOptions: false,
      validate: null,
    });
  });

  it("appears in the live protocol type lists", () => {
    registerRating();
    expect(getComponentTypes()).toEqual([...CORE_TYPES, "rating"]);
    expect(getComponentTypesWithOptions()).toEqual(OPTION_TYPES);
  });

  it("appears in the prompt catalog", () => {
    registerRating();

    expect(getComponentCatalog().map((entry) => entry.type)).toContain("rating");
    expect(getCatalogEntry("rating")).toMatchObject({
      type: "rating",
      description: "A star rating. The value is a number.",
      optional: ["max", "value"],
    });

    const catalog = buildComponentCatalog();
    expect(catalog.available_components).toContain("rating");
    const entry = catalog.components.find((component) => component.type === "rating");
    expect(entry.example.type).toBe("rating");
    expect(entry.optional_fields).toEqual(["max", "value"]);
  });

  it("is accepted by response validation", () => {
    registerRating();
    const result = validateResponseObject(
      wrap({ id: "stars", type: "rating", label: "Stars", max: 5 })
    );
    expect(result.errors ?? []).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("runs its own validation hook", () => {
    registerRating();
    const result = validateResponseObject(
      wrap({ id: "stars", type: "rating", label: "Stars", max: "five" })
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/components\[0\]\.max must be a number/);
  });

  it("lists the new type in the unsupported-type message once registered", () => {
    registerRating();
    const result = validateResponseObject(wrap({ id: "x", type: "hologram", label: "X" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Allowed types:.*rating/);
  });

  it("requires options when the new type declares hasOptions", () => {
    registerComponent({
      type: "tags",
      hasOptions: true,
      required: ["options"],
      example: { id: "t", type: "tags", label: "Tags", options: ["a"] },
    });

    expect(getComponentTypesWithOptions()).toContain("tags");
    expect(buildComponentCatalog().option_format).toMatch(/tags/);

    const missing = validateResponseObject(wrap({ id: "t", type: "tags", label: "Tags" }));
    expect(missing.ok).toBe(false);
    expect(missing.errors.join(" ")).toMatch(/options must be a non-empty array/);

    const valid = validateResponseObject(
      wrap({ id: "t", type: "tags", label: "Tags", options: ["a", "b"] })
    );
    expect(valid.ok).toBe(true);
  });

  it("is rendered by ComponentRenderer using its registered field component", () => {
    registerRating();
    const onChange = vi.fn();

    render(
      React.createElement(ComponentRenderer, {
        component: { id: "stars", type: "rating", label: "Stars" },
        value: 2,
        onChange,
      })
    );

    const button = screen.getByRole("button", { name: "Stars: 2" });
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith("stars", 3);
  });

  it("shows the unsupported notice for a registered type with no field component", () => {
    registerComponent({ type: "tags" });
    render(
      React.createElement(ComponentRenderer, {
        component: { id: "t", type: "tags", label: "Tags" },
        value: undefined,
        onChange: () => {},
      })
    );
    expect(screen.getByRole("note").textContent).toMatch(/Unsupported component type "tags"/);
  });
});

describe("unregistering a type", () => {
  it("removes it from validation, catalog and renderer", () => {
    registerRating();
    unregisterComponent("rating");

    expect(getComponentTypes()).toEqual(CORE_TYPES);
    expect(getCatalogEntry("rating")).toBeNull();
    expect(buildComponentCatalog().available_components).not.toContain("rating");

    const result = validateResponseObject(wrap({ id: "stars", type: "rating", label: "Stars" }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/not supported/);

    render(
      React.createElement(ComponentRenderer, {
        component: { id: "stars", type: "rating", label: "Stars" },
        value: undefined,
        onChange: () => {},
      })
    );
    expect(screen.getByRole("note")).toBeTruthy();
  });
});