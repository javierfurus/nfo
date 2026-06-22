import { memo, useEffect, useState, type ReactElement } from "react";
import { Box, Text } from "ink";
import type {
  EmbeddedTerminalLine,
  EmbeddedTerminalSnapshot,
  TerminalFeed,
} from "../embedded-terminal.js";
import { resolveSpanStyle } from "./OrchestratorPane.js";

export interface LazyGitDialogProps {
  feed: TerminalFeed | null;
  focused: boolean;
}

const LAZYGIT_LOADING_SNAPSHOT: EmbeddedTerminalSnapshot = {
  title: "lazygit",
  lines: [],
  connected: true,
};

// C4: memoized row component — unchanged rows bail out when line identity is stable (C3).
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

// C2: LazyGitDialog holds its own snapshot state and subscribes to the terminal feed.
// Wrapped in React.memo so chrome prop changes don't re-render this subtree, and internal
// snapshot updates don't propagate upward to App.
export const LazyGitDialog = memo(function LazyGitDialog(
  props: LazyGitDialogProps,
): ReactElement {
  const [snapshot, setSnapshot] = useState<EmbeddedTerminalSnapshot>(() => {
    return props.feed ? props.feed.snapshot() : LAZYGIT_LOADING_SNAPSHOT;
  });

  useEffect(() => {
    if (!props.feed) {
      setSnapshot(LAZYGIT_LOADING_SNAPSHOT);
      return;
    }
    return props.feed.onChange((s) => {
      setSnapshot(s);
    });
  }, [props.feed]);

  return (
    <Box flexGrow={1} flexDirection="column">
      {snapshot.lines.length > 0 ? (
        snapshot.lines.map((line, index) => {
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
        <Text dimColor={true}>Starting lazygit…</Text>
      )}
    </Box>
  );
});
