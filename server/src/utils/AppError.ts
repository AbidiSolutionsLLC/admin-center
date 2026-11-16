export class AppError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;
  /** Optional structured detail returned to the client as `details` (additive; e.g. SEAT_LIMIT_REACHED). */
  details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
  }
}
