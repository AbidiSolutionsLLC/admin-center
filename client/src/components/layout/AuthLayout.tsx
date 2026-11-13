// src/components/layout/AuthLayout.tsx
// Shell for the signed-out pages (login, onboarding, forgot/reset password). Mirrors the hosted
// sign-in pages served by the identity provider (server/src/identity/html.ts): charcoal brand panel + card.
import type { ReactNode } from 'react';

/** Classes for the card placed inside AuthLayout (glass surface on the dark Admin theme). */
export const AUTH_CARD_CLASS = 'glass-card w-full max-w-md rounded-xl border border-line shadow-card text-ink';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen w-full font-sans text-ink lg:grid-cols-[minmax(320px,42%)_1fr]">
      <aside className="relative flex items-center justify-between overflow-hidden bg-[#1c1d21] px-5 py-4 text-white lg:flex-col lg:items-start lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(245,158,11,0.14)_0%,transparent_55%)]" />
        <div className="relative flex items-center gap-2.5">
          <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="8" fill="#f59e0b" />
            <path d="M11 8v16M11 16.5 20.5 8M13.5 14.5 21 24" stroke="#1c1d21" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
          <span className="text-lg font-bold tracking-tight">Karbexa</span>
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-black">Admin</span>
        </div>
        <div className="relative hidden lg:block">
          <h2 className="mb-3 text-3xl font-extrabold leading-tight tracking-tight">Run your organisation from one place</h2>
          <p className="text-[15px] text-[#9a9ca5]">People, groups, app access, security and audit for every Karbexa app.</p>
        </div>
        <p className="relative hidden text-xs text-slate-500 lg:block">Secure sign-in · Karbexa</p>
      </aside>
      <main className="flex items-start justify-center px-4 py-6 lg:items-center lg:p-8">{children}</main>
    </div>
  );
}
