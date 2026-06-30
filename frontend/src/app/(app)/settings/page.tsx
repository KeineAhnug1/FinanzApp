'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/stores/app-store';
import { toast } from '@/components/ui/Toast';
import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';
import type { UserClient } from '@/types';

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return safeJson(res);
}

function initialsFromUser(user: Partial<UserClient>): string {
  const first = String(user.first_name || user.username || 'U').charAt(0).toUpperCase();
  const last = String(user.last_name || '').charAt(0).toUpperCase();
  return `${first}${last}`.trim();
}

const profileSchema = z.object({
  first_name: z.string().min(1, 'Vorname erforderlich'),
  last_name: z.string().min(1, 'Nachname erforderlich'),
});
type ProfileData = z.infer<typeof profileSchema>;

function ProfileSection({ user, onSaved }: { user: UserClient; onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.profileImage);
  const [uploading, setUploading] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: user.first_name, last_name: user.last_name },
  });

  const onSubmit = async (data: ProfileData) => {
    const result = await apiFetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({
        first_name: data.first_name, last_name: data.last_name,
      }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Speichern'); return; }
    toast.success('Profil gespeichert');
    onSaved();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200_000) { toast.error('Bild zu groß (max. 200 KB)'); return; }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        setAvatarPreview(dataUrl);
        const result = await apiFetch('/api/users/me/profile-image', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
          body: JSON.stringify({ profileImage: dataUrl }),
        });
        if (!result.ok) { toast.error(result.message ?? 'Fehler beim Hochladen'); }
        else { toast.success('Profilbild gespeichert'); onSaved(); }
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch { setUploading(false); toast.error('Fehler beim Hochladen'); }
  };

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
  const since = user.created_at
    ? new Intl.DateTimeFormat('de-DE', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(user.created_at))
    : '-';

  return (
    <section id="profil" className="einst-section">
      <h2 className="einst-section-title">Profil</h2>
      <div className="einst-card">
        <div className="profil-header">
          <div className="profil-avatar-wrap">
            <button
              className="profil-avatar-large"
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Profilbild ändern"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Profilbild" className="settings__avatar-image" />
              ) : (
                <span>{initialsFromUser(user)}</span>
              )}
            </button>
            <button className="profil-avatar-edit-btn" type="button" onClick={() => fileRef.current?.click()} title="Bild ändern" aria-label="Bild ändern">✏</button>
          </div>
          <div>
            <p className="profil-fullname">{fullName}</p>
            <p className="profil-email-top">{user.email}</p>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={handleImageUpload} />
        </div>
        <dl className="profil-details">
          <div className="profil-row"><dt>Benutzername</dt><dd>{user.username}</dd></div>
          <div className="profil-row"><dt>Mitglied seit</dt><dd>{since}</dd></div>
        </dl>
        <form className="einst-form settings__section-spacer-md" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="einst-field">
            <label className="field-label" htmlFor="profile-first-name">Vorname</label>
            <input
              id="profile-first-name"
              className="field-input"
              {...register('first_name')}
              aria-invalid={errors.first_name ? true : undefined}
              aria-describedby={errors.first_name ? 'profile-first-name-error' : undefined}
            />
            {errors.first_name && <p id="profile-first-name-error" className="form-status is-error">{errors.first_name.message}</p>}
          </div>
          <div className="einst-field">
            <label className="field-label" htmlFor="profile-last-name">Nachname</label>
            <input
              id="profile-last-name"
              className="field-input"
              {...register('last_name')}
              aria-invalid={errors.last_name ? true : undefined}
              aria-describedby={errors.last_name ? 'profile-last-name-error' : undefined}
            />
            {errors.last_name && <p id="profile-last-name-error" className="form-status is-error">{errors.last_name.message}</p>}
          </div>
          <div className="einst-actions">
            <button className="btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Speichern…' : 'Profil speichern'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function PrivacySection({ user, onSaved }: { user: UserClient; onSaved: () => void }) {
  const [enabled, setEnabled] = useState<boolean>(user.show_profile_image_to_others !== false);
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setBusy(true);
    setEnabled(next);
    const result = await apiFetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ show_profile_image_to_others: next }),
    });
    setBusy(false);
    if (!result.ok) {
      setEnabled(!next);
      toast.error(result.message ?? 'Fehler beim Speichern');
      return;
    }
    toast.success(next ? 'Profilbild ist für andere sichtbar' : 'Profilbild ist für andere ausgeblendet');
    onSaved();
  };

  return (
    <section id="datenschutz" className="einst-section">
      <h2 className="einst-section-title">Datenschutz</h2>
      <div className="einst-card">
        <div className="privacy-row">
          <div className="privacy-row__text">
            <p className="privacy-row__title">Profilbild für andere anzeigen</p>
            <p className="privacy-row__desc">
              Wenn aus, sehen andere Nutzer im Forum nur deine Initialen statt deines Profilbilds. Du selbst siehst dein Bild weiterhin überall.
            </p>
          </div>
          <label className="switch" aria-label="Profilbild für andere anzeigen">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(e) => toggle(e.target.checked)}
            />
            <span className="switch__track" aria-hidden="true"><span className="switch__thumb" /></span>
          </label>
        </div>
      </div>
    </section>
  );
}

