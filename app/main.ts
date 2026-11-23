/** The shell: header, tab bar, routing between modules. */
import { MODULES } from "./modules/pages.ts";
import { html, raw, $ } from "./core/dom.ts";

const routeId = (): string => location.hash.replace(/^#\/?/, "").split("/")[0] || "home";

function renderNav(active: string): string {
  return MODULES.map((m) =>
    raw(html`<a href="#/${m.id}" class="tab${m.id === active ? " on" : ""}" ${raw(m.id === active ? 'aria-current="page"' : "")}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${m.icon}"/></svg><span>${m.label}</span></a>`),
  ).map((r) => r.__raw).join("");
}

function render(): void {
  const id = routeId();
  const mod = MODULES.find((m) => m.id === id) ?? MODULES[0];
  if (!mod) return;
  const nav = $("#nav");
  const main = $("#main");
  const title = $("#title");
  if (nav) nav.innerHTML = renderNav(mod.id);
  if (title) title.textContent = mod.id === "home" ? "Akhila Vrutta" : mod.label;
  if (main) {
    mod.render(main);
    main.focus({ preventScroll: true });
  }
  document.title = mod.id === "home" ? "Akhila Vrutta" : `${mod.label} · Akhila Vrutta`;
}

window.addEventListener("hashchange", render);
render();
