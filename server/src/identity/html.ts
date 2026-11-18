// server/src/identity/html.ts
// Server-rendered pages for the hosted login: inline CSS, per-response CSP nonce, no external assets.
import crypto from 'crypto';
import { getIdentityConfig, ADMIN_SPA_CLIENT_ID, OPERATOR_SPA_CLIENT_ID, PRODUCTS_SPA_CLIENT_ID } from './config';

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

/**
 * Hosted-page look (see DESIGN.md "Tokens"). One Karbexa layout for every realm; the colour scheme follows the
 * app that started the sign-in: Products → light, Admin and Operator → dark, unknown → the browser's preference.
 */
export type ShellTheme = 'light' | 'dark' | 'auto';
export interface ShellOptions {
  theme?: ShellTheme;
  /** App the user is signing in to, shown as "to continue to …". */
  app?: string;
  /** Short label next to the logo (e.g. "Admin", "Operator"). */
  badge?: string;
  /** Visually flags a staff-only surface. */
  operator?: boolean;
}

const LIGHT = `--bg:#f1f2f5;--card:#fff;--text:#0f172a;--muted:#64748b;--label:#334155;--border:#e2e8f0;--input:#fff;
--input-border:#cbd5e1;--subtle:#f8fafc;--code:#f1f5f9;--link:#b45309;--err-bg:#fef2f2;--err-fg:#b91c1c;--err-bd:#fecaca;
--ok-fg:#15803d;--ok-bd:#86efac;--ok-bg:#f0fdf4;--shadow:0 10px 25px -5px rgba(15,23,42,.08);color-scheme:light;`;
const DARK = `--bg:#0b0f19;--card:#111827;--text:#f8fafc;--muted:#94a3b8;--label:#cbd5e1;--border:rgba(255,255,255,.08);
--input:rgba(255,255,255,.04);--input-border:rgba(255,255,255,.14);--subtle:rgba(255,255,255,.03);--code:rgba(255,255,255,.06);
--link:#fbbf24;--err-bg:rgba(239,68,68,.1);--err-fg:#fca5a5;--err-bd:rgba(239,68,68,.3);--ok-fg:#6ee7b7;--ok-bd:rgba(16,185,129,.4);
--ok-bg:rgba(16,185,129,.1);--shadow:0 8px 32px rgba(0,0,0,.37);color-scheme:dark;`;

