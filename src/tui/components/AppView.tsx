import type { ReactElement } from "react";
import { Box } from "ink";
import type { Musician } from "../../state.types.js";
import type { OrchestraSummary } from "../../commands/list.js";
import type { EmbeddedTerminalLine } from "../embedded-terminal.js";
import { ConcertHall } from "./ConcertHall.js";
import { Auditorium } from "./Auditorium.js";
import { StatusBar } from "./StatusBar.js";
import { Help } from "./Help.js";
import { SidebarHeader } from "./SidebarHeader.js";
import { OrchestratorPane } from "./OrchestratorPane.js";

export interface AppViewProps {
  orchestras: OrchestraSummary[];
  currentId: string;
  musicians: Musician[];
  activity: Record<string, string>;
  selectedIndex: number;
  permissionLevel: string;
  tokenHint: string;
  pendingCount?: number;
  dismissConfirmation?: string | null;
  now: string;
  showHelp?: boolean;
  orchestratorTitle: string;
  orchestratorLines: EmbeddedTerminalLine[];
  orchestratorFocused: boolean;
  orchestratorConnected: boolean;
  activeMusicianId?: string | null;
  orchestratorActive?: boolean;
  version: string;
}

export function AppView(props: AppViewProps): ReactElement {
  const pendingCount = props.pendingCount ?? 0;
  return (
    <Box width="100%" height="100%">
      <Box flexDirection="row" width="100%" height="100%">
        <OrchestratorPane
          title={props.orchestratorTitle}
          lines={props.orchestratorLines}
          focused={props.orchestratorFocused}
          connected={props.orchestratorConnected}
        />
        <Box width={48} flexDirection="column">
          <SidebarHeader
            orchestraId={props.currentId}
            musicianCount={props.musicians.length}
            pendingCount={pendingCount}
            version={props.version}
          />
          <ConcertHall
            orchestras={props.orchestras}
            currentId={props.currentId}
          />
          <Auditorium
            musicians={props.musicians}
            activity={props.activity}
            selectedIndex={props.selectedIndex}
            now={props.now}
            orchestratorActive={props.orchestratorActive ?? false}
            activeMusicianId={props.activeMusicianId ?? null}
          />
          <StatusBar
            permissionLevel={props.permissionLevel}
            tokenHint={props.tokenHint}
            pendingCount={pendingCount}
            dismissConfirmation={props.dismissConfirmation}
            orchestratorFocused={props.orchestratorFocused}
          />
        </Box>
        {props.showHelp && (
          <Box
            position="absolute"
            top={0}
            left={0}
            width="100%"
            height="100%"
            justifyContent="center"
            alignItems="center"
          >
            <Box
              borderStyle="round"
              paddingX={1}
              paddingY={1}
              width={64}
              flexDirection="column"
              borderBackgroundColor={"black"}
              backgroundColor="black"
            >
              <Help />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
