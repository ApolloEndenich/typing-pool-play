"use strict";

/* WALKING THE BUILDING.

   A chapter that has a `walk` in its JSON is played by going somewhere and
   talking to whoever is there, instead of reading the whole file at once.
   Every line still ends up where it always did -- under its heading, on its
   evening, citable, tickable, its words typable -- but only once Sarah has
   heard it or seen it.

   This file decides nothing about the case. chapters/meetings.py and the
   chapter's walk file decided which line comes out of which question or
   object, on which evening, and checked it; this deals what the JSON says.
   What is counted here is only the player's: what has been heard, and how
   much of each person's patience is spent.

   TIME. A chapter has phases (the working day and after five; or Friday
   night, Saturday and Sunday). Where `repeat` is true the phases come round
   again as days; where it is false they are fixed evenings and the last one
   is the last. Patience comes back each day, or each phase when `reset` is
   "phase". A line, a first greeting and an answer may belong to one phase,
   and then come out only in it. */

let WALK = null;          /* the case's walk, straight from the JSON */
let W = null;             /* the player's state in it */
let TALKING = null;       /* the person whose conversation is open */
let HEARD = new Set();    /* every line heard or seen, by its text */

/* Reading the whole file is a setting, and one setting for every chapter: a
   reviewer wants it everywhere, a player nowhere. */
const walking = () => !!(CASE && CASE.walk && !recall("_", "readall", false));

function setReadAll(on) {
  remember("_", "readall", on);
  if (!WALK) return;
  walkDraw(); draw(); report();
}

function walkStart() {
  WALK = CASE.walk || null;
  $("walk").hidden = !WALK;
  if (!WALK) {
    HEARD = new Set();
    document.body.classList.remove("walks");
    return;
  }
  W = Object.assign({day: 1, phase: 0, at: WALK.phases[0].start, met: [],
                     spent: {}, asked: {}, log: {}}, recall(CASE.id, "walk", {}));
  HEARD = new Set(recall(CASE.id, "heard", []));
  TALKING = null;
  $("backtowalk").onclick = () => setReadAll(false);
  $("views").querySelectorAll("[data-view]").forEach(b =>
    b.onclick = () => { setView(b.dataset.view); window.scrollTo(0, 0); });
  setView(recall(CASE.id, "view", "building"));
  enter(W.at, true);
}

/* TWO TABS (the user, 14 September 2026): the building -- map, room, talk --
   and Sarah's notebook with the report. Which one is open is kept per chapter;
   the notebook's tab counts the lines heard since it was last open. */
function setView(v) {
  /* the chapters page is somewhere to go, not somewhere a chapter reopens */
  if (v !== "chapters") remember(CASE.id, "view", v);
  document.body.classList.toggle("view-chapters", v === "chapters");
  document.body.classList.toggle("view-building", v === "building");
  document.body.classList.toggle("view-notebook", v === "notebook");
  $("views").querySelectorAll("[data-view]").forEach(b =>
    b.classList.toggle("on", b.dataset.view === v));
  if (v === "notebook") remember(CASE.id, "noted", HEARD.size);
  freshCount();
}

function freshCount() {
  const onNotebook = document.body.classList.contains("view-notebook");
  if (onNotebook) remember(CASE.id, "noted", HEARD.size);
  const n = Math.max(0, HEARD.size - recall(CASE.id, "noted", 0));
  const text = n ? `(${n} new)` : "";
  $("freshcount").textContent = text;
  $("freshroom").textContent = text;
}

function save() {
  remember(CASE.id, "walk", W);
  remember(CASE.id, "heard", [...HEARD]);
}

/* A line reaching the player. It goes into the evening's list under its own
   heading (app.js draws only what HEARD holds), and its words become typable. */
function hear(text) {
  if (HEARD.has(text)) return false;
  HEARD.add(text);
  return true;
}

