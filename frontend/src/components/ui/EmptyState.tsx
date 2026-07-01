'use client';

import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; onClick: () => void };
  size?: 'sm' | 'md';
}

export function EmptyState({ icon, title, description, cta, size = 'md' }: EmptyStateProps) {
  return (
    <div className={`empty-state empty-state--${size}`}>
      {icon && <div className="empty-state__icon" aria-hidden="true">{icon}</div>}
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__sub">{description}</p>}
      {cta && (
        <button type="button" className="empty-state__cta" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}

const SvgWrap = ({ children }: { children: ReactNode }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

export const IconTrendingDown = () => <SvgWrap><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></SvgWrap>;
export const IconTrendingUp = () => <SvgWrap><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></SvgWrap>;
export const IconRepeat = () => <SvgWrap><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></SvgWrap>;
export const IconArrowLeftRight = () => <SvgWrap><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></SvgWrap>;
export const IconPiggyBank = () => <SvgWrap><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.7-1 2-2h2v-4h-2c0-1-.5-1.5-1-2h0V5z" /><path d="M2 9v1c0 1.1.9 2 2 2h1" /><path d="M16 11h0" /></SvgWrap>;
export const IconLineChart = () => <SvgWrap><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></SvgWrap>;
export const IconUsers = () => <SvgWrap><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></SvgWrap>;
export const IconMessageSquare = () => <SvgWrap><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></SvgWrap>;
export const IconCalendar = () => <SvgWrap><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></SvgWrap>;
export const IconBriefcase = () => <SvgWrap><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></SvgWrap>;
export const IconReceipt = () => <SvgWrap><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 17.5v-11" /></SvgWrap>;
export const IconTarget = () => <SvgWrap><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></SvgWrap>;
export const IconArchive = () => <SvgWrap><rect width="20" height="5" x="2" y="3" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></SvgWrap>;
export const IconHistory = () => <SvgWrap><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></SvgWrap>;
export const IconInbox = () => <SvgWrap><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></SvgWrap>;
