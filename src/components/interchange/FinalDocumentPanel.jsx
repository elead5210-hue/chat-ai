import React, { useState } from "react";
import DocumentPreview from "../document/DocumentPreview.jsx";

/**
 * Final step of a completed conversation.
 *
 * Step 1: copy the final prompt into the external AI, which returns the
 *         finished document as Markdown.
 * Step 2: paste that Markdown below. It is rendered as a document that can be
 *         printed or saved as a PDF.
 *
 * Props:
 *   finalPrompt      - full text of the final prompt to copy
 *   documentMarkdown - the Markdown document that has been pasted in ("" if none)
 *   onSubmitDocument - (markdown) => boolean, true when the document was accepted
 *   onClearDocument  - () => void, discards the document so another can be pasted
 */
export default function FinalDocumentPanel({
  finalPrompt = "",
  documentMarkdown = "",
  onSubmitDocument,
  onClearDocument,
}) {
  const [draft, setDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [error, setError] = useState("");

  const hasDocument =
    typeof documentMarkdown === "string" && documentMarkdown.trim() !== "";

  async function copyPrompt() {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(finalPrompt);
        setCopyStatus("Copied");
      } else {
        setCopyStatus("Copy is not available. Select the text and copy it manually.");
      }
    } catch {
      setCopyStatus("Copy failed. Select the text and copy it manually.");
    }
  }

  function submit() {
    if (draft.trim() === "") {
      setError("Paste the Markdown document returned by the AI.");
      return;
    }
    const accepted = onSubmitDocument ? onSubmitDocument(draft) : false;
    if (accepted === false) {
      setError("The document could not be accepted. Check the pasted text and try again.");
      return;
    }
    setError("");
    setDraft("");
  }

  function clear() {
    setError("");
    setCopyStatus("");
    onClearDocument?.();
  }

  return (
    <section className="final-document-panel no-print" aria-label="Final document">
      <p className="interchange-explainer">
        The conversation is complete. Copy the final prompt into your AI, then paste the
        Markdown document it returns below to view, print or save it as a PDF.
      </p>

      <div className="prompt-section">
        <h3 className="prompt-section-title">Step 1: Final prompt</h3>
        <pre className="prompt-output" aria-label="Final prompt">
          {finalPrompt}
        </pre>
        <div className="form-actions">
          <button type="button" onClick={copyPrompt}>
            Copy Final Prompt
          </button>
          <span className="copy-status" role="status">
            {copyStatus}
          </span>
        </div>
      </div>

      <hr className="interchange-divider" />

      {hasDocument ? (
        <div className="final-document-done">
          <h3 className="prompt-section-title">Step 2: Your document</h3>
          <p className="copy-status">
            The document is shown below. Use Save as PDF / Print to keep it.
          </p>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={clear}>
              Paste a different document
            </button>
          </div>
        </div>
      ) : (
        <div className="response-paste">
          <h3 className="prompt-section-title">Step 2: Paste the Markdown document</h3>
          <textarea
            value={draft}
            placeholder="Paste the Markdown (.md) document returned by the AI..."
            aria-label="Markdown document"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="form-actions">
            <button type="button" onClick={submit} disabled={draft.trim() === ""}>
              Render Document
            </button>
          </div>
          {error && (
            <ul className="error-list" role="alert">
              <li>{error}</li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Convenience export so callers can render the finished document itself
 * (the printable page) separately from the interchange controls.
 */
export function FinalDocumentView({ documentMarkdown = "", onClear }) {
  return <DocumentPreview markdown={documentMarkdown} onClear={onClear} />;
}