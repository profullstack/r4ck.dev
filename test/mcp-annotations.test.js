import { describe, expect, test } from 'bun:test';
import { describe as describeTool, TOOLS } from '../apps/web/src/lib/mcp/tools.js';

// Claude + ChatGPT directory rules: a human title and explicit hint booleans on every tool.
describe('mcp tool annotations', () => {
  test('every tool has a title and readOnly/destructive/openWorld hints', () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    for (const t of TOOLS.map(describeTool)) {
      expect(typeof t.title === 'string' && t.title.length > 0).toBe(true);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'openWorldHint']) {
        expect(typeof t.annotations[hint]).toBe('boolean');
      }
      if (t.annotations.readOnlyHint) expect(t.annotations.destructiveHint).toBe(false);
    }
  });
  test('deletes and secret rotation are destructive', () => {
    const d = TOOLS.map(describeTool)
      .filter((t) => t.annotations.destructiveHint)
      .map((t) => t.name);
    expect(d.sort()).toEqual(['delete_saved_search', 'delete_webhook', 'rotate_webhook_secret']);
  });
});
