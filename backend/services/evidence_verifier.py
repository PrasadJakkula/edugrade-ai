import re
from typing import List, Dict, Any, Tuple


def _normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[A-Za-z0-9_+=/-]+", (text or "").lower())


def verify_quote_against_answer(quote: str, student_answer: str) -> Dict[str, Any]:
    """
    Verifies that a quoted piece of evidence genuinely appears in the student's answer.
    Returns verification metadata and character span [start, end] for UI highlighting.
    """
    if not quote or not quote.strip() or not student_answer or not student_answer.strip():
        return {
            "quote": quote or "",
            "verified": False,
            "match_type": "unverified",
            "char_start": None,
            "char_end": None,
            "token_overlap": 0.0,
        }

    q = quote.strip().strip('"').strip("'")
    # 1. Exact case-sensitive or case-insensitive substring match
    idx = student_answer.find(q)
    if idx != -1:
        return {
            "quote": q,
            "verified": True,
            "match_type": "exact",
            "char_start": idx,
            "char_end": idx + len(q),
            "token_overlap": 1.0,
        }

    lower_ans = student_answer.lower()
    lower_q = q.lower()
    idx_ci = lower_ans.find(lower_q)
    if idx_ci != -1:
        return {
            "quote": student_answer[idx_ci : idx_ci + len(q)],
            "verified": True,
            "match_type": "case_insensitive",
            "char_start": idx_ci,
            "char_end": idx_ci + len(q),
            "token_overlap": 1.0,
        }

    # 2. Whitespace/punctuation normalized match via regex across original answer
    q_tokens = _tokenize(q)
    if len(q_tokens) >= 2:
        pattern = r"\W+".join(re.escape(tok) for tok in q_tokens)
        m = re.search(pattern, student_answer, re.IGNORECASE)
        if m:
            return {
                "quote": student_answer[m.start() : m.end()],
                "verified": True,
                "match_type": "normalized",
                "char_start": m.start(),
                "char_end": m.end(),
                "token_overlap": 1.0,
            }

    # 3. High token overlap against individual sentences (>= 0.85)
    if q_tokens:
        q_set = set(q_tokens)
        best_overlap = 0.0
        best_span: Tuple[int, int] | None = None
        for sent_match in re.finditer(r"[^.!?\n]+[.!?\n]?", student_answer):
            sent = sent_match.group(0).strip()
            if not sent:
                continue
            s_tokens = set(_tokenize(sent))
            if not s_tokens:
                continue
            overlap = len(q_set & s_tokens) / len(q_set)
            if overlap > best_overlap:
                best_overlap = overlap
                best_span = (sent_match.start(), sent_match.end())
        if best_overlap >= 0.85 and best_span is not None:
            return {
                "quote": student_answer[best_span[0] : best_span[1]].strip(),
                "verified": True,
                "match_type": "sentence_overlap",
                "char_start": best_span[0],
                "char_end": best_span[1],
                "token_overlap": round(best_overlap, 3),
            }
        return {
            "quote": q,
            "verified": False,
            "match_type": "unverified",
            "char_start": None,
            "char_end": None,
            "token_overlap": round(best_overlap, 3),
        }

    return {
        "quote": q,
        "verified": False,
        "match_type": "unverified",
        "char_start": None,
        "char_end": None,
        "token_overlap": 0.0,
    }


def verify_all_evidence(criterion_evaluations: List[Dict[str, Any]], student_answer: str) -> Dict[str, Any]:
    """
    Verifies all criterion evidence quotes against student_answer.
    Returns updated criterion_evaluations + evidence coverage summary.
    """
    total_quotes = 0
    verified_quotes = 0
    unverified_quotes = 0
    awarded_criteria = 0
    awarded_with_verified_evidence = 0

    enriched = []
    for crit in criterion_evaluations:
        quotes = crit.get("evidence_quotes") or []
        verified_items = [verify_quote_against_answer(q, student_answer) for q in quotes]
        crit_verified = [v for v in verified_items if v["verified"]]
        crit_unverified = [v for v in verified_items if not v["verified"]]

        total_quotes += len(verified_items)
        verified_quotes += len(crit_verified)
        unverified_quotes += len(crit_unverified)

        awarded = float(crit.get("awarded_marks") or 0)
        if awarded > 0:
            awarded_criteria += 1
            if crit_verified:
                awarded_with_verified_evidence += 1

        crit_copy = dict(crit)
        crit_copy["verified_evidence"] = verified_items
        if crit_unverified and not crit_copy.get("uncertainty_flag"):
            crit_copy["uncertainty_flag"] = True
            crit_copy["uncertainty_reason"] = (
                crit_copy.get("uncertainty_reason")
                or "One or more cited quotes could not be verified verbatim in the student answer."
            )
        enriched.append(crit_copy)

    coverage = (
        awarded_with_verified_evidence / awarded_criteria
        if awarded_criteria > 0
        else (1.0 if total_quotes == verified_quotes else 0.0)
    )
    validity_rate = (verified_quotes / total_quotes) if total_quotes > 0 else 1.0

    return {
        "criterion_evaluations": enriched,
        "evidence_summary": {
            "total_quotes": total_quotes,
            "verified_quotes": verified_quotes,
            "unverified_quotes": unverified_quotes,
            "awarded_criteria": awarded_criteria,
            "awarded_with_verified_evidence": awarded_with_verified_evidence,
            "evidence_coverage": round(coverage, 3),
            "evidence_validity_rate": round(validity_rate, 3),
        },
    }
