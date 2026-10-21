import { hasComponent, registerComponent } from "./componentRegistry.js";
import {
  TextField,
  TextareaField,
  NumberField,
  DateField,
  TimeField,
  DateTimeField,
  BooleanField,
  SelectField,
  MultiSelectField,
  RadioField,
  CheckboxField,
  SliderField,
} from "../renderer/fields.jsx";

/**
 * The 12 core V1 component definitions.
 *
 * To add a new component type later, create its field component and call
 * registerComponent() with a definition (see componentRegistry.js). The
 * protocol, prompt catalog and renderer all read from the registry, so
 * nothing else needs to change.
 *
 * Order matters: it is the order types are listed in the generated prompt.
 */

/** Validation hook shared by types that accept numeric min, max and step. */
function validateNumericBounds(component, where, errors) {
  for (const key of ["min", "max", "step"]) {
    if (component[key] !== undefined && typeof component[key] !== "number") {
      errors.push(`${where}.${key} must be a number when provided.`);
    }
  }
  if (
    typeof component.min === "number" &&
    typeof component.max === "number" &&
    component.min > component.max
  ) {
    errors.push(`${where}.min must not be greater than ${where}.max.`);
  }
}

export const CORE_COMPONENT_DEFINITIONS = [
  {
    type: "text",
    field: TextField,
    description: "Single-line free text. The value is a string.",
    optional: ["placeholder", "value"],
    example: {
      id: "destination",
      type: "text",
      label: "Destination",
      placeholder: "e.g. Cape Town",
      value: null,
    },
  },
  {
    type: "textarea",
    field: TextareaField,
    description: "Multi-line free text for longer answers. The value is a string.",
    optional: ["placeholder", "value"],
    example: {
      id: "trip_notes",
      type: "textarea",
      label: "Anything else we should know?",
      value: null,
    },
  },
  {
    type: "number",
    field: NumberField,
    description: "A numeric input. The value is a number.",
    optional: ["min", "max", "step", "value"],
    validate: validateNumericBounds,
    example: {
      id: "budget",
      type: "number",
      label: "Budget",
      min: 0,
      step: 100,
      value: null,
    },
  },
  {
    type: "date",
    field: DateField,
    description: "A calendar date. The value is a string in YYYY-MM-DD format.",
    optional: ["value"],
    example: {
      id: "departure_date",
      type: "date",
      label: "Departure date",
      value: null,
    },
  },
  {
    type: "time",
    field: TimeField,
    description: "A time of day. The value is a string in HH:MM 24-hour format.",
    optional: ["value"],
    example: {
      id: "arrival_time",
      type: "time",
      label: "Arrival time",
      value: null,
    },
  },
  {
    type: "datetime",
    field: DateTimeField,
    description:
      "A date and time together. The value is a string in YYYY-MM-DDTHH:MM format.",
    optional: ["value"],
    example: {
      id: "meeting_start",
      type: "datetime",
      label: "Meeting start",
      value: null,
    },
  },
  {
    type: "boolean",
    field: BooleanField,
    description: "A yes/no toggle. The value is true or false.",
    optional: ["value"],
    example: {
      id: "international",
      type: "boolean",
      label: "Is this an international trip?",
      value: false,
    },
  },
  {
    type: "select",
    field: SelectField,
    hasOptions: true,
    description:
      "A dropdown where the user picks exactly one option. The value is the chosen option.",
    required: ["options"],
    optional: ["value"],
    example: {
      id: "project_type",
      type: "select",
      label: "Project type",
      options: ["Web application", "Mobile application", "Desktop application", "Other"],
      value: null,
    },
  },
  {
    type: "multiselect",
    field: MultiSelectField,
    hasOptions: true,
    description:
      "A list where the user can pick several options. The value is an array of the chosen options.",
    required: ["options"],
    optional: ["value"],
    example: {
      id: "interests",
      type: "multiselect",
      label: "Interests",
      options: ["Beaches", "Hiking", "Food", "History"],
      value: [],
    },
  },
  {
    type: "radio",
    field: RadioField,
    hasOptions: true,
    description:
      "A small set of visible choices where the user picks exactly one. The value is the chosen option.",
    required: ["options"],
    optional: ["value"],
    example: {
      id: "travel_style",
      type: "radio",
      label: "Travel style",
      options: ["Budget", "Comfort", "Luxury"],
      value: null,
    },
  },
  {
    type: "checkbox",
    field: CheckboxField,
    hasOptions: true,
    description:
      "A group of checkboxes where the user ticks any number of options. The value is an array of the ticked options.",
    required: ["options"],
    optional: ["value"],
    example: {
      id: "extras",
      type: "checkbox",
      label: "Extras",
      options: ["Travel insurance", "Airport transfer", "Car hire"],
      value: [],
    },
  },
  {
    type: "slider",
    field: SliderField,
    description:
      "A numeric slider for choosing a value within a range. The value is a number.",
    optional: ["min", "max", "step", "value"],
    validate: validateNumericBounds,
    example: {
      id: "trip_length_days",
      type: "slider",
      label: "Trip length (days)",
      min: 1,
      max: 30,
      step: 1,
      value: 7,
    },
  },
];

/**
 * Register the core definitions. Safe to call more than once (for example
 * when a dev server hot-reloads this module): types that are already
 * registered are skipped.
 */
export function registerCoreComponents() {
  for (const definition of CORE_COMPONENT_DEFINITIONS) {
    if (!hasComponent(definition.type)) {
      registerComponent(definition);
    }
  }
}

registerCoreComponents();