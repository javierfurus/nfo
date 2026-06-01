import { describe, it, expect } from 'vitest';
import { NFO_TOOLS } from '../../src/mcp/tool-defs.js';

describe('NFO MCP tool definitions', () => {
  it('exposes the expected tool names', () => {
    const names = NFO_TOOLS.map(t => t.name).sort();
    expect(names).toEqual([
      'dismiss_musician',
      'list_musicians',
      'message_musician',
      'note_list',
      'note_read',
      'note_write',
      'query_musician',
      'report_done',
      'spawn_musician',
    ]);
  });

  it('every tool has a non-empty description and inputSchema with type "object"', () => {
    for (const tool of NFO_TOOLS) {
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema.type).toBe('object');
    }
  });

  it('spawn_musician exposes the optional model choice', () => {
    const spawnTool = NFO_TOOLS.find((tool) => tool.name === 'spawn_musician');
    expect(spawnTool?.inputSchema.properties.model).toEqual({
      type: 'string',
      enum: ['sonnet', 'haiku'],
      description: 'Optional subagent model (defaults to sonnet).',
    });
  });
});
