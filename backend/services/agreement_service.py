import math
from typing import List, Dict, Any

MIN_SAMPLES_FOR_STATS = 5
RECOMMENDED_SAMPLES = 20


def compute_weighted_cohens_kappa(y_true: List[int], y_pred: List[int], min_val: int, max_val: int) -> float | None:
    """
    Quadratic-weighted Cohen's kappa over integer-rounded score bins [min_val..max_val].
    Returns None when sample size is too small or variance is zero.
    """
    n = len(y_true)
    if n < MIN_SAMPLES_FOR_STATS or max_val <= min_val:
        return None

    k = (max_val - min_val) + 1
    if k <= 1:
        return None

    obs = [[0.0] * k for _ in range(k)]
    hist_a = [0.0] * k
    hist_b = [0.0] * k

    for a, b in zip(y_true, y_pred):
        ia = max(0, min(k - 1, a - min_val))
        ib = max(0, min(k - 1, b - min_val))
        obs[ia][ib] += 1.0
        hist_a[ia] += 1.0
        hist_b[ib] += 1.0

    num = 0.0
    den = 0.0
    denom_sq = float((k - 1) ** 2)
    for i in range(k):
        for j in range(k):
            w = ((i - j) ** 2) / denom_sq
            expected = (hist_a[i] * hist_b[j]) / n
            num += w * obs[i][j]
            den += w * expected

    if den == 0.0:
        return 1.0 if num == 0.0 else 0.0
    return round(1.0 - (num / den), 4)


def compute_agreement_metrics(pairs: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes agreement metrics from paired records:
      [{"ai_score": float, "human_score": float, "max_marks": float, "criterion_pairs": [...]}]
    Enforces sample-size transparency and reports explicit statistical limitations.
    """
    n = len(pairs)
    if n == 0:
        return {
            "sample_size": 0,
            "sufficient_data": False,
            "recommended_sample_size": RECOMMENDED_SAMPLES,
            "limitations": ["No human-reviewed or ground-truth paired records available yet."],
            "metrics": None,
        }

    abs_errors: List[float] = []
    sq_errors: List[float] = []
    biases: List[float] = []
    exact_matches = 0
    within_one_matches = 0
    norm_true: List[int] = []
    norm_pred: List[int] = []

    crit_total = 0
    crit_within_half = 0
    crit_exact = 0

    for item in pairs:
        ai_s = float(item["ai_score"])
        hu_s = float(item["human_score"])
        max_m = max(1.0, float(item.get("max_marks") or 10.0))
        diff = ai_s - hu_s
        abs_err = abs(diff)
        abs_errors.append(abs_err)
        sq_errors.append(diff ** 2)
        biases.append(diff)

        if abs_err <= 0.05:
            exact_matches += 1
        if abs_err <= 1.0 + 1e-6:
            within_one_matches += 1

        # Bin on a 0..10 normalized scale for comparable quadratic weighted kappa
        norm_true.append(int(round((hu_s / max_m) * 10)))
        norm_pred.append(int(round((ai_s / max_m) * 10)))

        for cp in item.get("criterion_pairs") or []:
            crit_total += 1
            c_diff = abs(float(cp["ai_score"]) - float(cp["human_score"]))
            if c_diff <= 0.05:
                crit_exact += 1
            if c_diff <= 0.5 + 1e-6:
                crit_within_half += 1

    mae = sum(abs_errors) / n
    rmse = math.sqrt(sum(sq_errors) / n)
    mean_bias = sum(biases) / n
    exact_rate = exact_matches / n
    within_one_rate = within_one_matches / n

    sufficient = n >= MIN_SAMPLES_FOR_STATS
    kappa = compute_weighted_cohens_kappa(norm_true, norm_pred, 0, 10) if sufficient else None

    limitations: List[str] = []
    if n < MIN_SAMPLES_FOR_STATS:
        limitations.append(
            f"Sample size (n={n}) is below minimum threshold ({MIN_SAMPLES_FOR_STATS}) for reliable agreement inference; Cohen's kappa suppressed."
        )
    elif n < RECOMMENDED_SAMPLES:
        limitations.append(
            f"Moderate sample size (n={n}); confidence in kappa and error stability improves substantially at n >= {RECOMMENDED_SAMPLES}."
        )
    if crit_total == 0:
        limitations.append("No criterion-level human overrides logged yet; criterion agreement unavailable.")

    return {
        "sample_size": n,
        "sufficient_data": sufficient,
        "recommended_sample_size": RECOMMENDED_SAMPLES,
        "limitations": limitations,
        "metrics": {
            "mae": round(mae, 4),
            "rmse": round(rmse, 4),
            "mean_bias": round(mean_bias, 4),
            "exact_agreement": round(exact_rate, 4),
            "within_one_mark_agreement": round(within_one_rate, 4),
            "weighted_cohens_kappa": kappa,
            "criterion_sample_size": crit_total,
            "criterion_exact_agreement": round(crit_exact / crit_total, 4) if crit_total else None,
            "criterion_within_half_agreement": round(crit_within_half / crit_total, 4) if crit_total else None,
        },
    }
