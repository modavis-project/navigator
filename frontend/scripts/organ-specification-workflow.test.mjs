import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/organSpecificationWorkflow.ts", import.meta.url), "utf8");
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText, context);
const { hasSpecificationDescriptions, selectedSpecificationFacts } = context.exports;

test("main-only and single-account organs can open revision-bound description links", () => {
  // Hamburg H3FX-6Q8B-B: the bounded public API supplies two main accounts,
  // with 63 and 0 captured stop rows. Neither is an alternative period.
  const descriptions = [
    { id: "specdesc:f52100096f490eb2d3601d4ba3034771", kind: "main", stopCount: 63, revision: "dd18cf035d2800888d996f534c006754935574959aa569706e1bb490f1c7b1e6" },
    { id: "specdesc:b0959f70dd6bb0aaf00a0c4cf370c713", kind: "main", stopCount: 0, revision: "330ef4e836e1d34546d8e5e38bdd65db7f9315445cd2234b96d4aa70fcd4c9d1" },
  ];
  assert.equal(hasSpecificationDescriptions({ specificationDescriptions: descriptions }), true);
  assert.equal(hasSpecificationDescriptions({ specificationDescriptions: [descriptions[1]] }), true);
  assert.equal(hasSpecificationDescriptions({ specificationDescriptions: [{ ...descriptions[0], kind: "alternative" }] }), true);
  assert.equal(hasSpecificationDescriptions({ specificationDescriptions: [] }), false);
  assert.equal(hasSpecificationDescriptions({}), false);
});

test("component-source facts preserve the measured Leipzig 6 / 0 / 2 attribution rather than all eight", () => {
  const ids = ["sr:orgbase:orgbase_id:2002830", "sr:orgelsachsen:orgelsachsen_id:leipzig-nikolaikirche", "sr:orguesfrance:orguesfrance_id:leipzignikolaikirche.html"];
  const sources = ids.map(id => ({ id, source: { id } }));
  const facts = [...Array.from({ length: 6 }, (_, index) => ({ id: `orgbase-${index}`, sourceRecordId: ids[0], qualificationGuidance: "Source account only" })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `orguesfrance-${index}`, sourceRecordId: ids[2], qualificationGuidance: "Source account only" }))];
  const organ = { sourceSpecifications: sources, technicalEvidence: { factCount: 8, facts } };
  assert.equal(selectedSpecificationFacts(organ, sources[0]).length, 6);
  assert.equal(selectedSpecificationFacts(organ, sources[1]).length, 0);
  assert.equal(selectedSpecificationFacts(organ, sources[2]).length, 2);
  assert.equal(selectedSpecificationFacts(organ, sources[0])[0], facts[0], "qualifiers and the original assertion must be retained");
  assert.equal(organ.technicalEvidence.facts.length, 8, "selection must not mutate the retained evidence");
});

test("a missing or unmatched source cannot inherit the organ-wide technical facts", () => {
  const facts = [{ id: "fact", sourceRecordId: "sr:known" }];
  const organ = { sourceSpecifications: [{ source: { id: "sr:known" } }], technicalEvidence: { facts } };
  assert.equal(selectedSpecificationFacts(organ).length, 0);
  assert.equal(selectedSpecificationFacts(organ, { source: { id: "sr:missing" } }).length, 0);
  assert.equal(selectedSpecificationFacts(organ, { source: { id: "" } }).length, 0);
  assert.equal(selectedSpecificationFacts(organ, { source: { id: "SR:KNOWN" } }).length, 0);
});

test("legacy records without source sets retain their evidence and missing evidence remains empty", () => {
  const facts = [{ id: "legacy-fact", sourceRecordId: "sr:legacy" }];
  assert.equal(selectedSpecificationFacts({ technicalEvidence: { facts } }), facts);
  assert.equal(selectedSpecificationFacts({ sourceSpecifications: [], technicalEvidence: { facts } }), facts);
  assert.equal(selectedSpecificationFacts({}).length, 0);
});
