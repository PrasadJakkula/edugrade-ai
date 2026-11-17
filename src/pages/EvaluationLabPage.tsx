import React, { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { apiRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { DatasetRecord } from "../types";
import { Upload, Play, ShieldCheck, Info } from "lucide-react";

export function EvaluationLabPage() {
  const { notify } = useToast();
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);

  // Upload state
  const [dsName, setDsName] = useState("");
  const [uploading, setUploading] = useState(false);

  // Prompt state
  const [promptName, setPromptName] = useState("");
  const [promptText, setPromptText] = useState("");

  // Run state
  const [selectedDsId, setSelectedDsId] = useState("");
  const [selectedSplit, setSelectedSplit] = useState<"validation" | "test" | "train">("validation");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [calOffset, setCalOffset] = useState<number>(0);
  const [fitCalibration, setFitCalibration] = useState(true);
  const [running, setRunning] = useState(false);

  const loadAll = async () => {
    try {
      const [dsData, pData, rData] = await Promise.all([
        apiRequest<{ datasets: DatasetRecord[] }>("/evaluation/datasets"),
        apiRequest<{ prompts: any[] }>("/evaluation/prompts"),
        apiRequest<{ runs: any[] }>("/evaluation/runs"),
      ]);
      const dsList = dsData.datasets || [];
      const pList = pData.prompts || [];
      setDatasets(dsList);
      setPrompts(pList);
      setRuns(rData.runs || []);
      if (!selectedDsId && dsList.length > 0) setSelectedDsId(dsList[0]._id);
      if (!selectedPromptId && pList.length > 0) setSelectedPromptId(pList[0]._id);
    } catch (err: any) {
      notify("error", err.message || "Failed to load evaluation lab.");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleDatasetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", dsName.trim() || file.name.replace(/\.[^.]+$/, ""));
      form.append("train_ratio", "0.6");
      form.append("val_ratio", "0.2");
      await apiRequest("/evaluation/datasets/upload", { method: "POST", body: form });
      setDsName("");
      notify("success", "Dataset uploaded and deterministically split with leakage protection.");
      await loadAll();
    } catch (err: any) {
      notify("error", err.message || "Dataset upload failed.");
    } finally {
      e.target.value = "";
      setUploading(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const csv = [
      "sample_id,subject,topic,question,expected_answer,student_answer,human_score,max_marks",
      '"ohms_1","Physics","Electricity","Explain Ohm\'s law.","Voltage equals current times resistance (V = IR); at constant resistance current is directly proportional to voltage.","Ohm\'s law states that voltage is equal to current multiplied by resistance. V = IR. If resistance remains constant, current increases when voltage increases.",4.5,5',
      '"ohms_2","Physics","Electricity","Explain Ohm\'s law.","Voltage equals current times resistance (V = IR); at constant resistance current is directly proportional to voltage.","V = IR where V is in Volts, I in Amperes, R in Ohms. For example, 2 A through 5 Ohms gives 10 V.",5,5',
      '"ohms_3","Physics","Electricity","Explain Ohm\'s law.","Voltage equals current times resistance (V = IR); at constant resistance current is directly proportional to voltage.","Current depends on electricity in a circuit.",1,5',
      '"bio_1","Biology","Cell Biology","Explain the role of mitochondria.","Mitochondria generate ATP via cellular respiration.","Mitochondria produce ATP energy for the cell through aerobic respiration.",5,5',
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "evaluai_sample_benchmark.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCreatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest("/evaluation/prompts", {
        method: "POST",
        body: JSON.stringify({ name: promptName, instructions: promptText }),
      });
      setPromptName("");
      setPromptText("");
      notify("success", "Prompt configuration version saved.");
      await loadAll();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleRunEval = async () => {
    if (!selectedDsId) return;
    setRunning(true);
    try {
      const run = await apiRequest<any>("/evaluation/run", {
        method: "POST",
        body: JSON.stringify({
          dataset_id: selectedDsId,
          split: selectedSplit,
          prompt_id: selectedPromptId || null,
          calibration_offset: calOffset,
          fit_calibration_on_validation: selectedSplit === "validation" && fitCalibration,
        }),
      });
      if (run.calibration_recommendation?.applied) {
        setCalOffset(run.calibration_recommendation.calibration_offset);
      }
      notify("success", `Completed evaluation on '${selectedSplit}' split.`);
      await loadAll();
    } catch (err: any) {
      notify("error", err.message || "Evaluation run failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell title="AI Evaluation, Validation & Calibration Lab" breadcrumb="Workspace / Evaluation Lab">
      {/* Honest Model Fine-Tuning vs Calibration Disclosure */}
      <div className="mb-6 p-4 rounded-xl border border-blue-200 bg-blue-50 text-xs text-blue-950 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <div>
          <strong>Methodological Transparency:</strong> This subsystem performs prompt optimization, rubric validation, and additive score-bias calibration on isolated <strong>Train / Validation / Test</strong> splits (preventing duplicate leakage). Underlying Gemini / OpenAI foundation model weights are <strong>not</strong> fine-tuned or retrained.
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-6 mb-8">
        {/* Dataset Upload & Split Management */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">1. Labeled Datasets & Leakage-Safe Splits</h2>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              Hash Leakage Guard
            </span>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dataset Name</label>
              <input
                value={dsName}
                onChange={(e) => setDsName(e.target.value)}
                placeholder="e.g., Physics Spring Cohort"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300"
              />
            </div>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-800 cursor-pointer hover:bg-slate-100">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? "Uploading..." : "Upload CSV / JSON"}</span>
              <input type="file" accept=".csv,.json" onChange={handleDatasetUpload} disabled={uploading} className="hidden" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Required columns/keys: <code>question</code>, <code>student_answer</code>, <code>human_score</code>, <code>max_marks</code> (min 3 rows).
            </span>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="text-blue-700 font-semibold hover:underline shrink-0"
            >
              Download Sample CSV
            </button>
          </div>

          <div className="space-y-3">
            {datasets.map((ds) => (
              <div key={ds._id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900">
                  <span>{ds.name}</span>
                  <span className="font-mono tabular-nums">{ds.total_samples} samples</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-slate-600 font-mono tabular-nums">
                  <span>Train: {ds.counts.train}</span>
                  <span>·</span>
                  <span>Validation: {ds.counts.validation}</span>
                  <span>·</span>
                  <span>Held-Out Test: {ds.counts.test}</span>
                  {ds.is_demo && (
                    <>
                      <span>·</span>
                      <span className="font-sans font-semibold text-blue-700">Demo Dataset</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Prompt Versions & Evaluation Runner */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
            2. Run Benchmark Evaluation & Safe Calibration
          </h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Dataset</label>
              <select
                value={selectedDsId}
                onChange={(e) => setSelectedDsId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
              >
                {datasets.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Target Split</label>
              <select
                value={selectedSplit}
                onChange={(e) => setSelectedSplit(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
              >
                <option value="validation">Validation Split (Tuning & Calibration)</option>
                <option value="test">Held-Out Test Split (Final Unbiased Eval)</option>
                <option value="train">Train Split (Inspection Only)</option>
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Prompt Version</label>
              <select
                value={selectedPromptId}
                onChange={(e) => setSelectedPromptId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
              >
                {prompts.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Calibration Offset (Marks)</label>
              <input
                type="number"
                step="0.05"
                min="-1.5"
                max="1.5"
                value={calOffset}
                onChange={(e) => setCalOffset(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono tabular-nums"
              />
            </div>
          </div>

          {selectedSplit === "validation" && (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={fitCalibration}
                onChange={(e) => setFitCalibration(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Estimate additive calibration offset on Validation split (blocked on Held-Out Test split)</span>
            </label>
          )}

          <button
            type="button"
            onClick={handleRunEval}
            disabled={running || !selectedDsId}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{running ? "Running Gemini Evaluation on Split..." : `Evaluate on ${selectedSplit} Split`}</span>
          </button>

          <form onSubmit={handleCreatePrompt} className="pt-4 border-t border-slate-100 space-y-2">
            <div className="text-xs font-bold text-slate-800">Add New Prompt Version</div>
            <input
              required
              value={promptName}
              onChange={(e) => setPromptName(e.target.value)}
              placeholder="e.g., v3 — Strict Dimensional Units"
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300"
            />
            <textarea
              required
              rows={2}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="Prompt grading instructions..."
              className="w-full px-3 py-1.5 text-xs rounded border border-slate-300"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Save Prompt Version
            </button>
          </form>
        </div>
      </div>

      {/* Evaluation Runs History */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-900">Evaluation Run History & Held-Out Metrics</h2>
        </div>

        {runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No evaluation runs recorded yet. Select a dataset split above and click Evaluate to measure real MAE, RMSE, and evidence validity.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <th className="py-3 px-4">Dataset & Split</th>
                  <th className="py-3 px-4">Prompt Config</th>
                  <th className="py-3 px-3 text-right">n</th>
                  <th className="py-3 px-3 text-right">MAE</th>
                  <th className="py-3 px-3 text-right">RMSE</th>
                  <th className="py-3 px-3 text-right">Within 1</th>
                  <th className="py-3 px-3 text-right">Evidence Valid</th>
                  <th className="py-3 px-3 text-right">Warning Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {runs.map((run) => {
                  const m = run.summary?.agreement?.metrics;
                  return (
                    <tr key={run._id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{run.dataset_name}</div>
                        <div className="text-slate-500 capitalize">
                          Split: {run.split} · Offset: {run.calibration_offset_used >= 0 ? "+" : ""}
                          {run.calibration_offset_used}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div>{run.prompt_name}</div>
                        {run.calibration_recommendation?.note && (
                          <div className="text-[11px] text-blue-700 mt-0.5">{run.calibration_recommendation.note}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{run.summary?.agreement?.sample_size ?? 0}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{m ? m.mae.toFixed(2) : "—"}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">{m ? m.rmse.toFixed(2) : "—"}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {m ? `${Math.round(m.within_one_mark_agreement * 100)}%` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {run.summary?.evidence_validity !== null ? `${Math.round(run.summary.evidence_validity * 100)}%` : "—"}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {run.summary?.reliability_warning_rate !== null
                          ? `${Math.round(run.summary.reliability_warning_rate * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
