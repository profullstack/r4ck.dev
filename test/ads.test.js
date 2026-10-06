import { describe, expect, test } from 'bun:test';
import { adSlots } from '@r4ck/core';

describe('adSlots', () => {
  test('a default 25-row page carries two, after rows 10 and 20', () => {
    expect(adSlots(25)).toEqual([9, 19]);
  });

  test('a long page is capped at three', () => {
    expect(adSlots(100)).toEqual([9, 19, 29]);
    expect(adSlots(500)).toHaveLength(3);
  });

  test('never closes out the list', () => {
    expect(adSlots(10)).toEqual([]);
    expect(adSlots(20)).toEqual([9]);
    expect(adSlots(21)).toEqual([9, 19]);
  });

  test('a short or empty list gets none', () => {
    expect(adSlots(0)).toEqual([]);
    expect(adSlots(9)).toEqual([]);
  });
});
