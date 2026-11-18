/* Odd Dish Out: page logic. Alpine.js component; data comes from the Google
   Sheet through the Apps Script web app (or mock.js when no apiUrl is set). */
(function () {
  'use strict';

  var CONFIG = window.ODO_CONFIG || {};
  var P = window.Potluck;
  var POLL_MS = 20000;

  var CATS = [
    { key: 'protein', label: 'Protein', emoji: '🍖', hint: 'meaty, fishy, beany, eggy' },
    { key: 'green', label: 'Green things', emoji: '🥬', hint: 'veg, salads, slaws' },
    { key: 'carb', label: 'Carbs & bread', emoji: '🥖', hint: 'starches, noodles, doughs' },
    { key: 'sweet', label: 'Sweet', emoji: '🍰', hint: 'dessert, more or less' },
    { key: 'sip', label: 'Sips', emoji: '🧃', hint: 'zero-proof oddities' },
    { key: 'wild', label: 'Unclassifiable', emoji: '🛸', hint: 'defies the categories' }
  ];
  var CORE = ['protein', 'green', 'carb', 'sweet'];
  var NEEDS = [
    { key: 'none', label: 'Nothing', emoji: '🙂', hint: 'fine sitting out: bread, cookies' },
    { key: 'cold', label: 'Fridge space', emoji: '🧊', hint: 'served cold' },
    { key: 'hot', label: 'To stay hot', emoji: '🍲', hint: 'arrives hot, kept hot' },
    { key: 'oven', label: 'Oven time', emoji: '🔥', hint: 'bake or reheat here' }
  ];
  var TEMPS = [0, 300, 325, 350, 375, 400, 425, 450];
  var TIMES = [15, 30, 45, 60, 90, 120];
  var NEED_HINT = {
    cold: 'Bring it cold. It goes straight into the fridge or onto ice until dinner.',
    hot: 'Bring it hot and we will keep it hot. We have a catering hot plate that a Pyrex dish can sit on, so a Pyrex is ideal.',
    oven: 'The bird has dibs on the oven. If yours can be cooked at home and just warmed here, even better.'
  };
  var TAGS = ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'contains nuts', 'spicy'];

  var THIN = {
    protein: 'The table could use something with heft. Protein of any species (or legume) welcome.',
    green: 'The table is begging for something green. Or purple. Any plant, really.',
    carb: 'Suspiciously few carbs. Who is bringing something to soak up the Wayward Bottles?',
    sweet: 'Nobody has claimed dessert yet. This could be your moment.'
  };
  var HEAVY = {
    protein: 'We are drifting toward an all-protein Thanksgiving.',
    green: 'We are drifting toward an all-vegetable Thanksgiving.',
    carb: 'We are drifting toward an all-bread Thanksgiving.',
    sweet: 'We are drifting toward an all-dessert Thanksgiving.'
  };
  var MYSTERY = {
    protein: 'A mystery protein',
    green: 'A mystery green thing',
    carb: 'A mystery carb',
    sweet: 'A mystery dessert',
    sip: 'A mystery sip',
    wild: 'A total mystery'
  };
  var ERRORS = {
    missing_fields: 'We need at least your name and a category.',
    not_yours: 'That dish was added from a different phone, so it can only be changed there (or by the hosts).',
    not_found: 'That dish is no longer on the list.',
    voting_closed: 'Voting is not open yet.',
    full: 'The list is full. Tell the hosts!',
    busy: 'Lots of people signing up at once. Try again in a second.'
  };

  function store(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { /* private mode: carry on without it */ }
    return null;
  }

  function api(action, payload) {
    if (!CONFIG.apiUrl) return window.ODO_MOCK(action, payload);
    // text/plain keeps this a "simple" request, so the browser skips the CORS preflight
    return fetch(CONFIG.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action: action }, payload)),
      redirect: 'follow'
    }).then(function (r) { return r.json(); });
  }

  function blankForm(name) {
    return { id: null, name: name || '', other: false, dish: '', mystery: false, category: '', needs: '', temp: null, mins: null, tags: [], note: '', website: '' };
  }

  document.addEventListener('alpine:init', function () {
    window.Alpine.data('odo', function () {
      return {
        status: 'loading', // loading | locked | ready | error
        demo: !CONFIG.apiUrl,
        key: '',
        voterId: '',
        event: {},
        dishes: [],
        votes: {},
        myVotes: [],
        votingOpen: false,
        mine: [],
        cats: CATS,
        tagList: TAGS,
        needList: NEEDS,
        temps: TEMPS,
        times: TIMES,
        form: blankForm(),
        saving: false,
        formError: '',
        confirmRemove: null,
        idea: '',
        spinning: false,
        toast: '',
        formInView: false,
        showDetails: false,
        kitchenOn: false, // true once the Sheet script is new enough to save kitchen answers
        offline: false,

        init: function () {
          var self = this;
          var m = /(?:^|[#&])k=([^&]+)/.exec(location.hash);
          var fromLink = m ? decodeURIComponent(m[1]) : '';
          this.key = fromLink || store('odo:key') || '';
          this.voterId = store('odo:voter') || P.uuid();
          store('odo:voter', this.voterId);
          this.form = blankForm(store('odo:name') || '');

          if (!this.key) { this.status = 'locked'; return; }
          this.refresh(true);

          setInterval(function () {
            if (document.visibilityState === 'visible' && self.status === 'ready' && !self.saving) self.refresh(false);
          }, POLL_MS);
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible' && self.status === 'ready') self.refresh(false);
          });

          this.$nextTick(function () {
            var el = document.getElementById('signup');
            if (el && 'IntersectionObserver' in window) {
              new IntersectionObserver(function (entries) {
                self.formInView = entries[0].isIntersecting;
              }, { threshold: 0.15 }).observe(el);
            }
          });
        },

        call: function (action, extra) {
          return api(action, Object.assign({ key: this.key, voterId: this.voterId }, extra || {}));
        },

        apply: function (res) {
          this.event = res.event || {};
          this.kitchenOn = (res.version || 1) >= 2;
          this.dishes = res.dishes || [];
          this.votes = res.votes || {};
          this.myVotes = res.myVotes || [];
          this.votingOpen = !!res.votingOpen;
          this.mine = this.dishes.filter(function (d) { return P.hasToken(d.id); }).map(function (d) { return d.id; });
          this.syncOther();
        },

        refresh: function (first) {
          var self = this;
          return this.call('load').then(function (res) {
            if (res && res.ok) {
              self.apply(res);
              self.status = 'ready';
              self.offline = false;
              store('odo:key', self.key);
            } else if (res && res.error === 'bad_key') {
              self.status = 'locked';
            } else if (first) {
              self.status = 'error';
            }
          }).catch(function () {
            if (first) self.status = 'error'; else self.offline = true;
          });
        },

        retry: function () { this.status = 'loading'; this.refresh(true); },

        // ---------- the table so far ----------
        count: function (key) {
          return this.dishes.filter(function (d) { return d.category === key; }).length;
        },

        get people() { return P.countPeople(this.dishes); },

        get summary() {
          var n = this.dishes.length;
          if (!n) return 'Nothing yet';
          return n + (n === 1 ? ' dish' : ' dishes') + ' from ' + this.people + (this.people === 1 ? ' cook' : ' cooks');
        },

        get nudge() {
          var n = this.dishes.length;
          if (!n) return 'The table is empty. Somebody has to go first, and it may as well be the weirdest dish.';
          if (n < 3) return 'Early days. Anything goes. (It always does.)';
          var core = this.dishes.filter(function (d) { return CORE.indexOf(d.category) >= 0; });
          var target = Math.max(1, Math.ceil(core.length / CORE.length));
          var targets = {};
          CORE.forEach(function (c) { targets[c] = target; });
          var gaps = P.computeGaps(this.dishes, targets);
          var top = gaps.slice().sort(function (a, b) { return b.count - a.count; })[0];
          var needed = P.neededCourses(this.dishes, targets);
          var thinnest = needed.length ? needed[0] : null;
          if (top.count >= 4 && top.count > core.length / 2) {
            return HEAVY[top.course] + ' Perfectly legal! But… ' + (thinnest ? THIN[thinnest.course] : '');
          }
          if (thinnest && top.count - thinnest.count >= 2) return THIN[thinnest.course];
          return 'Beautifully unbalanced in all the right ways. Carry on being odd.';
        },

        // ---------- sign up ----------
        get catNote() {
          var key = this.form.category;
          if (CORE.indexOf(key) < 0) return '';
          var self = this;
          var editingId = this.form.id;
          var others = this.dishes.filter(function (d) { return d.id !== editingId; });
          var here = others.filter(function (d) { return d.category === key; }).length;
          var most = Math.max.apply(null, CORE.map(function (c) {
            return c === key ? 0 : others.filter(function (d) { return d.category === c; }).length;
          }));
          if (here >= 3 && here > most) {
            return 'There are already ' + here + ' of these. Still allowed. Just saying.';
          }
          void self;
          return '';
        },

        get dupNote() {
          var name = this.form.dish.trim().toLowerCase();
          if (!name || this.form.mystery) return '';
          var id = this.form.id;
          var twin = this.dishes.find(function (d) {
            return d.id !== id && String(d.dish).trim().toLowerCase() === name;
          });
          return twin ? twin.name + ' is already bringing that. Twins are allowed, and a cook-off is very on theme.' : '';
        },

        // ---------- kitchen: oven clashes and food safety ----------
        tempLabel: function (t) { return t ? t + '°' : 'Just warming'; },

        minsLabel: function (m) {
          if (m < 60) return m + ' min';
          if (m === 60) return '1 hour';
          if (m === 90) return '1½ hours';
          return (m / 60) + ' hours';
        },

        get needHint() { return NEED_HINT[this.form.needs] || ''; },

        byNeed: function (key) {
          return this.dishes.filter(function (d) { return d.kitchen && d.kitchen.needs === key; });
        },

        get ovenDishes() {
          return this.byNeed('oven').sort(function (a, b) { return b.kitchen.temp - a.kitchen.temp; });
        },

        namesFor: function (key) {
          var self = this;
          return this.byNeed(key).map(function (d) { return self.title(d) + ' (' + d.name + ')'; }).join(', ');
        },

        get hasKitchenPlan() {
          return this.dishes.some(function (d) { return d.kitchen && d.kitchen.needs !== 'none'; });
        },

        get ovenVerdict() {
          var temps = {};
          this.ovenDishes.forEach(function (d) { if (d.kitchen.temp) temps[d.kitchen.temp] = true; });
          var list = Object.keys(temps);
          if (list.length >= 2) {
            return 'These want different temperatures, and one oven cannot do both at once. If yours can be cooked at home and reheated, the table thanks you.';
          }
          var total = this.ovenDishes.reduce(function (sum, d) { return sum + d.kitchen.mins; }, 0);
          if (total >= 120) return 'That is ' + this.minsLabel(total).replace('1½', '1.5') + ' of oven time on top of the bird. Cooking at home and reheating helps.';
          return '';
        },

        // Shown in the form the moment someone picks a temperature that clashes.
        get ovenNote() {
          var f = this.form;
          if (f.needs !== 'oven' || !f.temp) return '';
          var self = this;
          var clash = this.ovenDishes.find(function (d) { return d.id !== f.id && d.kitchen.temp && d.kitchen.temp !== f.temp; });
          if (!clash) return '';
          return clash.name + ' already has the oven at ' + clash.kitchen.temp + '° for ' + self.minsLabel(clash.kitchen.mins) +
            '. One oven cannot do both. Could yours cook at home and just warm up here?';
        },

        kitchenLabel: function (d) {
          var k = d.kitchen;
          if (!k || k.needs === 'none') return '';
          if (k.needs === 'cold') return '🧊 fridge';
          if (k.needs === 'hot') return '🍲 keep hot';
          return '🔥 ' + (k.temp ? k.temp + '°' : 'warm up') + ' · ' + this.minsLabel(k.mins);
        },

        toggleTag: function (t) {
          var i = this.form.tags.indexOf(t);
          if (i >= 0) this.form.tags.splice(i, 1); else this.form.tags.push(t);
        },

        submit: function () {
          var self = this;
          var f = this.form;
          this.formError = '';
          if (P.isSpamSubmission(f.website)) return;
          if (!f.name.trim()) { this.formError = this.guestList.length ? 'Who are you? Tap your name.' : 'Who are you? (Name, please.)'; return; }
          if (!f.mystery && !f.dish.trim()) { this.formError = 'What are you bringing? A working title is fine. Or flip the surprise switch.'; return; }
          if (!f.category) { this.formError = 'Pick the closest category. "Unclassifiable" is a real option.'; return; }
          if (this.kitchenOn && !f.needs) { this.formError = 'One more: what will it need when you get here?'; return; }
          if (this.kitchenOn && f.needs === 'oven' && (f.temp === null || f.mins === null)) { this.formError = 'How hot, and for how long?'; return; }

          var editing = !!f.id;
          var id = f.id || P.uuid();
          var token = editing ? P.tokenFor(id) : P.mintToken(id);
          var payload = {
            id: id, token: token,
            name: f.name.trim(), dish: f.mystery ? '' : f.dish.trim(), category: f.category,
            tags: f.tags.slice(), note: f.note.trim(),
            kitchen: f.needs === 'oven' ? { needs: 'oven', temp: f.temp, mins: f.mins } : { needs: f.needs }
          };
          this.saving = true;
          this.call(editing ? 'updateDish' : 'addDish', payload).then(function (res) {
            self.saving = false;
            if (!res || !res.ok) {
              if (!editing) P.forgetToken(id);
              self.formError = ERRORS[res && res.error] || 'That did not save. Try once more?';
              return;
            }
            store('odo:name', payload.name);
            self.apply(res);
            self.form = blankForm(payload.name);
            self.showDetails = false;
            self.syncOther();
            self.say(editing ? 'Updated. The menu stands corrected.' : 'You are on the menu!');
            if (!editing) self.celebrate();
            self.$nextTick(function () { self.scrollTo('dish-' + id); });
          }).catch(function () {
            self.saving = false;
            if (!editing) P.forgetToken(id);
            self.formError = 'Could not reach the sign-up sheet. Check your connection and try again.';
          });
        },

        isMine: function (id) { return this.mine.indexOf(id) >= 0; },

        edit: function (d) {
          this.form = {
            id: d.id, name: d.name, dish: d.dish || '', mystery: !d.dish, category: d.category,
            needs: d.kitchen ? d.kitchen.needs : '', temp: d.kitchen && d.kitchen.needs === 'oven' ? d.kitchen.temp : null,
            mins: d.kitchen && d.kitchen.needs === 'oven' ? d.kitchen.mins : null,
            tags: (d.tags || []).slice(), note: d.note || '', website: ''
          };
          this.showDetails = !!(this.form.tags.length || this.form.note);
          this.syncOther();
          this.formError = '';
          this.confirmRemove = null;
          this.scrollTo('signup');
        },

        cancelEdit: function () {
          this.form = blankForm(store('odo:name') || '');
          this.showDetails = false;
          this.syncOther();
          this.formError = '';
        },

        remove: function (d) {
          var self = this;
          this.saving = true;
          this.call('removeDish', { id: d.id, token: P.tokenFor(d.id) }).then(function (res) {
            self.saving = false;
            self.confirmRemove = null;
            if (!res || !res.ok) { self.say(ERRORS[res && res.error] || 'That did not work. Try again?'); return; }
            P.forgetToken(d.id);
            if (self.form.id === d.id) self.cancelEdit();
            self.apply(res);
            self.say('Withdrawn. The audition slot is open again.');
          }).catch(function () {
            self.saving = false;
            self.say('Could not reach the sign-up sheet. Try again?');
          });
        },

        // ---------- the lineup ----------
        get groups() {
          var self = this;
          if (this.votingOpen) {
            var ranked = this.dishes.slice().sort(function (a, b) {
              return (self.votes[b.id] || 0) - (self.votes[a.id] || 0);
            });
            return ranked.length ? [{ key: 'all', label: '', emoji: '', dishes: ranked }] : [];
          }
          return CATS.map(function (c) {
            return {
              key: c.key, label: c.label, emoji: c.emoji,
              dishes: self.dishes.filter(function (d) { return d.category === c.key; })
            };
          }).filter(function (g) { return g.dishes.length; });
        },

        // Guest names from the Sheet. When there are any, the form shows them
        // as a tap-to-pick list instead of a free-text name box.
        get guestList() {
          var raw = this.event.guests || [];
          var list = Array.isArray(raw) ? raw : String(raw).split(/[,;\n]/);
          var seen = {};
          return list.map(function (g) { return String(g).trim(); }).filter(function (g) {
            var k = g.toLowerCase();
            if (!k || seen[k]) return false;
            seen[k] = true;
            return true;
          });
        },

        pickName: function (g) {
          this.form.name = g;
          this.form.other = false;
          this.formError = '';
        },

        // Names offered in the form. Only the guest list, plus the existing name
        // when editing a dish the hosts entered under a name that is not on it.
        get nameOptions() {
          var list = this.guestList.slice();
          var name = this.form.name.trim();
          if (this.form.id && name && list.indexOf(name) < 0) list.push(name);
          return list;
        },

        // With a guest list, a remembered name that is not on it is dropped.
        syncOther: function () {
          var name = this.form.name.trim();
          if (this.guestList.length && !this.form.id && name && this.guestList.indexOf(name) < 0) this.form.name = '';
        },

        // Guests from the Sheet who have not signed up yet. A guest counts as
        // signed up when a dish's name matches theirs, or starts with it ("Jenn S.").
        get pending() {
          var guests = this.guestList;
          var signed = this.dishes.map(function (d) { return String(d.name).trim().toLowerCase(); });
          var seen = {};
          return guests.map(function (g) { return String(g).trim(); }).filter(function (g) {
            var k = g.toLowerCase();
            if (!k || seen[k]) return false;
            seen[k] = true;
            return !signed.some(function (n) {
              return n === k || n.indexOf(k + ' ') === 0 || n.split(/\s+/)[0] === k.split(/\s+/)[0];
            });
          });
        },

        claim: function (guest) {
          if (this.form.id) this.cancelEdit();
          this.form.name = guest;
          this.form.other = false;
          this.formError = '';
          this.scrollTo('signup');
        },

        cat: function (key) {
          return CATS.find(function (c) { return c.key === key; }) || CATS[CATS.length - 1];
        },

        title: function (d) {
          return d.dish || MYSTERY[this.cat(d.category).key];
        },

        voted: function (id) { return this.myVotes.indexOf(id) >= 0; },

        vote: function (d) {
          var self = this;
          var on = !this.voted(d.id);
          // optimistic: show it right away, the server reply settles it
          if (on) { this.myVotes.push(d.id); this.votes[d.id] = (this.votes[d.id] || 0) + 1; }
          else {
            this.myVotes = this.myVotes.filter(function (x) { return x !== d.id; });
            this.votes[d.id] = Math.max(0, (this.votes[d.id] || 1) - 1);
          }
          this.call('vote', { dishId: d.id, on: on }).then(function (res) {
            if (res && res.ok) self.apply(res);
            else { self.say(ERRORS[res && res.error] || 'Vote did not count. Try again?'); self.refresh(false); }
          }).catch(function () { self.say('Vote did not count. Try again?'); self.refresh(false); });
        },

        // ---------- spinner ----------
        spin: function () {
          var self = this;
          var ideas = window.ODO_IDEAS || [];
          if (!ideas.length || this.spinning) return;
          var pick = function () {
            var next;
            do { next = ideas[Math.floor(Math.random() * ideas.length)]; } while (ideas.length > 1 && next === self.idea);
            return next;
          };
          if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { this.idea = pick(); return; }
          this.spinning = true;
          var ticks = 0;
          var timer = setInterval(function () {
            self.idea = pick();
            if (++ticks >= 14) { clearInterval(timer); self.spinning = false; }
          }, 80);
        },

        // ---------- little helpers ----------
        get mapLink() { return this.event.address ? P.mapsUrl(this.event.address) : ''; },

        say: function (msg) {
          var self = this;
          this.toast = msg;
          clearTimeout(this._toastTimer);
          this._toastTimer = setTimeout(function () { self.toast = ''; }, 3500);
        },

        scrollTo: function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
          el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        },

        celebrate: function () {
          if (typeof window.confetti !== 'function') return;
          if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
          var colors = ['#FF5B35', '#9BC53D', '#FFC83D', '#8B5CF6', '#FF8FB1'];
          window.confetti({ particleCount: 90, spread: 75, origin: { y: 0.7 }, colors: colors });
          setTimeout(function () {
            window.confetti({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.8 }, colors: colors });
            window.confetti({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.8 }, colors: colors });
          }, 200);
        }
      };
    });
  });
})();
