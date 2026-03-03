(function initHomepage() {
  const authButton = document.getElementById("top-auth-btn");
  const t = (key, fallback) => {
    const translated = window.FinanzAppLanguage?.t?.(key);
    return translated && translated !== key ? translated : fallback;
  };

  if (window.FinanzAppTheme?.initThemeSwitcher) {
    window.FinanzAppTheme.initThemeSwitcher();
  }

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
    document.title = t("homepage.page_title", "FinanzApp | Homepage");

    setAttr("homepage-brand-link", "aria-label", "homepage.brand_aria", "Zur FinanzApp Homepage");
    setText("homepage-brand-sub", "homepage.brand_sub", "Homepage");

    setText("homepage-hero-kicker", "homepage.hero.kicker", "The Next Generation Finance Platform");
    setText("homepage-hero-title", "homepage.hero.title", "Wenn Finanzmanagement wie ein Enterprise-System denkt, aber schnell wie ein Startup liefert.");
    setText("homepage-hero-body", "homepage.hero.body", "FinanzApp verbindet AI Assist, Cloud-Native Skalierung und belastbare Security zu einer Plattform, die für persönliche und kollaborative Finanzen gleichermaßen gebaut ist.");
    setText("homepage-hero-cta", "homepage.hero.cta", "Zur Capability Tour");

    setText("homepage-ai-tag", "homepage.ai.tag", "AI Enhancement");
    setText("homepage-ai-title", "homepage.ai.title", "Adaptive Finance Intelligence");
    setText("homepage-ai-body", "homepage.ai.body", "Unsere AI-Layer priorisieren relevante Ausgabenmuster, kategorisieren dynamisch und liefern Kontext, bevor man aktiv suchen muss. Ergebnis: weniger Rauschen, mehr Entscheidungen.");
    setAttr("homepage-ai-image", "alt", "homepage.ai.alt", "Abstrakte KI-Analyse mit Score-Linien und Vorhersagefenstern");

    setAttr("homepage-register-video", "aria-label", "homepage.video.aria", "Demo der schnellen Registrierung in der FinanzApp");
    setText("homepage-video-fallback", "homepage.video.unsupported", "Dein Browser unterstützt dieses Videoformat nicht.");
    setText("homepage-video-tag", "homepage.video.tag", "Onboarding Experience");
    setText("homepage-video-title", "homepage.video.title", "Schnelle Registrierung in Sekunden");
    setText("homepage-video-body", "homepage.video.body", "Einmal scrollen, kurz ansehen, direkt verstehen: Der Flow ist auf Tempo gebaut und bleibt während des Scrollens im Fokus.");

    setText("homepage-income-expenses-tag", "homepage.income_expenses.tag", "Tracking Workflow");
    setText("homepage-income-expenses-title", "homepage.income_expenses.title", "Einnahmen und Ausgaben in einem Flow");
    setText("homepage-income-expenses-body", "homepage.income_expenses.body", "Das Video zeigt, wie Buchungen schnell erfasst und sofort im Finanzbild sichtbar werden. So bleibt der Alltag übersichtlich, ohne lange Eingaben.");
    setAttr("homepage-income-expenses-video", "aria-label", "homepage.income_expenses.aria", "Demo zum Erfassen von Einnahmen und Ausgaben in der FinanzApp");
    setText("homepage-income-expenses-fallback", "homepage.income_expenses.unsupported", "Dein Browser unterstützt dieses Videoformat nicht.");

    setText("homepage-serverless-tag", "homepage.serverless.tag", "Serverless Computing");
    setText("homepage-serverless-title", "homepage.serverless.title", "Instant Elastic Runtime");
    setText("homepage-serverless-body", "homepage.serverless.body", "Event-basierte Dienste reagieren in Echtzeit auf Lastspitzen und entkoppeln Nutzung von statischer Infrastruktur. Die Plattform bleibt performant, auch wenn die Nutzerzahlen explodieren.");
    setAttr("homepage-serverless-image", "alt", "homepage.serverless.alt", "Serverlose Infrastruktur mit Event-Flows und verteilten Funktionen");

    setText("homepage-quantum-tag", "homepage.quantum.tag", "Quantum Computing (Roadmap)");
    setText("homepage-quantum-title", "homepage.quantum.title", "Quantum-Ready Core Design");
    setText("homepage-quantum-body", "homepage.quantum.body", "Die Architektur ist modular vorbereitet, um künftige Quantum-Optimierung in Analytik und Prognosepfade einzubinden, ohne bestehende Kernprozesse neu aufbauen zu müssen.");
    setAttr("homepage-quantum-image", "alt", "homepage.quantum.alt", "Quantum-inspirierte Netzwerkstruktur mit Knoten und Interferenzmustern");

    setText("homepage-blockchain-tag", "homepage.blockchain.tag", "Blockchain");
    setText("homepage-blockchain-title", "homepage.blockchain.title", "Verifiable Financial Ledger Layer");
    setText("homepage-blockchain-body", "homepage.blockchain.body", "Kritische Finanzereignisse können auditierbar protokolliert werden, um Unveränderbarkeit, Nachvollziehbarkeit und Vertrauen in sensible Workflows systemseitig abzusichern.");
    setAttr("homepage-blockchain-image", "alt", "homepage.blockchain.alt", "Kettenstruktur mit verifizierten Finanzblöcken und Signaturpunkten");

    setText("homepage-saas-tag", "homepage.saas.tag", "SaaS");
    setText("homepage-saas-title", "homepage.saas.title", "Continuous Value Delivery");
    setText("homepage-saas-body", "homepage.saas.body", "Release-Zyklen, Sicherheitsupdates und Produktverbesserungen laufen kontinuierlich, damit die Plattform ohne Downtime mit den Anforderungen des Markts mitwachsen kann.");
    setAttr("homepage-saas-image", "alt", "homepage.saas.alt", "SaaS-Bereitstellung mit mehreren Releases, Pipelines und Nutzergruppen");

    setText("homepage-loadbalanced-tag", "homepage.loadbalanced.tag", "Load Balanced (Roadmap)");
    setText("homepage-loadbalanced-title", "homepage.loadbalanced.title", "Traffic-Aware Service Orchestration");
    setText("homepage-loadbalanced-body", "homepage.loadbalanced.body", "Eingehender Traffic wird intelligent verteilt, um Antwortzeiten stabil zu halten und kritische Service-Komponenten auch unter Peak-Bedingungen robust betreiben zu können.");
    setAttr("homepage-loadbalanced-image", "alt", "homepage.loadbalanced.alt", "Load-Balancer mit verteilten Datenströmen auf mehrere Service-Knoten");

    setText("homepage-scalable-tag", "homepage.scalable.tag", "Scalable Architecture");
    setText("homepage-scalable-title", "homepage.scalable.title", "Horizontal Growth Without Friction");
    setText("homepage-scalable-body", "homepage.scalable.body", "Services werden horizontal skaliert und klar getrennt deployt. So bleibt die Plattform unter Last erweiterbar, wartbar und für neue Module offen.");
    setAttr("homepage-scalable-image", "alt", "homepage.scalable.alt", "Skalierende Cluster-Topologie mit wachsendem Service-Gitter");

    setText("homepage-aws-tag", "homepage.aws.tag", "Backend on AWS");
    setText("homepage-aws-title", "homepage.aws.title", "Cloud Operations with Production Discipline");
    setText("homepage-aws-body", "homepage.aws.body", "Der Backend-Stack ist cloud-fokussiert aufgebaut: reproduzierbare Deployments, stabile Betriebsprozesse und eine Infrastruktur, die auf Verfügbarkeit ausgelegt ist.");
    setAttr("homepage-aws-image", "alt", "homepage.aws.alt", "Cloud-Infrastruktur auf AWS mit Services, Datenebene und Monitoring");
  }

  async function updateAuthButtonVisibility() {
    if (!authButton) return;
    try {
      const response = await fetch("/api/session", { credentials: "same-origin" });
      const payload = await response.json();
      const isLoggedIn = Boolean(response.ok && payload?.ok && payload?.session_user);
      authButton.textContent = isLoggedIn
        ? t("homepage.auth.dashboard", "Dashboard")
        : t("homepage.auth.login_register", "Anmelden / Registrieren");
      authButton.href = isLoggedIn ? "/dashboard.html" : "/";
    } catch {
      authButton.textContent = t("homepage.auth.login_register", "Anmelden / Registrieren");
      authButton.href = "/";
    }
  }

  function initRevealAnimations() {
    const revealNodes = Array.from(document.querySelectorAll(".reveal-from-bottom"));
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
    }, {
      threshold: 0.18,
      rootMargin: "0px 0px -10% 0px"
    });

    for (const node of revealNodes) {
      if (node.classList.contains("is-visible")) continue;
      observer.observe(node);
    }
  }

  function initScrollAutoplayVideos() {
    const videos = Array.from(document.querySelectorAll(".js-autoplay-on-visible"));
    if (!videos.length) return;

    for (const video of videos) {
      video.muted = true;
      video.playsInline = true;
    }

    if (!("IntersectionObserver" in window)) {
      for (const video of videos) {
        video.play().catch(() => {});
      }
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
    }, {
      threshold: [0, 0.2, 0.8],
      rootMargin: "0px"
    });

    for (const video of videos) observer.observe(video);
  }

  renderHomepageCopy();
  window.addEventListener("finanzapp:locale-changed", () => {
    renderHomepageCopy();
    updateAuthButtonVisibility();
  });
  updateAuthButtonVisibility();
  initRevealAnimations();
  initScrollAutoplayVideos();
})();
