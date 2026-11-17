import crypto from "crypto";

export interface VerifiedEvidence {
  quote: string;
  verified: boolean;
  match_type: "exact" | "case_insensitive" | "normalized" | "sentence_overlap" | "unverified";
  char_start: number | null;
  char_end: number | null;
  token_overlap: number;
}

export interface CriterionEvaluation {
  criterion_id: string;
  criterion_title: string;
  max_marks: number;
  awarded_marks: number;
  explanation: string;
  evidence_quotes: string[];
  verified_evidence?: VerifiedEvidence[];
  uncertainty_flag: boolean;
  uncertainty_reason: string;
}

export interface EvidenceSummary {
  total_quotes: number;
  verified_quotes: number;
  unverified_quotes: number;
  awarded_criteria: number;
  awarded_with_verified_evidence: number;
  evidence_coverage: number;
  evidence_validity_rate: number;
}

export interface ReliabilityReport {
  status: "reliable" | "needs_review" | "cannot_reliably_grade";
  teacher_review_required: boolean;
  reasons: string[];
  signals: {
    evidence_coverage: number;
    evidence_validity_rate: number;
    unverified_quotes: number;
    ocr_quality_score: number | null;
  };
}

function tokenize(text: string): string[] {
  return (text || "").toLowerCase().match(/[a-z0-9_+=/-]+/g) || [];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function verifyQuoteAgainstAnswer(quote: string, studentAnswer: string): VerifiedEvidence {
  const q = (quote || "").trim().replace(/^["']+|["']+$/g, "");
  if (!q || !studentAnswer || !studentAnswer.trim()) {
    return {
      quote: quote || "",
      verified: false,
      match_type: "unverified",
      char_start: null,
      char_end: null,
      token_overlap: 0,
    };
  }

  const exactIdx = studentAnswer.indexOf(q);
  if (exactIdx !== -1) {
    return {
      quote: q,
      verified: true,
      match_type: "exact",
      char_start: exactIdx,
      char_end: exactIdx + q.length,
      token_overlap: 1,
    };
  }

  const ciIdx = studentAnswer.toLowerCase().indexOf(q.toLowerCase());
  if (ciIdx !== -1) {
    return {
      quote: studentAnswer.slice(ciIdx, ciIdx + q.length),
      verified: true,
      match_type: "case_insensitive",
      char_start: ciIdx,
      char_end: ciIdx + q.length,
      token_overlap: 1,
    };
  }

  const qTokens = tokenize(q);
  if (qTokens.length >= 2) {
    const pattern = new RegExp(qTokens.map(escapeRegExp).join("\\W+"), "i");
    const m = pattern.exec(studentAnswer);
    if (m) {
      return {
        quote: m[0],
        verified: true,
        match_type: "normalized",
        char_start: m.index,
        char_end: m.index + m[0].length,
        token_overlap: 1,
      };
    }
  }

  if (qTokens.length > 0) {
    const qSet = new Set(qTokens);
    let bestOverlap = 0;
    let bestSpan: [number, number] | null = null;
    const sentenceRegex = /[^.!?\n]+[.!?\n]?/g;
    let match: RegExpExecArray | null;
    while ((match = sentenceRegex.exec(studentAnswer)) !== null) {
      const sent = match[0].trim();
      if (!sent) continue;
      const sTokens = new Set(tokenize(sent));
      if (sTokens.size === 0) continue;
      let shared = 0;
      for (const tok of qSet) {
        if (sTokens.has(tok)) shared += 1;
      }
      const overlap = shared / qSet.size;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpan = [match.index, match.index + match[0].length];
      }
    }
    if (bestOverlap >= 0.85 && bestSpan) {
      return {
        quote: studentAnswer.slice(bestSpan[0], bestSpan[1]).trim(),
        verified: true,
        match_type: "sentence_overlap",
        char_start: bestSpan[0],
        char_end: bestSpan[1],
        token_overlap: Number(bestOverlap.toFixed(3)),
      };
    }
    return {
      quote: q,
      verified: false,
      match_type: "unverified",
      char_start: null,
      char_end: null,
      token_overlap: Number(bestOverlap.toFixed(3)),
    };
  }

  return {
    quote: q,
    verified: false,
    match_type: "unverified",
    char_start: null,
    char_end: null,
    token_overlap: 0,
  };
}

export function verifyAllEvidence(
  criterionEvaluations: CriterionEvaluation[],
  studentAnswer: string
): { criterion_evaluations: CriterionEvaluation[]; evidence_summary: EvidenceSummary } {
  let totalQuotes = 0;
  let verifiedQuotes = 0;
  let unverifiedQuotes = 0;
  let awardedCriteria = 0;
  let awardedWithVerified = 0;

  const enriched = criterionEvaluations.map((crit) => {
    const quotes = crit.evidence_quotes || [];
    const verifiedItems = quotes.map((q) => verifyQuoteAgainstAnswer(q, studentAnswer));
    const critVerified = verifiedItems.filter((v) => v.verified);
    const critUnverified = verifiedItems.filter((v) => !v.verified);

    totalQuotes += verifiedItems.length;
    verifiedQuotes += critVerified.length;
    unverifiedQuotes += critUnverified.length;

    if (Number(crit.awarded_marks || 0) > 0) {
      awardedCriteria += 1;
      if (critVerified.length > 0) awardedWithVerified += 1;
    }

    return {
      ...crit,
      verified_evidence: verifiedItems,
      uncertainty_flag: crit.uncertainty_flag || critUnverified.length > 0,
      uncertainty_reason:
        crit.uncertainty_reason ||
        (critUnverified.length > 0
          ? "One or more cited quotes did not match the student's text verbatim."
          : ""),
    };
  });

  const coverage =
    awardedCriteria > 0
      ? awardedWithVerified / awardedCriteria
      : totalQuotes === verifiedQuotes
      ? 1
      : 0;
  const validityRate = totalQuotes > 0 ? verifiedQuotes / totalQuotes : 1;

  return {
    criterion_evaluations: enriched,
    evidence_summary: {
      total_quotes: totalQuotes,
      verified_quotes: verifiedQuotes,
      unverified_quotes: unverifiedQuotes,
      awarded_criteria: awardedCriteria,
      awarded_with_verified_evidence: awardedWithVerified,
      evidence_coverage: Number(coverage.toFixed(3)),
      evidence_validity_rate: Number(validityRate.toFixed(3)),
    },
  };
}

export function assessReliability(params: {
  question: string;
  student_answer: string;
  criteria: any[];
  grading_output: any | null;
  evidence_summary: EvidenceSummary;
  ocr_quality_score: number | null;
  ocr_warnings: string[];
  provider_error?: string;
  calibration_offset?: number;
}): ReliabilityReport {
  const reasons: string[] = [];
  let severity = 0; // 0 reliable, 1 needs_review, 2 cannot_reliably_grade
  const flag = (level: number, msg: string) => {
    if (level > severity) severity = level;
    if (msg && !reasons.includes(msg)) reasons.push(msg);
  };

  if (params.provider_error) flag(2, `AI evaluation provider error: ${params.provider_error}`);
  if (!params.question || params.question.trim().length < 5) {
    flag(2, "Question statement is missing or too short.");
  }
  if (!params.criteria || params.criteria.length === 0) {
    flag(2, "No grading rubric criteria were provided.");
  }
  const ans = (params.student_answer || "").trim();
  if (!ans) {
    flag(2, "Student answer is empty or could not be extracted.");
  } else if (ans.split(/\s+/).length < 4) {
    flag(1, "Student answer is extremely brief (< 4 words); verify whether text was truncated.");
  }

  if (params.ocr_quality_score !== null && params.ocr_quality_score !== undefined) {
    if (params.ocr_quality_score < 0.55) {
      flag(2, `OCR/handwriting quality is too low (${params.ocr_quality_score.toFixed(2)}); manual grading required.`);
    } else if (params.ocr_quality_score < 0.78) {
      flag(1, `OCR/handwriting extraction quality is moderate (${params.ocr_quality_score.toFixed(2)}); verify extracted text.`);
    }
  }
  for (const w of params.ocr_warnings || []) {
    if (w) flag(1, `OCR warning: ${w}`);
  }
  if (ans.includes("[ILLEGIBLE]")) {
    flag(2, "Extracted handwriting contains [ILLEGIBLE] segments requiring manual verification.");
  }

  if (params.grading_output) {
    const evals: CriterionEvaluation[] = params.grading_output.criterion_evaluations || [];
    const finalMarks = Number(params.grading_output.final_marks || 0);
    const maxMarks = Number(params.grading_output.max_marks || 0);
    const sumCrit = evals.reduce((acc, c) => acc + Number(c.awarded_marks || 0), 0);
    const offset = Number(params.calibration_offset || 0);
    const expectedCalibrated = Math.max(0, Math.min(maxMarks || Infinity, sumCrit + offset));

    if (Math.abs(sumCrit - finalMarks) > 0.25 && Math.abs(expectedCalibrated - finalMarks) > 0.25) {
      flag(2, `Score arithmetic mismatch: criteria sum (${sumCrit.toFixed(2)}) != final marks (${finalMarks.toFixed(2)}).`);
    }
    if (finalMarks < 0 || (maxMarks > 0 && finalMarks > maxMarks + 0.01)) {
      flag(2, `Final marks (${finalMarks}) outside valid [0, ${maxMarks}] range.`);
    }

    const { unverified_quotes, evidence_coverage, awarded_criteria } = params.evidence_summary;
    if (unverified_quotes > 0) {
      flag(1, `${unverified_quotes} cited quote(s) did not match the student's answer verbatim.`);
    }
    if (awarded_criteria > 0 && evidence_coverage < 0.5) {
      flag(2, "Fewer than half of awarded criteria are backed by verified text evidence.");
    } else if (awarded_criteria > 0 && evidence_coverage < 1.0) {
      flag(1, "Some awarded criteria lack verified verbatim evidence.");
    }

    const uncertainCrit = evals.filter((c) => c.uncertainty_flag);
    if (uncertainCrit.length > 0) {
      flag(1, `Criterion-level uncertainty flagged for: ${uncertainCrit.map((c) => c.criterion_title).slice(0, 3).join(", ")}.`);
    }
    for (const mf of params.grading_output.model_uncertainty_flags || []) {
      if (mf) flag(1, mf);
    }
    if (params.grading_output.answer_classification === "ungradable") {
      flag(2, "Answer was classified as ungradable due to missing or ambiguous content.");
    }
  }

  const statusMap: Record<number, ReliabilityReport["status"]> = {
    0: "reliable",
    1: "needs_review",
    2: "cannot_reliably_grade",
  };
  const status = statusMap[severity];
  return {
    status,
    teacher_review_required: status !== "reliable",
    reasons,
    signals: {
      evidence_coverage: params.evidence_summary.evidence_coverage,
      evidence_validity_rate: params.evidence_summary.evidence_validity_rate,
      unverified_quotes: params.evidence_summary.unverified_quotes,
      ocr_quality_score: params.ocr_quality_score,
    },
  };
}

export function computeRubricDiff(oldSnapshot: any, newSnapshot: any) {
  const extract = (snap: any) => {
    const map = new Map<string, any>();
    for (const q of snap?.questions || []) {
      for (const c of q?.criteria || []) {
        map.set(c.criterion_id || c.title, c);
      }
    }
    return map;
  };
  const oldMap = extract(oldSnapshot);
  const newMap = extract(newSnapshot);
  const added: any[] = [];
  const removed: any[] = [];
  const modified: any[] = [];

  for (const [id, nc] of newMap.entries()) {
    if (!oldMap.has(id)) {
      added.push(nc);
    } else {
      const oc = oldMap.get(id);
      if (
        Number(oc.points) !== Number(nc.points) ||
        oc.description !== nc.description ||
        oc.partial_credit_rules !== nc.partial_credit_rules
      ) {
        modified.push({
          criterion_id: id,
          title: nc.title,
          old_points: oc.points,
          new_points: nc.points,
          old_description: oc.description,
          new_description: nc.description,
        });
      }
    }
  }
  for (const [id, oc] of oldMap.entries()) {
    if (!newMap.has(id)) removed.push(oc);
  }

  return {
    old_version: oldSnapshot?.version ?? 0,
    new_version: newSnapshot?.version ?? 1,
    added_criteria: added,
    removed_criteria: removed,
    modified_criteria: modified,
    instructions_changed: (oldSnapshot?.subject_instructions || "") !== (newSnapshot?.subject_instructions || ""),
  };
}

export function computeScoreDeltas(oldGrading: any, newGrading: any) {
  const oldScore = Number(oldGrading?.final_marks || 0);
  const newScore = Number(newGrading?.final_marks || 0);
  const oldMap = new Map<string, any>();
  const newMap = new Map<string, any>();
  for (const c of oldGrading?.criterion_evaluations || []) oldMap.set(c.criterion_id || c.criterion_title, c);
  for (const c of newGrading?.criterion_evaluations || []) newMap.set(c.criterion_id || c.criterion_title, c);

  const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]));
  const criterion_changes = keys.map((k) => {
    const oc = oldMap.get(k);
    const nc = newMap.get(k);
    const oPts = oc ? Number(oc.awarded_marks || 0) : null;
    const nPts = nc ? Number(nc.awarded_marks || 0) : null;
    const delta = Number(((nPts ?? 0) - (oPts ?? 0)).toFixed(2));
    return {
      criterion_id: k,
      criterion_title: (nc || oc)?.criterion_title || k,
      old_marks: oPts,
      new_marks: nPts,
      delta,
      reason: nc?.explanation || "Criterion removed in updated rubric version.",
    };
  });

  const scoreDelta = Number((newScore - oldScore).toFixed(2));
  const changedParts = criterion_changes
    .filter((c) => Math.abs(c.delta) > 0.001 || c.old_marks === null || c.new_marks === null)
    .map((c) => `${c.criterion_title} (${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(2)})`);

  return {
    old_score: oldScore,
    new_score: newScore,
    score_delta: scoreDelta,
    criterion_changes,
    explanation_of_change:
      `Score changed by ${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(2)} (${oldScore.toFixed(2)} → ${newScore.toFixed(2)}). ` +
      (changedParts.length > 0 ? `Updated criteria: ${changedParts.join(", ")}.` : "No criterion-level score change."),
  };
}

