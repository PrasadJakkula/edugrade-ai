import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { ReliabilityReport } from "../types";

export function ReliabilityBanner({
  reliability,
  compact = false,
}: {
  reliability: ReliabilityReport;
  compact?: boolean;
}) {
  const config = {
    reliable: {
      label: "Reliable — Suitable for teacher approval",
      shortLabel: "Reliable",
      icon: CheckCircle2,
      container: "bg-emerald-50/80 border-emerald-200 text-emerald-950",
      iconColor: "text-emerald-700",
    },
    needs_review: {
      label: "Needs review — Teacher verification recommended",
      shortLabel: "Needs review",
      icon: AlertTriangle,
      container: "bg-amber-50/80 border-amber-200 text-amber-950",
      iconColor: "text-amber-700",
    },
    cannot_reliably_grade: {
      label: "Cannot reliably grade — Manual evaluation required",
      shortLabel: "Cannot reliably grade",
      icon: ShieldAlert,
      container: "bg-red-50/80 border-red-200 text-red-950",
      iconColor: "text-red-700",
    },
  }[reliability.status];

  const Icon = config.icon;

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${config.iconColor}`}>
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{config.shortLabel}</span>
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${config.container}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${config.iconColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">{config.label}</h4>
            <div className="flex items-center gap-3 text-xs font-mono tabular-nums opacity-85">
              <span>Evidence coverage: {Math.round((reliability.signals?.evidence_coverage ?? 0) * 100)}%</span>
              <span>·</span>
              <span>Quote validity: {Math.round((reliability.signals?.evidence_validity_rate ?? 1) * 100)}%</span>
              {reliability.signals?.ocr_quality_score !== null && reliability.signals?.ocr_quality_score !== undefined && (
                <>
                  <span>·</span>
                  <span>OCR quality: {reliability.signals.ocr_quality_score.toFixed(2)}</span>
                </>
              )}
            </div>
          </div>

          {reliability.reasons.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {reliability.reasons.map((r, i) => (
                <li key={i} className="leading-snug">
                  • {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs opacity-85">
              All awarded criteria are backed by verified verbatim quotes from the student's answer with consistent scoring arithmetic.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
