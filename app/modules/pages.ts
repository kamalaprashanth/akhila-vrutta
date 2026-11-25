import type { Module } from "./types.ts";
import { html, raw } from "../core/dom.ts";
import { ctx } from "../core/app.ts";
import { settings } from "./settings.ts";
import { money } from "./money/index.ts";
import { household } from "./household/index.ts";

const ICONS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  money: "M3 7h18v12H3zM3 11h18M7 15h3",
  household: "M4 20V9l8-5 8 5v11M9 20v-6h6v6",
  health: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  docs: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .3-1.5-1.5L17 5l-3-1-1 2h-2l-1-2-3 1 .5 1.8L6 8.3 4 8l-1 3 2 1v0l-2 1 1 3 2-.3 1.5 1.5L7 19l3 1 1-2h2l1 2 3-1-.5-1.8 1.5-1.5 2 .3 1-3z",
};

/** Milestones as planned; `done` flips as each one ships. */
const MILESTONES: { n: number; name: string; done: boolean }[] = [
  { n: 1, name: "Foundation: repository, build, checks, deploys", done: true },
  { n: 2, name: "Money planner moved over", done: true },
  { n: 3, name: "Shared core and your data moved", done: true },
  { n: 4, name: "Android app", done: true },
  { n: 5, name: "Household", done: false },
  { n: 6, name: "Health", done: false },
  { n: 7, name: "Document vault", done: false },
  { n: 8, name: "Family", done: false },
];

const soon = (what: string, milestone: number, more: string): string => html`
  <section class="card">
    <h2>${what}</h2>
    <p>${more}</p>
    <p class="note">Arrives in Milestone ${milestone}.</p>
  </section>`;

export const home: Module = {
  id: "home",
  label: "Home",
  icon: ICONS.home,
  render(root) {
    const next = MILESTONES.find((m) => !m.done);
    root.innerHTML = html`
      <section class="hero">
        <p class="eyebrow">Akhila Vrutta</p>
        <h1>Money, home, health and documents in one place</h1>
        <p>${next ? `Being built now: Milestone ${next.n}, ${next.name.toLowerCase()}.` : "All milestones are done."}</p>
      </section>
      <section class="card">
        <h2>Milestones</h2>
        <ol class="ms">${MILESTONES.map(
          (m) => raw(html`<li class="${m.done ? "done" : ""}"><span class="mk">${m.done ? "✓" : String(m.n)}</span><span>${m.name}</span></li>`),
        )}</ol>
      </section>
      <section class="card">
        <h2>KP Money Planner</h2>
        <p>Everything it does is in Money here. The old app stays as it is.</p>
        <a class="btn" href="https://kp-money-planner.web.app" rel="noopener">Open KP Money Planner</a>
      </section>`;
  },
};

export const health: Module = {
  id: "health",
  label: "Health",
  icon: ICONS.health,
  render(root) {
    root.innerHTML = soon("Health", 6, "Readings, lab reports with their values read out, and check-up reminders, for each person.");
  },
};

export const docs: Module = {
  id: "docs",
  label: "Documents",
  icon: ICONS.docs,
  render(root) {
    root.innerHTML = soon("Documents", 7, "Passport, licence and policies, encrypted in your Drive, with expiry reminders.");
  },
};

export const MODULES: Module[] = [home, money, household, health, docs, settings];
