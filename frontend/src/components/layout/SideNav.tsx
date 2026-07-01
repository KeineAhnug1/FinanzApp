'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useUiStore } from '@/stores/ui-store';

const NAV_ITEMS = [
  { href: '/dashboard', key: 'dashboard', label: 'Dashboard', icon: '/shared/images/nav-dashboard.svg' },
  { href: '/accounts', key: 'accounts', label: 'Konten', icon: '/shared/images/nav-accounts.svg' },
  { href: '/groups', key: 'groups', label: 'Gruppen', icon: '/shared/images/nav-groups.svg' },
  { href: '/stocks', key: 'stocks', label: 'Aktien', icon: '/shared/images/nav-stocks.svg' },
  { href: '/questions', key: 'questions', label: 'Fragen', icon: '/shared/images/nav-questions.svg' },
];

const SIDENAV_COLLAPSED_KEY = 'finanzapp.sideNav.collapsed';

export function SideNav() {
  const pathname = usePathname();
  const { sideNavCollapsed, sideNavMobileOpen, toggleSideNavCollapsed, setSideNavMobileOpen } =
    useUiStore();
  const sideNavRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDENAV_COLLAPSED_KEY);
      if (stored === '1') useUiStore.setState({ sideNavCollapsed: true });
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDENAV_COLLAPSED_KEY, sideNavCollapsed ? '1' : '0');
    } catch {}
  }, [sideNavCollapsed]);

  useEffect(() => {
    setSideNavMobileOpen(false);
  }, [pathname, setSideNavMobileOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (window.innerWidth > 960) return;
      if (sideNavRef.current && !sideNavRef.current.contains(e.target as Node)) {
        setSideNavMobileOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [setSideNavMobileOpen]);

  const activeKey = NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.key ?? '';

  return (
    <aside
      ref={sideNavRef}
      id="app-side-nav"
      className={`app-side-nav${sideNavCollapsed ? ' side-nav-collapsed' : ''}${sideNavMobileOpen ? ' side-nav-open' : ''}`}
    >
      <div className="app-side-nav-head">
        <button
          className="side-nav-collapse-toggle"
          type="button"
          aria-expanded={!sideNavCollapsed}
          aria-label="Menü"
          onClick={toggleSideNavCollapsed}
        >
          <img src="/shared/images/finanzapp-logo.svg" alt="FBM Finance" className="sidenav__logo-img" width={32} height={32} aria-hidden="true" />
        </button>
        <Link className="side-nav-title side-nav-title-link side-nav-brand-text" href="/home">
          FBM Finance
        </Link>
      </div>

      <nav className="app-nav-links" aria-label="App-Navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === activeKey;
          return (
            <div key={item.key} className="app-nav-item">
              {isActive ? (
                <span className="app-nav-link is-active" aria-current="page">
                  <span className="app-nav-icon" aria-hidden="true">
                    <img src={item.icon} alt={item.label} className="nav-icon" width={20} height={20} />
                  </span>
                  <span className="app-nav-label">{item.label}</span>
                </span>
              ) : (
                <Link className="app-nav-link" href={item.href}>
                  <span className="app-nav-icon" aria-hidden="true">
                    <img src={item.icon} alt={item.label} className="nav-icon" width={20} height={20} />
                  </span>
                  <span className="app-nav-label">{item.label}</span>
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      <div className="app-side-nav-bottom">
        <Link className="app-nav-link" href="/settings">
          <span className="app-nav-icon" aria-hidden="true">
            <img src="/shared/images/nav-settings.svg" alt="Einstellungen" className="nav-icon" width={20} height={20} />
          </span>
          <span className="app-nav-label">Einstellungen</span>
        </Link>
      </div>
    </aside>
  );
}

export function MobileNavToggle() {
  const { sideNavMobileOpen, setSideNavMobileOpen } = useUiStore();

  return (
    <button
      type="button"
      className="side-nav-mobile-toggle"
      aria-controls="app-side-nav"
      aria-expanded={sideNavMobileOpen}
      aria-label="Menü"
      onClick={() => setSideNavMobileOpen(!sideNavMobileOpen)}
    >
      <span className="nav-toggle-icon" aria-hidden="true">
        {sideNavMobileOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20}><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20}><path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        )}
      </span>
    </button>
  );
}
