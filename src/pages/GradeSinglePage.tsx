import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { apiRequest } from "../lib/api";
import { useToast } from "../context/ToastContext";
import { Rubric, SUPPORTED_SUBJECTS } from "../types";
import { Upload, AlertTriangle, Sparkles, FileText, Trash2 } from "lucide-react";

interface AdHocCriterion {
  criterion_id: string;
  title: string;
  description: string;
  points: number;
}

export function GradeSinglePage() {
  const { notify } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [exams, setExams] = useState<Array<{ _id: string; title: string; rubric_id?: string | null }>>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>(searchParams.get("examId") || "");
  const [selectedRubricId, setSelectedRubricId] = useState<string>(searchParams.get("rubricId") || "");
  const [subject, setSubject] = useState<string>("Physics");
  const [topic, setTopic] = useState("");
  const [studentName, setStudentName] = useState("");
  const [question, setQuestion] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [maxMarks, setMaxMarks] = useState<number>(6);
  const [subjectInstructions, setSubjectInstructions] = useState(
    "Accept conceptually equivalent wording and award proportional partial credit."
  );
  const [customCriteria, setCustomCriteria] = useState<AdHocCriterion[]>([
    {
      criterion_id: "c_custom_1",
      title: "Conceptual Accuracy & Completeness",
      description: "Accuracy against expected reasoning and domain concepts.",
      points: 6,
    },
  ]);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [inputMode, setInputMode] = useState<"digital" | "upload">("digital");

  // OCR state
  const [extracting, setExtracting] = useState(false);
  const [ocrQuality, setOcrQuality] = useState<number | null>(null);
  const [ocrWarnings, setOcrWarnings] = useState<string[]>([]);
  const [ocrPages, setOcrPages] = useState<Array<{ page: number; text: string }>>([]);
  const [grading, setGrading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest<Rubric[]>("/rubrics/mine"),
      apiRequest<{ exams: Array<{ _id: string; title: string; rubric_id?: string | null }> }>("/exams"),
    ])
      .then(([list, exData]) => {
        const arr = Array.isArray(list) ? list : [];
        setRubrics(arr);
        setExams(exData.exams || []);
        const requestedRubric = searchParams.get("rubricId");
        const initial = requestedRubric ? arr.find((r) => r._id === requestedRubric) : arr[0];
        if (initial) {
          applyRubric(initial);
        }
      })
      .catch(() => {});
  }, []);

  const applyRubric = (r: Rubric) => {
    setSelectedRubricId(r._id);
    setSubject(r.subject || "Other");
    setTopic(r.topic || "");
    const q = r.questions[0];
    if (q) {
      setQuestion(q.text || "");
      setExpectedAnswer(q.expected_answer || "");
      const pts = q.criteria.reduce((a, c) => a + Number(c.points || 0), 0);
      setMaxMarks(pts || q.max_marks || 10);
    }
    setSubjectInstructions(r.subject_instructions || "");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await apiRequest<{
        extracted_text: string;
        detected_student_name: string;
        ocr_quality_score: number;
        warnings: string[];
        pages: Array<{ page: number; text: string }>;
      }>("/grading/ocr-extract", {
        method: "POST",
        body: form,
      });
      setStudentAnswer(res.extracted_text || "");
      if (res.detected_student_name && !studentName) {
        setStudentName(res.detected_student_name);
      }
      setOcrQuality(res.ocr_quality_score);
      setOcrWarnings(res.warnings || []);
      setOcrPages(res.pages || []);
      notify(
        res.warnings?.length ? "info" : "success",
        res.warnings?.length
          ? "Text extracted with OCR warnings. Please review and correct below before grading."
          : "Document text extracted cleanly."
      );
    } catch (err: any) {
      notify("error", err.message || "OCR extraction failed.");
    } finally {
      e.target.value = "";
      setExtracting(false);
    }
  };

  const loadSampleAnswer = (variant: "good" | "uncertain") => {
    if (variant === "good") {
      setStudentName("Sample Student (Strong)");
      setStudentAnswer(
        "By Newton's second law, net force equals mass times acceleration (F = ma, in Newtons = kg * m/s^2) acting in the direction of the net force. When mass is constant and net force doubles, acceleration a = F/m also doubles."
      );
      setOcrQuality(null);
      setOcrWarnings([]);
    } else {
      setStudentName("Sample Student (Uncertain Scan)");
      setStudentAnswer(
        "Force makes objects move faster when pushed. [ILLEGIBLE] doubles when mass stays the same, maybe speed goes up too."
      );
      setOcrQuality(0.48);
      setOcrWarnings(["Low contrast handwritten scan; [ILLEGIBLE] segment detected."]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || !studentAnswer.trim()) {
      notify("error", "Question and student answer are required.");
      return;
    }
    setGrading(true);
    try {
      const selectedRubric = rubrics.find((r) => r._id === selectedRubricId);
      const criteriaPayload = selectedRubric
        ? undefined
        : customCriteria.filter((c) => c.title.trim());

      const computedMaxMarks = selectedRubric
        ? maxMarks
        : criteriaPayload && criteriaPayload.length > 0
        ? criteriaPayload.reduce((a, c) => a + Number(c.points || 0), 0)
        : maxMarks;

      const result = await apiRequest<{ _id: string }>("/grading/evaluate", {
        method: "POST",
        body: JSON.stringify({
          exam_id: selectedExamId || null,
          student_name: studentName || "Unnamed Student",
          subject,
          topic,
          question,
          max_marks: computedMaxMarks,
          expected_answer: expectedAnswer,
          subject_instructions: subjectInstructions,
          student_answer: studentAnswer,
          rubric_id: selectedRubricId || null,
          rubric_version: selectedRubric?.current_version ?? null,
          custom_criteria: criteriaPayload,
          ocr_quality_score: ocrQuality,
          ocr_warnings: ocrWarnings,
        }),
      });
      notify("success", "Evaluation completed with verified evidence and reliability analysis.");
      navigate(`/results/${result._id}`);
    } catch (err: any) {
      notify("error", err.message || "Grading failed.");
    } finally {
      setGrading(false);
    }
  };

  return (
    <AppShell title="Single Answer & OCR Grading Studio" breadcrumb="Workspace / Grade Answer">
      <form onSubmit={handleSubmit} className="grid lg:grid-cols-12 gap-6">
        {/* Left: Question & Rubric Configuration */}
        <div className="lg:col-span-6 space-y-5 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-900">1. Question & Marking Rubric</h2>
            <select
              aria-label="Load configured rubric"
              value={selectedRubricId}
              onChange={(e) => {
                const found = rubrics.find((r) => r._id === e.target.value);
                if (found) applyRubric(found);
                else setSelectedRubricId("");
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-white max-w-[240px]"
            >
              <option value="">Custom Ad-hoc Criteria</option>
              {rubrics.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name} (v{r.current_version})
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">Topic</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Kinematics"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Marks</label>
              <input
                type="number"
                min="1"
                step="0.5"
                required
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-mono tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Question Statement</label>
            <textarea
              required
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Enter the exact question posed to the student..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Expected / Reference Answer (Optional)
            </label>
            <textarea
              rows={2}
              value={expectedAnswer}
              onChange={(e) => setExpectedAnswer(e.target.value)}
              placeholder="Optional reference answer; alternative valid explanations remain accepted."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject / Partial-Credit Instructions</label>
            <input
              value={subjectInstructions}
              onChange={(e) => setSubjectInstructions(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
            />
          </div>

          {exams.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Link to Examination (Optional)</label>
              <select
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white"
              >
                <option value="">Standalone Evaluation (No Exam)</option>
                {exams.map((ex) => (
                  <option key={ex._id} value={ex._id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!selectedRubricId && (
            <div className="pt-3 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Custom Criteria (Total:{" "}
                  <span className="font-mono tabular-nums">
                    {customCriteria.reduce((a, c) => a + Number(c.points || 0), 0)}
                  </span>{" "}
                  marks)
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCustomCriteria((prev) => [
                      ...prev,
                      {
                        criterion_id: `c_custom_${prev.length + 1}`,
                        title: "",
                        description: "",
                        points: 1,
                      },
                    ])
                  }
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  + Add Criterion
                </button>
              </div>
              {customCriteria.map((c, idx) => (
                <div key={idx} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 grid sm:grid-cols-12 gap-2 items-center">
                  <input
                    required
                    value={c.title}
                    onChange={(e) =>
                      setCustomCriteria((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))
                    }
                    placeholder="Criterion title"
                    className="sm:col-span-5 px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                  />
                  <input
                    value={c.description}
                    onChange={(e) =>
                      setCustomCriteria((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                      )
                    }
                    placeholder="What earns credit"
                    className="sm:col-span-4 px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                  />
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={c.points}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const next = customCriteria.map((x, i) => (i === idx ? { ...x, points: val } : x));
                      setCustomCriteria(next);
                      setMaxMarks(next.reduce((a, x) => a + Number(x.points || 0), 0));
                    }}
                    className="sm:col-span-2 px-2 py-1 text-xs rounded border border-slate-300 bg-white font-mono tabular-nums"
                  />
                  {customCriteria.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = customCriteria.filter((_, i) => i !== idx);
                        setCustomCriteria(next);
                        setMaxMarks(next.reduce((a, x) => a + Number(x.points || 0), 0));
                      }}
                      className="sm:col-span-1 text-red-600 flex justify-center"
                      aria-label="Remove criterion"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Student Answer & OCR Extraction */}
        <div className="lg:col-span-6 space-y-5 bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">2. Student Submission & OCR</h2>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInputMode("digital")}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    inputMode === "digital" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  }`}
                >
                  Digital Text
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("upload")}
                  className={`px-3 py-1 rounded text-xs font-medium ${
                    inputMode === "upload" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                  }`}
                >
                  PDF / Handwritten Image
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Student Name / ID</label>
                <input
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g., Maya Lin"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
                />
              </div>
              <div className="flex items-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => loadSampleAnswer("good")}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  Load Clear Sample
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => loadSampleAnswer("uncertain")}
                  className="text-xs font-medium text-amber-700 hover:underline"
                >
                  Load Uncertain Sample
                </button>
              </div>
            </div>

            {inputMode === "upload" && (
              <div className="p-4 rounded-lg border border-dashed border-slate-300 bg-slate-50">
                <label className="flex flex-col items-center justify-center cursor-pointer text-center py-2">
                  <Upload className="w-5 h-5 text-blue-700 mb-1.5" />
                  <span className="text-xs font-semibold text-slate-800">
                    {extracting ? "Extracting text with multimodal OCR..." : "Upload PDF, PNG, JPG, WEBP, or TXT"}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    Handwritten scans are checked for legibility before grading.
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
                    onChange={handleFileUpload}
                    disabled={extracting}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {(ocrQuality !== null || ocrWarnings.length > 0) && (
              <div
                className={`p-3.5 rounded-lg border text-xs ${
                  (ocrQuality ?? 1) < 0.6
                    ? "bg-red-50 border-red-200 text-red-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    OCR Preview & Quality Check
                  </span>
                  {ocrQuality !== null && (
                    <span className="font-mono tabular-nums">Quality Score: {ocrQuality.toFixed(2)} / 1.00</span>
                  )}
                </div>
                {ocrWarnings.map((w, i) => (
                  <p key={i} className="mt-1">
                    • {w}
                  </p>
                ))}
                {ocrPages.length > 1 && (
                  <p className="mt-1 font-medium">
                    <FileText className="w-3.5 h-3.5 inline mr-1" />
                    Extracted {ocrPages.length} pages — verify transcription below before grading.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Student Answer Text (Editable OCR Verification)
              </label>
              <textarea
                required
                rows={7}
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                placeholder="Paste student answer or upload a PDF/image above to extract and verify text..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 font-sans"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-500">
              Evaluated server-side via Gemini · Evidence verified automatically
            </span>
            <button
              type="submit"
              disabled={grading || extracting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>{grading ? "Evaluating..." : "Grade with Evidence"}</span>
            </button>
          </div>
        </div>
      </form>
    </AppShell>
  );
}
