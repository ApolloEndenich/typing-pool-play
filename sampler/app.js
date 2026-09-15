"use strict";

/* The front end, entire.

   It reads a case, shows one evening at a time, lets a player pick up the
   words that stand in its lines, and marks the report against hashes. It has
   no idea what a channel or a pin or an alibi is -- those live in the Python
   that proved the case -- and it must stay that way, because the moment this
   file knows how a case works there are two models of the same thing and
   they will disagree. */

const $ = id => document.getElementById(id);
let CASE = null, DAY = 1, SEEN = new Set(), FOUND = new Set(), MATCH = null;
let VERDICT = {}, VISIBLE = new Set(), ASIDE = [];
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

/* Same construction as the seal in export_cases.py. The solution is not in
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
    m.querySelector(".closer").onclick = () => { m.hidden = true; };
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
      if (/^faelle\.[^.]+\.(walk|heard|days|aside|noted)$/.test(k)) localStorage.removeItem(k);
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
  document.addEventListener("click", e => { if (!$("tip").contains(e.target)) untip(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") untip(); });
  window.addEventListener("scroll", untip, true);

  const index = await (await fetch("cases/index.json")).json();
  /* The series in its order, with the chapters that are only a name so far
     standing in their places, shut. The sampler has no number. */
  $("cases").innerHTML = index.map(c =>
    `<button data-id="${c.id}"${c.built ? "" : " disabled"} class="${c.built ? "" : "tocome"}">` +
    `<span class="num">${c.n === null ? "·" : c.n}</span>${esc(c.title)}` +
    (c.german ? ` <i class="de">${esc(c.german)}</i>` : "") +
    `<small>${esc(c.stated)}${c.built ? "" : c.held ? " · not in this sample" : " · not yet written"}</small></button>`
  ).join("");
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
  CITE = recall(id, "cites", {});
  /* A line rewritten since it was cited (the voices, 14 September 2026) would
     match no seal and quietly count for nothing; drop it, so the report never
     shows a chip that cannot earn a mark. */
  {
    const lines = new Set(CASE.days.flatMap(d => d.sections.flatMap(s => s.lines)));
    for (const k of Object.keys(CITE))
      CITE[k] = CITE[k].filter(t => t.startsWith("part:") || lines.has(t));
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
  report();
  draw();
}

/* The lines a player holds: all of them when reading the file, only those
   heard or seen when walking the building (walk.js). */
const holds = t => typeof walking !== "function" || !walking() || HEARD.has(t);

/* The dossiers. Character, never a clue -- so the words in them are NOT
   marked and cannot be picked up: chapters/dossiers.py refuses a dossier that
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
   chapters/sheet.py, which is the page the checks read. */
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
   A word is only ever picked up out of a dealt line -- sheet.py decides what
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
function tip(el) {
  const k = el.dataset.k;
  const g = el.classList.contains("term") ? GLOSS[k] : null;
  const d = el.classList.contains("who") ? WHO[k] : null;
  if (!g && !d) return;
  const box = $("tip");
  box.innerHTML = g
    ? `<b>${esc(g.term)}</b> <i>${esc(g.short)}</i><p>${esc(g.long)}</p>`
    : `<b>${esc(d.who)}</b>${portrait(d)}`;
  const r = el.getBoundingClientRect();
  box.hidden = false;
  const w = box.offsetWidth;
  box.style.left = Math.max(8, Math.min(window.innerWidth - w - 8,
                                        r.left)) + "px";
  box.style.top = (r.bottom + 6) + "px";
  /* The card stays while the pointer is on it, and a name or a German word
     inside it can be hovered in turn (the user, 14 September 2026: hovering
     Herr Simon and then "Registratur" in his card closed it at once). */
  clearTimeout(TIPCLOSE);
  box.onmouseenter = () => clearTimeout(TIPCLOSE);
  box.onmouseleave = untipSoon;
  box.querySelectorAll(".term,.who").forEach(inner => {
    inner.onmouseenter = () => { clearTimeout(TIPCLOSE); tip(inner); };
    inner.onclick = e => { e.stopPropagation(); tip(inner); };
  });
}