const passwordSchema = z.object({
  current_password: z.string().min(1, 'Aktuelles Passwort erforderlich'),
  new_password: z.string().min(8, 'Neues Passwort muss mind. 8 Zeichen haben'),
  confirm_password: z.string(),
}).refine((d) => d.new_password === d.confirm_password, { message: 'Passwörter stimmen nicht überein', path: ['confirm_password'] });
type PasswordData = z.infer<typeof passwordSchema>;

function PasswordSection() {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PasswordData>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = async (data: PasswordData) => {
    const result = await apiFetch('/api/users/me/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
      body: JSON.stringify({ current_password: data.current_password, new_password: data.new_password }),
    });
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Ändern'); return; }
    toast.success('Passwort geändert');
    reset();
  };

  return (
    <section id="passwort" className="einst-section">
      <h2 className="einst-section-title">Passwort ändern</h2>
      <div className="einst-card">
        <form className="einst-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="einst-field">
            <label className="field-label" htmlFor="pw-current">Aktuelles Passwort</label>
            <input
              id="pw-current"
              className="field-input"
              type="password"
              autoComplete="current-password"
              {...register('current_password')}
              aria-invalid={errors.current_password ? true : undefined}
              aria-describedby={errors.current_password ? 'pw-current-error' : undefined}
            />
            {errors.current_password && <p id="pw-current-error" className="form-status is-error">{errors.current_password.message}</p>}
          </div>
          <div className="einst-field">
            <label className="field-label" htmlFor="pw-new">Neues Passwort</label>
            <input
              id="pw-new"
              className="field-input"
              type="password"
              autoComplete="new-password"
              placeholder="mind. 8 Zeichen"
              {...register('new_password')}
              aria-invalid={errors.new_password ? true : undefined}
              aria-describedby={errors.new_password ? 'pw-new-error' : undefined}
            />
            {errors.new_password && <p id="pw-new-error" className="form-status is-error">{errors.new_password.message}</p>}
          </div>
          <div className="einst-field">
            <label className="field-label" htmlFor="pw-confirm">Passwort wiederholen</label>
            <input
              id="pw-confirm"
              className="field-input"
              type="password"
              autoComplete="new-password"
              placeholder="wiederholen"
              {...register('confirm_password')}
              aria-invalid={errors.confirm_password ? true : undefined}
              aria-describedby={errors.confirm_password ? 'pw-confirm-error' : undefined}
            />
            {errors.confirm_password && <p id="pw-confirm-error" className="form-status is-error">{errors.confirm_password.message}</p>}
          </div>
          <div className="einst-actions">
            <button className="btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Ändern…' : 'Passwort ändern'}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function ThemeSection() {
  const [theme, setTheme] = useState(() => typeof window === 'undefined' ? 'auto' : localStorage.getItem('finanzapp.themeMode') ?? 'auto');
  const [contrast, setContrast] = useState(() => typeof window === 'undefined' ? 'normal' : localStorage.getItem('finanzapp.contrast') ?? 'normal');

  const applyTheme = (mode: string) => {
    setTheme(mode);
    localStorage.setItem('finanzapp.themeMode', mode);
    const resolved = mode === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : mode;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
  };

  const applyContrast = (c: string) => {
    setContrast(c);
    if (c === 'high') {
      localStorage.setItem('finanzapp.contrast', 'high');
      document.documentElement.dataset.contrast = 'high';
    } else {
      localStorage.removeItem('finanzapp.contrast');
      delete document.documentElement.dataset.contrast;
    }
  };

  return (
    <section id="erscheinungsbild" className="einst-section">
      <h2 className="einst-section-title">Erscheinungsbild</h2>
      <div className="einst-card">
        <p className="einst-subsection-title">Farbmodus</p>
        <div className="theme-mode-group">
          <button className={`theme-option${theme === 'light' ? ' is-active' : ''}`} type="button" onClick={() => applyTheme('light')}>
            Hell
          </button>
          <button className={`theme-option${theme === 'dark' ? ' is-active' : ''}`} type="button" onClick={() => applyTheme('dark')}>
            Dunkel
          </button>
          <button className={`theme-option${theme === 'auto' ? ' is-active' : ''}`} type="button" onClick={() => applyTheme('auto')}>
            Automatisch
          </button>
        </div>
        <p className="einst-subsection-title settings__section-spacer-md">Kontrast</p>
        <div className="contrast-mode-group">
          <button className={`contrast-option${contrast !== 'high' ? ' is-active' : ''}`} type="button" onClick={() => applyContrast('normal')}>Normal</button>
          <button className={`contrast-option${contrast === 'high' ? ' is-active' : ''}`} type="button" onClick={() => applyContrast('high')}>Hoher Kontrast</button>
        </div>
      </div>
    </section>
  );
}

