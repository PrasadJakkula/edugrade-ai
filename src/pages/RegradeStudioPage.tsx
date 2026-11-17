import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { apiRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { GradingResult, Rubric, RubricVersion } from "../types";
import { RefreshCw, ArrowRight, AlertTriangle } from "lucide-react";

export function RegradeStudioPage() {
  const [searchParams] = useSearchParams();
  const { notify } = useToast();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [exams, setExams] = useState<Array<{ _id: string; title: string; rubric_id?: string | null }>>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>("");
  const [results, setResults] = useState<GradingResult[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState(searchParams.get("rubricId") || "");
  const [versions, setVersions] = useState<RubricVersion[]>([]);
  const [targetVersion, setTargetVersion] = useState<number>(0);
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>(
    searchParams.get("resultId") ? [searchParams.get("resultId")!] : []
  );
  const [reason, setReason] = useState("Updated rubric criteria & partial-credit rules");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [running, setRunning] = useState(false);
  const [comparisons, setComparisons] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      apiRequest<Rubric[]>("/rubrics/mine"),
      apiRequest<{ results: GradingResult[] }>("/grading/results"),
      apiRequest<{ exams: Array<{ _id: string; title: string; rubric_id?: string | null }> }>("/exams"),
    ])
      .then(([rList, resData, exData]) => {
        const arr = Array.isArray(rList) ? rList : [];
        setRubrics(arr);
        setResults(resData.results || []);
        setExams(exData.exams || []);
        if (!selectedRubricId && arr.length > 0) {
          setSelectedRubricId(arr[0]._id);
        }
      })
      .catch((err) => notify("error", err.message));
  }, []);

  useEffect(() => {
    if (!selectedRubricId) return;
    apiRequest<{ versions: RubricVersion[] }>(`/rubrics/${selectedRubricId}/versions`)
      .then((d) => {
        const vList = d.versions || [];
        setVersions(vList);
        if (vList.length > 0) setTargetVersion(vList[0].version);
      })
      .catch(() => setVersions([]));
  }, [selectedRubricId]);

  const matchingResults = results.filter((r) => {
    if (selectedExamId) return r.exam_id === selectedExamId;
    return r.rubric_id === selectedRubricId || selectedResultIds.includes(r._id);
  });

  const toggleResult = (id: string) => {
    setSelectedResultIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleRegrade = async () => {
    if (!selectedRubricId || selectedResultIds.length === 0) {
      notify("info", "Select a rubric and at least one graded answer to regrade.");
      return;
    }
    if (selectedResultIds.length > 1 && !confirmBulk) {
      notify("info", "Please confirm bulk regrading by checking the confirmation box.");
      return;
    }
    setRunning(true);
    try {
      const data = await apiRequest<{ regraded_count: number; comparisons: any[] }>("/grading/regrade", {
        method: "POST",
        body: JSON.stringify({
          rubric_id: selectedRubricId,
          target_version: targetVersion,
          result_ids: selectedResultIds,
          confirm_bulk: confirmBulk,
          reason,
        }),
      });
      setComparisons(data.comparisons || []);
      notify("success", `Regraded ${data.regraded_count} answer(s) against v${targetVersion}. Original grades preserved in history.`);
      const refreshed = await apiRequest<{ results: GradingResult[] }>("/grading/results");
      setResults(refreshed.results || []);
    } catch (err: any) {
      notify("error", err.message || "Regrade failed.");
    } finally {
      setRunning(false);
    }
  };

  const selectedVersionObj = versions.find((v) => v.version === targetVersion);

  return (
    <AppShell title="Instant Regrading & Rubric Diff Studio" breadcrumb="Workspace / Instant Regrade">
      <div className="grid lg:grid-cols-12 gap-6">
        {/* Configuration Panel */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div>
            <h2 className="text-base font-bold text-slate-900">1. Choose Updated Rubric & Version</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Original grading records are never overwritten; every regrade creates an auditable comparison.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Rubric</label>
            <select
              value={selectedRubricId}
              onChange={(e) => {
                setSelectedRubricId(e.target.value);
                setSelectedResultIds([]);
                setComparisons([]);
                setConfirmBulk(false);
              }}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
            >
              {rubrics.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name} (Latest v{r.current_version})
                </option>
              ))}
            </select>
          </div>

          {exams.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Filter Answers by Examination (Optional)</label>
              <select
                value={selectedExamId}
                onChange={(e) => {
                  setSelectedExamId(e.target.value);
                  setSelectedResultIds([]);
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
              >
                <option value="">All Answers Linked to Rubric</option>
                {exams.map((ex) => (
                  <option key={ex._id} value={ex._id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Rubric Version</label>
            <select
              value={targetVersion}
              onChange={(e) => setTargetVersion(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
            >
              {versions.map((v) => (
                <option key={v._id} value={v.version}>
                  v{v.version} — {v.change_note}
                </option>
              ))}
            </select>
          </div>

          {selectedVersionObj && (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1.5">
              <div className="font-semibold text-slate-800">Target v{selectedVersionObj.version} Criteria:</div>
              {selectedVersionObj.questions[0]?.criteria.map((c) => (
                <div key={c.criterion_id} className="flex justify-between text-slate-600">
                  <span>• {c.title}</span>
                  <span className="font-mono tabular-nums">{c.points} pts</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Regrade Audit Reason</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>
        </div>

        {/* Target Submissions Selection */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">2. Select Previously Evaluated Answers</h2>
              <button
                type="button"
                onClick={() => setSelectedResultIds(matchingResults.map((r) => r._id))}
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Select All ({matchingResults.length})
              </button>
            </div>

            {matchingResults.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No previously graded answers linked to this rubric yet.</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                {matchingResults.map((r) => (
                  <label key={r._id} className="py-3 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50 px-2 rounded">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={selectedResultIds.includes(r._id)}
                        onChange={() => toggleResult(r._id)}
                        className="rounded border-slate-300"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{r.student_name}</div>
                        <div className="text-xs text-slate-500">
                          Graded on v{r.rubric_version ?? "?"} · Current score: {r.final_score} / {r.max_marks}
                        </div>
                      </div>
                    </div>
                    <Link to={`/results/${r._id}`} className="text-xs text-blue-700 hover:underline shrink-0">
                      View
                    </Link>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-3">
            {selectedResultIds.length > 1 && (
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-950">
                <input
                  type="checkbox"
                  checked={confirmBulk}
                  onChange={(e) => setConfirmBulk(e.target.checked)}
                  className="mt-0.5 rounded border-amber-400"
                />
                <span>
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                  Confirm bulk regrading of <strong>{selectedResultIds.length}</strong> answers to rubric v{targetVersion}. Original evaluations remain preserved in immutable history.
                </span>
              </label>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleRegrade}
                disabled={running || selectedResultIds.length === 0}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${running ? "animate-spin" : ""}`} />
                <span>{running ? "Regrading with Gemini..." : `Instant Regrade (${selectedResultIds.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Side-by-Side Comparison Output */}
      {comparisons.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Old vs. New Regrading Comparison</h2>
          {comparisons.map((cmp) => (
            <div key={cmp.result_id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{cmp.student_name}</h3>
                  <div className="text-xs text-slate-500">
                    Rubric v{cmp.old_rubric_version} <ArrowRight className="w-3 h-3 inline mx-1" /> v{cmp.new_rubric_version}
                  </div>
                </div>
                <div className="flex items-center gap-4 font-mono tabular-nums">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">Old Score</div>
                    <div className="text-base font-bold text-slate-700">
                      {cmp.old_score} / {cmp.old_max_marks}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">New Score</div>
                    <div className="text-base font-bold text-blue-700">
                      {cmp.new_score} / {cmp.new_max_marks}
                    </div>
                  </div>
                  <div
                    className={`px-2.5 py-1 rounded border text-xs font-bold ${
                      cmp.score_delta > 0
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : cmp.score_delta < 0
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {cmp.score_delta >= 0 ? "+" : ""}
                    {cmp.score_delta}
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-700">{cmp.explanation_of_change}</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4">Criterion</th>
                      <th className="py-2 px-3 text-right">Old</th>
                      <th className="py-2 px-3 text-right">New</th>
                      <th className="py-2 px-3 text-right">Delta</th>
                      <th className="py-2 pl-4">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cmp.criterion_changes.map((cc: any) => (
                      <tr key={cc.criterion_id}>
                        <td className="py-2.5 pr-4 font-semibold text-slate-800">{cc.criterion_title}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{cc.old_marks ?? "N/A"}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{cc.new_marks ?? "N/A"}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {cc.delta >= 0 ? "+" : ""}
                          {cc.delta}
                        </td>
                        <td className="py-2.5 pl-4 text-slate-600">{cc.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
