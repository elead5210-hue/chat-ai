import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import App from "../../App.jsx";
import { PROTOCOL_NAME, PROTOCOL_VERSION } from "../../protocol/schema.js";

afterEach(() => {
  cleanup();
});

function makeResponse(overrides = {}) {
  return {
    protocol: PROTOCOL_NAME,
    version: PROTOCOL_VERSION,
    message: { role: "assistant", content: "Tell me about your trip." },
    components: [
      { id: "destination", type: "text", label: "Destination" },
      { id: "budget", type: "number", label: "Budget", min: 0 },
      {
        id: "travel_style",
        type: "select",
        label: "Travel style",
        options: ["Budget", "Comfort", "Luxury"],
      },
      { id: "international", type: "boolean", label: "International trip?" },
    ],
    context_updates: [{ key: "goal", value: "Plan a trip" }],
    state_updates: [],
    next_action: "await_user",
    ...overrides,
  };
}

function pasteResponse(response) {
  const text = typeof response === "string" ? response : JSON.stringify(response);
  fireEvent.change(screen.getByLabelText("AI response JSON"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Submit Response" }));
}

function promptText() {
  const interchange = screen.getByRole("region", { name: "AI interchange" });
  // The full prompt is only held in state; read the visible sections instead.
  return interchange.textContent;
}

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

function contextBadge() {
  return screen.getByRole("group", { name: "Context version" });
}

function shownFingerprint() {
  const match = contextBadge().textContent.match(/CTX-[0-9A-F]{6}/);
  return match ? match[0] : null;
}

function shownVersion() {
  const match = contextBadge().textContent.match(/Version ([0-9]+)/);
  return match ? Number(match[1]) : null;
}

describe("schema-driven UI loop", () => {
  it("renders no form before the AI has responded", () => {
    render(<App />);
    expect(screen.queryByRole("group", { name: "Requested information" })).toBeNull();
  });

  it("shows the AI message and renders its components after a valid paste", () => {
    render(<App />);
    pasteResponse(makeResponse());

    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(within(conversation).getByText(/Tell me about your trip/)).toBeTruthy();

    const form = within(conversation).getByRole("group", { name: "Requested information" });
    expect(within(form).getByLabelText("Destination")).toBeTruthy();
    expect(within(form).getByLabelText("Budget")).toBeTruthy();
    expect(within(form).getByLabelText("Travel style")).toBeTruthy();
    expect(within(form).getByLabelText("International trip?")).toBeTruthy();
  });

  it("clears the paste box after an accepted response", () => {
    render(<App />);
    pasteResponse(makeResponse());
    expect(screen.getByLabelText("AI response JSON").value).toBe("");
  });

  it("shows validation errors and renders nothing for an invalid response", () => {
    render(<App />);
    pasteResponse({ answer: "hello" });

    expect(screen.getByRole("alert").textContent).toMatch(/"protocol"/);
    expect(screen.queryByRole("group", { name: "Requested information" })).toBeNull();
  });

  it("saves user input to UI state so it appears in the next prompt", () => {
    render(<App />);
    pasteResponse(makeResponse());

    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Cape Town" } });
    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "30000" } });
    fireEvent.change(screen.getByLabelText("Travel style"), { target: { value: "Comfort" } });
    fireEvent.click(screen.getByLabelText("International trip?"));

    // Fields keep reflecting what was entered.
    expect(screen.getByLabelText("Destination").value).toBe("Cape Town");
    expect(screen.getByLabelText("Budget").value).toBe("30000");
    expect(screen.getByLabelText("Travel style").value).toBe("Comfort");
    expect(screen.getByLabelText("International trip?").checked).toBe(true);

    // The prompt that gets copied includes the entered values.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const prompt = writeText.mock.calls[0][0];
    expect(prompt).toContain("## CURRENT UI STATE");

    const stateStart = prompt.indexOf("## CURRENT UI STATE");
    const stateEnd = prompt.indexOf("## AVAILABLE COMPONENTS");
    const state = JSON.parse(
      prompt.slice(stateStart, stateEnd).split("\n").slice(1).join("\n").trim()
    );
    expect(state).toEqual({
      destination: "Cape Town",
      budget: 30000,
      travel_style: "Comfort",
      international: true,
    });
  });

  it("includes the AI's message and context updates in the next prompt", () => {
    render(<App />);
    pasteResponse(makeResponse());

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));

    const prompt = writeText.mock.calls[0][0];
    expect(prompt).toContain("Assistant: Tell me about your trip.");

    // Context updates are rendered as a Context Package, not raw JSON.
    const contextStart = prompt.indexOf("## CONTEXT");
    const contextEnd = prompt.indexOf("## CONVERSATION SO FAR");
    const contextSection = prompt.slice(contextStart, contextEnd);
    expect(contextSection).toContain("CONTEXT PACKAGE");
    expect(contextSection).toContain("Current state:");
    expect(contextSection).toContain("- goal: Plan a trip");
    expect(contextSection).not.toContain('"goal": "Plan a trip"');
  });

  it("keeps user-sent messages in the conversation history of the next prompt", () => {
    render(<App />);
    pasteResponse(makeResponse());

    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Somewhere warm please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));

    expect(writeText.mock.calls[0][0]).toContain("User: Somewhere warm please");
  });

  it("seeds default values supplied by the AI without overwriting user input", () => {
    render(<App />);
    pasteResponse(
      makeResponse({
        components: [{ id: "days", type: "slider", label: "Days", min: 1, max: 30, value: 7 }],
      })
    );
    expect(screen.getByLabelText("Days").value).toBe("7");

    fireEvent.change(screen.getByLabelText("Days"), { target: { value: "14" } });

    pasteResponse(
      makeResponse({
        components: [{ id: "days", type: "slider", label: "Days", min: 1, max: 30, value: 7 }],
      })
    );
    expect(screen.getByLabelText("Days").value).toBe("14");
  });

  it("applies state_updates from the AI to the rendered fields", () => {
    render(<App />);
    pasteResponse(
      makeResponse({
        components: [{ id: "destination", type: "text", label: "Destination" }],
        state_updates: [{ id: "destination", value: "Lisbon" }],
      })
    );
    expect(screen.getByLabelText("Destination").value).toBe("Lisbon");
  });

  it("drops UI state for components the next response no longer shows", () => {
    render(<App />);
    pasteResponse(makeResponse());
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Cape Town" } });

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "Now pick dates." },
        components: [{ id: "departure_date", type: "date", label: "Departure date" }],
      })
    );

    expect(screen.queryByLabelText("Destination")).toBeNull();
    expect(screen.getByLabelText("Departure date")).toBeTruthy();

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));
    expect(writeText.mock.calls[0][0]).not.toContain("Cape Town");
  });

  it("clears the rendered form when a new session starts", () => {
    render(<App />);
    pasteResponse(makeResponse());
    expect(screen.getByLabelText("Destination")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /session/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New session" }));

    expect(screen.queryByLabelText("Destination")).toBeNull();
    expect(promptText()).toMatch(/No context yet/);
  });
});