const phase = () => WALK.phases[W.phase];
const now = item => !item.phase || item.phase === phase().name;
const place = id => WALK.places.find(p => p.id === id);
const person = id => WALK.people.find(p => p.id === id);
const isOpen = id => phase().open.includes(id);
const here = () => WALK.people.filter(p => p.at[phase().name] === W.at);
const spent = id => (W.spent[id] || 0);
const askKey = (kind, what) => `${kind}:${what}@${phase().name}`;
const asked = (id, key) => (W.asked[id] || []).includes(key);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
/* Every question Sarah has put, shrugs included: the score, and nothing else
   reads it. It is a challenge, not a cost (the user, 14 September 2026). */
const questions = () => W ? Object.values(W.asked).reduce((n, a) => n + a.length, 0) : 0;
/* "The porter's book" is how the sampler names an exhibit at the head of a
   line; inside a sentence it is "the porter's book". */
const thingName = t => t.replace(/^(The|A|An) /, m => m.toLowerCase());

/* The evening tabs follow the walk: a chapter whose phases are its evenings
   opens the evening Sarah is in, so what she hears there is on the page. */
function followEvening() {
  const d = phase().day;
  if (!d) return;
  const before = SEEN.size;
  SEEN.add(d);
  DAY = d;
  remember(CASE.id, "days", [...SEEN]);
  return SEEN.size !== before;
}

/* What lies in a room is shown as a thing to pick up, and its line is only
   heard when Sarah looks at it; what is simply there to be noticed is heard on
   walking in. */
function enter(id, quiet) {
  if (!isOpen(id)) id = phase().start;
  W.at = id;
  TALKING = null;
  let fresh = followEvening();
  for (const s of place(id).sees || [])
    if (now(s) && !thingOf(s.text)) fresh = hear(s.text) || fresh;
  save();
  walkDraw();
  if (!quiet || fresh) { draw(); report(); }
}

/* what Sarah says raising a topic with this person (meetings.py, ask_of) */
const askOf = (t, who) => (t.ask_of || {})[who] || t.ask;

function note(who, kind, text) {
  (W.log[who] || (W.log[who] = [])).push([kind, text, phase().name]);
}

function meet(id) {
  TALKING = id;
  const p = person(id);
  const key = `${id}@${phase().name}`;
  if (!W.met.includes(key)) {
    W.met.push(key);
    const hello = p.hello.filter(now);
    for (const h of hello) { hear(h.text); note(id, "line", h.text); }
    if (!hello.length) note(id, "talk", `${cap(p.name)} nods.`);
    save(); draw(); report();
  }
  walkDraw();
}

/* Raising something, or putting something down. An answer -- a line, an
   evasion, chat -- costs one of the person's patience; a question they cannot
   answer costs nothing (the user's ruling, 13 September 2026), so a player can
   never be locked out by asking the wrong things, and meetings.py check 8
   proves that asking everything fits. */
function act(kind, what) {
  const p = person(TALKING);
  const key = askKey(kind, what);
  if (asked(p.id, key) || spent(p.id) >= p.patience) return;
  (W.asked[p.id] || (W.asked[p.id] = [])).push(key);
  if (kind === "topic") {
    note(p.id, "sarah", askOf(WALK.topics.find(x => x.id === what), p.id));
  } else {
    note(p.id, "sarah", carried(what)
      ? `Sarah puts ${thingName(what)} in front of ${p.name}.`
      : `Sarah tells ${p.name} what she saw in ${thingName(what)}.`);
  }
  const r = (kind === "topic" ? p.topics : p.shows)[what];
  let any = false;
  if (r) {
    for (const l of r.lines.filter(now)) { hear(l.text); note(p.id, "line", l.text); any = true; }
    if (r.evade) { note(p.id, "evade", r.evade); any = true; }
    if (r.talk) { note(p.id, "talk", r.talk); any = true; }
  }
  if (any) W.spent[p.id] = spent(p.id) + 1;
  else if (kind !== "topic" && p.looked) note(p.id, "shrug", p.looked);
  else {
    /* the shrugs in turn, so six questions do not get one sentence six times */
    W.shrugged = W.shrugged || {};
    const n = W.shrugged[p.id] = (W.shrugged[p.id] || 0) + 1;
    note(p.id, "shrug", p.shrugs[(n - 1) % p.shrugs.length]);
  }
  if (any && spent(p.id) >= p.patience) note(p.id, "tired", p.tired);
  save(); walkDraw(); draw(); report();
  $("talk").scrollTop = 0;
  if (!document.body.classList.contains("theatre") && $("talk").scrollIntoView)
    $("talk").scrollIntoView({block: "nearest"});
}

