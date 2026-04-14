export interface TokenContext {
  date: Date;
  user: {
    department?: string;
    departmentCode?: string;
    location?: string;
    jobTitle?: string;
  };
  company: {
    code?: string;
    name?: string;
  };
  counter: number;
}

export interface TokenDefinition {
  token: string;
  description: string;
  example: string;
  hasArgument: boolean;
  argumentPattern?: RegExp;
  argumentDescription?: string;
  resolve: (context: TokenContext, arg?: string) => string;
}

export const TOKEN_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)(?::(\d{1,2}))?\}/g;
export const ALLOWED_CHARS_PATTERN = /^[A-Z0-9{}_:-]+$/i;

export const ALLOWED_TOKENS: Record<string, TokenDefinition> = {
  YYYY: {
    token: 'YYYY',
    description: 'Full year (4 digits)',
    example: '2026',
    hasArgument: false,
    resolve: (ctx) => ctx.date.getFullYear().toString(),
  },
  YY: {
    token: 'YY',
    description: 'Short year (2 digits)',
    example: '26',
    hasArgument: false,
    resolve: (ctx) => ctx.date.getFullYear().toString().slice(-2),
  },
  MM: {
    token: 'MM',
    description: 'Month (01-12)',
    example: '04',
    hasArgument: false,
    resolve: (ctx) => String(ctx.date.getMonth() + 1).padStart(2, '0'),
  },
  DD: {
    token: 'DD',
    description: 'Day (01-31)',
    example: '15',
    hasArgument: false,
    resolve: (ctx) => String(ctx.date.getDate()).padStart(2, '0'),
  },
  DEPT: {
    token: 'DEPT',
    description: 'Department code',
    example: 'HR',
    hasArgument: false,
    resolve: (ctx) => ctx.user.departmentCode || ctx.user.department?.slice(0, 3).toUpperCase() || 'GEN',
  },
  LOC: {
    token: 'LOC',
    description: 'Location code',
    example: 'NYC',
    hasArgument: false,
    resolve: (ctx) => ctx.user.location?.slice(0, 3).toUpperCase() || 'HQ',
  },
  COMP: {
    token: 'COMP',
    description: 'Company code',
    example: 'ABC',
    hasArgument: false,
    resolve: (ctx) => ctx.company.code || ctx.company.name?.slice(0, 3).toUpperCase() || 'CO',
  },
  counter: {
    token: 'counter',
    description: 'Sequential number with padding',
    example: '00001',
    hasArgument: true,
    argumentPattern: /^\d{1,2}$/,
    argumentDescription: 'Number of digits (1-6)',
    resolve: (ctx, arg) => {
      const digits = Math.min(Math.max(parseInt(arg || '4', 10), 1), 6);
      return ctx.counter.toString().padStart(digits, '0');
    },
  },
};

export const TOKEN_NAMES = Object.keys(ALLOWED_TOKENS);
