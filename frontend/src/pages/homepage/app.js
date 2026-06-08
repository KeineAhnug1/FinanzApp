import { t as sharedT } from '@shared/js/language-utils.js';
import { initThemeSwitcher } from '@shared/js/theme-utils.js';

const authButton = document.getElementById("top-auth-btn");
let syncDesignCarouselLabels = () => {};
const t = (key, fallback) => {
  const translated = sharedT(key);
  return translated && translated !== key ? translated : fallback;
};

initThemeSwitcher();

function setText(id, key, fallback) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = t(key, fallback);
}

function setAttr(id, attr, key, fallback) {
  const element = document.getElementById(id);
  if (!element) return;
  element.setAttribute(attr, t(key, fallback));
}

function renderHomepageCopy() {
  document.title = t("homepage.page_title", "FBM Finance | Homepage");

  setAttr("homepage-brand-link", "aria-label", "homepage.brand_aria", "Zur FBM Finance Homepage");

  setText("homepage-hero-kicker", "homepage.hero.kicker", "The Next Generation Finance Platform");
  setText("homepage-hero-title", "homepage.hero.title", "Wenn Finanzmanagement wie ein Enterprise-System denkt, aber schnell wie ein Startup liefert.");
  setText("homepage-hero-body", "homepage.hero.body", "FBM Finance verbindet AI Assist, Cloud-Native Skalierung und belastbare Security zu einer Plattform, die für persönliche und kollaborative Finanzen gleichermaßen gebaut ist.");
  setText("homepage-hero-cta", "homepage.hero.cta", "Features entdecken");

  setText("homepage-ai-tag", "homepage.ai.tag", "AI Enhancement");
  setText("homepage-ai-title", "homepage.ai.title", "Adaptive Finance Intelligence");
  setText("homepage-ai-body", "homepage.ai.body", "Unsere AI-Layer priorisieren relevante Ausgabenmuster, kategorisieren dynamisch und liefern Kontext, bevor man aktiv suchen muss. Ergebnis: weniger Rauschen, mehr Entscheidungen.");
  setAttr("homepage-ai-image", "alt", "homepage.ai.alt", "Abstrakte KI-Analyse mit Score-Linien und Vorhersagefenstern");

  setAttr("homepage-register-video", "aria-label", "homepage.video.aria", "Demo der schnellen Registrierung in FBM Finance");
  setText("homepage-video-fallback", "homepage.video.unsupported", "Dein Browser unterstützt dieses Videoformat nicht.");
  setText("homepage-video-tag", "homepage.video.tag", "Onboarding Experience");
  setText("homepage-video-title", "homepage.video.title", "Schnelle Registrierung in Sekunden");
  setText("homepage-video-body", "homepage.video.body", "Einmal scrollen, kurz ansehen, direkt verstehen: Der Flow ist auf Tempo gebaut und bleibt während des Scrollens im Fokus.");

  setText("homepage-income-expenses-tag", "homepage.income_expenses.tag", "Tracking Workflow");
  setText("homepage-income-expenses-title", "homepage.income_expenses.title", "Einnahmen und Ausgaben in einem Flow");
  setText("homepage-income-expenses-body", "homepage.income_expenses.body", "Das Video zeigt, wie Buchungen schnell erfasst und sofort im Finanzbild sichtbar werden. So bleibt der Alltag übersichtlich, ohne lange Eingaben.");
  setAttr("homepage-income-expenses-video", "aria-label", "homepage.income_expenses.aria", "Demo zum Erfassen von Einnahmen und Ausgaben in FBM Finance");
  setText("homepage-income-expenses-fallback", "homepage.income_expenses.unsupported", "Dein Browser unterstützt dieses Videoformat nicht.");

  setText("homepage-design-tag", "homepage.design.tag", "Minimalist Design");
  setText("homepage-design-title", "homepage.design.title", "Warum das minimalistische Design so gut funktioniert");
  setText("homepage-design-body", "homepage.design.body", "Diese Unterpunkte zeigen, wie reduzierte Oberflächen den Fokus auf Entscheidungen legen statt auf visuelle Ablenkung.");
  setAttr("homepage-design-prev", "aria-label", "homepage.design.prev_aria", "Vorheriges Bild anzeigen");
  setAttr("homepage-design-next", "aria-label", "homepage.design.next_aria", "Nächstes Bild anzeigen");
  setAttr("homepage-design-dots", "aria-label", "homepage.design.dots_aria", "Auswahl der Design-Bilder");

  setText("homepage-design-income-title", "homepage.design.income.title", "Klare Einnahmenflächen");
  setText("homepage-design-income-body", "homepage.design.income.body", "Wichtige Kennzahlen sind sofort lesbar, weil nur die Informationen im Vordergrund stehen, die im Moment relevant sind.");
  setAttr("homepage-design-income-image", "alt", "homepage.design.income.alt", "Minimalistische Übersicht der Einnahmen im Dashboard");

  setText("homepage-design-expenses-title", "homepage.design.expenses.title", "Ruhige Ausgabenstruktur");
  setText("homepage-design-expenses-body", "homepage.design.expenses.body", "Die Ausgabenansicht bleibt aufgeräumt und leitet den Blick mit klarer Hierarchie durch Kategorien und Summen.");
  setAttr("homepage-design-expenses-image", "alt", "homepage.design.expenses.alt", "Reduzierte Ausgabenansicht mit klarem Fokus auf Struktur");

  setText("homepage-design-groupchat-title", "homepage.design.groupchat.title", "Kommunikation ohne Ballast");
  setText("homepage-design-groupchat-body", "homepage.design.groupchat.body", "Der Gruppenchat wirkt bewusst schlicht, damit Absprachen schnell erfassbar bleiben und nicht im UI untergehen.");
  setAttr("homepage-design-groupchat-image", "alt", "homepage.design.groupchat.alt", "Schlanker Gruppenchat mit reduziertem Interface");

  setText("homepage-design-stock1-title", "homepage.design.stock1.title", "Fokus im Aktienbereich");
  setText("homepage-design-stock1-body", "homepage.design.stock1.body", "Charts und Werte sind so angeordnet, dass Trends direkt erfassbar sind und die Orientierung auch bei schnellen Checks bleibt.");
  setAttr("homepage-design-stock1-image", "alt", "homepage.design.stock1.alt", "Minimalistisches Aktien-Panel mit Fokus auf Kernwerten");

  setText("homepage-design-stock2-title", "homepage.design.stock2.title", "Weniger Reibung, mehr Tempo");
  setText("homepage-design-stock2-body", "homepage.design.stock2.body", "Kontraste, Abstände und Typografie unterstützen schnelle Entscheidungen und halten den gesamten Flow konsistent.");
  setAttr("homepage-design-stock2-image", "alt", "homepage.design.stock2.alt", "Reduzierte Marktansicht mit klaren Kontrasten und Datenpunkten");

  setText("homepage-serverless-tag", "homepage.serverless.tag", "Serverless Computing");
  setText("homepage-serverless-title", "homepage.serverless.title", "Instant Elastic Runtime");
  setText("homepage-serverless-body", "homepage.serverless.body", "Event-basierte Dienste reagieren in Echtzeit auf Lastspitzen und entkoppeln Nutzung von statischer Infrastruktur.");
  setAttr("homepage-serverless-image", "alt", "homepage.serverless.alt", "Serverlose Infrastruktur mit Event-Flows und verteilten Funktionen");

  setText("homepage-quantum-tag", "homepage.quantum.tag", "Quantum Computing (Roadmap)");
  setText("homepage-quantum-title", "homepage.quantum.title", "Quantum-Ready Core Design");
  setText("homepage-quantum-body", "homepage.quantum.body", "Die Architektur ist modular vorbereitet, um künftige Quantum-Optimierung in Analytik und Prognosepfade einzubinden.");
  setAttr("homepage-quantum-image", "alt", "homepage.quantum.alt", "Quantum-inspirierte Netzwerkstruktur mit Knoten und Interferenzmustern");

  setText("homepage-blockchain-tag", "homepage.blockchain.tag", "Blockchain");
  setText("homepage-blockchain-title", "homepage.blockchain.title", "Verifiable Financial Ledger Layer");
  setText("homepage-blockchain-body", "homepage.blockchain.body", "Kritische Finanzereignisse können auditierbar protokolliert werden, um Unveränderbarkeit und Vertrauen abzusichern.");
  setAttr("homepage-blockchain-image", "alt", "homepage.blockchain.alt", "Kettenstruktur mit verifizierten Finanzblöcken und Signaturpunkten");

  setText("homepage-saas-tag", "homepage.saas.tag", "SaaS");
  setText("homepage-saas-title", "homepage.saas.title", "Continuous Value Delivery");
  setText("homepage-saas-body", "homepage.saas.body", "Release-Zyklen, Sicherheitsupdates und Produktverbesserungen laufen kontinuierlich, damit die Plattform ohne Downtime mitwächst.");
  setAttr("homepage-saas-image", "alt", "homepage.saas.alt", "SaaS-Bereitstellung mit mehreren Releases, Pipelines und Nutzergruppen");

  setText("homepage-loadbalanced-tag", "homepage.loadbalanced.tag", "Load Balanced (Roadmap)");
  setText("homepage-loadbalanced-title", "homepage.loadbalanced.title", "Traffic-Aware Service Orchestration");
  setText("homepage-loadbalanced-body", "homepage.loadbalanced.body", "Eingehender Traffic wird intelligent verteilt, um Antwortzeiten stabil zu halten und kritische Services robust zu betreiben.");
  setAttr("homepage-loadbalanced-image", "alt", "homepage.loadbalanced.alt", "Load-Balancer mit verteilten Datenströmen auf mehrere Service-Knoten");

  setText("homepage-scalable-tag", "homepage.scalable.tag", "Scalable Architecture");
  setText("homepage-scalable-title", "homepage.scalable.title", "Horizontal Growth Without Friction");
  setText("homepage-scalable-body", "homepage.scalable.body", "Services werden horizontal skaliert und klar getrennt deployt — erweiterbar, wartbar und für neue Module offen.");
  setAttr("homepage-scalable-image", "alt", "homepage.scalable.alt", "Skalierende Cluster-Topologie mit wachsendem Service-Gitter");

  setText("homepage-aws-tag", "homepage.aws.tag", "Backend on AWS");
  setText("homepage-aws-title", "homepage.aws.title", "Cloud Operations with Production Discipline");
  setText("homepage-aws-body", "homepage.aws.body", "Der Backend-Stack ist cloud-fokussiert aufgebaut: reproduzierbare Deployments, stabile Betriebsprozesse und hohe Verfügbarkeit.");
  setAttr("homepage-aws-image", "alt", "homepage.aws.alt", "Cloud-Infrastruktur auf AWS mit Services, Datenebene und Monitoring");

  syncDesignCarouselLabels();
}

