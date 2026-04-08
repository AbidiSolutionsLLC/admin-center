// src/utils/formatDate.ts

/**
 * Formats a date string into a human-readable format.
 * Example: "2024-03-15T10:30:00.000Z" → "Mar 15, 2024"
 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid Date';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Formats a date string with time.
 * Example: "2024-03-15T10:30:00.000Z" → "Mar 15, 2024, 10:30 AM"
 */
export function formatDateTime(dateStr: string): string {
  if (!dateStr) return 'N/A';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid Date';

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Returns relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return 'N/A';

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid Date';

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return formatDate(dateStr);
}
