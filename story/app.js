"use strict";

/* The front end, entire.

   It reads a case, shows one evening at a time, lets a player pick up the
   words that stand in its lines, and marks the report against hashes. It has
   no idea what a channel or a pin or an alibi is -- those live in how a case is made
   that proved the case -- and it must stay that way, because the moment this
   file knows how a case works there are two models of the same thing and
   they will disagree. */

const $ = id => document.getElementById(id);
let CASE = null, DAY = 1, SEEN = new Set(), FOUND = new Set(), MATCH = null;
let VERDICT = {}, VISIBLE = new Set(), ASIDE = [], FOLD = {}, DESK = [];
/* The memo's evidence: slot key -> the lines cited in it, as the page shows
   them. ACTIVE is the slot a line's cite button currently adds to. */
let CITE = {}, ACTIVE = null;
let GMATCH = null, NMATCH = null, GLOSS = {}, WHO = {};

/* "type"    -- the prose is plain, you type what you noticed into the report.
   "collect" -- every word is a button, clicking picks it up, a blank offers
                what you picked up. Parked rather than deleted: it is the
                first thing that was built and the comparison is worth being
                able to make by playing.

   The gate in "type" mode is NOT a list you ticked. It is the prose you hold:
   anything standing in an evening you have opened may be typed, whether or
   not you ever consciously noticed it. That matters for the case a collected
   word list cannot express -- the player who works something out from lines
   nobody meant to be read together, and would otherwise be unable to write
   down an answer he has actually earned. */
let MODE = recall("_", "mode", "type");
const typing = () => MODE === "type";

/* HOW MUCH EVIDENCE THE REPORT ASKS FOR (the three levels): "notes",
   "report" or "court". One setting for the whole game, and it only means
   anything in a chapter whose report has people to rule out. */
let LEVEL = recall("_", "level", "report");
const levelOf = () => (CASE && CASE.memo &&
  CASE.memo.levels.find(l => l.id === LEVEL)) ? LEVEL : "report";

/* Same construction as the seal in the case builder. The solution is not in
   the file that ships; only its hash is, so it cannot be read off the disk
   by anybody who thinks of opening the case folder. */
async function seal(parts) {
  const raw = parts.map(p => String(p).trim().toLowerCase()).join("|");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));

/* The manual and the settings: two sheets over the page. The manual opens by
   itself the first time the game is opened in a browser, and never again
   unless asked for. */
function sheets() {
  const show = id => { $(id).hidden = false; $(id).querySelector(".closer").focus(); };
  $("openmanual").onclick = () => show("manual");
  $("opensettings").onclick = () => show("settings");
  /* READING THE WHOLE FILE IS NOT A WAY TO PLAY (the user, 14 September
     2026), so it is no longer in Settings or the manual. Ctrl+Shift+F turns it
     on and off, for us and for review; the cold-read packets are the file for
     strangers. */
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
      e.preventDefault();
      setReadAll(!recall("_", "readall", false));
    }
  });
  document.querySelectorAll(".sheet-modal").forEach(m => {
    m.onclick = e => { if (e.target === m) m.hidden = true; };
    /* the × at the top, and at the foot of a long sheet a Close, so nobody
       scrolls back up for it (the user, 15 September 2026) */
    m.querySelectorAll(".closer, .closer-foot").forEach(b => b.onclick = () => { m.hidden = true; });
  });
  if (!recall("_", "manualseen", false)) {
    remember("_", "manualseen", true);
    show("manual");
  }
}

/* Starting over: every chapter's walk -- where Sarah is, what she has heard
   and seen, whom she has asked what, how much time everybody has left -- and
   which evenings are open and which lines are ticked off. Notes and report are
   kept. Ctrl+Shift+R does it and reloads, for testing; Settings has a button. */
function startOver() {
  try {
    for (const k of Object.keys(localStorage))
      if (/^faelle\.[^.]+\.(walk|heard|days|aside|noted|fold|desk)$/.test(k)) localStorage.removeItem(k);
  } catch (e) {}
  location.reload();
}

