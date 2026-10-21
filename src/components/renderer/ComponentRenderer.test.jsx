import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ComponentRenderer from "./ComponentRenderer.jsx";
import SchemaForm from "./SchemaForm.jsx";
import { normalizeOption, normalizeOptions } from "./fields.jsx";

afterEach(() => {
  cleanup();
});

function setup(component, value) {
  const onChange = vi.fn();
  render(<ComponentRenderer component={component} value={value} onChange={onChange} />);
  return onChange;
}

describe("normalizeOption", () => {
  it("handles strings, numbers and labelled objects", () => {
    expect(normalizeOption("A")).toEqual({ value: "A", label: "A", key: "A" });
    expect(normalizeOption(2)).toEqual({ value: 2, label: "2", key: "2" });
    expect(normalizeOption({ value: "web", label: "Web" })).toEqual({
      value: "web",
      label: "Web",
      key: "web",
    });
  });

  it("returns an empty list for non-array options", () => {
    expect(normalizeOptions(undefined)).toEqual([]);
  });
});

describe("text-like inputs", () => {
  it("renders a text field and reports changes", () => {
    const onChange = setup({ id: "dest", type: "text", label: "Destination" }, "Cape Town");
    const input = screen.getByLabelText("Destination");
    expect(input.value).toBe("Cape Town");
    fireEvent.change(input, { target: { value: "Durban" } });
    expect(onChange).toHaveBeenCalledWith("dest", "Durban");
  });

  it("reports null when a text field is cleared", () => {
    const onChange = setup({ id: "dest", type: "text", label: "Destination" }, "x");
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("dest", null);
  });

  it("renders a textarea", () => {
    const onChange = setup({ id: "notes", type: "textarea", label: "Notes" }, "hello");
    const input = screen.getByLabelText("Notes");
    expect(input.tagName).toBe("TEXTAREA");
    expect(input.value).toBe("hello");
    fireEvent.change(input, { target: { value: "bye" } });
    expect(onChange).toHaveBeenCalledWith("notes", "bye");
  });

  it("renders date, time and datetime inputs", () => {
    const cases = [
      ["date", "2026-12-01", "date"],
      ["time", "09:30", "time"],
      ["datetime", "2026-12-01T09:30", "datetime-local"],
    ];
    for (const [type, value, inputType] of cases) {
      cleanup();
      const onChange = setup({ id: type, type, label: `Field ${type}` }, value);
      const input = screen.getByLabelText(`Field ${type}`);
      expect(input.getAttribute("type")).toBe(inputType);
      expect(input.value).toBe(value);
      fireEvent.change(input, { target: { value } });
    }
  });
});

