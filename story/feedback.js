"use strict";

/* THE QUESTIONNAIRE, AND THE PLAY LOG (14 September 2026).

   Human playtests come before more chapters (HANDOFF.md, the step back), and
   a link with no way back gets you players and no playtest. So the app asks.

   WHERE THE ANSWERS GO. Nowhere, by themselves. The app is a static page with
   no server, and it stays that way: the player copies what they wrote, or
   opens an email with it already in, or posts it on GitHub. FEEDBACK_TO is the
   address the email goes to; while it is null there is no email button, which
   is the honest thing for a page that has nobody to write to. It has one now,
   an address of the game's own and nobody's personal one.

   WHAT IT ASKS, AND WHAT IT DOES NOT. What stopped a player, what confused
   them, whom they suspected and what changed their mind, whether citing felt
   like puzzle or paperwork, and whether anything read like a waste of time
   (the padding, which the cold reads could not settle). It never asks a
   question that teaches: nothing here says a witness might lie or an object
   is true, because a questionnaire read before the report is finished is part
   of the game.

   THE PLAY LOG is counts and marks only: how many questions, how many lines
   heard, which day, which parts hold. No words from the report and no cited
   line, so a log is safe to post where others read it. The player sees all of
   it before sending, and can leave it out. */

const FEEDBACK_TO = "typingpool1969@gmail.com";   // the game's own, 17 September 2026
const FEEDBACK_ISSUES = "https://github.com/ApolloEndenich/typing-pool-play/issues/new";

/* Written in English and shown in the player's language (N_, i18n.js). A
   chosen option is kept by its English, so an answer reads the same to us
   whichever language it was given in; the games' names are names. */
const ASK = [
  {id: "far", kind: "one", q: N_("How far did you get?"),
   options: [N_("Every part of the report holds"), N_("I filled in some of the report"),
             N_("I stopped before writing the report")]},
  {id: "stopped", kind: "text", q: N_("If you stopped, where were you, and what made you stop?")},
  {id: "stuck", kind: "text", q: N_("Was there a moment when you did not know what to do next? What was it?")},
  {id: "unclear", kind: "text",
   q: N_("Was anything about how to play unclear: the map, talking to people, the report, citing evidence?")},
  {id: "suspect", kind: "text",
   q: N_("Did you suspect somebody who turned out not to be the answer? What changed your mind? (This may spoil the case, so leave it out of anything public.)")},
  {id: "citing", kind: "one",
   q: N_("Citing evidence for every part and every person: how did that feel?"),
   options: [N_("Part of the puzzle"), N_("Somewhere in between"), N_("Paperwork")]},
  {id: "citingwhy", kind: "text", q: N_("Why?")},
  {id: "waste", kind: "text", q: N_("Was there anything you read that felt like a waste of your time?")},
  {id: "long", kind: "text", q: N_("Roughly how long did you play?")},
  {id: "again", kind: "one", q: N_("Would you play another chapter?"),
   options: [N_("Yes"), N_("Maybe"), N_("No")]},
  {id: "played", kind: "many", q: N_("Have you played any of these?"),
   options: ["Return of the Obra Dinn", "The Case of the Golden Idol",
             "Sherlock Holmes Consulting Detective", "Her Story", "Papers, Please",
             "Murdle", N_("None of them")]},
  {id: "device", kind: "one", q: N_("What did you play on?"),
   options: [N_("A computer"), N_("A tablet"), N_("A phone")]},
  {id: "found", kind: "text", q: N_("How did you come across it?")},
  {id: "else", kind: "text", q: N_("Anything else?")},
];

/* Minutes with the page in front of the player, counted once a minute while
   it is visible. Rough on purpose: it is there to fill in "how long" for
   somebody who has no idea, and they can change it. */
function feedbackClock() {
  setInterval(() => {
    if (!CASE || document.hidden) return;
    remember(CASE.id, "minutes", recall(CASE.id, "minutes", 0) + 1);
    if (!recall(CASE.id, "started", null))
      remember(CASE.id, "started", new Date().toISOString().slice(0, 10));
  }, 60000);
}

function playLog() {
  const parts = CASE.parts.map(p => {
    const v = (VERDICT[p.id] || [])[1];
    return `${p.title}: ${v === "good" ? "holds" : v === "bad" ? "does not hold yet" : "not signed"}`;
  });
  const notes = CASE.memo && levelOf() === "notes";
  const rows = CASE.memo && !notes ? CASE.memo.rows.length : 0;
  const rowsHeld = CASE.memo
    ? CASE.memo.rows.filter((_, i) => (VERDICT[`row${i}`] || [])[1] === "good").length : 0;
  const total = CASE.days.reduce((n, d) => n + d.sections.reduce((m, s) => m + s.lines.length, 0), 0);
  const walked = typeof walking === "function" && walking();
  return [
    `chapter: ${CASE.title} (${CASE.id})`,
    `first played: ${recall(CASE.id, "started", "today")}`,
    `minutes with the page open: about ${recall(CASE.id, "minutes", 0)}`,
    walked && W ? `day ${W.day}, ${phase().name}; ${questions()} questions asked, ${shrugs()} shrugged off` : "read the whole file, without walking",
    walked ? `lines heard: ${HEARD.size} of ${total}` : "",
    ...parts,
    CASE.memo ? `the report asks for: ${CASE.memo.levels.find(l => l.id === levelOf()).name}` : "",
    notes ? `signatures: ${recall(CASE.id, "signatures", 0)}` : "",
    rows ? `people ruled out and signed: ${rowsHeld} of ${rows}` : "",
    `filling in: ${MODE}; screen ${window.innerWidth}x${window.innerHeight}; ${navigator.language}`,
  ].filter(Boolean).join("\n");
}

