/** Small DOM helpers shared by every module. */

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(sel);

/** Escapes text for safe use inside HTML. */
export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Tagged template that escapes every interpolated value unless it is wrapped with raw(). */
export interface Raw {
  readonly __raw: string;
}
export const raw = (html: string): Raw => ({ __raw: html });

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? "";
  values.forEach((v, i) => {
    const piece = Array.isArray(v)
      ? v.map((x) => (isRaw(x) ? x.__raw : esc(x))).join("")
      : isRaw(v)
        ? v.__raw
        : esc(v);
    out += piece + (strings[i + 1] ?? "");
  });
  return out;
}

function isRaw(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && "__raw" in v;
}

let toastTimer: number | undefined;
export function toast(msg: string): void {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("on");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el?.classList.remove("on"), 2600);
}
