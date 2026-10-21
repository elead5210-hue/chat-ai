import { describe, it, expect } from "vitest";
import {
  COMPONENT_CATALOG,
  OPTION_FORMAT_NOTE,
  buildComponentCatalog,
  getCatalogEntry,
} from "./componentCatalog.js";
import { COMPONENT_TYPES, COMPONENTS_WITH_OPTIONS } from "../protocol/schema.js";
import { validateResponseObject } from "../protocol/validateResponse.js";
import { PROTOCOL_NAME, PROTOCOL_VERSION } from "../protocol/schema.js";

function wrapComponent(component) {
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

describe("COMPONENT_CATALOG", () => {
  it("has exactly one entry for every supported component type", () => {
    const types = COMPONENT_CATALOG.map((entry) => entry.type);
    expect(types.slice().sort()).toEqual(COMPONENT_TYPES.slice().sort());
    expect(new Set(types).size).toBe(types.length);
  });

  it("gives every entry a description, field lists and an example", () => {
    for (const entry of COMPONENT_CATALOG) {
      expect(typeof entry.description).toBe("string");
      expect(entry.description.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.required)).toBe(true);
      expect(Array.isArray(entry.optional)).toBe(true);
      expect(entry.example).toBeTruthy();
    }
  });

  it("uses an example whose type matches the entry type", () => {
    for (const entry of COMPONENT_CATALOG) {
      expect(entry.example.type).toBe(entry.type);
      expect(typeof entry.example.id).toBe("string");
      expect(typeof entry.example.label).toBe("string");
    }
  });

  it("marks options as required exactly for option-based components", () => {
    for (const entry of COMPONENT_CATALOG) {
      const needsOptions = COMPONENTS_WITH_OPTIONS.includes(entry.type);
      expect(entry.required.includes("options")).toBe(needsOptions);
      if (needsOptions) {
        expect(Array.isArray(entry.example.options)).toBe(true);
        expect(entry.example.options.length).toBeGreaterThan(0);
      }
    }
  });

  it("only lists required fields that the example actually contains", () => {
    for (const entry of COMPONENT_CATALOG) {
      for (const field of entry.required) {
        expect(entry.example[field], `${entry.type}.${field}`).toBeDefined();
      }
    }
  });

  it("provides examples that pass protocol validation", () => {
    for (const entry of COMPONENT_CATALOG) {
      const result = validateResponseObject(wrapComponent(entry.example));
      expect(result.errors ?? [], `example for ${entry.type}`).toEqual([]);
      expect(result.ok).toBe(true);
    }
  });
});

describe("getCatalogEntry", () => {
  it("returns the entry for a known type", () => {
    expect(getCatalogEntry("select").type).toBe("select");
  });

  it("returns null for an unknown type", () => {
    expect(getCatalogEntry("hologram")).toBeNull();
  });
});

describe("buildComponentCatalog", () => {
  it("keeps the flat available_components list", () => {
    expect(buildComponentCatalog().available_components).toEqual(COMPONENT_TYPES);
  });

  it("describes the common fields", () => {
    const { common_fields } = buildComponentCatalog();
    for (const key of ["id", "type", "label", "value"]) {
      expect(typeof common_fields[key]).toBe("string");
    }
  });

  it("includes the option format note", () => {
    const { option_format } = buildComponentCatalog();
    expect(option_format).toBe(OPTION_FORMAT_NOTE);
    for (const type of COMPONENTS_WITH_OPTIONS) {
      expect(option_format).toContain(type);
    }
  });

  it("describes every component with fields and an example", () => {
    const { components } = buildComponentCatalog();
    expect(components.map((c) => c.type)).toEqual(COMPONENT_CATALOG.map((e) => e.type));
    for (const component of components) {
      expect(component).toHaveProperty("description");
      expect(component).toHaveProperty("required_fields");
      expect(component).toHaveProperty("optional_fields");
      expect(component).toHaveProperty("example");
    }
  });

  it("produces JSON-serialisable output", () => {
    const catalog = buildComponentCatalog();
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
  });
});