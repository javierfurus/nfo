import { memo, useEffect, useState, type ReactElement, type RefObject } from "react";
import { Box, Text, type DOMElement } from "ink";
import type {
  EmbeddedTerminalLine,
  EmbeddedTerminalSnapshot,
  EmbeddedTerminalSpan,
  TerminalFeed,
} from "../embedded-terminal.js";

export interface OrchestratorPaneProps {
  feed: TerminalFeed | null;
  activeMusicianName: string | null;
  errorMessage: string | null;
  focused: boolean;
  boxRef?: RefObject<DOMElement | null>;
}

const LOADING_SNAPSHOT: EmbeddedTerminalSnapshot = {
  title: "Claude",
  lines: [{ spans: [{ text: "Starting embedded Claude terminal…" }] }],
  connected: true,
};

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

// C4: memoized row component — when the line object has stable identity (C3),
// React.memo bails out of reconciliation for unchanged rows.
interface RowProps {
  line: EmbeddedTerminalLine;
  rowIndex: number;
  focused: boolean;
}

const Row = memo(function Row({ line, rowIndex, focused }: RowProps): ReactElement {
  return (
    <Text wrap="truncate-end">
      {line.spans.length > 0
        ? line.spans.map((span, spanIndex) => {
            const style = resolveSpanStyle(span, focused);
            return (
              <Text
                key={`${rowIndex}:${spanIndex}`}
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
          })
        : " "}
    </Text>
  );
});

// C2: OrchestratorPane holds its own snapshot state and subscribes to the terminal feed.
// Wrapped in React.memo so chrome prop changes don't cause re-renders here, and internal
// snapshot updates don't propagate upward.
export const OrchestratorPane = memo(function OrchestratorPane(
  props: OrchestratorPaneProps,
): ReactElement {
  const [snapshot, setSnapshot] = useState<EmbeddedTerminalSnapshot>(() => {
    return props.feed ? props.feed.snapshot() : LOADING_SNAPSHOT;
  });

  useEffect(() => {
    if (!props.feed) {
      setSnapshot(LOADING_SNAPSHOT);
      return;
    }
    return props.feed.onChange((s) => {
      setSnapshot(s);
    });
  }, [props.feed]);

  // Error message overrides terminal content when set.
  const displayLines: EmbeddedTerminalLine[] = props.errorMessage !== null
    ? [{ spans: [{ text: props.errorMessage }] }]
    : snapshot.lines;
  const displayConnected = props.errorMessage !== null ? false : snapshot.connected;

  const title = props.activeMusicianName !== null
    ? `Musician · ${props.activeMusicianName}`
    : `Orchestrator · ${snapshot.title}`;

  return (
    <Box
      ref={props.boxRef}
      flexGrow={1}
      flexDirection="column"
      borderStyle="single"
      marginRight={1}
      minHeight={16}
      paddingX={1}
    >
      <Text bold={true}>{title}</Text>
      <Box flexDirection="column" flexGrow={1}>
        {displayLines.length > 0 ? (
          displayLines.map((line, index) => {
            return (
              <Row
                key={String(index)}
                line={line}
                rowIndex={index}
                focused={props.focused}
              />
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
      {!displayConnected ? (
        <Text color="yellow">Embedded tmux client disconnected.</Text>
      ) : null}
    </Box>
  );
});
