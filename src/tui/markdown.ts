import { render } from "markdansi";

export function renderMarkdownLines(markdown: string, width: number): string[] {
  const rendered = render(markdown, { wrap: true, width, color: true });
  return rendered.split("\n");
}
