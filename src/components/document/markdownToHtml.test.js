import { describe, it, expect } from "vitest";
import { escapeHtml, markdownToHtml } from "./markdownToHtml.js";

describe("escapeHtml", () => {
  it("escapes the HTML special characters", () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;"
    );
  });

  it("converts non-strings to text", () => {
    expect(escapeHtml(42)).toBe("42");
  });
});

describe("markdownToHtml: empty input", () => {
  it.each([[""], ["   \n\t"], [null], [undefined], [42], [{}]])(
    "returns an empty string for %s",
    (value) => {
      expect(markdownToHtml(value)).toBe("");
    }
  );
});

describe("markdownToHtml: headings and paragraphs", () => {
  it("renders headings of each level", () => {
    for (let level = 1; level <= 6; level += 1) {
      const html = markdownToHtml(`${"#".repeat(level)} Title`);
      expect(html).toBe(`<h${level}>Title</h${level}>`);
    }
  });

  it("strips trailing hashes from a heading", () => {
    expect(markdownToHtml("## Title ##")).toBe("<h2>Title</h2>");
  });

  it("does not treat seven hashes as a heading", () => {
    expect(markdownToHtml("####### Nope")).toBe("<p>####### Nope</p>");
  });

  it("renders a paragraph", () => {
    expect(markdownToHtml("Hello world")).toBe("<p>Hello world</p>");
  });

  it("joins consecutive lines into one paragraph", () => {
    expect(markdownToHtml("One\nTwo")).toBe("<p>One Two</p>");
  });

  it("separates paragraphs at blank lines", () => {
    expect(markdownToHtml("One\n\nTwo")).toBe("<p>One</p>\n<p>Two</p>");
  });

  it("handles Windows line endings", () => {
    expect(markdownToHtml("# A\r\n\r\nText")).toBe("<h1>A</h1>\n<p>Text</p>");
  });

  it("ends a paragraph when a heading follows", () => {
    expect(markdownToHtml("Text\n# Head")).toBe("<p>Text</p>\n<h1>Head</h1>");
  });
});

describe("markdownToHtml: inline formatting", () => {
  it("renders bold with asterisks and underscores", () => {
    expect(markdownToHtml("**bold**")).toBe("<p><strong>bold</strong></p>");
    expect(markdownToHtml("__bold__")).toBe("<p><strong>bold</strong></p>");
  });

  it("renders italic", () => {
    expect(markdownToHtml("*it*")).toBe("<p><em>it</em></p>");
    expect(markdownToHtml("_it_")).toBe("<p><em>it</em></p>");
  });

  it("does not italicise underscores inside words", () => {
    expect(markdownToHtml("snake_case_name")).toBe("<p>snake_case_name</p>");
  });

  it("renders inline code and does not format inside it", () => {
    expect(markdownToHtml("Use `**not bold**` here")).toBe(
      "<p>Use <code>**not bold**</code> here</p>"
    );
  });

  it("escapes HTML inside inline code", () => {
    expect(markdownToHtml("`<b>`")).toBe("<p><code>&lt;b&gt;</code></p>");
  });

  it("renders links", () => {
    expect(markdownToHtml("[Site](https://example.com)")).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer">Site</a></p>'
    );
  });

  it("allows mailto and relative links", () => {
    expect(markdownToHtml("[Mail](mailto:a@b.com)")).toContain('href="mailto:a@b.com"');
    expect(markdownToHtml("[Doc](/docs/a)")).toContain('href="/docs/a"');
    expect(markdownToHtml("[Top](#top)")).toContain('href="#top"');
  });

  it("drops unsafe link schemes and keeps the label", () => {
    const html = markdownToHtml("[Click](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain("Click");
  });

  it("drops data: and vbscript: links", () => {
    expect(markdownToHtml("[x](data:text/html;base64,AAAA)")).not.toContain("<a");
    expect(markdownToHtml("[x](vbscript:run)")).not.toContain("<a");
  });

  it("keeps ampersands in link URLs escaped", () => {
    expect(markdownToHtml("[q](https://e.com/?a=1&b=2)")).toContain(
      'href="https://e.com/?a=1&amp;b=2"'
    );
  });
});

