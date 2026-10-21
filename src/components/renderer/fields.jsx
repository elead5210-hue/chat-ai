import React from "react";

/**
 * Field components for the core component types. They are exported here and
 * registered (by type) in registry/coreComponents.js, which is the single place
 * that maps a protocol type to its field component.
 */

/**
 * Normalise an option (string, number, or { value, label }) to
 * { value, label, key }. Values are kept as supplied so the AI gets back
 * exactly what it offered.
 */
export function normalizeOption(option) {
  if (option !== null && typeof option === "object") {
    const value = option.value;
    return {
      value,
      label: String(option.label ?? value),
      key: String(value),
    };
  }
  return { value: option, label: String(option), key: String(option) };
}

export function normalizeOptions(options) {
  return Array.isArray(options) ? options.map(normalizeOption) : [];
}

/** Find the option whose key matches a DOM string value. */
function findByKey(options, key) {
  return options.find((option) => option.key === key);
}

function fieldId(component) {
  return `field-${component.id}`;
}

function toNumber(raw) {
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/* ---------- Simple inputs ---------- */

function InputField({ component, value, onChange, inputType }) {
  const id = fieldId(component);
  return (
    <div className="field-row">
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
      <input
        id={id}
        type={inputType}
        value={value ?? ""}
        placeholder={component.placeholder}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      />
    </div>
  );
}

export function TextField(props) {
  return <InputField {...props} inputType="text" />;
}

export function DateField(props) {
  return <InputField {...props} inputType="date" />;
}

export function TimeField(props) {
  return <InputField {...props} inputType="time" />;
}

export function DateTimeField(props) {
  return <InputField {...props} inputType="datetime-local" />;
}

export function TextareaField({ component, value, onChange }) {
  const id = fieldId(component);
  return (
    <div className="field-row">
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
      <textarea
        id={id}
        rows={3}
        value={value ?? ""}
        placeholder={component.placeholder}
        onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
      />
    </div>
  );
}

export function NumberField({ component, value, onChange }) {
  const id = fieldId(component);
  return (
    <div className="field-row">
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
      <input
        id={id}
        type="number"
        value={value ?? ""}
        min={component.min}
        max={component.max}
        step={component.step}
        onChange={(event) => onChange(toNumber(event.target.value))}
      />
    </div>
  );
}

export function BooleanField({ component, value, onChange }) {
  const id = fieldId(component);
  return (
    <div className="field-row field-row-inline">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={value === true}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
    </div>
  );
}

export function SliderField({ component, value, onChange }) {
  const id = fieldId(component);
  const min = typeof component.min === "number" ? component.min : 0;
  const max = typeof component.max === "number" ? component.max : 100;
  const current = typeof value === "number" ? value : min;
  return (
    <div className="field-row">
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
      <div className="slider-row">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={component.step ?? 1}
          value={current}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output className="slider-value" htmlFor={id}>
          {current}
        </output>
      </div>
    </div>
  );
}

/* ---------- Option-based inputs ---------- */

export function SelectField({ component, value, onChange }) {
  const id = fieldId(component);
  const options = normalizeOptions(component.options);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="field-row">
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
      <select
        id={id}
        value={selected ? selected.key : ""}
        onChange={(event) => {
          const option = findByKey(options, event.target.value);
          onChange(option ? option.value : null);
        }}
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MultiSelectField({ component, value, onChange }) {
  const id = fieldId(component);
  const options = normalizeOptions(component.options);
  const selectedValues = Array.isArray(value) ? value : [];
  const selectedKeys = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.key);
  return (
    <div className="field-row">
      <label htmlFor={id} className="field-label">
        {component.label}
      </label>
      <select
        id={id}
        multiple
        size={Math.min(Math.max(options.length, 2), 6)}
        value={selectedKeys}
        onChange={(event) => {
          const keys = Array.from(event.target.selectedOptions, (el) => el.value);
          onChange(options.filter((option) => keys.includes(option.key)).map((o) => o.value));
        }}
      >
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RadioField({ component, value, onChange }) {
  const options = normalizeOptions(component.options);
  const name = fieldId(component);
  return (
    <fieldset className="field-row field-group">
      <legend className="field-label">{component.label}</legend>
      {options.map((option) => {
        const optionId = `${name}-${option.key}`;
        return (
          <div className="field-option" key={option.key}>
            <input
              id={optionId}
              type="radio"
              name={name}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </div>
        );
      })}
    </fieldset>
  );
}

export function CheckboxField({ component, value, onChange }) {
  const options = normalizeOptions(component.options);
  const name = fieldId(component);
  const selectedValues = Array.isArray(value) ? value : [];

  function toggle(option, checked) {
    const without = selectedValues.filter((item) => item !== option.value);
    const next = checked ? [...without, option.value] : without;
    // Preserve the order the AI listed the options in.
    onChange(options.filter((o) => next.includes(o.value)).map((o) => o.value));
  }

  return (
    <fieldset className="field-row field-group">
      <legend className="field-label">{component.label}</legend>
      {options.map((option) => {
        const optionId = `${name}-${option.key}`;
        return (
          <div className="field-option" key={option.key}>
            <input
              id={optionId}
              type="checkbox"
              checked={selectedValues.includes(option.value)}
              onChange={(event) => toggle(option, event.target.checked)}
            />
            <label htmlFor={optionId}>{option.label}</label>
          </div>
        );
      })}
    </fieldset>
  );
}

// Field components are registered by type in registry/coreComponents.js.