async function boot() {
  sheets();
  const feedback = feedbackSheet();
  $("invitefeedback").onclick = feedback;
  document.addEventListener("keydown", e => {
    if (e.ctrlKey && e.shiftKey && (e.key === "R" || e.key === "r")) {
      e.preventDefault();
      startOver();
    }
  });
  $("startover").onclick = () => {
    if (confirm("Start every walk over? What Sarah has heard and asked is forgotten; your notes and report are kept.")) startOver();
  };
  document.addEventListener("click", e => { if (!tipBoxes().some(b => b.contains(e.target))) untip(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") untip(); });
  window.addEventListener("scroll", untip, true);
  window.addEventListener("resize", () => { if (DESKPLACE) DESKPLACE(); });

  const index = await (await fetch("cases/index.json")).json();
  /* The series in its order, with the chapters that are only a name so far
     standing in their places, shut. The sampler has no number. */
  /* THREE SEASONS (the user, 17 September 2026), by the year a chapter is set
     in: 1968-69, 1970, 1971-72. */
  const SEASONS = [["Season one", "1968–1969", y => y <= 1969],
                   ["Season two", "1970", y => y === 1970],
                   ["Season three", "1971–1972", y => y >= 1971]];
  const yearOf = c => +((String(c.stated).match(/\d{4}/g) || ["0"]).pop());
  const button = c =>
    `<button data-id="${c.id}"${c.built ? "" : " disabled"} class="${c.built ? "" : "tocome"}">` +
    `<span class="num">${c.n === null ? "·" : c.n}</span>${esc(c.title)}` +
    (c.german ? ` <i class="de">${esc(c.german)}</i>` : "") +
    `<small>${esc(c.stated)}${c.built ? "" : c.held ? " · not in this sample" : " · not yet written"}</small></button>`;
  $("cases").innerHTML = SEASONS.map(([name, years, has]) => {
    const cs = index.filter(c => has(yearOf(c)));
    return cs.length ? `<div class="season"><h3>${name} <span>${years}</span></h3>` +
      `<div class="seasoncases">${cs.map(button).join("")}</div></div>` : "";
  }).join("");
  $("cases").querySelectorAll("button:not([disabled])").forEach(b =>
    b.onclick = () => load(b.dataset.id));
  load((index.find(c => c.opens) || index.find(c => c.built)).id);
}

/* The introduction folds away, per chapter, and the question stays (the user,
   14 September 2026: "so that I can actually work on the notebook and the
   report"). The walk's cover note folds with it. */
function briefShut(shut) {
  remember(CASE.id, "briefshut", shut);
  document.body.classList.toggle("brief-shut", shut);
  $("brieftoggle").textContent = shut ? "Show the introduction" : "Hide the introduction";
  $("brieftoggle").setAttribute("aria-expanded", String(!shut));
}

async function load(id) {
  CASE = await (await fetch(`cases/${id}.json`)).json();
  DAY = 1;
  VERDICT = {};
  SEEN = new Set(recall(id, "days", [1]));
  const known = new Set(CASE.words.map(w => w.text));
  FOUND = new Set(recall(id, "words", []).filter(w => known.has(w)));
  ASIDE = recall(id, "aside", []);
  FOLD = recall(id, "fold", {});
  DESK = recall(id, "desk", []);
  CITE = recall(id, "cites", {});
  /* The report's rows are cited by position (row0, row1 ...), and the rows
     were put in the house's order on 18 September 2026. A save keeps the row
     ids it was made with, and a citation follows its row to its new place; a
     save from before that has no ids, and its row citations are dropped
     rather than handed to whoever now stands in that position. */
  if (CASE.memo) {
    const ids = CASE.memo.rows.map(r => r.id);
    const was = recall(id, "rowids", null);
    if (JSON.stringify(was) !== JSON.stringify(ids)) {
      const moved = {};
      for (const [k, v] of Object.entries(CITE)) {
        const m = /^row(\d+)$/.exec(k);
        if (!m) { moved[k] = v; continue; }
        const at = was ? ids.indexOf(was[+m[1]]) : -1;
        if (at >= 0) moved[`row${at}`] = v;
      }
      CITE = moved;
      remember(id, "cites", CITE);
      remember(id, "rowids", ids);
    }
  }
  citing(null);
  $("notes").value = recall(id, "notes", "");
  $("notes").oninput = () => remember(id, "notes", $("notes").value);
  MATCH = matcher(CASE.words.map(w => w.text));

  /* Two more things in a line can be looked at without being collected: a
     German term, and a person. Neither is evidence and neither can be picked
     up -- they explain what a player is reading, which is not the same as
     telling him anything. */
  GLOSS = {}; WHO = {};
  for (const t of CASE.glossary || [])
    for (const v of [t.term, ...(t.also || [])]) GLOSS[v.toLowerCase()] = t;
  for (const d of CASE.dossiers || []) {
    WHO[d.who.toLowerCase()] = d;
    WHO[d.who.split(/\s+/).pop().toLowerCase()] = d;
  }
  GMATCH = Object.keys(GLOSS).length ? matcher(Object.keys(GLOSS)) : null;
  NMATCH = Object.keys(WHO).length ? matcher(Object.keys(WHO)) : null;
  /* the English name first, the German one under it (14 September 2026) */
  $("title").textContent = CASE.subtitle || CASE.title;
  $("subtitle").textContent = CASE.subtitle ? CASE.title : "";
  $("preamble").innerHTML = marked(CASE.preamble, false);
  briefShut(recall(CASE.id, "briefshut", false));
  $("brieftoggle").onclick = () =>
    briefShut(!document.body.classList.contains("brief-shut"));
  $("question").innerHTML = marked(CASE.question, false);
  annotate($("brief"));
  $("cases").querySelectorAll("button").forEach(b =>
    b.classList.toggle("on", b.dataset.id === id));
  ["brief", "evenings", "desk"].forEach(s => $(s).hidden = false);
  modeswitch();
  people();
  /* walk.js, when the chapter can be walked: it decides which lines have
     reached the player, so it has to be told before anything is drawn */
  if (typeof walkStart === "function") walkStart();
  /* A line rewritten since it was cited (the voices, 14 September 2026) would
     match no seal and quietly count for nothing; drop it, so the report never
     shows a chip that cannot earn a mark. What people said besides stays
     (walk.js, said), and so does nothing of the old "cite this part", which
     rule 2 does by itself now. After walkStart, which knows what was said. */
  {
    const lines = new Set(CASE.days.flatMap(d => d.sections.flatMap(s => s.lines)));
    const spoken = typeof W !== "undefined" && W
      ? new Set(Object.values(W.log).flat().map(([, t]) => t)) : new Set();
    for (const k of Object.keys(CITE))
      CITE[k] = CITE[k].filter(t => lines.has(t) || spoken.has(t));
  }
  report();
  draw();
}

/* The lines a player holds: all of them when reading the file, only those
   heard or seen when walking the building (walk.js). */
const holds = t => typeof walking !== "function" || !walking() || HEARD.has(t);

/* The dossiers. Character, never a clue -- so the words in them are NOT
   marked and cannot be picked up: the dossier rules refuses a dossier that
   places somebody, dates them, or contains an answer, and a page that let a
   player collect out of one would make it evidence by the back door. */
function people(){
  const who = CASE.dossiers || [];
  $("people").hidden = !who.length;
  $("people").innerHTML = who.length
    ? `<h2>Who they are</h2>` + who.map(d =>
        `<details><summary>${esc(d.who)}</summary>${portrait(d)}</details>`)
        .join("")
    : "";
  annotate($("people"));
}

/* The drawing beside the words, the way the duty sheet does it. Nothing is
   painted for this game yet, so a person without a picture simply reads as
   text and the layout does not collapse when the art arrives. */
function portrait(d) {
  const img = d.sprite
    ? `<img class="sprite" src="${esc(d.sprite)}" alt="">` : "";
  return `<div class="person">${img}<p>${marked(d.en, false)}</p></div>`;
}

/* A word is found where it stands: whole words, any case, the longest first
   so that a short word never splits a long one. The same rule as occurs() in
   the answer sheet itself, which is the page the checks read. */
function matcher(texts) {
  const re = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alts = [...texts].sort((a, b) => b.length - a.length).map(re).join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}_])(${alts})(?![\\p{L}\\p{N}_])`, "giu");
}

const canon = t => CASE.words.find(w => w.text.toLowerCase() === t.toLowerCase()).text;

/* A line can carry three kinds of thing at once and they overlap: "the
   Dienstaltersliste" is a collectable word AND a German term, and Kern is a
   word AND a person. So they are gathered in one pass and the longest match
   at a position wins, with a collectable word beating the rest because that
   is the only one the game is played with. */
const RANK = {word: 0, who: 1, term: 2};

function spans(text, collectable) {
  const out = [];
  const add = (re, kind) => {
    if (!re) return;
    for (const m of text.matchAll(re))
      out.push({s: m.index, e: m.index + m[0].length, kind, t: m[0]});
  };
  if (collectable && !typing()) add(MATCH, "word");
  add(NMATCH, "who");
  add(GMATCH, "term");
  out.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s)
                     || RANK[a.kind] - RANK[b.kind]);
  const keep = [];
  let at = 0;
  for (const sp of out) if (sp.s >= at) { keep.push(sp); at = sp.e; }
  return keep;
}

/* `collectable` is false for the preamble, the question and the dossiers.
   A word is only ever picked up out of a dealt line -- the answer sheet decides what
   is found where, and it looks at the dealt lines and nothing else -- so a
   word button anywhere else would be a word the checks do not know exists.
   The glosses and the people still go everywhere, because explaining what a
   player is reading is not the same as telling him something. */
function marked(text, collectable = true) {
  let out = "", at = 0;
  for (const sp of spans(text, collectable)) {
    out += esc(text.slice(at, sp.s));
    const inner = esc(sp.t);
    if (sp.kind === "word") {
      const w = canon(sp.t);
      out += `<button class="word${FOUND.has(w) ? " got" : ""}" data-w="${
        esc(w)}">${inner}</button>`;
    } else {
      out += `<span class="${sp.kind}" data-k="${esc(sp.t.toLowerCase())}">${
        inner}</span>`;
    }
    at = sp.e;
  }
  return out + esc(text.slice(at));
}

