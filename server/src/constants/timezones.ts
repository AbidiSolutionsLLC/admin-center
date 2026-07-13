// server/src/constants/timezones.ts
// Shared IANA timezone constants and validation for the backend.

/**
 * Full list of valid IANA timezone identifiers.
 * Populated from Intl.supportedValuesOf('timeZone') at startup (Node 16+).
 * Falls back to an empty array on older runtimes — client-side already restricts values.
 */
let ALL_IANA_TIMEZONES: string[] = [];
try {
  ALL_IANA_TIMEZONES = (Intl as any).supportedValuesOf('timeZone') as string[];
} catch {
  // Intl.supportedValuesOf not available (Node < 16)
  ALL_IANA_TIMEZONES = [];
}

export { ALL_IANA_TIMEZONES };

/**
 * Curated list of commonly used timezones for dropdowns and defaults.
 * Ordered by region for easy scanning.
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
 * Checks whether a string is a valid IANA timezone identifier.
 * If the runtime supports Intl.supportedValuesOf, performs a full check.
 * Otherwise, falls back to a basic non-empty string check.
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  if (ALL_IANA_TIMEZONES.length > 0) {
    return ALL_IANA_TIMEZONES.includes(tz);
  }
  // Fallback: accept any non-empty string (client already restricts the list)
  return tz.length > 0;
}