const CSS = `
:root{--brand:#f59e0b;--brand-hover:#d97706;--on-brand:#1c1d21;--ring:rgba(245,158,11,.35);--panel:#1c1d21;${LIGHT}}
html[data-theme=dark]{${DARK}}
@media (prefers-color-scheme:dark){html[data-theme=auto]{${DARK}}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;grid-template-columns:minmax(320px,42%) 1fr;background:var(--bg);color:var(--text);
-webkit-font-smoothing:antialiased;font:15px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
.panel{background:var(--panel);color:#fff;padding:48px;display:flex;flex-direction:column;justify-content:space-between;gap:32px;
background-image:radial-gradient(circle at 20% 80%,rgba(245,158,11,.14) 0%,transparent 55%)}
.brand{display:flex;align-items:center;gap:10px;margin:0}
.brand svg{display:block}.brand-name{font-size:18px;font-weight:700;letter-spacing:-.01em;color:#fff}
.brand-badge{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#1c1d21;background:var(--brand);
border-radius:9999px;padding:2px 8px}
.brand-badge.op{background:#ef4444;color:#fff}
.pitch h2{font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-.02em;margin:0 0 12px;color:#fff}
.pitch p{margin:0;color:#9a9ca5;font-size:15px}.pitch .apps{margin-top:20px;display:flex;flex-wrap:wrap;gap:8px}
.pitch .apps span{font-size:12px;font-weight:600;color:#e5e7eb;border:1px solid rgba(255,255,255,.12);border-radius:9999px;padding:4px 10px}
.panel footer{font-size:12px;color:#6b7280}
.content{display:flex;align-items:center;justify-content:center;padding:32px 16px}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--border);border-radius:12px;padding:32px;box-shadow:var(--shadow)}
.app-context{margin:0 0 16px;font-size:13px;color:var(--muted)}.app-context strong{color:var(--text);font-weight:600}
.op-note{margin:0 0 16px;padding:8px 12px;border-radius:8px;font-size:13px;color:var(--err-fg);background:var(--err-bg);border:1px solid var(--err-bd)}
h1{font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.3;margin:0 0 6px;color:var(--text)}
p.sub{margin:0 0 20px;color:var(--muted);font-size:14px}
label{display:block;font-size:14px;font-weight:600;color:var(--label);margin:16px 0 6px}
input[type=email],input[type=password],input[type=text]{width:100%;height:42px;padding:0 12px;border:1px solid var(--input-border);border-radius:8px;
background:var(--input);color:var(--text);font:inherit;transition:border-color .15s,box-shadow .15s}
input::placeholder{color:var(--muted)}
input:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px var(--ring)}
input.otp{height:48px;letter-spacing:.25em;text-align:center;font-size:1.25rem;font-weight:600;font-variant-numeric:tabular-nums}
button,.btn{display:block;width:100%;margin-top:20px;padding:11px 14px;border:1px solid transparent;border-radius:8px;background:var(--brand);
color:var(--on-brand);font:inherit;font-weight:700;font-size:15px;text-align:center;text-decoration:none;cursor:pointer;transition:background .15s,box-shadow .15s}
button:hover,.btn:hover{background:var(--brand-hover)}
button:focus-visible,.btn:focus-visible,a:focus-visible,summary:focus-visible{outline:none;box-shadow:0 0 0 3px var(--ring)}
.btn.alt{background:var(--card);color:var(--text);border-color:var(--input-border);margin-top:12px}.btn.alt:hover{background:var(--subtle)}
.err{background:var(--err-bg);color:var(--err-fg);border:1px solid var(--err-bd);border-radius:8px;padding:10px 12px;margin:0 0 16px;font-size:14px}
.links{margin-top:20px;font-size:14px;text-align:center;color:var(--muted)}.links a,main a:not(.btn){color:var(--link);text-decoration:none}
.links a:hover,main a:not(.btn):hover{text-decoration:underline}
code{display:block;word-break:break-all;background:var(--code);padding:8px;border-radius:6px;font-size:13px;margin:6px 0}
.or{display:flex;align-items:center;gap:12px;color:var(--muted);margin:20px 0 0;font-size:13px}
.or::before,.or::after{content:"";flex:1;height:1px;background:var(--border)}
.section-title{font-size:14px;font-weight:600;color:var(--text);margin:0 0 4px}
.hint{font-size:13px;color:var(--muted);margin:0}
.qr{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:20px;border:1px solid var(--border);border-radius:12px;background:var(--subtle)}
.qr img{display:block;width:200px;height:200px;padding:8px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;image-rendering:pixelated}
details.manual{margin-top:12px;border:1px solid var(--border);border-radius:10px;background:var(--card)}
details.manual summary{cursor:pointer;padding:10px 14px;font-size:14px;font-weight:500;color:var(--link);list-style:none}
details.manual summary::-webkit-details-marker{display:none}
details.manual summary::before{content:"\\25B8";display:inline-block;margin-right:6px;transition:transform .15s}
details.manual[open] summary::before{transform:rotate(90deg)}
.manual-body{padding:0 14px 14px}
.key-row{display:flex;align-items:center;gap:8px;margin-top:8px}
.key{flex:1;margin:0;font:600 14px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;color:var(--text);
background:var(--code);border:1px solid var(--border);border-radius:8px;padding:9px 10px;word-break:break-word}
button.copy{width:auto;flex:none;margin:0;padding:8px 12px;font-size:13px;font-weight:600;background:var(--card);color:var(--text);border-color:var(--input-border)}
button.copy:hover{background:var(--subtle)}button.copy.done{color:var(--ok-fg);border-color:var(--ok-bd);background:var(--ok-bg)}
.deeplink{display:inline-block;margin-top:10px;font-size:13px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}
@media (max-width:899px){body{grid-template-columns:1fr;grid-template-rows:auto 1fr}.panel{padding:16px 20px}.pitch,.panel footer{display:none}
.content{align-items:flex-start;padding:24px 16px}}`;

