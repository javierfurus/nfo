import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import {
  useApp,
  useBoxMetrics,
  useInput,
  useStdout,
  useWindowSize,
  type DOMElement,
} from "ink";
import { AppView } from "./AppView.js";
import { reduceKey } from "../keymap.js";
import { pollActivity } from "../poll-activity.js";
import {
  syncMusicianIdleState,
  type MusicianIdleTracker,
} from "../poll-idle.js";
import { pollPermissions } from "../poll-permission.js";
import { setMusicianStatus } from "../../state-updaters.js";
import { watchOrchestraState, type StopWatching } from "../watch-state.js";
import { listOrchestras, type OrchestraSummary } from "../../commands/list.js";
import { EmbeddedTerminal, type TerminalFeed } from "../embedded-terminal.js";
import {
  claimEmbeddedSessionLease,
  embeddedSessionLeaseIsCurrent,
  runEmbeddedSessionOperation,
} from "../embedded-session-lifecycle.js";
import {
  toTerminalMouseScroll,
  toTerminalMouseEvent,
  toTerminalInput,
  toTerminalViewportCommand,
  clampToPane,
} from "../terminal-input.js";
import {
  embeddedSessionName,
  ensureEmbeddedSession,
  killSession,
  selectWindow,
  sessionName,
  setSessionOption,
} from "../../tmux.js";
import { emitOsc52 } from "../clipboard.js";
import type { CopyModeState, SelectionRange } from "../copy-mode.js";
import { execa } from "execa";
import { noteList, noteRead } from "../../notes.js";
import { NOTE_READER_VISIBLE_LINES } from "./NoteReader.js";
import { dismissMusician } from "../../musicians/dismiss.js";
import { reconcileMusicianLiveness } from "../../musicians/reconcile.js";
import { readState } from "../../state.js";
import { notifyAwaitingPermission } from "../../notify.js";
import type { Musician, OrchestraState } from "../../state.types.js";

export interface AppProps {
  orchestraId: string;
  version: string;
}

