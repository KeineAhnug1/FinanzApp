'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { apiUrl, getCsrfToken } from '@/lib/api-client';
import { useAppStore } from '@/stores/app-store';

type AuthMode = 'login' | 'register' | 'verify' | 'forgot' | 'reset';

interface FlashMessage {
  type: 'success' | 'error';
  text: string;
}

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(1, 'Passwort ist erforderlich'),
});

const registerSchema = z
  .object({
    first_name: z.string().min(1, 'Vorname ist erforderlich'),
    last_name: z.string().min(1, 'Nachname ist erforderlich'),
    username: z.string().min(2, 'Username muss mindestens 2 Zeichen haben'),
    email: z.string().email('Ungültige E-Mail-Adresse'),
    password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen haben'),
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    message: 'Passwörter stimmen nicht überein',
    path: ['confirm_password'],
  });

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6, 'Code muss 6 Zeichen haben'),
});

const forgotSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
});

const resetSchema = z
  .object({
    email: z.string().email(),
    code: z.string().length(6, 'Code muss 6 Zeichen haben'),
    new_password: z.string().min(8, 'Passwort muss mindestens 8 Zeichen haben'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwörter stimmen nicht überein',
    path: ['confirm_password'],
  });

type LoginData = z.infer<typeof loginSchema>;
type RegisterData = z.infer<typeof registerSchema>;
type VerifyData = z.infer<typeof verifySchema>;
type ForgotData = z.infer<typeof forgotSchema>;
type ResetData = z.infer<typeof resetSchema>;

function LoginForm({
  onSwitchMode,
  flash,
}: {
  onSwitchMode: (mode: AuthMode, email?: string) => void;
  flash?: FlashMessage | null;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginData>({ resolver: zodResolver(loginSchema) });

  const [statusMsg, setStatusMsg] = useState(flash?.text ?? '');
  const [statusType, setStatusType] = useState<'idle' | 'success' | 'error'>(
    flash?.type ?? 'idle'
  );

  const onSubmit = async (data: LoginData) => {
    setStatusMsg('Prüfe Login…');
    setStatusType('idle');
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify(data),
      });
    } catch {
      setStatusMsg('Server nicht erreichbar.');
      setStatusType('error');
      return;
    }
    const result = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setStatusMsg(`Zu viele Versuche. Bitte warte ${result.retryAfter ?? 60} Sekunden.`);
      setStatusType('error');
      return;
    }
    if (!res.ok) {
      setStatusMsg(result.message ?? 'E-Mail oder Passwort ist falsch.');
      setStatusType('error');
      return;
    }

    queryClient.clear();
    useAppStore.getState().clearSession();

    setStatusMsg(`Login erfolgreich: ${result.user?.email ?? data.email}`);
    setStatusType('success');
    setTimeout(() => router.push('/dashboard'), 240);
  };

  return (
    <section className="login-card">
      <h1 className="login-title">Willkommen zurück</h1>
      <p className="login-subtitle">Melde dich mit deiner E-Mail und deinem Passwort an.</p>

      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="login-label" htmlFor="login-email">
            E-Mail
          </label>
          <input
            className={`login-input${errors.email ? ' is-error' : ''}`}
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="name@beispiel.de"
            {...register('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
          {errors.email && <p id="login-email-error" className="form-error">{errors.email.message}</p>}
        </div>

        <div>
          <div className="login-label-row">
            <label className="login-label" htmlFor="login-password">
              Passwort
            </label>
            <button
              className="auth-mode-link auth-mode-link--inline"
              type="button"
              tabIndex={-1}
              onClick={() => onSwitchMode('forgot')}
            >
              Vergessen?
            </button>
          </div>
          <input
            className={`login-input${errors.password ? ' is-error' : ''}`}
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Passwort eingeben"
            {...register('password')}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
          />
          {errors.password && <p id="login-password-error" className="form-error">{errors.password.message}</p>}
        </div>

        <button className="login-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Einloggen…' : 'Einloggen'}
        </button>
      </form>

      {statusMsg && (
        <p
          className={`login-status${statusType === 'success' ? ' is-success' : statusType === 'error' ? ' is-error' : ''}`}
        >
          {statusMsg}
        </p>
      )}

      <div className="auth-divider" />
      <button className="auth-mode-link" type="button" onClick={() => onSwitchMode('register')}>
        Kein Konto? Jetzt registrieren
      </button>
    </section>
  );
}

function RegisterForm({
  onSwitchMode,
}: {
  onSwitchMode: (mode: AuthMode, email?: string, expiresIn?: number) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterData>({ resolver: zodResolver(registerSchema) });
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'idle' | 'success' | 'error'>('idle');

  const onSubmit = async (data: RegisterData) => {
    setStatusMsg('Konto wird vorbereitet…');
    setStatusType('idle');
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({
          first_name: data.first_name,
          last_name: data.last_name,
          username: data.username,
          email: data.email,
          password: data.password,
        }),
      });
    } catch {
      setStatusMsg('Server nicht erreichbar.');
      setStatusType('error');
      return;
    }
    const result = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setStatusMsg(`Zu viele Versuche. Bitte warte ${result.retryAfter ?? 60} Sekunden.`);
      setStatusType('error');
      return;
    }
    if (!res.ok) {
      setStatusMsg(result.message ?? 'Konto konnte nicht erstellt werden.');
      setStatusType('error');
      return;
    }

    const email = result.pending_email || data.email;
    const expiresIn = Number(result.expires_in_seconds) || 0;
    onSwitchMode('verify', email, expiresIn);
  };

  return (
    <section className="login-card is-register">
      <p className="login-subtitle">Füll das Formular aus. Du erhältst danach einen Code per E-Mail.</p>

      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="form-row">
          <div>
            <label className="login-label" htmlFor="register-first-name">Vorname</label>
            <input
              className={`login-input${errors.first_name ? ' is-error' : ''}`}
              id="register-first-name"
              type="text"
              placeholder="Anna"
              {...register('first_name')}
              aria-invalid={errors.first_name ? true : undefined}
              aria-describedby={errors.first_name ? 'register-first-name-error' : undefined}
            />
            {errors.first_name && <p id="register-first-name-error" className="form-error">{errors.first_name.message}</p>}
          </div>
          <div>
            <label className="login-label" htmlFor="register-last-name">Nachname</label>
            <input
              className={`login-input${errors.last_name ? ' is-error' : ''}`}
              id="register-last-name"
              type="text"
              placeholder="Schmidt"
              {...register('last_name')}
              aria-invalid={errors.last_name ? true : undefined}
              aria-describedby={errors.last_name ? 'register-last-name-error' : undefined}
            />
            {errors.last_name && <p id="register-last-name-error" className="form-error">{errors.last_name.message}</p>}
          </div>
        </div>

        <div>
          <label className="login-label" htmlFor="register-username">Username</label>
          <input
            className={`login-input${errors.username ? ' is-error' : ''}`}
            id="register-username"
            type="text"
            placeholder="anna"
            {...register('username')}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? 'register-username-error' : undefined}
          />
          {errors.username && <p id="register-username-error" className="form-error">{errors.username.message}</p>}
        </div>

        <div>
          <label className="login-label" htmlFor="register-email">E-Mail</label>
          <input
            className={`login-input${errors.email ? ' is-error' : ''}`}
            id="register-email"
            type="email"
            placeholder="name@beispiel.de"
            {...register('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'register-email-error' : undefined}
          />
          {errors.email && <p id="register-email-error" className="form-error">{errors.email.message}</p>}
        </div>

        <div className="form-row">
          <div>
            <label className="login-label" htmlFor="register-password">Passwort</label>
            <input
              className={`login-input${errors.password ? ' is-error' : ''}`}
              id="register-password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              placeholder="mind. 8 Zeichen"
              {...register('password')}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'register-password-error' : undefined}
            />
            {errors.password && <p id="register-password-error" className="form-error">{errors.password.message}</p>}
          </div>
          <div>
            <label className="login-label" htmlFor="register-confirm-password">Passwort wiederholen</label>
            <input
              className={`login-input${errors.confirm_password ? ' is-error' : ''}`}
              id="register-confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="wiederholen"
              {...register('confirm_password')}
              aria-invalid={errors.confirm_password ? true : undefined}
              aria-describedby={errors.confirm_password ? 'register-confirm-password-error' : undefined}
            />
            {errors.confirm_password && <p id="register-confirm-password-error" className="form-error">{errors.confirm_password.message}</p>}
          </div>
        </div>

        <button className="login-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Wird erstellt…' : 'Konto erstellen'}
        </button>
      </form>

      {statusMsg && (
        <p className={`login-status${statusType === 'error' ? ' is-error' : ''}`}>{statusMsg}</p>
      )}

      <div className="auth-divider" />
      <button className="auth-mode-link" type="button" onClick={() => onSwitchMode('login')}>
        Schon ein Konto? Zum Login
      </button>
    </section>
  );
}

