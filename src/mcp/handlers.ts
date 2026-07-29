import { createMusician } from "../musicians/spawn.js";
import { resolveAllowedTools, type MusicianRole } from "../musicians/roles.js";
import {
  drainQueuedMusicianMessages,
  messageMusician,
} from "../musicians/message.js";
import { queryMusician } from "../musicians/query.js";
import { dismissMusician } from "../musicians/dismiss.js";
import { noteRead, noteWrite, noteList } from "../notes.js";
import { readState } from "../state.js";
import {
  setMusicianLatestReport,
  setMusicianStatus,
} from "../state-updaters.js";
import { findMusicianStrict } from "../musicians/lookup.js";
import { notifyOrchestratorOfDoneReport } from "../orchestrator/report-back.js";

export interface DispatchOptions {
  dryRun?: boolean;
  callerMusicianId?: string;
}

export async function dispatch(
  orchestraId: string,
  toolName: string,
  args: Record<string, unknown>,
  opts: DispatchOptions = {},
): Promise<Record<string, unknown>> {
  switch (toolName) {
    case "spawn_musician": {
      const r = await createMusician({
        orchestraId,
        name: String(args.name),
        task: String(args.task),
        worktree:
          typeof args.worktree === "boolean" ? args.worktree : undefined,
        branchFrom:
          typeof args.branch_from === "string" ? args.branch_from : undefined,
        model:
          typeof args.model === "string"
            ? (args.model as "sonnet" | "haiku")
            : "sonnet",
        dryRun: opts.dryRun,
        allowedTools: resolveAllowedTools(
          Array.isArray(args.allowed_tools) &&
          (args.allowed_tools as unknown[]).every((t) => typeof t === "string")
            ? (args.allowed_tools as string[])
            : undefined,
          typeof args.role === "string" ? (args.role as MusicianRole) : undefined,
        ),
      });
      return r;
    }
    case "message_musician": {
      const result = await messageMusician({
        orchestraId,
        musicianId: String(args.musician_id),
        message: String(args.message),
      });
      return { ...result };
    }
    case "query_musician": {
      const text = await queryMusician({
        orchestraId,
        musicianId: String(args.musician_id),
        lines: typeof args.lines === "number" ? args.lines : undefined,
      });
      return { content: text };
    }
    case "list_musicians": {
      const state = await readState(orchestraId);
      if (!state) {
        throw new Error(`Unknown orchestra: ${orchestraId}`);
      }
      return { musicians: state.musicians };
    }
    case "dismiss_musician": {
      await dismissMusician({
        orchestraId,
        musicianId: String(args.musician_id),
        archiveWorktree:
          typeof args.archive_worktree === "boolean"
            ? args.archive_worktree
            : undefined,
        summary: typeof args.summary === "string" ? args.summary : null,
      });
      return { ok: true };
    }
    case "report_done": {
      const state = await readState(orchestraId);
      if (!state) {
        throw new Error(`Unknown orchestra: ${orchestraId}`);
      }
      const summary = typeof args.summary === "string" ? args.summary : "";
      const nextSteps =
        typeof args.next_steps === "string" ? args.next_steps : null;
      const callerId =
        typeof args._from_musician_id === "string"
          ? args._from_musician_id
          : opts.callerMusicianId;
      if (!callerId) {
        throw new Error("report_done: no caller musician id");
      }
      const musician = findMusicianStrict(state, callerId);
      const reportedAt = new Date().toISOString();
      await setMusicianLatestReport(orchestraId, callerId, {
        summary,
        next_steps: nextSteps,
        reported_at: reportedAt,
      });
      await setMusicianStatus(orchestraId, callerId, "idle");
      const deliveredMessages = await drainQueuedMusicianMessages(
        orchestraId,
        callerId,
      );
      if (deliveredMessages > 0) {
        await setMusicianStatus(orchestraId, callerId, "working");
      } else {
        await notifyOrchestratorOfDoneReport(orchestraId, {
          musicianId: callerId,
          musicianName: musician.name,
          summary,
          nextSteps,
        });
      }
      return {
        ok: true,
        recorded: summary,
        delivered_messages: deliveredMessages,
        notified_orchestrator: deliveredMessages === 0,
      };
    }
    case "note_write": {
      await noteWrite(orchestraId, String(args.filename), String(args.content));
      return { ok: true };
    }
    case "note_read": {
      const content = await noteRead(orchestraId, String(args.filename));
      return { content };
    }
    case "note_list": {
      const files = await noteList(orchestraId);
      return { files };
    }
    default: {
      throw new Error(`Unknown tool: ${toolName}`);
    }
  }
}