async function updateAuthButtonVisibility() {
  if (!authButton) return;
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const payload = await response.json();
    const isLoggedIn = Boolean(response.ok && payload?.ok && payload?.session_user);
    authButton.textContent = isLoggedIn
      ? t("homepage.auth.dashboard", "Dashboard")
      : t("homepage.auth.login_register", "Anmelden");
    authButton.href = isLoggedIn ? "/pages/dashboard/dashboard.html" : "/";
  } catch {
    authButton.textContent = t("homepage.auth.login_register", "Anmelden");
    authButton.href = "/";
  }
}

function initRevealAnimations() {
  const revealNodes = Array.from(document.querySelectorAll(".reveal-up"));
  if (!revealNodes.length) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion || !("IntersectionObserver" in window)) {
    for (const node of revealNodes) node.classList.add("is-visible");
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-visible");
      obs.unobserve(entry.target);
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  for (const node of revealNodes) {
    if (node.classList.contains("is-visible")) continue;
    observer.observe(node);
  }
}

function initScrollAutoplayVideos() {
  const videos = Array.from(document.querySelectorAll(".js-autoplay-on-visible"));
  if (!videos.length) return;
  for (const video of videos) { video.muted = true; video.playsInline = true; }

  if (!("IntersectionObserver" in window)) {
    for (const video of videos) video.play().catch(() => {});
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target;
      if (!(video instanceof HTMLVideoElement)) continue;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  }, { threshold: [0, 0.2, 0.8] });

  for (const video of videos) observer.observe(video);
}

