/* French punctuation binding for known prose and explicitly chosen DOM regions.
   No global MutationObserver is installed and no element is made nowrap. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CajouTypography = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const NBSP = '\u00a0';
  const protectedPattern = /(?:\b(?:https?|ftp):\/\/[^\s<>"'«»]+|\b(?:mailto|tel|sms|data):[^\s<>"'«»]+|\bwww\.[^\s<>"'«»]+|[\p{L}\p{N}_.!#$%&'*+/=?^`{|}~\-]+@[\p{L}\p{N}_\-]+(?:\.[\p{L}\p{N}_\-]+)+|(?:[\p{L}\p{N}_\-]+\.)+[\p{L}\p{N}_\-]{2,}(?::\d+)?(?:\/[^\s<>"'«»]*)?(?:\?[^\s<>"'«»]*)?(?:#[^\s<>"'«»]*)?|(?<!\w)\/[\p{L}\p{N}_./~%+\-]+(?:\?[^\s<>"'«»]*)?(?:#[^\s<>"'«»]*)?|`[^`\r\n]*`|&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);)/giu;
  const block = new Set('HTML HEAD BODY TITLE ADDRESS ARTICLE ASIDE BLOCKQUOTE BUTTON CAPTION DD DETAILS DIALOG DIV DL DT FIELDSET FIGCAPTION FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HGROUP HR LABEL LEGEND LI MAIN NAV OL P PRE SECTION SUMMARY TABLE TBODY TD TFOOT TH THEAD TR UL BR INPUT SELECT TEXTAREA'.split(' '));
  const excluded = new Set('SCRIPT STYLE PRE CODE KBD SAMP TEXTAREA SELECT OPTION SVG MATH'.split(' '));
  const opaqueInline = new Set(['CODE', 'KBD', 'SAMP']);
  const locale = value => String(value || 'fr').toLowerCase().replace('_', '-').split('-')[0];
  const defaultLang = () => root?.document?.documentElement?.lang || 'fr';

  function edits(text, lang, htmlWhitespace = false, languages) {
    const protectedRanges = [...text.matchAll(protectedPattern)].map(match => [match.index, match.index + match[0].length]);
    const isProtected = index => protectedRanges.some(([start, end]) => start <= index && index < end);
    const isFrench = index => locale(languages ? languages[index] : lang) === 'fr';
    const whitespace = htmlWhitespace ? '\\s' : '[^\\S\\r\\n]';
    const changes = new Map();
    const bind = (start, end) => {
      const existing = text.slice(start, end);
      if (existing === NBSP || existing === '\u202f') return;
      changes.set(`${start}:${end}`, { start, end, replacement: NBSP });
    };
    for (const match of text.matchAll(new RegExp(`(${whitespace}*)([?!]+|[;:»])`, 'g'))) {
      const mark = match.index + match[1].length;
      const left = match.index - 1;
      if (!isFrench(mark) || isProtected(mark) || left < 0 || /\s/.test(text[left])) continue;
      if (match[2] === ':' && !match[1] && /\d/.test(text[left]) && /\d/.test(text[mark + 1] || '')) continue;
      if (!match[1] && '?!;:'.includes(text[left]) && match[2] !== '»') continue;
      bind(match.index, mark);
    }
    for (const match of text.matchAll(new RegExp(`«(${whitespace}*)`, 'g'))) {
      const right = match.index + match[0].length;
      if (!isFrench(match.index) || isProtected(match.index) || right >= text.length || /\s/.test(text[right])) continue;
      bind(match.index + 1, right);
    }
    for (const match of text.matchAll(new RegExp(`(${whitespace}+)\\*(?=${whitespace}*$)`, 'g'))) {
      const left = match.index - 1;
      const star = match.index + match[0].length - 1;
      if (left >= 0 && !/\s/.test(text[left]) && text[left] !== '*' && !isProtected(star)) bind(match.index, star);
    }
    return [...changes.values()].sort((a, b) => a.start - b.start || a.end - b.end);
  }

  function format(text, lang = defaultLang()) {
    if (typeof text !== 'string' || !text) return text;
    for (const { start, end, replacement } of edits(text, lang).reverse()) text = text.slice(0, start) + replacement + text.slice(end);
    return text;
  }

  function protect(container, lang = defaultLang()) {
    if (!container || ![1, 3, 9, 11].includes(container.nodeType)) return 0;
    let run = [];
    let changed = 0;

    function flush() {
      if (!run.length) return;
      const mapping = [];
      const languages = [];
      let text = '';
      for (const piece of run) {
        text += piece.text;
        for (let index = 0; index < piece.text.length; index++) {
          mapping.push({ node: piece.node, offset: index });
          languages.push(piece.lang);
        }
      }
      const perNode = new Map();
      function schedule(node, start, end, replacement) {
        if (!node || node.nodeType !== 3) return;
        if (!perNode.has(node)) perNode.set(node, []);
        perNode.get(node).push({ start, end, replacement });
      }
      for (const edit of edits(text, lang, true, languages)) {
        if (edit.start === edit.end) {
          const next = mapping[edit.start];
          const previous = mapping[edit.start - 1];
          if (next?.node) schedule(next.node, next.offset, next.offset, edit.replacement);
          else if (previous?.node) schedule(previous.node, previous.offset + 1, previous.offset + 1, edit.replacement);
          continue;
        }
        let first = true;
        let index = edit.start;
        while (index < edit.end) {
          const current = mapping[index];
          let last = index + 1;
          while (last < edit.end && mapping[last].node === current.node && mapping[last].offset === current.offset + last - index) last++;
          schedule(current.node, current.offset, current.offset + last - index, first ? edit.replacement : '');
          first = false;
          index = last;
        }
      }
      for (const [node, changes] of perNode) {
        let value = node.data;
        for (const change of changes.sort((a, b) => b.start - a.start || b.end - a.end)) value = value.slice(0, change.start) + change.replacement + value.slice(change.end);
        if (value !== node.data) { node.data = value; changed++; }
      }
      run = [];
    }

    function visit(node, inheritedLang) {
      if (node.nodeType === 3) {
        if (node.data) run.push({ node, text: node.data, lang: inheritedLang });
        return;
      }
      if (![1, 9, 11].includes(node.nodeType)) return;
      const tag = node.tagName || '';
      const ownLang = node.getAttribute?.('lang') || inheritedLang;
      const editable = node.hasAttribute?.('contenteditable') && node.getAttribute('contenteditable') !== 'false';
      const skip = excluded.has(tag) || editable || node.getAttribute?.('data-typography') === 'off';
      if (block.has(tag)) flush();
      if (skip) {
        if (opaqueInline.has(tag)) run.push({ node: null, text: '\ufffc', lang: ownLang });
      } else {
        for (const child of node.childNodes || []) visit(child, ownLang);
      }
      if (block.has(tag)) flush();
    }

    // Respect an excluded/editable ancestor when callers pass a smaller subtree.
    for (let parent = container.parentElement; parent; parent = parent.parentElement) {
      if (excluded.has(parent.tagName) || (parent.hasAttribute('contenteditable') && parent.getAttribute('contenteditable') !== 'false') || parent.getAttribute('data-typography') === 'off') return 0;
    }
    const inheritedLang = container.parentElement?.closest?.('[lang]')?.getAttribute('lang') || lang;
    visit(container, inheritedLang);
    flush();
    return changed;
  }

  // Optional bounded observation, for example an advisor transcript. Callers
  // choose the container; image attributes and input values are never observed.
  function observe(container, lang = defaultLang()) {
    const Observer = container?.ownerDocument?.defaultView?.MutationObserver || root?.MutationObserver;
    if (!container || !Observer) return () => {};
    let queued = false;
    let stopped = false;
    const settings = { childList: true, subtree: true, characterData: true };
    const observer = new Observer(() => {
      if (queued || stopped) return;
      queued = true;
      Promise.resolve().then(() => {
        queued = false;
        if (stopped) return;
        observer.disconnect();
        protect(container, lang);
        observer.observe(container, settings);
      });
    });
    protect(container, lang);
    observer.observe(container, settings);
    return () => { stopped = true; observer.disconnect(); };
  }

  return { format, protect, observe, NBSP };
});
