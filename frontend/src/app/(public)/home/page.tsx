'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api-client';

const SLIDES = [
  {
    img: '/homepage/images/DashboardIncome.png',
    alt: 'Minimalistische Übersicht der Einnahmen im Dashboard',
    title: 'Klare Einnahmenflächen',
    body: 'Wichtige Kennzahlen sind sofort lesbar, weil nur die Informationen im Vordergrund stehen, die im Moment relevant sind.',
  },
  {
    img: '/homepage/images/DashboardExpenses.png',
    alt: 'Reduzierte Ausgabenansicht mit klarem Fokus auf Struktur',
    title: 'Ruhige Ausgabenstruktur',
    body: 'Die Ausgabenansicht bleibt aufgeräumt und leitet den Blick mit klarer Hierarchie durch Kategorien und Summen.',
  },
  {
    img: '/homepage/images/Groupchat.png',
    alt: 'Schlanker Gruppenchat mit reduziertem Interface',
    title: 'Kommunikation ohne Ballast',
    body: 'Der Gruppenchat wirkt bewusst schlicht, damit Absprachen schnell erfassbar bleiben und nicht im UI untergehen.',
  },
  {
    img: '/homepage/images/stock1.png',
    alt: 'Minimalistisches Aktien-Panel mit Fokus auf Kernwerten',
    title: 'Fokus im Aktienbereich',
    body: 'Charts und Werte sind so angeordnet, dass Trends direkt erfassbar sind und die Orientierung auch bei schnellen Checks bleibt.',
  },
  {
    img: '/homepage/images/stock2.png',
    alt: 'Reduzierte Marktansicht mit klaren Kontrasten und Datenpunkten',
    title: 'Weniger Reibung, mehr Tempo',
    body: 'Kontraste, Abstände und Typografie unterstützen schnelle Entscheidungen und halten den gesamten Flow konsistent.',
  },
];