const lastPhase = () => W.phase + 1 >= WALK.phases.length;

/* On to the next part of the day, or the next day; or, for a chapter of fixed
   evenings, the next evening, and none after the last. */
function nextPhase() {
  if (!lastPhase()) {
    W.phase += 1;
    if (WALK.reset === "phase") W.spent = {};
  } else if (WALK.repeat) {
    W.day += 1; W.phase = 0; W.spent = {};
  } else {
    return;
  }
  const stay = W.phase > 0 && WALK.repeat && isOpen(W.at);
  enter(stay ? W.at : phase().start);
}

const offered = () => WALK.topics.filter(t =>
  t.always || t.raised_by.some(l => HEARD.has(l)));
const held = () => WALK.exhibits.filter(e => HEARD.has(e.line))
  .map(e => e.thing).filter((t, i, a) => a.indexOf(t) === i);
/* Whether Sarah has the thing with her and can put it down, or has only seen
   it -- the porter's book stays in the lodge, and she tells people what it says. */
const carried = thing => WALK.exhibits.some(e => e.thing === thing && e.portable);

/* ------------------------------------------------------------- drawing */
function walkDraw() {
  if (!WALK) return;
  const on = walking();
  $("readnote").hidden = on;
  $("walkbody").hidden = !on;
  document.body.classList.toggle("walks", on);
  if (!on) return;
  freshCount();

  const ph = phase();
  $("clock").innerHTML = WALK.repeat
    ? `<b>Day ${W.day}</b> · ${esc(ph.name)}` +
      (W.day > WALK.days ? ` <small>(the chapter is planned for ${WALK.days})</small>` : "")
    : `<b>${esc(cap(ph.name))}</b> <small>· evening ${W.phase + 1} of ${WALK.phases.length}</small>`;
  const q = questions();
  $("clock").innerHTML += ` <small>· ${q} question${q === 1 ? "" : "s"}</small>`;
  const next = $("nextphase");
  if (!lastPhase()) {
    next.hidden = false;
    next.textContent = WALK.repeat ? `Stay until ${WALK.phases[W.phase + 1].name}`
                                   : `On to ${WALK.phases[W.phase + 1].name}`;
  } else if (WALK.repeat) {
    next.hidden = false;
    next.textContent = "Go home; come back tomorrow";
  } else {
    next.hidden = true;
  }
  next.onclick = nextPhase;
  $("cover").innerHTML = marked(WALK.cover, false);

  map();
  scene();
  conversation();
  annotate($("walk"));
}

/* The map: the building cut through, floor over floor, the way a porter's plan
   of the house would show it, and Bonn laid out beside it on the evenings that
   happen out of the building. Only what is open this evening is drawn. */