/* One floating note for both kinds. It is shown on hover and on click, because
   hover is not a thing on a tablet, and it never contains anything collectable
   -- a dossier that could be mined would be evidence by the back door. */
/* A CARD ON A CARD (the user, 14 September 2026: "Oberregierungsrat" in Grau's
   card opened a card that vanished at once, and took his with it). There was
   one box: the inner word rewrote it and moved it out from under the pointer,
   which is leaving it. Now a word inside a card opens the next card up, and
   every card stays until the pointer has left all of them. */
function tipBox(level) {
  if (level === 0) return $("tip");
  let b = $(`tip${level}`);
  if (!b) {
    b = document.createElement("div");
    b.id = `tip${level}`;
    b.className = "tipcard";
    b.hidden = true;
    document.body.appendChild(b);
  }
  return b;
}
const tipBoxes = () => [$("tip"), ...document.querySelectorAll(".tipcard")];

function tip(el, level = 0) {
  const k = el.dataset.k;
  const g = el.classList.contains("term") ? GLOSS[k] : null;
  const d = el.classList.contains("who") ? WHO[k] : null;
  if (!g && !d) return;
  for (const b of tipBoxes()) if (b !== $("tip") && +b.id.slice(3) > level) b.hidden = true;
  const box = tipBox(level);
  box.innerHTML = g
    ? `<b>${esc(g.term)}</b> <i>${esc(g.short)}</i><p>${esc(g.long)}</p>`
    : `<b>${esc(d.who)}</b>${portrait(d)}`;
  box.dataset.k = k;
  const r = el.getBoundingClientRect();
  box.style.zIndex = 90 + level;
  box.hidden = false;
  const w = box.offsetWidth, h = box.offsetHeight;
  box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8,
                                        r.left + (level ? 12 : 0))) + "px";
  /* under the word if it fits, else over it, else as low as the window allows */
  const below = r.bottom + 6, above = r.top - h - 6;
  box.style.top = (below + h <= window.innerHeight - 8 ? below
    : above >= 8 ? above : Math.max(8, window.innerHeight - h - 8)) + "px";
  clearTimeout(TIPCLOSE);
  box.onmouseenter = () => clearTimeout(TIPCLOSE);
  box.onmouseleave = untipSoon;
  /* A CARD NEVER OPENS ITSELF (the user, 17 September 2026): "Sarah Wessen"
     in Sarah's own card opened her card again, and again. A name or a word
     whose card is already open in the stack is plain text in the card above. */
  const open = new Set(tipBoxes().filter(b => !b.hidden).map(b => b.dataset.k));
  box.querySelectorAll(".term,.who").forEach(inner => {
    if (open.has(inner.dataset.k)) { inner.className = ""; return; }
    inner.onmouseenter = () => { clearTimeout(TIPCLOSE); tip(inner, level + 1); };
    inner.onclick = e => { e.stopPropagation(); tip(inner, level + 1); };
  });
}

let TIPCLOSE = null;
const untip = () => { clearTimeout(TIPCLOSE); tipBoxes().forEach(b => b.hidden = true); };
/* leaving a word gives the pointer a moment to reach the card */
const untipSoon = () => { clearTimeout(TIPCLOSE); TIPCLOSE = setTimeout(untip, 250); };

function annotate(root) {
  root.querySelectorAll(".term,.who").forEach(el => {
    el.onmouseenter = () => tip(el);
    el.onmouseleave = untipSoon;
    el.onclick = e => { e.stopPropagation(); tip(el); };
  });
}

/* Every word standing in an evening the player has opened. This is what a
   blank will accept in typed mode, and it is deliberately not "every word in
   the case": a datalist holding all 23 times of the murder on the first
   evening would announce that the Sunday exists and roughly what is in it. */
function onPagesRead() {
  const out = new Set();
  for (const d of CASE.days) {
    if (!SEEN.has(d.n)) continue;
    for (const s of d.sections) {
      const lines = s.lines.filter(holds);
      if (!lines.length) continue;
      for (const t of [s.where, ...lines])
        for (const m of t.matchAll(MATCH)) out.add(canon(m[0]));
    }
  }
  return out;
}

