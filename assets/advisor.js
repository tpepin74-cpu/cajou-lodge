/* Cajou Lodge — a private, browser-local conversation with the site's guide.
   Content, branching and restored-state validation belong to advisor-engine.js. */
(() => {
  'use strict';

  const init = () => {
    const source = document.getElementById('advisor-data');
    if (!source || document.getElementById('cajou-advisor')) return;
    let data;
    try { data = JSON.parse(source.textContent); } catch { return; }
    if (!data || !data.ui || !['fr', 'en', 'pt'].includes(data.lang)) return;

    const ui = data.ui;
    const storageKey = `cajou-advisor-session-v1-${data.lang}`;
    const enquiryKey = 'cajou-advisor-enquiry-v1';
    const storageLimit = 40000;
    const svgNS = 'http://www.w3.org/2000/svg';
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const text = (value, limit = 4000) => {
      const safe = typeof value === 'string' ? value.slice(0, limit) : '';
      return window.CajouTypography ? window.CajouTypography.format(safe, data.lang) : safe;
    };
    const reducedMotion = () => motionQuery.matches || document.documentElement.classList.contains('reduce-motion');

    const element = (tag, className, value) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = text(value);
      return node;
    };
    const icon = name => {
      const paths = {
        close: ['M6 6l12 12M18 6L6 18'],
        back: ['M19 12H5m6-6-6 6 6 6'],
        restart: ['M5 8a8 8 0 1 1-1 8M5 3v5h5'],
        arrow: ['M5 12h14m-6-6 6 6-6 6'],
        send: ['m5 11 14-7-5 16-3-7-6-2Z', 'm11 13 8-9'],
        cashew: ['M16.9 3.8c-4.3-2.1-10-.3-12 4.2-2.4 5.4.8 11.8 6.4 12.5 3.2.4 5.7-1.3 5.3-3.6-.3-1.9-2.2-2.1-3.7-2.7-2.1-.8-2.2-2.8-.8-4.3 1.3-1.4 4-1.3 5.3-2.6 1.2-1.3 1-2.7-.5-3.5Z', 'M9 7c-3 3.2-2.4 7.5.8 9.8'],
      };
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.4');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.classList.add('advisor-icon');
      (paths[name] || paths.arrow).forEach(path => {
        const shape = document.createElementNS(svgNS, 'path');
        shape.setAttribute('d', path);
        svg.append(shape);
      });
      return svg;
    };
    const button = (className, label, iconName, iconOnly = false) => {
      const node = element('button', className);
      node.type = 'button';
      if (iconName) node.append(icon(iconName));
      if (iconOnly) {
        node.setAttribute('aria-label', text(label, 240));
        node.title = text(label, 240);
      } else node.append(element('span', '', label));
      return node;
    };

    // Only published site routes and the two approved WhatsApp contacts may
    // become links. Parsing also rejects deceptive hostnames and path traversal.
    const safeHref = (value, whatsappOnly = false) => {
      if (typeof value !== 'string' || value.length > 10000 || /[\u0000-\u0020\\]/.test(value)) return null;
      try {
        const url = new URL(value, window.location.origin);
        if (!whatsappOnly && /^\/(?:cajou-lodge\/)?(fr|en|pt)\//.test(value) && url.origin === window.location.origin && /^\/(?:cajou-lodge\/)?(fr|en|pt)\//.test(url.pathname)) {
          return `${url.pathname}${url.search}${url.hash}`;
        }
        if (url.origin === 'https://wa.me' && !url.username && !url.password && /^\/(245966333329|33603888193)$/.test(url.pathname) && !url.hash && [...url.searchParams.keys()].every(key => key === 'text')) {
          return url.href;
        }
      } catch { /* A malformed destination is rendered as text, never as a link. */ }
      return null;
    };
    const store = (key, value, limit = storageLimit) => {
      try {
        const serialized = JSON.stringify(value);
        if (serialized && serialized.length <= limit) sessionStorage.setItem(key, serialized);
        else sessionStorage.removeItem(key);
      } catch { /* The guide also works when browser storage is disabled. */ }
    };
    const readState = () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        return raw && raw.length <= storageLimit ? JSON.parse(raw) : undefined;
      } catch { return undefined; }
    };

    let engine = null;
    let restored = readState();
    let initialError = false;
    try {
      engine = window.CajouAdvisor.createAdvisor(data, restored);
    } catch {
      // A corrupt or out-of-date saved conversation must not prevent a fresh one.
      try { engine = window.CajouAdvisor.createAdvisor(data); }
      catch { initialError = true; }
    }
    restored = undefined;

    const launcher = button('advisor-launcher', ui.launcher, 'cashew');
    launcher.id = 'cajou-advisor-launcher';
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.setAttribute('aria-controls', 'cajou-advisor');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', text(ui.openLabel, 240));
    launcher.title = text(ui.openLabel, 240);

    const dialog = element('dialog', 'advisor-dialog');
    dialog.id = 'cajou-advisor';
    dialog.setAttribute('aria-label', text(ui.dialogLabel, 240));
    dialog.setAttribute('aria-describedby', 'cajou-advisor-subtitle');
    dialog.setAttribute('aria-modal', 'true');

    const shell = element('div', 'advisor-shell');
    const header = element('header', 'advisor-header');
    const topline = element('div', 'advisor-topline');
    const eyebrow = element('p', 'advisor-eyebrow', ui.eyebrow);
    const closeButton = button('advisor-close', ui.close, 'close', true);
    topline.append(eyebrow, closeButton);
    const heading = element('h2', 'advisor-title', ui.title);
    heading.id = 'cajou-advisor-title';
    heading.tabIndex = -1;
    const subtitle = element('p', 'advisor-subtitle', ui.subtitle);
    subtitle.id = 'cajou-advisor-subtitle';
    header.append(topline, heading, subtitle);

    const toolbar = element('div', 'advisor-toolbar');
    const navigation = element('div', 'advisor-navigation');
    const backButton = button('advisor-tool', ui.back, 'back');
    const resetButton = button('advisor-tool', ui.restart, 'restart');
    navigation.append(backButton, resetButton);
    const progress = element('p', 'advisor-progress');
    toolbar.append(navigation, progress);

    const scroll = element('div', 'advisor-scroll');
    scroll.tabIndex = -1;
    const log = element('ol', 'advisor-log');
    log.setAttribute('role', 'log');
    log.setAttribute('aria-label', text(ui.conversationLabel, 240));
    log.setAttribute('aria-live', 'off');
    log.setAttribute('aria-relevant', 'additions');
    log.setAttribute('aria-atomic', 'false');
    const choices = element('div', 'advisor-choices');
    const handoff = element('div', 'advisor-handoff');
    handoff.hidden = true;
    const error = element('div', 'advisor-error');
    error.hidden = true;
    error.setAttribute('role', 'status');
    error.setAttribute('aria-live', 'polite');
    error.append(element('p', '', ui.errorMessage));
    const fallbackHref = safeHref(data.routes?.tailor);
    if (fallbackHref) {
      const fallback = element('a', 'advisor-primary', data.copy?.formLabel || ui.openLabel);
      fallback.href = fallbackHref;
      fallback.append(icon('arrow'));
      error.append(fallback);
    }
    scroll.append(log, handoff, choices, error);

    const footer = element('footer', 'advisor-footer');
    const composer = element('form', 'advisor-composer');
    const inputLabel = element('label', 'advisor-input-label', ui.inputLabel);
    inputLabel.htmlFor = 'cajou-advisor-question';
    const editor = element('div', 'advisor-editor');
    const input = element('textarea', 'advisor-input');
    input.id = 'cajou-advisor-question';
    input.name = 'travelQuestion';
    input.rows = 1;
    input.maxLength = 600;
    input.autocomplete = 'off';
    input.placeholder = text(ui.placeholder, 240);
    input.setAttribute('aria-describedby', 'cajou-advisor-disclaimer');
    const sendButton = button('advisor-send', ui.send, 'send', true);
    sendButton.type = 'submit';
    sendButton.disabled = true;
    editor.append(input, sendButton);
    composer.append(inputLabel, editor);
    const disclaimer = element('p', 'advisor-disclaimer', ui.disclaimer);
    disclaimer.id = 'cajou-advisor-disclaimer';
    footer.append(composer, disclaimer);
    shell.append(header, toolbar, scroll, footer);
    dialog.append(shell);
    document.body.append(launcher, dialog);

    let messageKeys = [];
    let currentView = null;
    let opener = null;
    let opening = false;
    let closeTimer = 0;
    let viewportFrame = 0;
    let renderFrame = 0;
    let pointerStartedOnBackdrop = false;

    const persist = () => {
      if (!engine) return;
      try { store(storageKey, engine.exportState()); } catch { /* Optional persistence. */ }
    };
    const addSafeLink = (node, href) => {
      const destination = safeHref(href);
      if (!destination) return false;
      node.href = destination;
      if (destination.startsWith('https://wa.me/')) {
        node.target = '_blank';
        node.rel = 'noopener noreferrer';
      }
      node.addEventListener('click', persist);
      return true;
    };
    const renderMessage = message => {
      const role = message.role === 'user' ? 'user' : 'assistant';
      const item = element('li', `advisor-message advisor-message--${role}`);
      item.dataset.messageId = text(String(message.id || ''), 100);
      if (role === 'assistant') item.tabIndex = -1;
      if (message.text) item.append(element('p', 'advisor-message-text', message.text));
      if (Array.isArray(message.summary) && message.summary.length) {
        const summary = element('dl', 'advisor-summary');
        message.summary.slice(0, 12).forEach(row => {
          const group = element('div', 'advisor-summary-row');
          group.append(element('dt', '', row.label), element('dd', '', String(row.value ?? '')));
          summary.append(group);
        });
        item.append(summary);
      }
      if (Array.isArray(message.cards) && message.cards.length) {
        const cards = element('div', 'advisor-cards');
        message.cards.slice(0, 8).forEach(card => {
          const href = safeHref(card.href);
          const node = element(href ? 'a' : 'div', 'advisor-card');
          if (href) addSafeLink(node, href);
          node.append(element('h3', 'advisor-card-title', card.title));
          if (card.text) node.append(element('p', 'advisor-card-text', card.text));
          if (href) {
            const action = element('span', 'advisor-card-action', card.label || ui.sourceLabel);
            action.append(icon('arrow'));
            node.append(action);
          }
          cards.append(node);
        });
        item.append(cards);
      }
      if (Array.isArray(message.sources) && message.sources.length) {
        const sources = element('div', 'advisor-sources');
        const sourceLinks = element('div', 'advisor-source-links');
        message.sources.slice(0, 8).forEach(source => {
          const link = element('a', 'advisor-source', source.label);
          if (addSafeLink(link, source.href)) sourceLinks.append(link);
        });
        if (sourceLinks.childElementCount) {
          sources.append(element('span', 'advisor-source-label', ui.sourceLabel), sourceLinks);
          item.append(sources);
        }
      }
      return item;
    };

    const renderMessages = messages => {
      const clean = Array.isArray(messages) ? messages.slice(-80) : [];
      const nextKeys = clean.map(message => JSON.stringify(message));
      const retainedStart = nextKeys.length ? messageKeys.indexOf(nextKeys[0]) : -1;
      if (retainedStart > 0) {
        for (let index = 0; index < retainedStart; index += 1) log.firstElementChild.remove();
        messageKeys = messageKeys.slice(retainedStart);
      }
      let common = 0;
      while (common < messageKeys.length && common < nextKeys.length && messageKeys[common] === nextKeys[common]) common += 1;
      // Retain the shared history. A screen reader receives only new log entries,
      // instead of the whole conversation being announced after every choice.
      while (log.childElementCount > common) log.lastElementChild.remove();
      for (let index = common; index < clean.length; index += 1) log.append(renderMessage(clean[index]));
      messageKeys = nextKeys;
    };

    const renderHandoff = value => {
      handoff.replaceChildren();
      handoff.hidden = !value;
      if (!value) return;
      const href = safeHref(value.formHref);
      if (href) {
        const primary = element('a', 'advisor-primary', value.formLabel);
        addSafeLink(primary, href);
        primary.addEventListener('click', () => {
          if (value.formData && typeof value.formData === 'object') store(enquiryKey, value.formData, 20000);
        });
        primary.append(icon('arrow'));
        handoff.append(primary);
      }
      const contacts = Array.isArray(value.whatsapps) ? value.whatsapps.map(contact => ({
        label: contact.label,
        href: safeHref(contact.href, true),
      })).filter(contact => contact.href) : [];
      const uniqueContacts = new Map(contacts.map(contact => [new URL(contact.href).pathname, contact]));
      // Keep both contacts together; never expose a partial pair from bad data.
      if (uniqueContacts.has('/245966333329') && uniqueContacts.has('/33603888193')) {
        const group = element('div', 'advisor-whatsapps');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', 'WhatsApp');
        ['/245966333329', '/33603888193'].forEach(number => {
          const contact = uniqueContacts.get(number);
          const link = element('a', 'advisor-whatsapp', contact.label);
          addSafeLink(link, contact.href);
          link.append(icon('arrow'));
          group.append(link);
        });
        handoff.append(group);
      }
      if (value.note) handoff.append(element('p', 'advisor-handoff-note', value.note));
      if (ui.privacyNote) handoff.append(element('p', 'advisor-privacy-note', ui.privacyNote));
    };

    const showError = () => {
      error.hidden = false;
      requestAnimationFrame(() => { scroll.scrollTop = scroll.scrollHeight; });
    };
    const revealLatestMessage = () => {
      const latest = [...log.children].reverse().find(node => node.classList.contains('advisor-message--assistant'));
      if (!latest) return;
      const delta = latest.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
      scroll.scrollTop = Math.max(0, scroll.scrollTop + delta - 20);
    };
    const render = ({ focus = null, scrollToEnd = false, silent = false } = {}) => {
      if (!engine) { showError(); return; }
      const view = engine.getView();
      currentView = view;
      error.hidden = true;
      if (silent) log.setAttribute('aria-live', 'off');
      renderMessages(view.messages);
      choices.replaceChildren();
      const nextChoices = Array.isArray(view.choices) ? view.choices.slice(0, 18) : [];
      nextChoices.forEach(choice => {
        const option = button('advisor-choice', choice.label, null);
        if (choice.tone === 'primary') option.classList.add('advisor-choice--primary');
        option.dataset.choiceId = text(choice.id, 120);
        option.append(icon('arrow'));
        option.addEventListener('click', () => run('select', choice.id, 'choice'));
        choices.append(option);
      });
      choices.hidden = !nextChoices.length;
      renderHandoff(view.handoff);
      progress.textContent = text(view.progress, 150);
      progress.hidden = !view.progress;
      backButton.disabled = !view.canBack;
      dialog.dataset.stage = text(view.stage, 100);
      input.disabled = false;
      sendButton.disabled = !input.value.trim();
      const hasConversation = Array.isArray(view.messages) && view.messages.length > 1;
      launcher.title = text(hasConversation ? ui.resumeLabel : ui.openLabel, 240);
      launcher.setAttribute('aria-label', text(`${ui.launcher} — ${hasConversation ? ui.resumeLabel : ui.openLabel}`, 300));
      cancelAnimationFrame(renderFrame);
      renderFrame = requestAnimationFrame(() => {
        if (dialog.open) {
          if (scrollToEnd) revealLatestMessage();
          if (focus === 'choice') {
            const target = [...log.children].reverse().find(node => node.classList.contains('advisor-message--assistant')) || scroll;
            target.focus({ preventScroll: true });
          }
          else if (focus === 'input') input.focus({ preventScroll: true });
          if (silent) log.setAttribute('aria-live', 'polite');
        }
      });
    };
    const run = (method, value, focus) => {
      try {
        if (!engine) throw new Error('Guide unavailable');
        engine[method](value);
        render({ focus, scrollToEnd: true, silent: method === 'reset' || method === 'back' });
        persist();
        return true;
      } catch { showError(); return false; }
    };

    const editorChanged = () => {
      sendButton.disabled = !engine || !input.value.trim();
      input.style.height = 'auto';
      input.style.height = `${Math.min(Math.max(input.scrollHeight, 48), 112)}px`;
    };
    composer.addEventListener('submit', event => {
      event.preventDefault();
      const question = input.value.trim().slice(0, 600);
      if (!question || !engine) return;
      if (run('ask', question, 'input')) {
        input.value = '';
        editorChanged();
      }
    });
    input.addEventListener('input', editorChanged);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (input.value.trim()) composer.requestSubmit();
      }
    });
    backButton.addEventListener('click', () => run('back', undefined, 'choice'));
    resetButton.addEventListener('click', () => {
      input.value = '';
      editorChanged();
      try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(enquiryKey); } catch { /* Optional storage. */ }
      if (!engine) {
        try { engine = window.CajouAdvisor.createAdvisor(data); } catch { showError(); return; }
      }
      run('reset', undefined, 'choice');
    });

    const setExpanded = expanded => {
      launcher.setAttribute('aria-expanded', String(expanded));
      document.querySelectorAll('[data-advisor-open]').forEach(trigger => trigger.setAttribute('aria-expanded', String(expanded)));
    };
    const focusOpener = () => {
      const parentDialog = opener?.closest?.('dialog');
      const visibleOpener = opener?.isConnected && opener.getClientRects().length && (!parentDialog || parentDialog.open);
      (visibleOpener ? opener : launcher).focus({ preventScroll: true });
      opener = null;
    };
    const open = trigger => {
      if (dialog.open || opening) return;
      if (typeof dialog.showModal !== 'function') {
        if (fallbackHref) window.location.assign(fallbackHref);
        return;
      }
      opener = trigger || document.activeElement;
      opening = true;
      // Inline navigation may be inside the site's menu. Close that modal first,
      // so two focus traps and their scroll locks cannot compete.
      document.querySelectorAll('dialog[open]').forEach(other => { if (other !== dialog) other.close(); });
      requestAnimationFrame(() => {
        opening = false;
        clearTimeout(closeTimer);
        dialog.classList.remove('is-closing');
        dialog.showModal();
        document.documentElement.classList.add('advisor-open');
        document.documentElement.classList.add('dialog-open');
        setExpanded(true);
        updateViewport();
        log.setAttribute('aria-live', 'off');
        heading.focus({ preventScroll: true });
        requestAnimationFrame(() => {
          dialog.classList.add('is-open');
          revealLatestMessage();
          log.setAttribute('aria-live', 'polite');
        });
      });
    };
    const close = () => {
      if (!dialog.open || dialog.classList.contains('is-closing')) return;
      persist();
      log.setAttribute('aria-live', 'off');
      if (reducedMotion()) dialog.close();
      else {
        dialog.classList.add('is-closing');
        dialog.classList.remove('is-open');
        closeTimer = window.setTimeout(() => { if (dialog.open) dialog.close(); }, 160);
      }
    };
    launcher.addEventListener('click', () => open(launcher));
    closeButton.addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => {
      clearTimeout(closeTimer);
      dialog.classList.remove('is-open', 'is-closing');
      document.documentElement.classList.remove('advisor-open');
      document.documentElement.classList.toggle('dialog-open', Boolean(document.querySelector('dialog[open]')));
      setExpanded(false);
      log.setAttribute('aria-live', 'off');
      updateViewport();
      focusOpener();
    });
    const outsideDialog = event => {
      const rect = dialog.getBoundingClientRect();
      return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    };
    dialog.addEventListener('pointerdown', event => { pointerStartedOnBackdrop = event.target === dialog && outsideDialog(event); });
    dialog.addEventListener('click', event => {
      if (event.target === dialog && pointerStartedOnBackdrop && outsideDialog(event)) close();
      pointerStartedOnBackdrop = false;
    });

    document.querySelectorAll('[data-advisor-open]').forEach(trigger => {
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', dialog.id);
      trigger.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', event => {
      const trigger = event.target instanceof Element && event.target.closest('[data-advisor-open]');
      if (!trigger || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      open(trigger);
    });

    const visible = node => Boolean(node && !node.hidden && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    const overlaps = (first, second) => first.left < second.right && first.right > second.left && first.top < second.bottom && first.bottom > second.top;
    const updateViewport = () => {
      const compact = window.matchMedia('(max-width: 640px)').matches;
      const viewport = window.visualViewport;
      if (viewport) {
        dialog.style.setProperty('--advisor-viewport-height', `${Math.round(viewport.height)}px`);
        dialog.style.setProperty('--advisor-viewport-top', `${Math.round(viewport.offsetTop)}px`);
      }
      dialog.classList.toggle('is-short', (viewport?.height || window.innerHeight) < 520);
      let bottom = compact ? 14 : 24;
      const mobileBar = document.querySelector('.mobile-bar');
      const cookiePanel = document.getElementById('cookie-panel');
      [mobileBar, cookiePanel].forEach(node => {
        if (!visible(node)) return;
        const rect = node.getBoundingClientRect();
        if (rect.bottom > window.innerHeight - 160) bottom = Math.max(bottom, window.innerHeight - rect.top + 12);
      });
      launcher.style.setProperty('--advisor-launcher-bottom', `${Math.round(Math.min(bottom, Math.max(14, window.innerHeight - 80)))}px`);
      const active = document.activeElement;
      const inputFocused = compact && active instanceof Element && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && !dialog.contains(active);
      const focusedOverlap = active instanceof Element && active !== document.body && !launcher.contains(active) && !dialog.contains(active) && overlaps(launcher.getBoundingClientRect(), active.getBoundingClientRect());
      launcher.classList.toggle('advisor-launcher--obscured', inputFocused || focusedOverlap || bottom > window.innerHeight - 90);
    };
    const scheduleViewport = () => {
      cancelAnimationFrame(viewportFrame);
      viewportFrame = requestAnimationFrame(updateViewport);
    };
    window.addEventListener('resize', scheduleViewport, { passive: true });
    window.addEventListener('scroll', scheduleViewport, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleViewport, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleViewport, { passive: true });
    document.addEventListener('focusin', scheduleViewport);
    document.addEventListener('focusout', scheduleViewport);
    const cookiePanel = document.getElementById('cookie-panel');
    const mobileBar = document.querySelector('.mobile-bar');
    if ('MutationObserver' in window && cookiePanel) new MutationObserver(scheduleViewport).observe(cookiePanel, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
    if ('ResizeObserver' in window) {
      const persistentObserver = new ResizeObserver(scheduleViewport);
      [cookiePanel, mobileBar].filter(Boolean).forEach(node => persistentObserver.observe(node));
    }
    window.addEventListener('pagehide', persist);
    try { if (initialError) throw new Error('Guide unavailable'); render({ silent: true }); }
    catch { input.disabled = true; backButton.disabled = true; showError(); }
    if (engine && currentView) document.querySelectorAll('[data-advisor-open]').forEach(trigger => { trigger.hidden = false; });
    updateViewport();
    document.documentElement.classList.add('advisor-ready');
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