function map() {
  const open = WALK.places.filter(p => isOpen(p.id));
  const inside = [...new Set(open.filter(p => p.floor !== null).map(p => p.floor))]
    .sort((a, b) => b - a);
  const town = open.filter(p => p.floor === null && !p.passage);
  const rowH = 60, colW = 138, stairX = 96, perRow = 3;
  const pos = {}, rows = [];
  inside.forEach(f => rows.push({label: floorName(f), places: open.filter(p => p.floor === f)}));
  for (let i = 0; i < town.length; i += perRow)
    rows.push({label: i ? "" : "Bonn", places: town.slice(i, i + perRow), town: true});
  rows.forEach((row, r) => {
    const y = 20 + r * rowH;
    let i = 0;
    for (const p of row.places) {
      if (p.passage) pos[p.id] = {x: stairX, y, pass: true};
      else pos[p.id] = {x: stairX + 40 + (i++) * colW, y};
    }
  });
  const xs = Object.values(pos).map(p => p.x);
  const width = (xs.length ? Math.max(...xs) : stairX) + colW;
  const height = 20 + rows.length * rowH;
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Map">`;
  rows.forEach((row, r) => {
    const y = 20 + r * rowH;
    svg += `<line class="floor" x1="0" x2="${width}" y1="${y + 30}" y2="${y + 30}"/>` +
      `<text class="flabel" x="4" y="${y + 18}">${row.label}</text>`;
  });
  const insideRows = rows.filter(r => !r.town).length;
  if (insideRows > 1)
    svg += `<line class="stair" x1="${stairX}" x2="${stairX}" y1="32" y2="${20 + (insideRows - 1) * rowH + 12}"/>`;
  const drawn = new Set();
  for (const p of open) for (const l of p.links) {
    const k = [p.id, l].sort().join("|");
    const a = pos[p.id], b = pos[l];
    if (drawn.has(k) || !a || !b || p.floor === null) continue;
    drawn.add(k);
    const ax = a.pass ? stairX : a.x + 44, bx = b.pass ? stairX : b.x + 44;
    svg += a.y !== b.y
      ? `<polyline class="link" points="${ax},${a.y + 12} ${stairX},${a.y + 12} ${stairX},${b.y + 12} ${bx},${b.y + 12}"/>`
      : `<line class="link" x1="${ax}" x2="${bx}" y1="${a.y + 12}" y2="${b.y + 12}"/>`;
  }
  for (const p of open) {
    const q = pos[p.id];
    if (!q || q.pass) continue;
    const who = WALK.people.filter(x => x.at[phase().name] === p.id).length;
    svg += `<g class="room${p.id === W.at ? " here" : ""}" data-go="${p.id}" tabindex="0" role="button" aria-label="Go to ${esc(p.name)}">` +
      `<rect x="${q.x}" y="${q.y}" width="${colW - 14}" height="28" rx="2"/>` +
      `<text x="${q.x + 6}" y="${q.y + 19}">${esc(short(p.name))}</text>` +
      (who ? `<circle cx="${q.x + colW - 24}" cy="${q.y + 5}" r="7"/>` +
             `<text class="n" x="${q.x + colW - 24}" y="${q.y + 9}">${who}</text>` : "") +
      `</g>`;
  }
  $("map").innerHTML = svg + "</svg>";
  $("map").querySelectorAll("[data-go]").forEach(g => {
    const go = () => { enter(g.dataset.go); theatre(true); };
    g.onclick = go;
    g.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } };
  });
}

const floorName = f => f === -1 ? "cellar" : f === 0 ? "ground"
  : f === 2 ? "2nd" : f === 3 ? "3rd" : `${f}th`;

