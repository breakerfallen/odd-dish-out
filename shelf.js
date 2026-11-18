/* Odd Dish Out: the idea shelf (ideas.html). The recipe list is plain HTML;
   this adds the recipes guests post, saved in the Sheet's Ideas tab. */
(function () {
  'use strict';

  var CONFIG = window.ODO_CONFIG || {};
  var LINK_OK = /^https?:\/\/[^\s<>"']+\.[^\s<>"']+$/i;
  var ERRORS = {
    missing_fields: 'We need the dish and where it goes.',
    full: 'The shelf is full. Tell the hosts!',
    busy: 'Lots of people adding at once. Try again in a second.'
  };

  var LABELS = { appetizer: 'Appetizers', main: 'Mains & stuffing', side: 'Vegetables & sides', sweet: 'Sweets', bread: 'Bread & sips' };

  function store(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function el(id) { return document.getElementById(id); }

  // The invite key rides after the # in the link, or was saved by the main page.
  var m = /(?:^|[#&])k=([^&]+)/.exec(location.hash);
  var key = (m ? decodeURIComponent(m[1]) : '') || store('odo:key') || '';
  if (!key) return;

  var home = document.querySelectorAll('a[data-home]');
  for (var i = 0; i < home.length; i++) home[i].href = 'index.html#k=' + encodeURIComponent(key);

  function api(action, payload) {
    payload.key = key;
    if (!CONFIG.apiUrl) return window.ODO_MOCK(action, payload);
    // text/plain keeps this a "simple" request, so the browser skips the CORS preflight
    return fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload)),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  // Guest recipes join the list under the category they were given.
  function render(ideas) {
    var old = document.querySelectorAll('.recipes li.guest');
    for (var n = 0; n < old.length; n++) old[n].parentNode.removeChild(old[n]);
    ideas.forEach(function (it) {
      var list = document.querySelector('.recipes[data-cat="' + (LABELS[it.category] ? it.category : 'side') + '"]');
      var li = document.createElement('li');
      li.className = 'guest';
      var title;
      if (LINK_OK.test(it.link || '')) {
        title = document.createElement('a');
        title.href = it.link;
        title.target = '_blank';
        title.rel = 'noopener noreferrer';
      } else {
        title = document.createElement('b');
      }
      title.textContent = it.idea;
      li.appendChild(title);
      list.appendChild(li);
    });
    el('add').hidden = false;
    el('add-jump').hidden = false;
  }

  function fail(text) {
    el('s-error').textContent = text;
    el('s-error').hidden = !text;
  }

  // A Sheet script from before the idea shelf answers "unknown_action": the section just stays hidden.
  api('loadIdeas', {}).then(function (res) {
    if (res && res.ok && Array.isArray(res.ideas)) render(res.ideas);
  }).catch(function () { /* offline: the recipe list above still works */ });

  function picked() {
    var on = document.querySelector('#s-cats input:checked');
    return on ? on.value : '';
  }
  el('s-cats').addEventListener('change', function () {
    var chips = el('s-cats').querySelectorAll('.chip');
    for (var c = 0; c < chips.length; c++) chips[c].classList.toggle('on', chips[c].querySelector('input').checked);
  });

  el('suggest').addEventListener('submit', function (e) {
    e.preventDefault();
    if (el('s-website').value) return; // spam trap
    var idea = el('s-idea').value.trim();
    var link = el('s-link').value.trim();
    var category = picked();
    el('s-done').hidden = true;
    if (!idea) return fail('Tell us what the dish is.');
    if (!category) return fail('Pick where it goes.');
    if (link && !/^https?:\/\//i.test(link)) link = 'https://' + link;
    if (link && !LINK_OK.test(link)) return fail('That link does not look right. Fix it, or leave it empty.');
    fail('');

    var btn = el('s-save');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    api('addIdea', { idea: idea, link: link, category: category }).then(function (res) {
      if (!res || !res.ok) return fail(ERRORS[res && res.error] || 'That did not save. Try again.');
      render(res.ideas || []);
      el('s-idea').value = '';
      el('s-link').value = '';
      el('s-done').textContent = 'Added to ' + LABELS[category] + '.';
      el('s-done').hidden = false;
    }).catch(function () {
      fail('We could not reach the sheet. Try again.');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Put it on the list';
    });
  });
})();
