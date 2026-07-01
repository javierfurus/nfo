import { render } from "markdansi";
import { highlightCode } from "./highlighter.js";

export function renderMarkdownLines(markdown: string, width: number): string[] {
  const rendered = render(markdown, { wrap: true, width, color: true, highlighter: highlightCode });
  return rendered.split("\n");
}