function draw() {
  /* An evening you have not reached yet is not hidden, it is shut, and it
     says which evening it is. A player who knows there are three nights
     reads the first one differently, and that is the intended experience
     rather than a leak. */
  $("daytabs").innerHTML = CASE.days.map(d =>
    `<button data-n="${d.n}" class="${d.n === DAY ? "on" : ""}${
      d.n > unlocked() ? " shut" : ""}">${d.name}</button>`).join("");
  $("daytabs").querySelectorAll("button").forEach(b => b.onclick = () => {
    const n = +b.dataset.n;
    if (n > unlocked()) return;
    DAY = n; draw();
  });

  const day = CASE.days.find(d => d.n === DAY);
  $("daynote").textContent = day.note || "";

  /* Ticking a line off, as on the duty sheet. A line you have finished with
     leaves its section for "Done with" at the foot of the evening, under the
     same heading it stood under (the user, 15 September 2026: the done lines
     keep their places and people, as the open ones do), and ↺ brings it back.
     Nothing ticks itself off here: the duty sheet can see when a line is
     spent, and this page knows nothing about what a line means. */
  const off = new Set(ASIDE);
  const tick = (t, done) =>
    `<button class="tick" data-t="${esc(t)}" title="${done
      ? "Bring this line back" : "Done with this line"}">${done ? "↺" : "✓"}</button>`;
  /* Citing, when the report is a memo: while an evidence slot is open every
     line carries a button that puts it in that slot. */
  const cite = t => CASE.memo
    ? `<button class="cite" data-t="${esc(t)}" title="Cite this line as evidence">＋</button>`
    : "";
  /* the chapter's lines, and what people said besides, under whoever said it
     (walk.js, said) */
  const talk = typeof said === "function" && walking() ? said(DAY) : [];
  const spoken = new Set(talk.map(x => x.text));
  const sections = day.sections.map(s => ({where: s.where, lines: s.lines.slice()}));
  for (const x of talk) {
    let s = sections.find(s => s.where.toLowerCase() === x.who.toLowerCase());
    if (!s) sections.push(s = {where: x.who.charAt(0).toUpperCase() + x.who.slice(1), lines: []});
    s.lines.push(x.text);
  }
  const shows = t => holds(t) || spoken.has(t);
  const onDesk = new Set(DESK.map(c => c.t));
  const live = sections.map(s => [s, s.lines.filter(t => !off.has(t) && !onDesk.has(t) && shows(t))])
    .filter(([, ls]) => ls.length);
  const gone = sections.map(s => [s, s.lines.filter(t => off.has(t) && shows(t))])
    .filter(([, ls]) => ls.length);
  /* FOLDING A HEADING AWAY (the user, 15 September 2026). Every heading is
     open until it is folded, and a folded one opens again by itself as soon
     as a line stands under it that did not when it was folded: FOLD keeps,
     per evening and heading, the lines it held then. */
  const underIt = {};
  const pin = (t, where) => `<button class="pin" data-t="${esc(t)}" data-w="${
    esc(where)}" title="Put this line on the desk">⇡</button>`;
  const group = (key, where, ls, done) => {
    underIt[key] = ls;
    const was = FOLD[key];
    const shut = !!was && ls.every(t => was.includes(t));
    if (was && !shut) delete FOLD[key];
    return `<section class="where${done ? " aside" : ""}${shut ? " folded" : ""}"><h3>` +
      `<button class="fold" data-k="${esc(key)}" aria-expanded="${!shut}" title="${
        shut ? "Open" : "Fold away"}">${shut ? "▶" : "▼"}</button>${marked(where)}${
        shut ? ` <span class="nfold">(${ls.length})</span>` : ""}</h3>${shut ? "" : `<ul>${
      ls.map(t => `<li>${cite(t)}${done ? "" : pin(t, where)}${tick(t, done)}${
        marked(t)}</li>`).join("")}</ul>`}</section>`;
  };
  const goneN = gone.reduce((n, [, ls]) => n + ls.length, 0);
  $("sections").innerHTML =
    live.map(([s, ls]) => group(`${DAY}:${s.where}`, s.where, ls, false)).join("") +
    (goneN ? `<div class="asides"><h3 class="asidehead">Done with (${goneN})</h3>${
      gone.map(([s, ls]) => group(`${DAY}:done:${s.where}`, s.where, ls, true)).join("")}</div>` : "");
  remember(CASE.id, "fold", FOLD);
  $("sections").querySelectorAll(".fold").forEach(b => b.onclick = () => {
    const k = b.dataset.k;
    if (FOLD[k]) delete FOLD[k]; else FOLD[k] = underIt[k];
    remember(CASE.id, "fold", FOLD);
    draw();
  });
  $("sections").querySelectorAll(".pin").forEach(b => b.onclick = () => {
    DESK.push({t: b.dataset.t, w: b.dataset.w, x: 0, y: deskFloor()});
    remember(CASE.id, "desk", DESK);
    draw();
  });
  desk(cite);
  $("sections").querySelectorAll(".word").forEach(b =>
    b.onclick = () => pick(b.dataset.w));
  $("sections").querySelectorAll(".tick").forEach(b => b.onclick = () => {
    const t = b.dataset.t;
    ASIDE = off.has(t) ? ASIDE.filter(x => x !== t) : [t, ...ASIDE];
    remember(CASE.id, "aside", ASIDE);
    draw();
  });
  $("sections").querySelectorAll(".cite").forEach(b => b.onclick = () => {
    if (!ACTIVE) return;
    const list = CITE[ACTIVE] || (CITE[ACTIVE] = []);
    if (!list.includes(b.dataset.t)) list.push(b.dataset.t);
    remember(CASE.id, "cites", CITE);
    say(ACTIVE, "", "");
    report();
  });
  annotate($("sections"));

  /* Reading an evening is what opens the next one. There is no clock here
     yet and no cost to asking -- that is the duty sheet's mechanic and it
     belongs in this game too, but a skeleton that pretends to have it would
     be a skeleton nobody could test. */
  const before = SEEN.size;
  SEEN.add(DAY);
  remember(CASE.id, "days", [...SEEN]);
  /* Opening an evening is what makes its words writable, so the report has to
     be told. Without this a player reads the Sunday and then cannot type a
     word he has just read. */
  if (SEEN.size !== before) report();
}

/* THE DESK (the user, 17 September 2026): the lines a player lays out by hand,
   from any evening, where they put them -- the registry's book beside the
   porter's, one person's word beside another's. Nothing on it is read by the
   game; it is the notebook's lists rearranged, and a line on the desk is off
   its list until ⇣ puts it back. x is a fraction of the desk's width, so a
   layout survives a narrower window; y is in pixels, and the desk grows to hold
   its lowest card. The last card in DESK lies on top. */
const deskCards = () => [...$("sarahsdesk").querySelectorAll(".card")];

/* where a newly laid card goes: under everything already there */
function deskFloor() {
  return deskCards().reduce((m, c) => Math.max(m, c.offsetTop + c.offsetHeight + 8), 8);
}

