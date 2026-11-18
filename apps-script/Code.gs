/**
 * Odd Dish Out: Google Sheet backend.
 *
 * Lives inside the sign-up spreadsheet (Extensions > Apps Script).
 * Run `setup` once, then deploy as a web app. See SETUP.md.
 *
 * Every request must carry the access key from the Settings tab.
 * Without it, nothing is returned and nothing is written.
 */

// Where the page is published. Used only to build the share link in Settings.
var SITE_URL = 'https://breakerfallen.github.io/odd-dish-out/';

var CATS = ['protein', 'green', 'carb', 'sweet', 'sip', 'wild'];
var DISH_HEADERS = ['id', 'name', 'dish', 'category', 'servings', 'tags', 'note', 'createdAt', 'tokenHash', 'kitchen'];
var KITCHEN_COL = 10;
var VOTE_HEADERS = ['voterId', 'dishId', 'at'];
var MAX_DISHES = 150;
var MAX_VOTES = 5000;
var CACHE_SECONDS = 10;

/* ------------------------------------------------------------------ */
/* One-time setup: run this from the Apps Script editor.               */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActive();

  var settings = ss.getSheetByName('Settings') || ss.insertSheet('Settings');
  if (settings.getLastRow() === 0) {
    settings.getRange(1, 1, 9, 3).setNumberFormat('@').setValues([
      ['setting', 'value', 'what it is'],
      ['accessKey', randomKey_(), 'The secret in the link. Change it to lock everyone out (then send the new link).'],
      ['eventDate', 'Thursday, November 26', 'Shown at the top of the page.'],
      ['eventTime', '', 'For example: Doors at 3, dinner at 5'],
      ['address', '', 'Shown as a tappable maps link. Leave empty to hide.'],
      ['poultry', 'TBD', 'What bird the hosts are making. TBD shows "to be determined".'],
      ['hostNote', '', 'Optional extra line under the date (parking, what to wear, etc).'],
      ['siteUrl', SITE_URL, 'Where the page lives.'],
      ['votingOpen', '', 'Tick the box on the day to open the rotation vote.']
    ]);
    settings.getRange('B9').setNumberFormat('General').insertCheckboxes();
    settings.getRange('A10').setValue('shareLink');
    settings.getRange('B10').setFormula('=B8&"#k="&B2');
    settings.getRange('C10').setValue('Text this link to the family. It updates if you change the key.');
    settings.getRange('A11:C11').setNumberFormat('@').setValues([['guests', '', 'Guest first names, separated by commas. Each shows as a blank in the lineup until they sign up.']]);
    settings.getRange('A1:C1').setFontWeight('bold');
    settings.setFrozenRows(1);
    settings.setColumnWidth(1, 120);
    settings.setColumnWidth(2, 380);
    settings.setColumnWidth(3, 520);
  }

  makeTable_(ss, 'Dishes', DISH_HEADERS);
  makeTable_(ss, 'Votes', VOTE_HEADERS);

  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(blank);

  CacheService.getScriptCache().remove('snap');
  ss.setActiveSheet(settings);
}

function makeTable_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function randomKey_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
}

/* ------------------------------------------------------------------ */
/* Web app entry points                                                */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: false, error: 'bad_key' });
}