export function App(props: AppProps): ReactElement {
  const { exit } = useApp();
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
  const [showNoteReader, setShowNoteReader] = useState(false);
  const [noteFiles, setNoteFiles] = useState<string[]>([]);
  const [noteReaderMode, setNoteReaderMode] = useState<"list" | "content">(
    "list",
  );
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(0);
  const [noteContent, setNoteContent] = useState("");
  const [noteScrollOffset, setNoteScrollOffset] = useState(0);
  // C2: feed + errorMessage replace orchestratorSnapshot. Only one re-render when the
  // terminal is first created; pty output re-renders only OrchestratorPane.
  const [feed, setFeed] = useState<TerminalFeed | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activePaneMusicianId, setActivePaneMusicianId] = useState<
    string | null
  >(null);
  const [orchestratorFocused, setOrchestratorFocused] = useState(false);
  const [copyMode, setCopyMode] = useState<CopyModeState>("off");
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [lazygitInstalled, setLazygitInstalled] = useState(false);
  const [lazyGitFeed, setLazyGitFeed] = useState<TerminalFeed | null>(null);
  const [lazyGitFocused, setLazyGitFocused] = useState(false);
  const terminalRef = useRef<EmbeddedTerminal | null>(null);
  const lazyGitTerminalRef = useRef<EmbeddedTerminal | null>(null);
  const lazyGitUnsubscribeRef = useRef<(() => void) | null>(null);
  const idleTrackerRef = useRef<MusicianIdleTracker>({});

  // Detect whether lazygit is installed.
  useEffect(() => {
    execa("lazygit", ["--version"], { reject: false })
      .then((result) => {
        setLazygitInstalled(result.exitCode === 0);
      })
      .catch(() => {
        // lazygit not available
      });
  }, []);

  // Clean up lazygit terminal on unmount.
  useEffect(() => {
    return () => {
      lazyGitUnsubscribeRef.current?.();
      lazyGitUnsubscribeRef.current = null;
      lazyGitTerminalRef.current?.dispose();
      lazyGitTerminalRef.current = null;
    };
  }, []);

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

  // Poll activity + clock every 2s; also reconcile musician liveness each tick.
  useEffect(() => {
    const tick = async (): Promise<void> => {
      setNow(new Date().toISOString());
      await reconcileMusicianLiveness(props.orchestraId);
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
  const orchestratorPaneRef = useRef<DOMElement | null>(null);
  const lazyGitBoxRef = useRef<DOMElement | null>(null);
  const paneMetrics = useBoxMetrics(orchestratorPaneRef);
  const lazyGitMetrics = useBoxMetrics(lazyGitBoxRef);

  // With alt-screen enabled, paneMetrics gives exact screen coordinates after first
  // layout pass. The OrchestratorPane Box has border(1)+paddingX(1) on each side and
  // a title row + footer row inside the border, hence the +4 offsets below.
  const terminalCols = paneMetrics.hasMeasured
    ? Math.max(40, paneMetrics.width - 4)
    : Math.max(40, windowSize.columns - 53);
  const terminalRows = paneMetrics.hasMeasured
    ? Math.max(12, paneMetrics.height - 4)
    : Math.max(12, windowSize.rows - 4);
  // +3 = border(1) + padding/title(1) + 1-based terminal mouse coordinate offset.
  const terminalScreenLeft = paneMetrics.hasMeasured ? paneMetrics.left + 3 : 3;
  const terminalScreenTop = paneMetrics.hasMeasured ? paneMetrics.top + 3 : 3;
  const terminalScreenRight = terminalScreenLeft + terminalCols - 1;
  const terminalScreenBottom = terminalScreenTop + terminalRows - 1;

  // LazyGit dialog mouse offset: box left/top (0-indexed) + border(1) + paddingX/Y(1).
  // Falls back to 5% approximation before first layout measurement.
  const lazyGitDialogLeft = lazyGitMetrics.hasMeasured
    ? lazyGitMetrics.left + 2
    : Math.floor(windowSize.columns * 0.05);
  const lazyGitDialogTop = lazyGitMetrics.hasMeasured
    ? lazyGitMetrics.top + 2
    : Math.floor(windowSize.rows * 0.05);

  // LazyGit dialog box is width/height 90% with border(1)+padding(1) on each side,
  // hence the -4 to get the inner content area. Once the box is measured we use its
  // real dimensions (mirroring the Claude terminal above); before first layout we
  // fall back to the 90% window approximation.
  const lazyGitCols = lazyGitMetrics.hasMeasured
    ? Math.max(40, lazyGitMetrics.width - 4)
    : Math.max(40, Math.floor(windowSize.columns * 0.9) - 4);
  const lazyGitRows = lazyGitMetrics.hasMeasured
    ? Math.max(12, lazyGitMetrics.height - 4)
    : Math.max(12, Math.floor(windowSize.rows * 0.9) - 4);

  const showTerminalError = (message: string): void => {
    setErrorMessage(message);
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

    const start = async (): Promise<void> => {
      try {
        setFeed(null);
        setErrorMessage(null);
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
        if (!disposed) {
          setFeed(terminal);
        } else {
          terminal.dispose();
          terminalRef.current = null;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "unknown error";
        showTerminalError(
          `Unable to start embedded Claude terminal: ${message}`,
        );
      }
    };

    void start();

    return () => {
      disposed = true;
      setFeed(null);
      setErrorMessage(null);
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
    const lazyGitTerminal = lazyGitTerminalRef.current;
    if (!lazyGitTerminal) {
      return;
    }
    try {
      lazyGitTerminal.resize(lazyGitCols, lazyGitRows);
    } catch {
      showTerminalError("Embedded lazygit terminal resize failed.");
    }
  }, [lazyGitCols, lazyGitRows]);

  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }

    stdout.write("\u001b[?1000h\u001b[?1006h");
    return () => {
      stdout.write("\u001b[?1000l\u001b[?1006l");
    };
  }, [stdout]);

  // Enable button+motion tracking (?1002h) only while in copy mode so we receive
  // drag events. This is a separate effect from the always-on ?1000h above to
  // avoid flooding input with motion events outside copy mode.
  useEffect(() => {
    if (!stdout.isTTY) {
      return;
    }
    if (copyMode === "off") {
      return;
    }
    stdout.write("\u001b[?1002h");
    return () => {
      stdout.write("\u001b[?1002l");
    };
  }, [stdout, copyMode]);

  // While in copy mode, disable tmux mouse so tmux does not grab drags.
  // Restore mouse on exit and on unmount.
  useEffect(() => {
    if (!projectPath || copyMode === "off") {
      return;
    }
    void setSessionOption(embedSession, "mouse", "off").catch(() => {});
    return () => {
      void setSessionOption(embedSession, "mouse", "on").catch(() => {});
    };
  }, [copyMode, embedSession, projectPath]);

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

    if (showNoteReader) {
      if (noteReaderMode === "list") {
        if (key.upArrow || input === "k") {
          setSelectedNoteIndex((prev) => {
            return Math.max(0, prev - 1);
          });
        } else if (key.downArrow || input === "j") {
          setSelectedNoteIndex((prev) => {
            return Math.min(noteFiles.length - 1, prev + 1);
          });
        } else if (key.return) {
          const filename = noteFiles[selectedNoteIndex];
          if (filename) {
            noteRead(props.orchestraId, filename).then((content) => {
              setNoteContent(content);
              setNoteScrollOffset(0);
              setNoteReaderMode("content");
            });
          }
        } else if (key.escape) {
          setShowNoteReader(false);
        }
      } else {
        const lines = noteContent.split("\n");
        const maxOffset = Math.max(0, lines.length - NOTE_READER_VISIBLE_LINES);
        if (key.upArrow || input === "k") {
          setNoteScrollOffset((prev) => {
            return Math.max(0, prev - 1);
          });
        } else if (key.downArrow || input === "j") {
          setNoteScrollOffset((prev) => {
            return Math.min(maxOffset, prev + 1);
          });
        } else if (key.escape) {
          setNoteReaderMode("list");
        }
      }
      return;
    }

    if (lazyGitFocused) {
      if (input.startsWith("\x1b[<") || input.startsWith("[<")) {
        return;
      }
      const terminalInput = toTerminalInput(input, key);
      if (terminalInput) {
        lazyGitTerminalRef.current?.write(terminalInput);
      }
      return;
    }

    // Copy mode: handle all input while in any ON_* state.
    // Ctrl+G is silently ignored (no focus change mid-copy).
    // All regular Claude-pane keystrokes are suspended.
    if (copyMode !== "off") {
      if (key.ctrl && input.toLowerCase() === "g") {
        return;
      }
      if (key.ctrl && input.toLowerCase() === "y") {
        setCopyMode("off");
        setSelection(null);
        return;
      }
      if (key.escape) {
        if (copyMode === "on_selecting" || copyMode === "on_has_selection") {
          setSelection(null);
          setCopyMode("on_idle");
        } else {
          setCopyMode("off");
        }
        return;
      }
      // Scroll events are ignored during copy mode (no auto-scroll in alt-screen).
      const scrollEvent = toTerminalMouseScroll(input);
      if (scrollEvent) {
        return;
      }
      // Mouse press/drag/release events drive the selection.
      const mouseEvent = toTerminalMouseEvent(input);
      if (mouseEvent) {
        const rawCol = mouseEvent.column - terminalScreenLeft;
        const rawRow = mouseEvent.row - terminalScreenTop;
        const clamped = clampToPane(rawCol, rawRow, terminalCols, terminalRows);
        const cell = { col: clamped.col, row: clamped.row };
        if (mouseEvent.kind === "press") {
          setSelection({ anchor: cell, focus: cell });
          setCopyMode("on_selecting");
        } else if (mouseEvent.kind === "drag") {
          if (copyMode === "on_selecting") {
            setSelection((prev) => {
              if (!prev) {
                return { anchor: cell, focus: cell };
              }
              return { anchor: prev.anchor, focus: cell };
            });
          }
        } else if (mouseEvent.kind === "release") {
          const currentSel = selection;
          const anchor = currentSel ? currentSel.anchor : cell;
          const finalSel = { anchor, focus: cell };
          const isEmpty =
            finalSel.anchor.col === finalSel.focus.col &&
            finalSel.anchor.row === finalSel.focus.row;
          if (isEmpty) {
            setSelection(null);
            setCopyMode("on_idle");
          } else {
            // Normalize to reading order for extraction.
            let startRow: number;
            let startCol: number;
            let endRow: number;
            let endCol: number;
            if (
              finalSel.anchor.row < finalSel.focus.row ||
              (finalSel.anchor.row === finalSel.focus.row &&
                finalSel.anchor.col <= finalSel.focus.col)
            ) {
              startRow = finalSel.anchor.row;
              startCol = finalSel.anchor.col;
              endRow = finalSel.focus.row;
              endCol = finalSel.focus.col;
            } else {
              startRow = finalSel.focus.row;
              startCol = finalSel.focus.col;
              endRow = finalSel.anchor.row;
              endCol = finalSel.anchor.col;
            }
            const terminal = terminalRef.current;
            if (terminal) {
              const text = terminal.extractSelection(
                startRow,
                startCol,
                endRow,
                endCol,
              );
              if (text.length > 0) {
                emitOsc52(stdout, text);
              }
            }
            setSelection(finalSel);
            setCopyMode("on_has_selection");
          }
        }
        return;
      }
      // All other keystrokes are suspended while in copy mode.
      return;
    }

    const mouseScroll = toTerminalMouseScroll(input);
    if (mouseScroll) {
      const insideTerminalViewport =
        mouseScroll.column >= terminalScreenLeft &&
        mouseScroll.column <= terminalScreenRight &&
        mouseScroll.row >= terminalScreenTop &&
        mouseScroll.row <= terminalScreenBottom;
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
      if (key.ctrl && input.toLowerCase() === "y" && stdout.isTTY) {
        setCopyMode("on_idle");
        setSelection(null);
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
    if (action.kind === "detach") {
      exit();
      return;
    }
    if (action.kind === "open-notes") {
      noteList(props.orchestraId).then((files) => {
        setNoteFiles(files);
        setSelectedNoteIndex(0);
        setNoteReaderMode("list");
        setNoteScrollOffset(0);
        setShowNoteReader(true);
      });
      return;
    }
    if (action.kind === "open-lazygit") {
      if (!lazygitInstalled || !projectPath || lazyGitFeed !== null) {
        return;
      }
      const lazyGitTerminal = new EmbeddedTerminal({
        sessionName: "",
        cwd: projectPath,
        cols: lazyGitCols,
        rows: lazyGitRows,
        command: "lazygit",
        commandArgs: [],
      });
      lazyGitTerminalRef.current = lazyGitTerminal;
      const unsubscribe = lazyGitTerminal.onChange((snapshot) => {
        if (!snapshot.connected) {
          setLazyGitFeed(null);
          setLazyGitFocused(false);
          lazyGitUnsubscribeRef.current?.();
          lazyGitUnsubscribeRef.current = null;
          lazyGitTerminalRef.current?.dispose();
          lazyGitTerminalRef.current = null;
        }
      });
      lazyGitUnsubscribeRef.current = unsubscribe;
      setLazyGitFeed(lazyGitTerminal);
      setLazyGitFocused(true);
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
      rows={windowSize.rows}
      now={now}
      pendingCount={pendingCount}
      dismissConfirmation={dismissConfirmation}
      showHelp={showHelp}
      showNoteReader={showNoteReader}
      noteReaderMode={noteReaderMode}
      noteFiles={noteFiles}
      selectedNoteIndex={selectedNoteIndex}
      noteContent={noteContent}
      noteScrollOffset={noteScrollOffset}
      feed={feed}
      activeMusicianName={activePaneMusician?.name ?? null}
      errorMessage={errorMessage}
      orchestratorFocused={orchestratorFocused}
      activeMusicianId={activePaneMusician?.id ?? null}
      orchestratorActive={activePaneMusician === null}
      version={props.version}
      lazygitInstalled={lazygitInstalled}
      lazyGitFeed={lazyGitFeed}
      lazyGitFocused={lazyGitFocused}
      orchestratorPaneRef={orchestratorPaneRef}
      lazyGitBoxRef={lazyGitBoxRef}
      selection={selection}
      copyMode={copyMode !== "off"}
      terminalCols={terminalCols}
    />
  );
}