export function computeWeightedCohensKappa(yTrue: number[], yPred: number[], minVal = 0, maxVal = 10): number | null {
  const n = yTrue.length;
  if (n < 5 || maxVal <= minVal) return null;
  const k = maxVal - minVal + 1;
  const obs: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  const histA = Array(k).fill(0);
  const histB = Array(k).fill(0);

  for (let i = 0; i < n; i++) {
    const ia = Math.max(0, Math.min(k - 1, yTrue[i] - minVal));
    const ib = Math.max(0, Math.min(k - 1, yPred[i] - minVal));
    obs[ia][ib] += 1;
    histA[ia] += 1;
    histB[ib] += 1;
  }

  let num = 0;
  let den = 0;
  const denomSq = (k - 1) ** 2;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const w = ((i - j) ** 2) / denomSq;
      const expected = (histA[i] * histB[j]) / n;
      num += w * obs[i][j];
      den += w * expected;
    }
  }
  if (den === 0) return num === 0 ? 1 : 0;
  return Number((1 - num / den).toFixed(4));
}

export function computeAgreementMetrics(
  pairs: Array<{
    ai_score: number;
    human_score: number;
    max_marks: number;
    criterion_pairs?: Array<{ ai_score: number; human_score: number }>;
  }>
) {
  const n = pairs.length;
  if (n === 0) {
    return {
      sample_size: 0,
      sufficient_data: false,
      recommended_sample_size: 20,
      limitations: ["No teacher-reviewed or ground-truth paired records available yet."],
      metrics: null,
    };
  }

  let absSum = 0;
  let sqSum = 0;
  let biasSum = 0;
  let exact = 0;
  let withinOne = 0;
  const normTrue: number[] = [];
  const normPred: number[] = [];

  let critTotal = 0;
  let critExact = 0;
  let critWithinHalf = 0;

  for (const p of pairs) {
    const maxM = Math.max(1, Number(p.max_marks || 10));
    const diff = p.ai_score - p.human_score;
    const absErr = Math.abs(diff);
    absSum += absErr;
    sqSum += diff * diff;
    biasSum += diff;
    if (absErr <= 0.05) exact += 1;
    if (absErr <= 1.0001) withinOne += 1;
    normTrue.push(Math.round((p.human_score / maxM) * 10));
    normPred.push(Math.round((p.ai_score / maxM) * 10));

    for (const cp of p.criterion_pairs || []) {
      critTotal += 1;
      const cd = Math.abs(cp.ai_score - cp.human_score);
      if (cd <= 0.05) critExact += 1;
      if (cd <= 0.5001) critWithinHalf += 1;
    }
  }

  const sufficient = n >= 5;
  const kappa = sufficient ? computeWeightedCohensKappa(normTrue, normPred, 0, 10) : null;
  const limitations: string[] = [];
  if (n < 5) {
    limitations.push(`Sample size (n=${n}) is below the minimum threshold (5) for reliable inference; Weighted Cohen's kappa is suppressed.`);
  } else if (n < 20) {
    limitations.push(`Moderate sample size (n=${n}); metric stability improves substantially at n >= 20.`);
  }
  if (critTotal === 0) {
    limitations.push("No criterion-level human score pairs recorded yet; criterion-level agreement is unavailable.");
  }

  return {
    sample_size: n,
    sufficient_data: sufficient,
    recommended_sample_size: 20,
    limitations,
    metrics: {
      mae: Number((absSum / n).toFixed(4)),
      rmse: Number(Math.sqrt(sqSum / n).toFixed(4)),
      mean_bias: Number((biasSum / n).toFixed(4)),
      exact_agreement: Number((exact / n).toFixed(4)),
      within_one_mark_agreement: Number((withinOne / n).toFixed(4)),
      weighted_cohens_kappa: kappa,
      criterion_sample_size: critTotal,
      criterion_exact_agreement: critTotal ? Number((critExact / critTotal).toFixed(4)) : null,
      criterion_within_half_agreement: critTotal ? Number((critWithinHalf / critTotal).toFixed(4)) : null,
    },
  };
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export function parseDatasetContent(filename: string, text: string) {
  const lower = filename.toLowerCase();
  let rawRows: any[] = [];
  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(text);
    rawRows = Array.isArray(parsed) ? parsed : parsed.items || parsed.samples || [];
  } else if (lower.endsWith(".csv")) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) throw new Error("CSV must include header row and at least 3 data rows.");
    const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    rawRows = lines.slice(1).map((line) => {
      const vals = parseCsvLine(line);
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        obj[h] = vals[idx] ?? "";
      });
      return obj;
    });
  } else {
    throw new Error("Dataset must be .csv or .json");
  }

  const samples = rawRows
    .map((r, idx) => {
      const question = String(r.question || "").trim();
      const student_answer = String(r.student_answer || "").trim();
      if (!question || !student_answer) return null;
      const max_marks = Number(r.max_marks || 10);
      const human_score = Math.max(0, Math.min(max_marks, Number(r.human_score ?? r.score ?? 0)));
      return {
        sample_id: String(r.sample_id || r.id || `s_${idx + 1}`),
        subject: String(r.subject || "Other").trim(),
        topic: String(r.topic || "").trim(),
        question,
        expected_answer: String(r.expected_answer || "").trim(),
        student_answer,
        human_score,
        max_marks,
      };
    })
    .filter(Boolean) as any[];

  if (samples.length < 3) {
    throw new Error("Dataset must contain at least 3 valid rows with question and student_answer.");
  }
  return samples;
}