let TIPCLOSE = null;
const untip = () => { clearTimeout(TIPCLOSE); $("tip").hidden = true; };
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
     leaves its section for a pile at the foot of the evening, newest-ticked
     first, and ↺ brings it back to where it stood. In the pile it carries the
     heading it came from, because a line lifted out from under "Herr Simon"
     has lost its mouth otherwise. Nothing ticks itself off here: the duty
     sheet can see when a line is spent, and this page knows nothing about
     what a line means. */
  const off = new Set(ASIDE);
  const tick = (t, done) =>
    `<button class="tick" data-t="${esc(t)}" title="${done
      ? "Bring this line back" : "Done with this line"}">${done ? "↺" : "✓"}</button>`;
  /* Citing, when the report is a memo: while an evidence slot is open every
     line carries a button that puts it in that slot. */
  const cite = t => CASE.memo
    ? `<button class="cite" data-t="${esc(t)}" title="Cite this line as evidence">＋</button>`
    : "";
  const live = day.sections.map(s => [s, s.lines.filter(t => !off.has(t) && holds(t))])
    .filter(([, ls]) => ls.length);
  const from = {};
  for (const s of day.sections) for (const t of s.lines) from[t] = s.where;
  const gone = ASIDE.filter(t => t in from && holds(t));
  $("sections").innerHTML = live.map(([s, ls]) =>
    `<section class="where"><h3>${marked(s.where)}</h3><ul>${
      ls.map(t => `<li>${cite(t)}${tick(t, false)}${marked(t)}</li>`).join("")}</ul></section>`)
    .join("") + (gone.length
      ? `<section class="where aside"><h3>Done with (${gone.length})</h3><ul>${
          gone.map(t => `<li>${cite(t)}${tick(t, true)}<small>${marked(from[t])}</small> ${
            marked(t)}</li>`).join("")}</ul></section>`
      : "");
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
}

const unlocked = () => Math.min(CASE.days.length, Math.max(...SEEN, 1) + 1);

function pick(w) {
  if (FOUND.has(w)) return;
  FOUND.add(w);
  remember(CASE.id, "words", [...FOUND]);
  $("sections").querySelectorAll(".word").forEach(b =>
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
    ? `${VISIBLE.size} words stand in what you have read so far`
    : `Words found: ${FOUND.size} of ${CASE.words.length}`;
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
     all is quicker than thinking (sheet.py, rule 4). */
  return await seal([id, ...picked]) === p.sealed;
}

/* ------------------------------------------------------------ the memo
   The report as a police report: every part cites its evidence, and every
   person ruled out has their own row. It is marked the way Kommissar Mauser
   would mark it, in pencil in the margin, and the marking is the witness
   rule (chapters/memo.py): a citation to somebody's own statement comes back
   as that, and so does one to two people who clear each other. It never
   says which blank or which citation is wrong, only which kind of wrong.

   Like the words, nothing here knows the answer. Python sealed every
   verdict a citation can earn; this hashes what was cited and looks. */
function citing(key) {
  ACTIVE = key;
  document.body.classList.toggle("citing", !!key);
}

function slot(key) {
  const f = CASE.memo.form;
  const chips = (CITE[key] || []).map((t, j) => {
    const out = `<button class="unchip" data-slot="${esc(key)}" data-j="${j}" ` +
      `title="Take it out">×</button></span>`;
    const leant = CASE.parts.find(p => t === `part:${p.id}`);
    if (leant)
      return `<span class="chip" title="Everything cited under this part"><b>Part</b> ${
        esc(leant.title)} ${out}`;
    const [src, ...rest] = t.split(": ");
    const words = rest.join(": ").split(/\s+/).slice(0, 6).join(" ");
    return `<span class="chip" title="${esc(t)}"><b>${esc(src)}</b> ${
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
    ? `${VISIBLE.size} words stand in what you have read so far`
    : `Words found: ${FOUND.size} of ${CASE.words.length}`;
  const m = CASE.memo, f = m.form, res = new Set(m.result);
  const part = p => {
    const bits = esc(p.text).split("___");
    const sentence = bits.map((bit, n) =>
      n < bits.length - 1 ? bit + blank(p, n) : bit).join("");
    const v = VERDICT[p.id] || ["", ""];
    const lean = ACTIVE && ACTIVE.startsWith("row") && v[1] === "good"
      ? ` <button class="lean" data-part="${p.id}" title="Cite this signed part as evidence">＋ cite this part</button>`
      : "";
    return `<div class="part"><h3>${esc(p.title)}${lean}</h3><p>${sentence}</p>
      ${slot(p.id)}<button class="sign" data-part="${p.id}">Sign</button>
      <p class="verdict ${v[1]}" id="verdict-${p.id}">${esc(v[0])}</p></div>`;
  };
  const row = (r, i) => {
    const key = `row${i}`, v = VERDICT[key] || ["", ""];
    return `<div class="part row"><h3>${esc(r.label)}</h3>${slot(key)}
      <button class="sign" data-row="${i}">Sign</button>
      <p class="verdict ${v[1]}" id="verdict-${key}">${esc(v[0])}</p></div>`;
  };
  $("parts").innerHTML = (typing() ? datalists() : "") +
    `<div class="form"><div>${esc(f.office)}</div><div>${esc(f.kind)} · to ${
      esc(f.to)} · from ${esc(f.by)}</div><div class="subject">Subject: ${
      esc(m.subject)}</div></div>` +
    `<h3 class="sec">${esc(f.facts)}</h3>` +
    CASE.parts.filter(p => !res.has(p.id)).map(part).join("") +
    `<h3 class="sec">${esc(f.excluded)}</h3>` + m.rows.map(row).join("") +
    `<h3 class="sec">${esc(f.result)}</h3>` +
    CASE.parts.filter(p => res.has(p.id)).map(part).join("");
  $("parts").querySelectorAll("input.blank,select").forEach(i => {
    if (kept[i.id]) i.value = kept[i.id];
    i.oninput = i.onchange = () => say(i.dataset.part, "", "");
  });
  $("parts").querySelectorAll(".attach").forEach(b => b.onclick = () => {
    citing(ACTIVE === b.dataset.slot ? null : b.dataset.slot);
    memo();
  });
  $("parts").querySelectorAll(".lean").forEach(b => b.onclick = () => {
    const list = CITE[ACTIVE] || (CITE[ACTIVE] = []);
    const t = `part:${b.dataset.part}`;
    if (!list.includes(t)) list.push(t);
    remember(CASE.id, "cites", CITE);
    say(ACTIVE, "", "");
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
      if (!held) return say(id, marks.words, "bad");
      const v = await citations(id, m.cite[id], CITE[id] || []);
      say(id, marks[v], v === "holds" ? "good" : "bad");
    } else {
      const i = +b.dataset.row, r = m.rows[i];
      const raw = CITE[`row${i}`] || [];
      const lines = leaning(raw, CITE, VERDICT);
      const v = raw.length && !lines.length ? "proof"
        : await citations(r.id, r, lines);
      const whose = v === "own" ? `: something cited here is ${r.label}'s own word`
        : v === "ring" ? `: something cited here rests on somebody ${r.label} clears in turn` : "";
      say(`row${i}`, marks[v] + whose, v === "holds" ? "good" : "bad");
    }
  });
}

