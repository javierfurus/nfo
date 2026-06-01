import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { OrchestraSummary } from "../commands/list.js";

export interface ConcertHallProps {
  orchestras: OrchestraSummary[];
  currentId: string;
}

export function ConcertHall(props: ConcertHallProps): ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderBottom={true}
      paddingX={1}
    >
      <Text bold={true}>Concert Hall</Text>
      {props.orchestras.map((o) => {
        const current = o.id === props.currentId;
        const marker = current ? "▸" : " ";
        const dot = o.running ? "●" : "○";
        return (
          <Text key={o.id} bold={current}>
            {marker} {dot} {o.id} ({o.musician_count})
          </Text>
        );
      })}
    </Box>
  );
}
