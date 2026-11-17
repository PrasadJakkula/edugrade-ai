import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ReliabilityBanner } from "../components/ReliabilityBanner";
import { EvidenceHighlighter } from "../components/EvidenceHighlighter";
import { BrandLoader } from "../components/BrandLoader";
import { apiRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { GradingResult } from "../types";
import { CheckCircle2, AlertCircle, Download, RefreshCw, History } from "lucide-react";

export function ResultDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const [result, setResult] = useState<GradingResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCriterionId, setActiveCriterionId] = useState<string | null>(null);

  // Override form state
  const [overrideMarks, setOverrideMarks] = useState<number>(0);
  const [overrideReason, setOverrideReason] = useState("");
  const [generalFeedback, setGeneralFeedback] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);

  const loadDetail = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await apiRequest<{ result: GradingResult; history: any[] }>(`/grading/results/${id}`);
      setResult(data.result);
      setHistory(data.history || []);
      setOverrideMarks(data.result.final_score);
      setGeneralFeedback(data.result.grading.general_feedback || "");
    } catch (err: any) {
      notify("error", err.message || "Failed to load evaluation result.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result) return;
    setSavingOverride(true);
    try {
      const updated = await apiRequest<GradingResult>(`/grading/results/${result._id}/override`, {
        method: "POST",
        body: JSON.stringify({
          final_marks: overrideMarks,
          override_reason: overrideReason,
          general_feedback: generalFeedback,
          approve_result: true,
        }),
      });
      setResult(updated);
      setOverrideReason("");
      notify("success", "Teacher decision saved and logged to immutable history.");
      await loadDetail();
    } catch (err: any) {
      notify("error", err.message || "Could not save override.");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const lines = [
      `EVALORA ASSESSMENT REPORT — Smarter Grading. Fairer Evaluation.`,
      `Student: ${result.student_name}`,
      `Subject: ${result.subject} (${result.topic || "General"})`,
      `Rubric: ${result.rubric_name} (v${result.rubric_version ?? "custom"})`,
      `Final Score: ${result.final_score} / ${result.max_marks}`,
      `Reliability: ${result.reliability.status}`,
      ``,
      `QUESTION:\n${result.question}`,
      ``,
      `STUDENT ANSWER:\n${result.student_answer}`,
      ``,
      `CRITERION BREAKDOWN:`,
      ...result.grading.criterion_evaluations.map(
        (c, i) =>
          `${i + 1}. ${c.criterion_title}: ${c.awarded_marks}/${c.max_marks}\n   Explanation: ${c.explanation}\n   Evidence: ${(c.evidence_quotes || []).join(" | ") || "None"}`
      ),
      ``,
      `GENERAL FEEDBACK:\n${result.grading.general_feedback}`,
    ].join("\n");
    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Evalora_Report_${result._id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <AppShell title="Evaluation Inspection" breadcrumb="Workspace / Result">
        <BrandLoader label="Loading evaluation details..." />
      </AppShell>
    );
  }

  if (!result) {
    return (
      <AppShell title="Evaluation Not Found" breadcrumb="Workspace / Result">
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
          <p className="text-sm text-slate-600">This grading record could not be found.</p>
          <Link to="/dashboard" className="mt-4 inline-block text-xs font-semibold text-blue-700 hover:underline">
            Return to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={`${result.student_name} — Evaluation Review`} breadcrumb={`Workspace / Results / ${result._id}`}>
      {/* Header Score & Actions */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
            <span>{result.subject}</span>
            <span>·</span>
            <span>{result.rubric_name} {result.rubric_version ? `(v${result.rubric_version})` : ""}</span>
            <span>·</span>
            <span className="capitalize">Classification: {result.grading.answer_classification.replace(/_/g, " ")}</span>
            {result.is_demo && (
              <>
                <span>·</span>
                <span className="font-semibold text-blue-700">Demonstration Sample</span>
              </>
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold font-mono tabular-nums text-slate-900">
              {result.final_score} / {result.max_marks}
            </span>
            {result.teacher_override && (
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                (AI initial: {result.ai_original_score} → Teacher approved: {result.final_score})
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {result.rubric_id && (
            <Link
              to={`/regrade?rubricId=${result.rubric_id}&resultId=${result._id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regrade Answer</span>
            </Link>
          )}
          <button
            type="button"
            onClick={handleDownloadReport}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Reliability Banner */}
      <div className="mb-6">
        <ReliabilityBanner reliability={result.reliability} />
      </div>

      {/* Question & Side-by-Side Evidence Highlighting + Criterion Breakdown */}
      <div className="grid lg:grid-cols-12 gap-6 mb-6">
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Question</h3>
            <p className="mt-1.5 text-sm font-medium text-slate-900">{result.question}</p>
            {result.expected_answer && (
              <div className="mt-4 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-semibold text-slate-500">Reference Answer</h4>
                <p className="mt-1 text-xs text-slate-600">{result.expected_answer}</p>
              </div>
            )}
          </div>

          <EvidenceHighlighter
            studentAnswer={result.student_answer}
            criteria={result.grading.criterion_evaluations}
            activeCriterionId={activeCriterionId}
            onSelectCriterion={setActiveCriterionId}
          />

          {/* Missing & Incorrect Concepts */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-800">Missing Concepts</h4>
              {result.grading.missing_concepts?.length ? (
                <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                  {result.grading.missing_concepts.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-400">None identified.</p>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100">
              <h4 className="text-xs font-bold text-slate-800">Incorrect Concepts / Misconceptions</h4>
              {result.grading.incorrect_concepts?.length ? (
                <ul className="mt-1.5 space-y-1 text-xs text-red-700">
                  {result.grading.incorrect_concepts.map((m, i) => (
                    <li key={i}>• {m}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-slate-400">No misconceptions detected.</p>
              )}
            </div>

            {result.grading.irrelevant_content_detected && (
              <div className="pt-3 border-t border-slate-100 text-xs text-amber-800">
                <span className="font-semibold">Irrelevant Content Note:</span> {result.grading.irrelevant_content_notes}
              </div>
            )}
          </div>
        </div>

        {/* Right: Criterion-by-Criterion Breakdown & Teacher Override */}
        <div className="lg:col-span-7 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Criterion-Wise Marks & Evidence</h3>

            {result.grading.criterion_evaluations.map((c) => {
              const isSelected = activeCriterionId === c.criterion_id;
              return (
                <div
                  key={c.criterion_id}
                  onClick={() => setActiveCriterionId(isSelected ? null : c.criterion_id)}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    isSelected ? "border-blue-500 bg-blue-50/30" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-slate-900">{c.criterion_title}</h4>
                    <span className="text-sm font-bold font-mono tabular-nums text-slate-900">
                      {c.awarded_marks} / {c.max_marks}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-700">{c.explanation}</p>

                  {/* Verified Quotes */}
                  <div className="mt-3 space-y-1.5">
                    {(c.verified_evidence || []).length === 0 ? (
                      <div className="text-xs text-slate-400">No verbatim quote cited for this criterion.</div>
                    ) : (
                      (c.verified_evidence || []).map((ev, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          {ev.verified ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                          )}
                          <span className={ev.verified ? "text-slate-700 italic" : "text-red-700"}>
                            "{ev.quote}"{" "}
                            <span className="not-italic font-mono text-[11px] opacity-75">
                              ({ev.verified ? `verified: ${ev.match_type}` : "UNVERIFIED QUOTE"})
                            </span>
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {c.uncertainty_flag && (
                    <div className="mt-2 text-xs text-amber-800 font-medium">
                      Uncertainty note: {c.uncertainty_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Teacher Override & Approval Form */}
          <form onSubmit={handleOverrideSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Teacher Verification & Score Override</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Approved Final Score</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max={result.max_marks}
                  required
                  value={overrideMarks}
                  onChange={(e) => setOverrideMarks(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono tabular-nums"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Approval / Override Reason (Required)
                </label>
                <input
                  required
                  minLength={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Confirmed AI mark or awarded +0.5 for valid alternative phrasing"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">General Feedback to Student</label>
              <textarea
                rows={2}
                value={generalFeedback}
                onChange={(e) => setGeneralFeedback(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingOverride}
                className="px-5 py-2.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60"
              >
                {savingOverride ? "Saving..." : "Approve & Log Decision"}
              </button>
            </div>
          </form>

          {/* Immutable Grading & Regrade History */}
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-slate-600" />
              <span>Immutable Grading & Regrade History</span>
            </h3>
            <div className="space-y-3">
              {history.map((h) => (
                <div key={h._id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                  <div className="flex items-center justify-between font-semibold text-slate-800">
                    <span className="capitalize">{String(h.event_type).replace(/_/g, " ")}</span>
                    <span className="font-mono tabular-nums">
                      {h.event_type === "regrade"
                        ? `v${h.old_rubric_version} (${h.old_score}) → v${h.new_rubric_version} (${h.new_score})`
                        : `Score: ${h.score}`}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-500">{new Date(h.created_at).toLocaleString()}</div>
                  {h.reason && <div className="mt-1 text-slate-700">Reason: {h.reason}</div>}
                  {h.score_delta_report?.explanation_of_change && (
                    <div className="mt-1 text-blue-800">{h.score_delta_report.explanation_of_change}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
