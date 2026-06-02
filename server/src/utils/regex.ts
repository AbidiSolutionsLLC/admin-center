/**
 * Escapes special characters in a string for use in a regular expression.
 * Prevents Regex Injection and ReDoS attacks.
 * 
 * @param string - The string to escape
 * @returns Escaped string
 */
export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
};
