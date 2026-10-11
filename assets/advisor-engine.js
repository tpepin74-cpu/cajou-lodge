/* A transparent, browser-local decision tree. Answers are reviewed site extracts,
   never generated prices, availability, medical advice or booking confirmations. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CajouAdvisor = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const clean = (value, max = 600) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '';
  const has = (text, phrase) => (` ${text} `).includes(` ${normalize(phrase)} `);
  const hasAny = (text, phrases) => phrases.some(phrase => has(text, phrase));
  const flowStages = ['party', 'interests', 'duration', 'period'];
  const interestWords = {
    nature: ['nature', 'faune', 'wildlife', 'tortues', 'turtles', 'tartarugas', 'hippopotames', 'hippos', 'hipopotamos', 'oiseaux', 'birds', 'aves'],
    culture: ['culture', 'cultures', 'cultura', 'villages', 'village', 'aldeias', 'rencontres', 'traditions', 'tradicoes', 'cultural'],
    fishing: ['peche', 'pecher', 'fishing', 'fish', 'pesca', 'pescar'],
    relax: ['detente', 'repos', 'relax', 'relaxing', 'relaxation', 'descanso', 'farniente', 'relaxar'],
    mix: ['tout', 'everything', 'tudo', 'mix', 'melange', 'misto'],
  };
  const stopwords = new Set(('a ai au aux avec ce ces c est de des du en et il ils je la le les ma me mes mon ne nos nous on ou par pas pour que quel quelle quelles quels qui sa se ses son sur tu un une vos votre vous y the a an and are as at be can could do does for from have how i in is it me my of on or our please that there to we what when where which with would you your o os a as com da das de do dos e em eu me meu minha nao no nos o os para por qual que quem se um uma voce voces').split(' '));

  function findEntries(entries, question) {
    const query = normalize(question);
    const tokens = [...new Set(query.split(' ').filter(word => word.length > 2 && !stopwords.has(word)))];
    if (!tokens.length) return [];
    return entries.map(entry => {
      let aliasScore = 0;
      for (const raw of entry.keywords || []) {
        const alias = normalize(raw);
        if (alias && has(query, alias)) aliasScore += alias.includes(' ') ? 10 : 5;
      }
      const title = normalize(entry.title);
      const body = normalize(entry.paragraphs.join(' '));
      const titleHits = tokens.filter(token => has(title, token)).length;
      const bodyHits = tokens.filter(token => has(body, token)).length;
      const score = aliasScore + titleHits * 2 + bodyHits * .35;
      // One incidental word in a paragraph is not enough to pretend to answer.
      const qualifies = aliasScore >= 5 || titleHits >= 2 || (tokens.length >= 3 && bodyHits >= 3 && bodyHits / tokens.length >= .6);
      return { entry, score: qualifies ? score : 0 };
    }).filter(item => item.score >= 4).sort((a, b) => b.score - a.score).slice(0, 3).map(item => item.entry);
  }

  function parseParty(text) {
    if (/(?:^|\s)[-−]\s*\d/.test(text) || /\b\d+[.,]\d+\s*(?:adult|enfant|child|kid|crian[cç]|pessoa|person)/i.test(text)) return null;
    let value = normalize(text);
    const numberWords = { un: 1, une: 1, one: 1, um: 1, uma: 1, deux: 2, two: 2, dois: 2, duas: 2, trois: 3, three: 3, tres: 3, quatre: 4, four: 4, quatro: 4, cinq: 5, five: 5, cinco: 5, six: 6, seis: 6, sept: 7, seven: 7, sete: 7, huit: 8, eight: 8, oito: 8, neuf: 9, nine: 9, nove: 9, dix: 10, ten: 10, dez: 10 };
    value = value.split(' ').map(word => numberWords[word] ?? word).join(' ');
    const adult = value.match(/\b(\d+)\s*(?:adultes?|adults?|adultos?)\b/);
    const child = value.match(/\b(\d+)\s*(?:enfants?|children|child|kids?|criancas?)\b/);
    const total = value.match(/^(?:nous sommes |we are |somos |pour |for |para )?(\d+)(?:\s*(?:personnes?|people|persons?|pessoas?|voyageurs?|travellers?|viajantes?))?$/);
    if (adult && (+adult[1] < 1 || +adult[1] > 30) || child && (+child[1] < 0 || +child[1] > 30) || total && (+total[1] < 1 || +total[1] > 30)) return null;
    if (adult || child || total) {
      const result = { partyText: clean(text, 180) };
      if (adult && +adult[1] > 0 && +adult[1] <= 30) result.adults = +adult[1];
      if (child && +child[1] >= 0 && +child[1] <= 30) result.children = +child[1];
      if (total && +total[1] > 0 && +total[1] <= 30) result.total = +total[1];
      // A total headcount does not imply that everyone is an adult.
      if (result.adults || result.total || result.children) return result;
    }
    return null;
  }

  function createAdvisor(data, restored) {
    if (!data || !data.ui || !data.copy || !Array.isArray(data.knowledge)) throw new Error('Advisor content unavailable');
    const { ui, copy, options } = data;
    const entries = new Map(data.knowledge.map(entry => [entry.id, entry]));
    const messages = [];
    let stage = 'welcome';
    let profile = {};
    let related = [];
    let paused = false;
    let showHandoff = false;
    let lastQuestion = '';
    let events = [];
    let sequence = 0;

    function add(role, text, extra = {}) {
      messages.push({ id: ++sequence, role, text, ...extra });
      if (messages.length > 36) messages.splice(0, messages.length - 36);
    }
    function entryCard(id) {
      const entry = entries.get(id);
      return entry && { title: entry.title, text: entry.paragraphs.join('\n\n'), href: entry.href, label: ui.sourceLabel };
    }
    function entryChoice(id) {
      return entries.has(id) ? { id: `entry:${id}`, label: entries.get(id).title } : null;
    }
    function choicesForEntry(ids) { return ids.map(entryChoice).filter(Boolean); }
    function action(name) { return { id: `flow:${name}`, label: options.actions[name] }; }
    function topic(name) { return { id: `topic:${name}`, label: options.topics[name] }; }
    function choices() {
      if (paused) return [action('resume'), ...choicesForEntry(related).slice(0, 3), topic('contact')];
      if (flowStages.includes(stage)) return Object.entries(options[stage]).map(([id, label]) => ({ id: `${stage}:${id}`, label }));
      if (stage === 'welcome') return ['stay', 'rooms', 'experiences', 'practical', 'contact', 'more'].map(topic);
      if (stage === 'rooms') return [...choicesForEntry(['single', 'double', 'triple', 'amenities', 'meals', 'rates']), action('start')];
      if (stage === 'experiences') return [...choicesForEntry(['fishing', 'orango', 'poilao', 'bubaque', 'rubane', 'bolama']), action('start')];
      if (stage === 'practical') return [...choicesForEntry(['transfers', 'air-bijagos', 'season', 'money', 'visa', 'health']), action('details')];
      if (stage === 'practical-more') return [...choicesForEntry(['insurance', 'safety', 'packing', 'parks', 'culture', 'amenities']), action('home')];
      if (stage === 'more') return [...choicesForEntry(['overview', 'story', 'gallery', 'privacy']), action('home')];
      if (stage === 'result') return [action('start'), topic('rooms'), topic('practical'), action('home')];
      if (stage === 'contact') return [action('start'), action('home')];
      return [...choicesForEntry(related).slice(0, 4), action('start'), topic('contact'), action('home')];
    }
    function step(next) {
      stage = next; paused = false; showHandoff = false; related = [];
      add('assistant', copy[next]);
    }
    function summary() {
      const values = {
        party: profile.partyText,
        interests: profile.interestText || (profile.interests || []).map(id => options.interests[id]).filter(Boolean).join(', '),
        duration: profile.durationText,
        period: profile.periodText,
        room: profile.room && data.roomLabels[profile.room],
      };
      return Object.entries(values).filter(([, value]) => value).map(([id, value]) => ({ label: copy.summaryLabels[id], value }));
    }
    function handoff() {
      if (!showHandoff) return null;
      const fields = summary();
      const lines = [copy.summaryIntro, '', ...fields.map(field => `${field.label} : ${field.value}`)];
      if (lastQuestion) lines.push('', `${copy.questionLabel} : ${lastQuestion}`);
      const summaryText = lines.join('\n');
      const params = new URLSearchParams({ source: 'conseiller' });
      if (profile.room) params.set('room', profile.room);
      // The fragment carries the same small draft when sessionStorage is blocked.
      // It is not sent in the HTTP request and is removed by the form after use.
      const formData = {
        version: 1, locale: data.lang, createdAt: Date.now(),
        summary: summaryText.slice(0, 2200),
        ...(profile.adults ? { adults: profile.adults } : {}),
        ...(Number.isInteger(profile.children) ? { children: profile.children } : {}),
        interests: (profile.interests || []).filter(id => ['nature', 'culture', 'fishing', 'relax'].includes(id)),
        ...(profile.room ? { room: profile.room } : {}),
      };
      return {
        formLabel: copy.formLabel,
        formHref: `${data.routes.tailor}?${params}#conseiller=${encodeURIComponent(JSON.stringify(formData))}`,
        formData,
        whatsapps: data.whatsapps.map(contact => ({ label: contact.label, href: `${contact.href}?text=${encodeURIComponent(summaryText)}` })),
        note: copy.handoffNote,
      };
    }
    function getView() {
      const index = flowStages.indexOf(stage);
      return {
        messages: messages.map(message => ({ ...message })), choices: choices(), stage,
        canBack: events.length > 0,
        progress: index >= 0 ? `${index + 1} / 4 · ${copy.steps[index]}` : '',
        handoff: handoff(),
      };
    }
    function answer(ids, text = copy.found, useHandoff = false) {
      const valid = [...new Set(ids)].filter(id => entries.has(id));
      const cards = valid.slice(0, 2).map(entryCard);
      const allRelated = valid.flatMap(id => entries.get(id).related || []);
      related = [...new Set([...allRelated, 'rates', 'transfers'])].filter(id => !valid.includes(id));
      if (flowStages.includes(stage)) paused = true;
      else stage = 'answer';
      showHandoff = useHandoff;
      add('assistant', text, cards.length ? { cards } : {});
    }
    function contact() {
      stage = 'contact'; paused = false; showHandoff = true;
      const contactEntry = entries.get('contact');
      add('assistant', copy.contact, { summary: summary(), sources: contactEntry ? [{ label: contactEntry.title, href: contactEntry.href }] : [] });
    }
    function result() {
      stage = 'result'; paused = false; showHandoff = true;
      const interests = profile.interests || [];
      const recommendations = [];
      if (interests.includes('fishing')) recommendations.push('fishing');
      if (interests.includes('nature')) recommendations.push('orango', 'poilao');
      if (interests.includes('culture')) recommendations.push('bubaque', 'rubane');
      if (interests.includes('relax')) recommendations.push('rooms', 'meals');
      if (!recommendations.length || interests.length > 2) recommendations.unshift('itinerary');
      if (profile.room) recommendations.unshift(profile.room);
      const cards = [...new Set(recommendations)].slice(0, 3).map(entryCard).filter(Boolean);
      let text = copy.result;
      if (profile.outsideSeason) text += '\n\n' + copy.outsideSeason;
      if (interests.includes('fishing') && (profile.adults === 1 && !profile.children || profile.total === 1 || profile.party === 'solo')) text += '\n\n' + copy.soloFishing;
      add('assistant', text, { summary: summary(), cards });
    }
    function setParty(kind, text, values = {}) {
      delete profile.adults; delete profile.children; delete profile.total;
      Object.assign(profile, { party: kind, partyText: clean(text, 180) }, values);
      if (kind === 'solo') Object.assign(profile, { adults: 1, children: 0 });
      if (kind === 'couple') Object.assign(profile, { adults: 2, children: 0 });
      step('interests');
    }
    function setInterests(kinds, text) {
      profile.interests = kinds.includes('mix') ? ['nature', 'culture', 'fishing', 'relax'] : kinds;
      profile.interestText = clean(text, 200);
      step('duration');
    }
    function setPeriod(text) {
      profile.periodText = clean(text, 180);
      profile.outsideSeason = hasAny(normalize(text), ['juin', 'juillet', 'aout', 'septembre', 'june', 'july', 'august', 'september', 'junho', 'julho', 'agosto', 'setembro']);
      result();
    }
    function applySelect(id) {
      const selected = choices().find(choice => choice.id === id);
      if (!selected) return false;
      add('user', selected.label);
      const [kind, value] = id.split(':');
      if (kind === 'topic') {
        if (value === 'stay') step('party');
        else if (value === 'contact') contact();
        else step(value);
      } else if (kind === 'entry') {
        if (['single', 'double', 'triple'].includes(value)) profile.room = value;
        if (['health', 'insurance'].includes(value)) answer([value], copy.medical);
        else if (value === 'visa') answer([value], copy.entry);
        else answer([value]);
      } else if (kind === 'party') setParty(value, selected.label);
      else if (kind === 'interests') setInterests([value], selected.label);
      else if (kind === 'duration') { profile.durationText = selected.label; step('period'); }
      else if (kind === 'period') setPeriod(selected.label);
      else if (kind === 'flow') {
        if (value === 'resume') { paused = false; showHandoff = false; add('assistant', copy[stage]); }
        else if (value === 'start') step('party');
        else if (value === 'home') step('welcome');
        else if (value === 'details') { stage = 'practical-more'; showHandoff = false; add('assistant', copy.practical); }
      }
      return true;
    }
    function isQuestion(query) {
      return /\?/.test(query) || /^(?:est ce|avez|peut|puis|comment|combien|quel|quelle|quand|ou|pourquoi|what|how|when|where|can|could|do you|is|are|quanto|como|qual|quando|onde|posso|tem|ha)\b/.test(normalize(query));
    }
    function applyAsk(raw) {
      const text = clean(raw);
      if (!text) return false;
      const query = normalize(text);
      add('user', text);
      if (flowStages.includes(stage) && !isQuestion(text)) {
        if (stage === 'party') {
          const counts = parseParty(text);
          if (counts) { setParty('custom', text, counts); return true; }
          if (hasAny(query, ['seul', 'seule', 'solo', 'alone', 'on my own', 'sozinho', 'sozinha'])) { setParty('solo', text); return true; }
          if (hasAny(query, ['a deux', 'en couple', 'couple', 'casal'])) { setParty('couple', text); return true; }
          if (hasAny(query, ['famille', 'family', 'familia'])) { setParty('family', text); return true; }
          if (hasAny(query, ['amis', 'groupe', 'friends', 'group', 'amigos', 'grupo'])) { setParty('friends', text); return true; }
        }
        if (stage === 'interests') {
          const matched = Object.entries(interestWords).filter(([, words]) => hasAny(query, words)).map(([kind]) => kind);
          if (matched.length) { setInterests(matched, text); return true; }
        }
        if (stage === 'duration' && (/(\d+|deux|trois|quatre|cinq|six|sept|huit|une|one|two|three|four|five|six|seven|oito|dois|duas|tres|quatro|cinco)\s*(nuits?|jours?|semaines?|nights?|days?|weeks?|noites?|dias?|semanas?)\b/.test(query) || hasAny(query, ['flexible', 'a definir', 'not sure']))) {
          profile.durationText = clean(text, 180); step('period'); return true;
        }
        if (stage === 'period' && (hasAny(query, ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'flexible', 'flexibles', 'flexiveis', 'noel', 'christmas', 'natal']) || /\b\d{4}\b/.test(query) || /\d{1,2}[/.\-]\d{1,2}/.test(text))) {
          setPeriod(text); return true;
        }
      }
      if (/^(bonjour|bonsoir|hello|hi|ola|boa tarde|merci|merci beaucoup|thank you|thanks|obrigado|obrigada)$/.test(query)) {
        add('assistant', flowStages.includes(stage) ? copy[stage] : copy.welcome);
        if (!flowStages.includes(stage)) stage = 'welcome';
        paused = false; showHandoff = false; return true;
      }
      lastQuestion = text;
      // Explicit limits have priority over generic keyword search.
      if (hasAny(query, ['disponible', 'disponibles', 'disponibilite', 'disponibilites', 'availability', 'available', 'disponivel', 'disponiveis', 'disponibilidade', 'confirmer ma reservation', 'book now', 'reservation confirmee'])) {
        answer(['tailor'], copy.availability, true); return true;
      }
      if (hasAny(query, ['trois lits', '3 lits', 'three beds', '3 beds', 'tres camas', '3 camas', 'type de lit', 'king size', 'queen size', 'lit double', 'lits separes', 'twin beds', 'bed layout', 'disposition des lits'])) {
        answer(['rooms'], copy.beds, true); return true;
      }
      if (hasAny(query, ['piscine', 'swimming pool', 'pool', 'piscina', 'lit bebe', 'cot', 'crib', 'berco', 'pmr', 'fauteuil roulant', 'wheelchair', 'cadeira de rodas', 'accessible', 'accessibilite', 'accessibility', 'animaux acceptes', 'chien', 'dog', 'pets', 'animais de estimacao', 'allergie', 'allergies', 'allergy', 'allergies', 'allergie alimentaire', 'gluten', 'vegan', 'vegetarien', 'vegetarian', 'annulation', 'annuler', 'cancel', 'cancellation', 'cancelamento', 'remboursement', 'refund', 'reembolso', 'code', 'codigo', 'password', 'mot de passe', 'senha', 'coffre fort'])) {
        answer([], copy.unknown, true); related = ['rooms', 'meals', 'terms', 'contact']; return true;
      }
      if (hasAny(query, ['sante', 'vaccin', 'vaccins', 'vaccination', 'paludisme', 'fievre jaune', 'medecin', 'malaria', 'yellow fever', 'vaccines', 'vaccine', 'doctor', 'medical', 'medicament', 'pregnant', 'enceinte', 'saude', 'vacina', 'vacinas', 'febre amarela', 'medico', 'gravida', 'traitement', 'dosage'])) {
        answer([], copy.medical); related = ['health', 'insurance', 'packing'];
        const health = entries.get('health'); messages[messages.length - 1].sources = health ? [{ label: health.title, href: health.href }] : []; return true;
      }
      if (hasAny(query, ['visa', 'passeport', 'passport', 'passaporte', 'visto', 'nationalite', 'nationality', 'nacionalidade'])) {
        answer([], copy.entry); related = ['visa', 'international-flights', 'contact'];
        const visa = entries.get('visa'); messages[messages.length - 1].sources = visa ? [{ label: visa.title, href: visa.href }] : []; return true;
      }
      if (hasAny(query, ['meteo', 'weather', 'prevision', 'forecast', 'aujourd hui', 'today', 'hoje', 'actualite', 'news', 'greve', 'strike', 'vol annule', 'cancelled flight'])) {
        answer(['season'], copy.live, true); return true;
      }
      if (hasAny(query, ['air conditioning', 'air conditioner', 'climatisation', 'ar condicionado'])) { answer(['amenities']); return true; }
      if (hasAny(query, ['air bijagos', 'vol', 'flight', 'voo', 'avion', 'plane', 'aviao']) && hasAny(query, ['120', '160', 'bubaque', 'bissau', 'air bijagos'])) { answer(['air-bijagos']); return true; }
      const wantsFishing = hasAny(query, interestWords.fishing);
      if (wantsFishing && hasAny(query, ['seul', 'seule', 'solo', 'alone', 'sozinho', 'sozinha'])) { answer(['fishing'], copy.soloFishing, true); return true; }
      const priceQuestion = hasAny(query, ['combien', 'budget', 'devis', 'prix total', 'cout total', 'how much', 'total price', 'quote', 'quanto', 'orcamento', 'preco total']);
      const stayPriceContext = query.split(' ').length <= 3 || hasAny(query, ['sejour', 'chambre', 'chambres', 'voyage', 'nuits', 'nuit', 'personnes', 'personne', 'room', 'rooms', 'stay', 'trip', 'nights', 'night', 'people', 'quarto', 'quartos', 'estadia', 'viagem', 'noites', 'noite', 'pessoas', 'pessoa']);
      if (priceQuestion && stayPriceContext && !wantsFishing && !hasAny(query, ['transfert', 'transfer', 'bateau', 'boat', 'barco', 'repas', 'meal', 'refeicao'])) { answer(['rates', 'tailor'], copy.budget, true); return true; }
      if (priceQuestion && !stayPriceContext && !wantsFishing && !hasAny(query, ['transfert', 'transferts', 'transfer', 'transfers', 'bateau', 'boat', 'barco', 'repas', 'meal', 'refeicao', 'excursion', 'excursions', 'tour', 'tours', 'excursao', 'orango', 'poilao', 'rubane', 'bolama', 'dejeuner', 'diner', 'breakfast', 'lunch', 'dinner', 'almoco', 'jantar', 'parc', 'parque', 'park', 'vol', 'flight', 'voo', 'air bijagos'])) { answer([], copy.unknown, true); related = ['rates', 'tailor']; return true; }
      if (hasAny(query, ['whatsapp', 'contact', 'contacter', 'telephone', 'parler a', 'human', 'humain', 'humano', 'talk to', 'falar com', 'contacto'])) { contact(); return true; }
      const found = findEntries(data.knowledge, text);
      if (found.length) {
        const first = found[0];
        if (['single', 'double', 'triple'].includes(first.id)) profile.room = first.id;
        const second = found[1];
        const ids = [first.id];
        // Distinct explicit subjects can show two source passages.
        if (second && (second.keywords || []).some(word => has(query, word)) && first.group !== second.group) ids.push(second.id);
        answer(ids);
      } else {
        answer([], copy.unknown, true); related = ['overview', 'excursions', 'rooms', 'contact'];
      }
      return true;
    }
    function initial() {
      messages.length = 0; stage = 'welcome'; profile = {}; related = []; paused = false;
      showHandoff = false; lastQuestion = ''; sequence = 0;
      add('assistant', copy.welcome);
    }
    function replay(list) {
      initial(); events = [];
      for (const event of list) {
        if (!event || typeof event !== 'object') continue;
        if (event.kind === 'ask' && typeof event.value === 'string' && event.value.length <= 600 && applyAsk(event.value)) events.push({ kind: 'ask', value: clean(event.value) });
        if (event.kind === 'select' && typeof event.value === 'string' && event.value.length < 80 && applySelect(event.value)) events.push({ kind: 'select', value: event.value });
      }
    }
    initial();
    if (restored && restored.version === 1 && Array.isArray(restored.events) && restored.events.length <= 120) replay(restored.events);
    return {
      getView,
      select(id) { if (applySelect(id)) events.push({ kind: 'select', value: id }); return getView(); },
      ask(text) { if (applyAsk(text)) events.push({ kind: 'ask', value: clean(text) }); return getView(); },
      back() { replay(events.slice(0, -1)); return getView(); },
      reset() { events = []; initial(); return getView(); },
      exportState() { return { version: 1, events: events.length <= 120 ? events.map(event => ({ ...event })) : [] }; },
    };
  }
  return { createAdvisor, findEntries, normalize, parseParty };
});
