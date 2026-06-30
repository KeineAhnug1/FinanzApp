'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'dashboard', label: 'Dashboard', icon: '/shared/images/nav-dashboard.svg' },
  { href: '/accounts', key: 'accounts', label: 'Konten', icon: '/shared/images/nav-accounts.svg' },
  { href: '/groups', key: 'groups', label: 'Gruppen', icon: '/shared/images/nav-groups.svg' },
  { href: '/stocks', key: 'stocks', label: 'Aktien', icon: '/shared/images/nav-stocks.svg' },
  { href: '/questions', key: 'questions', label: 'Fragen', icon: '/shared/images/nav-questions.svg' },
];

export function BottomNav() {
  const pathname = usePathname();
  const activeKey = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.key ?? '';
  const isSettings = pathname === '/settings' || pathname.startsWith('/settings/');

  return (
    <nav className="app-bottom-nav" aria-label="App-Navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === activeKey;
        return isActive ? (
          <span key={item.key} className="app-bottom-nav-item is-active" aria-current="page">
            <span className="app-bottom-nav-icon" aria-hidden="true">
              <img src={item.icon} alt="" className="nav-icon" width={20} height={20} />
            </span>
            <span className="app-bottom-nav-label">{item.label}</span>
          </span>
        ) : (
          <Link key={item.key} className="app-bottom-nav-item" href={item.href}>
            <span className="app-bottom-nav-icon" aria-hidden="true">
              <img src={item.icon} alt="" className="nav-icon" width={20} height={20} />
            </span>
            <span className="app-bottom-nav-label">{item.label}</span>
          </Link>
        );
      })}
      {isSettings ? (
        <span className="app-bottom-nav-item is-active" aria-current="page">
          <span className="app-bottom-nav-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.94-2.06a7.5 7.5 0 0 0 .06-.94 7.5 7.5 0 0 0-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.62l-1.92-3.32a.49.49 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14.5 3h-5a.48.48 0 0 0-.48.4l-.36 2.54a7.42 7.42 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.6.22L2.13 9.46a.47.47 0 0 0 .12.62l2.03 1.58A7.62 7.62 0 0 0 4.2 13c0 .31.02.63.07.94l-2.03 1.58a.49.49 0 0 0-.12.62l1.92 3.32c.12.21.38.29.6.22l2.39-.96c.5.36 1.04.67 1.62.94l.36 2.54c.06.23.27.4.48.4h5c.24 0 .44-.17.48-.4l.36-2.54a7.42 7.42 0 0 0 1.62-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.47.47 0 0 0-.12-.62l-2.03-1.58Z"/></svg>
          </span>
          <span className="app-bottom-nav-label">Einstellungen</span>
        </span>
      ) : (
        <Link className="app-bottom-nav-item" href="/settings">
          <span className="app-bottom-nav-icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} aria-hidden="true"><path fill="currentColor" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.94-2.06a7.5 7.5 0 0 0 .06-.94 7.5 7.5 0 0 0-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.62l-1.92-3.32a.49.49 0 0 0-.6-.22l-2.39.96a7.07 7.07 0 0 0-1.62-.94l-.36-2.54A.48.48 0 0 0 14.5 3h-5a.48.48 0 0 0-.48.4l-.36 2.54a7.42 7.42 0 0 0-1.62.94l-2.39-.96a.48.48 0 0 0-.6.22L2.13 9.46a.47.47 0 0 0 .12.62l2.03 1.58A7.62 7.62 0 0 0 4.2 13c0 .31.02.63.07.94l-2.03 1.58a.49.49 0 0 0-.12.62l1.92 3.32c.12.21.38.29.6.22l2.39-.96c.5.36 1.04.67 1.62.94l.36 2.54c.06.23.27.4.48.4h5c.24 0 .44-.17.48-.4l.36-2.54a7.42 7.42 0 0 0 1.62-.94l2.39.96c.22.08.48 0 .6-.22l1.92-3.32a.47.47 0 0 0-.12-.62l-2.03-1.58Z"/></svg>
          </span>
          <span className="app-bottom-nav-label">Einstellungen</span>
        </Link>
      )}
    </nav>
  );
}
