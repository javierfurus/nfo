import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { EmbeddedTerminalLine, EmbeddedTerminalSpan } from "../embedded-terminal.js";
import { resolveSpanStyle } from "./OrchestratorPane.js";

export interface LazyGitDialogProps {
  lines: EmbeddedTerminalLine[];
  focused: boolean;
}

function renderSpan(span: EmbeddedTerminalSpan, index: number, focused: boolean): ReactElement {
  const style = resolveSpanStyle(span, focused);
  return (
    <Text
      key={`${index}:${span.text}`}
      color={style.color}
      backgroundColor={style.backgroundColor}
      dimColor={style.dimColor}
      bold={style.bold}
      italic={style.italic}
      underline={style.underline}
      strikethrough={style.strikethrough}
      inverse={style.inverse}
    >
      {span.text}
    </Text>
  );
}

export function LazyGitDialog(props: LazyGitDialogProps): ReactElement {
  return (
    <Box flexGrow={1} flexDirection="column">
      {props.lines.length > 0 ? (
        props.lines.map((line, index) => {
          return (
            <Text key={String(index)} wrap="truncate-end">
              {line.spans.length > 0
                ? line.spans.map((span, spanIndex) =>
                    renderSpan(span, spanIndex, props.focused),
                  )
                : " "}
            </Text>
          );
        })
      ) : (
        <Text dimColor={true}>Starting lazygit…</Text>
      )}
    </Box>
  );
}
