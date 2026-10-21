
/**
 * Minimal, dependency-free Markdown to HTML renderer.
 *
 * Safety: all source text is HTML-escaped before any markup is built, so raw
 * HTML in the Markdown is shown as text and never executed. Links only allow
 * http, https, mailto and relative targets.
 *
 * Supported: headings (#..######), paragraphs, bold, italic, inline code,
 * fenced code blocks, links, blockquotes, horizontal rules, bullet and
 * numbered lists, and pipe tables.
 */

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function isSafeUrl(url) {
  const trimmed = url.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return true;
  // Relative or anchor links only: reject anything with another scheme.
  return !/^[a-z][a-z0-9+.-]*:/i.test(trimmed);
}

/** Inline formatting. The input must already be HTML-escaped. */
function renderInline(escaped) {
  const codeSpans = [];
  let text = escaped.replace(/`([^`]+)`/g, (_match, code) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    // The url is escaped already, so &amp; etc. are fine inside the attribute.
    const raw = url.replace(/&amp;/g, "&");
    if (!isSafeUrl(raw)) return label;
    return `<a href="${url}" rel="noopener noreferrer">${label}</a>`;
  });

  text = text.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (_m, a, b) => `<strong>${a ?? b}</strong>`);
  text = text.replace(/\*([^*\s][^*]*)\*|(?<![A-Za-z0-9])_([^_\s][^_]*)_(?![A-Za-z0-9])/g, (_m, a, b) => `<em>${a ?? b}</em>`);

  return text.replace(/\u0000(\d+)\u0000/g, (_m, index) => codeSpans[Number(index)]);
}

function inline(raw) {
  return renderInline(escapeHtml(raw));
}

function splitTableRow(line) {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  return /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line) && line.includes("-");
}

function isTableStart(lines, index) {
  return (
    index + 1 < lines.length &&
    lines[index].includes("|") &&
    isTableSeparator(lines[index + 1])
  );
}

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;

function isBlockStart(lines, index) {
  const line = lines[index];
  return (
    HEADING.test(line) ||
    FENCE.test(line) ||
    RULE.test(line) ||
    BULLET.test(line) ||
    NUMBERED.test(line) ||
    /^\s*>/.test(line) ||
    isTableStart(lines, index)
  );
}

/**
 * Convert Markdown text to an HTML string.
 * Returns "" for non-string or blank input.
 */
export function markdownToHtml(markdown) {
  if (typeof markdown !== "string" || markdown.trim() === "") return "";

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i += 1;
      continue;
    }

    // Fenced code block.
    if (FENCE.test(line)) {
      const code = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or end of input)
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      out.push("<hr />");
      i += 1;
      continue;
    }

    // Blockquote.
    if (/^\s*>/.test(line)) {
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoted.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      out.push(`<blockquote>${markdownToHtml(quoted.join("\n"))}</blockquote>`);
      continue;
    }

    // Table.
    if (isTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() !== "" && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const head = header.map((cell) => `<th>${inline(cell)}</th>`).join("");
      const body = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
        .join("");
      out.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    // Lists (one level; continuation lines are joined to the previous item).
    const isBullet = BULLET.test(line);
    if (isBullet || NUMBERED.test(line)) {
      const pattern = isBullet ? BULLET : NUMBERED;
      const tag = isBullet ? "ul" : "ol";
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(lines[i].match(pattern)[1]);
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() !== "" &&
          /^\s{2,}\S/.test(lines[i]) &&
          !pattern.test(lines[i])
        ) {
          items[items.length - 1] += ` ${lines[i].trim()}`;
          i += 1;
        }
      }
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join("")}</${tag}>`);
      continue;
    }

    // Paragraph: consecutive lines until a blank line or another block.
    const paragraph = [];
    while (i < lines.length && lines[i].trim() !== "" && (paragraph.length === 0 || !isBlockStart(lines, i))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }

  return out.join("\n");
}