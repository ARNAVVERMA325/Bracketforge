export function cn(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function formatINR(amount: number): string {
  if (amount === 0 || amount == null) return 'Free';
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatIST(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDateIST(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimeIST(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function generateUniqueSlug(title: string, existing: string[] = []): string {
  const base = slugify(title) || 'tournament';
  let slug = base;
  let counter = 1;
  while (existing.includes(slug)) {
    slug = `${base}-${counter}`;
    counter++;
  }
  return slug;
}

export function validateIndianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  const normalized = cleaned.startsWith('91') && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
  return /^[6-9]\d{9}$/.test(normalized);
}

export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  const normalized = cleaned.startsWith('91') && cleaned.length === 12 ? cleaned.slice(2) : cleaned;
  return normalized;
}

export function formatPhoneMasked(phone: string): string {
  const normalized = normalizePhone(phone);
  if (normalized.length !== 10) return phone;
  return `+91 ••••••${normalized.slice(-4)}`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