describe("number and slider", () => {
  it("reports numbers, and null when empty", () => {
    const onChange = setup({ id: "budget", type: "number", label: "Budget", min: 0 }, 100);
    const input = screen.getByLabelText("Budget");
    expect(input.value).toBe("100");
    fireEvent.change(input, { target: { value: "250" } });
    expect(onChange).toHaveBeenLastCalledWith("budget", 250);
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("budget", null);
  });

  it("renders a slider with its current value", () => {
    const onChange = setup(
      { id: "days", type: "slider", label: "Days", min: 1, max: 30, step: 1 },
      7
    );
    const input = screen.getByLabelText("Days");
    expect(input.getAttribute("type")).toBe("range");
    expect(input.value).toBe("7");
    expect(screen.getByText("7")).toBeTruthy();
    fireEvent.change(input, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith("days", 12);
  });

  it("falls back to the minimum when the slider has no value", () => {
    setup({ id: "days", type: "slider", label: "Days", min: 3, max: 10 }, undefined);
    expect(screen.getByLabelText("Days").value).toBe("3");
  });
});

describe("boolean", () => {
  it("reflects and toggles the value", () => {
    const onChange = setup({ id: "intl", type: "boolean", label: "International?" }, true);
    const input = screen.getByLabelText("International?");
    expect(input.checked).toBe(true);
    fireEvent.click(input);
    expect(onChange).toHaveBeenCalledWith("intl", false);
  });

  it("treats a missing value as false", () => {
    setup({ id: "intl", type: "boolean", label: "International?" }, undefined);
    expect(screen.getByLabelText("International?").checked).toBe(false);
  });
});

describe("option-based inputs", () => {
  const options = ["Budget", "Comfort", "Luxury"];

  it("renders a select and reports the chosen option", () => {
    const onChange = setup({ id: "style", type: "select", label: "Style", options }, "Comfort");
    const select = screen.getByLabelText("Style");
    expect(select.value).toBe("Comfort");
    fireEvent.change(select, { target: { value: "Luxury" } });
    expect(onChange).toHaveBeenCalledWith("style", "Luxury");
    fireEvent.change(select, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith("style", null);
  });

  it("keeps the original value type for labelled and numeric options", () => {
    const onChange = setup(
      {
        id: "pick",
        type: "select",
        label: "Pick",
        options: [{ value: 5, label: "Five" }, { value: 6, label: "Six" }],
      },
      undefined
    );
    fireEvent.change(screen.getByLabelText("Pick"), { target: { value: "6" } });
    expect(onChange).toHaveBeenCalledWith("pick", 6);
  });

  it("renders a multiselect with the selected values", () => {
    setup(
      { id: "interests", type: "multiselect", label: "Interests", options: ["A", "B", "C"] },
      ["A", "C"]
    );
    const select = screen.getByLabelText("Interests");
    const selected = Array.from(select.selectedOptions, (o) => o.value);
    expect(selected).toEqual(["A", "C"]);
  });

  it("renders radio buttons and reports the selection", () => {
    const onChange = setup({ id: "style", type: "radio", label: "Style", options }, "Budget");
    expect(screen.getByRole("group", { name: "Style" })).toBeTruthy();
    expect(screen.getByLabelText("Budget").checked).toBe(true);
    expect(screen.getByLabelText("Luxury").checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Luxury"));
    expect(onChange).toHaveBeenCalledWith("style", "Luxury");
  });

  it("renders checkboxes and adds and removes values in option order", () => {
    const opts = ["Insurance", "Transfer", "Car hire"];
    const onChange = setup(
      { id: "extras", type: "checkbox", label: "Extras", options: opts },
      ["Car hire"]
    );
    expect(screen.getByLabelText("Car hire").checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Insurance"));
    expect(onChange).toHaveBeenLastCalledWith("extras", ["Insurance", "Car hire"]);
    fireEvent.click(screen.getByLabelText("Car hire"));
    expect(onChange).toHaveBeenLastCalledWith("extras", []);
  });
});

describe("ComponentRenderer fallbacks", () => {
  it("shows a notice for unknown component types", () => {
    setup({ id: "x", type: "hologram", label: "Mystery" }, undefined);
    expect(screen.getByRole("note").textContent).toMatch(/Unsupported component type "hologram"/);
  });

  it("renders nothing for a missing component", () => {
    const { container } = render(<ComponentRenderer component={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("SchemaForm", () => {
  it("renders nothing without components", () => {
    const { container } = render(<SchemaForm components={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders every component bound to its UI state value", () => {
    const onChange = vi.fn();
    render(
      <SchemaForm
        components={[
          { id: "a", type: "text", label: "Alpha" },
          { id: "b", type: "number", label: "Beta" },
        ]}
        uiState={{ a: "one", b: 2 }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole("group", { name: "Requested information" })).toBeTruthy();
    expect(screen.getByLabelText("Alpha").value).toBe("one");
    expect(screen.getByLabelText("Beta").value).toBe("2");
    fireEvent.change(screen.getByLabelText("Alpha"), { target: { value: "two" } });
    expect(onChange).toHaveBeenCalledWith("a", "two");
  });
});