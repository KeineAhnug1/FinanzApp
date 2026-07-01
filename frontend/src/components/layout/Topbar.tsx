'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import { apiUrl } from '@/lib/api-client';
import type { User } from '@/types';

function initialsFromUser(user: User) {
  const first = String(user.first_name || user.username || 'U').charAt(0).toUpperCase();
  const last = String(user.last_name || '').charAt(0).toUpperCase();
  return `${first}${last}`.trim();
}

function pageTitleFromPath(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/accounts')) return 'Konten';
  if (pathname.startsWith('/groups')) return 'Gruppen';
  if (pathname.startsWith('/stocks')) return 'Aktien';
  if (pathname.startsWith('/questions')) return 'Fragen';
  if (pathname.startsWith('/settings')) return 'Einstellungen';
  return 'FBM Finance';
}

export function Topbar() {
  const pathname = usePathname();
  const { user, setUser } = useAppStore();
  const queryClient = useQueryClient();

  useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      const res = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      if (data?.ok && data.session_user) {
        const sessionUser = data.session_user as User;
        if (user && user.id !== sessionUser.id) {
          queryClient.clear();
          useAppStore.getState().clearSession();
        }
        setUser(sessionUser);
        return sessionUser;
      }
      return null;
    },
    staleTime: 5 * 60_000,
    enabled: !user,
  });

  const title = pageTitleFromPath(pathname);
  const initials = user ? initialsFromUser(user) : '?';
  const hasImage = Boolean(user?.profileImage);

  return (
    <header className="dash-topbar">
      <div className="topbar-left">
        <Link className="brand-link" href="/home" aria-label="FBM Finance">
          <img src="/shared/images/finanzapp-logo.svg" alt="FBM Finance" className="topbar__logo-img" height={36} style={{ width: 'auto', display: 'block' }} />
          <span className="brand-sub">{title}</span>
        </Link>
      </div>

      <div className="topbar-right header-controls">
        <div className="profile-wrap">
          <Link
            className="profile-btn"
            href="/settings"
            aria-label="Einstellungen"
          >
            <span id="profile-avatar" className="profile-avatar">
              {hasImage ? (
                <img
                  src={user?.profileImage ?? ''}
                  alt="Profilbild"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                />
              ) : (
                initials
              )}
            </span>
            <span id="profile-name" className="profile-name">
              {user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : ''}
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