/* A ROW MAY LEAN ON A SIGNED PART (chapters/memo.py). "part:<id>" in a row's
   evidence stands for every line cited under that part, and only while the
   part holds; the lines are then marked for the row as if it had quoted
   them, so a part resting on somebody's own word is still their own word. */
function leaning(cited, cites, verdicts) {
  const out = [];
  for (const t of cited) {
    const m = /^part:(.+)$/.exec(t);
    const add = !m ? [t]
      : (verdicts[m[1]] || [])[1] === "good" ? (cites[m[1]] || []) : [];
    for (const x of add) if (!out.includes(x)) out.push(x);
  }
  return out;
}

/* "holds", "own", "ring", "proof" or "empty", for what was cited under one
   key. How many separate things must be proved is sealed too, so it is found
   by trying, and the answer's row needs a number nothing can meet. */
async function citations(key, sealed, cited) {
  if (!cited.length) return "empty";
  const marks = new Set(sealed.marks);
  let need = 0;
  for (let n = 1; n <= CASE.memo.max_need; n++)
    if (await seal(["need", key, n]) === sealed.need) { need = n; break; }
  const covered = new Set();
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


function say(id, text, cls) {
  VERDICT[id] = [text, cls];
  const el = $(`verdict-${id}`);
  if (el) { el.textContent = text; el.className = "verdict " + cls; }
  if (cls !== "good" && !id.startsWith("row"))
    for (const [k, list] of Object.entries(CITE))
      if (k.startsWith("row") && list.includes(`part:${id}`) && (VERDICT[k] || [])[1])
        say(k, "", "");
  tally();
}

/* THE SCORE. How many questions Sarah has asked, under the report; and once
   every part holds, the fewest that bring out all the evidence beside it
   (meetings.py `fewest_questions`). The fewest is kept back until then: it is
   a number about the chapter, and a player still working should not be
   counting against it. */
function tally() {
  const el = $("asked");
  if (!el) return;
  const walk = CASE && CASE.walk;
  if (!walk || typeof questions !== "function" || !walking()) { el.textContent = ""; return; }
  const q = questions();
  const keys = CASE.parts.map(p => p.id)
    .concat(CASE.memo ? CASE.memo.rows.map((_, i) => `row${i}`) : []);
  const solved = keys.length && keys.every(k => (VERDICT[k] || [])[1] === "good");
  const asked = `${q} question${q === 1 ? "" : "s"}`;
  el.textContent = solved && walk.fewest
    ? `Every part holds. Sarah asked ${asked}; all the evidence in this chapter can be had with ${walk.fewest}.`
    : `Sarah has asked ${asked} so far.`;
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
