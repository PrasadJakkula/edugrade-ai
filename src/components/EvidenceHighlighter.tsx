import React from "react";
import { CriterionEvaluation } from "../types";
import { flowClasses, getCriterionJss } from "../styles/evaloraJss";

interface Span {
  start: number;
  end: number;
  criterionTitle: string;
  criterionId: string;
  criterionIndex: number;
}

export function EvidenceHighlighter({
  studentAnswer,
  criteria,
  activeCriterionId,
  onSelectCriterion,
}: {
  studentAnswer: string;
  criteria: CriterionEvaluation[];
  activeCriterionId: string | null;
  onSelectCriterion: (id: string | null) => void;
}) {
  const criterionIndexMap = new Map<string, number>();
  criteria.forEach((c, idx) => criterionIndexMap.set(c.criterion_id, idx));

  const spans: Span[] = [];
  for (const c of criteria) {
    const criterionIndex = criterionIndexMap.get(c.criterion_id) ?? 0;
    for (const ev of c.verified_evidence || []) {
      if (ev.verified && ev.char_start !== null && ev.char_end !== null && ev.char_end > ev.char_start) {
        spans.push({
          start: ev.char_start,
          end: ev.char_end,
          criterionTitle: c.criterion_title,
          criterionId: c.criterion_id,
          criterionIndex,
        });
      }
    }
  }

  const filteredSpans = activeCriterionId
    ? spans.filter((s) => s.criterionId === activeCriterionId)
    : spans;

  filteredSpans.sort((a, b) => a.start - b.start || b.end - a.end);

  // Merge non-overlapping segments cleanly
  const segments: Array<{ text: string; span: Span | null }> = [];
  let cursor = 0;
  for (const sp of filteredSpans) {
    if (sp.start < cursor) continue;
    if (sp.start > cursor) {
      segments.push({ text: studentAnswer.slice(cursor, sp.start), span: null });
    }
    segments.push({ text: studentAnswer.slice(sp.start, sp.end), span: sp });
    cursor = sp.end;
  }
  if (cursor < studentAnswer.length) {
    segments.push({ text: studentAnswer.slice(cursor), span: null });
  }

  return (
    <article className={`${flowClasses.sourceMaterialCard} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-emerald-200/70">
        <div>
          <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide">
            Source Material · Student Submission
          </div>
          <h3 className="text-sm font-bold text-slate-900 mt-0.5">
            Verbatim Evidence Anchored to Requirements
          </h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Color-coded highlights link source passages directly to each requirement criterion.
          </p>
        </div>
        {activeCriterionId && (
          <button
            type="button"
            onClick={() => onSelectCriterion(null)}
            className="text-xs font-semibold text-emerald-800 hover:underline whitespace-nowrap shrink-0"
          >
            Show all highlights
          </button>
        )}
      </div>

      {/* Interactive Requirement Color Key */}
      {criteria.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {criteria.map((c, idx) => {
            const jssCrit = getCriterionJss(idx);
            const isSelected = activeCriterionId === c.criterion_id;
            return (
              <button
                key={c.criterion_id}
                type="button"
                onClick={() => onSelectCriterion(isSelected ? null : c.criterion_id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                  isSelected
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${jssCrit.reqSwatch}`} aria-hidden="true" />
                <span>{c.criterion_title}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 p-4 rounded-lg bg-white border border-emerald-100 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
        {segments.length === 0 ? (
          <span className="text-slate-400 italic">No student answer text available.</span>
        ) : (
          segments.map((seg, idx) => {
            if (!seg.span) {
              return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
            }
            const jssCrit = getCriterionJss(seg.span.criterionIndex);
            const isSelected = activeCriterionId === seg.span.criterionId;
            const markCls = isSelected
              ? `${flowClasses.evidenceMark} ${jssCrit.markActive}`
              : !activeCriterionId
                ? `${flowClasses.evidenceMark} ${jssCrit.markIdle}`
                : `${flowClasses.evidenceMark} ${jssCrit.markDim}`;

            return (
              <mark
                key={idx}
                title={`Requirement Evidence: ${seg.span.criterionTitle}`}
                onClick={() =>
                  onSelectCriterion(
                    activeCriterionId === seg.span!.criterionId ? null : seg.span!.criterionId
                  )
                }
                className={markCls}
              >
                {seg.text}
              </mark>
            );
          })
        )}
      </div>
    </article>
  );
}
