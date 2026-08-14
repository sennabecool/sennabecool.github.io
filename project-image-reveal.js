// Project image depixelation — Canvas 2D, no external dependency.
(() => {
  const selector = 'img[data-pixel-reveal]';
  const root = document.documentElement;
  const rootStyles = getComputedStyle(root);
  const effects = new Map();
  const projectCardBreakpoint = window.matchMedia('(min-width: 768px)');
  let intersectionObserver = null;

  function readCssNumber(name, fallback) {
    const value = parseFloat(rootStyles.getPropertyValue(name));
    return Number.isFinite(value) ? value : fallback;
  }

  function readCssValue(name, fallback) {
    return rootStyles.getPropertyValue(name).trim() || fallback;
  }

  const config = Object.freeze({
    durationMin: readCssNumber('--project-image-reveal-duration-min', 2200),
    durationMax: readCssNumber('--project-image-reveal-duration-max', 3000),
    stagger: readCssNumber('--project-image-reveal-stagger', 80),
    delay: readCssNumber('--project-image-reveal-delay', 160),
    startBlock: readCssNumber('--project-image-reveal-start-block', 32),
    milestones: readCssNumber('--project-image-reveal-milestones', 5),
    paceSegments: readCssNumber('--project-image-reveal-pace-segments', 9),
    paceJitter: readCssNumber('--project-image-reveal-pace-jitter', 0.08),
    regressionMin: readCssNumber('--project-image-reveal-regression-min', 0.05),
    regressionMax: readCssNumber('--project-image-reveal-regression-max', 0.12),
    completeHold: readCssNumber('--project-card-tag-complete-hold', 120),
    doneHold: readCssNumber('--project-card-tag-done-hold', 400),
    dismissDuration: readCssNumber('--project-card-tag-dismiss-duration', 250),
    fadeStart: readCssNumber('--project-image-reveal-fade-start', 0.82),
    threshold: readCssNumber('--project-image-reveal-threshold', 0.15),
    rootMargin: readCssValue('--project-image-reveal-root-margin', '0px 0px -10% 0px'),
    maximumDpr: readCssNumber('--project-image-reveal-max-dpr', 2),
    tokenCost: readCssNumber('--project-image-reveal-token-cost', 1)
  });

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  function syncProjectCardSizes(scope = document) {
    scope.querySelectorAll(
      '.project-card[data-project-size-mobile], .project-card[data-project-size-desktop]'
    ).forEach(card => {
      const mobileSize = card.dataset.projectSizeMobile || 'sm';
      const desktopSize = card.dataset.projectSizeDesktop || mobileSize;
      const size = projectCardBreakpoint.matches ? desktopSize : mobileSize;
      if (!['sm', 'md', 'lg'].includes(size)) return;

      card.classList.remove(
        'project-card--sm',
        'project-card--md',
        'project-card--lg',
        'project-card--split'
      );
      card.classList.add(`project-card--${size}`);
      card.classList.toggle('project-card--split', size === 'md');
      card.dataset.projectSize = size;
    });
  }

  function setupResponsiveProjectCards() {
    syncProjectCardSizes();
    projectCardBreakpoint.addEventListener('change', () => {
      syncProjectCardSizes();
    });
  }

  function createMilestoneBlocks(startBlock, milestoneCount) {
    const count = Math.max(1, Math.round(milestoneCount));
    const start = Math.max(count + 1, Math.round(startBlock));

    return Array.from({ length: count + 1 }, (_, index) => {
      if (index === count) return 1;
      const progress = index / count;
      const logarithmicBlock = Math.round(start ** (1 - progress));
      const minimumForRemainingSteps = count - index + 1;
      return Math.max(minimumForRemainingSteps, logarithmicBlock);
    });
  }

  function randomBetween(minimum, maximum) {
    const low = Math.min(minimum, maximum);
    const high = Math.max(minimum, maximum);
    return low + Math.random() * (high - low);
  }

  function createPaceProfile(
    segmentCount,
    jitterAmount,
    minimumRegression,
    maximumRegression
  ) {
    const count = Math.max(5, Math.round(segmentCount));
    const jitter = Math.max(0, jitterAmount);
    const points = [0];

    for (let index = 1; index < count; index += 1) {
      const baseline = index / count;
      points.push(Math.max(
        0.02,
        Math.min(0.96, baseline + randomBetween(-jitter, jitter))
      ));
    }
    points.push(1);

    const firstDipIndex = 3;
    const lastDipIndex = Math.max(firstDipIndex, count - 2);
    const dipIndex = Math.floor(randomBetween(firstDipIndex, lastDipIndex + 1));
    const regression = randomBetween(minimumRegression, maximumRegression);
    points[dipIndex] = Math.max(0.02, points[dipIndex - 1] - regression);

    return { count, points, dipIndex };
  }

  function getPacedProgress(linearProgress, profile) {
    const progress = Math.max(0, Math.min(1, linearProgress));
    if (progress === 0 || progress === 1) return progress;

    const position = progress * profile.count;
    const segmentIndex = Math.min(profile.count - 1, Math.floor(position));
    const localProgress = position - segmentIndex;
    const easedProgress = localProgress * localProgress * (3 - 2 * localProgress);
    const start = profile.points[segmentIndex];
    const end = profile.points[segmentIndex + 1];

    return start + (end - start) * easedProgress;
  }

  function waitForImage(image) {
    if (image.complete && image.naturalWidth > 0) {
      return typeof image.decode === 'function'
        ? image.decode().catch(() => {})
        : Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });
  }

  function getCoverCrop(image, targetWidth, targetHeight) {
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    const sourceRatio = sourceWidth / sourceHeight;
    const targetRatio = targetWidth / targetHeight;
    let width = sourceWidth;
    let height = sourceHeight;
    let x = 0;
    let y = 0;

    if (sourceRatio > targetRatio) {
      width = sourceHeight * targetRatio;
      x = (sourceWidth - width) / 2;
    } else {
      height = sourceWidth / targetRatio;
      y = (sourceHeight - height) / 2;
    }

    return { x, y, width, height };
  }

  class ProjectImageReveal {
    constructor(image, index) {
      this.image = image;
      this.index = index;
      this.progressTag = this.image
        .closest('.project-card')
        ?.querySelector('[data-pixel-progress]') || null;
      this.progressElement = this.progressTag
        ?.querySelector('[data-pixel-progress-value]') || null;
      this.doneElement = this.progressTag
        ?.querySelector('[data-pixel-progress-done]') || null;
      this.blocks = createMilestoneBlocks(config.startBlock, config.milestones);
      this.milestoneCount = this.blocks.length - 1;
      this.currentMilestone = 0;
      this.currentBlock = this.blocks[0];
      this.duration = Math.max(1, Math.round(randomBetween(
        config.durationMin,
        config.durationMax
      )));
      this.paceProfile = createPaceProfile(
        config.paceSegments,
        config.paceJitter,
        config.regressionMin,
        config.regressionMax
      );
      this.peakProgress = 0;
      this.chargedProgress = 0;
      this.canvas = null;
      this.lowResolutionCanvas = document.createElement('canvas');
      this.animationFrame = null;
      this.completionTimer = null;
      this.startTimer = null;
      this.startTime = null;
      this.startRequested = false;
      this.useStagger = true;
      this.hasDrawnPixelImage = false;
      this.started = false;
      this.completed = false;
      this.resizeObserver = null;
    }

    async prepare({ startImmediately = false } = {}) {
      this.resetProgressTag();
      this.image.dataset.pixelDuration = String(this.duration);
      this.image.dataset.pixelState = 'loading';

      try {
        await waitForImage(this.image);
      } catch {
        this.complete({ chargeProgress: false });
        return;
      }

      if (!this.image.isConnected || !this.image.naturalWidth) {
        this.complete({ chargeProgress: false });
        return;
      }

      if (prefersReducedMotion || typeof HTMLCanvasElement === 'undefined') {
        this.complete({ chargeProgress: false });
        return;
      }

      this.canvas = document.createElement('canvas');
      this.canvas.className = 'project-card__pixel-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.image.parentElement.appendChild(this.canvas);
      this.drawBlack();
      this.image.dataset.pixelState = 'ready';

      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          if (!this.canvas?.isConnected) return;
          if (this.hasDrawnPixelImage) this.draw(this.currentBlock);
          else this.drawBlack();
        });
        this.resizeObserver.observe(this.image);
      }

      if (startImmediately || this.startRequested) {
        this.start();
      } else if (
        !this.image.closest('[data-reveal-on-scroll]')
        && intersectionObserver
      ) {
        intersectionObserver.observe(this.image);
      } else if (!this.image.closest('[data-reveal-on-scroll]')) {
        this.start();
      }
    }

    setProgress(value, { charge = false } = {}) {
      const progress = Math.max(0, Math.min(100, value));
      if (charge && progress > this.chargedProgress) {
        const newlyGenerated = progress - this.chargedProgress;
        this.chargedProgress = progress;
        globalThis.portfolioExperience?.spendTokens?.(
          newlyGenerated * Math.max(0, Math.round(config.tokenCost))
        );
      }
      if (this.progressElement) {
        this.progressElement.textContent = String(progress);
      }
    }

    getDoneEffect() {
      return globalThis.portfolioTextEffects?.leetTexts
        ?.find(effect => effect.el === this.doneElement) || null;
    }

    setCompletionTimer(callback, delay) {
      this.clearCompletionTimer();
      this.completionTimer = window.setTimeout(() => {
        this.completionTimer = null;
        callback();
      }, Math.max(0, delay));
    }

    clearCompletionTimer() {
      if (this.completionTimer === null) return;
      window.clearTimeout(this.completionTimer);
      this.completionTimer = null;
    }

    resetProgressTag() {
      this.clearCompletionTimer();
      this.setProgress(0);
      if (!this.progressTag) return;
      this.progressTag.hidden = false;
      delete this.progressTag.dataset.pixelProgressState;
      this.getDoneEffect()?.prepareHidden({ reserveSpace: false });
    }

    showPlainDone() {
      if (!this.doneElement) return;
      const characters = this.doneElement.querySelectorAll('.leet-char');
      if (!characters.length) {
        this.doneElement.textContent = 'DONE!';
      } else {
        characters.forEach(character => {
          character.textContent = character.dataset.char;
          character.style.minWidth = '';
          character.style.opacity = '1';
          delete character.dataset.leetTone;
        });
      }
      this.doneElement.dataset.leetState = 'ready';
    }

    showDone() {
      if (!this.progressTag || !this.doneElement) return;
      this.progressTag.dataset.pixelProgressState = 'done';
      const effect = this.getDoneEffect();
      let animationDuration = 0;

      if (effect && !prefersReducedMotion) {
        effect.prepareHidden({ reserveSpace: false });
        effect.playIn({
          growFromEmpty: true,
          correctionAfterWrite: true
        });
        animationDuration = effect.getPlayInDuration(1, true);
      } else {
        this.showPlainDone();
      }

      this.setCompletionTimer(
        () => this.dismissProgressTag(),
        animationDuration + config.doneHold
      );
    }

    dismissProgressTag() {
      if (!this.progressTag) return;
      this.progressTag.dataset.pixelProgressState = 'dismissing';
      this.setCompletionTimer(() => {
        this.progressTag.hidden = true;
        this.progressTag.dataset.pixelProgressState = 'hidden';
      }, prefersReducedMotion ? 0 : config.dismissDuration);
    }

    draw(blockSize) {
      if (!this.canvas || !this.image.naturalWidth) return;

      const rect = this.image.getBoundingClientRect();
      const cssWidth = Math.max(1, Math.round(rect.width));
      const cssHeight = Math.max(1, Math.round(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, config.maximumDpr);
      const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
      const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
      const lowWidth = Math.max(1, Math.ceil(cssWidth / blockSize));
      const lowHeight = Math.max(1, Math.ceil(cssHeight / blockSize));

      if (
        this.canvas.width !== targetWidth
        || this.canvas.height !== targetHeight
      ) {
        this.canvas.width = targetWidth;
        this.canvas.height = targetHeight;
      }

      if (
        this.lowResolutionCanvas.width !== lowWidth
        || this.lowResolutionCanvas.height !== lowHeight
      ) {
        this.lowResolutionCanvas.width = lowWidth;
        this.lowResolutionCanvas.height = lowHeight;
      }

      const lowContext = this.lowResolutionCanvas.getContext('2d');
      const context = this.canvas.getContext('2d');
      if (!lowContext || !context) {
        this.complete({ chargeProgress: false });
        return;
      }

      const crop = getCoverCrop(this.image, cssWidth, cssHeight);
      lowContext.clearRect(0, 0, lowWidth, lowHeight);
      lowContext.imageSmoothingEnabled = true;
      lowContext.imageSmoothingQuality = 'high';
      lowContext.drawImage(
        this.image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        lowWidth,
        lowHeight
      );

      context.clearRect(0, 0, targetWidth, targetHeight);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        this.lowResolutionCanvas,
        0,
        0,
        lowWidth,
        lowHeight,
        0,
        0,
        targetWidth,
        targetHeight
      );
      this.canvas.dataset.pixelBlock = String(blockSize);
    }

    drawBlack() {
      this.draw(this.currentBlock);
      if (!this.canvas) return;
      const context = this.canvas.getContext('2d');
      if (!context) return;
      context.save();
      context.fillStyle = '#000';
      context.fillRect(0, 0, this.canvas.width, this.canvas.height);
      context.restore();
      this.canvas.dataset.pixelBlock = 'black';
    }

    start({ stagger = this.useStagger } = {}) {
      if (this.started) return;
      this.startRequested = true;
      this.useStagger = stagger;
      if (!this.canvas) return;
      this.started = true;
      intersectionObserver?.unobserve(this.image);
      this.startTimer = window.setTimeout(() => {
        this.image.dataset.pixelState = 'revealing';
        this.animationFrame = requestAnimationFrame(time => this.tick(time));
      }, config.delay + (stagger ? this.index * config.stagger : 0));
    }

    tick(time) {
      if (this.startTime === null) this.startTime = time;
      const linearProgress = Math.min(1, (time - this.startTime) / this.duration);
      const progress = getPacedProgress(linearProgress, this.paceProfile);
      this.peakProgress = Math.max(this.peakProgress, progress);
      const percentage = Math.min(100, Math.floor(progress * 100));
      const milestone = Math.min(
        this.milestoneCount,
        Math.floor(this.peakProgress * this.milestoneCount)
      );
      this.setProgress(percentage, { charge: true });

      if (!this.hasDrawnPixelImage && percentage > 0) {
        this.hasDrawnPixelImage = true;
        this.draw(this.currentBlock);
      }

      if (milestone !== this.currentMilestone) {
        this.currentMilestone = milestone;
        this.currentBlock = this.blocks[milestone];
        this.hasDrawnPixelImage = true;
        this.draw(this.currentBlock);
      }

      const fadeProgress = this.peakProgress <= config.fadeStart
        ? 0
        : (
          (this.peakProgress - config.fadeStart)
          / (1 - config.fadeStart)
        );
      this.canvas.style.opacity = String(Math.max(0, 1 - fadeProgress));

      if (linearProgress < 1) {
        this.animationFrame = requestAnimationFrame(nextTime => this.tick(nextTime));
        return;
      }

      this.complete();
    }

    complete({ showDone = true, chargeProgress = true } = {}) {
      if (this.completed) {
        if (!showDone) this.clearCompletionTimer();
        return;
      }
      this.completed = true;
      if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
      if (this.startTimer !== null) clearTimeout(this.startTimer);
      intersectionObserver?.unobserve(this.image);
      this.resizeObserver?.disconnect();
      this.canvas?.remove();
      this.canvas = null;
      this.image.dataset.pixelState = 'complete';
      this.setProgress(100, { charge: chargeProgress });
      if (showDone && this.progressTag) {
        this.setCompletionTimer(() => this.showDone(), config.completeHold);
      }
    }

    destroy() {
      this.complete({ showDone: false, chargeProgress: false });
      this.resetProgressTag();
      effects.delete(this.image);
    }
  }

  function init(scope = document, { startImmediately = false } = {}) {
    syncProjectCardSizes(scope);
    const images = [...scope.querySelectorAll(selector)]
      .filter(image => !effects.has(image));
    if (!images.length) return;

    root.dataset.projectImageReveal = 'enabled';

    if (
      !prefersReducedMotion
      && typeof IntersectionObserver === 'function'
      && !intersectionObserver
    ) {
      intersectionObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          effects.get(entry.target)?.start();
        });
      }, {
        threshold: config.threshold,
        rootMargin: config.rootMargin
      });
    }

    images.forEach((image, index) => {
      const effect = new ProjectImageReveal(image, index);
      effects.set(image, effect);
      effect.prepare({ startImmediately });
    });
  }

  function replay(scope = document, options = {}) {
    [...scope.querySelectorAll(selector)].forEach(image => {
      effects.get(image)?.destroy();
      delete image.dataset.pixelState;
    });
    init(scope, options);
  }

  function start(scope = document) {
    const images = scope.matches?.(selector)
      ? [scope]
      : [...scope.querySelectorAll(selector)];
    images.forEach(image => {
      effects.get(image)?.start({ stagger: false });
    });
  }

  setupResponsiveProjectCards();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(), { once: true });
  } else {
    init();
  }

  globalThis.portfolioProjectImages = {
    init,
    replay,
    start,
    syncSizes: syncProjectCardSizes
  };
})();
