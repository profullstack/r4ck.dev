/**
 * Where in-feed ad units go in a list of results.
 *
 * One after every `every`th row, never as the final row (an ad closing out a
 * list reads as part of the pager), and never more than `max` on one page, so a
 * 500-row page carries the same few units a 25-row one does.
 *
 * Returns the zero-based indexes of the rows an ad follows.
 */
export function adSlots(count, { every = 10, max = 3 } = {}) {
  const at = [];
  for (let i = every - 1; i < count - 1 && at.length < max; i += every) at.push(i);
  return at;
}