const LOGO = `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
<rect width="32" height="32" rx="8" fill="#f59e0b"/><path d="M11 8v16M11 16.5 20.5 8M13.5 14.5 21 24" stroke="#1c1d21" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;


/** Copy-to-clipboard for any `button[data-copy]`; falls back to execCommand where the async API is unavailable. */
const COPY_SCRIPT = `document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('button[data-copy]');if(!b)return;
var v=b.getAttribute('data-copy'),label=b.textContent,s=document.getElementById('copy-status');
function ok(){b.textContent='Copied';b.classList.add('done');if(s)s.textContent='Setup key copied to clipboard';
setTimeout(function(){b.textContent=label;b.classList.remove('done');if(s)s.textContent='';},2000);}
function legacy(){var t=document.createElement('textarea');t.value=v;t.setAttribute('readonly','');t.style.position='fixed';t.style.opacity='0';
document.body.appendChild(t);t.select();try{document.execCommand('copy');ok();}catch(_){}document.body.removeChild(t);}
if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(v).then(ok,legacy);}else{legacy();}});`;


/** Staff-only operator realm pages. */
/**
 * Hosted page when the access gate stops a member from reaching a standalone portal (DRD §8.4). Two outcomes:
 * the organisation does not have the product ('unavailable'), or the member has no role in it ('no_access').
 */
export function deniedPage(kind: 'unavailable' | 'no_access', productName: string, links: { abort: string; home: string }): { title: string; status: number; body: string } {
  const name = escapeHtml(productName);
  const heading = kind === 'unavailable' ? `${name} is not available for your organisation` : `You don\u2019t have access to ${name}`;
  const detail = kind === 'unavailable'
    ? 'Your organisation has not enabled this product, or its access is paused. Ask your administrator.'
    : 'Ask your administrator.';
  return {
    title: kind === 'unavailable' ? 'Not available' : 'No access',
    status: 403,
    body: `<h1>${heading}</h1><p class="sub">${detail}</p>
<a class="btn" href="${escapeHtml(links.home)}">Back to Karbexa</a>
<p class="links"><a href="${escapeHtml(links.abort)}">Return to ${name}</a></p>`,
  };
}

export const OPERATOR_SHELL: ShellOptions = { theme: 'dark', badge: 'Operator', app: 'Karbexa Operator console', operator: true };

/** Skin per OIDC client: each app's sign-in matches that app (Admin is dark, Products are light). */
export function shellForClient(clientId: unknown): ShellOptions {
  if (clientId === ADMIN_SPA_CLIENT_ID) return { theme: 'dark', badge: 'Admin', app: 'Karbexa Admin' };
  if (clientId === PRODUCTS_SPA_CLIENT_ID) return { theme: 'light', app: 'Karbexa' };
  if (clientId === OPERATOR_SPA_CLIENT_ID) return OPERATOR_SHELL;
  return {};
}

export function pageShell(nonce: string, title: string, body: string, opts: ShellOptions = {}): string {
  const theme: ShellTheme = opts.theme ?? 'auto';
  const badge = opts.badge ? `<span class="brand-badge${opts.operator ? ' op' : ''}">${escapeHtml(opts.badge)}</span>` : '';
  const context = opts.app ? `<p class="app-context">to continue to <strong>${escapeHtml(opts.app)}</strong></p>` : '';
  const opNote = opts.operator ? '<p class="op-note">Karbexa staff only. Customers sign in from their own Karbexa app.</p>' : '';
  const pitch = opts.operator
    ? '<div class="pitch"><h2>Operator console</h2><p>Provision organisations, plans and entitlements.</p></div>'
    : '<div class="pitch"><h2>One account for every Karbexa app</h2><p>Sign in once and move between your workspaces.</p>'
      + '<div class="apps"><span>People</span><span>Projects</span><span>Sign</span><span>Desk</span><span>Admin</span></div></div>';
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer"><title>${escapeHtml(title)} · Karbexa</title><style nonce="${nonce}">${CSS}</style></head>
<body><aside class="panel"><header class="brand">${LOGO}<span class="brand-name">Karbexa</span>${badge}</header>${pitch}
<footer>Secure sign-in · Karbexa</footer></aside>
<div class="content"><main>${context}${opNote}${body}</main></div><script nonce="${nonce}">${COPY_SCRIPT}</script></body></html>`;
}
