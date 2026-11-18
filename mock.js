// Demo backend used only while config.js has no apiUrl. It mirrors the
// Apps Script contract (apps-script/Code.gs) but keeps data in this browser.
// Demo key: test-key
(function () {
  'use strict';
  var STORE = 'odo:mock:v1';
  var KEY = 'test-key';
  var CATS = ['protein', 'green', 'carb', 'sweet', 'sip', 'wild'];

  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.dishes) return s;
    } catch (e) { /* fall through */ }
    return {
      settings: {
        eventDate: 'Thursday, November 26',
        eventTime: 'Time to be announced',
        address: '',
        poultry: 'TBD',
        hostNote: '',
        votingOpen: false
      },
      dishes: [],
      votes: []
    };
  }

  function write(s) { localStorage.setItem(STORE, JSON.stringify(s)); }

  function state(s, voterId) {
    var counts = {};
    var mine = [];
    s.votes.forEach(function (v) {
      counts[v.dishId] = (counts[v.dishId] || 0) + 1;
      if (v.voterId === voterId) mine.push(v.dishId);
    });
    return {
      ok: true,
      event: s.settings,
      votingOpen: !!s.settings.votingOpen,
      dishes: s.dishes.map(function (d) {
        return { id: d.id, name: d.name, dish: d.dish, servings: d.servings || 0, category: d.category, tags: d.tags, note: d.note, createdAt: d.createdAt };
      }),
      votes: counts,
      myVotes: mine
    };
  }

  function clean(p) {
    return {
      name: String(p.name || '').trim().slice(0, 40),
      dish: String(p.dish || '').trim().slice(0, 80),
      servings: Math.max(0, Math.min(99, parseInt(p.servings, 10) || 0)),
      category: CATS.indexOf(p.category) >= 0 ? p.category : 'wild',
      tags: (p.tags || []).slice(0, 6),
      note: String(p.note || '').trim().slice(0, 200)
    };
  }

  window.ODO_MOCK = function (action, p) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (p.key !== KEY) return resolve({ ok: false, error: 'bad_key' });
        var s = read();
        var d, i;
        if (action === 'addDish') {
          d = clean(p);
          if (!d.name) return resolve({ ok: false, error: 'missing_fields' });
          d.id = p.id; d.token = p.token; d.createdAt = new Date().toISOString();
          s.dishes.push(d);
        } else if (action === 'updateDish' || action === 'removeDish') {
          i = s.dishes.findIndex(function (x) { return x.id === p.id; });
          if (i < 0) return resolve({ ok: false, error: 'not_found' });
          if (s.dishes[i].token !== p.token) return resolve({ ok: false, error: 'not_yours' });
          if (action === 'removeDish') {
            s.dishes.splice(i, 1);
            s.votes = s.votes.filter(function (v) { return v.dishId !== p.id; });
          } else {
            d = clean(p);
            if (!d.name) return resolve({ ok: false, error: 'missing_fields' });
            Object.assign(s.dishes[i], d);
          }
        } else if (action === 'vote') {
          if (!s.settings.votingOpen) return resolve({ ok: false, error: 'voting_closed' });
          s.votes = s.votes.filter(function (v) { return !(v.voterId === p.voterId && v.dishId === p.dishId); });
          if (p.on) s.votes.push({ voterId: p.voterId, dishId: p.dishId });
        }
        write(s);
        resolve(state(s, p.voterId));
      }, 250);
    });
  };

  // Demo helper for the browser console: odoMockSet({ votingOpen: true })
  window.odoMockSet = function (patch) {
    var s = read();
    Object.assign(s.settings, patch);
    write(s);
  };
})();