function desk(cite) {
  const box = $("sarahsdesk");
  const shows = t => holds(t) || (typeof said === "function" && walking()
    && CASE.days.some(d => said(d.n).some(x => x.text === t)));
  DESK = DESK.filter(c => shows(c.t) && !ASIDE.includes(c.t));
  box.innerHTML = DESK.length ? DESK.map((c, i) =>
    `<div class="card" data-i="${i}">` +
    `<div class="grip" title="Drag to move it"><span>${esc(c.w)}</span>${cite(c.t)}` +
    `<button class="deskbtn back" title="Put it back in the list">⇣</button>` +
    `<button class="deskbtn done" title="Done with this line">✓</button></div>` +
    `<p>${marked(c.t)}</p></div>`).join("")
    : `<div class="empty">⇡ beside a line lays it here, beside lines from any evening.</div>`;
  const place = () => {
    const W = box.clientWidth;
    let bottom = 64;
    deskCards().forEach(el => {
      const c = DESK[+el.dataset.i];
      const w = el.offsetWidth;
      el.style.left = Math.max(0, Math.min(W - w, c.x * W)) + "px";
      el.style.top = Math.max(0, c.y) + "px";
      bottom = Math.max(bottom, c.y + el.offsetHeight + 8);
    });
    box.style.height = bottom + "px";
  };
  place();
  DESKPLACE = place;
  /* CLOSE THE GAPS (the user, 17 September 2026: a desk half empty after a few
     cards went back). Top to bottom, every card rises until it meets a card
     under which it lies, left and right as it was; the pile keeps its order. */
  $("squeeze").hidden = !DESK.length;
  $("squeeze").onclick = () => {
    const els = deskCards(), W = box.clientWidth || 1;
    const r = els.map(el => ({c: DESK[+el.dataset.i], l: el.offsetLeft,
                              w: el.offsetWidth, h: el.offsetHeight}))
      .sort((a, b) => a.c.y - b.c.y);
    const done = [];
    for (const k of r) {
      k.c.y = done.filter(o => o.l < k.l + k.w && k.l < o.l + o.w)
        .reduce((m, o) => Math.max(m, o.c.y + o.h + 8), 8);
      k.c.x = k.l / W;
      done.push(k);
    }
    save(); draw();
  };
  const save = () => remember(CASE.id, "desk", DESK);
  deskCards().forEach(el => {
    const i = +el.dataset.i, c = DESK[i];
    el.querySelector(".back").onclick = () => { DESK.splice(i, 1); save(); draw(); };
    el.querySelector(".done").onclick = () => {
      DESK.splice(i, 1); ASIDE = [c.t, ...ASIDE];
      remember(CASE.id, "aside", ASIDE); save(); draw();
    };
    const grip = el.querySelector(".grip");
    grip.onpointerdown = e => {
      if (e.target.closest("button")) return;
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      el.classList.add("lifted");
      const W = box.clientWidth, x0 = e.clientX, y0 = e.clientY;
      const left0 = el.offsetLeft, top0 = el.offsetTop;
      grip.onpointermove = m => {
        const left = Math.max(0, Math.min(W - el.offsetWidth, left0 + m.clientX - x0));
        const top = Math.max(0, top0 + m.clientY - y0);
        el.style.left = left + "px"; el.style.top = top + "px";
        box.style.height = Math.max(box.offsetHeight - 4, top + el.offsetHeight + 8) + "px";
      };
      grip.onpointerup = grip.onpointercancel = () => {
        grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
        c.x = W ? el.offsetLeft / W : 0; c.y = el.offsetTop;
        /* the card handled last lies on top */
        DESK.splice(i, 1); DESK.push(c);
        save(); draw();
      };
    };
  });
  box.querySelectorAll(".cite").forEach(b => b.onclick = () => {
    if (!ACTIVE) return;
    const list = CITE[ACTIVE] || (CITE[ACTIVE] = []);
    if (!list.includes(b.dataset.t)) list.push(b.dataset.t);
    remember(CASE.id, "cites", CITE);
    say(ACTIVE, "", "");
    report();
  });
  box.querySelectorAll(".word").forEach(b => b.onclick = () => pick(b.dataset.w));
  annotate(box);
}
let DESKPLACE = null;

/* A SETTING, not an experiment: some players want the help and some want the
   page to stay silent, and the difference is how much of the finding the game
   does for you. It is remembered across cases. */
function modeswitch() {
  const b = $("modeswitch");
  b.textContent = typing() ? "Typing the report" : "Collecting words";
  b.title = typing()
    ? "Nothing in the prose is marked. Switch to have every word made clickable."
    : "Every word is clickable. Switch to read for them yourself and type them in.";
  b.onclick = () => {
    MODE = typing() ? "collect" : "type";
    remember("_", "mode", MODE);
    modeswitch(); draw(); report();
  };
  /* the level: a changed level marks nothing that was marked under the old
     one, since the marks meant something else there */
  const s = $("levelswitch");
  s.hidden = !(CASE && CASE.memo);
  if (s.hidden) return;
  s.innerHTML = CASE.memo.levels.map(l =>
    `<option value="${l.id}" title="${esc(l.says)}">${esc(l.name)}</option>`).join("");
  s.value = levelOf();
  s.title = CASE.memo.levels.find(l => l.id === levelOf()).says;
  s.onchange = () => {
    LEVEL = s.value;
    remember("_", "level", LEVEL);
    VERDICT = {};
    citing(null);
    modeswitch(); report(); tally();
  };
}

const unlocked = () => Math.min(CASE.days.length, Math.max(...SEEN, 1) + 1);

function pick(w) {
  if (FOUND.has(w)) return;
  FOUND.add(w);
  remember(CASE.id, "words", [...FOUND]);
  document.querySelectorAll("#sections .word, #sarahsdesk .word").forEach(b =>
    b.classList.toggle("got", FOUND.has(b.dataset.w)));
  report();
}

/* The report. Each blank offers only the words of its kind that the player
   has picked up, so a word from an evening he has not reached cannot go in
   it, however good the guess. */
function datalists() {
  const kinds = [...new Set(CASE.parts.flatMap(p => p.kinds))];
  return kinds.map(k => `<datalist id="dl-${k}">${
    CASE.words.filter(w => w.kind === k && VISIBLE.has(w.text))
      .map(w => w.text).sort((a, b) => a.localeCompare(b))
      .map(t => `<option value="${esc(t)}">`).join("")}</datalist>`).join("");
}

