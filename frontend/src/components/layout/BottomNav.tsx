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
            <img src="/shared/images/nav-settings.svg" alt="" className="nav-icon" width={20} height={20} />
          </span>
          <span className="app-bottom-nav-label">Einstellungen</span>
        </span>
      ) : (
        <Link className="app-bottom-nav-item" href="/settings">
          <span className="app-bottom-nav-icon" aria-hidden="true">
            <img src="/shared/images/nav-settings.svg" alt="" className="nav-icon" width={20} height={20} />
          </span>
          <span className="app-bottom-nav-label">Einstellungen</span>
        </Link>
      )}
    </nav>
  );
}
