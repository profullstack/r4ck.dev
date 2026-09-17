import { describe, expect, test } from 'bun:test';
import { checkHeaders, era, negotiate } from '../apps/web/src/lib/mcp/protocol.js';
import {
  describe as describeTool,
  OPEN_TOOLS,
  TOOLS,
  TOOLS_BY_NAME,
} from '../apps/web/src/lib/mcp/tools.js';

describe('mcp protocol', () => {
  test('eras', () => {
    expect(era({ method: 'initialize' })).toBe('legacy');
    expect(
      era({
        method: 'tools/call',
        params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
      }),
    ).toBe('modern');
    expect(negotiate('2025-03-26')).toBe('2025-03-26');
    expect(negotiate('1999-01-01')).toBe('2025-11-25');
  });
  test('modern headers must agree with the body', () => {
    const msg = {
      method: 'tools/call',
      params: {
        name: 'search_servers',
        _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' },
      },
    };
    const h = {
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'search_servers',
    };
    expect(checkHeaders(msg, (n) => h[n] ?? null)).toBeNull();
    expect(
      checkHeaders(msg, (n) => ({ ...h, 'mcp-name': 'delete_saved_search' })[n] ?? null)?.message,
    ).toContain('Mcp-Name');
  });
});

describe('mcp tools', () => {
  test('every tool describes itself with a schema', () => {
    for (const t of TOOLS) {
      const d = describeTool(t);
      expect(d.inputSchema.type).toBe('object');
      expect(d.description.length).toBeGreaterThan(20);
      expect(TOOLS_BY_NAME.get(t.name)).toBe(t);
    }
  });
  test('the open list excludes account tools', () => {
    expect(OPEN_TOOLS).toContain('search_servers');
    expect(OPEN_TOOLS).not.toContain('save_search');
  });
});
