import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type {
  EmbeddedTerminalLine,
  EmbeddedTerminalSpan,
} from "../embedded-terminal.js";

export interface OrchestratorPaneProps {
  title: string;
  lines: EmbeddedTerminalLine[];
  focused: boolean;
  connected: boolean;
}

export function resolveSpanStyle(
  span: EmbeddedTerminalSpan,
  focused: boolean,
): Omit<EmbeddedTerminalSpan, "text" | "cursor"> {
  const style: Omit<EmbeddedTerminalSpan, "text" | "cursor"> = {
    color: span.color,
    backgroundColor: span.backgroundColor,
    dimColor: span.dimColor,
    bold: span.bold,
    italic: span.italic,
    underline: span.underline,
    strikethrough: span.strikethrough,
    inverse: span.inverse,
  };
  if (span.cursor === true && focused) {
    style.color = "black";
    style.backgroundColor = "white";
    style.inverse = false;
  }
  return style;
}

function renderSpan(
  span: EmbeddedTerminalSpan,
  index: number,
  focused: boolean,
): ReactElement {
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

export function OrchestratorPane(props: OrchestratorPaneProps): ReactElement {
  return (
    <Box
      flexGrow={1}
      flexDirection="column"
      borderStyle="single"
      marginRight={1}
      minHeight={16}
      paddingX={1}
    >
      <Text bold={true}>{props.title}</Text>
      <Box flexDirection="column" flexGrow={1}>
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
          <Text dimColor={true}>Waiting for Claude terminal…</Text>
        )}
      </Box>
      <Text color={props.focused ? "cyan" : "gray"} wrap="truncate-end">
        {props.focused
          ? "[Ctrl+g] sidebar · [Mouse wheel] scroll"
          : "[Ctrl+g] focus left terminal"}
      </Text>
      {!props.connected ? (
        <Text color="yellow">Embedded tmux client disconnected.</Text>
      ) : null}
    </Box>
  );
}
