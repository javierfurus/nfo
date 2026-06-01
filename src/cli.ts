#!/usr/bin/env node
import { Command } from 'commander';
import { decideAction, createOrchestra } from './commands/launch.js';
import { attachOrRestore } from './commands/attach.js';
import { listOrchestras, formatOrchestraList, type OrchestraSummary } from './commands/list.js';
import { isPermissionLevel, AUTO_CONFIRM_PHRASE, AUTO_WARNING, type PermissionLevel } from './permission.js';
import { detectClaude } from './claude-detect.js';
import { createInterface } from 'node:readline/promises';

const program = new Command();
program
  .name('nfo')
  .description('NoFluffOrchestra — TUI multi-agent orchestrator')
  .version('0.0.0');

program
  .argument('[id]', 'Orchestra id to attach (optional)')
  .option('--notify-on-permission', 'bell + desktop notify when a musician awaits permission')
  .action(async (id: string | undefined, opts: { notifyOnPermission?: boolean }) => {
    await detectClaude();
    try {
      if (id) {
        await attachOrRestore(id);
        return;
      }
      const decision = await decideAction(process.cwd());
      switch (decision.kind) {
        case 'create': {
          const level = await promptPermissionLevel();
          await createOrchestra({
            repoRoot: decision.repoRoot,
            orchestraId: decision.orchestraId,
            permissionLevel: level,
            notifyOnPermission: opts.notifyOnPermission,
          });
          return;
        }
        case 'attach_existing':
          await attachOrRestore(decision.orchestraId);
          return;
        case 'pick': {
          const picked = await promptOrchestraPicker(decision.summaries);
          await attachOrRestore(picked);
          return;
        }
        case 'error':
          console.error(decision.message);
          process.exit(1);
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all known orchestras')
  .action(async () => {
    const summaries = await listOrchestras();
    console.log(formatOrchestraList(summaries));
  });

program
  .command('restore <id>')
  .description('Force-restore a stopped orchestra')
  .option('--notify-on-permission', 'bell + desktop notify when a musician awaits permission')
  .action(async (id: string, opts: { notifyOnPermission?: boolean }) => {
    const { restoreOrchestra } = await import('./commands/restore.js');
    await restoreOrchestra(id, undefined, opts.notifyOnPermission);
  });

program
  .command('kill <id>')
  .description('Tear down an orchestra (state archived, notes preserved)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (id: string, opts: { yes?: boolean }) => {
    const { killOrchestra } = await import('./commands/kill.js');
    await killOrchestra(id, opts);
  });

program
  .command('notes <id>')
  .description('Open the orchestra\'s notes/ directory in $EDITOR')
  .action(async (id: string) => {
    const { openNotes } = await import('./commands/notes.js');
    await openNotes(id);
  });

program
  .command('mcp-server', { hidden: true })
  .description('(internal) Run the NFO MCP server attached to an orchestra')
  .requiredOption('--orchestra-id <id>', 'Orchestra id')
  .option('--caller-musician-id <id>', 'When the server is hosting a Musician')
  .action(async (opts: { orchestraId: string; callerMusicianId?: string }) => {
    const { runMcpServerCli } = await import('./commands/mcp-server.js');
    await runMcpServerCli({
      orchestraId: opts.orchestraId,
      callerMusicianId: opts.callerMusicianId,
    });
  });

program
  .command('tui', { hidden: true })
  .description('(internal) Run the NFO Ink TUI for an orchestra')
  .requiredOption('--orchestra-id <id>', 'Orchestra id')
  .action(async (opts: { orchestraId: string }) => {
    const { runTui } = await import('./commands/tui.js');
    await runTui({ orchestraId: opts.orchestraId });
  });

program.parseAsync(process.argv);

async function promptPermissionLevel(): Promise<PermissionLevel> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(
      `Permission level for this orchestra:
  1) auto        — RISKY: bypasses all permission checks
  2) autonomous  — auto-accept edits, prompt on risky tools
  3) supervised  — claude's default prompt-on-risky behavior
  4) strict      — read-only / plan mode
Choose [1-4] (default 3): `,
    )).trim();

    const map: Record<string, PermissionLevel> = {
      '1': 'auto', '2': 'autonomous', '3': 'supervised', '4': 'strict', '': 'supervised',
    };
    const level = map[ans];
    if (!level || !isPermissionLevel(level)) {
      throw new Error(`Invalid choice: ${ans}`);
    }

    if (level === 'auto') {
      console.log('\n' + AUTO_WARNING + '\n');
      const confirm = (await rl.question('> ')).trim();
      if (confirm !== AUTO_CONFIRM_PHRASE) {
        throw new Error('Auto mode not confirmed. Aborting.');
      }
    }

    return level;
  } finally {
    rl.close();
  }
}

async function promptOrchestraPicker(summaries: OrchestraSummary[]): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Multiple orchestras found:');
    summaries.forEach((s, i) => {
      console.log(`  ${i + 1}) ${s.running ? '●' : '○'} ${s.id}  (${s.project_path})`);
    });
    const choice = (await rl.question('Pick one [1-N]: ')).trim();
    const idx = Number(choice) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= summaries.length) {
      throw new Error('Invalid choice');
    }
    return summaries[idx].id;
  } finally {
    rl.close();
  }
}
