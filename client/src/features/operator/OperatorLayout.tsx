import { NavLink, Outlet } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { operatorLogout } from './operatorAuth';

const NAV = [
  { label: 'Organizations', href: ROUTES.OPERATOR_ORGS },
  { label: 'Plans', href: ROUTES.OPERATOR_PLANS },
  { label: 'Operators', href: ROUTES.OPERATOR_OPERATORS },
  { label: 'Audit', href: ROUTES.OPERATOR_AUDIT },
];

export const OperatorLayout = () => (
  <div className="min-h-screen bg-surface-base text-ink font-sans">
    <div className="bg-purple-700 text-white text-xs font-semibold tracking-wider px-4 py-1.5 flex items-center justify-between">
      <span>OPERATOR CONSOLE - platform-wide access</span>
      <button onClick={operatorLogout} className="underline hover:no-underline">Sign out</button>
    </div>
    <div className="flex">
      <nav className="w-52 shrink-0 border-r border-line bg-surface min-h-[calc(100vh-28px)] p-3 space-y-1">
        {NAV.map((n) => (
          <NavLink
            key={n.href}
            to={n.href}
            className={({ isActive }) => `block px-3 py-2 rounded-md text-sm ${isActive ? 'bg-purple-600/10 text-purple-700 font-semibold' : 'text-ink-secondary hover:bg-surface-alt'}`}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 p-6 min-w-0"><Outlet /></main>
    </div>
  </div>
);
