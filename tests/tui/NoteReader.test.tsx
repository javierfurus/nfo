import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { NoteReader } from "../../src/tui/components/NoteReader.js";
import { renderMarkdownLines } from "../../src/tui/markdown.js";

const FILES = ["readme.md"];

describe("NoteReader content mode", () => {
  it("renders pre-rendered markdown lines without leaking raw markdown syntax", () => {
    const markdown = "# Hello World\n\nSome **bold** text.";
    const renderedLines = renderMarkdownLines(markdown, 80);
    const { lastFrame } = render(
      <NoteReader
        mode="content"
        files={FILES}
        selectedFileIndex={0}
        fileContent={markdown}
        scrollOffset={0}
        renderedLines={renderedLines}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("# Hello World");
    expect(frame).toContain("Hello World");
  });

  it("shows scroll position in the status bar", () => {
    const lines = Array.from({ length: 30 }, (_, i) => String(i + 1));
    const { lastFrame } = render(
      <NoteReader
        mode="content"
        files={FILES}
        selectedFileIndex={0}
        fileContent=""
        scrollOffset={5}
        renderedLines={lines}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("6–");
    expect(frame).toContain("30");
  });

  it("falls back to fileContent.split when renderedLines is undefined", () => {
    const { lastFrame } = render(
      <NoteReader
        mode="content"
        files={FILES}
        selectedFileIndex={0}
        fileContent={"line one\nline two"}
        scrollOffset={0}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("line one");
    expect(frame).toContain("line two");
  });
});

describe("NoteReader list mode", () => {
  it("renders file list unchanged", () => {
    const { lastFrame } = render(
      <NoteReader
        mode="list"
        files={["notes/alpha.md", "notes/beta.md"]}
        selectedFileIndex={0}
        fileContent=""
        scrollOffset={0}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("alpha.md");
    expect(frame).toContain("beta.md");
  });
});

describe("renderMarkdownLines code block highlighting", () => {
  it("applies 24-bit ANSI color escapes to a supported fenced code block", () => {
    const markdown = "```ts\nconst x: number = 1;\n```";
    const rendered = renderMarkdownLines(markdown, 80).join("\n");
    expect(rendered).toContain("\x1b[38;2;");
  });

  it("does not throw for an unsupported language and still renders the code", () => {
    const markdown = "```python\nprint('hi')\n```";
    let rendered: string[] = [];
    expect(() => {
      rendered = renderMarkdownLines(markdown, 80);
    }).not.toThrow();
    expect(rendered.join("\n")).toContain("print('hi')");
  });

  it("does not throw for a plain fenced block with no language and still renders the code", () => {
    const markdown = "```\nplain code\n```";
    let rendered: string[] = [];
    expect(() => {
      rendered = renderMarkdownLines(markdown, 80);
    }).not.toThrow();
    expect(rendered.join("\n")).toContain("plain code");
  });
});
