import assert from "node:assert/strict";
import test from "node:test";
import { localizePageFaq, pageFaq } from "../src/pageFaqContent.ts";
import { testUiLocale } from "./ui-locale-test-support.mjs";

const contexts = [
  ["/vocab/usage/stops"],
  ["/vocab/usage/divisions"],
  ["/vocab/reference"],
  ["/vocab/omaro"],
  ["/vocab"],
  ["/use-cases/builder-workshop-networks"],
  ["/use-cases/research-workbench"],
  ["/use-cases/regional-organ-stop-names"],
  ["/use-cases/organ-corpus-coverage"],
  ["/use-cases/documented-organ-lifecycles"],
  ["/use-cases/dalmatia-pipe-organs-fire-vulnerability"],
  ["/use-cases"],
  ["/organs/example/components/example/pipe-positions/example"],
  ["/organs/example", "specification"],
  ["/organs/example", "history"],
  ["/organs/example", "media"],
  ["/organs/example", "export"],
  ["/organs/example"],
  ["/organs"],
  ["/events"],
  ["/map"],
  ["/actors"],
  ["/virtual-instruments"],
  ["/literature"],
  ["/scores"],
  ["/temperaments"],
  ["/source/example"],
  ["/resources"],
  ["/about/release"],
];

test("all FAQ questions, answers and context labels resolve in both locales with stable anchors", () => {
  const english = testUiLocale("en").t;
  const german = testUiLocale("de").t;
  const setIds = new Set();
  const itemIds = new Set();
  for (const [path, tab] of contexts) {
    const baseline = pageFaq(path, tab);
    assert.ok(baseline, path);
    const translated = localizePageFaq(baseline, german);
    assert.deepEqual(localizePageFaq(baseline, english), baseline);
    assert.equal(translated.id, baseline.id);
    assert.notEqual(translated.label, baseline.label);
    assert.deepEqual(translated.items.map(({ id }) => id), baseline.items.map(({ id }) => id));
    setIds.add(translated.id);
    for (const [index, item] of translated.items.entries()) {
      const original = baseline.items[index];
      itemIds.add(item.id);
      assert.notEqual(item.question, original.question, item.id);
      assert.notEqual(item.answer, original.answer, item.id);
      assert.equal(item.link?.href, original.link?.href, item.id);
      if (original.link) assert.notEqual(item.link.label, original.link.label, item.id);
    }
  }
  assert.equal(setIds.size, 29);
  assert.equal(itemIds.size, 48);
});

test("German FAQ preserves original register wording and contextual specification terms", () => {
  const german = testUiLocale("de").t;
  const stops = localizePageFaq(pageFaq("/vocab/usage/stops"), german);
  const example = stops.items.find(({ id }) => id === "stop-matching");
  for (const literal of ["Vox Humana 8", "Vox Humana", "Vox Humana Echo"]) {
    assert.ok(example.answer.includes(`„${literal}“`));
  }
  assert.equal(example.link.href, "/vocab/usage/stops?q=Vox+Humana");
  const specification = localizePageFaq(pageFaq("/organs/example", "specification"), german);
  assert.match(specification.items.find(({ id }) => id === "dates").question, /„Erfasste Disposition“/);
  assert.match(specification.items.find(({ id }) => id === "stop-totals").answer, /Registerliste/);
  assert.equal(localizePageFaq(pageFaq("/unknown"), german), null);
});
