import React, { useEffect, useRef, useState } from "react";
import SchemaForm from "../renderer/SchemaForm.jsx";
import ChecklistProgress from "./ChecklistProgress.jsx";
import {
  CONVERSATION_PHASE_CONTEXT,
  isNexusMessage,
} from "../../state/conversationStore.js";

const PHASE_LABELS = Object.freeze({
  boundaries: "Phase 1: boundaries",
  context: "Phase 2: context",
});

/**
 * Chat-style conversation panel: message list plus a user input box.
 *
 * Props supplied by App.jsx:
 *   messages        - [{ id, role, content }]
 *   onSend          - (text) => void
 *   lastResponse    - last validated AI response (may be null)
 *   uiState         - values the user has entered into generated fields
 *   onUiStateChange - (id, value) => void
 *   isComplete      - true once the conversation has terminated; input is disabled
 *   phase           - "boundaries" (phase one) or "context" (phase two)
 *   checklist       - [{ id, label, satisfied }]; shown once the AI has defined it
 *
 * Nexus is the interface, not the AI: its own lines (the welcome message) are
 * labelled "Nexus", and replies the user pasted in from the external AI are
 * labelled "AI via Nexus".
 *
 * The AI's declarative components (from lastResponse) are rendered beneath the
 * message list by SchemaForm. Values the user enters are saved to UI state via
 * onUiStateChange and fed into the next generated prompt.
 */
export default function ConversationPanel({
  messages = [],
  onSend,
  lastResponse = null,
  uiState = {},
  onUiStateChange,
  isComplete = false,
  phase = "boundaries",
  checklist = [],
}) {
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current && typeof endRef.current.scrollIntoView === "function") {
      endRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages.length, lastResponse]);

  function submit() {
    const text = draft.trim();
    if (isComplete || !text) return;
    onSend?.(text);
    setDraft("");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <section
      className="panel conversation-panel"
      data-area="conversation"
      aria-label="Conversation"
    >
      <h2 className="panel-title">Conversation</h2>

      {!isComplete && (
        <div
          className={`phase-indicator phase-${phase === CONVERSATION_PHASE_CONTEXT ? "context" : "boundaries"}`}
          data-phase={phase}
          role="status"
        >
          {PHASE_LABELS[phase] ?? PHASE_LABELS.boundaries}
        </div>
      )}

      <ChecklistProgress checklist={checklist} />

      <div className="panel-body message-scroll">
        <ul className="message-list" aria-live="polite">
          {messages.map((message) => {
            const isUser = message.role === "user";
            const isNexus = isNexusMessage(message);
            const author = isUser ? "You" : isNexus ? "Nexus" : "AI via Nexus";
            const variant = isUser
              ? "message-user"
              : isNexus
                ? "message-assistant message-nexus"
                : "message-assistant message-ai";
            return (
              <li key={message.id} className={`message ${variant}`}>
                <span className="message-author">{author}</span>
                {message.content}
              </li>
            );
          })}
        </ul>
        <SchemaForm
          components={isComplete ? [] : (lastResponse?.components ?? [])}
          uiState={uiState}
          onChange={onUiStateChange}
        />
        <div ref={endRef} />
      </div>

      {isComplete && (
        <div className="conversation-complete-banner" role="status">
          This conversation is complete. Start a new session to continue.
        </div>
      )}

      <div className="chat-input chat-input-pinned">
        <textarea
          rows={2}
          value={draft}
          placeholder={isComplete ? "Conversation complete" : "Type your response..."}
          aria-label="Your message"
          disabled={isComplete}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          onClick={submit}
          disabled={isComplete || draft.trim() === ""}
        >
          Send
        </button>
      </div>
    </section>
  );
}