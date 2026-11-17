import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ReliabilityBanner } from "../components/ReliabilityBanner";
import { BrandLoader } from "../components/BrandLoader";
import { apiRequest } from "../lib/api";
import { GradingResult, Rubric } from "../types";
import { ArrowRight, Search } from "lucide-react";

export function DashboardPage() {
  const [results, setResults] = useState<GradingResult[]>([]);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "needs_review" | "approved">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<{ results: GradingResult[] }>("/grading/results"),
      apiRequest<Rubric[]>("/rubrics/mine"),
    ])
      .then(([resData, rubData]) => {
        if (!active) return;
        setResults(resData.results || []);
        setRubrics(Array.isArray(rubData) ? rubData : []);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load dashboard data.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const needsReviewCount = results.filter((r) => r.reliability?.teacher_review_required && r.status !== "approved").length;
  const approvedCount = results.filter((r) => r.status === "approved").length;
  const regradedCount = results.filter((r) => Boolean(r.last_regrade_comparison)).length;

  const filteredResults = results.filter((r) => {
    if (filter === "needs_review" && !r.reliability?.teacher_review_required) return false;
    if (filter === "approved" && r.status !== "approved") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.student_name.toLowerCase().includes(q) ||
        r.subject.toLowerCase().includes(q) ||
        r.question.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <AppShell title="Teacher Evaluation Workspace" breadcrumb="Workspace / Dashboard">
      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Total Graded Answers</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {loading ? "—" : results.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Across {rubrics.length} rubrics</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Flagged for Review</div>
          <div className="mt-2 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {loading ? "—" : needsReviewCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Uncertainty or OCR warnings</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Teacher Approved</div>
          <div className="mt-2 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
            {loading ? "—" : approvedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Verified & finalized marks</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500">Regraded Results</div>
          <div className="mt-2 text-2xl font-bold text-blue-700 font-mono tabular-nums">
            {loading ? "—" : regradedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">Tracked with score deltas</div>
        </div>
      </div>

      {/* Hackathon Interactive Walkthrough Guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Guided Evalora Walkthrough</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Preloaded demonstration records are labeled “(Demo)” and let you verify every Evalora capability end-to-end.
            </p>
          </div>
          <Link
            to="/regrade"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
          >
            <span>Try Instant Regrade (v1 → v2)</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm">
          <Link to="/grade-exam" className="p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-slate-50 transition-colors">
            <div className="font-semibold text-slate-900">1. Grade + Verify Evidence</div>
            <p className="mt-1 text-xs text-slate-600">
              Submit digital text, PDFs, or handwritten scans; review OCR warnings and exact verbatim evidence highlights.
            </p>
          </Link>

          <Link to="/regrade" className="p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-slate-50 transition-colors">
            <div className="font-semibold text-slate-900">2. Evolve Rubric & Regrade</div>
            <p className="mt-1 text-xs text-slate-600">
              Update Physics rubric criteria from v1 to v2 and regrade existing answers with side-by-side score diffs.
            </p>
          </Link>

          <Link to="/evaluation" className="p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-slate-50 transition-colors">
            <div className="font-semibold text-slate-900">3. Measure Agreement & Calibrate</div>
            <p className="mt-1 text-xs text-slate-600">
              Inspect MAE, RMSE, Cohen's kappa, and run held-out dataset evaluations without test-set leakage.
            </p>
          </Link>
        </div>
      </div>

      {/* Evaluations Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ["all", "All Results"],
                ["needs_review", "Needs Review"],
                ["approved", "Approved"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by student or subject..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-4">
            <BrandLoader label="Loading evaluation records..." />
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-800">No grading results match this filter.</p>
            <p className="mt-1 text-xs text-slate-500">Start by grading a student response against a configurable rubric.</p>
            <Link
              to="/grade-exam"
              className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800"
            >
              Grade First Answer
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Subject & Rubric</th>
                  <th className="py-3 px-4">Reliability</th>
                  <th className="py-3 px-4 text-right">Score</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredResults.map((r) => (
                  <tr key={r._id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 font-medium text-slate-900">
                      <div>{r.student_name}</div>
                      <div className="text-xs text-slate-500 truncate max-w-xs">{r.question}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      <div className="font-medium text-slate-800">{r.subject}</div>
                      <div>
                        {r.rubric_name} {r.rubric_version ? `· v${r.rubric_version}` : ""}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <ReliabilityBanner reliability={r.reliability} compact />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {r.final_score} / {r.max_marks}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 capitalize">
                      {r.status.replace(/_/g, " ")}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/results/${r._id}`}
                        className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap"
                      >
                        Inspect & Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
