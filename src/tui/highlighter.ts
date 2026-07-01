import { createHighlighterCoreSync } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import githubDark from "@shikijs/themes/github-dark";
import bash from "@shikijs/langs/bash";
import diff from "@shikijs/langs/diff";
import javascript from "@shikijs/langs/javascript";
import json from "@shikijs/langs/json";
import markdown from "@shikijs/langs/markdown";
import tsx from "@shikijs/langs/tsx";
import typescript from "@shikijs/langs/typescript";

const LANG_GROUPS = [bash, diff, javascript, json, markdown, tsx, typescript];

const highlighter = createHighlighterCoreSync({
  engine: createJavaScriptRegexEngine(),
  themes: [githubDark],
  langs: LANG_GROUPS,
});

type ThemedToken = ReturnType<typeof highlighter.codeToTokens>["tokens"][number][number];

const LOADED_LANGS = new Set<string>();
for (const group of LANG_GROUPS) {
  for (const lang of group) {
    LOADED_LANGS.add(lang.name);
    for (const alias of lang.aliases ?? []) {
      LOADED_LANGS.add(alias);
    }
  }
}

function colorizeToken(token: ThemedToken): string {
  if (!token.color) {
    return token.content;
  }
  const hex = token.color;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `[38;2;${r};${g};${b}m${token.content}[39m`;
}

/**
 * Synchronous ANSI syntax highlighter for markdansi's `highlighter` render option.
 * Falls back to the raw code for unloaded/unknown languages so unsupported fences never throw.
 */
export function highlightCode(code: string, lang?: string): string {
  if (!lang) {
    return code;
  }
  const normalized = lang.toLowerCase();
  if (!LOADED_LANGS.has(normalized)) {
    return code;
  }
  try {
    const { tokens } = highlighter.codeToTokens(code, { lang: normalized, theme: "github-dark" });
    return tokens.map((line) => line.map(colorizeToken).join("")).join("\n");
  } catch {
    return code;
  }
}