function report() {
  tally();
  if (CASE.memo) return memo();
  const kept = {};
  $("parts").querySelectorAll("select,input.blank").forEach(s => kept[s.id] = s.value);
  VISIBLE = typing() ? onPagesRead() : FOUND;
  $("count").textContent = typing()
    ? `Words in what you have read so far: ${VISIBLE.size}`
    : `Words picked up: ${FOUND.size} of ${CASE.words.length}`;
  $("parts").innerHTML = (typing() ? datalists() : "") + CASE.parts.map(p => {
    const bits = esc(p.text).split("___");
    const sentence = bits.map((bit, n) =>
      n < bits.length - 1 ? bit + blank(p, n) : bit).join("");
    const v = VERDICT[p.id] || ["", ""];
    return `<div class="part"><h3>${esc(p.title)}</h3><p>${sentence}</p>
      <button class="sign" data-id="${p.id}">Sign</button>
      <p class="verdict ${v[1]}" id="verdict-${p.id}">${v[0]}</p></div>`;
  }).join("");
  $("parts").querySelectorAll("select").forEach(s => {
    if (kept[s.id] && [...s.options].some(o => o.value === kept[s.id]))
      s.value = kept[s.id];
    s.onchange = () => say(s.dataset.part, "", "");
  });
  $("parts").querySelectorAll("input.blank").forEach(i => {
    if (kept[i.id]) i.value = kept[i.id];
    i.oninput = () => say(i.dataset.part, "", "");
  });
  $("parts").querySelectorAll(".sign").forEach(b =>
    b.onclick = () => sign(b.dataset.id));
}

