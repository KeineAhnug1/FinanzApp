import { initials } from '@/lib/initials';

interface AuthorBadgeProps {
  name: string;
  profileImage?: string | null;
  isBot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function AuthorBadge({ name, profileImage, isBot, size = 'sm', className }: AuthorBadgeProps) {
  const sizeClass = size === 'md' ? ' author-badge--md' : '';
  const botClass = isBot ? ' author-badge--bot' : '';
  return (
    <span className={`author-badge${sizeClass}${botClass}${className ? ` ${className}` : ''}`}>
      <span className="author-badge__avatar" aria-hidden="true">
        {profileImage ? (
          <img src={profileImage} alt="" className="author-badge__avatar-img" />
        ) : (
          <span className="author-badge__avatar-fallback">{isBot ? 'FB' : initials(name)}</span>
        )}
      </span>
      <span className="author-badge__name">{name}</span>
    </span>
  );
}