describe("context fingerprint and versioning", () => {
  it("shows a fingerprint and version 1 before any response", () => {
    render(<App />);
    expect(shownFingerprint()).toMatch(/^CTX-[0-9A-F]{6}$/);
    expect(shownVersion()).toBe(1);
  });

  it("shows a new fingerprint and version after a response updates the context", () => {
    render(<App />);
    const before = shownFingerprint();

    pasteResponse(makeResponse());

    expect(shownFingerprint()).toMatch(/^CTX-[0-9A-F]{6}$/);
    expect(shownFingerprint()).not.toBe(before);
    expect(shownVersion()).toBe(2);
  });

  it("changes the fingerprint and version when a later response updates the context", () => {
    render(<App />);
    pasteResponse(makeResponse());
    const firstFingerprint = shownFingerprint();
    const firstVersion = shownVersion();

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "Where to?" },
        components: [{ id: "destination", type: "text", label: "Destination" }],
        context_updates: [{ key: "summary", value: "Planning a trip." }],
      })
    );

    expect(shownVersion()).toBe(firstVersion + 1);
    expect(shownFingerprint()).not.toBe(firstFingerprint);
  });

  it("keeps the fingerprint and version when a response changes nothing in the context", () => {
    render(<App />);
    pasteResponse(makeResponse());
    const fingerprint = shownFingerprint();
    const version = shownVersion();

    // No context updates at all.
    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "Anything else?" },
        context_updates: [],
      })
    );
    expect(shownFingerprint()).toBe(fingerprint);
    expect(shownVersion()).toBe(version);

    // An update that repeats what the context already holds.
    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "Just checking." },
        context_updates: [{ key: "goal", value: "Plan a trip" }],
      })
    );
    expect(shownFingerprint()).toBe(fingerprint);
    expect(shownVersion()).toBe(version);
  });

  it("is not changed by typing into generated fields or sending a message", () => {
    render(<App />);
    pasteResponse(makeResponse());
    const fingerprint = shownFingerprint();
    const version = shownVersion();

    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Cape Town" } });
    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Somewhere warm please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(shownFingerprint()).toBe(fingerprint);
    expect(shownVersion()).toBe(version);
  });

  it("shows the same fingerprint in the badge and in the context package text", () => {
    render(<App />);
    pasteResponse(makeResponse());

    expect(promptText()).toContain(`Fingerprint: ${shownFingerprint()}`);
    expect(promptText()).toContain(`Version: ${shownVersion()}`);
  });

  it("puts the current fingerprint in the copied prompt and updates it with the context", () => {
    render(<App />);
    const writeText = mockClipboard();
    pasteResponse(makeResponse());
    const firstFingerprint = shownFingerprint();

    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));
    const firstPrompt = writeText.mock.calls[0][0];
    const firstContext = firstPrompt.slice(
      firstPrompt.indexOf("## CONTEXT"),
      firstPrompt.indexOf("## CONVERSATION SO FAR")
    );
    expect(firstContext).toContain(`Fingerprint: ${firstFingerprint}`);

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "Next question." },
        context_updates: ["Trip is international"],
      })
    );
    const secondFingerprint = shownFingerprint();
    expect(secondFingerprint).not.toBe(firstFingerprint);

    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));
    const secondPrompt = writeText.mock.calls[1][0];
    expect(secondPrompt).toContain(`Fingerprint: ${secondFingerprint}`);
    expect(secondPrompt).not.toContain(firstFingerprint);
  });

  it("names the fingerprint and version when the context package is copied", async () => {
    render(<App />);
    const writeText = mockClipboard();
    pasteResponse(makeResponse());
    const fingerprint = shownFingerprint();
    const version = shownVersion();

    fireEvent.click(screen.getByRole("button", { name: "Copy Context Package" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain(`Fingerprint: ${fingerprint}`);

    const status = await screen.findByText(/Context package copied/);
    expect(status.textContent).toContain(fingerprint);
    expect(status.textContent).toContain(`version ${version}`);
  });

  it("names the fingerprint when the continuation prompt is copied", async () => {
    render(<App />);
    const writeText = mockClipboard();
    pasteResponse(makeResponse());
    const fingerprint = shownFingerprint();

    fireEvent.click(screen.getByRole("button", { name: "Copy Continuation Prompt" }));

    expect(writeText).toHaveBeenCalledTimes(1);
    const continuation = writeText.mock.calls[0][0];
    expect(continuation).toContain("You are continuing an existing conversation.");
    expect(continuation).toContain(`Fingerprint: ${fingerprint}`);

    const status = await screen.findByText(/Continuation prompt copied/);
    expect(status.textContent).toContain(fingerprint);
  });

  it("starts a fresh version history when a new session starts", () => {
    render(<App />);
    pasteResponse(makeResponse());
    const oldFingerprint = shownFingerprint();
    expect(shownVersion()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /session/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New session" }));

    expect(shownVersion()).toBe(1);
    expect(shownFingerprint()).toMatch(/^CTX-[0-9A-F]{6}$/);
    expect(shownFingerprint()).not.toBe(oldFingerprint);
  });

  it("gives separate sessions different fingerprints", () => {
    render(<App />);
    const first = shownFingerprint();
    cleanup();

    render(<App />);
    const second = shownFingerprint();

    expect(first).toMatch(/^CTX-[0-9A-F]{6}$/);
    expect(second).toMatch(/^CTX-[0-9A-F]{6}$/);
    expect(second).not.toBe(first);
  });
});

describe("protocol validation of context and state updates", () => {
  // Everything the user can observe about the three stores: what was said
  // (conversation), what matters (context fingerprint, version and the prompt
  // built from it) and what was entered (form values and the prompt's UI state).
  function snapshotApp(writeText) {
    fireEvent.click(screen.getByRole("button", { name: "Copy Prompt" }));
    return {
      conversation: screen.getByRole("region", { name: "Conversation" }).textContent,
      fingerprint: shownFingerprint(),
      version: shownVersion(),
      destination: screen.getByLabelText("Destination").value,
      prompt: writeText.mock.calls[writeText.mock.calls.length - 1][0],
    };
  }

  function seedSession() {
    pasteResponse(makeResponse());
    fireEvent.change(screen.getByLabelText("Destination"), { target: { value: "Cape Town" } });
    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Somewhere warm please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  }

  it("rejects a malformed context update with an error naming the field and index", () => {
    render(<App />);
    pasteResponse(
      makeResponse({
        context_updates: [
          { key: "goal", value: "Plan a trip" },
          { op: "add", field: "decisions", value: "" },
        ],
      })
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/context_updates\[1\]\.value/);
    expect(alert.textContent).toMatch(/decisions/);
    // The valid update at index 0 is not blamed.
    expect(alert.textContent).not.toMatch(/context_updates\[0\]/);
    expect(screen.queryByRole("group", { name: "Requested information" })).toBeNull();
  });

  it("rejects a malformed state update with an error naming the field and index", () => {
    render(<App />);
    pasteResponse(
      makeResponse({
        state_updates: [{ id: "destination" }],
      })
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/state_updates\[0\]\.value/);
    expect(screen.queryByRole("group", { name: "Requested information" })).toBeNull();
  });

  it("rejects a state update with a missing id", () => {
    render(<App />);
    pasteResponse(
      makeResponse({
        state_updates: [{ id: "", value: "Lisbon" }],
      })
    );

    expect(screen.getByRole("alert").textContent).toMatch(/state_updates\[0\]\.id/);
  });

  it("lists each malformed update as its own error item", () => {
    render(<App />);
    pasteResponse(
      makeResponse({
        context_updates: [{ key: "summary", value: 42 }],
        state_updates: [{ value: "Lisbon" }],
      })
    );

    const alert = screen.getByRole("alert");
    const items = within(alert).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toMatch(/context_updates\[0\]\.value/);
    expect(items[1].textContent).toMatch(/state_updates\[0\]\.id/);
  });

  it("leaves messages, context and form values unchanged when a context update is malformed", () => {
    render(<App />);
    const writeText = mockClipboard();
    seedSession();
    const before = snapshotApp(writeText);
    expect(before.destination).toBe("Cape Town");

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "This message must not appear." },
        components: [{ id: "departure_date", type: "date", label: "Departure date" }],
        context_updates: [
          { key: "summary", value: "A summary that must not be applied." },
          { op: "set", field: "summary", value: 42 },
        ],
        state_updates: [{ id: "destination", value: "Lisbon" }],
      })
    );

    expect(screen.getByRole("alert").textContent).toMatch(/context_updates\[1\]\.value/);

    const after = snapshotApp(writeText);
    expect(after.conversation).toBe(before.conversation);
    expect(after.conversation).not.toContain("This message must not appear.");
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.version).toBe(before.version);
    expect(after.destination).toBe("Cape Town");
    expect(screen.queryByLabelText("Departure date")).toBeNull();
    expect(after.prompt).toBe(before.prompt);
    expect(after.prompt).not.toContain("A summary that must not be applied.");
    expect(after.prompt).not.toContain("Lisbon");
  });

  it("leaves messages, context and form values unchanged when a state update is malformed", () => {
    render(<App />);
    const writeText = mockClipboard();
    seedSession();
    const before = snapshotApp(writeText);

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "This message must not appear." },
        context_updates: [{ key: "goal", value: "A goal that must not be applied" }],
        state_updates: [{ id: "destination", value: "Lisbon" }, { id: "budget" }],
      })
    );

    expect(screen.getByRole("alert").textContent).toMatch(/state_updates\[1\]\.value/);

    const after = snapshotApp(writeText);
    expect(after.conversation).toBe(before.conversation);
    expect(after.fingerprint).toBe(before.fingerprint);
    expect(after.version).toBe(before.version);
    // The valid state update in the same response is not applied either.
    expect(after.destination).toBe("Cape Town");
    expect(after.prompt).toBe(before.prompt);
    expect(after.prompt).not.toContain("A goal that must not be applied");
  });

  it("keeps the rejected text in the paste box so it can be corrected", () => {
    render(<App />);
    const bad = makeResponse({ state_updates: [{ id: "destination" }] });
    pasteResponse(bad);

    expect(screen.getByLabelText("AI response JSON").value).toBe(JSON.stringify(bad));
  });

  it("applies a corrected response after a rejected one and clears the errors", () => {
    render(<App />);
    pasteResponse(makeResponse({ state_updates: [{ id: "destination" }] }));
    expect(screen.getByRole("alert")).toBeTruthy();
    const before = shownVersion();

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "Corrected reply." },
        state_updates: [{ id: "destination", value: "Lisbon" }],
      })
    );

    expect(screen.queryByRole("alert")).toBeNull();
    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(within(conversation).getByText(/Corrected reply\./)).toBeTruthy();
    expect(screen.getByLabelText("Destination").value).toBe("Lisbon");
    expect(shownVersion()).toBeGreaterThan(before);
  });

  it("applies a fully valid response with context and state updates in every accepted shape", () => {
    render(<App />);
    const before = shownVersion();

    pasteResponse(
      makeResponse({
        message: { role: "assistant", content: "All updates applied." },
        components: [{ id: "destination", type: "text", label: "Destination" }],
        context_updates: [
          "Trip is international",
          { key: "goal", value: "Plan a trip" },
          { op: "set", field: "summary", value: "Planning a trip abroad." },
          { op: "add", field: "decisions", value: "Travel in March" },
        ],
        state_updates: [{ id: "destination", value: "Lisbon" }],
      })
    );

    expect(screen.queryByRole("alert")).toBeNull();

    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(within(conversation).getByText(/All updates applied\./)).toBeTruthy();
    expect(screen.getByLabelText("Destination").value).toBe("Lisbon");

    expect(shownVersion()).toBeGreaterThan(before);
    const interchange = promptText();
    expect(interchange).toContain("Planning a trip abroad.");
    expect(interchange).toContain("Travel in March");
    expect(interchange).toContain("Trip is international");
  });
});