function blank(p, n) {
  const kind = p.kinds[n];
  if (typing())
    return `<input class="blank" id="b-${p.id}-${n}" data-part="${p.id}" ` +
      `list="dl-${kind}" placeholder="${kind}" aria-label="${kind}" ` +
      `autocomplete="off" spellcheck="false" size="${kind === "time" ? 14 : 16}">`;
  const opts = CASE.words.filter(w => w.kind === kind && FOUND.has(w.text))
    .map(w => w.text).sort((a, b) => a.localeCompare(b));
  return `<select id="b-${p.id}-${n}" data-part="${p.id}" aria-label="${kind}">
    <option value="">${kind}</option>${
    opts.map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
}

async function sign(id) {
  const held = await wordsHold(id);
  if (held === null) return;
  say(id, held ? "This part of the report stands."
               : "It does not hold. Something in it is wrong.", held ? "good" : "bad");
}

/* true or false for a part's words, or null when the typing itself was the
   trouble and has already been said. */
async function wordsHold(id) {
  const p = CASE.parts.find(x => x.id === id);
  let picked = p.kinds.map((_, n) => $(`b-${id}-${n}`).value.trim());
  if (picked.some(v => !v)) {
    say(id, "Every blank in it has to be filled in.", "");
    return null;
  }

  /* A MISTYPING IS NOT A WRONG ANSWER, and must never be marked as one. A
     player told "it does not hold" after writing Kernn for Kern would go back
     and doubt a deduction that was right. So the mechanical failures are
     named, plainly, before anything is marked -- and naming them gives away
     nothing, because they are about the typing and not about the case. */
  if (typing()) {
    const wrong = [];
    picked = picked.map((v, n) => {
      const w = CASE.words.find(x => x.text.toLowerCase() === v.toLowerCase());
      if (!w || !VISIBLE.has(w.text)) {
        wrong.push(`Nothing you have read says “${v}”.`);
        return v;
      }
      if (w.kind !== p.kinds[n])
        wrong.push(`“${w.text}” is a ${w.kind}; that blank takes a ${p.kinds[n]}.`);
      return w.text;                       /* spelling and case forgiven */
    });
    if (wrong.length) { say(id, wrong[0], "bad"); return null; }
  }
  /* A part holds or it does not, and nothing says which blank is wrong.
     Per-blank marks turn a deduction into a search. A part is marked whole,
     and the checks make sure no part has so few fillings that trying them
     all is quicker than thinking (rule 4 of the answer sheet). */
  return await seal([id, ...picked]) === p.sealed;
}

/* ------------------------------------------------------------ the memo
   The report as a police report: every part cites its evidence, and every
   person ruled out has their own row. It is marked the way Kommissar Mauser
   would mark it, in pencil in the margin, and the marking is the witness
   rule: a citation to somebody's own statement comes back
   as that, and so does one to two people who clear each other. It never
   says which blank or which citation is wrong, only which kind of wrong.

   Like the words, nothing here knows the answer. the case builder sealed every
   verdict a citation can earn; this hashes what was cited and looks. */
function citing(key) {
  ACTIVE = key;
  document.body.classList.toggle("citing", !!key);
}

function slot(key) {
  const f = CASE.memo.form;
  const chips = (CITE[key] || []).map((t, j) => {
    const out = `<button class="unchip" data-slot="${esc(key)}" data-j="${j}" ` +
      `title="Take it out" aria-label="Take this out">× take out</button></span>`;
    /* a line of the page opens with its source; what somebody said besides
       does not, and shows its first words */
    const m = /^([^:"]{1,40}): (.*)$/.exec(t);
    const words = (m ? m[2] : t).split(/\s+/).slice(0, 6).join(" ");
    return `<span class="chip" title="${esc(t)}">${m ? `<b>${esc(m[1])}</b> ` : ""}${
      esc(words)}… ${out}`;
  }).join("");
  const open = ACTIVE === key;
  return `<div class="evidence${open ? " open" : ""}"><span class="elabel">${
    esc(f.evidence)}:</span> ${chips || '<span class="none">none cited</span>'} ` +
    `<button class="attach" data-slot="${esc(key)}">${
      open ? "done" : "＋ cite"}</button>${open
      ? '<span class="hint"> click ＋ beside any line</span>' : ""}</div>`;
}

function memo() {
  const kept = {};
  $("parts").querySelectorAll("input.blank,select").forEach(s => kept[s.id] = s.value);
  VISIBLE = typing() ? onPagesRead() : FOUND;
  $("count").textContent = typing()
    ? `Words in what you have read so far: ${VISIBLE.size}`
    : `Words picked up: ${FOUND.size} of ${CASE.words.length}`;
  const m = CASE.memo, f = m.form, res = new Set(m.result);
  const level = m.levels.find(l => l.id === levelOf());
  const part = p => {
    const bits = esc(p.text).split("___");
    const sentence = bits.map((bit, n) =>
      n < bits.length - 1 ? bit + blank(p, n) : bit).join("");
    const v = VERDICT[p.id] || ["", ""];
    /* a part cites nothing, its words are its proof (rule 1); only
       the court's file asks a part for its lines */
    return `<div class="part"><h3>${esc(p.title)}</h3><p>${sentence}</p>
      ${level.id === "court" ? slot(p.id) : ""}<button class="sign" data-part="${p.id}">Sign</button>
      <p class="verdict ${v[1]}" id="verdict-${p.id}">${esc(v[0])}</p></div>`;
  };
  const row = (r, i) => {
    const key = `row${i}`, v = VERDICT[key] || ["", ""];
    return `<div class="part row"><h3>${esc(r.label)}</h3>${slot(key)}
      <button class="sign" data-row="${i}">Sign</button>
      <p class="verdict ${v[1]}" id="verdict-${key}">${esc(v[0])}</p></div>`;
  };
  $("parts").innerHTML = (typing() ? datalists() : "") +
    `<div class="form"><div>${esc(f.office)}</div><div>${esc(level.head)
      }</div><div class="subject">Subject: ${esc(m.subject)}</div></div>` +
    `<h3 class="sec">${esc(f.facts)}</h3>` +
    CASE.parts.filter(p => !res.has(p.id)).map(part).join("") +
    (level.id === "notes" ? ""
      : `<h3 class="sec">${esc(f.excluded)}</h3>` + m.rows.map(row).join("")) +
    `<h3 class="sec">${esc(f.result)}</h3>` +
    CASE.parts.filter(p => res.has(p.id)).map(part).join("");
  $("parts").querySelectorAll("input.blank,select").forEach(i => {
    if (kept[i.id]) i.value = kept[i.id];
    i.oninput = i.onchange = () => say(i.dataset.part, "", "");
  });
  $("parts").querySelectorAll("p.verdict").forEach(p =>
    mauserSays(p, (VERDICT[p.id.slice(8)] || [])[0]));
  $("parts").querySelectorAll(".attach").forEach(b => b.onclick = () => {
    citing(ACTIVE === b.dataset.slot ? null : b.dataset.slot);
    memo();
  });
  $("parts").querySelectorAll(".unchip").forEach(b => b.onclick = () => {
    CITE[b.dataset.slot].splice(+b.dataset.j, 1);
    remember(CASE.id, "cites", CITE);
    say(b.dataset.slot, "", "");
    memo();
  });
  $("parts").querySelectorAll(".sign").forEach(b => b.onclick = async () => {
    const marks = m.marks;
    if (b.dataset.part) {
      const id = b.dataset.part;
      const held = await wordsHold(id);
      if (held === null) return;
      /* Sarah's notes rule nobody out, so a name can be tried: every
         signature that gets a mark is counted */
      if (level.id === "notes")
        remember(CASE.id, "signatures", recall(CASE.id, "signatures", 0) + 1);
      if (!held) return say(id, marks.words, "bad");
      say(id, ...await partMark(id, resultPeople()));
    } else {
      const i = +b.dataset.row;
      say(`row${i}`, ...await rowMark(m.rows[i], CITE[`row${i}`] || []));
    }
  });
}

/* THE REPORT, COMPRESSED (15 September 2026). A part cites
   nothing; what a signed part proves counts for every row it clears; and the
   result holds only once everybody else is ruled out. */
const holding = cls => cls === "good" || cls === "wait";
const signedParts = (verdicts = VERDICT) =>
  CASE.parts.filter(p => holding((verdicts[p.id] || [])[1])).map(p => p.id);

/* the person words typed into a part, as the word list spells them */
function named(id) {
  const p = CASE.parts.find(x => x.id === id);
  return p.kinds.map((k, n) => {
    if (k !== "person") return null;
    const v = $(`b-${id}-${n}`).value.trim().toLowerCase();
    const w = CASE.words.find(x => x.text.toLowerCase() === v);
    return w ? w.text : null;
  }).filter(Boolean);
}

/* The person words of the whole result: in Die dritte Schublade it is two
   parts, and only the first names her (memo.result_people). */
const resultPeople = () => CASE.memo.result.flatMap(named);

/* Rule 3: the rows not yet holding, leaving out the row of the person the
   part names -- found from the words, which have already been checked. The
   same match as memo.named_rows. */
function unruled(people, verdicts = VERDICT) {
  const re = w => new RegExp(`(?<![\\p{L}\\p{N}_])${
    w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "iu");
  return CASE.memo.rows
    .map((r, i) => [r, `row${i}`])
    .filter(([r]) => !people.some(w => re(w).test(r.id)))
    .filter(([, k]) => (verdicts[k] || [])[1] !== "good")
    .map(([r]) => r.label);
}

/* "holds", "own", "ring", "proof" or "empty", for what was cited under one
   row. How many separate things must be proved is sealed too, so it is found
   by trying, and the answer's row needs a number nothing can meet. What the
   signed parts prove for the row is credited first (rule 2), so a row with
   nothing left to prove holds with nothing cited. */
async function citations(key, sealed, cited, signed = signedParts()) {
  const marks = new Set(sealed.marks);
  let need = 0;
  for (let n = 1; n <= CASE.memo.max_need; n++)
    if (await seal(["need", key, n]) === sealed.need) { need = n; break; }
  const covered = new Set();
  for (const pid of signed)
    for (let i = 0; i < need; i++)
      if (marks.has(await seal(["by", key, pid, i]))) covered.add(i);
  if (!cited.length) return need && covered.size === need ? "holds" : "empty";
  let own = false, ring = false;
  for (const t of cited) {
    const id = (await seal(["line", t])).slice(0, 16);
    for (let i = 0; i < need; i++)
      if (marks.has(await seal(["ok", key, id, i]))) covered.add(i);
    if (marks.has(await seal(["own", key, id]))) own = true;
    if (marks.has(await seal(["ring", key, id]))) ring = true;
  }
  if (own) return "own";
  if (ring) return "ring";
  return need && covered.size === need ? "holds" : "proof";
}


/* A part's mark once its words hold. The court's file wants its lines as
   well, a line from each group, and credits nothing. And rule 3: the result
   waits for everybody else to be ruled out, in every level that rules anybody
   out. While it waits it still credits the rows (a result that credits
   nothing while it waits would wait for ever: the cover and the order clear
   Herr Simon and Frau Litt). */
