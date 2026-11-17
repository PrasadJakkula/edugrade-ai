import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { apiDownload, apiRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { BatchJob, Rubric, SUPPORTED_SUBJECTS } from "../types";
import { Play, RefreshCw, Download, Upload } from "lucide-react";

export function BatchGradingPage() {
  const { notify } = useToast();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [title, setTitle] = useState("Physics Midterm Cohort");
  const [rubricId, setRubricId] = useState("");
  const [subject, setSubject] = useState("Physics");
  const [question, setQuestion] = useState("");
  const [maxMarks, setMaxMarks] = useState(6);
  const [submissions, setSubmissions] = useState<
    Array<{ student_name: string; student_answer: string; ocr_quality_score?: number | null; ocr_warnings?: string[] }>
  >([
    {
      student_name: "Alice Chen",
      student_answer: "F = ma. When net force doubles and mass is constant, acceleration doubles because a = F/m.",
    },
    {
      student_name: "Marcus Vance",
      student_answer: "Force pushes objects forward so they accelerate faster.",
    },
  ]);
  const [creating, setCreating] = useState(false);

  const loadJobs = async () => {
    try {
      const data = await apiRequest<{ jobs: BatchJob[] }>("/batch/jobs");
      setJobs(data.jobs || []);
    } catch {}
  };

  useEffect(() => {
    apiRequest<Rubric[]>("/rubrics/mine")
      .then((list) => {
        const arr = Array.isArray(list) ? list : [];
        setRubrics(arr);
        if (arr.length > 0) {
          setRubricId(arr[0]._id);
          setSubject(arr[0].subject);
          setQuestion(arr[0].questions[0]?.text || "");
          setMaxMarks(arr[0].questions[0]?.max_marks || 6);
        }
      })
      .catch(() => {});
    loadJobs();
  }, []);

  // Poll active jobs automatically
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === "queued" || j.status === "running");
    if (!hasActive) return;
    const timer = setInterval(loadJobs, 2000);
    return () => clearInterval(timer);
  }, [jobs]);

  const handleMultiFileExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    notify("info", `Extracting ${files.length} file(s)...`);
    const extractedRows: Array<{
      student_name: string;
      student_answer: string;
      ocr_quality_score: number | null;
      ocr_warnings: string[];
    }> = [];
    for (const file of files) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await apiRequest<{
          extracted_text: string;
          detected_student_name: string;
          ocr_quality_score: number;
          warnings: string[];
        }>("/grading/ocr-extract", {
          method: "POST",
          body: form,
        });
        extractedRows.push({
          student_name: res.detected_student_name || file.name.replace(/\.[^.]+$/, ""),
          student_answer: res.extracted_text || "",
          ocr_quality_score: res.ocr_quality_score ?? null,
          ocr_warnings: res.warnings || [],
        });
      } catch (err: any) {
        notify("error", `Failed extracting ${file.name}: ${err.message}`);
      }
    }
    e.target.value = "";
    if (extractedRows.length > 0) {
      setSubmissions((prev) => [...prev, ...extractedRows]);
      notify("success", `Added ${extractedRows.length} extracted submission(s) to batch queue.`);
    }
  };

  const handleStartBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const validSubmissions = submissions.filter((s) => s.student_answer.trim());
    if (validSubmissions.length === 0) {
      notify("error", "Add at least one non-empty student submission before running batch grading.");
      return;
    }
    setCreating(true);
    try {
      const selected = rubrics.find((r) => r._id === rubricId);
      await apiRequest("/batch/jobs", {
        method: "POST",
        body: JSON.stringify({
          title,
          subject,
          question,
          max_marks: maxMarks,
          rubric_id: rubricId || null,
          rubric_version: selected?.current_version ?? null,
          submissions: validSubmissions,
        }),
      });
      notify("success", "Batch grading job queued in background.");
      await loadJobs();
    } catch (err: any) {
      notify("error", err.message || "Failed to start batch job.");
    } finally {
      setCreating(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await apiRequest(`/batch/jobs/${jobId}/retry-failed`, { method: "POST" });
      notify("info", "Retrying failed submissions...");
      await loadJobs();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  return (
    <AppShell title="Batch Grading & Background Job Queue" breadcrumb="Workspace / Batch Grading">
      <div className="grid lg:grid-cols-12 gap-6">
        <form onSubmit={handleStartBatch} className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">Queue New Batch Evaluation</h2>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Batch Title</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rubric</label>
              <select
                value={rubricId}
                onChange={(e) => {
                  const found = rubrics.find((r) => r._id === e.target.value);
                  setRubricId(e.target.value);
                  if (found) {
                    setSubject(found.subject);
                    setQuestion(found.questions[0]?.text || "");
                    setMaxMarks(found.questions[0]?.max_marks || 6);
                  }
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
              >
                {rubrics.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name} (v{r.current_version})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
              >
                {SUPPORTED_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Marks</label>
              <input
                type="number"
                min="1"
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Question Prompt</label>
            <textarea
              required
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-semibold text-slate-700">
              Student Submissions ({submissions.length})
            </span>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 cursor-pointer hover:underline">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Multiple Files</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                  onChange={handleMultiFileExtract}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setSubmissions((prev) => [...prev, { student_name: `Student ${prev.length + 1}`, student_answer: "" }])}
                className="text-xs font-semibold text-slate-700 hover:underline"
              >
                + Add Row
              </button>
            </div>
          </div>

          <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
            {submissions.map((s, idx) => (
              <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={s.student_name}
                    onChange={(e) =>
                      setSubmissions((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, student_name: e.target.value } : x))
                      )
                    }
                    placeholder="Student Name"
                    className="px-2.5 py-1 text-xs rounded border border-slate-300 bg-white font-medium flex-1"
                  />
                  {submissions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSubmissions((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={s.student_answer}
                  onChange={(e) =>
                    setSubmissions((prev) =>
                      prev.map((x, i) => (i === idx ? { ...x, student_answer: e.target.value } : x))
                    )
                  }
                  placeholder="Student written response..."
                  className="w-full px-2.5 py-1.5 text-xs rounded border border-slate-300 bg-white"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={creating}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60"
          >
            <Play className="w-4 h-4" />
            <span>{creating ? "Queueing..." : "Run Non-Blocking Batch Evaluation"}</span>
          </button>
        </form>

        {/* Persistent Job Monitor */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Persistent Batch Jobs</h2>
            <button type="button" onClick={loadJobs} className="text-xs font-semibold text-blue-700 hover:underline">
              Refresh Status
            </button>
          </div>

          {jobs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No batch jobs queued yet. Add multiple student answers on the left to start.
            </div>
          ) : (
            jobs.map((job) => (
              <div key={job._id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{job.title}</h3>
                    <div className="text-xs text-slate-500 font-mono tabular-nums">
                      Status: {job.status} · Completed {job.completed_count}/{job.total_count} · Failed {job.failed_count}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.failed_count > 0 && job.status !== "running" && (
                      <button
                        type="button"
                        onClick={() => handleRetry(job._id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 text-xs font-semibold text-amber-900"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry Failed</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiDownload(`/batch/jobs/${job._id}/export.csv`, `batch_${job._id}.csv`);
                        } catch (err: any) {
                          notify("error", err.message || "CSV export failed.");
                        }
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Download className="w-3 h-3" />
                      <span>Export CSV</span>
                    </button>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      job.failed_count > 0 ? "bg-amber-500" : "bg-blue-700"
                    }`}
                    style={{
                      width: `${job.total_count > 0 ? Math.round(((job.completed_count + job.failed_count) / job.total_count) * 100) : 0}%`,
                    }}
                  />
                </div>

                <div className="divide-y divide-slate-100 text-xs">
                  {job.items.map((it, idx) => (
                    <div key={idx} className="py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-800">{it.student_name}</span>
                        {it.error && <span className="ml-2 text-red-600">({it.error})</span>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
                        <span>{it.score !== null ? `${it.score}/${job.max_marks}` : it.status}</span>
                        {it.result_id && (
                          <Link to={`/results/${it.result_id}`} className="font-sans font-semibold text-blue-700 hover:underline">
                            Inspect
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
