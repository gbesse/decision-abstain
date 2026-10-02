import test from "node:test";
import assert from "node:assert/strict";
import { applyAbstention, booleanDecomposition, calibrate, combineBooleanAnswers, evaluate, evaluateHoldout, generateAbsentCases, type ScoredDecision } from "../src/index.js";

const examples: ScoredDecision[] = [
  { id: "a", expected: "yes", probabilities: { yes: .95, no: .05 } },
  { id: "b", expected: "no", probabilities: { yes: .3, no: .7 } },
  { id: "c", expected: null, probabilities: { yes: .55, no: .45 } },
];

test("abstains below threshold and reports absent recall", () => {
  assert.equal(applyAbstention(examples[2]!, { threshold: .8 }).reason, "below-threshold");
  const metrics = evaluate(examples, { threshold: .8 });
  assert.equal(metrics.absentRecall, 1);
  assert.equal(metrics.selectiveAccuracy, 1);
});

test("calibrates against asymmetric absent-answer cost", () => {
  const result = calibrate(examples, { thresholds: [.5, .6, .8], minimumCoverage: .3 });
  assert.equal(result.policy.threshold, .6);
  assert.equal(result.metrics.falseAnswerRateOnAbsent, 0);
});

test("keeps holdout separate", () => {
  assert.throws(() => calibrate([{ ...examples[0]!, split: "holdout" }]), /Holdout/);
  assert.equal(evaluateHoldout([{ ...examples[0]!, split: "holdout" }], { threshold: .5 }).overallAccuracy, 1);
});

test("decomposes candidates and combines independent Boolean checks", () => {
  const questions = booleanDecomposition({ name: "route", instructions: "Choose a route.", criteria: { refund: "refund evidence", sales: "sales evidence" } });
  assert.deepEqual(Object.keys(questions), ["route__refund", "route__sales"]);
  const result = combineBooleanAnswers({ route__refund: { probabilityTrue: .88 }, route__sales: { probabilityTrue: .2 } }, "route", { threshold: .8, margin: .2 });
  assert.equal(result.outcome, "refund");
});

test("generates adversarial absent-answer cases", () => {
  const generated = generateAbsentCases([{ id: "x", expected: "a", probabilities: { a: .8, b: .15, c: .05 } }]);
  assert.equal(generated[0]?.expected, null);
  assert.deepEqual(Object.keys(generated[0]!.probabilities), ["b", "c"]);
  assert.ok(Math.abs(Object.values(generated[0]!.probabilities).reduce((a, b) => a + b, 0) - 1) < .001);
});
