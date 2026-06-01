import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { useInput, useStdout, useWindowSize } from "ink";
import { AppView } from "./AppView.js";
import { reduceKey } from "./keymap.js";
import { pollActivity } from "./poll-activity.js";
import {
  syncMusicianIdleState,
  type MusicianIdleTracker,
} from "./poll-idle.js";
import { pollPermissions } from "./poll-permission.js";
import { setMusicianStatus } from "../state-updaters.js";
import { watchOrchestraState, type StopWatching } from "./watch-state.js";
import { listOrchestras, type OrchestraSummary } from "../commands/list.js";
import {
  EmbeddedTerminal,
  type EmbeddedTerminalSnapshot,
} from "./embedded-terminal.js";
import {
  claimEmbeddedSessionLease,
  embeddedSessionLeaseIsCurrent,
  runEmbeddedSessionOperation,
} from "./embedded-session-lifecycle.js";
import {
  toTerminalMouseScroll,
  toTerminalInput,
  toTerminalViewportCommand,
} from "./terminal-input.js";
import {
  detachCurrentClient,
  embeddedSessionName,
  ensureEmbeddedSession,
  killSession,
  selectWindow,
  sessionName,
} from "../tmux.js";
import { openNotes } from "../commands/notes.js";
import { dismissMusician } from "../musicians/dismiss.js";
import { readState } from "../state.js";
import { notifyAwaitingPermission } from "../notify.js";
import type { Musician, OrchestraState } from "../state.types.js";

export interface AppProps {
  orchestraId: string;
}

function textLines(...lines: string[]): EmbeddedTerminalSnapshot["lines"] {
  return lines.map((line) => {
    return { spans: [{ text: line }] };
  });
}

