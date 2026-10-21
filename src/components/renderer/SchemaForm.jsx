import React from "react";
import ComponentRenderer from "./ComponentRenderer.jsx";

/**
 * Render the declarative components from the last validated AI response.
 *
 * Props:
 *   components - array of validated component objects (may be empty)
 *   uiState    - { [componentId]: value } holding what the user has entered
 *   onChange   - (id, value) => void, saves a value into UI state
 *
 * Renders nothing when there are no components, so the conversation panel
 * stays a plain chat until the AI asks for structured input.
 */
export default function SchemaForm({ components = [], uiState = {}, onChange }) {
  if (!Array.isArray(components) || components.length === 0) return null;

  return (
    <div className="schema-form" role="group" aria-label="Requested information">
      {components.map((component) => (
        <ComponentRenderer
          key={component.id}
          component={component}
          value={uiState[component.id]}
          onChange={onChange}
        />
      ))}
    </div>
  );
}