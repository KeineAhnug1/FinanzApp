'use client';

import { useEffect, useState, useRef } from 'react';
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
  const redirectingRef = useRef(false);

  const handleUnauthenticated = () => {
    if (redirectingRef.current) return;
    redirectingRef.current = true;
    queryClient.clear();
    useAppStore.getState().clearSession();
    router.replace('/login');
  };

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

  // Intercept 401 responses from any fetch call while inside the app
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 401) {
        handleUnauthenticated();
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          queryClient.invalidateQueries();
          setChecked(true);
        } else {
          handleUnauthenticated();
        }
      })
      .catch(() => handleUnauthenticated());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
