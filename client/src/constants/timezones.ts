// client/src/constants/timezones.ts
// Shared IANA timezone constants for the frontend.
// Used by LocationForm and CompanySettingsPage for consistent timezone dropdowns.

/**
 * Curated list of commonly used IANA timezone identifiers.
 * Ordered by region for easy scanning.
 * These are all valid IANA strings — Intl.DateTimeFormat handles DST automatically.
 */
export const COMMON_TIMEZONES: string[] = [
  'UTC',
  // Americas
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Halifax',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Bogota',
  'America/Mexico_City',
  // Europe
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Brussels',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Istanbul',
  'Europe/Moscow',
  // Africa
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  // Asia
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Hong_Kong',
  // Oceania
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
];

/**
 * Groups timezones by region for categorized display.
 */
export const TIMEZONE_GROUPS = [
  {
    label: 'Americas',
    timezones: COMMON_TIMEZONES.filter(tz => tz.startsWith('America/')),
  },
  {
    label: 'Europe',
    timezones: COMMON_TIMEZONES.filter(tz => tz.startsWith('Europe/')),
  },
  {
    label: 'Africa',
    timezones: COMMON_TIMEZONES.filter(tz => tz.startsWith('Africa/')),
  },
  {
    label: 'Asia',
    timezones: COMMON_TIMEZONES.filter(tz => tz.startsWith('Asia/')),
  },
  {
    label: 'Oceania',
    timezones: COMMON_TIMEZONES.filter(tz => tz.startsWith('Australia/') || tz.startsWith('Pacific/')),
  },
];

/**
 * Formats a timezone string for display (e.g. "America/New_York" → "America / New York").
 */
export function formatTimezoneLabel(tz: string): string {
  return tz.replace(/_/g, ' ');
}
