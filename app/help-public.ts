/** The website's Help, readable without signing in (help.html): the same articles and questions as the app's. */
import { html, raw } from "./core/dom.ts";
import { WORDS, articleById } from "./core/help.ts";
import { articleHtml, faqPage, helpHome, wordsPage } from "./core/helpview.ts";

const link = (id: string): string => `#${id}`;
const main = document.getElementById("main")!;
let q = "";

function page(title: string, body: string): string {
  return html`<a class="lnk hlpback" href="#">‹ Help</a><h2 class="hlph">${title}</h2>${raw(body)}`;
}
function draw(): void {
  const part = decodeURIComponent(location.hash.slice(1));
  const a = articleById(part);
  if (part === "faq" || part.startsWith("q-")) main.innerHTML = page("Questions people ask", faqPage(link, part.slice(2)));
  else if (part === "words" || part.startsWith("w-")) main.innerHTML = page("Words used in the app", wordsPage());
  else if (a) main.innerHTML = page(a.title, articleHtml(a, link));
  else main.innerHTML = helpHome(link, { q, faqLink: "#faq", wordsLink: "#words" });
  document.title = a ? `${a.title} · Akhila Vrutta Help` : "Help · Akhila Vrutta";
  if (part.startsWith("w-") || part.startsWith("q-")) document.getElementById(part)?.scrollIntoView(); else window.scrollTo(0, 0);
  const inp = main.querySelector<HTMLInputElement>("#hlpQ");
  main.querySelector("form.hlpf")?.addEventListener("submit", (e) => e.preventDefault());
  inp?.addEventListener("input", () => { q = inp.value; const at = inp.selectionStart; draw(); const n = main.querySelector<HTMLInputElement>("#hlpQ")!; n.focus(); n.setSelectionRange(at, at); });
}
// a word in the search results: its line in the list of words
main.addEventListener("click", (e) => {
  const w = (e.target as HTMLElement).closest<HTMLElement>("[data-term]");
  if (w && WORDS[w.dataset.term!]) location.hash = `w-${w.dataset.term}`;
});
window.addEventListener("hashchange", draw);
draw();