function VerifyForm({
  pendingEmail,
  expiresIn,
  onSwitchMode,
  flash,
}: {
  pendingEmail: string;
  expiresIn: number;
  onSwitchMode: (mode: AuthMode, email?: string) => void;
  flash?: FlashMessage | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VerifyData>({
    resolver: zodResolver(verifySchema),
    defaultValues: { email: pendingEmail },
  });
  const [statusMsg, setStatusMsg] = useState(flash?.text ?? '');
  const [statusType, setStatusType] = useState<'idle' | 'success' | 'error'>(flash?.type ?? 'idle');
  const [remaining, setRemaining] = useState(expiresIn);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresIn]);

  const onSubmit = async (data: VerifyData) => {
    setStatusMsg('Code wird geprüft…');
    setStatusType('idle');
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/auth/verify'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ email: data.email, code: data.code }),
      });
    } catch {
      setStatusMsg('Server nicht erreichbar.');
      setStatusType('error');
      return;
    }
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatusMsg(result.message ?? 'Code konnte nicht verifiziert werden.');
      setStatusType('error');
      return;
    }
    onSwitchMode('login', result.user?.email ?? data.email);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <section className="login-card">
      <h1 className="login-title">E-Mail bestätigen</h1>
      <p className="login-subtitle">Wir haben dir einen 6-stelligen Code gesendet. Bitte hier eingeben.</p>

      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="login-label" htmlFor="verify-email">E-Mail</label>
          <input className="login-input" id="verify-email" type="email" readOnly {...register('email')} />
        </div>

        <div>
          <label className="login-label" htmlFor="verify-code">Verifizierungscode</label>
          <input
            className={`login-input verify-code-input${errors.code ? ' is-error' : ''}`}
            id="verify-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            {...register('code')}
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={errors.code ? 'verify-code-error' : undefined}
          />
          {errors.code && <p id="verify-code-error" className="form-error">{errors.code.message}</p>}
        </div>

        {remaining > 0 ? (
          <p id="code-expiry" className="code-expiry is-warning">
            Code gültig für {formatTime(remaining)}
          </p>
        ) : expiresIn > 0 ? (
          <p id="code-expiry" className="code-expiry is-expired">
            Code abgelaufen. Bitte neuen Code anfordern.
          </p>
        ) : null}

        <button className="login-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Wird geprüft…' : 'Code bestätigen'}
        </button>
      </form>

      {statusMsg && (
        <p className={`login-status${statusType === 'success' ? ' is-success' : statusType === 'error' ? ' is-error' : ''}`}>
          {statusMsg}
        </p>
      )}

      <div className="auth-divider" />
      <div className="auth-mode-row">
        <button className="auth-mode-link" type="button" onClick={() => onSwitchMode('register')}>
          Code nicht erhalten? Neu registrieren
        </button>
        <button className="auth-mode-link" type="button" onClick={() => onSwitchMode('login')}>
          Zurück zum Login
        </button>
      </div>
    </section>
  );
}

