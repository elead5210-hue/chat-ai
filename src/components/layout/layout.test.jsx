import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, within, cleanup, fireEvent } from "@testing-library/react";
import App from "../../App.jsx";

afterEach(() => {
  cleanup();
});

describe("application layout", () => {
  it("renders the header with the app title and session menu", () => {
    render(<App />);

    const header = document.querySelector('[data-area="header"]');
    expect(header).not.toBeNull();
    expect(within(header).getByRole("heading", { name: "NEXUS" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: /session/i })).toBeTruthy();
  });

  it("renders the conversation panel with the welcome message and input box", () => {
    render(<App />);

    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(conversation.getAttribute("data-area")).toBe("conversation");
    expect(within(conversation).getByText("What would you like to work on?")).toBeTruthy();
    expect(within(conversation).getByLabelText("Your message")).toBeTruthy();
    expect(within(conversation).getByRole("button", { name: "Send" })).toBeTruthy();
  });

  it("renders the interchange panel with prompt sections, Copy Prompt and the paste field", () => {
    render(<App />);

    const interchange = screen.getByRole("region", { name: "AI interchange" });
    expect(interchange.getAttribute("data-area")).toBe("interchange");

    expect(within(interchange).getByText("System instruction")).toBeTruthy();
    expect(within(interchange).getByText("Context")).toBeTruthy();
    expect(within(interchange).getByText("Response schema")).toBeTruthy();

    expect(within(interchange).getByRole("button", { name: "Copy Prompt" })).toBeTruthy();
    expect(within(interchange).getByLabelText("AI response JSON")).toBeTruthy();
    expect(within(interchange).getByRole("button", { name: "Submit Response" })).toBeTruthy();
  });

  it("places the conversation panel before the interchange panel", () => {
    render(<App />);

    const conversation = document.querySelector('[data-area="conversation"]');
    const interchange = document.querySelector('[data-area="interchange"]');
    const position = conversation.compareDocumentPosition(interchange);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("pins the chat input outside the scrolling message region", () => {
    render(<App />);

    const conversation = document.querySelector('[data-area="conversation"]');
    const scroll = conversation.querySelector(".message-scroll");
    const input = conversation.querySelector(".chat-input-pinned");

    expect(scroll).not.toBeNull();
    expect(input).not.toBeNull();
    expect(scroll.contains(input)).toBe(false);
  });

  it("sends a user message into the conversation", () => {
    render(<App />);

    const input = screen.getByLabelText("Your message");
    fireEvent.change(input, { target: { value: "I want to plan a trip" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const conversation = screen.getByRole("region", { name: "Conversation" });
    expect(within(conversation).getByText(/I want to plan a trip/)).toBeTruthy();
  });

  it("can hide and show the prompt preview", () => {
    render(<App />);

    const region = document.getElementById("prompt-preview-region");
    expect(region.hidden).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Hide prompt" }));
    expect(region.hidden).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Show prompt" }));
    expect(region.hidden).toBe(false);
  });

  it("opens the session menu and starts a new session", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Temporary message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText(/Temporary message/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /session/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New session" }));

    expect(screen.queryByText(/Temporary message/)).toBeNull();
    expect(screen.getByText("What would you like to work on?")).toBeTruthy();
  });
});

describe("Nexus branding", () => {
  function pasteAiReply(content) {
    const response = {
      protocol: "nexus",
      version: "1.0",
      message: { role: "assistant", content },
      components: [],
      context_updates: [],
      state_updates: [],
      next_action: "await_user",
    };
    fireEvent.change(screen.getByLabelText("AI response JSON"), {
      target: { value: JSON.stringify(response) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Response" }));
  }

  function authorOf(listItem) {
    return listItem.querySelector(".message-author").textContent;
  }

  it("names the app Nexus in the header and describes it as an interface between the user and AI", () => {
    render(<App />);

    const header = document.querySelector('[data-area="header"]');
    expect(within(header).getByRole("heading", { name: "NEXUS" })).toBeTruthy();
    expect(
      within(header).getByText("Your structured interface between you and AI")
    ).toBeTruthy();
    expect(document.title).toBe("Nexus");
  });

  it("labels the welcome message as coming from Nexus", () => {
    render(<App />);

    const welcome = screen.getByText("What would you like to work on?").closest("li");
    expect(authorOf(welcome)).toBe("Nexus");
    expect(welcome.classList.contains("message-nexus")).toBe(true);
    expect(welcome.classList.contains("message-ai")).toBe(false);
  });

  it("labels a pasted AI reply 'AI via Nexus', not 'Nexus'", () => {
    render(<App />);
    pasteAiReply("Tell me about your trip.");

    const reply = screen.getByText(/Tell me about your trip\./).closest("li");
    expect(authorOf(reply)).toBe("AI via Nexus");
    expect(reply.classList.contains("message-ai")).toBe(true);
    expect(reply.classList.contains("message-nexus")).toBe(false);
  });

  it("keeps the welcome message labelled Nexus after an AI reply arrives", () => {
    render(<App />);
    pasteAiReply("Tell me about your trip.");

    const welcome = screen.getByText("What would you like to work on?").closest("li");
    expect(authorOf(welcome)).toBe("Nexus");
  });

  it("labels user messages 'You'", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "I want to plan a trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    const message = screen.getByText(/I want to plan a trip/).closest("li");
    expect(authorOf(message)).toBe("You");
  });

  it("labels each speaker in order: Nexus, You, AI via Nexus", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Somewhere warm please" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    pasteAiReply("How warm?");

    const conversation = screen.getByRole("region", { name: "Conversation" });
    const authors = Array.from(conversation.querySelectorAll(".message-author")).map(
      (element) => element.textContent
    );
    expect(authors).toEqual(["Nexus", "You", "AI via Nexus"]);
  });

  it("shows the welcome message as Nexus again after a new session", () => {
    render(<App />);
    pasteAiReply("Tell me about your trip.");

    fireEvent.click(screen.getByRole("button", { name: /session/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "New session" }));

    expect(screen.queryByText(/Tell me about your trip\./)).toBeNull();
    const welcome = screen.getByText("What would you like to work on?").closest("li");
    expect(authorOf(welcome)).toBe("Nexus");
  });

  it("titles the interchange panel for Nexus and your AI", () => {
    render(<App />);

    const interchange = screen.getByRole("region", { name: "AI interchange" });
    expect(within(interchange).getByRole("heading", { name: /Nexus.*Your AI/ })).toBeTruthy();
  });

  it("explains that Nexus builds the prompt and checks the reply while the answers come from the user's AI", () => {
    render(<App />);

    const interchange = screen.getByRole("region", { name: "AI interchange" });
    const explainer = interchange.querySelector(".interchange-explainer");

    expect(explainer).not.toBeNull();
    expect(explainer.textContent).toMatch(/Nexus builds the prompt and checks the reply/);
    expect(explainer.textContent).toMatch(/your own AI/);
    expect(explainer.textContent).toMatch(/paste its JSON response/);
  });

  it("puts the explainer above the prompt preview", () => {
    render(<App />);

    const explainer = document.querySelector(".interchange-explainer");
    const prompt = document.getElementById("prompt-preview-region");
    expect(explainer.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});