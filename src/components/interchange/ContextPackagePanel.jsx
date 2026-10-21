import React, { useEffect, useRef, useState } from "react";

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
 * Shows the compact Context Package and lets the user copy it, so a
 * conversation can move to another AI without copying the whole transcript.
 *
 * Props:
 *   contextPackage     - compact Context Package text
 *   continuationPrompt - full prompt that hands the conversation to a new AI
 *                        (context package + response schema). Optional.
 *   contextFingerprint - id of this exact context version, e.g. "CTX-7F92A1".
 *                        Shown as a badge and named in the copy feedback so the
 *                        user can confirm two AIs hold the same snapshot. Optional.
 *   contextVersion     - the snapshot's version number. Optional.
 */
export default function ContextPackagePanel({
  contextPackage = "",
  continuationPrompt = "",
  contextFingerprint = "",
  contextVersion = null,
}) {
  const [status, setStatus] = useState("");
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function showStatus(message) {
    setStatus(message);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setStatus(""), 2500);
  }

  async function handleCopy(text, successMessage) {
    try {
      await copyText(text);
      showStatus(successMessage);
    } catch {
      showStatus("Could not copy automatically. Select the text and copy it manually.");
    }
  }

  const hasVersion = Number.isInteger(contextVersion);
  const identityParts = [contextFingerprint, hasVersion ? `version ${contextVersion}` : ""].filter(Boolean);
  // e.g. " (CTX-7F92A1, version 3)" - appended to the copy feedback.
  const copiedLabel = identityParts.length > 0 ? ` (${identityParts.join(", ")})` : "";

  return (
    <div className="context-package" data-section="context-package">
      <h3 className="prompt-section-title">Context package</h3>
      {(contextFingerprint || hasVersion) && (
        <div className="context-fingerprint" role="group" aria-label="Context version">
          {contextFingerprint && (
            <span className="context-fingerprint-id" title="Identifies this exact context snapshot">
              {contextFingerprint}
            </span>
          )}
          {hasVersion && (
            <span className="context-fingerprint-version">Version {contextVersion}</span>
          )}
        </div>
      )}
      <pre className="context-package-text">{contextPackage}</pre>

      <div className="form-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => handleCopy(contextPackage, `Context package copied${copiedLabel}.`)}
          disabled={!contextPackage}
        >
          Copy Context Package
        </button>
        {continuationPrompt && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              handleCopy(
                continuationPrompt,
                `Continuation prompt copied${copiedLabel}. Paste it into a new AI.`
              )
            }
          >
            Copy Continuation Prompt
          </button>
        )}
        <span className="copy-status" role="status" aria-live="polite">
          {status}
        </span>
      </div>
    </div>
  );
}