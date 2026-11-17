from typing import Dict, Any, List


def compute_rubric_diff(old_snapshot: Dict[str, Any], new_snapshot: Dict[str, Any]) -> Dict[str, Any]:
    old_crit = {
        c.get("criterion_id") or c.get("title"): c
        for q in old_snapshot.get("questions", [])
        for c in q.get("criteria", [])
    }
    new_crit = {
        c.get("criterion_id") or c.get("title"): c
        for q in new_snapshot.get("questions", [])
        for c in q.get("criteria", [])
    }

    added = [c for cid, c in new_crit.items() if cid not in old_crit]
    removed = [c for cid, c in old_crit.items() if cid not in new_crit]
    modified = []
    for cid, nc in new_crit.items():
        if cid in old_crit:
            oc = old_crit[cid]
            if (
                float(oc.get("points", 0)) != float(nc.get("points", 0))
                or oc.get("description") != nc.get("description")
                or oc.get("partial_credit_rules") != nc.get("partial_credit_rules")
            ):
                modified.append(
                    {
                        "criterion_id": cid,
                        "title": nc.get("title"),
                        "old_points": oc.get("points"),
                        "new_points": nc.get("points"),
                        "old_description": oc.get("description"),
                        "new_description": nc.get("description"),
                    }
                )

    return {
        "old_version": old_snapshot.get("version"),
        "new_version": new_snapshot.get("version"),
        "added_criteria": added,
        "removed_criteria": removed,
        "modified_criteria": modified,
        "instructions_changed": old_snapshot.get("subject_instructions") != new_snapshot.get("subject_instructions"),
    }


def compute_score_deltas(
    old_grading: Dict[str, Any],
    new_grading: Dict[str, Any],
) -> Dict[str, Any]:
    old_score = float(old_grading.get("final_marks") or 0)
    new_score = float(new_grading.get("final_marks") or 0)

    old_map = {
        c.get("criterion_id") or c.get("criterion_title"): c
        for c in (old_grading.get("criterion_evaluations") or [])
    }
    new_map = {
        c.get("criterion_id") or c.get("criterion_title"): c
        for c in (new_grading.get("criterion_evaluations") or [])
    }

    criterion_changes: List[Dict[str, Any]] = []
    all_keys = list(dict.fromkeys(list(old_map.keys()) + list(new_map.keys())))
    for key in all_keys:
        oc = old_map.get(key)
        nc = new_map.get(key)
        o_pts = float(oc.get("awarded_marks") or 0) if oc else None
        n_pts = float(nc.get("awarded_marks") or 0) if nc else None
        delta = round((n_pts or 0) - (o_pts or 0), 2)
        criterion_changes.append(
            {
                "criterion_id": key,
                "criterion_title": (nc or oc or {}).get("criterion_title", key),
                "old_marks": o_pts,
                "new_marks": n_pts,
                "delta": delta,
                "reason": (nc or {}).get("explanation") or "Criterion removed in updated rubric",
            }
        )

    score_delta = round(new_score - old_score, 2)
    changed_parts = [
        f"{c['criterion_title']} ({c['delta']:+.2f})"
        for c in criterion_changes
        if abs(c["delta"]) > 1e-6 or c["old_marks"] is None or c["new_marks"] is None
    ]
    summary = (
        f"Score changed by {score_delta:+.2f} ({old_score:.2f} -> {new_score:.2f}). "
        + ("Updated criteria: " + ", ".join(changed_parts) if changed_parts else "No criterion-level score change.")
    )

    return {
        "old_score": old_score,
        "new_score": new_score,
        "score_delta": score_delta,
        "criterion_changes": criterion_changes,
        "explanation_of_change": summary,
    }