function doPost(e) {
  var out;
  try {
    out = handle_(JSON.parse(e.postData.contents));
  } catch (err) {
    out = { ok: false, error: 'server' };
  }
  return json_(out);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  var action = String(req.action || '');
  var snap = snapshot_(false);

  var key = String(snap.settings.accessKey || '');
  if (key.length < 8 || String(req.key || '') !== key) return { ok: false, error: 'bad_key' };

  var voterId = idOk_(req.voterId) ? req.voterId : '';
  if (action === 'load') return state_(snap, voterId);
  if (['addDish', 'updateDish', 'removeDish', 'vote'].indexOf(action) < 0) return { ok: false, error: 'unknown_action' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(8000)) return { ok: false, error: 'busy' };
  try {
    snap = snapshot_(true);
    var err = write_(action, req, snap, voterId);
    if (err) return { ok: false, error: err };
    SpreadsheetApp.flush();
    return state_(snapshot_(true), voterId);
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Writes (always inside the lock)                                     */
/* ------------------------------------------------------------------ */

function write_(action, req, snap, voterId) {
  var ss = SpreadsheetApp.getActive();
  var sh, i, row;

  if (action === 'vote') {
    if (!snap.settings.votingOpen) return 'voting_closed';
    if (!voterId || !idOk_(req.dishId)) return 'missing_fields';
    if (!snap.dishes.some(function (d) { return d.id === req.dishId; })) return 'not_found';
    sh = ss.getSheetByName('Votes');
    for (i = snap.votes.length - 1; i >= 0; i--) {
      if (snap.votes[i].voterId === voterId && snap.votes[i].dishId === req.dishId) sh.deleteRow(snap.votes[i].row);
    }
    if (req.on) {
      if (snap.votes.length >= MAX_VOTES) return 'full';
      sh.getRange(sh.getLastRow() + 1, 1, 1, VOTE_HEADERS.length)
        .setValues([[voterId, req.dishId, new Date().toISOString()]]);
    }
    return '';
  }

  if (!idOk_(req.id) || !req.token) return 'missing_fields';
  sh = ss.getSheetByName('Dishes');
  // sheets made before the kitchen question existed lack this header
  if (!sh.getRange(1, KITCHEN_COL).getValue()) sh.getRange(1, KITCHEN_COL).setValue('kitchen').setFontWeight('bold');
  var hash = sha256_(String(req.token));
  var existing = null;
  snap.dishes.forEach(function (d) { if (d.id === req.id) existing = d; });

  if (action === 'removeDish') {
    if (!existing) return 'not_found';
    if (existing.tokenHash !== hash) return 'not_yours';
    sh.deleteRow(existing.row);
    var votes = ss.getSheetByName('Votes');
    for (i = snap.votes.length - 1; i >= 0; i--) {
      if (snap.votes[i].dishId === req.id) votes.deleteRow(snap.votes[i].row);
    }
    return '';
  }

  var name = text_(req.name, 40);
  var category = CATS.indexOf(req.category) >= 0 ? req.category : '';
  if (!name || !category) return 'missing_fields';
  var tags = (Array.isArray(req.tags) ? req.tags : []).slice(0, 6)
    .map(function (t) { return text_(t, 24).replace(/,/g, ''); })
    .filter(Boolean).join(', ');
  var servings = Math.max(0, Math.min(99, parseInt(req.servings, 10) || 0));
  var fields = [name, text_(req.dish, 80), category, servings ? String(servings) : '', tags, text_(req.note, 200)];

  if (action === 'addDish') {
    if (existing) return 'not_yours';
    if (snap.dishes.length >= MAX_DISHES) return 'full';
    row = [req.id].concat(fields, [new Date().toISOString(), hash, kitchenIn_(req.kitchen)]);
    sh.getRange(sh.getLastRow() + 1, 1, 1, DISH_HEADERS.length).setValues([row]);
    return '';
  }

  // updateDish
  if (!existing) return 'not_found';
  if (existing.tokenHash !== hash) return 'not_yours';
  sh.getRange(existing.row, 2, 1, fields.length).setValues([fields]);
  sh.getRange(existing.row, KITCHEN_COL).setValue(kitchenIn_(req.kitchen));
  return '';
}

/* ------------------------------------------------------------------ */
/* Reading the sheet                                                   */
/* ------------------------------------------------------------------ */

function snapshot_(fresh) {
  var cache = CacheService.getScriptCache();
  if (!fresh) {
    var hit = cache.get('snap');
    if (hit) return JSON.parse(hit);
  } else {
    cache.remove('snap');
  }

  var ss = SpreadsheetApp.getActive();
  var settings = {};
  rows_(ss.getSheetByName('Settings'), 2).forEach(function (r) {
    if (r[0]) settings[String(r[0]).trim()] = r[1];
  });
  var v = settings.votingOpen;
  settings.votingOpen = v === true || /^(true|yes|open|1)$/i.test(String(v).trim());

  var dishSheet = ss.getSheetByName('Dishes');
  var dishes = [];
  rows_(dishSheet, DISH_HEADERS.length).forEach(function (r, i) {
    var name = shown_(r[1]);
    var dish = shown_(r[2]);
    if (!name && !dish) return;
    var id = String(r[0] || '').trim();
    if (!id) {
      // a row typed in by hand: give it an id so votes can attach to it
      id = Utilities.getUuid();
      dishSheet.getRange(i + 2, 1).setValue(id);
    }
    dishes.push({
      row: i + 2,
      id: id,
      name: name,
      dish: dish,
      category: CATS.indexOf(String(r[3]).trim()) >= 0 ? String(r[3]).trim() : 'wild',
      servings: parseInt(r[4], 10) || 0,
      tags: String(r[5] || '').split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      note: shown_(r[6]),
      createdAt: String(r[7] || ''),
      tokenHash: String(r[8] || ''),
      kitchen: kitchenOut_(r[9])
    });
  });

  var votes = [];
  rows_(ss.getSheetByName('Votes'), VOTE_HEADERS.length).forEach(function (r, i) {
    if (r[0] && r[1]) votes.push({ row: i + 2, voterId: String(r[0]), dishId: String(r[1]) });
  });

  var snap = { settings: settings, dishes: dishes, votes: votes };
  try { cache.put('snap', JSON.stringify(snap), CACHE_SECONDS); } catch (e) { /* too big to cache: fine */ }
  return snap;
}

function rows_(sheet, width) {
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, width).getValues();
}

/** What a browser with the key is allowed to see. Edit-token hashes never leave the sheet. */
function state_(snap, voterId) {
  var known = {};
  snap.dishes.forEach(function (d) { known[d.id] = true; });
  var counts = {};
  var mine = [];
  snap.votes.forEach(function (v) {
    if (!known[v.dishId]) return;
    counts[v.dishId] = (counts[v.dishId] || 0) + 1;
    if (voterId && v.voterId === voterId) mine.push(v.dishId);
  });
  var s = snap.settings;
  return {
    ok: true,
    version: 2,
    event: {
      eventDate: String(s.eventDate || ''),
      eventTime: String(s.eventTime || ''),
      address: String(s.address || ''),
      poultry: String(s.poultry || ''),
      hostNote: String(s.hostNote || ''),
      guests: String(s.guests || '').split(/[,;\n]/).map(function (g) { return g.trim().slice(0, 40); }).filter(Boolean).slice(0, 80)
    },
    votingOpen: !!s.votingOpen,
    dishes: snap.dishes.map(function (d) {
      return {
        id: d.id, name: d.name, dish: d.dish, category: d.category,
        servings: d.servings, tags: d.tags, note: d.note, createdAt: d.createdAt, kitchen: d.kitchen
      };
    }),
    votes: counts,
    myVotes: mine
  };
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function idOk_(id) {
  return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);
}

/** Trim, cap the length, and stop a cell from ever being read as a formula. */
function text_(value, max) {
  var s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/** Undo the formula guard for display. */
function shown_(value) {
  var s = String(value == null ? '' : value).trim();
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

/**
 * What a dish needs from the kitchen on arrival, stored in one cell as
 * `none`, `cold`, `hot`, or `oven|350|60` (degrees F, minutes; 0 degrees = just warming).
 */
function kitchenIn_(k) {
  if (!k || typeof k !== 'object') return '';
  var needs = String(k.needs || '');
  if (['none', 'cold', 'hot'].indexOf(needs) >= 0) return needs;
  if (needs !== 'oven') return '';
  var temp = parseInt(k.temp, 10) || 0;
  var mins = parseInt(k.mins, 10) || 0;
  if (temp !== 0 && (temp < 150 || temp > 550)) temp = 0;
  mins = Math.max(5, Math.min(480, mins));
  return 'oven|' + temp + '|' + mins;
}

function kitchenOut_(cell) {
  var parts = String(cell == null ? '' : cell).trim().toLowerCase().split('|');
  if (['none', 'cold', 'hot'].indexOf(parts[0]) >= 0) return { needs: parts[0] };
  if (parts[0] === 'oven') return { needs: 'oven', temp: parseInt(parts[1], 10) || 0, mins: parseInt(parts[2], 10) || 0 };
  return null;
}

function sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); })
    .join('');
}