export function splitDatasetLeakageSafe(samples: any[], trainRatio = 0.6, valRatio = 0.2) {
  if (trainRatio + valRatio >= 0.95) {
    throw new Error("Test split must remain strictly non-empty (>= 5%).");
  }
  const seen = new Map<string, "train" | "validation" | "test">();
  const splits: Record<"train" | "validation" | "test", any[]> = {
    train: [],
    validation: [],
    test: [],
  };

  for (const item of samples) {
    const fp = crypto
      .createHash("sha256")
      .update(`${item.question.trim().toLowerCase()}||${item.student_answer.trim().toLowerCase()}`)
      .digest("hex");
    let bucket = seen.get(fp);
    if (!bucket) {
      const digest = crypto.createHash("sha256").update(`evaluai-split-v1:${fp}`).digest("hex");
      const u = parseInt(digest.slice(0, 8), 16) / 0xffffffff;
      bucket = u < trainRatio ? "train" : u < trainRatio + valRatio ? "validation" : "test";
      seen.set(fp, bucket);
    }
    splits[bucket].push({ ...item, split: bucket, fingerprint: fp.slice(0, 12) });
  }

  if (splits.test.length === 0 && splits.train.length > 1) {
    const moved = splits.train.pop()!;
    moved.split = "test";
    splits.test.push(moved);
  }
  if (splits.validation.length === 0 && splits.train.length > 1) {
    const moved = splits.train.pop()!;
    moved.split = "validation";
    splits.validation.push(moved);
  }
  return splits;
}

export function fitSafeCalibrationOffset(validationPairs: Array<{ ai_score: number; human_score: number }>) {
  if (validationPairs.length < 3) {
    return {
      calibration_offset: 0,
      applied: false,
      note: "Insufficient validation samples (< 3) for calibration offset; keeping 0.0.",
      model_fine_tuned: false,
    };
  }
  const residuals = validationPairs.map((p) => p.human_score - p.ai_score);
  const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
  const clamped = Number(Math.max(-1.5, Math.min(1.5, mean)).toFixed(2));
  return {
    calibration_offset: clamped,
    applied: Math.abs(clamped) >= 0.1,
    note: `Estimated additive post-scoring calibration offset (${clamped >= 0 ? "+" : ""}${clamped.toFixed(2)} marks) on validation split only. Foundation LLM weights are NOT fine-tuned.`,
    model_fine_tuned: false,
  };
}
