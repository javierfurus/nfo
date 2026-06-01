import { sendKeys, sessionName } from '../tmux.js';

export interface MusicianDoneReport {
  musicianId: string;
  musicianName: string;
  summary: string;
  nextSteps?: string | null;
}

export function formatMusicianDonePrompt(report: MusicianDoneReport): string {
  const nextSteps = report.nextSteps?.trim()
    ? `\nSuggested next steps from the Musician:\n${report.nextSteps.trim()}\n`
    : '';

  return `Musician ${report.musicianId} (${report.musicianName}) reported done and is now idle.

Summary:
${report.summary}
${nextSteps}
Resolve this now with an NFO tool call only:
- If the work is good enough, call dismiss_musician({ musician_id: ${JSON.stringify(report.musicianId)} }).
- If it needs another pass, call message_musician({ musician_id: ${JSON.stringify(report.musicianId)}, message: "..." }).

Do not leave this Musician idle without either dismissing it or sending the next iteration.
A plain-text acknowledgement is invalid here.`;
}

export async function notifyOrchestratorOfDoneReport(
  orchestraId: string,
  report: MusicianDoneReport,
): Promise<void> {
  await sendKeys(`${sessionName(orchestraId)}:0`, formatMusicianDonePrompt(report), true);
}