function feedbackGuess() {
  const d = recall(CASE.id, "feedback", {});
  if (!d.long && recall(CASE.id, "minutes", 0))
    d.long = tx("about {n} minutes (the page's own count)", {n: recall(CASE.id, "minutes", 0)});
  if (!d.device)
    d.device = window.innerWidth < 700 ? "A phone" : window.innerWidth < 1100 ? "A tablet" : "A computer";
  if (!d.far) {
    const held = CASE.parts.filter(p => (VERDICT[p.id] || [])[1] === "good").length;
    if (held === CASE.parts.length) d.far = "Every part of the report holds";
  }
  return d;
}

function feedbackForm() {
  const d = feedbackGuess();
  const field = a => {
    const name = `fb-${a.id}`;
    if (a.kind === "text")
      return `<label class="fbq"><span>${esc(tx(a.q))}</span><textarea name="${name}" rows="2">${
        esc(d[a.id] || "")}</textarea></label>`;
    const type = a.kind === "one" ? "radio" : "checkbox";
    const on = o => (a.kind === "one" ? d[a.id] === o : (d[a.id] || []).includes(o));
    return `<fieldset class="fbq"><legend>${esc(tx(a.q))}</legend>${a.options.map(o =>
      `<label><input type="${type}" name="${name}" value="${esc(o)}"${on(o) ? " checked" : ""}> ${
        esc(tx(o))}</label>`).join("")}</fieldset>`;
  };
  $("fbform").innerHTML = ASK.map(field).join("") +
    `<label class="fbq fblog"><span><input type="checkbox" id="fb-log"${
      d.log === false ? "" : " checked"}> ${tx("Include the play log")}</span>` +
    `<pre id="fb-logtext">${esc(playLog())}</pre></label>`;
  $("fbform").oninput = $("fbform").onchange = () => {
    remember(CASE.id, "feedback", feedbackRead());
    $("fbsaid").textContent = "";
  };
}

function feedbackRead() {
  const out = {};
  for (const a of ASK) {
    const els = [...document.getElementsByName(`fb-${a.id}`)];
    if (a.kind === "text") out[a.id] = els[0] ? els[0].value : "";
    else if (a.kind === "one") out[a.id] = (els.find(e => e.checked) || {}).value || "";
    else out[a.id] = els.filter(e => e.checked).map(e => e.value);
  }
  out.log = $("fb-log") ? $("fb-log").checked : true;
  return out;
}

function feedbackText() {
  const d = feedbackRead();
  /* the questions as the player read them; the log stays English, for us */
  const lines = [`The Typing Pool, ${CASE.title}: how it went` +
                 (LANG === "en" ? "" : ` (played in ${LANG})`), ""];
  for (const a of ASK) {
    const v = Array.isArray(d[a.id]) ? d[a.id].map(o => tx(o)).join(", ")
      : a.kind === "one" ? tx(d[a.id] || "") : (d[a.id] || "").trim();
    if (v) lines.push(tx(a.q), v, "");
  }
  if (d.log) lines.push("PLAY LOG", playLog());
  return lines.join("\n");
}

function feedbackSheet() {
  const open = () => {
    if (!CASE) return;
    feedbackForm();
    $("fbsaid").textContent = "";
    $("mailfeedback").hidden = !FEEDBACK_TO;
    $("feedback").hidden = false;
    $("feedback").querySelector(".closer").focus();
  };
  $("openfeedback").onclick = open;
  $("copyfeedback").onclick = async () => {
    const t = feedbackText();
    try {
      await navigator.clipboard.writeText(t);
      $("fbsaid").textContent = tx("Copied. Paste it into an email or a message.");
    } catch (e) {
      $("fbsaid").textContent = tx("This browser would not copy it; select the text below and copy it by hand.");
      $("fb-logtext").textContent = t;
    }
  };
  $("mailfeedback").onclick = () => {
    location.href = `mailto:${FEEDBACK_TO}?subject=${encodeURIComponent(
      "The Typing Pool: " + CASE.title)}&body=${encodeURIComponent(feedbackText())}`;
  };
  $("postfeedback").onclick = () => {
    const url = `${FEEDBACK_ISSUES}?title=${encodeURIComponent("Playtest: " + CASE.title)}&body=${
      encodeURIComponent(feedbackText())}`;
    window.open(url, "_blank", "noopener");
  };
  feedbackClock();
  return open;
}