export function App(props: AppProps): ReactElement {
  const windowSize = useWindowSize();
  const { stdout } = useStdout();
  const [state, setState] = useState<OrchestraState | null>(null);
  const [orchestras, setOrchestras] = useState<OrchestraSummary[]>([]);
  const [activity, setActivity] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingDismissIndex, setPendingDismissIndex] = useState<number | null>(
    null,
  );
  const [now, setNow] = useState(new Date().toISOString());
  const [showHelp, setShowHelp] = useState(false);
  const [orchestratorSnapshot, setOrchestratorSnapshot] =
    useState<EmbeddedTerminalSnapshot>({
      title: "Claude",
      lines: textLines("Starting embedded Claude terminal…"),
      connected: true,
    });
  const [activePaneMusicianId, setActivePaneMusicianId] = useState<
    string | null
  >(null);
  const [orchestratorFocused, setOrchestratorFocused] = useState(false);
  const terminalRef = useRef<EmbeddedTerminal | null>(null);
  const idleTrackerRef = useRef<MusicianIdleTracker>({});

  // Watch state.json.
  useEffect(() => {
    let stop: StopWatching | undefined;
    void watchOrchestraState(props.orchestraId, (s) => {
      setState(s);
    }).then((fn) => {
      stop = fn;
    });
    return () => {
      if (stop) {
        void stop();
      }
    };
  }, [props.orchestraId]);

  // Detect musicians that are visibly idle at the Claude prompt and flush queued follow-ups.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      idleTrackerRef.current = await syncMusicianIdleState(
        props.orchestraId,
        idleTrackerRef.current,
      );
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [props.orchestraId]);

  // Poll activity + clock every 2s.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      setNow(new Date().toISOString());
      const s = await readState(props.orchestraId);
      if (s) {
        const a = await pollActivity(s);
        setActivity(a);
      }
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [props.orchestraId]);

  // Poll permission-prompt state every 2s and apply transitions.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      const s = await readState(props.orchestraId);
      if (!s) {
        return;
      }
      const transitions = await pollPermissions(s);
      for (const t of transitions) {
        try {
          await setMusicianStatus(
            props.orchestraId,
            t.musicianId,
            t.newStatus,
            t.pendingPermission,
          );
        } catch {
          // Musician may have been dismissed between poll and write; safe to swallow.
        }
      }
      const newlyAwaiting = transitions.filter((t) => {
        return t.newStatus === "awaiting_permission";
      });
      if (newlyAwaiting.length > 0 && s.notify_on_permission === true) {
        const fresh = await readState(props.orchestraId);
        if (fresh) {
          const total = fresh.musicians.filter((m) => {
            return m.status === "awaiting_permission";
          }).length;
          await notifyAwaitingPermission({ pendingCount: total });
        }
      }
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      clearInterval(timer);
    };
  }, [props.orchestraId]);

  // Refresh the orchestra list every 3s.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      const list = await listOrchestras();
      setOrchestras(list);
    };
    void tick();
    const timer = setInterval(() => {
      void tick();
    }, 3000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const musicians: Musician[] = state ? state.musicians : [];
  const session = sessionName(props.orchestraId);
  const embedSession = embeddedSessionName(props.orchestraId);
  const projectPath = state?.project_path;
  const activePaneMusician = activePaneMusicianId
    ? (musicians.find((musician) => {
        return musician.id === activePaneMusicianId;
      }) ?? null)
    : null;
  const paneTitle = activePaneMusician
    ? `Musician · ${activePaneMusician.name}`
    : `Orchestrator · ${orchestratorSnapshot.title}`;
  const terminalCols = Math.max(40, windowSize.columns - 53);
  const terminalRows = Math.max(12, windowSize.rows - 4);
  const terminalScreenLeft = 3;
  const terminalScreenTop = 3;
  const terminalScreenRight = terminalScreenLeft + terminalCols - 1;
  const terminalScreenBottom = terminalScreenTop + terminalRows - 1;

  const showTerminalError = (message: string): void => {
    setOrchestratorSnapshot((current) => {
      return {
        title: current.title,
        lines: textLines(message),
        connected: false,
      };
    });
  };

  const openSelectedTarget = async (
    nextSelectedIndex: number,
  ): Promise<void> => {
    const musician =
      nextSelectedIndex === 0 ? null : musicians[nextSelectedIndex - 1];
    if (nextSelectedIndex > 0 && !musician) {
      return;
    }
    const windowTarget = musician ? musician.tmux_window_id : "0";
    try {
      await selectWindow(embedSession, windowTarget);
      setActivePaneMusicianId(musician?.id ?? null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showTerminalError(
        `Unable to open the selected target in the left pane: ${message}`,
      );
    }
  };

  useEffect(() => {
    if (!projectPath) {
      return;
    }

    const embeddedSessionLease = claimEmbeddedSessionLease(embedSession);
    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    const start = async (): Promise<void> => {
      try {
        setOrchestratorSnapshot({
          title: "Claude",
          lines: textLines("Starting embedded Claude terminal…"),
          connected: true,
        });
        await runEmbeddedSessionOperation(embedSession, async () => {
          await killSession(embedSession);
          await ensureEmbeddedSession(session, embedSession, projectPath);

          if (!embeddedSessionLeaseIsCurrent(embeddedSessionLease)) {
            await killSession(embedSession);
          }
        });
        if (disposed || !embeddedSessionLeaseIsCurrent(embeddedSessionLease)) {
          return;
        }
        const terminal = new EmbeddedTerminal({
          sessionName: embedSession,
          cwd: projectPath,
          cols: terminalCols,
          rows: terminalRows,
        });
        terminalRef.current = terminal;
        unsubscribe = terminal.onChange((snapshot) => {
          if (!disposed) {
            setOrchestratorSnapshot(snapshot);
          }
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        setOrchestratorSnapshot({
          title: "Claude",
          lines: textLines(
            `Unable to start embedded Claude terminal: ${message}`,
          ),
          connected: false,
        });
      }
    };

    void start();

    return () => {
      disposed = true;
      unsubscribe?.();
      terminalRef.current?.dispose();
      terminalRef.current = null;
      void runEmbeddedSessionOperation(embedSession, async () => {
        if (!embeddedSessionLeaseIsCurrent(embeddedSessionLease)) {
          return;
        }

        await killSession(embedSession);
      });
    };
  }, [embedSession, projectPath, props.orchestraId, session]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return;
    }
    try {
      terminal.resize(terminalCols, terminalRows);
    } catch {
      showTerminalError("Embedded Claude terminal resize failed.");
    }
  }, [terminalCols, terminalRows]);

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    stdout.write("\u001b[?1000h\u001b[?1006h");
    return () => {
      stdout.write("\u001b[?1000l\u001b[?1006l");
    };
  }, [stdout]);

  useEffect(() => {
    if (activePaneMusicianId === null) {
      return;
    }
    if (
      musicians.some((musician) => {
        return musician.id === activePaneMusicianId;
      })
    ) {
      return;
    }
    setActivePaneMusicianId(null);
    if (!projectPath) {
      return;
    }
    void selectWindow(embedSession, "0").catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      showTerminalError(
        `Unable to return the left pane to the orchestrator: ${message}`,
      );
    });
  }, [activePaneMusicianId, embedSession, musicians, projectPath]);

  useInput((input, key) => {
    if (showHelp) {
      if (input === "?" || key.escape) {
        setShowHelp(false);
      }
      return;
    }

    const mouseScroll = toTerminalMouseScroll(input);
    if (mouseScroll) {
      const insideTerminalViewport =
        mouseScroll.column >= terminalScreenLeft
        && mouseScroll.column <= terminalScreenRight
        && mouseScroll.row >= terminalScreenTop
        && mouseScroll.row <= terminalScreenBottom;
      if (insideTerminalViewport) {
        const translatedColumn = mouseScroll.column - terminalScreenLeft + 1;
        const translatedRow = mouseScroll.row - terminalScreenTop + 1;
        terminalRef.current?.write(
          `\u001b[<${mouseScroll.button};${translatedColumn};${translatedRow}M`,
        );
      }
      return;
    }

    if (orchestratorFocused) {
      if (key.ctrl && input.toLowerCase() === "g") {
        setOrchestratorFocused(false);
        return;
      }
      const viewportCommand = toTerminalViewportCommand(key);
      if (viewportCommand) {
        if (viewportCommand.kind === "scroll-pages") {
          terminalRef.current?.scrollPages(viewportCommand.pageCount);
          return;
        }
        if (viewportCommand.kind === "scroll-top") {
          terminalRef.current?.scrollToTop();
          return;
        }
        terminalRef.current?.scrollToBottom();
        return;
      }
      const terminalInput = toTerminalInput(input, key);
      if (terminalInput) {
        terminalRef.current?.write(terminalInput);
      }
      return;
    }

    if (key.ctrl && input.toLowerCase() === "c") {
      return;
    }
    if (key.ctrl && input.toLowerCase() === "g") {
      setOrchestratorFocused(true);
      return;
    }

    // Ink reports key.tab=true for BOTH Tab and Shift-Tab (with key.shift set on
    // the latter). Disambiguate so the reducer's `tab`-before-`shiftTab` order is
    // correct: plain Tab only when shift is NOT held.
    const isTab = key.tab && !key.shift;
    const isShiftTab = key.tab && key.shift;
    const result = reduceKey(
      { selectedIndex, musicianCount: musicians.length, pendingDismissIndex },
      {
        input,
        downArrow: key.downArrow,
        upArrow: key.upArrow,
        tab: isTab,
        shiftTab: isShiftTab,
        return: key.return,
        escape: key.escape,
      },
    );
    setSelectedIndex(result.ui.selectedIndex);
    setPendingDismissIndex(result.ui.pendingDismissIndex);
    if (!result.action) {
      return;
    }
    const action = result.action;
    if (action.kind === "open-target") {
      void openSelectedTarget(action.selectedIndex);
      return;
    }
    if (action.kind === "detach-session") {
      void detachCurrentClient().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setOrchestratorSnapshot({
          title: "Claude",
          lines: textLines(
            `Unable to detach the current tmux client: ${message}`,
          ),
          connected: false,
        });
      });
      return;
    }
    if (action.kind === "open-notes") {
      void openNotes(props.orchestraId);
      return;
    }
    if (action.kind === "dismiss-musician") {
      const m = musicians[action.index];
      if (m) {
        void dismissMusician({
          orchestraId: props.orchestraId,
          musicianId: m.id,
        });
      }
      return;
    }
    if (action.kind === "request-dismiss-musician") {
      return;
    }
    if (action.kind === "jump-to-pending") {
      const pendingIndex = musicians.findIndex((m) => {
        return m.status === "awaiting_permission";
      });
      if (pendingIndex >= 0) {
        setSelectedIndex(pendingIndex + 1);
        void openSelectedTarget(pendingIndex + 1);
      }
      return;
    }
    if (action.kind === "toggle-help") {
      setShowHelp((prev) => {
        return !prev;
      });
      return;
    }
    // next-orchestra / prev-orchestra: Phase 3 leaves session-switching to a
    // later iteration (attaching a different tmux session from inside Ink
    // needs care). Intentionally a no-op here.
  });

  useEffect(() => {
    setSelectedIndex((prev) => {
      return Math.min(prev, musicians.length);
    });
    setPendingDismissIndex((prev) => {
      if (prev === null) {
        return prev;
      }
      if (prev >= musicians.length) {
        return null;
      }
      return prev;
    });
  }, [musicians.length]);

  const permissionLevel = state ? state.permission_level : "…";
  const pendingCount = musicians.filter((m) => {
    return m.status === "awaiting_permission";
  }).length;
  const dismissTarget =
    pendingDismissIndex !== null ? musicians[pendingDismissIndex] : null;
  const dismissConfirmation = dismissTarget
    ? `Confirm dismiss ${dismissTarget.name} · [y]/[Enter] confirm · [n]/[Esc] cancel`
    : null;

  return (
    <AppView
      orchestras={orchestras}
      currentId={props.orchestraId}
      musicians={musicians}
      activity={activity}
      selectedIndex={selectedIndex}
      permissionLevel={permissionLevel}
      tokenHint="—"
      now={now}
      pendingCount={pendingCount}
      dismissConfirmation={dismissConfirmation}
      showHelp={showHelp}
      orchestratorTitle={paneTitle}
      orchestratorLines={orchestratorSnapshot.lines}
      orchestratorFocused={orchestratorFocused}
      orchestratorConnected={orchestratorSnapshot.connected}
      activeMusicianId={activePaneMusician?.id ?? null}
      orchestratorActive={activePaneMusician === null}
    />
  );
}
