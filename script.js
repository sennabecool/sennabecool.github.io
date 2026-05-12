// =========================================================
// Portfolio interactions — scripted "chat" navigation
// =========================================================
(() => {
  const body = document.body;
  const screens = Array.from(document.querySelectorAll('[data-screen-name]'));
  const screensByName = new Map(screens.map(s => [s.dataset.screenName, s]));

  const navStack = ['home'];

  function showScreen(name) {
    if (!screensByName.has(name)) return;
    screens.forEach(s => {
      const match = s.dataset.screenName === name;
      s.hidden = !match;
    });
    body.dataset.screen = name;
    updateActiveChips(name);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function updateActiveChips(name) {
    document.querySelectorAll('.chip[data-target]').forEach(chip => {
      if (chip.dataset.target === name) chip.setAttribute('aria-current', 'page');
      else chip.removeAttribute('aria-current');
    });
  }

  function navigate(target) {
    if (!target) return;
    if (target !== navStack[navStack.length - 1]) navStack.push(target);
    showScreen(target);
    closeMenu();
  }

  function goBack() {
    if (navStack.length > 1) navStack.pop();
    showScreen(navStack[navStack.length - 1]);
    closeMenu();
  }

  // --- Menu open / close ---------------------------------
  function openMenu() {
    // FLIP capture: each small chip's position before the menu opens.
    // Keyed by data-target / data-action so each big chip can find its twin.
    const startRects = new Map();
    document.querySelectorAll(".chatbox__options[data-state='collapsed'] .chip").forEach(c => {
      const key = c.dataset.target || c.dataset.action;
      if (key) startRects.set(key, c.getBoundingClientRect());
    });

    body.dataset.menu = 'open';
    const btn = document.querySelector('.menu-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close suggestions');
    }

    // FLIP play: animate each big chip from its twin's small position/size
    // to identity, then fade in the muted framing words with stagger.
    requestAnimationFrame(() => {
      const expanded = document.querySelectorAll(".chatbox__options[data-state='expanded'] .chip");
      expanded.forEach((big, i) => {
        const key = big.dataset.target || big.dataset.action;
        const from = startRects.get(key);
        if (!from) return;
        const to = big.getBoundingClientRect();

        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const sx = from.width  / to.width;
        const sy = from.height / to.height;

        big.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: '0 0' },
            { transform: 'none',                                            transformOrigin: '0 0' }
          ],
          { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
        );

        // Typewriter reveal: each char of the framing words appears one
        // at a time. Within a chip, the right muted only starts once
        // the left muted has finished.
        typewriterReveal(big, 280 + i * 100);
      });
    });
  }

  // Split each muted span into per-character spans (idempotent), then
  // animate each char's opacity 0 → 1 in sequence using stepped timing.
  function typewriterReveal(chip, baseDelay, charMs = 20) {
    let cursor = baseDelay;
    chip.querySelectorAll('.chip__muted').forEach(muted => {
      if (!muted.dataset.split) {
        const text = muted.textContent;
        muted.textContent = '';
        for (const ch of text) {
          const span = document.createElement('span');
          span.className = 'chip__char';
          span.textContent = ch;
          muted.appendChild(span);
        }
        muted.dataset.split = '1';
      }
      const chars = muted.querySelectorAll('.chip__char');
      chars.forEach((c, i) => {
        c.getAnimations().forEach(a => a.cancel());
        c.style.opacity = '0';
        c.animate(
          [{ opacity: 0 }, { opacity: 1 }],
          {
            duration: 1,
            delay: cursor + i * charMs,
            easing: 'steps(1, end)',
            fill: 'both'
          }
        );
      });
      cursor += chars.length * charMs;
    });
  }
  function closeMenu() {
    body.dataset.menu = 'closed';
    const btn = document.querySelector('.menu-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open suggestions');
    }
  }
  function toggleMenu() {
    body.dataset.menu === 'open' ? closeMenu() : openMenu();
  }

  // --- Dark mode (no-op stub for now) --------------------
  function toggleDark() {
    const isDark = body.classList.toggle('is-dark');
    body.dataset.theme = isDark ? 'dark' : 'light';
  }

  // --- Click delegation ----------------------------------
  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      switch (actionEl.dataset.action) {
        case 'back':         goBack(); return;
        case 'toggle-menu':  toggleMenu(); return;
        case 'close-menu':   closeMenu(); return;
        case 'toggle-dark':  toggleDark(); closeMenu(); return;
      }
    }

    const targetEl = e.target.closest('[data-target]');
    if (targetEl) {
      navigate(targetEl.dataset.target);
    }
  });

  // --- Esc closes menu -----------------------------------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.dataset.menu === 'open') closeMenu();
  });

  // --- Fade indicators on horizontally-scrollable chip rows -
  // Toggles [data-at-start] / [data-at-end] on the scroll container so
  // the CSS mask gradient on each edge can fade in/out smoothly.
  function syncScrollEdges(el) {
    const isOverflowing = el.scrollWidth > el.clientWidth + 1;
    const isAtStart = !isOverflowing || el.scrollLeft <= 1;
    const isAtEnd   = !isOverflowing || el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
    el.toggleAttribute('data-at-start', isAtStart);
    el.toggleAttribute('data-at-end',   isAtEnd);
  }

  document.querySelectorAll('.chatbox__options:not(.chatbox__options--expanded)').forEach(el => {
    syncScrollEdges(el);
    el.addEventListener('scroll', () => syncScrollEdges(el), { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => syncScrollEdges(el)).observe(el);
    } else {
      window.addEventListener('resize', () => syncScrollEdges(el));
    }
  });
})();