async function partMark(id, people, verdicts = VERDICT, cited = CITE, level = levelOf()) {
  const m = CASE.memo;
  if (level === "court") {
    const v = await citations(id, m.cite[id], cited[id] || [], []);
    if (v !== "holds") return [m.marks[v], "bad"];
  }
  if (level !== "notes" && m.result.includes(id) && unruled(people, verdicts).length)
    return [m.marks.others, "wait"];
  return [m.marks.holds, "good"];
}

/* A row's mark, and whose word spoiled it when somebody's did. The court's
   file credits nothing a part shows. */
async function rowMark(r, cited, signed = levelOf() === "court" ? [] : signedParts()) {
  const v = await citations(r.id, r, cited, signed);
  const whose = v === "own" ? `: something cited here is ${r.label}'s own word`
    : v === "ring" ? `: something cited here rests on somebody ${r.label} clears in turn` : "";
  return [CASE.memo.marks[v] + whose, v === "holds" ? "good" : "bad"];
}

/* EVERY MARK SAYS WHAT THE REPORT SAYS NOW (the user, 15 September 2026,
   playing: "Nobody" kept the "More evidence available?" it got before the result was signed,
   though the waiting result credited it by then). A mark used to be what the
   report said when the button was pressed, and was only ever taken back, never
   given. Now every signed row is marked again against the parts as they stand,
   and then every result that holds against the rows: a row depends on the
   parts, a result on the rows, and a waiting result credits exactly what a
   holding one does, so one pass in that order settles it. Unsigned things stay
   unsigned; a part's words are never judged again, since nothing else changes
   them. Pure, so report-test drives it. */
async function remarked(verdicts, cited, names, level = levelOf()) {
  const m = CASE.memo, out = { ...verdicts };
  const signed = level === "court" ? [] : signedParts(out);
  if (level !== "notes")
    for (const [i, r] of m.rows.entries()) {
      const k = `row${i}`;
      if ((out[k] || [])[1]) out[k] = await rowMark(r, cited[k] || [], signed);
    }
  for (const pid of m.result)
    if (holding((out[pid] || [])[1]))
      out[pid] = await partMark(pid, names(pid), out, cited, level);
  return out;
}

let REMARKING = 0;
async function remark() {
  const run = ++REMARKING;
  const next = await remarked(VERDICT, CITE, resultPeople);
  if (run !== REMARKING) return;   /* something was signed meanwhile */
  for (const [k, v] of Object.entries(next)) {
    const was = VERDICT[k] || ["", ""];
    if (was[0] !== v[0] || was[1] !== v[1]) setVerdict(k, ...v);
  }
  tally();
}

function setVerdict(id, text, cls) {
  VERDICT[id] = [text, cls];
  const el = $(`verdict-${id}`);
  if (el) { el.textContent = text; el.className = "verdict " + cls; mauserSays(el, text); }
}

/* WHAT MAUSER SAYS BESIDE HIS MARK (23 September 2026). The mark is kept as
   it is -- it says which kind of wrong and nothing more -- and under it, in
   his voice, the author's own line for that kind (chapters/memo.py, MAUSER;
   attic/mauser.md for every source). English, her German one click away.
   Which line is found from the mark's own text, so nothing about the case is
   needed and nothing new is sealed. A mark with no line says nothing more. */
function mauserLine(say) {
  const q = document.createElement("span");
  q.className = "mauser";
  q.innerHTML = `<b>Mauser</b> “${esc(say.en)}”<button class="de" type="button" ` +
    `aria-expanded="false" title="Her German">Deutsch</button>` +
    `<span class="orig" hidden>„${esc(say.de)}“ <cite>${esc(say.src)}</cite></span>`;
  const b = q.querySelector(".de"), o = q.querySelector(".orig");
  b.onclick = () => { o.hidden = !o.hidden; b.setAttribute("aria-expanded", String(!o.hidden)); };
  return q;
}

function mauserSays(el, text) {
  const m = CASE && CASE.memo, lines = m && m.mauser;
  if (!lines || !text) return;
  const kind = Object.keys(lines).find(k => m.marks[k] && text.startsWith(m.marks[k]));
  if (kind) el.append(mauserLine(lines[kind]));
}

function say(id, text, cls) {
  const was = VERDICT[id] || ["", ""];
  setVerdict(id, text, cls);
  if (CASE && CASE.memo && (was[0] !== text || was[1] !== cls)) remark();
  tally();
}

/* THE SCORE. How many questions Sarah has asked, under the report; and once
   every part holds, the fewest that bring out all the evidence beside it
   (the case's own fewest). The fewest is kept back until then: it is
   a number about the chapter, and a player still working should not be
   counting against it. */
function tally() {
  const el = $("asked");
  if (!el) return;
  const walk = CASE && CASE.walk;
  if (!walk || typeof questions !== "function" || !walking()) { el.textContent = ""; return; }
  const notes = CASE.memo && levelOf() === "notes";
  const keys = CASE.parts.map(p => p.id)
    .concat(CASE.memo && !notes ? CASE.memo.rows.map((_, i) => `row${i}`) : []);
  const solved = keys.length && keys.every(k => (VERDICT[k] || [])[1] === "good");
  const asked = questionsSaid();
  const n = recall(CASE.id, "signatures", 0);
  const signed = notes ? ` The notes have been signed ${n === 1 ? "once" : `${n} times`}.` : "";
  el.textContent = (solved && walk.fewest
    ? `Every part holds. Sarah asked ${asked}; all the evidence in this chapter can be had with ${walk.fewest}.`
    : `So far Sarah has asked ${asked}.`) + signed;
  const closing = solved && CASE.memo && CASE.memo.mauser && CASE.memo.mauser.solved;
  if (closing) el.append(mauserLine(closing));
  $("invite").hidden = !solved;
}

/* Per-viewer convenience only: which evenings have been opened and which
   words picked up. Wrapped because a private window, cleared site data or a
   browser set to refuse storage all throw here rather than returning null. */
function remember(id, key, value) {
  try { localStorage.setItem(`faelle.${id}.${key}`, JSON.stringify(value)); } catch (e) {}
}
function recall(id, key, dflt) {
  try { return JSON.parse(localStorage.getItem(`faelle.${id}.${key}`)) || dflt; }
  catch (e) { return dflt; }
}

boot();
