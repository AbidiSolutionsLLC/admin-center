// MOCK_EMAIL=true keeps test-harness mail in-process (nodemailer JSON transport) and is ignored in production.
// Each case loads a fresh copy of emailService, because it caches its transporter at module level.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const MODULE = require.resolve('../emailService');
const saved = { ...process.env };

function freshEmailService(): typeof import('../emailService') {
  delete require.cache[MODULE];
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../emailService');
}

afterEach(() => {
  for (const k of ['MOCK_EMAIL', 'NODE_ENV', 'SMTP_HOST', 'SMTP_PORT', 'AZURE_COMMUNICATION_CONNECTION_STRING', 'SENDER_EMAIL_ADDRESS']) {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }
  delete require.cache[MODULE];
});

test('MOCK_EMAIL=true outside production uses the in-process JSON transport and sends without any network', async () => {
  Object.assign(process.env, { MOCK_EMAIL: 'true', NODE_ENV: 'development' });
  delete process.env.SMTP_HOST;
  delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  const svc = freshEmailService();
  const tp = await svc.getTransporter();
  assert.equal((tp.options as { jsonTransport?: boolean }).jsonTransport, true);
  await svc.sendEmail({ to: 'person@example.test', subject: 'mock', html: '<p>x</p>', text: 'x' });
});

test('MOCK_EMAIL=true is ignored in production (the configured SMTP transport is used)', async () => {
  Object.assign(process.env, { MOCK_EMAIL: 'true', NODE_ENV: 'production', SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525' });
  const svc = freshEmailService();
  const tp = await svc.getTransporter();
  assert.notEqual((tp.options as { jsonTransport?: boolean }).jsonTransport, true);
  assert.equal((tp.options as { host?: string }).host, '127.0.0.1');
});
