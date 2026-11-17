import assert from "node:assert/strict";
import test from "node:test";
import {
  verifyQuoteAgainstAnswer,
  verifyAllEvidence,
  assessReliability,
  computeRubricDiff,
  computeScoreDeltas,
  computeAgreementMetrics,
  parseDatasetContent,
  splitDatasetLeakageSafe,
  fitSafeCalibrationOffset,
} from "./engines.ts";

test("evidence verifier matches exact and case-insensitive quotes and flags hallucinations", () => {
  const ans = "Chlorophyll absorbs light energy in chloroplasts to convert CO2 and water into glucose.";
  const exact = verifyQuoteAgainstAnswer("Chlorophyll absorbs light energy", ans);
  assert.equal(exact.verified, true);
  assert.equal(exact.match_type, "exact");
  assert.equal(ans.slice(exact.char_start!, exact.char_end!), "Chlorophyll absorbs light energy");

  const checked = verifyAllEvidence(
    [
      {
        criterion_id: "c1",
        criterion_title: "Energy",
        max_marks: 5,
        awarded_marks: 5,
        explanation: "Correct",
        evidence_quotes: ["Mitochondria is the powerhouse of the cell"],
        uncertainty_flag: false,
        uncertainty_reason: "",
      },
    ],
    ans
  );
  assert.equal(checked.evidence_summary.unverified_quotes, 1);
  assert.equal(checked.evidence_summary.evidence_coverage, 0);
  assert.equal(checked.criterion_evaluations[0].uncertainty_flag, true);
});

test("reliability engine classifies reliable, needs_review, and cannot_reliably_grade deterministically", () => {
  const lowOcr = assessReliability({
    question: "Define Ohm's law.",
    student_answer: "V equals [ILLEGIBLE] times R",
    criteria: [{ title: "Formula" }],
    grading_output: null,
    evidence_summary: {
      total_quotes: 0,
      verified_quotes: 0,
      unverified_quotes: 0,
      awarded_criteria: 0,
      awarded_with_verified_evidence: 0,
      evidence_coverage: 0,
      evidence_validity_rate: 1,
    },
    ocr_quality_score: 0.42,
    ocr_warnings: [],
  });
  assert.equal(lowOcr.status, "cannot_reliably_grade");
  assert.equal(lowOcr.teacher_review_required, true);
});

test("rubric diff and score deltas track criterion-level changes", () => {
  const diff = computeRubricDiff(
    { version: 1, subject_instructions: "A", questions: [{ criteria: [{ criterion_id: "c1", title: "C1", points: 4, description: "d1" }] }] },
    { version: 2, subject_instructions: "B", questions: [{ criteria: [{ criterion_id: "c1", title: "C1", points: 6, description: "d2" }, { criterion_id: "c2", title: "C2", points: 2, description: "d3" }] }] }
  );
  assert.equal(diff.added_criteria.length, 1);
  assert.equal(diff.modified_criteria.length, 1);
  assert.equal(diff.instructions_changed, true);

  const delta = computeScoreDeltas(
    { final_marks: 3, criterion_evaluations: [{ criterion_id: "c1", criterion_title: "C1", awarded_marks: 3 }] },
    { final_marks: 6.5, criterion_evaluations: [{ criterion_id: "c1", criterion_title: "C1", awarded_marks: 5, explanation: "Updated" }, { criterion_id: "c2", criterion_title: "C2", awarded_marks: 1.5, explanation: "Added" }] }
  );
  assert.equal(delta.score_delta, 3.5);
  assert.equal(delta.criterion_changes.length, 2);
});

test("agreement metrics suppress kappa on small n and compute valid MAE/RMSE/kappa on n>=5", () => {
  const tiny = computeAgreementMetrics([{ ai_score: 5, human_score: 5, max_marks: 5 }]);
  assert.equal(tiny.sufficient_data, false);
  assert.equal(tiny.metrics?.weighted_cohens_kappa, null);

  const res = computeAgreementMetrics([
    { ai_score: 8, human_score: 8, max_marks: 10 },
    { ai_score: 6, human_score: 7, max_marks: 10 },
    { ai_score: 9, human_score: 9, max_marks: 10 },
    { ai_score: 4, human_score: 5, max_marks: 10 },
    { ai_score: 2, human_score: 2, max_marks: 10 },
  ]);
  assert.equal(res.sufficient_data, true);
  assert.equal(res.metrics?.mae, 0.4);
  assert.equal(res.metrics?.within_one_mark_agreement, 1);
  assert.ok((res.metrics?.weighted_cohens_kappa ?? 0) > 0.85);
});

test("dataset parser, leakage-safe split, and calibration offset never leak test samples", () => {
  const csv = [
    "sample_id,subject,question,student_answer,human_score,max_marks",
    "1,Physics,What is inertia?,Resistance to motion change,5,5",
    "2,Physics,What is inertia?,Resistance to motion change,5,5",
    "3,Biology,Define osmosis.,Water movement across membrane,4,5",
    "4,Chemistry,What is pH?,Negative log of H+ concentration,5,5",
    "5,CS,What is BFS?,Level-order graph traversal,5,5",
  ].join("\n");
  const rows = parseDatasetContent("bench.csv", csv);
  const splits = splitDatasetLeakageSafe(rows);
  const fps = (arr: any[]) => new Set(arr.map((x) => x.fingerprint));
  const trainFp = fps(splits.train);
  const valFp = fps(splits.validation);
  const testFp = fps(splits.test);
  for (const fp of testFp) {
    assert.equal(trainFp.has(fp), false);
    assert.equal(valFp.has(fp), false);
  }
  const cal = fitSafeCalibrationOffset([
    { ai_score: 4, human_score: 5 },
    { ai_score: 3, human_score: 4 },
    { ai_score: 2, human_score: 3 },
  ]);
  assert.equal(cal.calibration_offset, 1);
  assert.equal(cal.model_fine_tuned, false);
});

test("reliability engine accepts valid post-scoring calibration offset without false arithmetic mismatch", () => {
  const ans = "Ohm's law states V = IR so voltage is proportional to current.";
  const v = verifyAllEvidence(
    [
      {
        criterion_id: "c1",
        criterion_title: "Formula",
        max_marks: 5,
        awarded_marks: 4,
        explanation: "Correct formula",
        evidence_quotes: ["V = IR"],
        uncertainty_flag: false,
        uncertainty_reason: "",
      },
    ],
    ans
  );
  const rel = assessReliability({
    question: "Explain Ohm's law.",
    student_answer: ans,
    criteria: [{ title: "Formula" }],
    grading_output: {
      final_marks: 4.5,
      max_marks: 5,
      answer_classification: "correct",
      criterion_evaluations: v.criterion_evaluations,
      model_uncertainty_flags: [],
    },
    evidence_summary: v.evidence_summary,
    ocr_quality_score: null,
    ocr_warnings: [],
    calibration_offset: 0.5,
  });
  assert.equal(rel.status, "reliable");
});
