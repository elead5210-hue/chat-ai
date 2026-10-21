import React from "react";
import { getFieldComponent } from "../registry/componentRegistry.js";
// Imported for its side effect: registers the 12 core component types.
import "../registry/coreComponents.js";

/**
 * Render a single declarative component description as a form field.
 *
 * Props:
 *   component - validated component object { id, type, label, ... }
 *   value     - current UI state value for component.id
 *   onChange  - (id, value) => void
 *
 * Unknown types render a small notice instead of crashing the app.
 */
export default function ComponentRenderer({ component, value, onChange }) {
  if (!component || typeof component !== "object") return null;

  const Field = getFieldComponent(component.type);

  if (!Field) {
    return (
      <div className="field-row field-unsupported" role="note">
        Unsupported component type "{String(component.type)}"
        {component.label ? ` (${component.label})` : ""}.
      </div>
    );
  }

  return (
    <Field
      component={component}
      value={value}
      onChange={(next) => onChange?.(component.id, next)}
    />
  );
}