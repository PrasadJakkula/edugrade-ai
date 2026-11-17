import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandLoader } from "../components/BrandLoader";
import { apiRequest } from "../lib/api";
import { AlertTriangle, Info } from "lucide-react";

interface AgreementData {
  sample_size: number;
  sufficient_data: boolean;
  recommended_sample_size: number;
  limitations: string[];
  contains_demo_data: boolean;
  metrics: {
    mae: number;
    rmse: number;
    mean_bias: number;
    exact_agreement: number;
    within_one_mark_agreement: number;
    weighted_cohens_kappa: number | null;
    criterion_sample_size: number;
    criterion_exact_agreement: number | null;
    criterion_within_half_agreement: number | null;
  } | null;
  paired_records: Array<{
    _id: string;
    student_name: string;
    subject: string;
    ai_score: number;
    human_score: number;
    max_marks: number;
    is_demo: boolean;
    override_reason: string;
  }>;
}

export function AgreementPage() {
  const [data, setData] = useState<AgreementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest<AgreementData>("/grading/agreement-analytics")
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell title="Teacher Consistency & Agreement Analytics" breadcrumb="Workspace / Agreement">
      {error && (
        <div className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-900">{error}</div>
      )}

      {loading ? (
        <BrandLoader label="Computing agreement statistics..." />
      ) : !data || data.sample_size === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <h2 className="text-base font-bold text-slate-900">Insufficient Teacher-Reviewed Records</h2>
          <p className="mt-2 text-sm text-slate-600 max-w-lg mx-auto">
            Approve or override AI evaluations in the grading review workflow to compute paired AI-versus-teacher agreement metrics.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.contains_demo_data && (
            <div className="p-4 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-950 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <strong>Demonstration Data Notice:</strong> Some paired records below are preloaded demonstration samples (marked “Demo”) to illustrate statistical metrics. Grade and approve real student submissions to replace or augment them.
              </div>
            </div>
          )}

          {data.limitations.length > 0 && (
            <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">
                  Sample Size: n = {data.sample_size} (Recommended n ≥ {data.recommended_sample_size})
                </div>
                {data.limitations.map((lim, i) => (
                  <div key={i}>• {lim}</div>
                ))}
              </div>
            </div>
          )}

          {/* Metrics Grid */}
          {data.metrics && (
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Paired Samples (n)</div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {data.sample_size}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">MAE (Marks)</div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {data.metrics.mae.toFixed(2)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">RMSE (Marks)</div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {data.metrics.rmse.toFixed(2)}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Exact Agreement</div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-700">
                  {Math.round(data.metrics.exact_agreement * 100)}%
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Within 1 Mark</div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-blue-700">
                  {Math.round(data.metrics.within_one_mark_agreement * 100)}%
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="text-xs text-slate-500">Weighted Kappa (κ)</div>
                <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
                  {data.metrics.weighted_cohens_kappa !== null
                    ? data.metrics.weighted_cohens_kappa.toFixed(3)
                    : "Suppressed"}
                </div>
              </div>
            </div>
          )}

          {/* Scatter Plot: AI Score vs Teacher Approved Score */}
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
              <h2 className="text-sm font-bold text-slate-900">AI Score vs. Teacher Approved Score</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Normalized percentage scale (0–100%). Points on the diagonal line represent exact agreement.
              </p>

              <div className="mt-4">
                <svg viewBox="0 0 320 260" className="w-full h-auto border border-slate-100 rounded bg-slate-50/50">
                  {/* Grid & Axes */}
                  <line x1="40" y1="220" x2="295" y2="220" stroke="#CBD5E1" strokeWidth="1" />
                  <line x1="40" y1="20" x2="40" y2="220" stroke="#CBD5E1" strokeWidth="1" />
                  {/* Diagonal perfect agreement line */}
                  <line x1="40" y1="220" x2="290" y2="20" stroke="#94A3B8" strokeDasharray="4 4" strokeWidth="1.5" />

                  <text x="165" y="248" textAnchor="middle" className="fill-slate-500 text-[10px]">
                    Teacher Score (% of max)
                  </text>
                  <text
                    x="14"
                    y="120"
                    textAnchor="middle"
                    transform="rotate(-90 14 120)"
                    className="fill-slate-500 text-[10px]"
                  >
                    AI Score (% of max)
                  </text>

                  {data.paired_records.map((p) => {
                    const maxM = Math.max(1, p.max_marks);
                    const x = 40 + (p.human_score / maxM) * 250;
                    const y = 220 - (p.ai_score / maxM) * 200;
                    return (
                      <circle
                        key={p._id}
                        cx={x}
                        cy={y}
                        r="5"
                        className="fill-blue-700 opacity-80 stroke-white"
                        strokeWidth="1.5"
                      >
                        <title>{`${p.student_name}: AI ${p.ai_score}/${p.max_marks} vs Teacher ${p.human_score}/${p.max_marks}`}</title>
                      </circle>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* Paired Comparison Table */}
            <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h2 className="text-sm font-bold text-slate-900">Paired AI vs. Human Evaluations</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-4">Student</th>
                      <th className="py-2.5 px-3 text-right">AI Mark</th>
                      <th className="py-2.5 px-3 text-right">Teacher</th>
                      <th className="py-2.5 px-3 text-right">Error</th>
                      <th className="py-2.5 px-4">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.paired_records.map((r) => {
                      const err = Number((r.ai_score - r.human_score).toFixed(2));
                      return (
                        <tr key={r._id} className="hover:bg-slate-50">
                          <td className="py-3 px-4 font-medium text-slate-900">
                            <Link to={`/results/${r._id}`} className="text-blue-700 hover:underline">
                              {r.student_name}
                            </Link>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">{r.ai_score}</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">{r.human_score}</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">
                            {err >= 0 ? `+${err}` : err}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{r.override_reason}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
