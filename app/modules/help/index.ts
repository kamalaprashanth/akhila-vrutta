/**
 * Help (approved design, 27 Nov 2026): search, Start here, an article for each area, questions people ask, and
 * the words the app uses. #/help, #/help/<article>, #/help/faq, #/help/words. The same text is on the website
 * without signing in (help.html).
 */
import type { Module } from "../types.ts";
import { html, raw } from "../../core/dom.ts";
import { ctx } from "../../core/app.ts";
import { articleById } from "../../core/help.ts";
import { articleHtml, faqPage, helpHome, wordsPage } from "../../core/helpview.ts";
import { helpLink, setTips, tipsOn } from "../../core/helptips.ts";

const ICON = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01";
let q = "";

const back = html`<a class="lnk hlpback" href="#/help">‹ Help</a>`;
function page(title: string, body: string): string {
  return html`<div class="mv hlpv"><div class="wrap">${raw(back)}<h2 class="hlph">${title}</h2>${raw(body)}</div></div>`;
}

function homeExtra(): string {
  const on = ctx.store ? tipsOn() : false;
  return ctx.store ? html`<div class="list"><label class="row hlptg"><div class="main"><div class="t">Show page explanations</div><div class="s">A short note on top of each page, and the Get started list in Money</div></div><input type="checkbox" id="hlpTips" ${raw(on ? "checked" : "")}></label></div>` : "";
}

function draw(root: HTMLElement): void {
  const part = location.hash.split("/")[2] ?? "";
  if (part === "faq") { root.innerHTML = page("Questions people ask", faqPage(helpLink)); return; }
  if (part === "words") { root.innerHTML = page("Words used in the app", wordsPage()); return; }
  const a = part ? articleById(part) : undefined;
  if (a) { root.innerHTML = page(a.title, articleHtml(a, helpLink)); window.scrollTo(0, 0); return; }
  root.innerHTML = html`<div class="mv hlpv"><div class="wrap">${raw(helpHome(helpLink, { q, faqLink: "#/help/faq", wordsLink: "#/help/words", extra: homeExtra() }))}</div></div>`;
  root.querySelector("form.hlpf")!.addEventListener("submit", (e) => e.preventDefault());
  const inp = root.querySelector<HTMLInputElement>("#hlpQ")!;
  inp.addEventListener("input", () => {
    q = inp.value;
    const at = inp.selectionStart;
    draw(root);
    const n = root.querySelector<HTMLInputElement>("#hlpQ")!;
    n.focus(); n.setSelectionRange(at, at);
  });
  root.querySelector<HTMLInputElement>("#hlpTips")?.addEventListener("change", (e) => setTips((e.target as HTMLInputElement).checked));
}

export const help: Module = {
  id: "help",
  label: "Help",
  icon: ICON,
  render: draw,
};