function ForgotForm({
  pendingEmail,
  onSwitchMode,
}: {
  pendingEmail: string;
  onSwitchMode: (mode: AuthMode, email?: string, expiresIn?: number) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: pendingEmail },
  });
  const [statusMsg, setStatusMsg] = useState('');
  const [statusType, setStatusType] = useState<'idle' | 'error'>('idle');

  const onSubmit = async (data: ForgotData) => {
    setStatusMsg('Code wird angefordert…');
    setStatusType('idle');
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({ email: data.email }),
      });
    } catch {
      setStatusMsg('Server nicht erreichbar.');
      setStatusType('error');
      return;
    }
    const result = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setStatusMsg(`Zu viele Versuche. Bitte warte ${result.retryAfter ?? 60} Sekunden.`);
      setStatusType('error');
      return;
    }

    const expiresIn = Number(result.expires_in_seconds) || 0;
    onSwitchMode('reset', data.email, expiresIn);
  };

  return (
    <section className="login-card">
      <h1 className="login-title">Passwort vergessen</h1>
      <p className="login-subtitle">Gib deine E-Mail-Adresse ein. Wir senden dir einen Code zum Zurücksetzen.</p>

      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="login-label" htmlFor="forgot-email">E-Mail</label>
          <input
            className={`login-input${errors.email ? ' is-error' : ''}`}
            id="forgot-email"
            type="email"
            autoComplete="email"
            placeholder="name@beispiel.de"
            {...register('email')}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'forgot-email-error' : undefined}
          />
          {errors.email && <p id="forgot-email-error" className="form-error">{errors.email.message}</p>}
        </div>

        <button className="login-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Wird gesendet…' : 'Code anfordern'}
        </button>
      </form>

      {statusMsg && (
        <p className={`login-status${statusType === 'error' ? ' is-error' : ''}`}>{statusMsg}</p>
      )}

      <div className="auth-divider" />
      <button className="auth-mode-link" type="button" onClick={() => onSwitchMode('login')}>
        Zurück zum Login
      </button>
    </section>
  );
}