describe("markdownToHtml: HTML safety", () => {
  it("escapes raw HTML in paragraphs", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes raw HTML in headings, lists and tables", () => {
    expect(markdownToHtml("# <img src=x onerror=alert(1)>")).not.toContain("<img");
    expect(markdownToHtml("- <b>x</b>")).not.toContain("<b>");
    expect(markdownToHtml("| <i>h</i> |\n| --- |\n| <u>c</u> |")).not.toMatch(/<(i|u)>/);
  });

  it("cannot break out of a link attribute", () => {
    const html = markdownToHtml('[x](https://e.com/"onmouseover="alert(1))');
    expect(html).not.toMatch(/onmouseover="/);
  });

  it("escapes raw HTML in blockquotes", () => {
    expect(markdownToHtml("> <script>x</script>")).not.toContain("<script>");
  });
});

describe("markdownToHtml: code blocks", () => {
  it("renders a fenced code block verbatim and escaped", () => {
    const html = markdownToHtml("```js\nconst a = 1 < 2;\n# not a heading\n```");
    expect(html).toBe("<pre><code>const a = 1 &lt; 2;\n# not a heading</code></pre>");
  });

  it("closes an unterminated fence at the end of input", () => {
    expect(markdownToHtml("```\ncode")).toBe("<pre><code>code</code></pre>");
  });
});

describe("markdownToHtml: lists", () => {
  it("renders a bullet list", () => {
    expect(markdownToHtml("- One\n- Two\n- Three")).toBe(
      "<ul><li>One</li><li>Two</li><li>Three</li></ul>"
    );
  });

  it("accepts *, + and - markers", () => {
    expect(markdownToHtml("* A\n* B")).toBe("<ul><li>A</li><li>B</li></ul>");
    expect(markdownToHtml("+ A\n+ B")).toBe("<ul><li>A</li><li>B</li></ul>");
  });

  it("renders a numbered list", () => {
    expect(markdownToHtml("1. First\n2. Second")).toBe("<ol><li>First</li><li>Second</li></ol>");
    expect(markdownToHtml("1) First\n2) Second")).toBe("<ol><li>First</li><li>Second</li></ol>");
  });

  it("formats inline text inside list items", () => {
    expect(markdownToHtml("- **Bold** item")).toBe("<ul><li><strong>Bold</strong> item</li></ul>");
  });

  it("joins indented continuation lines to the previous item", () => {
    expect(markdownToHtml("- One\n  more\n- Two")).toBe(
      "<ul><li>One more</li><li>Two</li></ul>"
    );
  });

  it("starts a new list when the type changes", () => {
    expect(markdownToHtml("- A\n\n1. B")).toBe("<ul><li>A</li></ul>\n<ol><li>B</li></ol>");
  });
});

describe("markdownToHtml: blockquotes and rules", () => {
  it("renders a blockquote containing rendered Markdown", () => {
    expect(markdownToHtml("> Quote\n> more")).toBe("<blockquote><p>Quote more</p></blockquote>");
  });

  it("renders horizontal rules", () => {
    expect(markdownToHtml("---")).toBe("<hr />");
    expect(markdownToHtml("***")).toBe("<hr />");
    expect(markdownToHtml("___")).toBe("<hr />");
  });
});

describe("markdownToHtml: tables", () => {
  it("renders a pipe table", () => {
    const html = markdownToHtml("| Name | Qty |\n| --- | --- |\n| Apple | 2 |\n| Pear | 3 |");
    expect(html).toBe(
      "<table><thead><tr><th>Name</th><th>Qty</th></tr></thead><tbody>" +
        "<tr><td>Apple</td><td>2</td></tr><tr><td>Pear</td><td>3</td></tr></tbody></table>"
    );
  });

  it("renders a table without outer pipes and with alignment colons", () => {
    const html = markdownToHtml("A | B\n:-- | --:\n1 | 2");
    expect(html).toContain("<th>A</th><th>B</th>");
    expect(html).toContain("<td>1</td><td>2</td>");
  });

  it("formats inline text in cells", () => {
    expect(markdownToHtml("| H |\n| - |\n| **x** |")).toContain("<td><strong>x</strong></td>");
  });

  it("does not treat a line with a pipe but no separator as a table", () => {
    expect(markdownToHtml("a | b")).toBe("<p>a | b</p>");
  });
});

describe("markdownToHtml: whole document", () => {
  it("renders a mixed document in order", () => {
    const html = markdownToHtml(
      "# Plan\n\nIntro text.\n\n## Steps\n\n1. Book\n2. Pack\n\n- Note"
    );
    expect(html).toBe(
      "<h1>Plan</h1>\n<p>Intro text.</p>\n<h2>Steps</h2>\n<ol><li>Book</li><li>Pack</li></ol>\n<ul><li>Note</li></ul>"
    );
  });
});