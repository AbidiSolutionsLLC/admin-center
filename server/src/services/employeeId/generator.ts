import { ALLOWED_TOKENS, TOKEN_PATTERN, TokenContext } from './tokens';
import { validateEmployeeIdFormat } from './validator';

export function generateEmployeeId(format: string, context: TokenContext): string {
  const validation = validateEmployeeIdFormat(format);
  if (!validation.valid) {
    throw new Error(`Invalid employee ID format: ${validation.errors.map((error) => error.message).join(' ')}`);
  }

  const generated = format.replace(TOKEN_PATTERN, (_raw, rawToken, argument) => {
    const tokenName = rawToken.toUpperCase() === 'COUNTER' ? 'counter' : rawToken.toUpperCase();
    const tokenDef = ALLOWED_TOKENS[tokenName];

    if (!tokenDef) {
      throw new Error(`Unsupported token: {${rawToken}}`);
    }

    return tokenDef.resolve(context, argument);
  });

  if (generated.length > 50) {
    throw new Error('Generated employee ID exceeds the maximum allowed length of 50 characters.');
  }

  return generated;
}