function initDesignCarousel() {
  const carousel = document.getElementById("homepage-design-carousel");
  const dotsHost = document.getElementById("homepage-design-dots");
  const prevButton = document.getElementById("homepage-design-prev");
  const nextButton = document.getElementById("homepage-design-next");
  if (!carousel || !dotsHost || !prevButton || !nextButton) return () => {};

  const slides = Array.from(carousel.querySelectorAll(".hp-carousel__slide"));
  if (!slides.length) return () => {};
  const animationMs = 360;

  let activeIndex = slides.findIndex((s) => s.classList.contains("is-active"));
  if (activeIndex < 0) activeIndex = 0;
  let isAnimating = false;

  const dotButtons = slides.map((_, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "design-dot";
    dot.dataset.index = String(index);
    dot.addEventListener("click", () => {
      if (index === activeIndex) return;
      animateTo(index, index > activeIndex ? "right" : "left");
    });
    dotsHost.append(dot);
    return dot;
  });

  function clearMotionClasses(slide) {
    slide.classList.remove(
      "is-enter-from-right", "is-enter-from-left",
      "is-leave-to-left", "is-leave-to-right"
    );
  }

  function renderSlides() {
    slides.forEach((slide, index) => {
      clearMotionClasses(slide);
      slide.classList.toggle("is-active", index === activeIndex);
      slide.setAttribute("aria-hidden", String(index !== activeIndex));
    });
    dotButtons.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });
  }

  function renderDots() {
    dotButtons.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
      dot.setAttribute("aria-current", index === activeIndex ? "true" : "false");
    });
  }

  function animateTo(nextIndex, direction) {
    if (isAnimating || nextIndex === activeIndex) return;
    const currentSlide = slides[activeIndex];
    const nextSlide = slides[nextIndex];
    if (!currentSlide || !nextSlide) return;

    isAnimating = true;
    const leaveClass = direction === "right" ? "is-leave-to-left" : "is-leave-to-right";
    const enterClass = direction === "right" ? "is-enter-from-right" : "is-enter-from-left";

    clearMotionClasses(currentSlide);
    clearMotionClasses(nextSlide);
    nextSlide.classList.remove("is-active");
    nextSlide.classList.add(enterClass);
    nextSlide.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
      currentSlide.classList.remove("is-active");
      currentSlide.classList.add(leaveClass);
      nextSlide.classList.remove(enterClass);
      nextSlide.classList.add("is-active");
    });

    const previousIndex = activeIndex;
    activeIndex = nextIndex;
    renderDots();

    window.setTimeout(() => {
      clearMotionClasses(slides[previousIndex]);
      slides[previousIndex].classList.remove("is-active");
      slides[previousIndex].setAttribute("aria-hidden", "true");
      clearMotionClasses(nextSlide);
      nextSlide.classList.add("is-active");
      nextSlide.setAttribute("aria-hidden", "false");
      isAnimating = false;
    }, animationMs + 30);
  }

  function syncLabels() {
    dotButtons.forEach((dot, index) => {
      dot.setAttribute("aria-label", `${t("homepage.design.dot_aria", "Zu Bild wechseln")} ${index + 1}`);
    });
  }

  prevButton.addEventListener("click", () => {
    animateTo((activeIndex - 1 + slides.length) % slides.length, "left");
  });
  nextButton.addEventListener("click", () => {
    animateTo((activeIndex + 1) % slides.length, "right");
  });
  carousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); prevButton.click(); }
    else if (event.key === "ArrowRight") { event.preventDefault(); nextButton.click(); }
  });

  syncLabels();
  renderSlides();
  return syncLabels;
}

renderHomepageCopy();
syncDesignCarouselLabels = initDesignCarousel();

window.addEventListener("finanzapp:locale-changed", () => {
  renderHomepageCopy();
  updateAuthButtonVisibility();
});

updateAuthButtonVisibility();
initRevealAnimations();
initScrollAutoplayVideos();
