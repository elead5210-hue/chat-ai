import React, { useEffect, useRef, useState } from "react";

const SECTION_LABELS = [
  ["instruction", "System instruction"],
  ["context", "Context"],
  ["availableComponents", "Available components"],
  ["responseSchema", "Response schema"],
];

/**
 * Copy text to the clipboard, falling back to a hidden textarea when the
 * async Clipboard API is unavailable (e.g. insecure contexts).
 */
async function copyText(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("Copy command was rejected");
}

/**
 * Shows the main sections of the generated prompt and a Copy Prompt button
 * that copies the full prompt text.
 *
 * Props:
 *   prompt              - full prompt text to copy
 *   sections            - { instruction, context, availableComponents, responseSchema, ... }
 *   instruction         - current (editable) instruction text
 *   onInstructionChange - (text) => void, called when the user edits the instruction
 *   onInstructionReset  - () => void, restores the default instruction
 */
export default function PromptPreview({
  prompt = "",
  sections = {},
  instruction = "",
  onInstructionChange,
  onInstructionReset,
}) {
  const [status, setStatus] = useState("");
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function showStatus(message) {
    setStatus(message);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(""), 2500);
  }

  async function handleCopy() {
    try {
      await copyText(prompt);
      showStatus("Prompt copied. Paste it into your AI.");
    } catch {
      showStatus("Could not copy automatically. Select the text and copy it manually.");
    }
  }

  return (
    <div className="prompt-preview">
      {SECTION_LABELS.map(([key, label], index) => (
        <React.Fragment key={key}>
          {index > 0 && <hr className="prompt-section-divider" />}
          <div className="prompt-section" data-section={key}>
            <h3 className="prompt-section-title">{label}</h3>
            {key === "instruction" && onInstructionChange ? (
              <>
                <textarea
                  className="instruction-editor"
                  rows={5}
                  value={instruction}
                  aria-label="System instruction"
                  onChange={(event) => onInstructionChange(event.target.value)}
                />
                {onInstructionReset && (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={onInstructionReset}
                    >
                      Reset instruction
                    </button>
                  </div>
                )}
              </>
            ) : (
              <pre>{sections[key] ?? ""}</pre>
            )}
          </div>
        </React.Fragment>
      ))}

      <div className="form-actions">
        <button type="button" onClick={handleCopy} disabled={!prompt}>
          Copy Prompt
        </button>
        <span className="copy-status" role="status" aria-live="polite">
          {status}
        </span>
      </div>
    </div>
  );
}