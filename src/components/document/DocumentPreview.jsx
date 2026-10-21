import React, { useMemo } from "react";
import { markdownToHtml } from "./markdownToHtml.js";

/**
 * Renders a Markdown document as a formatted page, with buttons to print it or
 * save it as a PDF (the browser's print dialog offers "Save as PDF").
 *
 * Props:
 *   markdown - the Markdown text to render
 *   onClear  - () => void, optional; discards the document so a new one can be pasted
 *
 * The HTML comes from markdownToHtml, which escapes any raw HTML in the source
 * before building markup, so it is safe to inject here.
 *
 * Printing: the document lives inside an element with the "document-preview"
 * class. The print styles in app.css hide everything else on the page.
 */
export default function DocumentPreview({ markdown = "", onClear }) {
  const html = useMemo(() => markdownToHtml(markdown), [markdown]);

  if (typeof markdown !== "string" || markdown.trim() === "") {
    return null;
  }

  function handlePrint() {
    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  }

  return (
    <section
      className="document-preview"
      data-area="document"
      aria-label="Final document"
    >
      <div className="document-actions no-print">
        <button type="button" onClick={handlePrint}>
          Save as PDF / Print
        </button>
        {onClear && (
          <button type="button" className="secondary" onClick={onClear}>
            Discard document
          </button>
        )}
      </div>

      <article
        className="document-body"
        // Safe: markdownToHtml escapes raw HTML in the source.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </section>
  );
}