function DangerSection() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [checked, setChecked] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST', headers: { 'x-csrf-token': getCsrfToken() } });
    queryClient.clear();
    useAppStore.getState().clearSession();
    router.push('/login');
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    const result = await apiFetch('/api/users/me', { method: 'DELETE', headers: { 'x-csrf-token': getCsrfToken() } });
    setDeleting(false);
    if (!result.ok) { toast.error(result.message ?? 'Fehler beim Löschen'); return; }
    queryClient.clear();
    useAppStore.getState().clearSession();
    router.push('/login');
  };

  return (
    <section id="konto" className="einst-section">
      <h2 className="einst-section-title">Konto</h2>
      <div className="einst-card">
        <p className="einst-subsection-title">Sitzung</p>
        <div className="einst-actions">
          <button className="btn-secondary" type="button" onClick={handleLogout}>Ausloggen</button>
        </div>
      </div>
      <div className="einst-card einst-card--danger settings__section-spacer-md">
        <p className="einst-subsection-title einst-subsection-title--danger">Konto löschen</p>
        <p className="einst-danger-desc">Diese Aktion ist unwiderruflich. Alle Daten, Einnahmen, Ausgaben und Konten werden dauerhaft gelöscht.</p>
        <div className="einst-actions">
          <button className="btn-danger" type="button" onClick={() => setShowModal(true)}>Konto löschen</button>
        </div>
      </div>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowModal(false); setChecked(false); } }}
        >
          <div className="modal-box">
            <h2 className="modal-title">Konto wirklich löschen?</h2>
            <p className="modal-desc">Alle deine Daten werden unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.</p>
            <label className="modal-confirm-label">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              Ich verstehe, dass mein Konto und alle Daten dauerhaft gelöscht werden.
            </label>
            <div className="modal-actions">
              <button className="btn-secondary" type="button" onClick={() => { setShowModal(false); setChecked(false); }}>Abbrechen</button>
              <button className="btn-danger" type="button" disabled={!checked || deleting} onClick={handleDeleteAccount}>
                {deleting ? 'Wird gelöscht…' : 'Endgültig löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user: storeUser, setUser } = useAppStore();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState('profil');

  const { data: user, isLoading } = useQuery<UserClient>({
    queryKey: ['me'],
    queryFn: () => apiFetch('/api/users/me').then((d) => d.user),
    initialData: (storeUser as UserClient | null) ?? undefined,
    staleTime: 30_000,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['me'] });
    const data = await apiFetch('/api/users/me');
    if (data?.user) setUser(data.user);
  };

  if (isLoading && !storeUser) return <div className="einst-layout"><p className="settings__muted-text">Lade Profil…</p></div>;
  if (!user && !isLoading) {
    router.replace('/login');
    return null;
  }
  if (!user) return null;

  const navItems = [
    { id: 'profil', label: 'Profil' },
    { id: 'datenschutz', label: 'Datenschutz' },
    { id: 'erscheinungsbild', label: 'Erscheinungsbild' },
    { id: 'passwort', label: 'Passwort' },
    { id: 'konto', label: 'Konto' },
  ];

  return (
    <div className="einst-layout">
      <aside className="einst-nav">
        <nav>
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`einst-nav-link${activeSection === item.id ? ' is-active' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveSection(item.id);
                document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <div className="einst-content">
        <h1 className="page-title">Einstellungen</h1>
        <ProfileSection user={user} onSaved={refresh} />
        <PrivacySection user={user} onSaved={refresh} />
        <ThemeSection />
        <PasswordSection />
        <DangerSection />
      </div>
    </div>
  );
}
