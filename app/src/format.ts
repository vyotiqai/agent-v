/** Dates and times as the app writes them: "25 September", "3 days ago". */

const DAY = 24 * 60 * 60 * 1000;

/** "25 September", with the year only when it isn't this year. */
export function day(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  }).format(d);
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "3 days ago", then the day. */
export function ago(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.floor(ms / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return `on ${day(iso, now)}`;
}
