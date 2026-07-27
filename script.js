// =========================================================
// Portfolio interactions — scripted "chat" navigation
// =========================================================
(() => {
  const body = document.body;
  const screens = Array.from(document.querySelectorAll('[data-screen-name]'));
  const screensByName = new Map(screens.map(s => [s.dataset.screenName, s]));

  const navStack = ['home'];

  // Small chip positions captured at the last openMenu — reused as the
  // target rects when reversing the FLIP on close.
  const savedSmallChipRects = new Map();
  let savedClosedWrapRect = null;
  let savedClosedInnerRect = null;
  let savedClosedOptionsRect = null;
  let savedClosedOptionsScrollLeft = 0;
  let savedClosedOptionsMaxScroll = 0;
  const menuTimers = new Set();
  let openMenuFrame = null;
  let isClosingMenu = false;
  let isProgrammaticCollapsedScroll = false;
  let menuLeetTexts = [];
  let contentLeetTexts = [];
  let topbarLeetTexts = [];
  let tokenCounter = null;
  let topbarIntro = null;
  const pageLeetTimingPlans = new Map();
  const defaultPageLeetTiming = Object.freeze({
    minimumTotalDuration: 1200,
    maximumTotalDuration: 4000,
    writeBaseDuration: 60,
    writeCharacterFactor: 22,
    minimumWriteDuration: 90,
    maximumWriteDuration: 650,
    correctionBaseDuration: 80,
    correctionCharacterFactor: 16,
    minimumCorrectionDuration: 140,
    maximumCorrectionDuration: 600,
    fontReferenceSize: 16,
    minimumFontFactor: 0.85,
    maximumFontFactor: 2.2,
    writeSequenceGap: 1
  });
  const tokenCounterDuration = 1400;
  const tokenStorageKey = 'lkc-portfolio:token-balance:v1';
  const tokenPersistDelay = 120;
  const homeTextStartDelay = 400;
  const homeTopbarFlickerDuration = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--home-topbar-flicker-duration')
  ) || 900;
  function clearMenuTimers() {
    menuTimers.forEach(id => clearTimeout(id));
    menuTimers.clear();
    if (openMenuFrame !== null) {
      cancelAnimationFrame(openMenuFrame);
      openMenuFrame = null;
    }
  }

  function setMenuTimer(fn, delay) {
    const id = setTimeout(() => {
      menuTimers.delete(id);
      fn();
    }, delay);
    menuTimers.add(id);
    return id;
  }

  function getCurrentChipKey() {
    return body.dataset.screen || navStack[navStack.length - 1];
  }

  function getCurrentClosedOptionsScroll() {
    const key = getCurrentChipKey();
    const activeRect = savedSmallChipRects.get(key);
    if (!activeRect || !savedClosedOptionsRect) return savedClosedOptionsScrollLeft;
    const nextScroll = savedClosedOptionsScrollLeft + activeRect.left - savedClosedOptionsRect.left;
    return Math.max(0, Math.min(nextScroll, savedClosedOptionsMaxScroll));
  }

  function scrollCollapsedOptionsToCurrent() {
    const collapsedOptions = document.querySelector(".chatbox__options[data-state='collapsed']");
    if (!collapsedOptions) return 0;
    const maxScroll = Math.max(0, collapsedOptions.scrollWidth - collapsedOptions.clientWidth);
    const nextScroll = Math.max(0, Math.min(getCurrentClosedOptionsScroll(), maxScroll));
    isProgrammaticCollapsedScroll = true;
    collapsedOptions.removeAttribute('data-user-scrolled');
    collapsedOptions.scrollLeft = nextScroll;
    syncScrollEdges(collapsedOptions);
    requestAnimationFrame(() => {
      isProgrammaticCollapsedScroll = false;
    });
    return nextScroll;
  }

  function showScreen(name) {
    if (!screensByName.has(name)) return;
    screens.forEach(s => {
      const match = s.dataset.screenName === name;
      s.hidden = !match;
    });
    body.dataset.screen = name;
    if (name !== 'home') delete body.dataset.homeTextPending;
    updateActiveChips(name);
    playScreenLeetTexts(name);
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
    if (body.dataset.menu === 'open' || isClosingMenu) return;
    clearMenuTimers();
    menuLeetTexts.forEach(effect => effect.prepareHidden({ reserveSpace: false }));

    // FLIP capture: each small chip's position before the menu opens.
    // Persist these so closeMenu can use them as its FLIP targets.
    savedSmallChipRects.clear();
    document.querySelectorAll(".chatbox__options[data-state='collapsed'] .chip").forEach(c => {
      const key = c.dataset.target || c.dataset.action;
      if (key) savedSmallChipRects.set(key, c.getBoundingClientRect());
    });
    const inner = document.querySelector('.chatbox__inner');
    const wrap = document.querySelector('.chatbox-wrap');
    const collapsedOptions = document.querySelector(".chatbox__options[data-state='collapsed']");
    const expandedOptions = document.querySelector(".chatbox__options[data-state='expanded']");
    savedClosedWrapRect = wrap ? wrap.getBoundingClientRect() : null;
    savedClosedInnerRect = inner ? inner.getBoundingClientRect() : null;
    savedClosedOptionsRect = collapsedOptions ? collapsedOptions.getBoundingClientRect() : null;
    savedClosedOptionsScrollLeft = collapsedOptions ? collapsedOptions.scrollLeft : 0;
    savedClosedOptionsMaxScroll = collapsedOptions
      ? Math.max(0, collapsedOptions.scrollWidth - collapsedOptions.clientWidth)
      : 0;
    const startRects = savedSmallChipRects;
    const startOptionsWidth = savedClosedOptionsRect ? savedClosedOptionsRect.width : null;

    if (expandedOptions && startOptionsWidth !== null) {
      expandedOptions.style.width = '100%';
      expandedOptions.style.maxWidth = startOptionsWidth + 'px';
      expandedOptions.style.overflow = 'hidden';
      expandedOptions.style.transition = 'none';
    }

    body.dataset.menu = 'open';
    const btn = document.querySelector('.menu-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close suggestions');
    }

    // FLIP play: each big chip animates directly from its twin's small
    // rect to its full text rect so movement, scale, and text are one
    // synchronized transition.
    openMenuFrame = requestAnimationFrame(() => {
      openMenuFrame = null;
      if (body.dataset.menu !== 'open') return;

      const expanded = document.querySelectorAll(".chatbox__options[data-state='expanded'] .chip");

      if (expandedOptions && startOptionsWidth !== null) {
        const innerRect = inner ? inner.getBoundingClientRect() : null;
        const innerStyle = inner ? getComputedStyle(inner) : null;
        const targetOptionsWidth = innerRect && innerStyle
          ? innerRect.width - parseFloat(innerStyle.paddingLeft) - parseFloat(innerStyle.paddingRight)
          : expandedOptions.scrollWidth;
        expandedOptions.getBoundingClientRect();
        expandedOptions.style.transition = 'max-width var(--duration-spring) var(--easing-spring)';
        expandedOptions.style.maxWidth = targetOptionsWidth + 'px';
        setMenuTimer(() => {
          if (body.dataset.menu === 'open' && !isClosingMenu) {
            expandedOptions.style.width = '';
            expandedOptions.style.maxWidth = '';
            expandedOptions.style.overflow = '';
            expandedOptions.style.transition = '';
          }
        }, 380);
      }

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

      });

      if (body.dataset.menu === 'open' && !isClosingMenu) {
        playMenuLeetTexts();
      }
    });
  }

  function closeMenu() {
    if (body.dataset.menu !== 'open' || isClosingMenu) return;
    isClosingMenu = true;
    body.dataset.menuClosing = 'true';
    clearMenuTimers();

    // Close strategy: animate the real expanded buttons into the collapsed
    // row. During the transition the expanded options container becomes the
    // collapsed row's clipping box, then normal CSS takes back over.
    //
    // Timeline:
    //   • Wrap / chatbox / inner CSS springs fire at t=0 — 380ms.
    //   • Each expanded chip animates width/height/padding + translate.
    //     Only the keyword text scales, so the pill radius is not warped.
    //   • All chips animate together so movement, scale, and text hiding
    //     read as one synchronized transition.
    //   • Expanded green text is removed before the first frame,
    //     so text, spacing, movement, and scale change together.
    //   • Total close = DURATION.
    const DURATION = 380;
    const EASING = 'cubic-bezier(0.34, 1.15, 0.64, 1)';

    const expandedChips = [...document.querySelectorAll(".chatbox__options[data-state='expanded'] .chip")];
    const expandedOptions = document.querySelector(".chatbox__options[data-state='expanded']");
    const wrap  = document.querySelector('.chatbox-wrap');
    const cb    = document.querySelector('.chatbox');
    const inner = document.querySelector('.chatbox__inner');

    // Snapshot every chip's open rect BEFORE any layout shift so the pin
    // captures the true open position (not a value already drifting due
    // to inner.height changing).
    const openRects = expandedChips.map(c => c.getBoundingClientRect());
    const expandedOptionsOpenRect = expandedOptions ? expandedOptions.getBoundingClientRect() : null;
    const targetClosedScrollLeft = getCurrentClosedOptionsScroll();
    const closedScrollDelta = targetClosedScrollLeft - savedClosedOptionsScrollLeft;

    const innerOpenRect = inner ? inner.getBoundingClientRect() : null;
    const closedInnerRect = savedClosedInnerRect || innerOpenRect;
    const closedOptionsRect = savedClosedOptionsRect;
    const closedOptionsBounds = innerOpenRect && closedInnerRect && closedOptionsRect
      ? {
          left: closedOptionsRect.left - closedInnerRect.left,
          top: closedOptionsRect.top - closedInnerRect.top,
          width: closedOptionsRect.width,
          height: closedOptionsRect.height
        }
      : null;
    const openOptionsBounds = innerOpenRect && expandedOptionsOpenRect
      ? {
          left: expandedOptionsOpenRect.left - innerOpenRect.left,
          top: expandedOptionsOpenRect.top - innerOpenRect.top,
          width: expandedOptionsOpenRect.width,
          height: expandedOptionsOpenRect.height
        }
      : null;

    if (expandedOptions && openOptionsBounds && closedOptionsBounds) {
      expandedOptions.style.position = 'absolute';
      expandedOptions.style.left = openOptionsBounds.left + 'px';
      expandedOptions.style.top = openOptionsBounds.top + 'px';
      expandedOptions.style.width = openOptionsBounds.width + 'px';
      expandedOptions.style.height = openOptionsBounds.height + 'px';
      expandedOptions.style.display = 'block';
      expandedOptions.style.overflow = 'hidden';
      expandedOptions.style.zIndex = '1';
      expandedOptions.style.pointerEvents = 'none';
    }

    const animatedChips = expandedChips.map((big, i) => {
      big.getAnimations().forEach(a => a.cancel());
      const open = openRects[i];
      big.style.position = 'absolute';
      big.style.top      = (expandedOptionsOpenRect ? open.top - expandedOptionsOpenRect.top : open.top) + 'px';
      big.style.left     = (expandedOptionsOpenRect ? open.left - expandedOptionsOpenRect.left : open.left) + 'px';
      big.style.width    = open.width + 'px';
      big.style.height   = open.height + 'px';
      big.style.margin   = '0';
      big.style.overflow = 'hidden';
      big.style.justifyContent = 'center';
      big.style.gap = '0';
      big.style.pointerEvents = 'none';
      const copy = big.querySelector('.chip__copy');
      if (copy) copy.style.display = 'contents';
      const keyword = big.querySelector('.chip__keyword');
      if (keyword) {
        keyword.style.display = 'inline-block';
        keyword.style.transformOrigin = 'center';
      }
      big.querySelectorAll('.chip__muted').forEach(el => {
        el.style.display = 'none';
      });
      return big;
    });

    body.dataset.menu = 'closed';
    scrollCollapsedOptionsToCurrent();
    const btn = document.querySelector('.menu-btn');
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open suggestions');
    }

    // Kick off the CSS spring on chatbox geometry.
    if (savedClosedWrapRect) {
      const closedBottom = window.innerHeight - savedClosedWrapRect.bottom;
      wrap.style.height = savedClosedWrapRect.height + 'px';
      wrap.style.bottom = closedBottom + 'px';
      wrap.style.width = savedClosedWrapRect.width + 'px';
      wrap.style.maxWidth = savedClosedWrapRect.width + 'px';
    }
    cb.style.padding    = 'var(--space-3)';
    inner.style.height  = closedInnerRect
      ? closedInnerRect.height + 'px'
      : 'var(--chatbox-inner-h-closed)';

    const parentDx = innerOpenRect && closedInnerRect ? closedInnerRect.left - innerOpenRect.left : 0;
    const parentDy = innerOpenRect && closedInnerRect ? closedInnerRect.top  - innerOpenRect.top  : 0;
    const optionsDx = openOptionsBounds && closedOptionsBounds ? closedOptionsBounds.left - openOptionsBounds.left : 0;
    const optionsDy = openOptionsBounds && closedOptionsBounds ? closedOptionsBounds.top - openOptionsBounds.top : 0;

    if (expandedOptions && openOptionsBounds && closedOptionsBounds) {
      expandedOptions.animate(
        [
          {
            left: openOptionsBounds.left + 'px',
            top: openOptionsBounds.top + 'px',
            width: openOptionsBounds.width + 'px',
            height: openOptionsBounds.height + 'px'
          },
          {
            left: closedOptionsBounds.left + 'px',
            top: closedOptionsBounds.top + 'px',
            width: closedOptionsBounds.width + 'px',
            height: closedOptionsBounds.height + 'px'
          }
        ],
        { duration: DURATION, easing: EASING, fill: 'both' }
      );
    }

    animatedChips.forEach((big, i) => {
      const key = big.dataset.target || big.dataset.action;
      const savedTarget = savedSmallChipRects.get(key);
      if (!savedTarget) return;
      const target = {
        left: savedTarget.left - closedScrollDelta,
        top: savedTarget.top,
        width: savedTarget.width,
        height: savedTarget.height
      };

      const open = openRects[i];
      const dx = target.left - open.left - parentDx - optionsDx;
      const dy = target.top  - open.top  - parentDy - optionsDy;
      const keyword = big.querySelector('.chip__keyword');

      big.animate(
        [
          {
            width:      open.width + 'px',
            height:     open.height + 'px',
            padding:    '0 16px',
            transform:  'translate(0, 0)',
            transformOrigin: '0 0'
          },
          {
            width:      target.width + 'px',
            height:     target.height + 'px',
            padding:    '0 12px',
            transform:  `translate(${dx}px, ${dy}px)`,
            transformOrigin: '0 0'
          }
        ],
        { duration: DURATION, easing: EASING, fill: 'both' }
      );

      if (keyword) {
        keyword.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(0.857)' }
          ],
          { duration: DURATION, easing: EASING, fill: 'both' }
        );
      }

    });

    // After the last chip lands, strip every inline override so chips
    // re-join normal flow as their small twins.
    const totalDuration = DURATION;
    setMenuTimer(() => {
      isClosingMenu = false;
      delete body.dataset.menuClosing;

      wrap.style.height = '';
      wrap.style.bottom = '';
      wrap.style.width = '';
      wrap.style.maxWidth = '';
      cb.style.padding = '';
      inner.style.height = '';

      animatedChips.forEach(big => {
        big.getAnimations().forEach(a => a.cancel());
        big.removeAttribute('style');
        const keyword = big.querySelector('.chip__keyword');
        if (keyword) {
          keyword.getAnimations().forEach(a => a.cancel());
          keyword.removeAttribute('style');
        }
        big.querySelectorAll('.chip__muted').forEach(el => el.removeAttribute('style'));
        const copy = big.querySelector('.chip__copy');
        if (copy) copy.removeAttribute('style');
      });

      if (expandedOptions) {
        expandedOptions.getAnimations().forEach(a => a.cancel());
        expandedOptions.removeAttribute('style');
      }
    }, totalDuration);
  }
  function toggleMenu() {
    body.dataset.menu === 'open' ? closeMenu() : openMenu();
  }

  // --- Dark mode (no-op stub for now) --------------------
  function toggleDark() {
    const isDark = body.classList.toggle('is-dark');
    body.dataset.theme = isDark ? 'dark' : 'light';
  }

  function stampHomeMessageTime() {
    const time = document.querySelector('[data-message-generated-at]');
    if (!time || time.dateTime) return;
    const generatedAt = new Date();
    time.dateTime = generatedAt.toISOString();
    time.textContent = new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(generatedAt);
    time.setAttribute('aria-label', `Message generated at ${time.textContent}`);
  }

  async function shareHomeMessage(actionEl) {
    const text = document.querySelector('.screen-home .lede')?.textContent.trim() || '';
    const shareData = {
      title: document.title,
      text,
      url: window.location.href
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${text}\n\n${window.location.href}`);
        actionEl.title = 'Copied';
        window.setTimeout(() => { actionEl.title = 'Share'; }, 1200);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Unable to share message', error);
    }
  }

  function rateHomeMessage(actionEl) {
    const isPressed = actionEl.getAttribute('aria-pressed') === 'true';
    document.querySelectorAll('[data-action="rate-message"]').forEach(button => {
      button.setAttribute('aria-pressed', 'false');
    });
    actionEl.setAttribute('aria-pressed', String(!isPressed));
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
        case 'share-message': shareHomeMessage(actionEl); return;
        case 'rate-message':  rateHomeMessage(actionEl); return;
      }
    }

    const targetEl = e.target.closest('[data-target]');
    if (targetEl) {
      navigate(targetEl.dataset.target);
      return;
    }

    const chatboxInnerEl = e.target.closest('.chatbox__inner');
    if (chatboxInnerEl) {
      toggleMenu();
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
    el.addEventListener('scroll', () => {
      syncScrollEdges(el);
      if (el.scrollLeft <= 1) {
        el.removeAttribute('data-user-scrolled');
        return;
      }
      if (!isProgrammaticCollapsedScroll && body.dataset.menu !== 'open' && body.dataset.menuClosing !== 'true') {
        el.setAttribute('data-user-scrolled', '');
      }
    }, { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(() => syncScrollEdges(el)).observe(el);
    } else {
      window.addEventListener('resize', () => syncScrollEdges(el));
    }
  });

  // --- Leetspeak text effect ------------------------------
  const leetMap = {
    a: ['∆', '4', '@', 'Д'],
    b: ['8', '6', 'ß', 'в', 'ь'],
    c: ['<', '{', '[', '(', '©', '¢', 'с'],
    d: ['Đ'],
    e: ['3', '&', '£', '₤', '€'],
    f: ['7', 'ƒ'],
    g: ['6', '9', '[', '-'],
    h: ['#', '4', 'н'],
    i: ['1', '|', '!'],
    j: ['√', '9', '♪'],
    k: ['к'],
    l: ['|', '1'],
    m: ['м'],
    n: ['И', 'и', 'п', '№'],
    o: ['0', 'Ø', 'Θ', 'о', 'ө'],
    p: ['р', '?', '¶', '₱'],
    q: ['9', '0', 'Ω'],
    r: ['Я', '®'],
    s: ['5', '2', '$', '§'],
    t: ['7', '+', 'т', '†'],
    u: ['μ'],
    v: ['√', '✓'],
    w: ['Ш'],
    x: ['×', '%', '*', 'Ж'],
    y: ['¥', 'Ч', 'ү', 'у'],
    z: ['2', '5'],
    ',': ['‘'],
    "'": [','],
    '!': ['i'],
    '.': ['°'],
    '?': ['2']
  };

  const numericLeetMap = {
    0: 'O',
    1: 'I',
    2: 'Z',
    3: 'E',
    4: 'A',
    5: 'S',
    6: 'G',
    7: 'T',
    8: 'B',
    9: 'Q'
  };

  function toLeetChar(char) {
    if (numericLeetMap[char]) return numericLeetMap[char];
    const variants = leetMap[char.toLowerCase()];
    if (!variants) return char;
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function createLeetText(el) {
    const timers = new Set();
    const accentTimers = new Map();
    let isHiding = false;
    let hoveredIndices = new Set();
    let interactionTokenConsumer = null;
    const TYPE_STEP = 18;
    const CORRECTION_DELAY = 280;
    const CORRECTION_STEP = 18;
    const FULL_HOVER_DELAY = 70;
    const FULL_HOVER_LEET_STEP = 10;
    const FULL_HOVER_CORRECTION_STEP = 10;
    const ACCENT_DURATION = 80;
    const suggestionRow = el.closest('.suggestion');
    if (suggestionRow) {
      const siblingSuggestions = [...suggestionRow.parentElement.children]
        .filter(child => child.classList.contains('suggestion'));
      const suggestionIndex = Math.max(0, siblingSuggestions.indexOf(suggestionRow));
      const cascadeStep = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--suggestion-line-cascade-step')
      ) || 0;
      const iconCascadeStep = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--suggestion-icon-cascade-step')
      ) || 0;
      suggestionRow.style.setProperty(
        '--suggestion-line-end-delay',
        `${(suggestionIndex + 1) * cascadeStep}ms`
      );
      suggestionRow.style.setProperty(
        '--suggestion-icon-delay',
        `${suggestionIndex * iconCascadeStep}ms`
      );
    }

    el.dataset.leetState = 'idle';
    const textNodes = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent.replace(/\s+/g, ' ');
      if (text) textNodes.push({ node, text });
    }
    if (textNodes[0]) textNodes[0].text = textNodes[0].text.trimStart();
    if (textNodes[textNodes.length - 1]) {
      textNodes[textNodes.length - 1].text = textNodes[textNodes.length - 1].text.trimEnd();
    }

    const spans = [];
    textNodes.forEach(({ node, text }) => {
      const fragment = document.createDocumentFragment();
      text.split(/(\s+)/).forEach(token => {
        if (!token) return;
        if (/^\s+$/.test(token)) {
          fragment.appendChild(document.createTextNode(token));
          return;
        }
        const word = document.createElement('span');
        word.className = 'leet-word';
        [...token].forEach(char => {
          const span = createLeetCharSpan(char, spans.length);
          spans.push(span);
          word.appendChild(span);
        });
        fragment.appendChild(word);
      });
      node.replaceWith(fragment);
    });

    function createLeetCharSpan(char, index) {
      const span = document.createElement('span');
      span.className = 'leet-char';
      span.dataset.index = String(index);
      span.dataset.char = char;
      span.dataset.leet = toLeetChar(char);
      span.textContent = '';
      return span;
    }

    function setTimer(fn, delay) {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
      return id;
    }

    function clearTimers() {
      timers.forEach(id => clearTimeout(id));
      timers.clear();
    }

    function setTone(index, tone = 'default') {
      const span = spans[index];
      if (!span) return;
      if (tone === 'default') delete span.dataset.leetTone;
      else span.dataset.leetTone = tone;
    }

    function clearAccentTimers({ resetTone = true } = {}) {
      accentTimers.forEach(id => clearTimeout(id));
      accentTimers.clear();
      if (resetTone) spans.forEach((_, index) => setTone(index));
    }

    function pulseAccent(index, { duration = ACCENT_DURATION, onComplete } = {}) {
      const activeTimer = accentTimers.get(index);
      if (activeTimer) clearTimeout(activeTimer);
      setTone(index, 'accent');
      const id = setTimeout(() => {
        accentTimers.delete(index);
        setTone(index);
        onComplete?.();
      }, duration);
      accentTimers.set(index, id);
    }

    function setChar(index, mode) {
      const span = spans[index];
      if (!span) return;
      span.textContent = mode === 'leet' ? span.dataset.leet : span.dataset.char;
    }

    function prepareHidden({ reserveSpace = true } = {}) {
      clearTimers();
      clearAccentTimers();
      isHiding = false;
      el.dataset.leetState = 'idle';
      if (suggestionRow) suggestionRow.dataset.suggestionState = 'hidden';
      spans.forEach((span, index) => {
        delete span.dataset.typed;
        if (reserveSpace) {
          setChar(index, 'plain');
          span.style.minWidth = '';
        } else {
          span.textContent = '';
          span.style.minWidth = '0';
        }
        span.style.opacity = '0';
      });
    }

    function playIn({ growFromEmpty = false, timingScale = 1, correctionAfterWrite = false, deferCorrection = false, onType, onCorrect } = {}) {
      clearTimers();
      clearAccentTimers();
      isHiding = false;
      el.dataset.leetState = 'typing';
      if (suggestionRow) suggestionRow.dataset.suggestionState = 'appearing';
      spans.forEach(span => {
        delete span.dataset.typed;
        if (growFromEmpty) {
          span.textContent = '';
          span.style.minWidth = '0';
        }
        span.style.opacity = '0';
      });

      const lastTypeDelay = Math.max(0, spans.length - 1) * TYPE_STEP * timingScale;
      const correctionStart = correctionAfterWrite
        ? lastTypeDelay
        : CORRECTION_DELAY * timingScale;

      spans.forEach((span, index) => {
        const typeDelay = index * TYPE_STEP * timingScale;
        setTimer(() => {
          span.style.minWidth = '';
          setChar(index, 'leet');
          setTone(index, 'muted');
          span.style.opacity = '1';
          span.dataset.typed = 'true';
          if (onType && span.dataset.char.trim()) onType();
        }, typeDelay);
        if (!deferCorrection) {
          setTimer(() => {
            setChar(index, 'plain');
            pulseAccent(index, {
              duration: ACCENT_DURATION * timingScale,
              onComplete: index === spans.length - 1
                ? () => { el.dataset.leetState = 'ready'; }
                : undefined
            });
            if (onCorrect && span.dataset.char.trim()) onCorrect();
          }, correctionStart + index * CORRECTION_STEP * timingScale);
        }
      });
    }

    function correct({ timingScale = 1, duration, onCorrect } = {}) {
      clearTimers();
      clearAccentTimers({ resetTone: false });
      el.dataset.leetState = 'correcting';
      const targetDuration = Number.isFinite(duration) && duration >= 0
        ? duration
        : getCorrectionDuration(timingScale);
      const accentDuration = Math.min(ACCENT_DURATION, targetDuration);
      const correctionWindow = Math.max(0, targetDuration - accentDuration);
      const correctionStep = spans.length > 1 ? correctionWindow / (spans.length - 1) : 0;
      spans.forEach((span, index) => {
        setTimer(() => {
          setChar(index, 'plain');
          pulseAccent(index, {
            duration: accentDuration,
            onComplete: index === spans.length - 1
              ? () => { el.dataset.leetState = 'ready'; }
              : undefined
          });
          if (onCorrect && span.dataset.char.trim()) onCorrect();
        }, index * correctionStep);
      });
    }

    function getCorrectionDuration(timingScale = 1) {
      if (!spans.length) return 0;
      return (Math.max(0, spans.length - 1) * CORRECTION_STEP + ACCENT_DURATION) * timingScale;
    }

    function getLineGroups() {
      const lineMap = new Map();
      el.querySelectorAll('.leet-word').forEach(word => {
        const rect = word.getBoundingClientRect();
        const key = Math.round(rect.top);
        if (!lineMap.has(key)) lineMap.set(key, []);
        lineMap.get(key).push(...word.querySelectorAll('.leet-char'));
      });
      return [...lineMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, lineSpans]) => lineSpans);
    }

    function playLinesAsLeet({ lineDelay = 180, correctionDelay = 260, correctionStep = 16 } = {}) {
      clearTimers();
      clearAccentTimers();
      isHiding = false;
      el.dataset.leetState = 'typing';
      if (suggestionRow) suggestionRow.dataset.suggestionState = 'appearing';
      spans.forEach(span => {
        span.style.opacity = '0';
        setChar(Number(span.dataset.index), 'plain');
        setTone(Number(span.dataset.index));
      });

      const lines = getLineGroups();
      let cursor = 0;
      lines.forEach((lineSpans, lineIndex) => {
        setTimer(() => {
          lineSpans.forEach(span => {
            span.style.minWidth = '';
            span.style.opacity = '1';
            setChar(Number(span.dataset.index), 'leet');
            setTone(Number(span.dataset.index), 'muted');
          });
        }, cursor);

        lineSpans.forEach((span, charIndex) => {
          const index = Number(span.dataset.index);
          setTimer(() => {
            setChar(index, 'plain');
            const isLast = lineIndex === lines.length - 1 && charIndex === lineSpans.length - 1;
            pulseAccent(index, {
              onComplete: isLast ? () => { el.dataset.leetState = 'ready'; } : undefined
            });
          }, cursor + correctionDelay + charIndex * correctionStep);
        });

        cursor += lineDelay;
      });
    }

    function getLinesPlayDuration({ lineDelay = 180, correctionDelay = 260, correctionStep = 16 } = {}) {
      const lines = getLineGroups();
      if (!lines.length) return 0;
      const lastLine = lines[lines.length - 1];
      return (lines.length - 1) * lineDelay
        + correctionDelay
        + Math.max(0, lastLine.length - 1) * correctionStep
        + ACCENT_DURATION;
    }

    function getPlayInDuration(timingScale = 1, correctionAfterWrite = false) {
      if (!spans.length) return 0;
      const lastIndex = spans.length - 1;
      const correctionStart = correctionAfterWrite
        ? lastIndex * TYPE_STEP
        : CORRECTION_DELAY;
      return (correctionStart + lastIndex * CORRECTION_STEP + ACCENT_DURATION) * timingScale;
    }

    function getLeetWriteDuration(timingScale = 1) {
      if (!spans.length) return 0;
      return (spans.length - 1) * TYPE_STEP * timingScale;
    }

    function getCharacterCount() {
      return spans.length;
    }

    function hoverAround(clientX, clientY) {
      if (isHiding || el.dataset.leetState !== 'ready') return;
      clearTimers();
      let closestIndex = 0;
      let closestDistance = Infinity;
      let closestRect = null;
      spans.forEach((span, index) => {
        const rect = span.getBoundingClientRect();
        const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
        const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
        const distance = Math.hypot(dx, dy);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
          closestRect = rect;
        }
      });

      const lineIndices = spans
        .map((span, index) => ({ index, rect: span.getBoundingClientRect() }))
        .filter(({ rect }) => Math.abs(rect.top - closestRect.top) <= Math.max(2, closestRect.height * 0.35))
        .sort((a, b) => a.rect.left - b.rect.left)
        .map(({ index }) => index);
      const closestLinePosition = Math.max(0, lineIndices.indexOf(closestIndex));
      const groupStart = Math.max(
        0,
        Math.min(closestLinePosition - 2, lineIndices.length - 5)
      );
      const nextHoveredIndices = new Set(
        lineIndices
          .slice(groupStart, groupStart + 5)
          .filter(index => {
            const span = spans[index];
            return span.dataset.char.trim() && span.dataset.leet !== span.dataset.char;
          })
      );

      hoveredIndices.forEach(index => {
        if (nextHoveredIndices.has(index)) return;
        setChar(index, 'plain');
        interactionTokenConsumer?.();
      });
      nextHoveredIndices.forEach(index => {
        if (hoveredIndices.has(index)) return;
        setChar(index, 'leet');
        interactionTokenConsumer?.();
      });
      hoveredIndices = nextHoveredIndices;
      setTimer(() => clearHover({ stagger: true }), 220);
    }

    function clearHover({ stagger = false } = {}) {
      if (isHiding || el.dataset.leetState !== 'ready') return;
      const indices = [...hoveredIndices];
      const correctIndex = index => {
        setChar(index, 'plain');
        if (stagger) pulseAccent(index);
        interactionTokenConsumer?.();
      };
      if (!stagger) {
        hoveredIndices = new Set();
        indices.forEach(correctIndex);
        return;
      }
      indices.forEach((index, staggerIndex) => {
        setTimer(() => {
          hoveredIndices.delete(index);
          correctIndex(index);
        }, staggerIndex * 14);
      });
    }

    function replayAllLeet() {
      if (isHiding || el.dataset.leetState !== 'ready') return;
      clearTimers();
      clearAccentTimers();
      hoveredIndices = new Set();
      const animatedIndices = spans
        .map((span, index) => ({ span, index }))
        .filter(({ span }) => span.dataset.char.trim() && span.dataset.leet !== span.dataset.char)
        .map(({ index }) => index);

      if (!animatedIndices.length) return;
      el.dataset.leetState = 'hovering';
      animatedIndices.forEach((index, leetIndex) => {
        setTimer(() => {
          setChar(index, 'leet');
          interactionTokenConsumer?.();
        }, leetIndex * FULL_HOVER_LEET_STEP);
      });

      setTimer(() => {
        el.dataset.leetState = 'correcting';
        animatedIndices.forEach((index, correctionIndex) => {
          setTimer(() => {
            setChar(index, 'plain');
            pulseAccent(index, {
              onComplete: correctionIndex === animatedIndices.length - 1
                ? () => { el.dataset.leetState = 'ready'; }
                : undefined
            });
            interactionTokenConsumer?.();
          }, correctionIndex * FULL_HOVER_CORRECTION_STEP);
        });
      }, Math.max(0, animatedIndices.length - 1) * FULL_HOVER_LEET_STEP + FULL_HOVER_DELAY);
    }

    function setInteractionTokenConsumer(consumer) {
      interactionTokenConsumer = consumer;
    }

    function hide() {
      clearTimers();
      clearAccentTimers();
      isHiding = true;
      el.dataset.leetState = 'hidden';
      if (suggestionRow) suggestionRow.dataset.suggestionState = 'hidden';
      spans.forEach((span, index) => {
        setTimer(() => {
          delete span.dataset.typed;
          span.textContent = '';
          span.style.opacity = '0';
        }, index * 18);
      });
    }

    const fullRolloverTarget = el.closest('.suggestion');
    if (fullRolloverTarget) {
      fullRolloverTarget.addEventListener('pointerenter', replayAllLeet);
    } else {
      el.addEventListener('pointermove', e => hoverAround(e.clientX, e.clientY));
      el.addEventListener('pointerleave', clearHover);
    }

    return { el, playIn, correct, playLinesAsLeet, replayAllLeet, prepareHidden, hide, clearHover, setInteractionTokenConsumer, getPlayInDuration, getLeetWriteDuration, getCorrectionDuration, getCharacterCount, getLinesPlayDuration };
  }

  document
    .querySelectorAll('.screen .h1, .screen .lede, .screen .answer p, .screen .question-chip, .screen .suggestion span, .screen .project-card__tag, .screen .project-card__title')
    .forEach(el => el.setAttribute('data-leet-text', ''));

  const leetTexts = [...document.querySelectorAll('[data-leet-text]')].map(createLeetText);
  const leetEffectsByRole = {
    ambient: [],
    content: [],
    menu: [],
    topbar: []
  };

  leetTexts.forEach(effect => {
    const role = effect.el.dataset.leetRole
      || (effect.el.closest(".chatbox__options[data-state='expanded']") ? 'menu' : null)
      || (effect.el.closest('.screen') ? 'content' : 'ambient');
    leetEffectsByRole[role].push(effect);
  });

  menuLeetTexts = leetEffectsByRole.menu;
  topbarLeetTexts = leetEffectsByRole.topbar;
  contentLeetTexts = leetEffectsByRole.content;
  [...topbarLeetTexts, ...contentLeetTexts]
    .forEach(effect => effect.setInteractionTokenConsumer(consumeToken));
  [...menuLeetTexts, ...topbarLeetTexts, ...contentLeetTexts]
    .forEach(effect => effect.prepareHidden());
  const leetTextByElement = new Map(leetTexts.map(effect => [effect.el, effect]));

  function playTopbarLeetTexts() {
    const longestAnimation = Math.max(
      0,
      ...topbarLeetTexts.map(effect => effect.getLeetWriteDuration() + effect.getCorrectionDuration())
    );
    const timingScale = longestAnimation > homeTopbarFlickerDuration
      ? homeTopbarFlickerDuration / longestAnimation
      : 1;

    topbarLeetTexts.forEach(effect => {
      effect.playIn({
        timingScale,
        correctionAfterWrite: true,
        onType: consumeToken,
        onCorrect: consumeToken
      });
    });
  }

  function createTopbarIntro() {
    let state = body.dataset.topbarIntro || 'done';

    function play() {
      if (state !== 'playing') return;
      playTopbarLeetTexts();
      window.setTimeout(() => {
        state = 'done';
        body.dataset.topbarIntro = state;
      }, homeTopbarFlickerDuration);
    }

    return {
      get state() { return state; },
      play
    };
  }

  function playMenuLeetTexts() {
    const sequences = [...document.querySelectorAll(".chatbox__options[data-state='expanded'] .chip")]
      .map(chip => {
      const [prefix, suffix] = [...chip.querySelectorAll('.chip__muted')].map(el => leetTextByElement.get(el));
        if (!prefix) return null;
        const prefixDuration = prefix.getPlayInDuration();
        const prefixLeetDuration = prefix.getLeetWriteDuration();
        const suffixDuration = suffix ? suffix.getPlayInDuration() : 0;
        const totalDuration = suffix
          ? Math.max(prefixDuration, prefixLeetDuration + suffixDuration)
          : prefixDuration;
        return { prefix, suffix, prefixDuration, prefixLeetDuration, suffixDuration, totalDuration };
      })
      .filter(Boolean);
    const sharedEndTime = Math.max(0, ...sequences.map(sequence => sequence.totalDuration));

    sequences.forEach(({ prefix, suffix, prefixLeetDuration, totalDuration }) => {
      const timingScale = totalDuration > 0 ? sharedEndTime / totalDuration : 1;
      const scaledPrefixLeetDuration = prefixLeetDuration * timingScale;

      prefix.playIn({ growFromEmpty: true, timingScale });
      if (suffix) {
        setMenuTimer(() => {
          if (body.dataset.menu !== 'open' || isClosingMenu) return;
          suffix.playIn({ growFromEmpty: true, timingScale });
        }, scaledPrefixLeetDuration);
      }
    });
  }

  function clampPageTiming(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function buildPageLeetTimingPlan(screenName, activeEffects) {
    const screen = screensByName.get(screenName);
    const requestedTotalDuration = Number(screen?.dataset.leetDuration);
    const requestedWriteDuration = Number(screen?.dataset.leetWriteDuration);
    const items = activeEffects.map(effect => {
      const fontSize = parseFloat(getComputedStyle(effect.el).fontSize)
        || defaultPageLeetTiming.fontReferenceSize;
      const characterCount = Math.max(1, effect.getCharacterCount());
      const fontFactor = clampPageTiming(
        Math.sqrt(fontSize / defaultPageLeetTiming.fontReferenceSize),
        defaultPageLeetTiming.minimumFontFactor,
        defaultPageLeetTiming.maximumFontFactor
      );
      const contentFactor = Math.sqrt(characterCount) * fontFactor;
      const naturalWriteDuration = clampPageTiming(
        defaultPageLeetTiming.writeBaseDuration
          + contentFactor * defaultPageLeetTiming.writeCharacterFactor,
        defaultPageLeetTiming.minimumWriteDuration,
        defaultPageLeetTiming.maximumWriteDuration
      );
      const naturalCorrectionDuration = clampPageTiming(
        defaultPageLeetTiming.correctionBaseDuration
          + contentFactor * defaultPageLeetTiming.correctionCharacterFactor,
        defaultPageLeetTiming.minimumCorrectionDuration,
        defaultPageLeetTiming.maximumCorrectionDuration
      );
      return {
        effect,
        characterCount,
        fontSize,
        naturalWriteDuration,
        naturalCorrectionDuration
      };
    });
    const totalWriteGap = defaultPageLeetTiming.writeSequenceGap
      * Math.max(0, items.length - 1);
    const naturalWriteDuration = items.reduce(
      (total, item) => total + item.naturalWriteDuration,
      totalWriteGap
    );
    const naturalCorrectionDuration = items.reduce(
      (total, item) => total + item.naturalCorrectionDuration,
      0
    );
    const naturalTotalDuration = naturalWriteDuration + naturalCorrectionDuration;
    const totalDuration = Number.isFinite(requestedTotalDuration) && requestedTotalDuration > 0
      ? requestedTotalDuration
      : clampPageTiming(
        naturalTotalDuration,
        defaultPageLeetTiming.minimumTotalDuration,
        defaultPageLeetTiming.maximumTotalDuration
      );
    const automaticScale = naturalTotalDuration
      ? totalDuration / naturalTotalDuration
      : 1;
    const automaticWriteDuration = naturalWriteDuration * automaticScale;
    const writeDuration = Number.isFinite(requestedWriteDuration) && requestedWriteDuration >= 0
      ? Math.min(requestedWriteDuration, totalDuration)
      : automaticWriteDuration;
    const availableWriteDuration = Math.max(0, writeDuration - totalWriteGap);
    const naturalCharacterWriteDuration = Math.max(
      0,
      naturalWriteDuration - totalWriteGap
    );
    const writeScale = naturalCharacterWriteDuration
      ? availableWriteDuration / naturalCharacterWriteDuration
      : 1;
    const correctionDuration = Math.max(0, totalDuration - writeDuration);
    const correctionScale = naturalCorrectionDuration
      ? correctionDuration / naturalCorrectionDuration
      : 1;
    let writeStart = 0;

    items.forEach((item, index) => {
      item.writeStart = writeStart;
      item.writeDuration = item.naturalWriteDuration * writeScale;
      writeStart += item.writeDuration;
      if (index < items.length - 1) {
        writeStart += defaultPageLeetTiming.writeSequenceGap;
      }
    });

    let correctionStart = writeStart;
    items.forEach(item => {
      item.correctionStart = correctionStart;
      item.correctionDuration = item.naturalCorrectionDuration * correctionScale;
      correctionStart += item.correctionDuration;
    });

    return {
      screenName,
      characterCount: items.reduce((total, item) => total + item.characterCount, 0),
      naturalTotalDuration,
      totalDuration: correctionStart,
      writeDuration: writeStart,
      correctionDuration: correctionStart - writeStart,
      items
    };
  }

  function playScreenLeetTexts(screenName) {
    const activeEffects = [];
    const activeScreen = screensByName.get(screenName);
    const screenMessageActions = activeScreen?.querySelector('[data-message-actions-state]');
    activeScreen?.querySelectorAll('.suggestion').forEach(suggestion => {
      delete suggestion.dataset.suggestionIconCorrected;
    });
    if (screenMessageActions) {
      screenMessageActions.dataset.messageActionsState = 'hidden';
      screenMessageActions.dataset.messageActionsCorrected = 'false';
      screenMessageActions.querySelectorAll('.message-action').forEach(action => {
        delete action.dataset.messageActionCorrected;
      });
    }

    contentLeetTexts.forEach(effect => {
      const screen = effect.el.closest('.screen');
      if (!screen || screen.dataset.screenName !== screenName) {
        effect.prepareHidden();
        return;
      }
      activeEffects.push(effect);
    });

    if (!activeEffects.length) return;

    const timingPlan = buildPageLeetTimingPlan(screenName, activeEffects);
    pageLeetTimingPlans.set(screenName, timingPlan);

    timingPlan.items.forEach(item => {
      const suggestion = item.effect.el.closest('.suggestion');
      if (!suggestion) return;
      setMenuTimer(() => {
        if (body.dataset.screen !== screenName) return;
        suggestion.dataset.suggestionIconCorrected = 'true';
      }, item.correctionStart);
    });

    if (screenMessageActions) {
      const paragraphItem = timingPlan.items.find(item => item.effect.el.matches('.lede, .answer p'));
      const revealStart = paragraphItem
        ? paragraphItem.writeStart + paragraphItem.writeDuration
        : 0;
      setMenuTimer(() => {
        if (body.dataset.screen !== screenName) return;
        screenMessageActions.dataset.messageActionsState = 'visible';
      }, revealStart);

      if (paragraphItem) {
        const actions = [...screenMessageActions.querySelectorAll('.message-action')];
        const correctionDuration = paragraphItem.correctionDuration;
        const correctionStep = actions.length > 1
          ? correctionDuration / actions.length
          : 0;
        actions.forEach((action, index) => {
          setMenuTimer(() => {
            if (body.dataset.screen !== screenName) return;
            action.dataset.messageActionCorrected = 'true';
          }, paragraphItem.correctionStart + index * correctionStep);
        });
        setMenuTimer(() => {
          if (body.dataset.screen !== screenName) return;
          screenMessageActions.dataset.messageActionsCorrected = 'true';
        }, paragraphItem.correctionStart + correctionDuration);
      }
    }

    timingPlan.items.forEach(item => {
      const naturalDuration = item.effect.getLeetWriteDuration();
      const timingScale = naturalDuration
        ? item.writeDuration / naturalDuration
        : 1;
      setMenuTimer(() => {
        if (body.dataset.screen !== screenName) return;
        item.effect.playIn({
          timingScale,
          deferCorrection: true,
          onType: consumeToken
        });
      }, item.writeStart);
    });

    timingPlan.items.forEach(item => {
      setMenuTimer(() => {
        if (body.dataset.screen !== screenName) return;
        item.effect.correct({
          duration: item.correctionDuration,
          onCorrect: consumeToken
        });
      }, item.correctionStart);
    });
  }

  function consumeToken() {
    tokenCounter?.spend();
  }

  function createTokenCounter(el) {
    if (!el) return null;

    const target = Number(el.dataset.tokenTarget);
    let persistTimer = null;
    let queuedSpend = 0;
    let hasStarted = false;
    let shouldPersist = true;

    function readStoredBalance() {
      try {
        const storedValue = localStorage.getItem(tokenStorageKey);
        if (storedValue === null) return null;
        const parsedValue = Number(storedValue);
        if (!Number.isFinite(parsedValue) || parsedValue < 0) return null;
        return Math.min(target, Math.floor(parsedValue));
      } catch {
        return null;
      }
    }

    const storedBalance = readStoredBalance();
    const wasRestored = storedBalance !== null;
    let balance = storedBalance ?? 0;
    let isReady = wasRestored;

    const format = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const render = () => {
      el.textContent = format(balance);
    };

    function persist() {
      if (persistTimer !== null) {
        window.clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (!shouldPersist) return;
      try {
        localStorage.setItem(tokenStorageKey, String(balance));
      } catch {
        // Storage can be unavailable in restricted or private contexts.
      }
    }

    function schedulePersist() {
      if (persistTimer !== null) window.clearTimeout(persistTimer);
      persistTimer = window.setTimeout(persist, tokenPersistDelay);
    }

    function spend(amount = 1) {
      const spendAmount = Math.max(0, Math.floor(amount));
      if (!isReady) {
        queuedSpend += spendAmount;
        return;
      }
      shouldPersist = true;
      balance = Math.max(0, balance - spendAmount);
      render();
      schedulePersist();
    }

    function start({ onComplete } = {}) {
      if (hasStarted) {
        if (onComplete) onComplete({ restored: wasRestored });
        return;
      }
      hasStarted = true;
      if (isReady) {
        render();
        if (onComplete) onComplete({ restored: true });
        return;
      }
      balance = target;
      const startTime = performance.now();
      const easeOut = progress => 1 - Math.pow(1 - progress, 3);

      const tick = now => {
        const progress = Math.min(1, (now - startTime) / tokenCounterDuration);
        el.textContent = format(Math.round(target * easeOut(progress)));
        if (progress < 1) {
          requestAnimationFrame(tick);
          return;
        }
        isReady = true;
        spend(queuedSpend);
        queuedSpend = 0;
        persist();
        if (onComplete) onComplete({ restored: false });
      };

      requestAnimationFrame(tick);
    }

    function reset() {
      if (persistTimer !== null) window.clearTimeout(persistTimer);
      persistTimer = null;
      queuedSpend = 0;
      balance = target;
      isReady = true;
      shouldPersist = false;
      render();
      try {
        localStorage.removeItem(tokenStorageKey);
      } catch {
        // Keep the in-memory reset when storage is unavailable.
      }
    }

    if (isReady) render();
    window.addEventListener('pagehide', persist);

    return {
      get balance() { return balance; },
      get isReady() { return isReady; },
      reset,
      spend,
      start
    };
  }

  tokenCounter = createTokenCounter(document.querySelector('[data-token-counter]'));
  topbarIntro = createTopbarIntro();

  requestAnimationFrame(() => {
    leetTexts
      .filter(effect => !menuLeetTexts.includes(effect) && !contentLeetTexts.includes(effect) && !topbarLeetTexts.includes(effect))
      .forEach(effect => effect.playIn());
    const initialScreen = body.dataset.screen || 'home';
    if (initialScreen === 'home') {
      topbarIntro.play();
      const startHomeContent = ({ restored = true } = {}) => {
        const startDelay = restored ? 0 : homeTextStartDelay;
        window.setTimeout(() => {
          if (body.dataset.screen !== 'home') return;
          stampHomeMessageTime();
          delete body.dataset.homeTextPending;
          playScreenLeetTexts('home');
        }, startDelay);
      };
      if (tokenCounter) tokenCounter.start({ onComplete: startHomeContent });
      else startHomeContent();
    } else {
      playScreenLeetTexts(initialScreen);
      tokenCounter?.start();
    }
  });
  globalThis.portfolioTextEffects = {
    leetTexts,
    roles: leetEffectsByRole,
    defaultPageTiming: defaultPageLeetTiming,
    getTimingPlan(screenName = body.dataset.screen) {
      return pageLeetTimingPlans.get(screenName) || null;
    },
    playScreen: playScreenLeetTexts,
    hideAllLeetText() {
      leetTexts.forEach(effect => effect.hide());
    }
  };
  globalThis.portfolioExperience = {
    tokenCounter,
    topbarIntro
  };
})();
