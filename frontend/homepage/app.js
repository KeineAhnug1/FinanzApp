(function initHomepage() {
  const authButton = document.getElementById("top-auth-btn");

  if (window.FinanzAppTheme?.initThemeSwitcher) {
    window.FinanzAppTheme.initThemeSwitcher();
  }

  async function updateAuthButtonVisibility() {
    if (!authButton) return;
    try {
      const response = await fetch("/api/session", { credentials: "same-origin" });
      const payload = await response.json();
      const isLoggedIn = Boolean(response.ok && payload?.ok && payload?.session_user);
      authButton.hidden = isLoggedIn;
    } catch {
      authButton.hidden = false;
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

  updateAuthButtonVisibility();
  initRevealAnimations();
})();
