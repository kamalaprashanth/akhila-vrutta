// Help's text (approved design, 27 Nov 2026): every link goes somewhere, every page note and word points at a real
// article, ids are unique, search finds things, and no personal names from the owner's own data slipped in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, ARTICLES, FAQS, TIPS, WORDS, searchHelp, tipFor } from "../../app/core/help.ts";

const ids = new Set(ARTICLES.map((a) => a.id));
test("article and question ids are unique, and every article has an area", () => {
  assert.equal(ids.size, ARTICLES.length);
  assert.equal(new Set(FAQS.map((f) => f.id)).size, FAQS.length);
  for (const a of ARTICLES) assert.ok(AREAS.some((x) => x.id === a.area), a.id);
  for (const x of AREAS) assert.ok(ARTICLES.some((a) => a.area === x.id), `area ${x.id} has an article`);
});
test("every 'more' link points at an article", () => {
  for (const f of FAQS) if (f.more) assert.ok(ids.has(f.more), `question ${f.id} → ${f.more}`);
  for (const [k, w] of Object.entries(WORDS)) if (w.more) assert.ok(ids.has(w.more), `word ${k} → ${w.more}`);
  for (const [k, t] of Object.entries(TIPS)) assert.ok(ids.has(t.more), `note ${k} → ${t.more}`);
});
test("text holds no markup but <b>", () => {
  const all = JSON.stringify({ ARTICLES, FAQS, WORDS, TIPS });
  for (const m of all.match(/<\/?([a-z]+)/g) ?? []) assert.match(m, /^<\/?b$/);
});
test("no names from the owner's own data", () => {
  const all = JSON.stringify({ ARTICLES, FAQS, WORDS, TIPS });
  for (const n of ["KP", "Slice", "Monisha", "Jyo", "Dad", "LP"]) assert.ok(!new RegExp(`\\b${n}\\b`).test(all), n);
});
test("a page's note: the most specific one", () => {
  assert.equal(tipFor("money:plan:regular")?.key, "money:plan:regular");
  assert.equal(tipFor("household:due")?.key, "household");
  assert.equal(tipFor("today:today")?.key, "today");
  assert.equal(tipFor("money:card"), null);
  assert.equal(tipFor("profile"), null);
});
test("search finds articles, questions and words, and needs every word typed", () => {
  const r = searchHelp("reserve");
  assert.ok(r.words.some(([k]) => k === "reserve"));
  assert.ok(r.articles.some((a) => a.id === "cashflow"));
  assert.ok(r.faqs.some((f) => f.id === "reserve"));
  assert.equal(searchHelp("reserve zzzz").articles.length, 0);
  assert.deepEqual(searchHelp("  "), { articles: [], faqs: [], words: [] });
  assert.ok(searchHelp("PASSPHRASE").faqs.some((f) => f.id === "forgot"), "any case");
});
