"use strict";

/* THE APP'S OWN WORDS, IN THE READER'S LANGUAGE (26 September 2026).

   The chapters come translated from the exporter (chapters/i18n.py), sealed
   on their own words. This is the rest: the buttons, the marks' sentences,
   the manual. tx() of an English string gives the reader's language, or the
   English where there is none, and chapters/i18n.py reads every call of tx
   in these scripts to know what a translator has to do -- so the English
   goes in literally, in double quotes, never built from pieces, and anything
   that varies is a {name}. (A call written out in a comment is read too.)

   A {name} may ask for a form: "Sarah tells {person:dat} what she saw" is
   German for a sentence whose person stands in the dative. The form comes
   from the case (walk.forms, from the catalog), so the app knows no grammar
   of any language. English asks for no form and gets the name.

   WHICH LANGUAGE. One setting for the whole site, `pool.lang`, as the duty
   sheet has it (web/lang.js): chosen on the front page, it carries in here.
   A language this app does not have falls back to English for itself without
   changing the setting. ?lang=de in the address chooses too. A language not
   yet released is offered only on this computer (localhost), so it can be
   played before anybody else sees it. */

let LANG = "en";
let UI = {text: {}, ids: {}, sep: ": ", boundary: true};
let LANGS = [{code: "en", name: "English", released: true}];

function tx(s, vals) {
  const tr = UI.text[s];
  return fillIn(tr ? tr : s, vals || {});
}

function fillIn(s, vals) {
  return String(s).replace(/\{(\w+)(?::(\w+))?\}/g, (m, k, form) => {
    if (!(k in vals)) return m;
    const v = vals[k];
    if (v && typeof v === "object")
      return (form && v.forms && v.forms[form]) || v.base;
    return v;
  });
}

const onThisComputer = () => {
  try {
    return location.protocol === "file:" ||
      /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  } catch (e) { return false; }
};

/* where a chapter of this language lives */
const casePath = file => LANG === "en" ? `cases/${file}` : `cases/${LANG}/${file}`;

async function chooseLanguage() {
  try { LANGS = await (await fetch("lang/index.json")).json(); } catch (e) {}
  const offered = LANGS.filter(l => l.released || onThisComputer());
  const have = code => offered.some(l => l.code === code);
  let asked = null;
  try { asked = new URLSearchParams(location.search).get("lang"); } catch (e) {}
  let want = asked && LANGS.some(l => l.code === asked) ? asked : null;
  if (asked && want) { try { localStorage.setItem("pool.lang", want); } catch (e) {} }
  if (!want) { try { const v = localStorage.getItem("pool.lang"); if (have(v)) want = v; } catch (e) {} }
  if (!want) {
    try {
      for (const w of navigator.languages || [navigator.language || "en"]) {
        const short = String(w).toLowerCase().split("-")[0];
        if (have(short)) { want = short; break; }
      }
    } catch (e) {}
  }
  LANG = want || "en";
  if (LANG !== "en") {
    try { UI = await (await fetch(`lang/${LANG}.json`)).json(); }
    catch (e) { LANG = "en"; }
  }
  document.documentElement.lang = LANG;
  pageWords();
  picker(offered);
}

/* The page's own pieces, by id: data-i18n on an element puts its translation
   in, data-i18n-title (and -placeholder, -aria-label) its attribute. */
function pageWords() {
  if (LANG === "en") return;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const v = UI.ids[el.dataset.i18n];
    if (v) el.innerHTML = v;
  });
  for (const a of ["title", "placeholder", "aria-label"])
    document.querySelectorAll(`[data-i18n-${a}]`).forEach(el => {
      const v = UI.ids[el.getAttribute(`data-i18n-${a}`)];
      if (v) el.setAttribute(a, v);
    });
}

/* The picker, beside Settings, when there is more than one language to offer. */
function picker(offered) {
  const s = document.getElementById("langpick");
  if (!s) return;
  s.hidden = offered.length < 2;
  s.innerHTML = offered.map(l =>
    `<option value="${l.code}"${l.code === LANG ? " selected" : ""}>${l.name}${
      l.released ? "" : " ·"}</option>`).join("");
  s.onchange = () => {
    try { localStorage.setItem("pool.lang", s.value); } catch (e) {}
    const u = new URL(location.href);
    u.searchParams.delete("lang");
    location.href = u.toString();
  };
}

/* A name or a thing, with the forms the case gives it in this language. */
const withForms = (base, forms) => ({base, forms: forms || {}});

/* A string written down now and translated where it is shown: N_ marks it
   for chapters/i18n.py and changes nothing (gettext's own convention). */
const N_ = s => s;

/* The three kinds of word a blank takes, as the reader's language calls them. */
const kindName = k => ({person: tx("person"), time: tx("time"), thing: tx("thing")}[k] || k);

/* Whether a word is only found whole: not in a script without spaces
   (chapters/i18n.py, `boundary`). */
const bounded = () => !(typeof CASE !== "undefined" && CASE && CASE.lang &&
                        CASE.lang.boundary === false);

/* THE WORD A PLAYER TYPED, with or without its article (chapters/i18n.py,
   THE BLANK RULE: a report word carries its article, and a typed answer may
   leave it off, as it may misspell the case). The word exactly first; else
   the one word that is the same without an article on either side. */
function wordTyped(v) {
  const words = CASE.words, low = v.trim().toLowerCase();
  const exact = words.find(x => x.text.toLowerCase() === low);
  if (exact) return exact;
  const arts = (CASE.lang && CASE.lang.articles) || ["the", "a", "an"];
  const cut = s => { const w = s.toLowerCase().split(/\s+/);
                     return w.length > 1 && arts.includes(w[0]) ? w.slice(1).join(" ") : w.join(" "); };
  const same = words.filter(x => cut(x.text) === cut(low));
  return same.length === 1 ? same[0] : undefined;
}

/* What stands between a line's source and the line: ": " in English. */
const lineSep = () => (typeof CASE !== "undefined" && CASE && CASE.lang && CASE.lang.sep) || ": ";
