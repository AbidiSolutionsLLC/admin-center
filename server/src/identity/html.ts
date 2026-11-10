// server/src/identity/html.ts
// Server-rendered pages for the hosted login: inline CSS, per-response CSP nonce, no external assets.
import crypto from 'crypto';
import { getIdentityConfig } from './config';

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const newNonce = () => crypto.randomBytes(16).toString('base64');

/**
 * Forms post only to our own origin; `form-action` also lists the SPA origins because browsers
 * apply it to the redirect chain that follows a submission (login → resume → SPA callback).
 */
export function pageCsp(nonce: string): string {
  const { adminSpaOrigin, productsSpaOrigin, operatorSpaOrigin } = getIdentityConfig();
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    `form-action 'self' ${adminSpaOrigin} ${productsSpaOrigin} ${operatorSpaOrigin}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
}

const CSS = `
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f4f6fb;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1c2333}
main{width:100%;max-width:380px;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(20,30,60,.08);padding:32px}
h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 20px;color:#5b6478}label{display:block;font-weight:600;margin:14px 0 6px}
input[type=email],input[type=password],input[type=text]{width:100%;padding:10px 12px;border:1px solid #cdd3df;border-radius:8px;font:inherit}
input:focus{outline:2px solid #3b5bdb;outline-offset:1px}
button,.btn{display:block;width:100%;margin-top:20px;padding:11px;border:0;border-radius:8px;background:#3b5bdb;color:#fff;
font:600 15px inherit;text-align:center;text-decoration:none;cursor:pointer}
.btn.alt{background:#fff;color:#1c2333;border:1px solid #cdd3df;margin-top:12px}
.err{background:#fdecec;color:#a61b1b;border-radius:8px;padding:10px 12px;margin:0 0 12px}
.links{margin-top:16px;font-size:14px;text-align:center}.links a{color:#3b5bdb}
code{display:block;word-break:break-all;background:#f1f3f8;padding:8px;border-radius:6px;font-size:13px;margin:6px 0}
.or{text-align:center;color:#8a93a6;margin:18px 0 0;font-size:13px}`;

export function pageShell(nonce: string, title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · Karbexa</title><style nonce="${nonce}">${CSS}</style></head>
<body><main>${body}</main></body></html>`;
}
