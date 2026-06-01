import type { ReactElement } from "react";
import { Box, Text } from "ink";

export interface SidebarHeaderProps {
  orchestraId: string;
  musicianCount: number;
  pendingCount: number;
}

export function SidebarHeader(props: SidebarHeaderProps): ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderBottom={true}
      paddingX={1}
    >
      <Text bold={true}>No Fluff Orchestra · {props.orchestraId}</Text>
      {props.pendingCount > 0 ? (
        <Text color="yellow">
          {props.musicianCount} musicians · {props.pendingCount} awaiting
          permission
        </Text>
      ) : (
        <Text dimColor={true}>
          {props.musicianCount} musicians · {props.pendingCount} awaiting
          permission
        </Text>
      )}
    </Box>
  );
}
