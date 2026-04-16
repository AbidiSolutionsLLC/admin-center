import { ALLOWED_CHARS_PATTERN, ALLOWED_TOKENS, TOKEN_PATTERN } from './tokens';

export interface ValidationError {
  code: string;
  message: string;
  position?: number;
}

export interface ValidationWarning {
  code: string;
  message: string;
}

export interface ParsedToken {
  token: string;
  argument?: string;
  position: number;
  raw: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  parsedTokens: ParsedToken[];
}

const CONSTRAINTS = {
  MAX_LENGTH: 50,
  MAX_TOKENS: 10,
  MIN_COUNTER_DIGITS: 1,
  MAX_COUNTER_DIGITS: 7,
  FORBIDDEN_PATTERNS: [
    /\$\{/,        // No JS template literals
    /\{\{/,        // No nested braces
    /\}\}/,        // No nested braces
    /eval/i,       // No eval
    /function/i,   // No functions
    /=>/,          // No arrow functions
    /\.repeat/i,  // No string methods
  ] as const,
} as const;

export function validateEmployeeIdFormat(format: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const parsedTokens: ParsedToken[] = [];

  if (!format || typeof format !== 'string') {
    errors.push({ code: 'EMPTY_FORMAT', message: 'Employee ID format cannot be empty.' });
    return { valid: false, errors, warnings, parsedTokens };
  }

  if (format.length > CONSTRAINTS.MAX_LENGTH) {
    errors.push({
      code: 'TOO_LONG',
      message: `Format must be ${CONSTRAINTS.MAX_LENGTH} characters or fewer.`,
    });
  }

  for (const pattern of CONSTRAINTS.FORBIDDEN_PATTERNS) {
    if (pattern.test(format)) {
      errors.push({
        code: 'FORBIDDEN_PATTERN',
        message: 'Format contains forbidden content.',
      });
      break;
    }
  }

  if (!ALLOWED_CHARS_PATTERN.test(format)) {
    errors.push({
      code: 'INVALID_CHARACTERS',
      message: 'Format contains invalid characters. Allowed characters are letters, numbers, hyphens, underscores, braces, and colons.',
    });
  }

  const tokenRegex = new RegExp(TOKEN_PATTERN);
  let match: RegExpExecArray | null;
  let hasCounter = false;
  let tokenCount = 0;

  while ((match = tokenRegex.exec(format)) !== null) {
    tokenCount += 1;
    const [, rawToken, argument] = match;
    const position = match.index;
    const tokenName = rawToken.toUpperCase() === 'COUNTER' ? 'counter' : rawToken.toUpperCase();

    parsedTokens.push({
      token: tokenName,
      argument,
      position,
      raw: match[0],
    });

    const tokenDef = ALLOWED_TOKENS[tokenName];
    if (!tokenDef) {
      errors.push({
        code: 'INVALID_TOKEN',
        message: `Unknown token: {${rawToken}}. Allowed tokens are: ${Object.keys(ALLOWED_TOKENS).join(', ')}.`,
        position,
      });
      continue;
    }

    if (tokenName === 'counter') {
      hasCounter = true;
    }

    if (tokenDef.hasArgument) {
      if (!argument) {
        errors.push({
          code: 'MISSING_ARGUMENT',
          message: `Token {${tokenDef.token}} requires an argument. Example: {${tokenDef.token}:4}.`,
          position,
        });
      } else if (tokenDef.argumentPattern && !tokenDef.argumentPattern.test(argument)) {
        errors.push({
          code: 'INVALID_ARGUMENT',
          message: `Invalid argument for {${tokenDef.token}}. ${tokenDef.argumentDescription || 'Please provide a valid number.'}`,
          position,
        });
      } else {
        const digits = parseInt(argument, 10);
        if (digits < CONSTRAINTS.MIN_COUNTER_DIGITS || digits > CONSTRAINTS.MAX_COUNTER_DIGITS) {
          errors.push({
            code: 'INVALID_COUNTER_DIGITS',
            message: `Counter padding must be between ${CONSTRAINTS.MIN_COUNTER_DIGITS} and ${CONSTRAINTS.MAX_COUNTER_DIGITS} digits.`,
            position,
          });
        }
      }
    }
  }

  if (tokenCount > CONSTRAINTS.MAX_TOKENS) {
    warnings.push({
      code: 'TOO_MANY_TOKENS',
      message: `Format has too many tokens. Use no more than ${CONSTRAINTS.MAX_TOKENS} tokens for maintainability.`,
    });
  }

  if (!hasCounter) {
    errors.push({
      code: 'MISSING_COUNTER',
      message: 'Format must contain a {counter:N} placeholder so IDs can be generated uniquely.',
    });
  }

  const stripped = format.replace(tokenRegex, '');
  if (stripped.includes('{') || stripped.includes('}')) {
    errors.push({
      code: 'MALFORMED_TOKEN',
      message: 'Format contains malformed token braces.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    parsedTokens,
  };
}
