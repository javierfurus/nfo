import type { ReactElement } from "react";
import { Box, Text } from "ink";

export interface StatusBarProps {
  permissionLevel: string;
  tokenHint: string;
  pendingCount: number;
  dismissConfirmation?: string | null;
  orchestratorFocused: boolean;
  lazygitInstalled?: boolean;
}

export function StatusBar(props: StatusBarProps): ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={true}
      paddingX={1}
    >
      {props.pendingCount > 0 ? (
        <Text color="yellow">
          ⚠ {props.pendingCount} awaiting permission · [p] jump to next
        </Text>
      ) : null}
      {props.dismissConfirmation ? (
        <Text color="red">{props.dismissConfirmation}</Text>
      ) : null}
      <Text>
        {props.permissionLevel} · {props.tokenHint}
      </Text>
      {props.orchestratorFocused ? (
        <Text dimColor={true}>[type] active terminal [Ctrl+g] sidebar</Text>
      ) : (
        <Text dimColor={true}>
          [↑↓] nav [⏎] open left pane [d] dismiss [p] pending [n] notes{props.lazygitInstalled === true ? " [g] lazygit" : ""} [Ctrl+g]
          terminal
        </Text>
      )}
      <Text dimColor={true}>[q] detach [?] help</Text>
    </Box>
  );
}
