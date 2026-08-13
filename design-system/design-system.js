(() => {
  const root = document.documentElement;
  const tokenGroupsRoot = document.querySelector('[data-token-groups]');
  const tokenError = document.querySelector('[data-token-error]');
  const searchInput = document.querySelector('[data-ds-search]');
  const noResults = document.querySelector('[data-no-results]');
  const toast = document.querySelector('[data-ds-toast]');
  const resolvedStyles = getComputedStyle(root);
  let toastTimer = null;

  const groupDefinitions = [
    {
      id: 'color-primitives',
      label: 'Color primitives',
      description: 'Raw palette values.',
      matches: name => name.startsWith('--color-')
    },
    {
      id: 'semantic-colors',
      label: 'Semantic colors',
      description: 'Background, foreground and border roles.',
      matches: name => /^(--bg-|--fg-|--border-)/.test(name)
    },
    {
      id: 'typography',
      label: 'Typography',
      description: 'Families, weights, sizes, line heights and tracking.',
      matches: name => /^(--font-|--fw-|--fz-|--lh-|--ls-)/.test(name)
    },
    {
      id: 'spacing-geometry',
      label: 'Spacing & geometry',
      description: 'Spacing scale, sizes and strokes.',
      matches: name => /^(--space-|--size-|--stroke-)/.test(name)
    },
    {
      id: 'radius',
      label: 'Radii',
      description: 'Corner geometry.',
      matches: name => name.startsWith('--radius-')
    },
    {
      id: 'effects',
      label: 'Effects',
      description: 'Shadows, blur, glass and gradients.',
      matches: name => /^(--shadow-|--blur-|--glass-|--gradient-)/.test(name)
    },
    {
      id: 'layout',
      label: 'Layout',
      description: 'Frames, responsive bounds and stacking.',
      matches: name => /^(--frame-|--content-|--gutter|--safe-|--mobile-|--desktop-|--subpage-|--page-|--ds-|--z-)/.test(name)
    },
    {
      id: 'motion',
      label: 'Motion & behavior',
      description: 'Durations, easing and scripted experience settings.',
      matches: name => /^(--duration-|--delay-|--easing-|--leet-|--menu-|--viewport-|--project-image-|--token-)/.test(name)
    },
    {
      id: 'components',
      label: 'Components',
      description: 'Component-specific contracts.',
      matches: () => true
    }
  ];
  const componentDocumentation = {
    'Logo': ['image mark', 'small / large', 'default / linked', 'Returns to the portfolio root.', '--space-8, --space-14'],
    'Icons': ['SVG symbol + use', 'navigation / action / status', 'default / hover / pressed', 'Inherits color and shared stroke.', '--size-icon, --stroke-thin, --fg-muted'],
    'Typography': ['family + role tokens', 'display / body / label', 'default / muted / inverse', 'Responsive roles preserve the shared mono voice.', '--font-family, --fz-h1, --fz-body, --fz-button-sm'],
    'Back Button': ['glass shell + chevron', 'fixed control', 'default / hover / pressed / focus', 'Uses browser history with a route fallback.', '--radius-lg, --border-glass, --blur-glass'],
    'Chips': ['label + green shell', 'small / current', 'default / hover / pressed / active', 'Horizontal navigation and paired FLIP target.', '--bg-accent-subtle, --radius-chip, --fz-button-sm'],
    'Menu Button': ['label + 24px icon', 'closed / open', 'default / opening / closing', 'Controls chatbox expansion and icon rotation.', '--bg-inverse, --fg-on-dark, --size-icon'],
    'Message Action': ['icon control', 'share / like / dislike', 'hidden / corrected / hover / pressed', 'Runs native share or local rating feedback.', '--size-icon, --radius-action, --fg-muted'],
    'Progress Tag': ['progress value + completion label', 'loading / DONE!', 'idle / generating / complete / dismissed', 'Tracks project-image depixelation milestones.', '--fz-button-sm, --lh-button-sm, --radius-action'],
    'Site Identity': ['name + version control', 'desktop / mobile', 'intro / visible', 'Persists across portfolio routes.', '--font-family, --fw-medium, --fz-paragraph'],
    'Token Counter': ['label + value + marker', 'count-up / persistent countdown', 'intro / active / restored', 'Stores the balance and spends on generated effects.', '--fz-button-sm, --lh-button-sm, --border-default'],
    'Chat Bubble': ['prefix + keyword + suffix', 'compact / large / selected', 'idle / writing / corrected / hover', 'Wraps whole words and shares Leet/routing behavior.', '--bg-accent-subtle, --radius-chip, --fg-accent'],
    'Message Actions': ['action group + timestamp', 'generated message footer', 'hidden / revealing / corrected', 'Appears after message correction.', '--space-6, --space-3, --fg-muted'],
    'Prompt Suggestion': ['rule + arrow + label', 'navigation prompt', 'hidden / revealing / hover / pressed', 'Replays Leet and spends tokens on interaction.', '--border-default, --size-icon, --duration-fast'],
    'Conversation Header': ['Back Button + Chat Bubble', 'secondary-page header', 'writing / corrected / wrapped', 'Pins prompt right while intrinsic text grows left.', '--space-3, --radius-chip, --size-icon'],
    'Message': ['body + Message Actions', 'home / subpage / incremental', 'queued / writing / corrected / revealed', 'Owns cascade order, scroll reveal and actions.', '--fz-body, --lh-body, --space-6'],
    'Prompt Suggestions': ['title + prompt rows', 'home / subpage', 'queued / cascading / interactive', 'Always follows Message Actions by the shared gap.', '--space-3, --space-10, --border-default'],
    'Project Cards': ['image + title + progress', 'small / medium / large / split', 'queued / loading / complete', 'Depixelates when entering the reveal boundary.', '--radius-sm, --shadow-floating, --fg-on-dark'],
    'Topbar and Chatbox': ['identity + counter + global navigation', 'desktop / mobile / menu open', 'intro / persistent / open / closed', 'Production shell remains fixed across pages.', '--bg-page, --bg-surface, --border-glass, --shadow-floating'],
    'Home Hero Template': ['topbar + hero + message + followups', 'responsive template', 'first load / restored visit', 'Generates only above-fold content before scroll reveal.', '--fz-h1, --lh-h1, --space-10'],
    'Conversation Template': ['conversation header + assistant response', 'secondary-page template', 'initial / incremental reveal', 'Standardises every route outside Home.', '--space-6, --space-10, --size-icon'],
    'Home Page': ['production Home composition', 'desktop / mobile', 'intro / scroll / menu open', 'Live isolated production route.', 'All Home and shell tokens'],
    'Work Page': ['production Work composition', 'desktop / mobile', 'intro / image generation / menu open', 'Live isolated secondary route.', 'All subpage, project and shell tokens']
  };

  function readTokenRules() {
    const tokens = new Map();

    function visitRules(rules) {
      Array.from(rules || []).forEach(rule => {
        if (rule.style && rule.selectorText?.includes(':root')) {
          Array.from(rule.style).forEach(name => {
            if (!name.startsWith('--') || tokens.has(name)) return;
            tokens.set(name, rule.style.getPropertyValue(name).trim());
          });
        }
        if (rule.cssRules?.length) visitRules(rule.cssRules);
      });
    }

    Array.from(document.styleSheets).forEach(sheet => {
      const href = sheet.href || '';
      if (!href.includes('tokens.css')) return;
      visitRules(sheet.cssRules);
    });

    return [...tokens].map(([name, source]) => ({
      name,
      source,
      resolved: resolvedStyles.getPropertyValue(name).trim()
    }));
  }

  function getTokenGroup(tokenName) {
    return groupDefinitions.find(group => group.matches(tokenName));
  }

  function getPreviewKind(token) {
    const value = token.resolved || token.source;
    if (/gradient\(/i.test(value)) return 'gradient';
    if (
      /color|background|foreground|accent|surface|scrim|overlay/i.test(token.name)
      || /^(#|rgb|hsl|oklch|transparent|currentColor)/i.test(value)
    ) return 'color';
    if (token.name.startsWith('--shadow-') || /shadow/i.test(token.name)) return 'shadow';
    if (token.name.startsWith('--radius-')) return 'radius';
    if (/^-?[\d.]+(px|rem|em|%|vw|vh)$/.test(value)) return 'size';
    return 'text';
  }

  function buildPreview(token) {
    const kind = getPreviewKind(token);
    const preview = document.createElement('span');
    preview.className = `ds-token__preview ds-token__preview--${kind}`;
    preview.setAttribute('aria-hidden', 'true');

    if (kind === 'color' || kind === 'gradient') {
      preview.style.background = token.resolved;
    } else if (kind === 'shadow') {
      preview.style.boxShadow = token.resolved;
    } else if (kind === 'radius') {
      preview.style.borderRadius = token.resolved;
      preview.style.setProperty('--ds-radius-preview', token.resolved);
    } else if (kind === 'size') {
      const numericValue = Math.abs(parseFloat(token.resolved));
      preview.style.setProperty('--ds-size-preview', `${Math.max(2, Math.min(numericValue || 2, 64))}px`);
    } else {
      preview.textContent = 'Aa';
    }
    return preview;
  }

  function buildTokenRow(token) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ds-token';
    button.dataset.tokenName = token.name;
    button.dataset.searchable = `${token.name} ${token.source} ${token.resolved}`.toLowerCase();
    button.title = `Copy ${token.name}`;

    const name = document.createElement('code');
    name.textContent = token.name;
    const source = document.createElement('span');
    source.className = 'ds-token__source';
    source.textContent = token.source;
    source.title = 'Source expression';
    const resolved = document.createElement('span');
    resolved.className = 'ds-token__resolved';
    resolved.textContent = token.resolved || token.source;
    resolved.title = 'Computed value';

    button.append(name, source, resolved, buildPreview(token));
    button.addEventListener('click', event => {
      let value = token.name;
      if (event.target === source) value = token.source;
      if (event.target === resolved) value = token.resolved || token.source;
      copyValue(value);
    });
    return button;
  }

  function renderTokens(tokens) {
    const grouped = new Map(groupDefinitions.map(group => [group.id, []]));
    tokens.forEach(token => grouped.get(getTokenGroup(token.name).id).push(token));

    groupDefinitions.forEach(group => {
      const items = grouped.get(group.id);
      if (!items.length) return;

      const section = document.createElement('section');
      section.className = 'ds-token-group';
      section.dataset.tokenGroup = group.id;
      const header = document.createElement('header');
      header.className = 'ds-token-group__header';
      header.innerHTML = `<div><h3>${group.label}</h3><p>${group.description}</p></div><span>${items.length}</span>`;
      const list = document.createElement('div');
      list.className = 'ds-token-list';
      items.forEach(token => list.append(buildTokenRow(token)));
      section.append(header, list);
      tokenGroupsRoot.append(section);
    });
  }

  async function copyValue(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`Copied ${value}`);
    } catch {
      showToast('Copy unavailable');
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.dataset.visible = 'true';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.dataset.visible = 'false';
    }, 1600);
  }

  function normalize(value) {
    return value.trim().toLowerCase();
  }

  function applySearch() {
    const query = normalize(searchInput.value);
    let visibleTokenCount = 0;
    let visibleSpecimenCount = 0;

    document.querySelectorAll('[data-token-name]').forEach(row => {
      const matches = !query || row.dataset.searchable.includes(query);
      row.hidden = !matches;
      if (matches) visibleTokenCount += 1;
    });

    document.querySelectorAll('[data-token-group]').forEach(group => {
      group.hidden = !group.querySelector('[data-token-name]:not([hidden])');
    });

    document.querySelectorAll('[data-component][data-searchable]').forEach(specimen => {
      const haystack = normalize(`${specimen.dataset.component} ${specimen.dataset.searchable}`);
      const matches = !query || haystack.includes(query);
      specimen.hidden = !matches;
      if (matches) visibleSpecimenCount += 1;
    });

    document.querySelectorAll('[data-atomic-section]').forEach(section => {
      section.hidden = Boolean(query) && !section.querySelector('[data-component]:not([hidden])');
    });

    noResults.hidden = !query || visibleTokenCount > 0 || visibleSpecimenCount > 0;
  }

  function setupFrameControls() {
    document.querySelectorAll('[data-frame-controls]').forEach(toolbar => {
      const frame = document.getElementById(toolbar.dataset.frameControls);
      if (!frame) return;
      toolbar.querySelectorAll('[data-frame-size]').forEach(button => {
        button.addEventListener('click', () => {
          const size = button.dataset.frameSize;
          frame.dataset.size = size === 'mobile' ? 'mobile' : 'desktop';
          toolbar.querySelectorAll('[data-frame-size]').forEach(peer => {
            peer.setAttribute('aria-pressed', String(peer === button));
          });
        });
      });
    });
  }

  function enhanceSpecimens() {
    const labels = ['Anatomy', 'Variants', 'States', 'Behavior', 'Tokens'];
    document.querySelectorAll('[data-component]').forEach(specimen => {
      const documentation = componentDocumentation[specimen.dataset.component];
      if (!documentation || specimen.querySelector('.ds-component-meta')) return;
      const list = document.createElement('dl');
      list.className = 'ds-component-meta';
      documentation.forEach((value, index) => {
        const item = document.createElement('div');
        const term = document.createElement('dt');
        const definition = document.createElement('dd');
        term.textContent = labels[index];
        definition.textContent = value;
        item.append(term, definition);
        list.append(item);
      });
      specimen.append(list);
    });
  }

  function setupSectionTracking() {
    const links = [...document.querySelectorAll('.ds-nav a')];
    const sections = links
      .map(link => document.querySelector(link.getAttribute('href')))
      .filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const current = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!current) return;
      links.forEach(link => {
        const active = link.getAttribute('href') === `#${current.target.id}`;
        if (active) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.1, 0.5] });
    sections.forEach(section => observer.observe(section));
  }

  function initialize() {
    try {
      const tokens = readTokenRules();
      if (!tokens.length) throw new Error('No token rules found');
      renderTokens(tokens);
      document.querySelectorAll('[data-token-count]').forEach(node => {
        node.textContent = String(tokens.length);
      });
    } catch (error) {
      tokenError.hidden = false;
      console.error('Design system token catalogue:', error);
    }

    enhanceSpecimens();
    const components = new Set(
      [...document.querySelectorAll('[data-component]')].map(node => node.dataset.component)
    );
    document.querySelectorAll('[data-component-count]').forEach(node => {
      node.textContent = String(components.size);
    });

    searchInput.addEventListener('input', applySearch);
    document.querySelectorAll('[data-ds-static]').forEach(control => {
      control.addEventListener('click', event => event.preventDefault());
    });
    setupFrameControls();
    setupSectionTracking();
  }

  initialize();
})();
