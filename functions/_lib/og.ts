export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface OgMeta { title: string; description: string; image: string; url: string; siteName: string }

/** Replaces <title> and adds Open Graph / Twitter tags. All values are HTML-escaped. */
export function injectOg(html: string, m: OgMeta): string {
  const e = escapeHtml;
  const tags = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${e(m.siteName)}" />`,
    `<meta property="og:title" content="${e(m.title)}" />`,
    `<meta property="og:description" content="${e(m.description)}" />`,
    `<meta property="og:image" content="${e(m.image)}" />`,
    `<meta property="og:url" content="${e(m.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(m.title)}" />`,
    `<meta name="twitter:description" content="${e(m.description)}" />`,
    `<meta name="twitter:image" content="${e(m.image)}" />`,
  ].join('\n    ');
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${e(m.title)}</title>`)
    .replace(/<meta (property="og:image"|name="twitter:(card|image)")[^>]*>\s*/gi, '')
    .replace(/<meta name="description"[^>]*>/i, `<meta name="description" content="${e(m.description)}" />`)
    .replace('</head>', `    ${tags}\n  </head>`);
}