function ResetForm({
  pendingEmail,
  expiresIn,
  onSwitchMode,
  flash,
}: {
  pendingEmail: string;
  expiresIn: number;
  onSwitchMode: (mode: AuthMode, email?: string, expiresIn?: number) => void;
  flash?: FlashMessage | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetData>({
    resolver: zodResolver(resetSchema),
    defaultValues: { email: pendingEmail },
  });
  const [statusMsg, setStatusMsg] = useState(flash?.text ?? '');
  const [statusType, setStatusType] = useState<'idle' | 'error'>(
    flash?.type === 'error' ? 'error' : 'idle'
  );
  const [remaining, setRemaining] = useState(expiresIn);

  useEffect(() => {
    if (expiresIn <= 0) return;
    const interval = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(interval);
  }, [expiresIn]);

  const onSubmit = async (data: ResetData) => {
    setStatusMsg('Passwort wird zurückgesetzt…');
    setStatusType('idle');
    let res: Response;
    try {
      res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() },
        body: JSON.stringify({
          email: data.email,
          code: data.code,
          new_password: data.new_password,
        }),
      });
    } catch {
      setStatusMsg('Server nicht erreichbar.');
      setStatusType('error');
      return;
    }
    const result = await res.json().catch(() => ({}));

    if (res.status === 429) {
      setStatusMsg(`Zu viele Versuche. Bitte warte ${result.retryAfter ?? 60} Sekunden.`);
      setStatusType('error');
      return;
    }
    if (!res.ok) {
      setStatusMsg(result.message ?? 'Fehler beim Zurücksetzen.');
      setStatusType('error');
      return;
    }

    onSwitchMode('login', data.email);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <section className="login-card">
      <h1 className="login-title">Neues Passwort setzen</h1>
      <p className="login-subtitle">Gib den Code aus der E-Mail und dein neues Passwort ein.</p>

      <form className="login-form" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div>
          <label className="login-label" htmlFor="reset-email">E-Mail</label>
          <input className="login-input" id="reset-email" type="email" readOnly {...register('email')} />
        </div>

        <div>
          <label className="login-label" htmlFor="reset-code">Code aus der E-Mail</label>
          <input
            className={`login-input verify-code-input${errors.code ? ' is-error' : ''}`}
            id="reset-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
            {...register('code')}
            aria-invalid={errors.code ? true : undefined}
            aria-describedby={errors.code ? 'reset-code-error' : undefined}
          />
          {errors.code && <p id="reset-code-error" className="form-error">{errors.code.message}</p>}
        </div>

        {remaining > 0 ? (
          <p className="code-expiry is-warning">Code gültig für {formatTime(remaining)}</p>
        ) : expiresIn > 0 ? (
          <p className="code-expiry is-expired">Code abgelaufen. Bitte neuen Code anfordern.</p>
        ) : null}

        <div>
          <label className="login-label" htmlFor="reset-new-password">Neues Passwort</label>
          <input
            className={`login-input${errors.new_password ? ' is-error' : ''}`}
            id="reset-new-password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            placeholder="mind. 8 Zeichen"
            {...register('new_password')}
            aria-invalid={errors.new_password ? true : undefined}
            aria-describedby={errors.new_password ? 'reset-new-password-error' : undefined}
          />
          {errors.new_password && <p id="reset-new-password-error" className="form-error">{errors.new_password.message}</p>}
        </div>

        <div>
          <label className="login-label" htmlFor="reset-confirm-password">Neues Passwort bestätigen</label>
          <input
            className={`login-input${errors.confirm_password ? ' is-error' : ''}`}
            id="reset-confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="wiederholen"
            {...register('confirm_password')}
            aria-invalid={errors.confirm_password ? true : undefined}
            aria-describedby={errors.confirm_password ? 'reset-confirm-password-error' : undefined}
          />
          {errors.confirm_password && (
            <p id="reset-confirm-password-error" className="form-error">{errors.confirm_password.message}</p>
          )}
        </div>

        <button className="login-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Wird gesetzt…' : 'Passwort zurücksetzen'}
        </button>
      </form>

      {statusMsg && (
        <p className={`login-status${statusType === 'error' ? ' is-error' : ''}`}>{statusMsg}</p>
      )}

      <div className="auth-divider" />
      <div className="auth-mode-row">
        <button
          className="auth-mode-link"
          type="button"
          onClick={() => onSwitchMode('forgot', pendingEmail)}
        >
          Code erneut anfordern
        </button>
        <button className="auth-mode-link" type="button" onClick={() => onSwitchMode('login')}>
          Zurück zum Login
        </button>
      </div>
    </section>
  );
}

