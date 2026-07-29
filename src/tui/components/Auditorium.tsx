import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Musician } from "../../state.types.js";
import { statusIcon, statusColor } from "../status-icon.js";
import { formatRelativeTime } from "../format-time.js";

export interface AuditoriumProps {
  musicians: Musician[];
  activity: Record<string, string>;
  selectedIndex: number;
  now: string;
  activeMusicianId?: string | null;
  orchestratorActive?: boolean;
}

export function Auditorium(props: AuditoriumProps): ReactElement {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold={true}>Auditorium</Text>
      <Box flexDirection="column">
        <Text color={props.orchestratorActive ? "cyan" : undefined}>
          {props.selectedIndex === 0 ? "▸" : " "} ◉ orchestrator
          {props.orchestratorActive ? " [open]" : ""}
        </Text>
        <Text dimColor={true}> Claude / tmux controller</Text>
      </Box>
      {props.musicians.length === 0 ? (
        <Text dimColor={true}>No musicians yet.</Text>
      ) : null}
      {props.musicians.map((m, i) => {
        const selected = i + 1 === props.selectedIndex;
        const marker = selected ? "▸" : " ";
        const since = formatRelativeTime(m.last_activity, props.now);
        const line =
          m.status === "awaiting_permission"
            ? `awaiting: ${m.pending_permission ?? "tool"}`
            : (props.activity[m.id] ?? "");
        const active = props.activeMusicianId === m.id;
        return (
          <Box key={m.id} flexDirection="column">
            <Text color={active ? "cyan" : undefined}>
              {marker}{" "}
              <Text color={statusColor(m.status)}>{statusIcon(m.status)}</Text>{" "}
              {m.id} {m.name}
              {active ? " [open]" : ""}
            </Text>
            <Text dimColor={true}>
              {" "}
              {since} · {line}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
