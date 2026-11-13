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
  const { adminSpaOrigin, productsSpaOrigin, operatorSpaOrigin, isProduction } = getIdentityConfig();
  const formActions = new Set<string>(['self', adminSpaOrigin, productsSpaOrigin, operatorSpaOrigin]);
  if (!isProduction) {
    for (const origin of [adminSpaOrigin, productsSpaOrigin, operatorSpaOrigin]) {
      try {
        const u = new URL(origin);
        if (u.port) {
          formActions.add(`http://localhost:${u.port}`);
          formActions.add(`http://127.0.0.1:${u.port}`);
        }
      } catch {}
    }
  }
  return [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    `form-action ${Array.from(formActions).map((a) => (a === 'self' ? "'self'" : a)).join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; ');
}

// Palette mirrors the Admin console (Tailwind slate scale + Karbexa indigo #3b5bdb).
const CSS = `
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;
background:#f8fafc;color:#0f172a;-webkit-font-smoothing:antialiased;
font:15px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.brand{display:flex;align-items:center;gap:10px;margin:0 0 20px}
.brand svg{display:block}.brand-name{font-size:18px;font-weight:700;letter-spacing:-.01em;color:#0f172a}
.brand-badge{font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#3b5bdb;background:#eef2ff;
border:1px solid #dbe4ff;border-radius:9999px;padding:2px 8px}
main{width:100%;max-width:400px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;
box-shadow:0 10px 25px -5px rgba(0,0,0,.05),0 8px 10px -6px rgba(0,0,0,.01)}
h1{font-size:20px;font-weight:700;letter-spacing:-.01em;line-height:1.3;margin:0 0 6px;color:#0f172a}
p.sub{margin:0 0 20px;color:#475569;font-size:14px}
label{display:block;font-size:14px;font-weight:600;color:#334155;margin:16px 0 6px}
input[type=email],input[type=password],input[type=text]{width:100%;height:40px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px;
background:#fff;color:#0f172a;font:inherit;transition:border-color .15s,box-shadow .15s}
input::placeholder{color:#94a3b8}
input:focus{outline:none;border-color:#3b5bdb;box-shadow:0 0 0 3px rgba(59,91,219,.15)}
input.otp{height:48px;letter-spacing:.25em;text-align:center;font-size:1.25rem;font-weight:600;font-variant-numeric:tabular-nums}
button,.btn{display:block;width:100%;margin-top:20px;padding:10px 14px;border:1px solid transparent;border-radius:8px;background:#3b5bdb;
color:#fff;font:inherit;font-weight:600;font-size:15px;text-align:center;text-decoration:none;cursor:pointer;transition:background .15s,box-shadow .15s}
button:hover,.btn:hover{background:#334ecc}
button:focus-visible,.btn:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(59,91,219,.3)}
.btn.alt{background:#fff;color:#0f172a;border-color:#cbd5e1;margin-top:12px}.btn.alt:hover{background:#f8fafc}
.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;margin:0 0 16px;font-size:14px}
.links{margin-top:20px;font-size:14px;text-align:center;color:#94a3b8}.links a{color:#3b5bdb;text-decoration:none}.links a:hover{text-decoration:underline}
code{display:block;word-break:break-all;background:#f1f5f9;padding:8px;border-radius:6px;font-size:13px;margin:6px 0}
.or{display:flex;align-items:center;gap:12px;color:#94a3b8;margin:20px 0 0;font-size:13px}
.or::before,.or::after{content:"";flex:1;height:1px;background:#e2e8f0}
.section-title{font-size:14px;font-weight:600;color:#0f172a;margin:0 0 4px}
.hint{font-size:13px;color:#475569;margin:0}
.qr{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:20px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
.qr img{display:block;width:200px;height:200px;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;image-rendering:pixelated}
details.manual{margin-top:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
details.manual summary{cursor:pointer;padding:10px 14px;font-size:14px;font-weight:500;color:#3b5bdb;list-style:none}
details.manual summary::-webkit-details-marker{display:none}
details.manual summary::before{content:"\\25B8";display:inline-block;margin-right:6px;transition:transform .15s}
details.manual[open] summary::before{transform:rotate(90deg)}
.manual-body{padding:0 14px 14px}
.key-row{display:flex;align-items:center;gap:8px;margin-top:8px}
.key{flex:1;margin:0;font:600 14px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;color:#0f172a;
background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:9px 10px;word-break:break-word}
button.copy{width:auto;flex:none;margin:0;padding:8px 12px;font-size:13px;background:#fff;color:#0f172a;border-color:#cbd5e1}
button.copy:hover{background:#f8fafc}button.copy.done{color:#15803d;border-color:#86efac;background:#f0fdf4}
.deeplink{display:inline-block;margin-top:10px;font-size:13px;color:#3b5bdb;text-decoration:none}.deeplink:hover{text-decoration:underline}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}`;

const LOGO = `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
<rect width="32" height="32" rx="8" fill="#3b5bdb"/><path d="M11 8v16M11 16.5 20.5 8M13.5 14.5 21 24" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

/** Copy-to-clipboard for any `button[data-copy]`; falls back to execCommand where the async API is unavailable. */
const COPY_SCRIPT = `document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-copy]');if(!b)return;
var v=b.getAttribute('data-copy'),label=b.textContent,s=document.getElementById('copy-status');
function ok(){b.textContent='Copied';b.classList.add('done');if(s)s.textContent='Setup key copied to clipboard';
setTimeout(function(){b.textContent=label;b.classList.remove('done');if(s)s.textContent='';},2000);}
function legacy(){var t=document.createElement('textarea');t.value=v;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';
document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(_){}document.body.removeChild(t);}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).then(ok,legacy);}else{legacy();}});`;

export function pageShell(nonce: string, title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · Karbexa</title><style nonce="${nonce}">${CSS}</style></head>
<body><header class="brand">${LOGO}<span class="brand-name">Karbexa</span><span class="brand-badge">Identity</span></header>
<main>${body}</main><script nonce="${nonce}">${COPY_SCRIPT}</script></body></html>`;
}