function BrandPanel() {
  return (
    <aside className="auth-brand-panel" aria-hidden="true">
      <div className="auth-brand-content">
        <Link className="brand-link auth-brand-link-side" href="/home">
          <span className="brand-mark">FBM Finance</span>
        </Link>
        <div className="auth-brand-tagline">
          <h2 className="auth-brand-headline">
            Deine Finanzen.<br />
            Klar im Blick.
          </h2>
          <p className="auth-brand-sub">Ausgaben, Einnahmen und Vermögen — alles an einem Ort.</p>
        </div>
        <ul className="auth-feature-list" aria-label="Features">
          <li><span className="auth-feature-icon">✦</span> Einnahmen &amp; Ausgaben verwalten</li>
          <li><span className="auth-feature-icon">✦</span> Aktien &amp; Portfolio verfolgen</li>
          <li><span className="auth-feature-icon">✦</span> Gruppen &amp; geteilte Finanzen</li>
        </ul>
        <div className="auth-brand-image-wrap" aria-hidden="true">
          <Image
            className="auth-brand-image"
            src="/homepage/images/DashboardIncome.png"
            alt=""
            width={600}
            height={400}
            loading="lazy"
          />
        </div>
      </div>
    </aside>
  );
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page">
      <BrandPanel />
      <main className="auth-form-panel">
        <header className="auth-topbar">
          <Link className="brand-link auth-brand-link" href="/home">
            <span className="brand-mark">FBM Finance</span>
          </Link>
        </header>
        <div className="auth-form-center">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [expiresIn, setExpiresIn] = useState(0);
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const switchMode = (nextMode: AuthMode, email?: string, expires?: number) => {
    if (email !== undefined) setPendingEmail(email);
    if (expires !== undefined) setExpiresIn(expires);

    if (nextMode === 'login' && mode !== 'login') {
      setFlash({
        type: 'success',
        text:
          mode === 'verify'
            ? 'Konto erstellt und verifiziert. Bitte jetzt einloggen.'
            : mode === 'reset'
              ? 'Passwort erfolgreich zurückgesetzt. Bitte jetzt einloggen.'
              : '',
      });
    } else {
      setFlash(null);
    }

    setMode(nextMode);
  };

  if (mode === 'register') {
    return (
      <AuthLayout>
        <RegisterForm onSwitchMode={switchMode} />
      </AuthLayout>
    );
  }
  if (mode === 'verify') {
    return (
      <AuthLayout>
        <VerifyForm
          pendingEmail={pendingEmail}
          expiresIn={expiresIn}
          onSwitchMode={switchMode}
          flash={flash}
        />
      </AuthLayout>
    );
  }
  if (mode === 'forgot') {
    return (
      <AuthLayout>
        <ForgotForm pendingEmail={pendingEmail} onSwitchMode={switchMode} />
      </AuthLayout>
    );
  }
  if (mode === 'reset') {
    return (
      <AuthLayout>
        <ResetForm
          pendingEmail={pendingEmail}
          expiresIn={expiresIn}
          onSwitchMode={switchMode}
          flash={flash}
        />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <LoginForm onSwitchMode={switchMode} flash={flash} />
    </AuthLayout>
  );
}
