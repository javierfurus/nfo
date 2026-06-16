import type { ReactElement } from "react";
import { Box, Text } from "ink";

interface Row {
  key: string;
  label: string;
}

const ROWS: Row[] = [
  { key: "↑ / k", label: "move selection up" },
  { key: "↓ / j", label: "move selection down" },
  { key: "Enter", label: "open the selected target in the left pane" },
  { key: "n", label: "open notes for this orchestra" },
  { key: "g", label: "open lazygit (if installed)" },
  {
    key: "d",
    label:
      "arm dismiss for selected Musician (press d again / y / Enter to confirm)",
  },
  { key: "n / Esc", label: "cancel pending dismiss confirmation" },
  { key: "p", label: "jump to next Musician awaiting permission" },
  {
    key: "q",
    label:
      "detach — leaves orchestrator + musicians running; use `nfo kill` to stop",
  },
  {
    key: "Ctrl+g",
    label: "switch focus between the sidebar and the embedded Claude terminal",
  },
  {
    key: "typed keys",
    label:
      "go directly to the currently open tmux terminal while the left pane is focused",
  },
  {
    key: "Alt+Enter / Shift+Enter / Ctrl+J",
    label:
      "insert a newline in the focused terminal without treating it like Enter",
  },
  {
    key: "Mouse wheel",
    label:
      "scroll the left terminal through local scrollback when the pointer is over that pane",
  },
  { key: "?", label: "toggle this help / close" },
];

export function Help(): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold={true}>Keybindings</Text>
      {ROWS.map((row) => {
        return (
          <Text key={row.key}>
            <Text color="cyan">{row.key.padEnd(8)}</Text>
            <Text> {row.label}</Text>
          </Text>
        );
      })}
      <Text dimColor={true}>Press ? to close.</Text>
    </Box>
  );
}
