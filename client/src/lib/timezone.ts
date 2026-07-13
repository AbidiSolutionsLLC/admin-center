// client/src/lib/timezone.ts
// Shared timezone utility functions for consistent time formatting across the app.
// Uses Intl.DateTimeFormat which automatically handles DST for IANA timezone strings.

import type { User, Location } from '@/types';

/**
 * Formats a date in the given timezone.
 * @param date - Date object or ISO string
 * @param timezone - IANA timezone string (e.g. 'America/New_York')
 * @param format - Output format: 'time' (HH:MM AM/PM), 'datetime' (full date + time), 'date' (date only)
 * @returns Formatted string, or 'N/A' if timezone is invalid
 */
export function formatTimeInTimezone(
  date: Date | string,
  timezone: string,
  format: 'time' | 'datetime' | 'date' = 'time'
): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    const options: Intl.DateTimeFormatOptions =
      format === 'time'
        ? { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: true }
        : format === 'datetime'
        ? {
            timeZone: timezone,
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }
        : { timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric' };

    return new Intl.DateTimeFormat('en-US', options).format(d);
  } catch {
    return 'N/A';
  }
}

/**
 * Returns the UTC offset string for a timezone (e.g. 'UTC+5:30', 'UTC-4').
 * Note: The offset varies with DST — this returns the current offset.
 * @param timezone - IANA timezone string
 * @returns Formatted offset string
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date();
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
    const sign = diffMinutes >= 0 ? '+' : '-';
    const absDiff = Math.abs(diffMinutes);
    const hours = Math.floor(absDiff / 60);
    const minutes = absDiff % 60;
    return minutes > 0 ? `UTC${sign}${hours}:${minutes.toString().padStart(2, '0')}` : `UTC${sign}${hours}`;
  } catch {
    return '';
  }
}

/**
 * Resolves the effective timezone for a user.
 * Priority: user's location timezone → company default timezone → 'UTC'
 * @param user - User object (may have location with timezone)
 * @param companyTimezone - Company-level default timezone
 * @returns IANA timezone string
 */
export function resolveUserTimezone(
  user: Pick<User, 'location'>,
  companyTimezone?: string
): string {
  const locationTz = user.location?.timezone;
  if (locationTz) return locationTz;
  if (companyTimezone) return companyTimezone;
  return 'UTC';
}

/**
 * Returns the local time in a location's timezone.
 * Convenience wrapper for formatting "now" in a location's timezone.
 * @param timezone - IANA timezone string
 * @returns Formatted time string
 */
export function getLocalTime(timezone: string): string {
  return formatTimeInTimezone(new Date(), timezone, 'time');
}

/**
 * Returns the full local date-time in a location's timezone.
 * @param timezone - IANA timezone string
 * @returns Formatted datetime string
 */
export function getLocalDateTime(timezone: string): string {
  return formatTimeInTimezone(new Date(), timezone, 'datetime');
}
