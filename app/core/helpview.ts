/**
 * Help, drawn: the Help home (search, Start here, areas, questions), an article, the questions page, the list of
 * words, and the sheet for one word. Used by the app's Help page and by the website's public help.html, so it
 * knows nothing about the store; `link(id)` says how an article is addressed ("#/help/plan" or "#plan").
 */
import { html, raw } from "./dom.ts";
import { AREAS, ARTICLES, FAQS, WORDS, articleById, searchHelp, type Article, type Block, type Faq, type Word } from "./help.ts";

export type Link = (id: string) => string;

/** One block of an article. Article text is written in help.ts (it may hold <b>), so it goes in as built. */
function blockHtml(b: Block): string {
  if (typeof b === "string") return html`<p class="hlpp">${raw(b)}</p>`;
  if ("h" in b) return html`<div class="sh"><h3>${b.h}</h3></div>`;
  if ("eg" in b) return html`<div class="hlpeg"><b>Example</b><p>${raw(b.eg)}</p></div>`;
  if ("flow" in b) return html`<div class="hlpflow">${raw(b.flow.map(([t, s], i) => html`${raw(i ? '<i aria-hidden="true">›</i>' : "")}<div><b>${t}</b>${s}</div>`).join(""))}</div>`;
  return html`<ul class="hlpul">${raw(b.list.map((x) => html`<li>${raw(x)}</li>`).join(""))}</ul>`;
}
const row = (a: Article, link: Link): string => html`<a class="row tap" href="${link(a.id)}"><div class="main"><div class="t">${a.title}</div>${raw(a.sub ? html`<div class="s">${a.sub}</div>` : "")}</div><span class="hlpgo" aria-hidden="true">›</span></a>`;
/** A question, opened or closed (a native details, so it works without script). */
const faqHtml = (f: Faq, link: Link, open = false): string => html`<details class="hlpq" id="q-${f.id}" ${raw(open ? "open" : "")}><summary>${f.q}</summary><p>${f.a}</p>${raw(f.more ? html`<a class="hlpmore" href="${link(f.more)}">More in “${articleById(f.more)?.title ?? ""}” ›</a>` : "")}</details>`;

export function helpHome(link: Link, o: { q?: string; faqLink: string; wordsLink: string; extra?: string } = { faqLink: "#faq", wordsLink: "#words" }): string {
  const q = (o.q ?? "").trim();
  const box = html`<form class="hlpf" role="search"><input class="lsearch hlps" id="hlpQ" type="search" placeholder="Search help: “reserve”, “EMI”, “passphrase”" aria-label="Search help" autocomplete="off" value="${q}"></form>`;
  if (q) {
    const r = searchHelp(q), none = !r.articles.length && !r.faqs.length && !r.words.length;
    return html`${raw(box)}<div id="hlpRes">
      ${raw(r.words.length ? html`<div class="sh"><h3>Words</h3></div><div class="list">${raw(r.words.map(([id, w]) => html`<button type="button" class="row tap hlpw" data-term="${id}"><div class="main"><div class="t">${w.word}</div><div class="s">${w.text}</div></div></button>`).join(""))}</div>` : "")}
      ${raw(r.articles.length ? html`<div class="sh"><h3>Articles</h3></div><div class="list">${raw(r.articles.map((a) => row(a, link)).join(""))}</div>` : "")}
      ${raw(r.faqs.length ? html`<div class="sh"><h3>Questions</h3></div>${raw(r.faqs.map((f) => faqHtml(f, link)).join(""))}` : "")}
      ${raw(none ? html`<div class="list"><div class="empty">Nothing found for “${q}”. Try another word, or write to us (Settings › About).</div></div>` : "")}</div>`;
  }
  const byArea = (id: string): Article[] => ARTICLES.filter((a) => a.area === id);
  return html`${raw(box)}<div id="hlpRes">
    <div class="sh"><h3>Start here</h3></div><div class="list">${raw(byArea("start").map((a) => row(a, link)).join(""))}</div>
    ${raw(AREAS.filter((x) => x.id !== "start").map((x) => html`<div class="sh"><h3>${x.title}</h3></div><div class="list">${raw(byArea(x.id).map((a) => row(a, link)).join(""))}</div>`).join(""))}
    <div class="sh"><h3>Questions people ask</h3></div>
    ${raw(FAQS.slice(0, 4).map((f) => faqHtml(f, link)).join(""))}
    <div class="list" style="margin-top:8px"><a class="row tap" href="${o.faqLink}"><div class="main"><div class="t">All ${String(FAQS.length)} questions</div></div><span class="hlpgo" aria-hidden="true">›</span></a><a class="row tap" href="${o.wordsLink}"><div class="main"><div class="t">Words used in the app</div><div class="s">Readiness, reserve, budget… in plain language</div></div><span class="hlpgo" aria-hidden="true">›</span></a></div>
    ${raw(o.extra ? html`<div class="sh"><h3>Page explanations</h3></div>${raw(o.extra)}` : "")}</div>`;
}

export function articleHtml(a: Article, link: Link): string {
  const rel = ARTICLES.filter((x) => x.area === a.area && x.id !== a.id), faqs = FAQS.filter((f) => f.more === a.id);
  return html`<p class="hlpsub">${a.sub}</p>${raw(a.body.map(blockHtml).join(""))}
    ${raw(faqs.length ? html`<div class="sh"><h3>Questions</h3></div>${raw(faqs.map((f) => faqHtml(f, link)).join(""))}` : "")}
    ${raw(rel.length ? html`<div class="sh"><h3>Also in ${AREAS.find((x) => x.id === a.area)?.title ?? ""}</h3></div><div class="list">${raw(rel.map((x) => row(x, link)).join(""))}</div>` : "")}`;
}

export const faqPage = (link: Link, open = ""): string => html`<p class="hlpsub">Tap a question to open it.</p>${raw(FAQS.map((f) => faqHtml(f, link, f.id === open)).join(""))}`;

export const wordsPage = (): string => html`<p class="hlpsub">The words the app uses, in plain language. On a page, a word with a dotted line under it can be tapped for this.</p>
  <div class="list">${raw(Object.entries(WORDS).map(([id, w]) => html`<div class="row hlpwd" id="w-${id}"><div class="main"><div class="t">${w.word}</div><div class="s">${w.text}</div>${raw(w.eg ? html`<div class="s"><i>${w.eg}</i></div>` : "")}</div></div>`).join(""))}</div>`;

/** The sheet for one word. */
export function wordSheet(w: Word, link: Link): string {
  return html`<p class="hlpp">${w.text}</p>${raw(w.eg ? html`<div class="hlpeg"><b>Example</b><p>${w.eg}</p></div>` : "")}
    <div class="btns"><button class="btn pri" type="button" id="cx">Got it</button>${raw(w.more ? html`<a class="btn" href="${link(w.more)}" id="hlpMore">Read more in Help</a>` : "")}</div>`;
}

/** A word you can tap, for pages to use: <button class="term" data-term="reserve">Big-bills reserve</button>. */
export const term = (id: string, label?: string): string => html`<button type="button" class="term" data-term="${id}">${label ?? WORDS[id]?.word ?? id}</button>`;

/** The drawn ⓘ (as on the help notes), for "what is this?" buttons. */
export const INFO_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" class="infoic"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
