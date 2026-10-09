import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv } from './csv';

describe('csv', () => {
  it('round-trips commas, quotes and newlines', () => {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2' }], ['a', 'b', 'c']);
    expect(parseCsv(csv)).toEqual([['a', 'b', 'c'], ['x,y', 'say "hi"', 'l1\nl2']]);
  });
  it('neutralises spreadsheet formulas', () => {
    expect(toCsv([{ a: '=SUM(A1)' }, { a: '+91 98' }], ['a'])).toContain("'=SUM(A1)");
  });
  it('handles BOM, CRLF and blank lines', () => {
    expect(parseCsv('\uFEFFname,phone\r\nA,9876543210\r\n\r\n')).toEqual([['name', 'phone'], ['A', '9876543210']]);
  });
});
