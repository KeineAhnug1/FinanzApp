'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Topbar } from '@/components/layout/Topbar';
import { SideNav, MobileNavToggle } from '@/components/layout/SideNav';
import { BottomNav } from '@/components/layout/BottomNav';
import { ToastContainer } from '@/components/ui/Toast';
import { apiUrl } from '@/lib/api-client';
import { useAppStore } from '@/stores/app-store';
import { useUiStore } from '@/stores/ui-store';
import type { User } from '@/types';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, setUser } = useAppStore();
  const { sideNavCollapsed } = useUiStore();
  const [checked, setChecked] = useState(false);

  // Apply body classes required by CSS selectors
  useEffect(() => {
    document.body.classList.add('has-shared-sidebar', 'has-bottom-nav');
    return () => {
      document.body.classList.remove('has-shared-sidebar', 'has-bottom-nav', 'side-nav-collapsed');
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('side-nav-collapsed', sideNavCollapsed);
  }, [sideNavCollapsed]);

  useEffect(() => {
    if (user) {
      setChecked(true);
      return;
    }
    fetch(apiUrl('/api/auth/session'), { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { ok?: boolean; session_user?: User }) => {
        if (data?.ok && data.session_user) {
          setUser(data.session_user);
          // Invalidate all queries so new user always gets fresh data
          queryClient.invalidateQueries();
          setChecked(true);
        } else {
          router.replace('/login');
        }
      })
      .catch(() => router.replace('/login'));
  }, [user, router, setUser, queryClient]);

  if (!checked) return null;

  return (
    <>
      <Topbar />
      <SideNav />
      <MobileNavToggle />
      <main className="app-main">{children}</main>
      <BottomNav />
      <ToastContainer />
    </>
  );
}
