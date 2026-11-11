// L3-8: proves the SMTP send path (emailService -> nodemailer) works end to end against a local fake SMTP server.
// Added with the nodemailer 8 -> 10 upgrade; no database and no external network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'net';
import type { AddressInfo } from 'net';

interface Captured { mailFrom: string; rcpt: string[]; data: string; authed: boolean }
const captured: Captured[] = [];
let server: net.Server;

before(async () => {
  server = net.createServer((sock) => {
    let buf = '';
    let inData = false;
    let cur: Captured = { mailFrom: '', rcpt: [], data: '', authed: false };
    const send = (line: string) => sock.write(`${line}\r\n`);
    send('220 fake.smtp ESMTP');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end === -1) return;
          cur.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          captured.push(cur);
          cur = { mailFrom: '', rcpt: [], data: '', authed: false };
          send('250 2.0.0 queued');
          continue;
        }
        const eol = buf.indexOf('\r\n');
        if (eol === -1) return;
        const line = buf.slice(0, eol);
        buf = buf.slice(eol + 2);
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) { sock.write('250-fake.smtp\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n'); }
        else if (cmd.startsWith('AUTH')) { cur.authed = true; send('235 2.7.0 ok'); }
        else if (cmd.startsWith('MAIL FROM')) { cur.mailFrom = line; send('250 ok'); }
        else if (cmd.startsWith('RCPT TO')) { cur.rcpt.push(line); send('250 ok'); }
        else if (cmd === 'DATA') { inData = true; send('354 go ahead'); }
        else if (cmd === 'QUIT') { send('221 bye'); sock.end(); }
        else send('250 ok');
      }
    });
    sock.on('error', () => undefined);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
});

after(() => { server.close(); });

test('sendEmail delivers through SMTP with nodemailer (envelope, subject, html and text parts)', async () => {
  const port = (server.address() as AddressInfo).port;
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'false', SMTP_USER: 'u', SMTP_PASS: 'p', EMAIL_FROM: 'noreply@sender.test' });
  delete process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  delete process.env.SENDER_EMAIL_ADDRESS;
  const { sendEmail } = await import('../emailService');
  await sendEmail({ to: 'person@example.test', subject: 'Nodemailer 10 smoke', html: '<p>Hello <b>there</b></p>', text: 'Hello there' });
  assert.equal(captured.length, 1);
  const msg = captured[0];
  assert.match(msg.mailFrom, /noreply@sender\.test/);
  assert.deepEqual(msg.rcpt.map((r) => /<([^>]+)>/.exec(r)?.[1]), ['person@example.test']);
  assert.equal(msg.authed, true);
  assert.match(msg.data, /^Subject: Nodemailer 10 smoke$/m);
  assert.match(msg.data, /Content-Type: text\/html/i);
  assert.match(msg.data, /Content-Type: text\/plain/i);
  assert.match(msg.data, /Hello/);
});

test('sendEmail skips an invalid recipient without opening a connection', async () => {
  const { sendEmail } = await import('../emailService');
  const before = captured.length;
  await sendEmail({ to: 'not-an-address', subject: 's', html: '<p>x</p>' });
  assert.equal(captured.length, before);
});
