from typing import Dict, Any, List, Optional


def assess_reliability(
    *,
    question: str,
    student_answer: str,
    criteria: List[Dict[str, Any]],
    grading_output: Optional[Dict[str, Any]],
    evidence_summary: Dict[str, Any],
    ocr_quality_score: Optional[float] = None,
    ocr_warnings: Optional[List[str]] = None,
    provider_error: Optional[str] = None,
    consistency_spread: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Deterministic, defensible reliability classification without fabricated confidence percentages.
    Returns one of:
      - "reliable"
      - "needs_review"
      - "cannot_reliably_grade"
    """
    reasons: List[str] = []
    severity = 0  # 0 = reliable, 1 = needs_review, 2 = cannot_reliably_grade

    def flag(level: int, reason: str) -> None:
        nonlocal severity
        if level > severity:
            severity = level
        if reason not in reasons:
            reasons.append(reason)

    if provider_error:
        flag(2, f"AI evaluation provider failure: {provider_error}")

    if not question or len(question.strip()) < 5:
        flag(2, "Question statement is missing or too short to anchor evaluation.")

    if not criteria:
        flag(2, "No grading rubric criteria were provided.")

    cleaned_answer = (student_answer or "").strip()
    if not cleaned_answer:
        flag(2, "Student answer is empty or could not be extracted.")
    elif len(cleaned_answer.split()) < 4:
        flag(1, "Student answer is extremely brief (< 4 words); verify whether text was truncated or incomplete.")

    # OCR quality checks
    if ocr_quality_score is not None:
        if ocr_quality_score < 0.55:
            flag(2, f"OCR/handwriting quality is too low ({ocr_quality_score:.2f}); manual transcription or grading required.")
        elif ocr_quality_score < 0.78:
            flag(1, f"OCR/handwriting extraction quality is moderate ({ocr_quality_score:.2f}); verify extracted text.")

    for w in (ocr_warnings or []):
        if w:
            flag(1, f"OCR warning: {w}")

    if grading_output:
        evals = grading_output.get("criterion_evaluations") or []
        final_marks = float(grading_output.get("final_marks") or 0)
        max_marks = float(grading_output.get("max_marks") or 0)

        # Arithmetic check
        sum_crit = sum(float(c.get("awarded_marks") or 0) for c in evals)
        if abs(sum_crit - final_marks) > 0.25:
            flag(2, f"Score arithmetic mismatch: sum of criteria ({sum_crit:.2f}) != final score ({final_marks:.2f}).")

        if final_marks < 0 or (max_marks > 0 and final_marks > max_marks + 0.01):
            flag(2, f"Final score ({final_marks}) is outside valid [0, {max_marks}] bounds.")

        # Evidence verification checks
        unverified = int(evidence_summary.get("unverified_quotes") or 0)
        coverage = float(evidence_summary.get("evidence_coverage") or 0.0)
        awarded_criteria = int(evidence_summary.get("awarded_criteria") or 0)

        if unverified > 0:
            flag(1, f"{unverified} cited evidence quote(s) did not match the student's text verbatim and require verification.")

        if awarded_criteria > 0 and coverage < 0.5:
            flag(2, "Fewer than half of the awarded criteria are backed by verified text evidence.")
        elif awarded_criteria > 0 and coverage < 1.0:
            flag(1, "Some awarded criteria lack verified direct evidence quotes.")

        # Criterion-level uncertainty
        uncertain_criteria = [c for c in evals if c.get("uncertainty_flag")]
        if uncertain_criteria:
            titles = ", ".join(c.get("criterion_title", "Criterion") for c in uncertain_criteria[:3])
            flag(1, f"Criterion-level uncertainty flagged for: {titles}.")

        # Model-reported ambiguity / contradiction flags
        for m_flag in (grading_output.get("model_uncertainty_flags") or []):
            if m_flag:
                flag(1, m_flag)

        if grading_output.get("answer_classification") == "ungradable":
            flag(2, "Answer was classified as ungradable due to missing, illegible, or contradictory input.")

    if consistency_spread is not None and consistency_spread > 0.20:
        flag(1, f"Repeated-run score variance detected (normalized spread {consistency_spread:.2f}); teacher review advised.")

    status_map = {
        0: "reliable",
        1: "needs_review",
        2: "cannot_reliably_grade",
    }
    status = status_map[severity]

    return {
        "status": status,
        "teacher_review_required": status != "reliable",
        "reasons": reasons,
        "signals": {
            "evidence_coverage": evidence_summary.get("evidence_coverage", 0.0),
            "evidence_validity_rate": evidence_summary.get("evidence_validity_rate", 1.0),
            "unverified_quotes": evidence_summary.get("unverified_quotes", 0),
            "ocr_quality_score": ocr_quality_score,
            "consistency_spread": consistency_spread,
        },
    }
