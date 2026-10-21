import React, { useState } from "react";

// The part of an error that names the protocol field: either a quoted name
// such as "protocol", or an indexed path such as context_updates[0].value.
const FIELD_PREFIX = /^("[^"\s]+"|[a-z_]+\[\d+\](?:\.[a-z_]+|\[\d+\])*)/;

function splitError(error) {
  const match = FIELD_PREFIX.exec(error);
  if (!match) return { field: null, rest: error };
  return { field: match[0], rest: error.slice(match[0].length) };
}

/**
 * Paste area for the JSON returned by an external AI.
 *
 * Props:
 *   onSubmit - (rawText) => boolean. Returns true when the response was
 *              accepted, in which case the textarea is cleared.
 *   errors   - string[] describing why the last paste was rejected
 */
export default function ResponsePaste({ onSubmit, errors = [] }) {
  const [text, setText] = useState("");

  function handleSubmit() {
    if (text.trim() === "") return;
    const accepted = onSubmit?.(text);
    if (accepted) setText("");
  }

  function handleClear() {
    setText("");
  }

  const hasErrors = errors.length > 0;

  return (
    <div className="response-paste">
      <h3 className="prompt-section-title">AI response</h3>

      <textarea
        value={text}
        placeholder="Paste the JSON response from your AI here..."
        aria-label="AI response JSON"
        aria-invalid={hasErrors}
        aria-describedby={hasErrors ? "response-errors" : undefined}
        spellCheck={false}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="form-actions">
        <button type="button" onClick={handleSubmit} disabled={text.trim() === ""}>
          Submit Response
        </button>
        <button
          type="button"
          className="secondary"
          onClick={handleClear}
          disabled={text === ""}
        >
          Clear
        </button>
      </div>

      {hasErrors && (
        <div id="response-errors" role="alert">
          <p className="error-summary">
            {errors.length === 1 ? "1 problem" : `${errors.length} problems`} found. Fix the
            JSON, or ask the AI to correct it, then paste it again.
          </p>
          <ul className="error-list">
            {errors.map((error, index) => {
              const { field, rest } = splitError(error);
              return (
                <li key={index}>
                  {field ? (
                    <>
                      <code className="error-field">{field}</code>
                      {rest}
                    </>
                  ) : (
                    error
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}