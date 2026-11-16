// Plan 4.7: AppError may carry `details`, returned additively by the error handler (SEAT_LIMIT_REACHED uses it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../utils/AppError';
import { errorHandler } from '../../middleware/errorHandler';

const run = (err: unknown) => {
  let status = 0;
  let body: any;
  const res: any = { status(c: number) { status = c; return this; }, json(b: unknown) { body = b; return this; } };
  errorHandler(err, {} as any, res, () => undefined);
  return { status, body };
};

test('details are included when present', () => {
  const { status, body } = run(new AppError('Too many seats', 409, 'SEAT_LIMIT_REACHED', { product_key: 'sign', limit: 2, used: 2, requested: 1 }));
  assert.equal(status, 409);
  assert.deepEqual(body, { success: false, error: 'Too many seats', code: 'SEAT_LIMIT_REACHED', details: { product_key: 'sign', limit: 2, used: 2, requested: 1 } });
});

test('without details the response is unchanged', () => {
  const { body } = run(new AppError('Nope', 404, 'NOT_FOUND'));
  assert.deepEqual(body, { success: false, error: 'Nope', code: 'NOT_FOUND' });
});