const short = n => n.replace(/^the /, "").replace("outer office of 407", "outer office")
  .replace("second-floor ", "").replace("fourth-floor ", "").replace("third-floor ", "")
  .replace("entrance hall", "hall, lodge").replace("Kommissar Mauser's office", "Mauser's office")
  .replace("a café near the Markt", "café, Markt")
  .replace(/^(Frau|Fräulein) ([^' ]+)'s (flat|room|building)$/u, "$2's $3");

/* The room, with whoever is in it standing on its floor, Sarah to one side.
   Both face the viewer (the staging MEETINGS.md asks for). */
function scene() {
  const p = place(W.at);
  const art = p.art[phase().name];
  const people = here();
  $("scene").style.backgroundImage = art ? `url("${art}")` : "none";
  $("scene").classList.toggle("noart", !art);
  const n = people.length;
  /* Everybody to one scale: a 180 cm figure stands 72% of the picture's
     height, and nobody's picture is stretched to anybody else's height. */
  const tall = cm => `${(72 * cm / 180).toFixed(1)}%`;
  const figs = people.map((x, i) => {
    const left = n === 1 ? 62 : 32 + i * (60 / Math.max(1, n - 1));
    const img = x.sprite ? `<img src="${esc(x.sprite)}" alt="">` : `<span class="nofig">?</span>`;
    return `<button class="fig${TALKING === x.id ? " talking" : ""}" data-meet="${esc(x.id)}" ` +
      `style="left:${left}%;height:${tall(x.height)}" title="Talk to ${esc(x.name)}">${img}` +
      `<span class="label">${esc(x.name)}</span></button>`;
  }).join("");
  $("scene").innerHTML =
    `<div class="fig sarah" style="left:9%;height:${tall(WALK.sarah_height)}"><img src="${esc(WALK.sarah)}" alt=""><span class="label">Sarah</span></div>` +
    figs;
  $("scene").querySelectorAll("[data-meet]").forEach(b => b.onclick = () => {
    meet(b.dataset.meet);
    theatre(true);
  });
  $("placename").textContent = cap(p.name);
  $("placetext").innerHTML = marked(p.text, false) +
    (n ? "" : ` <i>Nobody is here now.</i>`);
  const sees = (p.sees || []).filter(now);
  const things = [...new Set(sees.map(s => thingOf(s.text)).filter(Boolean))];
  $("sees").innerHTML =
    sees.filter(s => !thingOf(s.text)).map(s => `<li>${marked(s.text, false)}</li>`).join("") +
    things.map(th => `<li><button class="read" data-thing="${esc(th)}" title="Look at it">` +
      `${esc(thingName(th))}</button>${seenThing(th) ? "" : " <i>lies here</i>"}</li>`).join("");
  $("sees").hidden = !sees.length;
  const notebook = held();
  $("notebook").innerHTML = notebook.length
    ? `<span>In Sarah's notebook</span>` + notebook.map(t =>
        `<button class="read" data-thing="${esc(t)}" title="Read it again">${esc(thingName(t))}</button>`).join("")
    : "";
  $("stage").querySelectorAll(".read").forEach(b => b.onclick = () => readThing(b.dataset.thing));
  $("theatreclose").onclick = () => theatre(false);
  $("tonotebook").onclick = () => {
    theatre(false);
    setView("notebook");
    window.scrollTo(0, 0);
  };
}

/* ------------------------------------------------------------ documents
   A thing Sarah holds opens as a page, typeset, the way the handoff decided
   documents are shown: the porter's book, the disc, a receipt are not painted
   but set in type, so what they say is legible and nothing a painter adds can
   become a clue. The page is the line or lines the chapter deals for that
   thing, and nothing else. */
const thingOf = text => (WALK.exhibits.find(e => e.line === text) || {}).thing;
const seenThing = thing => WALK.exhibits.some(e => e.thing === thing && HEARD.has(e.line));

/* Looking at a thing: whatever of it lies in this room now is heard, and it
   opens as a page -- a ledger where the chapter draws one (meetings.py check
   12 keeps every cell to what the line says), otherwise its lines set in type. */
function readThing(thing) {
  let fresh = false;
  for (const s of place(W.at).sees || [])
    if (now(s) && thingOf(s.text) === thing) fresh = hear(s.text) || fresh;
  const lines = WALK.exhibits.filter(e => e.thing === thing && HEARD.has(e.line))
    .map(e => e.line.startsWith(thing + ": ") ? cap(e.line.slice(thing.length + 2)) : e.line);
  if (!lines.length) return;
  if (fresh) { save(); draw(); report(); walkDraw(); }
  const doc = (WALK.documents || {})[thing];
  const cell = c => typeof c === "string" ? esc(c)
    : c.scrawl ? `<span class="scrawl" aria-label="a signature"></span>`
    : c.sign ? `<span class="signature">${esc(c.sign)}</span>`
    : esc(c.shown);
  $("doctitle").textContent = cap(thingName(thing));
  $("docbody").innerHTML = doc && doc.kind === "ledger"
    ? `<table class="ledger"><thead><tr>${doc.columns.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${doc.rows.map(r => `<tr>${r.map(c => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` +
      `<p class="noted">Noted with what you have heard.</p>`
    : lines.map(l => `<p>${marked(l, false)}</p>`).join("");
  $("doc").hidden = false;
  if (typeof annotate === "function") annotate($("doc"));
  $("docclose").focus();
}

function closeDoc() { $("doc").hidden = true; }

/* ------------------------------------------------------------ full screen
   Walking into a room fills the screen with it: the painting, the people in
   it, and the conversation over the foot of it. The map is one step back. */
function theatre(on) {
  if (on && !document.body.classList.contains("view-building")) setView("building");
  document.body.classList.toggle("theatre", on);
  if (on) $("theatreclose").focus();
}

document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  const open = [...document.querySelectorAll(".sheet-modal")].find(m => !m.hidden);
  if (open) open.hidden = true;
  else if ($("doc") && !$("doc").hidden) closeDoc();
  else if (document.body.classList.contains("theatre")) theatre(false);
});

function conversation() {
  const box = $("talk");
  const open = !!TALKING && here().some(p => p.id === TALKING);
  document.body.classList.toggle("talking", open);
  if (!open) { box.hidden = true; return; }
  const p = person(TALKING);
  box.hidden = false;
  const left = p.patience - spent(p.id);
  const pips = Array.from({length: p.patience}, (_, i) =>
    `<span class="pip${i < left ? " on" : ""}"></span>`).join("");
  const log = (W.log[p.id] || []).map(([k, t, ph]) =>
    `<li class="${k}${ph && ph !== phase().name ? " earlier" : ""}">${marked(t, false)}</li>`).join("");
  const tired = left <= 0;
  /* A topic is offered as what Sarah will actually say, not as a keyword: a
     player spends patience on it, and has to know what she is spending it on. */
  const chip = (kind, what, label, says) => {
    const done = asked(p.id, askKey(kind, what));
    return `<button class="chip ${kind}${done ? " done" : ""}" data-kind="${kind}" ` +
      `data-what="${esc(what)}" title="${esc(says)}"${done || tired ? " disabled" : ""}>` +
      `<b>${esc(label)}</b><span class="says">${esc(says)}</span></button>`;
  };
  /* asked already sinks to the end (the user, 14 September 2026) */
  const later = (kind, id) => asked(p.id, askKey(kind, id)) ? 1 : 0;
  const topics = offered().slice().sort((a, b) => later("topic", a.id) - later("topic", b.id))
    .map(t => chip("topic", t.id, t.label, askOf(t, p.id))).join("");
  const things = held().slice().sort((a, b) => later("show", a) - later("show", b))
    .map(t => chip("show", t, thingName(t), carried(t)
    ? `Put ${thingName(t)} in front of ${p.name}.`
    : `Tell ${p.name} what she saw in ${thingName(t)}.`)).join("");
  const when = WALK.reset === "phase" ? "this evening" : "today";
  box.innerHTML =
    `<header><b>${esc(cap(p.name))}</b><span class="pips" title="Patience: ${left} of ${p.patience} left ${when}">${pips}</span>` +
    `<button class="close" title="Step away">×</button></header>` +
    `<ol class="log">${log}</ol>` +
    `<p class="costs">Each answer takes a little of ${esc(p.name)}'s time ${when}. ` +
    `A question nobody can answer costs nothing.</p>` +
    (tired ? `<p class="spent">${esc(cap(p.name))} has given you all the time there is ${when}.</p>` : "") +
    `<div class="asks"><div class="ask"><span>Raise</span>${topics || '<i>nothing yet</i>'}</div>` +
    `<div class="ask"><span>Show or mention</span>${things || '<i>nothing in your notebook</i>'}</div></div>`;
  box.querySelector(".close").onclick = () => { TALKING = null; walkDraw(); };
  box.querySelectorAll(".chip").forEach(b => b.onclick = () => act(b.dataset.kind, b.dataset.what));
  const ol = box.querySelector(".log");
  ol.scrollTop = ol.scrollHeight;
  const asks = ol.querySelectorAll ? ol.querySelectorAll("li.sarah") : [];
  const lastAsk = asks[asks.length - 1];
  if (lastAsk && ol.scrollHeight - lastAsk.offsetTop > ol.clientHeight)
    ol.scrollTop = lastAsk.offsetTop;
}