export default function HomePage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch(apiUrl('/api/auth/session'), { credentials: 'include' })
      .then(r => r.json())
      .then((d: { ok?: boolean }) => { if (d?.ok) setIsLoggedIn(true); })
      .catch(() => {});
  }, []);

  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll('.reveal-up');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('is-visible');
        });
      },
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Video autoplay on visible
  useEffect(() => {
    const videos = Array.from(
      document.querySelectorAll<HTMLVideoElement>('.js-autoplay-on-visible')
    );
    if (!videos.length) return;
    videos.forEach((v) => {
      v.muted = true;
      v.playsInline = true;
    });
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: [0, 0.2, 0.8] }
    );
    videos.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, []);

  const totalSlides = SLIDES.length;
  const goPrev = () => setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  const goNext = () => setCurrentSlide((prev) => (prev + 1) % totalSlides);
  const goTo = (idx: number) => setCurrentSlide(idx);

  return (
    <>
      {/* ═══════════════ NAVBAR ═══════════════ */}
      <header className="hp-nav">
        <Link className="hp-nav__brand" href={isLoggedIn ? '/dashboard' : '/home'} aria-label="Zur FBM Finance Homepage">
          <span className="hp-nav__logo">
            <img src="/shared/images/finanzapp-logo.svg" alt="FBM Finance" className="hp-nav__logo-img" />
          </span>
        </Link>
        <nav className="hp-nav__links" aria-label="Hauptnavigation">
          <a href="#features" className="hp-nav__link">Features</a>
          <a href="#showcase" className="hp-nav__link">Screens</a>
        </nav>
        <div className="hp-nav__actions">
          <Link className="hp-nav__cta" href={isLoggedIn ? '/dashboard' : '/login'}>
            {isLoggedIn ? 'Dashboard' : 'Anmelden'}
          </Link>
        </div>
      </header>

      <main className="hp-main">

        {/* ═══════════════ HERO ═══════════════ */}
        <section className="hp-hero" aria-labelledby="hp-hero-title">
          <div className="hp-hero__bg" aria-hidden="true">
            <div className="hp-hero__orb hp-hero__orb--1"></div>
            <div className="hp-hero__orb hp-hero__orb--2"></div>
            <div className="hp-hero__orb hp-hero__orb--3"></div>
            <div className="hp-hero__grain"></div>
            <div className="hp-hero__grid"></div>
          </div>
          <div className="hp-hero__content">
            <div className="hp-hero__badge reveal-up" style={{ '--delay': '0ms' } as React.CSSProperties}>
              <span className="hp-hero__badge-dot"></span>
              <span>The Next Generation Finance Platform</span>
            </div>
            <h1 id="hp-hero-title" className="hp-hero__title reveal-up" style={{ '--delay': '80ms' } as React.CSSProperties}>
              Wenn Finanzmanagement wie ein Enterprise-System denkt, aber schnell wie ein Startup liefert.
            </h1>
            <p className="hp-hero__body reveal-up" style={{ '--delay': '160ms' } as React.CSSProperties}>
              FBM Finance verbindet AI Assist, Cloud-Native Skalierung und belastbare Security zu einer Plattform, die für persönliche und kollaborative Finanzen gleichermaßen gebaut ist.
            </p>
            <div className="hp-hero__actions reveal-up" style={{ '--delay': '240ms' } as React.CSSProperties}>
              <a className="hp-btn hp-btn--primary" href="#features">Features entdecken</a>
              <Link className="hp-btn hp-btn--ghost" href={isLoggedIn ? '/dashboard' : '/login'}>
                {isLoggedIn ? 'Zum Dashboard →' : 'Jetzt starten →'}
              </Link>
            </div>
            <div className="hp-hero__stats reveal-up" style={{ '--delay': '320ms' } as React.CSSProperties}>
              <div className="hp-stat">
                <span className="hp-stat__value">100%</span>
                <span className="hp-stat__label">Kostenlos</span>
              </div>
              <div className="hp-stat__divider" aria-hidden="true"></div>
              <div className="hp-stat">
                <span className="hp-stat__value">5+</span>
                <span className="hp-stat__label">Module</span>
              </div>
              <div className="hp-stat__divider" aria-hidden="true"></div>
              <div className="hp-stat">
                <span className="hp-stat__value">&lt;1s</span>
                <span className="hp-stat__label">Ladezeit</span>
              </div>
              <div className="hp-stat__divider" aria-hidden="true"></div>
              <div className="hp-stat">
                <span className="hp-stat__value">Dark Mode</span>
                <span className="hp-stat__label">Inklusive</span>
              </div>
            </div>
          </div>

          <div className="hp-hero__visual reveal-up" style={{ '--delay': '100ms' } as React.CSSProperties} aria-hidden="true">
            <div className="hp-hero__card hp-hero__card--main">
              <div className="hp-mockup">
                <div className="hp-mockup__topbar">
                  <span className="hp-mockup__dot"></span>
                  <span className="hp-mockup__dot"></span>
                  <span className="hp-mockup__dot"></span>
                  <span className="hp-mockup__title">Dashboard</span>
                </div>
                <div className="hp-mockup__body">
                  <div className="hp-mockup__balance">
                    <span className="hp-mockup__label">Gesamtvermögen</span>
                    <span className="hp-mockup__amount">€ 12.480,50</span>
                    <span className="hp-mockup__change hp-mockup__change--up">↑ +3,2% diesen Monat</span>
                  </div>
                  <div className="hp-mockup__chart" aria-hidden="true">
                    <svg viewBox="0 0 220 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="hp-mockup__chart-svg">
                      <defs>
                        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--hp-accent)" stopOpacity="0.35"/>
                          <stop offset="100%" stopColor="var(--hp-accent)" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      <path d="M0 60 C20 55, 35 40, 55 42 C75 44, 85 30, 110 25 C135 20, 150 35, 170 28 C185 23, 200 15, 220 10 L220 80 L0 80 Z" fill="url(#chartGrad)"/>
                      <path d="M0 60 C20 55, 35 40, 55 42 C75 44, 85 30, 110 25 C135 20, 150 35, 170 28 C185 23, 200 15, 220 10" stroke="var(--hp-accent)" strokeWidth="2" strokeLinecap="round"/>
                      <circle cx="220" cy="10" r="3.5" fill="var(--hp-accent)"/>
                    </svg>
                  </div>
                  <div className="hp-mockup__rows">
                    <div className="hp-mockup__row">
                      <span className="hp-mockup__row-dot" style={{ background: '#4ade80' }}></span>
                      <span className="hp-mockup__row-label">Gehalt</span>
                      <span className="hp-mockup__row-val hp-mockup__row-val--pos">+€ 3.200</span>
                    </div>
                    <div className="hp-mockup__row">
                      <span className="hp-mockup__row-dot" style={{ background: '#f87171' }}></span>
                      <span className="hp-mockup__row-label">Miete</span>
                      <span className="hp-mockup__row-val hp-mockup__row-val--neg">−€ 950</span>
                    </div>
                    <div className="hp-mockup__row">
                      <span className="hp-mockup__row-dot" style={{ background: '#60a5fa' }}></span>
                      <span className="hp-mockup__row-label">Aktien</span>
                      <span className="hp-mockup__row-val hp-mockup__row-val--pos">+€ 412</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="hp-hero__card hp-hero__card--float hp-hero__card--float-a">
              <span className="hp-floatcard__icon">📈</span>
              <span className="hp-floatcard__text">Portfolio +12%</span>
            </div>
            <div className="hp-hero__card hp-hero__card--float hp-hero__card--float-b">
              <span className="hp-floatcard__icon">🔔</span>
              <span className="hp-floatcard__text">Budget-Alarm: 85%</span>
            </div>
          </div>
        </section>

        {/* ═══════════════ FEATURES GRID ═══════════════ */}
        <section id="features" className="hp-section hp-features reveal-up" style={{ '--delay': '0ms' } as React.CSSProperties}>
          <div className="hp-section__head">
            <p className="hp-label">Features</p>
            <h2 className="hp-section__title">Alles was du brauchst</h2>
            <p className="hp-section__sub">Einnahmen, Ausgaben, Aktien, Gruppen und mehr — in einer Plattform vereint.</p>
          </div>
          <div className="hp-features__grid">
            <article className="hp-feat-card hp-feat-card--wide">
              <div className="hp-feat-card__icon-wrap">
                <svg className="hp-feat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <h3 className="hp-feat-card__title">Einnahmen &amp; Ausgaben</h3>
              <p className="hp-feat-card__body">Buche Transaktionen in Sekunden. Behalte den Überblick über Kategorien, Zeiträume und Cashflow — alles auf einem Blick.</p>
              <div className="hp-feat-card__pill">Core Feature</div>
            </article>
            <article className="hp-feat-card">
              <div className="hp-feat-card__icon-wrap">
                <svg className="hp-feat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                </svg>
              </div>
              <h3 className="hp-feat-card__title">Aktien &amp; Portfolio</h3>
              <p className="hp-feat-card__body">Live-Kurse und Performance-Charts für dein Wertpapierdepot.</p>
            </article>
            <article className="hp-feat-card">
              <div className="hp-feat-card__icon-wrap">
                <svg className="hp-feat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 className="hp-feat-card__title">Gruppen &amp; Chat</h3>
              <p className="hp-feat-card__body">Finanziere gemeinsam. Gruppen-Chats und geteilte Budgets für Teams und Familien.</p>
            </article>
            <article className="hp-feat-card">
              <div className="hp-feat-card__icon-wrap">
                <svg className="hp-feat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>
                </svg>
              </div>
              <h3 className="hp-feat-card__title">Finanz-Q&amp;A</h3>
              <p className="hp-feat-card__body">Stelle Fragen, erhalte smarte Antworten. Deine persönliche Finanzberatung.</p>
            </article>
            <article className="hp-feat-card">
              <div className="hp-feat-card__icon-wrap">
                <svg className="hp-feat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
              <h3 className="hp-feat-card__title">Sicherheit &amp; Privatsphäre</h3>
              <p className="hp-feat-card__body">Deine Daten bleiben deine Daten. Sichere Authentifizierung, keine Werbung.</p>
            </article>
            <article className="hp-feat-card">
              <div className="hp-feat-card__icon-wrap">
                <svg className="hp-feat-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.07 4.93A10 10 0 0 1 21 12M4.93 19.07A10 10 0 0 1 3 12"/>
                  <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
              </div>
              <h3 className="hp-feat-card__title">Dark &amp; Light Mode</h3>
              <p className="hp-feat-card__body">Angenehm bei Tag und Nacht. Themes und mehrere Designvarianten inklusive.</p>
            </article>
          </div>
        </section>

        {/* ═══════════════ VIDEO REGISTRIERUNG ═══════════════ */}
        <section id="quick-register" className="hp-video-story">
          <div className="hp-video-story__sticky">
            <video
              className="hp-video-story__media js-autoplay-on-visible"
              muted
              playsInline
              loop
              preload="metadata"
              aria-label="Demo der schnellen Registrierung in FBM Finance"
            >
              <source src="/homepage/videos/register.mp4" type="video/mp4" />
            </video>
            <div className="hp-video-story__overlay">
              <p className="hp-label hp-label--light">Onboarding Experience</p>
              <h2 className="hp-video-story__title">Schnelle Registrierung in Sekunden</h2>
              <p className="hp-video-story__body">Einmal scrollen, kurz ansehen, direkt verstehen: Der Flow ist auf Tempo gebaut und bleibt während des Scrollens im Fokus.</p>
              <Link className="hp-btn hp-btn--outline-light" href={isLoggedIn ? '/dashboard' : '/login'}>
                {isLoggedIn ? 'Zum Dashboard →' : 'Jetzt registrieren →'}
              </Link>
            </div>
          </div>
        </section>

        {/* ═══════════════ INCOME/EXPENSES SHOWCASE ═══════════════ */}
        <section id="showcase" className="hp-section hp-showcase-row reveal-up" style={{ '--delay': '0ms' } as React.CSSProperties}>
          <div className="hp-showcase-row__text">
            <p className="hp-label">Tracking Workflow</p>
            <h2 className="hp-section__title">Einnahmen und Ausgaben in einem Flow</h2>
            <p className="hp-section__sub">Das Video zeigt, wie Buchungen schnell erfasst und sofort im Finanzbild sichtbar werden. So bleibt der Alltag übersichtlich, ohne lange Eingaben.</p>
            <Link className="hp-btn hp-btn--primary" href={isLoggedIn ? '/dashboard' : '/login'} style={{ marginTop: '24px' }}>
              {isLoggedIn ? 'Dashboard öffnen →' : 'App starten →'}
            </Link>
          </div>
          <div className="hp-showcase-row__media">
            <div className="hp-showcase-row__frame">
              <video
                className="hp-showcase-row__video js-autoplay-on-visible"
                muted
                playsInline
                loop
                preload="metadata"
                aria-label="Demo zum Erfassen von Einnahmen und Ausgaben in FBM Finance"
              >
                <source src="/homepage/videos/IncomeAndExpenses.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </section>

        {/* ═══════════════ DESIGN CAROUSEL ═══════════════ */}
        <section id="minimal-design" className="hp-section hp-carousel-section reveal-up" style={{ '--delay': '0ms' } as React.CSSProperties}>
          <div className="hp-section__head">
            <p className="hp-label">Minimalist Design</p>
            <h2 className="hp-section__title">Warum das minimalistische Design so gut funktioniert</h2>
            <p className="hp-section__sub">Diese Unterpunkte zeigen, wie reduzierte Oberflächen den Fokus auf Entscheidungen legen statt auf visuelle Ablenkung.</p>
          </div>
          <div className="hp-carousel">
            <button className="hp-carousel__arrow hp-carousel__arrow--prev" type="button" aria-label="Vorheriges Bild" onClick={goPrev}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <div className="hp-carousel__viewport">
              {SLIDES.map((slide, idx) => (
                <article
                  key={slide.img}
                  className={`hp-carousel__slide${idx === currentSlide ? ' is-active' : ''}`}
                  aria-hidden={idx !== currentSlide}
                >
                  <div className="hp-carousel__img-wrap">
                    <img src={slide.img} alt={slide.alt} loading="lazy" />
                  </div>
                  <div className="hp-carousel__caption">
                    <h3>{slide.title}</h3>
                    <p>{slide.body}</p>
                  </div>
                </article>
              ))}
            </div>
            <button className="hp-carousel__arrow hp-carousel__arrow--next" type="button" aria-label="Nächstes Bild" onClick={goNext}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
          <div className="hp-carousel__dots" aria-label="Auswahl der Design-Bilder">
            {SLIDES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`design-dot${idx === currentSlide ? ' is-active' : ''}`}
                aria-label={`Zu Bild wechseln ${idx + 1}`}
                aria-current={idx === currentSlide ? 'true' : 'false'}
                onClick={() => goTo(idx)}
              />
            ))}
          </div>
        </section>

        {/* ═══════════════ FINAL CTA ═══════════════ */}
        <section className="hp-cta reveal-up" style={{ '--delay': '0ms' } as React.CSSProperties}>
          <div className="hp-cta__bg" aria-hidden="true">
            <div className="hp-cta__orb hp-cta__orb--1"></div>
            <div className="hp-cta__orb hp-cta__orb--2"></div>
            <div className="hp-cta__grain"></div>
          </div>
          <div className="hp-cta__content">
            <h2 className="hp-cta__title">Bereit, deine Finanzen<br /><em>in den Griff zu bekommen?</em></h2>
            <p className="hp-cta__sub">Kostenlos starten, sofort loslegen. Kein Abo, keine versteckten Kosten.</p>
            <div className="hp-cta__actions">
              <Link className="hp-btn hp-btn--primary hp-btn--lg" href={isLoggedIn ? '/dashboard' : '/login'}>
                {isLoggedIn ? 'Dashboard öffnen' : 'Kostenlos registrieren'}
              </Link>
              <a className="hp-btn hp-btn--ghost-dark" href="#features">Features ansehen</a>
            </div>
          </div>
        </section>

      </main>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="hp-footer">
        <div className="hp-footer__inner">
          <span className="hp-footer__brand">FBM Finance</span>
          <span className="hp-footer__copy">© 2025 FBM Finance · Hochschulprojekt Web Engineering</span>
        </div>
      </footer>
    </>
  );
}
