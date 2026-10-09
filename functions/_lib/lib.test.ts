import { describe, it, expect } from 'vitest';
import { signWebhook, hmacHex } from './signing';
import { injectOg, escapeHtml } from './og';
import { statusForError } from './api';
import { createHmac } from 'node:crypto';

describe('webhook signing', () => {
  it('matches a reference HMAC-SHA256 (what a receiver in Node would compute)', async () => {
    const body = '{"a":1}';
    const expected = 'sha256=' + createHmac('sha256', 'whsec_x').update(`1700000000.${body}`).digest('hex');
    expect(await signWebhook('whsec_x', 1700000000, body)).toBe(expected);
  });
  it('changes when the body or secret changes', async () => {
    expect(await hmacHex('a', 'm')).not.toBe(await hmacHex('b', 'm'));
    expect(await hmacHex('a', 'm1')).not.toBe(await hmacHex('a', 'm2'));
  });
});

describe('open graph injection', () => {
  const shell = '<html><head><title>App</title><meta name="description" content="x" /><meta property="og:image" content="/d.png"><meta name="twitter:card" content="summary_large_image"></head><body></body></html>';
  it('escapes tournament-controlled text (no HTML injection)', () => {
    const out = injectOg(shell, { title: '"><script>alert(1)</script>', description: "a'b", image: 'https://x/p.png', url: 'https://x/t/a', siteName: 'S' });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
  it('replaces default tags instead of duplicating them', () => {
    const out = injectOg(shell, { title: 'Cup', description: 'd', image: 'https://x/p.png', url: 'https://x/t/a', siteName: 'S' });
    expect(out.match(/og:image/g)!.length).toBe(1);
    expect(out.match(/twitter:card/g)!.length).toBe(1);
    expect(out).toContain('<title>Cup</title>');
  });
  it('escapeHtml', () => expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;'));
});

describe('api error mapping', () => {
  it.each([['invalid_key', 401], ['tournament_not_found', 404], ['already_registered', 409], ['tournament_full', 409], ['invalid_phone', 422], ['rate_limited', 429], ['x', 400]])(
    '%s -> %i', (code, status) => expect(statusForError(code)).toBe(status));
});
