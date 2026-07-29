import type { ReactElement, RefObject } from "react";
import { Box, type DOMElement } from "ink";
import type { Musician } from "../../state.types.js";
import type { OrchestraSummary } from "../../commands/list.js";
import type { TerminalFeed } from "../embedded-terminal.js";
import type { SelectionRange } from "../copy-mode.js";
import { ConcertHall } from "./ConcertHall.js";
import { Auditorium } from "./Auditorium.js";
import { StatusBar } from "./StatusBar.js";
import { Help } from "./Help.js";
import { NoteReader } from "./NoteReader.js";
import { SidebarHeader } from "./SidebarHeader.js";
import { OrchestratorPane } from "./OrchestratorPane.js";
import { LazyGitDialog } from "./LazyGitDialog.js";

export interface AppViewProps {
  orchestras: OrchestraSummary[];
  currentId: string;
  musicians: Musician[];
  activity: Record<string, string>;
  selectedIndex: number;
  permissionLevel: string;
  tokenHint: string;
  rows: number;
  pendingCount?: number;
  dismissConfirmation?: string | null;
  now: string;
  showHelp?: boolean;
  showNoteReader?: boolean;
  noteReaderMode?: "list" | "content";
  noteFiles?: string[];
  selectedNoteIndex?: number;
  noteContent?: string;
  noteScrollOffset?: number;
  noteRenderedLines?: string[];
  noteVisibleLines?: number;
  feed: TerminalFeed | null;
  activeMusicianName: string | null;
  errorMessage: string | null;
  orchestratorFocused: boolean;
  sidebarVisible?: boolean;
  activeMusicianId?: string | null;
  orchestratorActive?: boolean;
  version: string;
  lazygitInstalled?: boolean;
  lazyGitFeed?: TerminalFeed | null;
  lazyGitFocused?: boolean;
  orchestratorPaneRef?: RefObject<DOMElement | null>;
  lazyGitBoxRef?: RefObject<DOMElement | null>;
  selection?: SelectionRange | null;
  copyMode?: boolean;
  terminalCols?: number;
}

export function AppView(props: AppViewProps): ReactElement {
  const pendingCount = props.pendingCount ?? 0;
  const sidebarVisible = props.sidebarVisible ?? true;
  return (
    <Box width="100%" height={props.rows}>
      <Box flexDirection="row" width="100%" height="100%">
        <OrchestratorPane
          feed={props.feed}
          activeMusicianName={props.activeMusicianName}
          errorMessage={props.errorMessage}
          focused={props.orchestratorFocused}
          boxRef={props.orchestratorPaneRef}
          selection={props.selection ?? null}
          copyMode={props.copyMode ?? false}
          terminalCols={props.terminalCols ?? 80}
        />
        {sidebarVisible && (
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
              lazygitInstalled={props.lazygitInstalled ?? false}
            />
          </Box>
        )}
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
        {props.showNoteReader && (
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
              width="80%"
              height="80%"
              flexDirection="column"
              borderBackgroundColor={"black"}
              backgroundColor="black"
            >
              <NoteReader
                mode={props.noteReaderMode ?? "list"}
                files={props.noteFiles ?? []}
                selectedFileIndex={props.selectedNoteIndex ?? 0}
                fileContent={props.noteContent ?? ""}
                scrollOffset={props.noteScrollOffset ?? 0}
                renderedLines={props.noteRenderedLines}
                visibleLines={props.noteVisibleLines}
              />
            </Box>
          </Box>
        )}
        {props.lazyGitFeed != null && (
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
              ref={props.lazyGitBoxRef}
              borderStyle="round"
              paddingX={1}
              paddingY={1}
              width="90%"
              height="90%"
              flexDirection="column"
              borderBackgroundColor={"black"}
              backgroundColor="black"
            >
              <LazyGitDialog
                feed={props.lazyGitFeed}
                focused={props.lazyGitFocused ?? false}
              />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
