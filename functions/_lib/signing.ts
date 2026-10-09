/** HMAC-SHA256 webhook signing. The receiver recomputes it over `${timestamp}.${body}`. */
const enc = new TextEncoder();

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signWebhook(secret: string, timestamp: number, body: string): Promise<string> {
  return 'sha256=' + (await hmacHex(secret, `${timestamp}.${body}`));
}
