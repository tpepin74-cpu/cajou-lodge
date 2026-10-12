(() => {
  'use strict';
  document.documentElement.classList.remove('no-js');
  const config = JSON.parse(document.getElementById('site-data').textContent);
  const t = config.messages;
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const format = value => window.CajouTypography?.format(String(value), config.lang) || String(value);
  const replace = (s, values) => format(Object.entries(values).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, String(v)), s));
  const displayKey = 'cajou-display-mode-v1';
  const motionKey = 'cajou-motion-preference-v1';
  const preferenceFallback = 'cajou-preference-fallback-v1:';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const connection = navigator.connection;
  const readPreference = key => {
    try {
      const fallback = sessionStorage.getItem(preferenceFallback + key);
      if (fallback !== null) return fallback === '__unset__' ? null : fallback;
    } catch { /* Local storage may still be available. */ }
    try { return localStorage.getItem(key); } catch { return null; }
  };
  const writePreference = (key, value) => {
    let persisted = false;
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      persisted = true;
    } catch { /* Keep the current tab usable when persistent storage is blocked. */ }
    try {
      if (persisted) sessionStorage.removeItem(preferenceFallback + key);
      else sessionStorage.setItem(preferenceFallback + key, value === null ? '__unset__' : value);
    } catch { /* In-memory choices remain effective for the current page. */ }
  };
  // Pure policy helpers keep a display choice independent from Maps consent.
  const displayPolicy = ({ mode, known, motion, systemReduced, saveData }) => {
    const standard = mode === 'standard';
    const reduced = !standard || motion === 'paused' || (motion !== 'playing' && (systemReduced || saveData));
    return { eco: !standard, reduced, upgradePhotos: standard && !saveData, autoVideo: standard && !reduced && !saveData, manualVideo: standard };
  };
  const resolvePreferenceChoices = ({ mode, maps, mapsChanged, previousMaps }) => ({
    mode: mode === 'standard' ? 'standard' : 'eco',
    maps: maps === 'allowed' && (mapsChanged === true || previousMaps === true),
  });
  const storedDisplayMode = readPreference(displayKey);
  let displayModeKnown = ['eco', 'standard'].includes(storedDisplayMode);
  let displayMode = displayModeKnown ? storedDisplayMode : 'standard';
  const firstVisit = !displayModeKnown;
  const storedMotion = readPreference(motionKey);
  let motionPreference = ['paused', 'playing'].includes(storedMotion) ? storedMotion : null;
  let policy = displayPolicy({ mode: displayMode, known: displayModeKnown, motion: motionPreference, systemReduced: motionQuery.matches, saveData: Boolean(connection?.saveData) });
  let reduced = policy.reduced;
  const motionHandlers = [];
  const displayHandlers = [];
  let syncPreferencesControls = () => {};
  const updateMotion = () => {
    policy = displayPolicy({ mode: displayMode, known: displayModeKnown, motion: motionPreference, systemReduced: motionQuery.matches, saveData: Boolean(connection?.saveData) });
    reduced = policy.reduced;
    document.documentElement.classList.toggle('reduce-motion', reduced);
    document.documentElement.classList.toggle('eco-mode', policy.eco);
    document.documentElement.dataset.displayMode = displayMode;
    $$('[data-motion-toggle]').forEach(button => {
      button.hidden = false;
      button.textContent = format(reduced ? config.motionLabels.play : config.motionLabels.pause);
      button.setAttribute('aria-pressed', String(!reduced));
    });
    motionHandlers.forEach(handler => handler());
    displayHandlers.forEach(handler => handler());
    syncPreferencesControls();
  };
  const chooseDisplayMode = (mode, explicitMotion = null) => {
    const previous = displayMode;
    displayMode = mode === 'standard' ? 'standard' : 'eco';
    displayModeKnown = true;
    writePreference(displayKey, displayMode);
    if (displayMode === 'eco') motionPreference = 'paused';
    else if (explicitMotion === 'playing') motionPreference = 'playing';
    else if (previous !== 'standard') motionPreference = null;
    writePreference(motionKey, motionPreference);
    updateMotion();
  };
  $$('[data-motion-toggle]').forEach(button => button.addEventListener('click', () => {
    if (policy.eco) chooseDisplayMode('standard', 'playing');
    else {
      motionPreference = reduced ? 'playing' : 'paused';
      writePreference(motionKey, motionPreference);
      updateMotion();
    }
  }));
  motionQuery.addEventListener?.('change', updateMotion);
  connection?.addEventListener?.('change', updateMotion);
  updateMotion();

  // The visible preview is part of the HTML. Replace it only after the larger
  // version has loaded and the current display policy still permits it. Initial
  // visitors and the lighter mode never request automatic photo upgrades.
  const pageImages = $$('img[data-image-src]');
  const imageStates = new Map(pageImages.map(element => [element, { near: element.loading === 'eager', requested: false, full: null }]));
  const upgradeImage = element => {
    const state = imageStates.get(element);
    if (!state || !policy.upgradePhotos) return;
    if (state.full) {
      if (element.isConnected && element.src !== state.full) element.src = state.full;
      return;
    }
    if (state.requested) return;
    state.requested = true;
    element.dataset.imageRequested = 'true';
    const full = new Image();
    full.decoding = 'async';
    full.onload = () => {
      state.full = full.src;
      if (element.isConnected && policy.upgradePhotos) element.src = full.src;
    };
    full.onerror = () => { state.requested = false; delete element.dataset.imageRequested; };
    full.src = element.dataset.imageSrc;
  };
  const refreshImages = () => {
    if (policy.upgradePhotos) imageStates.forEach((state, element) => { if (state.near) upgradeImage(element); });
  };
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const state = imageStates.get(entry.target);
        state.near = entry.isIntersecting;
        if (state.near) upgradeImage(entry.target);
      });
    }, { rootMargin: '350px 0px', threshold: 0 });
    pageImages.forEach(img => {
      if (img.loading === 'eager') upgradeImage(img);
      imageObserver.observe(img);
    });
  } else imageStates.forEach(state => { state.near = true; });
  displayHandlers.push(refreshImages);
  refreshImages();
  const header = $('.site-header');
  let scheduled = false;
  const updateHeader = () => { header?.classList.toggle('is-scrolled', window.scrollY > 20); scheduled = false; };
  addEventListener('scroll', () => { if (!scheduled) { requestAnimationFrame(updateHeader); scheduled = true; } }, { passive: true });
  updateHeader();
  $$('[data-year]').forEach(el => { el.textContent = new Date().getFullYear(); });

  if ('IntersectionObserver' in window) {
    const reveal = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); reveal.unobserve(e.target); } });
    }, { threshold: .07, rootMargin: '0px 0px 35px 0px' });
    $$('.reveal').forEach(el => reveal.observe(el));
    document.documentElement.classList.add('motion-ready');
  }

  const navDialog = $('#nav-dialog');
  const preferencesDialog = $('#preferences-dialog');
  const openers = new WeakMap();
  const syncDialogState = () => document.documentElement.classList.toggle('dialog-open', Boolean($('dialog[open]')));
  const selectNavPhoto = token => $$('[data-nav-photo]').forEach(photo => photo.classList.toggle('is-active', photo.dataset.navPhoto === token));
  const openDialog = (dialog, opener) => {
    if (!dialog || dialog.open) return;
    if (opener) openers.set(dialog, opener);
    dialog.classList.remove('is-closing');
    dialog.showModal();
    syncDialogState();
    if (dialog === preferencesDialog) {
      $$('[data-manage-cookies],[data-open-preferences]').forEach(button => button.setAttribute('aria-expanded', 'true'));
      $('[data-preferences-heading]', dialog)?.focus({ preventScroll: true });
      motionHandlers.forEach(handler => handler());
    }
    if (dialog === navDialog) {
      $$('[data-open-dialog="nav-dialog"]').forEach(button => button.setAttribute('aria-expanded', 'true'));
      $$('img', dialog).forEach(img => { img.loading = 'eager'; });
      selectNavPhoto($('[data-nav-choice][aria-current="page"]')?.dataset.navChoice || 'home');
      $('[data-close-dialog]', dialog)?.focus({ preventScroll: true });
      requestAnimationFrame(() => requestAnimationFrame(() => { if (dialog.open) dialog.classList.add('is-open'); }));
    }
  };
  const closeDialog = dialog => {
    if (!dialog?.open || dialog.classList.contains('is-closing')) return;
    if (dialog === navDialog && !reduced) {
      dialog.classList.add('is-closing');
      dialog.classList.remove('is-open');
      setTimeout(() => { if (dialog.open) dialog.close(); }, 430);
    } else dialog.close();
  };
  $$('[data-open-dialog]').forEach(button => button.addEventListener('click', () => openDialog(document.getElementById(button.dataset.openDialog), button)));
  $$('[data-close-dialog]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', e => { e.preventDefault(); closeDialog(dialog); });
    dialog.addEventListener('close', () => {
      dialog.classList.remove('is-open', 'is-closing');
      if (dialog === navDialog) $$('[data-open-dialog="nav-dialog"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      if (dialog === preferencesDialog) {
        commitPreferences();
        $$('[data-manage-cookies],[data-open-preferences]').forEach(button => button.setAttribute('aria-expanded', 'false'));
      }
      syncDialogState();
      const opener = openers.get(dialog);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(dialog);
    });
  });
  $$('[data-nav-choice]').forEach(link => {
    link.addEventListener('pointerenter', () => selectNavPhoto(link.dataset.navChoice));
    link.addEventListener('focus', () => selectNavPhoto(link.dataset.navChoice));
    link.addEventListener('click', () => { if (navDialog.open) navDialog.close(); });
  });

  const staySteps = $$('[data-stay-step]');
  if (staySteps.length && 'IntersectionObserver' in window) {
    let sceneObserver;
    const updateScene = entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      if (!visible.length) return;
      const step = visible.reduce((best, entry) => Math.abs(entry.boundingClientRect.top + entry.boundingClientRect.height / 2 - innerHeight / 2) < Math.abs(best.boundingClientRect.top + best.boundingClientRect.height / 2 - innerHeight / 2) ? entry : best).target;
      const index = step.dataset.stayStep;
      $$('[data-stay-scene]').forEach(scene => {
        const active = scene.dataset.stayScene === index;
        scene.classList.toggle('is-active', active);
        scene.setAttribute('aria-hidden', String(!active));
      });
      const count = $('[data-stay-count]');
      if (count) count.textContent = String(Number(index) + 1).padStart(2, '0');
    };
    const observeScenes = () => {
      sceneObserver?.disconnect();
      // IntersectionObserver percentages use the root width, so this vertical band uses pixels.
      const inset = Math.round(innerHeight * .42);
      sceneObserver = new IntersectionObserver(updateScene, { threshold: 0, rootMargin: `-${inset}px 0px -${inset}px 0px` });
      staySteps.forEach(step => sceneObserver.observe(step));
    };
    let sceneResizeFrame = 0;
    addEventListener('resize', () => { cancelAnimationFrame(sceneResizeFrame); sceneResizeFrame = requestAnimationFrame(observeScenes); }, { passive: true });
    observeScenes();
  }

  const heroVideo = $('[data-hero-video]');
  if (heroVideo) {
    const control = $('[data-video-toggle]');
    const hero = heroVideo.closest('.home-hero') || heroVideo;
    const initiallyVisible = () => { const r = hero.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
    let heroVisible = initiallyVisible();
    let userPaused = false;
    let manuallyStarted = false;
    let sourceLoaded = false;
    let videoFailed = false;
    let playRequest = null;
    heroVideo.muted = true;
    heroVideo.defaultMuted = true;
    heroVideo.playsInline = true;
    heroVideo.setAttribute('muted', '');
    heroVideo.setAttribute('playsinline', '');
    heroVideo.setAttribute('webkit-playsinline', '');
    const paintVideoControl = () => {
      if (!control) return;
      const playing = !heroVideo.paused && !heroVideo.ended && !videoFailed;
      control.hidden = policy.eco;
      control.classList.toggle('is-paused', !playing);
      const label = format(playing ? config.videoLabels.pause : config.videoLabels.play);
      control.setAttribute('aria-label', label);
      control.title = label;
      const pauseIcon = $('[data-video-pause]', control);
      const playIcon = $('[data-video-play]', control);
      if (pauseIcon) pauseIcon.hidden = !playing;
      if (playIcon) playIcon.hidden = playing;
      const text = $('[data-video-label]', control);
      if (text) text.textContent = label;
    };
    const canPlay = () => policy.manualVideo && displayModeKnown && !preferencesDialog?.open && heroVisible && !document.hidden && !userPaused && (manuallyStarted || policy.autoVideo);
    const ensureSource = () => {
      if (sourceLoaded) return;
      $$('source[data-src]', heroVideo).forEach(source => { source.src = source.dataset.src; });
      heroVideo.muted = true;
      heroVideo.preload = 'auto';
      sourceLoaded = true;
      videoFailed = false;
      heroVideo.load();
    };
    const playVideo = () => {
      if (!canPlay() || playRequest) return;
      if (videoFailed) sourceLoaded = false;
      ensureSource();
      heroVideo.muted = true;
      const request = heroVideo.play();
      if (request && typeof request.then === 'function') {
        playRequest = request;
        request.then(() => {
          heroVideo.dataset.playbackState = 'playing';
          if (!canPlay()) heroVideo.pause();
        }).catch(() => {
          // Browser policy or an interrupted load: keep a genuine play control.
          heroVideo.dataset.playbackState = 'awaiting-interaction';
        }).finally(() => { playRequest = null; paintVideoControl(); });
      }
      paintVideoControl();
    };
    const syncVideo = () => {
      if (canPlay()) playVideo();
      else heroVideo.pause();
      paintVideoControl();
    };
    control?.addEventListener('click', () => {
      if (heroVideo.paused || videoFailed) { userPaused = false; manuallyStarted = true; playVideo(); }
      else { userPaused = true; heroVideo.pause(); }
      paintVideoControl();
    });
    heroVideo.addEventListener('playing', () => {
      videoFailed = false;
      heroVideo.classList.add('is-playing');
      if (!canPlay()) heroVideo.pause();
      paintVideoControl();
    });
    heroVideo.addEventListener('pause', paintVideoControl);
    heroVideo.addEventListener('canplay', () => { if (canPlay() && heroVideo.paused) playVideo(); });
    heroVideo.addEventListener('error', () => {
      videoFailed = true;
      heroVideo.dataset.playbackState = 'error';
      heroVideo.classList.remove('is-playing');
      paintVideoControl();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { heroVisible = entries[0].isIntersecting; syncVideo(); }, { threshold: 0.08 }).observe(hero);
    }
    // Limited, event-driven retries; no polling and no bypass of an explicit pause.
    document.addEventListener('pointerup', () => { if (canPlay() && heroVideo.paused && !videoFailed) playVideo(); }, { passive: true });
    document.addEventListener('visibilitychange', syncVideo);
    addEventListener('pageshow', () => { heroVisible = initiallyVisible(); syncVideo(); });
    motionHandlers.push(() => {
      if (reduced) manuallyStarted = false;
      if (policy.eco) { heroVideo.classList.remove('is-playing'); userPaused = false; }
      syncVideo();
    });
    syncVideo();
  }

  let lottieReaderPromise = null;
  const loadLottieReader = () => {
    if (window.lottie) return Promise.resolve(window.lottie);
    if (lottieReaderPromise) return lottieReaderPromise;
    lottieReaderPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = window.CajouPaths.asset('lottie-light.min.js');
      script.async = true;
      script.dataset.localLottieReader = 'true';
      script.onload = () => window.lottie ? resolve(window.lottie) : reject(new Error('Local animation reader unavailable'));
      script.onerror = () => { script.remove(); reject(new Error('Local animation reader unavailable')); };
      document.head.append(script);
    }).catch(error => { lottieReaderPromise = null; throw error; });
    return lottieReaderPromise;
  };
  const ambientPlayers = $$('[data-lottie]').map(container => ({ container, host: container.closest('[data-lottie-host],.ambient-mark') || container, animation: null, near: false, loaded: false, preparing: false }));
  const syncAmbient = player => {
    if (!player.loaded) return;
    if (player.near && !reduced && !document.hidden) player.animation.play();
    else player.animation.pause();
  };
  const prepareAmbient = async player => {
    if (player.animation || player.preparing || reduced || !player.near) return;
    player.preparing = true;
    try {
      const reader = await loadLottieReader();
      // A choice can change while the local script is loading. Recheck it before
      // requesting animation JSON or creating a running player.
      if (reduced || !player.near || document.hidden) return;
      const path = player.container.dataset.lottie;
      const file = path.split('/').pop().split('?')[0];
      const animationData = window.CajouLottieData?.[file];
      if (!animationData) return;
      player.animation = reader.loadAnimation({ container: player.container, renderer: 'svg', loop: true, autoplay: false, animationData: JSON.parse(JSON.stringify(animationData)), rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true } });
      player.animation.addEventListener('DOMLoaded', () => {
        player.loaded = true;
        player.host.classList.add('is-loaded');
        const svg = $('svg', player.container);
        svg?.setAttribute('aria-hidden', 'true');
        svg?.setAttribute('focusable', 'false');
        syncAmbient(player);
      });
      player.animation.addEventListener('data_failed', () => { player.host.classList.remove('is-loaded'); });
    } catch { /* The matching local SVG stays visible if the reader fails. */ }
    finally { player.preparing = false; }
  };
  if (ambientPlayers.length) {
    if ('IntersectionObserver' in window) {
      const ambientObserver = new IntersectionObserver(entries => entries.forEach(entry => {
        const player = ambientPlayers.find(item => item.container === entry.target);
        player.near = entry.isIntersecting;
        if (player.near) prepareAmbient(player);
        syncAmbient(player);
      }), { rootMargin: '120px 0px' });
      ambientPlayers.forEach(player => ambientObserver.observe(player.container));
    } else ambientPlayers.forEach(player => { player.near = Boolean(player.container.getClientRects().length); prepareAmbient(player); });
    document.addEventListener('visibilitychange', () => ambientPlayers.forEach(player => { if (!document.hidden && player.near) prepareAmbient(player); syncAmbient(player); }));
    motionHandlers.push(() => ambientPlayers.forEach(player => {
      if (!('IntersectionObserver' in window)) player.near = Boolean(player.container.getClientRects().length);
      if (player.near) prepareAmbient(player);
      syncAmbient(player);
    }));
  }

  const tabs = $$('[data-rate-tab]');
  const activateTab = button => {
    tabs.forEach(tab => { const active = tab === button; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; });
    $$('[data-rate-panel]').forEach(panel => { panel.hidden = panel.id !== button.getAttribute('aria-controls'); });
  };
  tabs.forEach((button, i) => {
    button.addEventListener('click', () => activateTab(button));
    button.addEventListener('keydown', e => {
      let target;
      if (e.key === 'ArrowRight') target = tabs[(i + 1) % tabs.length];
      if (e.key === 'ArrowLeft') target = tabs[(i + tabs.length - 1) % tabs.length];
      if (e.key === 'Home') target = tabs[0];
      if (e.key === 'End') target = tabs[tabs.length - 1];
      if (target) { e.preventDefault(); activateTab(target); target.focus(); }
    });
  });

  const filterButtons = $$('[data-filter]');
  filterButtons.forEach(button => button.addEventListener('click', () => {
    const category = button.dataset.filter;
    filterButtons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    let count = 0;
    $$('[data-category]').forEach(card => { const visible = category === 'all' || card.dataset.category.split(' ').includes(category); card.hidden = !visible; if (visible) count++; });
    const status = $('#filter-status');
    if (status) status.textContent = replace(t.filterResult, { count });
  }));

  const photoCards = $$('[data-photo-card]');
  const photoFilters = $$('[data-photo-filter]');
  let photoCategory = 'all';
  const matchingPhotos = () => photoCards.filter(card => photoCategory === 'all' || card.dataset.photoCategory === photoCategory);
  const renderPhotos = () => {
    const matches = matchingPhotos();
    const visible = new Set(matches);
    photoCards.forEach(card => { card.hidden = !visible.has(card); });
    photoFilters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.photoFilter === photoCategory)));
    const status = $('#photo-status');
    if (status) status.textContent = replace(config.galleryLabels.status, { shown: visible.size });
  };
  photoFilters.forEach(button => button.addEventListener('click', () => { photoCategory = button.dataset.photoFilter; renderPhotos(); }));
  if (photoCards.length) renderPhotos();

  const gallery = $$('[data-gallery-src]');
  const galleryDialog = $('#gallery-dialog');
  let activeGallery = gallery;
  let galleryIndex = 0;
  let galleryImageRequest = 0;
  const showGalleryImage = index => {
    if (!activeGallery.length) return;
    galleryIndex = (index + activeGallery.length) % activeGallery.length;
    const button = activeGallery[galleryIndex];
    const img = $('#gallery-image');
    const request = ++galleryImageRequest;
    const preview = $('img', button);
    if (preview) img.src = preview.currentSrc || preview.src;
    const full = new Image();
    full.decoding = 'async';
    full.onload = () => { if (request === galleryImageRequest) img.src = full.src; };
    full.src = button.dataset.gallerySrc;
    img.alt = format(button.dataset.galleryAlt);
    $('#gallery-caption').textContent = format(button.dataset.galleryAlt);
    $('#gallery-count').textContent = replace(t.imageOf, { current: galleryIndex + 1, total: activeGallery.length });
  };
  gallery.forEach(button => button.addEventListener('click', () => {
    const group = button.dataset.galleryGroup || 'page';
    activeGallery = group === 'collection' ? matchingPhotos().map(card => $('[data-gallery-src]', card)) : gallery.filter(item => (item.dataset.galleryGroup || 'page') === group);
    showGalleryImage(activeGallery.indexOf(button));
    openDialog(galleryDialog, button);
  }));
  $('#gallery-prev')?.addEventListener('click', () => showGalleryImage(galleryIndex - 1));
  $('#gallery-next')?.addEventListener('click', () => showGalleryImage(galleryIndex + 1));
  galleryDialog?.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { e.preventDefault(); showGalleryImage(galleryIndex - 1); } if (e.key === 'ArrowRight') { e.preventDefault(); showGalleryImage(galleryIndex + 1); } });
  let touchStart = null;
  $('#gallery-image')?.addEventListener('touchstart', e => { touchStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null; }, { passive: true });
  $('#gallery-image')?.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
  $('#gallery-image')?.addEventListener('touchend', e => {
    if (!touchStart || !e.changedTouches.length || e.touches.length) { touchStart = null; return; }
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) showGalleryImage(galleryIndex + (dx < 0 ? 1 : -1));
    touchStart = null;
  }, { passive: true });

  const consentKey = 'cajou-external-content-consent-v1';
  let externalConsent = readPreference(consentKey) === 'allowed';
  const preferencesForm = $('#preferences-form');
  let mapsChoiceChanged = false;
  syncPreferencesControls = (force = false) => {
    if (!preferencesForm || (preferencesDialog.open && !force)) return;
    $$('input[name=displayMode]', preferencesForm).forEach(field => { field.checked = field.value === displayMode; });
    $$('input[name=mapsConsent]', preferencesForm).forEach(field => { field.checked = field.value === (externalConsent ? 'allowed' : 'refused'); });
    mapsChoiceChanged = false;
  };
  const setConsent = allow => {
    externalConsent = allow === true;
    writePreference(consentKey, externalConsent ? 'allowed' : 'refused');
    if (!allow) $$('[data-map-container]').forEach(container => {
      $$('iframe', container).forEach(frame => frame.remove());
      const fallback = $('.map-content', container);
      if (fallback) fallback.hidden = false;
    });
    syncPreferencesControls();
  };
  const commitPreferences = () => {
    if (!preferencesForm) return;
    const choices = resolvePreferenceChoices({
      mode: $('input[name=displayMode]:checked', preferencesForm)?.value,
      maps: $('input[name=mapsConsent]:checked', preferencesForm)?.value,
      mapsChanged: mapsChoiceChanged,
      previousMaps: externalConsent,
    });
    // No mode choice, save action, Escape or close button can invent Maps consent.
    // A newly allowed value requires the visitor's explicit Maps radio choice.
    setConsent(choices.maps);
    chooseDisplayMode(choices.mode);
  };
  const openPreferences = opener => {
    if (!preferencesDialog) return;
    syncPreferencesControls(true);
    openDialog(preferencesDialog, opener);
  };
  if (preferencesForm) {
    $$('input[name=mapsConsent]', preferencesForm).forEach(field => field.addEventListener('change', () => { mapsChoiceChanged = true; }));
    preferencesForm.addEventListener('submit', event => { event.preventDefault(); closeDialog(preferencesDialog); });
    syncPreferencesControls();
  }
  $$('[data-manage-cookies],[data-open-preferences]').forEach(button => {
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'preferences-dialog');
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => openPreferences(button));
  });
  // A fresh visit recommends immersive mode. Maps consent is always separate.
  // Previously stored display and accessibility choices remain respected.
  if (firstVisit && preferencesDialog) requestAnimationFrame(() => {
    if (!displayModeKnown && !$('dialog[open]')) openPreferences();
  });
  // Even previously authorised maps load only after an explicit map-button click.
  $$('[data-load-map]').forEach(button => button.addEventListener('click', () => {
    if (!externalConsent) setConsent(true);
    const container = button.closest('[data-map-container]');
    if ($('iframe', container)) return;
    const frame = document.createElement('iframe');
    frame.title = format(t.mapTitle); frame.loading = 'lazy'; frame.referrerPolicy = 'no-referrer-when-downgrade';
    frame.src = `https://maps.google.com/maps?q=11.30136,-15.83169&z=14&output=embed&hl=${config.lang}`;
    $('.map-content', container).hidden = true; container.append(frame);
  }));

  if ('IntersectionObserver' in window && $('.contents-nav')) {
    let contentsObserver;
    const observeContents = () => {
      contentsObserver?.disconnect();
      contentsObserver = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { $$('.contents-nav a').forEach(a => a.classList.toggle('is-active', a.hash === '#' + e.target.id)); } });
      }, { rootMargin: `-110px 0px -${Math.round(innerHeight * .60)}px 0px`, threshold: 0 });
      $$('.practical-section').forEach(section => contentsObserver.observe(section));
    };
    let contentsResizeFrame = 0;
    addEventListener('resize', () => { cancelAnimationFrame(contentsResizeFrame); contentsResizeFrame = requestAnimationFrame(observeContents); }, { passive: true });
    observeContents();
  }

  const form = $('#quote-form');
  if (!form) return;
  let step = 0;
  let requestText = '';
  let requestData = null;
  const steps = $$('[data-form-step]', form);
  const indicators = $$('[data-step-indicator]', form);
  const input = name => form.elements.namedItem(name);
  const now = new Date();
  const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  input('arrival').min = localToday;
  input('departure').min = localToday;
  input('preferredLanguage').value = config.lang;
  const params = new URLSearchParams(location.search);
  // Only a visitor-selected handoff can prefill the enquiry. The small fragment
  // is a fallback for browsers that block sessionStorage; no draft goes to a server.
  const readAdvisorDraft = () => {
    if (params.get('source') !== 'conseiller') return null;
    let draft = null;
    const hash = location.hash;
    if (hash.startsWith('#conseiller=') && hash.length < 24000) {
      try { draft = JSON.parse(decodeURIComponent(hash.slice('#conseiller='.length))); } catch { /* Invalid fragments are ignored. */ }
    }
    if (!draft) {
      try { const saved = sessionStorage.getItem('cajou-advisor-enquiry-v1'); if (saved && saved.length < 16000) draft = JSON.parse(saved); } catch { /* A local draft is optional. */ }
    }
    try { sessionStorage.removeItem('cajou-advisor-enquiry-v1'); } catch { /* Storage can be unavailable. */ }
    if (!draft || draft.version !== 1 || draft.locale !== config.lang || typeof draft.summary !== 'string' || draft.summary.length > 2200 || !Number.isFinite(draft.createdAt) || Math.abs(Date.now() - draft.createdAt) > 86400000) draft = null;
    if (hash.startsWith('#conseiller=')) {
      try { history.replaceState(history.state, '', location.pathname + location.search + '#quote-form'); } catch { /* The form is usable without history access. */ }
    }
    return draft;
  };
  const advisorDraft = readAdvisorDraft();
  const applyAdvisorDraft = draft => {
    if (!draft) return false;
    if (Number.isInteger(draft.adults) && draft.adults >= 1 && draft.adults <= 30) input('adults').value = String(draft.adults);
    if (Number.isInteger(draft.children) && draft.children >= 0 && draft.children <= 30) input('children').value = String(draft.children);
    if (Array.isArray(draft.interests)) {
      $$('input[name=interests]', form).forEach(field => { field.checked = draft.interests.includes(field.value); });
    }
    if (['single', 'double', 'triple'].includes(draft.room)) params.set('room', draft.room);
    input('special').value = draft.summary.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    const notice = $('.advisor-prefill-note', form) || document.createElement('p');
    notice.className = 'advisor-prefill-note form-helper';
    notice.textContent = format(config.advisorPrefill);
    notice.setAttribute('role', 'status');
    form.prepend(notice);
    input('children').dispatchEvent(new Event('change'));
    return true;
  };
  applyAdvisorDraft(advisorDraft);
  if (params.has('experience')) {
    const experience = params.get('experience');
    const value = ['fishing'].includes(experience) ? 'fishing' : ['orango', 'poilao'].includes(experience) ? 'nature' : ['rubane', 'bolama', 'bubaque'].includes(experience) ? 'culture' : null;
    const field = value && $(`input[name=interests][value=${value}]`, form);
    if (field) field.checked = true;
  }
  const setFieldError = (field, message = '') => {
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    const error = document.getElementById(`${field.id}-error`);
    if (error) error.textContent = message;
  };
  const validateField = field => {
    if (field.disabled || field.type === 'hidden') return true;
    let error = '';
    const value = field.value.trim();
    if (field.required && (!value || (field.type === 'checkbox' && !field.checked))) error = field.type === 'checkbox' ? t.consentError : t.requiredError;
    else if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = t.emailError;
    else if (field.name === 'whatsapp' && value && !/^\+?[\d\s().-]{7,25}$/.test(value)) error = t.phoneError;
    else if (field.type === 'number' && value && (!Number.isFinite(Number(value)) || !Number.isInteger(Number(value)) || (field.min && Number(value) < Number(field.min)) || (field.max && Number(value) > Number(field.max)))) error = field.name.startsWith('childAge') ? t.ageError : t.numberError;
    else if (field.type === 'date' && value && value < localToday) error = t.pastDateError;
    else if (field.name === 'departure' && value && input('arrival').value && value <= input('arrival').value) error = t.dateError;
    setFieldError(field, error);
    return !error;
  };
  const validateStep = () => {
    let firstInvalid;
    $$('input,select,textarea', steps[step]).forEach(field => { if (!validateField(field) && !firstInvalid) firstInvalid = field; });
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  };
  form.addEventListener('input', e => { if (e.target.matches('input,select,textarea') && e.target.getAttribute('aria-invalid') === 'true') validateField(e.target); });
  input('arrival').addEventListener('change', () => {
    const value = input('arrival').value;
    if (value) { const d = new Date(value + 'T12:00:00'); d.setDate(d.getDate() + 1); input('departure').min = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  });
  const updateAges = () => {
    const count = Math.max(0, Math.min(30, Number(input('children').value) || 0));
    const container = $('#children-ages');
    const existing = $$('input', container).map(e => e.value);
    container.replaceChildren();
    for (let i = 0; i < count; i++) {
      const field = document.createElement('div'); field.className = 'field';
      const label = document.createElement('label'); label.htmlFor = `child-age-${i}`; label.textContent = format(`${t.childAge} ${i + 1}\u00a0*`);
      const age = document.createElement('input'); age.id = label.htmlFor; age.name = `childAge${i + 1}`; age.type = 'number'; age.min = '0'; age.max = '17'; age.required = true; age.inputMode = 'numeric'; age.value = existing[i] || ''; age.setAttribute('aria-describedby', `${age.id}-error`);
      const error = document.createElement('span'); error.id = `${age.id}-error`; error.className = 'field-error';
      field.append(label, age, error); container.append(field);
    }
    container.hidden = !count;
  };
  input('children').addEventListener('change', updateAges);
  const showStep = (index, focus = true) => {
    step = index;
    steps.forEach((section, i) => { section.hidden = i !== step; });
    indicators.forEach((el, i) => { el.classList.toggle('is-active', i === step); el.classList.toggle('is-complete', i < step); if (i === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
    $('#form-back').hidden = step === 0;
    $('#form-next').hidden = step === 3;
    $('#form-controls').hidden = step === 3;
    $('#form-next-label').textContent = step === 2 ? config.requestQuote : t.next;
    if (focus) { $('h2', steps[step]).focus({ preventScroll: true }); form.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'start' }); }
  };
  const readableDate = value => new Intl.DateTimeFormat(config.lang === 'pt' ? 'pt-PT' : config.lang, { dateStyle: 'long' }).format(new Date(value + 'T12:00:00'));
  const prepareRequest = () => {
    $('#review-title').textContent = t.readyTitle;
    $('#delivery-note').textContent = t.readyText;
    $('#request-status').textContent = '';
    const data = new FormData(form);
    const interests = data.getAll('interests');
    const interestNames = ['nature', 'culture', 'fishing', 'relax'];
    const ages = Array.from({ length: Number(data.get('children')) || 0 }, (_, i) => data.get(`childAge${i + 1}`));
    const reference = `CAJ-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    requestData = { reference, locale: config.lang, arrival: data.get('arrival'), departure: data.get('departure'), flights: data.get('flights'), adults: Number(data.get('adults')), children: Number(data.get('children')) || 0, childAges: ages.map(Number), meal: data.get('meal'), interests, special: data.get('special'), name: data.get('name'), email: data.get('email'), whatsapp: data.get('whatsapp'), preferredLanguage: data.get('preferredLanguage'), roomPreference: params.get('room') || null, privacyAcknowledged: true };
    const mealLabel = input('meal').selectedOptions[0].textContent;
    const lines = [
      t.requestHeading, '',
      `${t.reference} : ${reference}`,
      `${t.arrivalSummary} : ${readableDate(data.get('arrival'))}`,
      `${t.departureSummary} : ${readableDate(data.get('departure'))}`,
      `${t.adults} : ${data.get('adults')}`,
      `${t.children} : ${data.get('children') || 0}${ages.length ? ` (${ages.join(', ')})` : ''}`,
      `${t.flights} : ${data.get('flights') || t.none}`,
      `${t.mealSummary} : ${mealLabel}`,
      `${t.wishesSummary} : ${interests.map(x => t.interestLabels[interestNames.indexOf(x)]).join(', ') || t.none}`,
      `${t.specialSummary} : ${data.get('special') || t.none}`, '',
      `${t.name} : ${data.get('name')}`,
      `${t.email} : ${data.get('email')}`,
      `${t.whatsapp} : ${data.get('whatsapp')}`,
      `${t.preferredLanguage} : ${data.get('preferredLanguage').toUpperCase()}`
    ];
    if (params.has('room') && config.roomLabels[params.get('room')]) lines.splice(7, 0, `${config.roomLabel} : ${config.roomLabels[params.get('room')]}`);
    requestText = lines.join('\n');
    $('#request-summary').textContent = format(requestText);
    $('#send-guinea').href = `https://wa.me/245966333329?text=${encodeURIComponent(requestText)}`;
    $('#send-france').href = `https://wa.me/33603888193?text=${encodeURIComponent(requestText)}`;
    $('#send-email').href = `mailto:contact@cajou-lodge.com?subject=${encodeURIComponent(t.requestSubject)}&body=${encodeURIComponent(requestText)}`;
  };
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateStep()) return;
    if (step < 2) { showStep(step + 1); return; }
    prepareRequest(); showStep(3);
    if (!config.formEndpoint) return;
    const status = $('#request-status');
    status.textContent = t.sending;
    try {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(config.formEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestData), signal: controller.signal });
      clearTimeout(timeout);
      const body = await response.json();
      if (!response.ok || body.delivered !== true) throw new Error('Delivery not confirmed');
      $('#review-title').textContent = t.sentTitle; $('#delivery-note').textContent = t.sentText; status.textContent = '';
    } catch { status.textContent = t.sendError; }
  });
  $('#form-back').addEventListener('click', () => showStep(Math.max(0, step - 1)));
  $('#edit-request').addEventListener('click', () => { $('#request-status').textContent = ''; showStep(0); });
  $('#copy-request').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(requestText); $('#request-status').textContent = t.copied; }
    catch { const range = document.createRange(); range.selectNodeContents($('#request-summary')); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); $('#request-summary').focus(); }
  });
  updateAges(); showStep(0, false);
  if (advisorDraft) requestAnimationFrame(() => showStep(0));
  addEventListener('hashchange', () => {
    if (!location.hash.startsWith('#conseiller=')) return;
    const updated = readAdvisorDraft();
    if (!applyAdvisorDraft(updated)) return;
    const advisorDialog = document.getElementById('cajou-advisor');
    if (advisorDialog?.open) advisorDialog.close();
    requestAnimationFrame(() => showStep(0));
  });
})();
