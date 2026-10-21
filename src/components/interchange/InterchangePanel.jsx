import React, { useState } from "react";
import PromptPreview from "./PromptPreview.jsx";
import ContextPackagePanel from "./ContextPackagePanel.jsx";
import ResponsePaste from "./ResponsePaste.jsx";

/**
 * Right-hand "AI interchange" panel.
 *
 * Nexus is the interface between the user and their AI, not the AI itself: it
 * builds the prompt and checks the reply, and the answer comes from whichever
 * AI the user pastes the prompt into. A short explainer at the top says so.
 *
 * Top section: the generated prompt (instruction, context, schema) with a
 * Copy Prompt button, to be pasted into any external AI. On narrow screens
 * this section can be collapsed to leave room for the response field.
 * Bottom section: a paste area for the JSON the external AI returns.
 *
 * Props supplied by App.jsx:
 *   prompt           - full prompt text to copy
 *   promptSections   - { instruction, context, conversation, uiState,
 *                        availableComponents, responseSchema }
 *   contextPackage      - compact Context Package text for moving to another AI
 *   contextFingerprint  - id of the current context version, e.g. "CTX-7F92A1"
 *   contextVersion      - the current context snapshot's version number
 *   continuationPrompt  - full prompt that hands the conversation to a new AI
 *   instruction         - current (editable) instruction text
 *   onInstructionChange - (text) => void, called when the user edits the instruction
 *   onInstructionReset  - () => void, restores the default instruction
 *   onSubmitResponse - (rawText) => boolean (true when the response was accepted)
 *   validationErrors - string[] describing why the last paste was rejected
 */
export default function InterchangePanel({
  prompt = "",
  promptSections = {},
  contextPackage = "",
  contextFingerprint = "",
  contextVersion = null,
  continuationPrompt = "",
  instruction = "",
  onInstructionChange,
  onInstructionReset,
  onSubmitResponse,
  validationErrors = [],
}) {
  const [promptOpen, setPromptOpen] = useState(true);

  return (
    <section
      className="panel interchange-panel"
      data-area="interchange"
      aria-label="AI interchange"
    >
      <h2 className="panel-title">Nexus ↔ Your AI</h2>

      <div className="panel-body">
        <p className="interchange-explainer">
          Nexus builds the prompt and checks the reply. The answers come from your own AI: copy
          the prompt into it, then paste its JSON response below.
        </p>

        <div className="prompt-toggle">
          <button
            type="button"
            className="secondary"
            aria-expanded={promptOpen}
            aria-controls="prompt-preview-region"
            onClick={() => setPromptOpen((current) => !current)}
          >
            {promptOpen ? "Hide prompt" : "Show prompt"}
          </button>
        </div>

        <div id="prompt-preview-region" hidden={!promptOpen}>
          <PromptPreview
            prompt={prompt}
            sections={promptSections}
            instruction={instruction}
            onInstructionChange={onInstructionChange}
            onInstructionReset={onInstructionReset}
          />
        </div>

        <hr className="interchange-divider" />

        <ContextPackagePanel
          contextPackage={contextPackage}
          contextFingerprint={contextFingerprint}
          contextVersion={contextVersion}
          continuationPrompt={continuationPrompt}
        />

        <hr className="interchange-divider" />

        <ResponsePaste onSubmit={onSubmitResponse} errors={validationErrors} />
      </div>
    </section>
  );
}