import { getComponentTypes, getComponentTypesWithOptions } from "../protocol/schema.js";
import {
  getComponentDefinition,
  listComponentDefinitions,
} from "../components/registry/componentRegistry.js";

/**
 * Describes every UI component the application can render, so the generated
 * prompt can tell the external AI exactly what it may ask for.
 *
 * Each entry has:
 *   type        - the value to use in a component's "type" field
 *   description - what the component is for and what value it produces
 *   required    - fields that must be present (besides id, type, label)
 *   optional    - fields the AI may include
 *   example     - a valid component object
 */
function toCatalogEntry({ type, description, required, optional, example }) {
  return { type, description, required, optional, example };
}

/**
 * Live catalog read from the component registry. Types registered after this
 * module loads are included.
 */
export function getComponentCatalog() {
  return listComponentDefinitions().map(toCatalogEntry);
}

/**
 * Snapshot of the catalog taken when this module loads (the 12 core types).
 * Kept for convenience; prefer getComponentCatalog() for the live list.
 */
export const COMPONENT_CATALOG = getComponentCatalog();

/**
 * Look up a single catalog entry by component type.
 */
export function getCatalogEntry(type) {
  const definition = getComponentDefinition(type);
  return definition ? toCatalogEntry(definition) : null;
}

/**
 * Describe the option formats accepted by components that take "options".
 */
export function buildOptionFormatNote() {
  return (
    `Components of type ${getComponentTypesWithOptions().join(", ")} take an "options" array. ` +
    'Each option is a string, a number, or an object like {"value": "web", "label": "Web application"}.'
  );
}

export const OPTION_FORMAT_NOTE = buildOptionFormatNote();

/**
 * Build the JSON structure embedded in the prompt's AVAILABLE COMPONENTS
 * section. It keeps the flat "available_components" list of type names and
 * adds a description of each component.
 */
export function buildComponentCatalog() {
  return {
    available_components: getComponentTypes(),
    common_fields: {
      id: "Required. Unique string identifying the field. Its value is returned to you as UI state.",
      type: "Required. One of the available component types.",
      label: "Required. Text shown to the user next to the field.",
      value: "Optional. Default value shown to the user, or null.",
    },
    option_format: buildOptionFormatNote(),
    components: getComponentCatalog().map(({ type, description, required, optional, example }) => ({
      type,
      description,
      required_fields: required,
      optional_fields: optional,
      example,
    })),
  };
}