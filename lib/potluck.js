/*
 * Potluck helpers, ported to plain JavaScript from jcirni/potluck-signup
 * (https://github.com/jcirni/potluck-signup), src/lib/gaps.ts, storage.ts,
 * honeypot.ts and maps.ts.
 *
 * MIT License. Copyright (c) 2026 Joseph Cirnigliaro.
 * Full text in THIRD-PARTY-LICENSES.md.
 */
(function () {
  'use strict';

  /** Per-category counts against target counts. `need` is 0 when covered. */
  function computeGaps(signups, targets) {
    return Object.keys(targets).map(function (course) {
      var count = signups.filter(function (s) { return s.category === course; }).length;
      var target = targets[course];
      return { course: course, count: count, target: target, need: Math.max(0, target - count) };
    });
  }

  /** Categories still short, most-needed first. */
  function neededCourses(signups, targets) {
    return computeGaps(signups, targets)
      .filter(function (g) { return g.need > 0; })
      .sort(function (a, b) { return b.need - a.need; });
  }

  /** Distinct people behind the signups: one person can bring several dishes. */
  function countPeople(signups) {
    var names = signups
      .map(function (s) { return String(s.name).trim().toLowerCase(); })
      .filter(Boolean);
    return new Set(names).size;
  }

  /** Same dish signed up more than once, grouped by name (case-insensitive). */
  function findDuplicates(signups) {
    var byName = new Map();
    signups.forEach(function (s) {
      var key = String(s.dish).trim().toLowerCase();
      if (!key) return;
      var group = byName.get(key) || [];
      group.push(s);
      byName.set(key, group);
    });
    var warnings = [];
    byName.forEach(function (group) {
      if (group.length < 2) return;
      warnings.push({ dish: group[0].dish, names: group.map(function (s) { return s.name; }) });
    });
    return warnings;
  }

  /** A filled honeypot field means a bot: the field is invisible to humans. */
  function isSpamSubmission(honeypotValue) {
    return String(honeypotValue || '').trim() !== '';
  }

  /** Maps link for an address: opens the maps app when installed, the web map otherwise. */
  function mapsUrl(location) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(location);
  }

  /*
   * Edit tokens: one per dish id, kept only in this browser. Minting is
   * idempotent: the backend stored the first token's hash, so replacing a
   * token would orphan the dish.
   */
  var TOKEN_KEY = 'odo:tokens:v1';

  function readTokens() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  function writeTokens(tokens) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens)); } catch (e) { /* private mode */ }
  }

  function mintToken(id) {
    var tokens = readTokens();
    if (tokens[id]) return tokens[id];
    var token = uuid();
    tokens[id] = token;
    writeTokens(tokens);
    return token;
  }

  function tokenFor(id) { return readTokens()[id]; }
  function hasToken(id) { return id in readTokens(); }

  function forgetToken(id) {
    var tokens = readTokens();
    delete tokens[id];
    writeTokens(tokens);
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  window.Potluck = {
    computeGaps: computeGaps,
    neededCourses: neededCourses,
    countPeople: countPeople,
    findDuplicates: findDuplicates,
    isSpamSubmission: isSpamSubmission,
    mapsUrl: mapsUrl,
    mintToken: mintToken,
    tokenFor: tokenFor,
    hasToken: hasToken,
    forgetToken: forgetToken,
    uuid: uuid
  };
})();
