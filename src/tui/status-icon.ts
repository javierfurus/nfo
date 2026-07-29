import type { MusicianStatus } from '../state.types.js';

export function statusIcon(status: MusicianStatus): string {
  switch (status) {
    case 'working': {
      return '●';
    }
    case 'idle': {
      return '◐';
    }
    case 'awaiting_permission': {
      return '⚠';
    }
    case 'stopped': {
      return '○';
    }
  }
}

export function statusColor(status: MusicianStatus): string {
  switch (status) {
    case 'working': {
      return 'green';
    }
    case 'idle': {
      return 'yellow';
    }
    case 'awaiting_permission': {
      return 'red';
    }
    case 'stopped': {
      return 'gray';
    }
  }
}
