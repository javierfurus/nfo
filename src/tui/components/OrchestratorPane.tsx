import { memo, useEffect, useState, type ReactElement, type RefObject } from "react";
import { Box, Text, type DOMElement } from "ink";
import type {
  EmbeddedTerminalLine,
  EmbeddedTerminalSnapshot,
  EmbeddedTerminalSpan,
  TerminalFeed,
} from "../embedded-terminal.js";
import type { SelectionRange } from "../copy-mode.js";

export interface OrchestratorPaneProps {
  feed: TerminalFeed | null;
  activeMusicianName: string | null;
  errorMessage: string | null;
  focused: boolean;
  boxRef?: RefObject<DOMElement | null>;
  selection: SelectionRange | null;
  copyMode: boolean;
  terminalCols: number;
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

interface RowSelectionRange {
  startCol: number;
  endCol: number;
}

function getRowSelectionRange(
  rowIndex: number,
  selection: SelectionRange,
  terminalCols: number,
): RowSelectionRange | null {
  // Normalize anchor/focus to reading order (row-major).
  let startRow: number;
  let startCol: number;
  let endRow: number;
  let endCol: number;

  const { anchor, focus } = selection;
  if (
    anchor.row < focus.row
    || (anchor.row === focus.row && anchor.col <= focus.col)
  ) {
    startRow = anchor.row;
    startCol = anchor.col;
    endRow = focus.row;
    endCol = focus.col;
  } else {
    startRow = focus.row;
    startCol = focus.col;
    endRow = anchor.row;
    endCol = anchor.col;
  }

  if (rowIndex < startRow || rowIndex > endRow) {
    return null;
  }

  if (startRow === endRow) {
    return { startCol, endCol };
  }

  if (rowIndex === startRow) {
    return { startCol, endCol: terminalCols - 1 };
  }

  if (rowIndex === endRow) {
    return { startCol: 0, endCol };
  }

  return { startCol: 0, endCol: terminalCols - 1 };
}

interface RenderSpan {
  key: string;
  text: string;
  style: Omit<EmbeddedTerminalSpan, "text" | "cursor">;
}

function buildRenderSpans(
  line: EmbeddedTerminalLine,
  rowIndex: number,
  focused: boolean,
  selRange: RowSelectionRange | null,
): RenderSpan[] {
  const spans: RenderSpan[] = [];
  let colOffset = 0;
  let fragmentIndex = 0;

  for (const span of line.spans) {
    const baseStyle = resolveSpanStyle(span, focused);
    const spanStart = colOffset;
    const spanEnd = colOffset + span.text.length - 1;

    if (
      !selRange
      || spanEnd < selRange.startCol
      || spanStart > selRange.endCol
    ) {
      spans.push({
        key: `${rowIndex}:${fragmentIndex}`,
        text: span.text,
        style: baseStyle,
      });
      fragmentIndex += 1;
    } else {
      const intStart = Math.max(spanStart, selRange.startCol);
      const intEnd = Math.min(spanEnd, selRange.endCol);

      // Segment before the selection highlight.
      if (intStart > spanStart) {
        spans.push({
          key: `${rowIndex}:${fragmentIndex}`,
          text: span.text.slice(0, intStart - spanStart),
          style: baseStyle,
        });
        fragmentIndex += 1;
      }

      // Highlighted segment (inverse video).
      spans.push({
        key: `${rowIndex}:${fragmentIndex}`,
        text: span.text.slice(intStart - spanStart, intEnd - spanStart + 1),
        style: { ...baseStyle, inverse: true },
      });
      fragmentIndex += 1;

      // Segment after the selection highlight.
      if (intEnd < spanEnd) {
        spans.push({
          key: `${rowIndex}:${fragmentIndex}`,
          text: span.text.slice(intEnd - spanStart + 1),
          style: baseStyle,
        });
        fragmentIndex += 1;
      }
    }

    colOffset += span.text.length;
  }

  return spans;
}

// C4: memoized row component — when the line object has stable identity (C3),
// React.memo bails out of reconciliation for unchanged rows.
interface RowProps {
  line: EmbeddedTerminalLine;
  rowIndex: number;
  focused: boolean;
  selectionRange: RowSelectionRange | null;
}

const Row = memo(function Row({
  line,
  rowIndex,
  focused,
  selectionRange,
}: RowProps): ReactElement {
  const renderSpans = buildRenderSpans(line, rowIndex, focused, selectionRange);

  return (
    <Text wrap="truncate-end">
      {renderSpans.length > 0
        ? renderSpans.map((rs) => {
            return (
              <Text
                key={rs.key}
                color={rs.style.color}
                backgroundColor={rs.style.backgroundColor}
                dimColor={rs.style.dimColor}
                bold={rs.style.bold}
                italic={rs.style.italic}
                underline={rs.style.underline}
                strikethrough={rs.style.strikethrough}
                inverse={rs.style.inverse}
              >
                {rs.text}
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

  const headerText = props.copyMode
    ? "COPY MODE — drag to select · Ctrl+Y/Esc to exit"
    : title;

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
      <Text bold={true}>{headerText}</Text>
      <Box flexDirection="column" flexGrow={1}>
        {displayLines.length > 0 ? (
          displayLines.map((line, index) => {
            const rowSelRange = props.selection
              ? getRowSelectionRange(index, props.selection, props.terminalCols)
              : null;
            return (
              <Row
                key={String(index)}
                line={line}
                rowIndex={index}
                focused={props.focused}
                selectionRange={rowSelRange}
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
