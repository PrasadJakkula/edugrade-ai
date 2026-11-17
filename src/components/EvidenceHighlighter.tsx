import React from "react";
import { CriterionEvaluation } from "../types";

interface Span {
  start: number;
  end: number;
  criterionTitle: string;
  criterionId: string;
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
  const spans: Span[] = [];
  for (const c of criteria) {
    for (const ev of c.verified_evidence || []) {
      if (ev.verified && ev.char_start !== null && ev.char_end !== null && ev.char_end > ev.char_start) {
        spans.push({
          start: ev.char_start,
          end: ev.char_end,
          criterionTitle: c.criterion_title,
          criterionId: c.criterion_id,
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
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Student Answer with Verified Evidence Spans</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Highlighted segments are programmatically verified verbatim matches from the student submission.
          </p>
        </div>
        {activeCriterionId && (
          <button
            type="button"
            onClick={() => onSelectCriterion(null)}
            className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
          >
            Show all highlights
          </button>
        )}
      </div>

      <div className="mt-4 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
        {segments.length === 0 ? (
          <span className="text-slate-400 italic">No student answer text available.</span>
        ) : (
          segments.map((seg, idx) => {
            if (!seg.span) {
              return <React.Fragment key={idx}>{seg.text}</React.Fragment>;
            }
            const isSelected = !activeCriterionId || activeCriterionId === seg.span.criterionId;
            return (
              <mark
                key={idx}
                title={`Evidence for: ${seg.span.criterionTitle}`}
                onClick={() => onSelectCriterion(seg.span!.criterionId)}
                className={`cursor-pointer rounded px-1 py-0.5 transition-colors ${
                  isSelected
                    ? "bg-blue-100 text-blue-950 ring-1 ring-blue-300"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {seg.text}
              </mark>
            );
          })
        )}
      </div>
    </div>
  );
}
