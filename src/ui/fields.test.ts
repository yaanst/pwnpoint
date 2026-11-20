import { describe, expect, it } from 'vitest';
import { parseLines } from './fields';

describe('parseLines', () => {
  it('trims lines and drops empty ones', () => {
    expect(parseLines(' dc01.acme.local \n\n  https://app.acme.com\r\n ')).toEqual([
      'dc01.acme.local',
      'https://app.acme.com',
    ]);
  });
});
