const carousel = document.querySelector('.carousel');
const container = document.querySelector('.carousel-container');
const dotsContainer = document.querySelector('.carousel-dots');
const themeToggle = document.querySelector('.theme-toggle');
const autoplayToggle = document.querySelector('.autoplay-toggle');
const missionCta = document.querySelector('.mission-cta');
const fundingPanel = document.querySelector('.funding-fixed');
const fundingBackdrop = document.querySelector('.funding-backdrop');
const qrPanel = document.querySelector('.qr-fixed');
const qrBackdrop = document.querySelector('.qr-backdrop');

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

const SWIPE_TRIGGER_PX = 32;
const TAP_TOLERANCE_PX = 10;
const CLICK_SUPPRESS_MS = 260;
const INITIAL_TRACK_COPIES = 5;
const DEFAULT_TRANSITION_STYLE = 'transform 0.5s ease';
const AUTO_SWIPE_DURATION_MS = 3200;
const AUTO_SWIPE_DELAY_MS = 2500;
const AUTO_SWIPE_TRANSITION_STYLE = `transform ${AUTO_SWIPE_DURATION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
const DESIGN_BASE_WIDTH = 1472;
const DESIGN_BASE_HEIGHT = 867;

// --- OUR TEAM CLICK SOUND (START) ---
// Quick disable option 1: set this to false.
// Quick disable option 2: comment out the single call in navigateWithTransition().
const ENABLE_OUR_TEAM_CLICK_SOUND = false;
const OUR_TEAM_TARGET = 'our-team.html';
const OUR_TEAM_SOUND_PATH = 'sound/duck.mp3';
const ourTeamClickAudio = new Audio(OUR_TEAM_SOUND_PATH);
ourTeamClickAudio.preload = 'auto';
ourTeamClickAudio.loop = false;
ourTeamClickAudio.load();
// --- OUR TEAM CLICK SOUND (END) ---

const templateItems = Array.from(document.querySelectorAll('.carousel-item'));
let allItems = [];
let realCount = templateItems.length;
let currentIndex = 0;
let lastActiveIndex = -1;
let dots = [];
let isNavigating = false;
let pendingRestoreIndex = null;
let isDragging = false;
let dragPointerId = null;
let dragStartX = 0;
let dragCurrentX = 0;
let dragStartTranslate = 0;
let activeTranslate = 0;
let dragFrameId = null;
let pendingDragTranslate = 0;
let clickSuppressedUntil = 0;
let autoSwipeActive = false;
let autoSwipeTimerId = null;
let fundingExpanded = false;
let fundingAnimating = false;
let qrExpanded = false;
let qrAnimating = false;
const prefetchedDocuments = new Set();

function playOurTeamClickSoundOnce() {
  if (!ENABLE_OUR_TEAM_CLICK_SOUND) return;
  try {
    ourTeamClickAudio.pause();
    ourTeamClickAudio.currentTime = 0;
    const playPromise = ourTeamClickAudio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {});
    }
  } catch {
    // Ignore audio playback errors to avoid blocking navigation.
  }
}

function applyTheme(mode) {
  const isBright = mode === 'bright';
  document.body.classList.toggle('bright-mode', isBright);
  if (window.refreshI18nThemeButtons) {
    window.refreshI18nThemeButtons();
  } else if (themeToggle) {
    let icon = themeToggle.querySelector('.theme-toggle-icon');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'theme-toggle-icon';
      icon.setAttribute('aria-hidden', 'true');
      themeToggle.textContent = '';
      themeToggle.appendChild(icon);
    }
    icon.textContent = isBright ? '\uD83C\uDF19' : '\u2600';
    themeToggle.setAttribute('aria-label', isBright ? 'Enable dark mode' : 'Enable bright mode');
  }
}

function updateScreenFitScale() {
  const widthScale = window.innerWidth / DESIGN_BASE_WIDTH;
  const heightScale = window.innerHeight / DESIGN_BASE_HEIGHT;
  const fitScale = Math.min(1, widthScale, heightScale);
  document.documentElement.style.setProperty('--screen-fit-scale', String(fitScale));
}

function setCarouselTransitionEnabled(enabled, transitionStyle = DEFAULT_TRANSITION_STYLE) {
  carousel.style.transition = enabled ? transitionStyle : 'none';
}

function setTranslate(x) {
  activeTranslate = x;
  carousel.style.transform = `translate3d(${x}px, 0, 0)`;
}

function flushPendingDragTranslate() {
  if (dragFrameId === null) return;
  window.cancelAnimationFrame(dragFrameId);
  dragFrameId = null;
  setTranslate(pendingDragTranslate);
}

function queueDragTranslate(x) {
  pendingDragTranslate = x;
  if (dragFrameId !== null) return;
  dragFrameId = window.requestAnimationFrame(() => {
    dragFrameId = null;
    setTranslate(pendingDragTranslate);
  });
}

function prefetchDocument(url) {
  if (!url) return;

  let absoluteUrl;
  try {
    absoluteUrl = new URL(url, window.location.href).href;
  } catch {
    return;
  }

  if (prefetchedDocuments.has(absoluteUrl)) return;
  prefetchedDocuments.add(absoluteUrl);

  const hint = document.createElement('link');
  hint.rel = 'prefetch';
  hint.as = 'document';
  hint.href = absoluteUrl;
  document.head.appendChild(hint);
}

function prefetchNavigationTargets() {
  const targets = new Set();
  templateItems.forEach((item) => {
    const target = item.dataset.target;
    if (target) targets.add(target);
  });
  if (missionCta) {
    const missionTarget = missionCta.getAttribute('href');
    if (missionTarget) targets.add(missionTarget);
  }

  const schedulePrefetch = () => {
    targets.forEach((target) => prefetchDocument(target));
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(schedulePrefetch, { timeout: 1200 });
    return;
  }
  window.setTimeout(schedulePrefetch, 300);
}

function getItemCenter(item) {
  return item.offsetLeft + (item.offsetWidth / 2);
}

function getTranslateForIndex(index) {
  const targetItem = allItems[index];
  if (!targetItem) return 0;
  const containerCenter = container.clientWidth / 2;
  return containerCenter - getItemCenter(targetItem);
}

function positiveMod(value, divisor) {
  if (divisor === 0) return 0;
  return ((value % divisor) + divisor) % divisor;
}

function getActiveRealIndex() {
  return positiveMod(currentIndex, realCount);
}

function getSlideSpan() {
  if (allItems.length < 2) return allItems[0]?.offsetWidth || 300;
  const left = Math.max(0, Math.min(allItems.length - 2, currentIndex));
  const right = left + 1;
  return Math.abs(getItemCenter(allItems[right]) - getItemCenter(allItems[left])) || 300;
}

function applyActiveClasses() {
  if (lastActiveIndex === currentIndex && allItems[currentIndex]) return;

  if (lastActiveIndex >= 0) {
    const previousActive = allItems[lastActiveIndex];
    if (previousActive) previousActive.classList.remove('active');
  }

  const nextActive = allItems[currentIndex];
  if (nextActive) nextActive.classList.add('active');
  lastActiveIndex = currentIndex;
}

function updateDots() {
  if (!dots.length) return;
  const activeRealIndex = getActiveRealIndex();
  dots.forEach((dot, index) => {
    dot.classList.toggle('active', index === activeRealIndex);
  });
}

function updateCarousel(options = {}) {
  const animate = options.animate !== false;
  setCarouselTransitionEnabled(animate, options.transitionStyle || DEFAULT_TRANSITION_STYLE);
  applyActiveClasses();
  setTranslate(getTranslateForIndex(currentIndex));
  updateDots();
}

function makeRealItemClone(realIndex) {
  const node = templateItems[realIndex].cloneNode(true);
  node.classList.remove('active', 'is-opening');
  node.dataset.realIndex = String(realIndex);
  return node;
}

function appendCopyBlocks(blockCount) {
  if (realCount < 1 || blockCount < 1) return 0;

  const fragment = document.createDocumentFragment();
  const added = [];
  for (let block = 0; block < blockCount; block += 1) {
    for (let i = 0; i < realCount; i += 1) {
      const node = makeRealItemClone(i);
      added.push(node);
      fragment.appendChild(node);
    }
  }
  carousel.appendChild(fragment);
  allItems.push(...added);
  return added.length;
}

function prependCopyBlocks(blockCount) {
  if (realCount < 1 || blockCount < 1) return 0;

  const fragment = document.createDocumentFragment();
  const added = [];
  for (let block = 0; block < blockCount; block += 1) {
    for (let i = 0; i < realCount; i += 1) {
      const node = makeRealItemClone(i);
      added.push(node);
      fragment.appendChild(node);
    }
  }
  carousel.insertBefore(fragment, carousel.firstChild);
  allItems = [...added, ...allItems];
  currentIndex += added.length;
  if (lastActiveIndex >= 0) {
    lastActiveIndex += added.length;
  }
  return added.length;
}

function attachCardClickHandlers(items) {
  items.forEach((item) => {
    item.addEventListener('click', () => navigateWithTransition(item));
  });
}

function buildInfiniteTrack() {
  if (realCount < 1) return;

  carousel.replaceChildren();
  allItems = [];
  lastActiveIndex = -1;

  appendCopyBlocks(Math.max(INITIAL_TRACK_COPIES, 3));
  currentIndex = realCount * Math.floor(Math.max(INITIAL_TRACK_COPIES, 3) / 2);
  attachCardClickHandlers(allItems);
}

function consumeRestoreIndex() {
  const raw = window.sessionStorage.getItem('returnToProjectIndex');
  if (raw === null) return;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isNaN(parsed) && parsed >= 0 && parsed < realCount) {
    pendingRestoreIndex = parsed;
  }
  window.sessionStorage.removeItem('returnToProjectIndex');
}

function ensureCapacityForTarget(targetIndex) {
  if (realCount < 2) return targetIndex;

  if (targetIndex < 0) {
    const missing = Math.abs(targetIndex);
    const blocks = Math.ceil(missing / realCount) + 1;
    const added = prependCopyBlocks(blocks);
    attachCardClickHandlers(allItems.slice(0, added));
    targetIndex += added;
  }

  if (targetIndex >= allItems.length) {
    const missing = targetIndex - allItems.length + 1;
    const blocks = Math.ceil(missing / realCount) + 1;
    const prevLength = allItems.length;
    appendCopyBlocks(blocks);
    attachCardClickHandlers(allItems.slice(prevLength));
  }

  return targetIndex;
}

function changeSlide(step, options = {}) {
  if (realCount < 2 || step === 0 || isDragging) return;

  let targetIndex = currentIndex + step;
  targetIndex = ensureCapacityForTarget(targetIndex);
  currentIndex = targetIndex;
  updateCarousel({ animate: true, transitionStyle: options.transitionStyle });
}

function goToRealIndex(index) {
  if (realCount < 1) return;
  const target = Math.min(Math.max(index, 0), realCount - 1);

  const currentReal = getActiveRealIndex();
  const diff = target - currentReal;
  let step = diff;
  if (realCount > 2) {
    if (step > realCount / 2) step -= realCount;
    if (step < -(realCount / 2)) step += realCount;
  }

  let targetIndex = currentIndex + step;
  targetIndex = ensureCapacityForTarget(targetIndex);
  currentIndex = targetIndex;
  updateCarousel({ animate: true });
}

function buildDots() {
  if (!dotsContainer) return;
  dotsContainer.innerHTML = '';

  for (let index = 0; index < realCount; index += 1) {
    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', `Gehe zu Projekt ${index + 1}`);
    dot.addEventListener('click', () => goToRealIndex(index));
    dotsContainer.appendChild(dot);
  }

  dots = Array.from(dotsContainer.querySelectorAll('.dot'));
}

function suppressClicksBriefly() {
  clickSuppressedUntil = performance.now() + CLICK_SUPPRESS_MS;
}

function shouldSuppressClick() {
  return performance.now() < clickSuppressedUntil;
}

function setAutoSwipeUi() {
  if (!autoplayToggle) return;

  autoplayToggle.classList.toggle('is-playing', autoSwipeActive);
  autoplayToggle.setAttribute(
    'aria-label',
    autoSwipeActive ? 'Automatisches Wischen pausieren' : 'Automatisches Wischen starten'
  );

  const icon = autoplayToggle.querySelector('.autoplay-icon');
  const text = autoplayToggle.querySelector('.autoplay-text');
  if (icon) {
    icon.textContent = autoSwipeActive ? '||' : '>';
  }
  if (text) {
    text.textContent = autoSwipeActive ? 'Pause' : 'Auto Scroll';
  }
}

function clearAutoSwipeTimer() {
  if (autoSwipeTimerId === null) return;
  window.clearTimeout(autoSwipeTimerId);
  autoSwipeTimerId = null;
}

function queueAutoSwipe(delayMs) {
  if (!autoSwipeActive || realCount < 2 || isNavigating) return;
  clearAutoSwipeTimer();

  autoSwipeTimerId = window.setTimeout(() => {
    autoSwipeTimerId = null;

    if (!autoSwipeActive || isNavigating) return;
    if (isDragging) {
      queueAutoSwipe(300);
      return;
    }

    changeSlide(1, { transitionStyle: AUTO_SWIPE_TRANSITION_STYLE });
    queueAutoSwipe(AUTO_SWIPE_DURATION_MS + AUTO_SWIPE_DELAY_MS);
  }, delayMs);
}

function startAutoSwipe() {
  if (autoSwipeActive || realCount < 2) return;
  autoSwipeActive = true;
  setAutoSwipeUi();
  queueAutoSwipe(300);
}

function stopAutoSwipe() {
  if (!autoSwipeActive && autoSwipeTimerId === null) return;
  autoSwipeActive = false;
  clearAutoSwipeTimer();
  setAutoSwipeUi();
}

function resetNavigationLock() {
  isNavigating = false;
  document.documentElement.classList.remove('is-navigating');
  document.body.classList.remove('is-navigating', 'page-exit');
  allItems.forEach((item) => item.classList.remove('is-opening'));
  if (missionCta) {
    missionCta.classList.remove('is-opening');
  }
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
}

function startNavigationTransition() {
  document.documentElement.classList.add('is-navigating');
  document.body.classList.add('is-navigating');
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.classList.add('page-exit');
}

function navigateWithTransition(item) {
  if (isNavigating || shouldSuppressClick()) return;
  const target = item.dataset.target;
  if (!target) return;
  prefetchDocument(target);

  if (target === OUR_TEAM_TARGET) {
    // OUR_TEAM_CLICK_SOUND: comment out this next line to disable quickly.
    playOurTeamClickSoundOnce();
  }

  stopAutoSwipe();
  isNavigating = true;
  const realIndex = Number.parseInt(item.dataset.realIndex || String(getActiveRealIndex()), 10);
  if (!Number.isNaN(realIndex)) {
    window.sessionStorage.setItem('lastProjectIndex', String(realIndex));
  }

  item.classList.add('is-opening');
  startNavigationTransition();

  window.setTimeout(() => {
    window.location.href = target;
  }, 760);
}

function navigateMissionWithTransition(event) {
  event.preventDefault();
  if (!missionCta || isNavigating || shouldSuppressClick()) return;

  const target = missionCta.getAttribute('href');
  if (!target) return;
  prefetchDocument(target);

  stopAutoSwipe();
  isNavigating = true;
  window.sessionStorage.setItem('lastProjectIndex', String(getActiveRealIndex()));
  missionCta.classList.add('is-opening');
  startNavigationTransition();

  window.setTimeout(() => {
    window.location.href = target;
  }, 760);
}

function onPointerDown(e) {
  if (isDragging) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (realCount < 2) return;
  if (isSwipeStartExcluded(e.target)) return;

  isDragging = true;
  dragPointerId = e.pointerId;
  dragStartX = e.clientX;
  dragCurrentX = e.clientX;
  dragStartTranslate = activeTranslate;
  container.classList.add('is-dragging');
  pendingDragTranslate = dragStartTranslate;

  setCarouselTransitionEnabled(false);
}

function isSwipeStartExcluded(target) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('select, input, textarea, [contenteditable="true"], .language-menu, .funding-fixed, .funding-backdrop, .qr-fixed, .qr-backdrop')
  );
}

function setFundingExpanded(expanded) {
  if (!fundingPanel || !fundingBackdrop) return;
  if (fundingAnimating || fundingExpanded === expanded) return;

  const firstRect = fundingPanel.getBoundingClientRect();

  fundingPanel.classList.toggle('is-expanded', expanded);
  fundingPanel.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  fundingBackdrop.classList.toggle('is-visible', expanded);
  fundingExpanded = expanded;

  const lastRect = fundingPanel.getBoundingClientRect();
  const dx = firstRect.left - lastRect.left;
  const dy = firstRect.top - lastRect.top;
  const sx = firstRect.width / Math.max(lastRect.width, 1);
  const sy = firstRect.height / Math.max(lastRect.height, 1);

  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(1 - sx) < 0.01 && Math.abs(1 - sy) < 0.01) {
    fundingPanel.style.transform = 'none';
    fundingAnimating = false;
    return;
  }

  fundingAnimating = true;
  fundingPanel.style.transition = 'none';
  fundingPanel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  // Force layout so the inverted state is committed before animating to natural state.
  fundingPanel.getBoundingClientRect();

  window.requestAnimationFrame(() => {
    fundingPanel.style.transition = 'transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1)';
    fundingPanel.style.transform = 'none';
  });

  const finishAnimation = (event) => {
    if (event.propertyName !== 'transform') return;
    fundingPanel.style.transition = '';
    fundingAnimating = false;
    fundingPanel.removeEventListener('transitionend', finishAnimation);
  };
  fundingPanel.addEventListener('transitionend', finishAnimation);
}

function setQrExpanded(expanded) {
  if (!qrPanel || !qrBackdrop) return;
  if (qrAnimating || qrExpanded === expanded) return;

  const firstRect = qrPanel.getBoundingClientRect();

  qrPanel.classList.toggle('is-expanded', expanded);
  qrPanel.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  qrBackdrop.classList.toggle('is-visible', expanded);
  qrExpanded = expanded;

  const lastRect = qrPanel.getBoundingClientRect();
  const dx = firstRect.left - lastRect.left;
  const dy = firstRect.top - lastRect.top;
  const sx = firstRect.width / Math.max(lastRect.width, 1);
  const sy = firstRect.height / Math.max(lastRect.height, 1);

  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(1 - sx) < 0.01 && Math.abs(1 - sy) < 0.01) {
    qrPanel.style.transform = 'none';
    qrAnimating = false;
    return;
  }

  qrAnimating = true;
  qrPanel.style.transition = 'none';
  qrPanel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  // Force layout so the inverted state is committed before animating to natural state.
  qrPanel.getBoundingClientRect();

  window.requestAnimationFrame(() => {
    qrPanel.style.transition = 'transform 360ms cubic-bezier(0.2, 0.8, 0.25, 1)';
    qrPanel.style.transform = 'none';
  });

  const finishAnimation = (event) => {
    if (event.propertyName !== 'transform') return;
    qrPanel.style.transition = '';
    qrAnimating = false;
    qrPanel.removeEventListener('transitionend', finishAnimation);
  };
  qrPanel.addEventListener('transitionend', finishAnimation);
}

function onPointerMove(e) {
  if (!isDragging || e.pointerId !== dragPointerId) return;

  dragCurrentX = e.clientX;
  const deltaX = dragCurrentX - dragStartX;
  queueDragTranslate(dragStartTranslate + deltaX);
}

function onPointerUpOrCancel(e) {
  if (!isDragging || e.pointerId !== dragPointerId) return;
  flushPendingDragTranslate();

  const deltaX = dragCurrentX - dragStartX;
  const absDelta = Math.abs(deltaX);
  const span = Math.max(getSlideSpan(), 1);
  const dynamicTrigger = Math.min(SWIPE_TRIGGER_PX, span * 0.18);
  const isSwipe = absDelta >= dynamicTrigger;
  const movedFromTap = absDelta >= TAP_TOLERANCE_PX;

  isDragging = false;
  dragPointerId = null;
  container.classList.remove('is-dragging');
  setCarouselTransitionEnabled(true);

  if (!isSwipe) {
    updateCarousel({ animate: true });
    return;
  }

  if (movedFromTap) {
    suppressClicksBriefly();
  }

  const stepCount = Math.max(1, Math.min(4, Math.round(absDelta / span)));
  const direction = deltaX < 0 ? 1 : -1;
  changeSlide(direction * stepCount);
}

function restoreCarouselPosition(realIndex) {
  if (realCount < 1) return;
  goToRealIndex(realIndex);
  setCarouselTransitionEnabled(false);
  updateCarousel({ animate: false });
  window.requestAnimationFrame(() => {
    setCarouselTransitionEnabled(true);
  });
}

document.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointermove', onPointerMove, { passive: false });
window.addEventListener('pointerup', onPointerUpOrCancel);
window.addEventListener('pointercancel', onPointerUpOrCancel);

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') changeSlide(1);
  if (e.key === 'ArrowLeft') changeSlide(-1);
});

window.addEventListener('resize', () => {
  updateScreenFitScale();
  if (isDragging) return;
  updateCarousel({ animate: false });
});

updateScreenFitScale();
buildInfiniteTrack();
consumeRestoreIndex();
buildDots();
resetNavigationLock();
prefetchNavigationTargets();

if (pendingRestoreIndex !== null) {
  restoreCarouselPosition(pendingRestoreIndex);
  pendingRestoreIndex = null;
} else {
  updateCarousel({ animate: false });
}

const savedTheme = window.localStorage.getItem('themeMode');
applyTheme(savedTheme === 'bright' ? 'bright' : 'dark');

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextMode = document.body.classList.contains('bright-mode') ? 'dark' : 'bright';
    applyTheme(nextMode);
    window.localStorage.setItem('themeMode', nextMode);
  });
}

if (autoplayToggle) {
  setAutoSwipeUi();
  autoplayToggle.addEventListener('click', () => {
    if (autoSwipeActive) {
      stopAutoSwipe();
      return;
    }
    startAutoSwipe();
  });
}

if (missionCta) {
  missionCta.addEventListener('click', navigateMissionWithTransition);
}

if (fundingPanel && fundingBackdrop) {
  fundingPanel.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!fundingExpanded) {
      setFundingExpanded(true);
    }
  });

  fundingPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setFundingExpanded(!fundingExpanded);
    }
    if (event.key === 'Escape' && fundingExpanded) {
      event.preventDefault();
      setFundingExpanded(false);
    }
  });

  fundingBackdrop.addEventListener('click', () => {
    setFundingExpanded(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && fundingExpanded) {
      setFundingExpanded(false);
    }
  });
}

if (qrPanel && qrBackdrop) {
  qrPanel.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!qrExpanded) {
      setQrExpanded(true);
    }
  });

  qrPanel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setQrExpanded(!qrExpanded);
    }
    if (event.key === 'Escape' && qrExpanded) {
      event.preventDefault();
      setQrExpanded(false);
    }
  });

  qrBackdrop.addEventListener('click', () => {
    setQrExpanded(false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && qrExpanded) {
      setQrExpanded(false);
    }
  });
}

window.addEventListener('pageshow', () => {
  resetNavigationLock();
  consumeRestoreIndex();
  if (pendingRestoreIndex !== null) {
    restoreCarouselPosition(pendingRestoreIndex);
    pendingRestoreIndex = null;
    return;
  }
  updateCarousel({ animate: false });
});
