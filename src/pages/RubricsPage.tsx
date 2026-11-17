import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { BrandLoader } from "../components/BrandLoader";
import { apiRequest } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Rubric, RubricVersion, SUPPORTED_SUBJECTS } from "../types";
import { flowClasses, getCriterionJss } from "../styles/evaloraJss";
import { Plus, Copy, History, Edit3, Trash2, RefreshCw, ClipboardCheck } from "lucide-react";

interface DraftCriterion {
  criterion_id?: string;
  title: string;
  description: string;
  points: number;
  partial_credit_rules: string;
  levels: {
    excellent: string;
    good: string;
    partial: string;
    poor: string;
  };
}

const emptyCriterion = (): DraftCriterion => ({
  title: "",
  description: "",
  points: 2,
  partial_credit_rules: "Award proportional marks for valid intermediate steps or equivalent phrasing.",
  levels: {
    excellent: "Complete, conceptually accurate, and well justified.",
    good: "Accurate core concept with minor omissions.",
    partial: "Shows partial understanding with missing steps.",
    poor: "Incorrect or missing core concept.",
  },
});

export function RubricsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyModal, setHistoryModal] = useState<{ rubric: Rubric; versions: RubricVersion[] } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rubric | null>(null);
  const [examTarget, setExamTarget] = useState<Rubric | null>(null);
  const [examTitle, setExamTitle] = useState("");
  const [creatingExam, setCreatingExam] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [subject, setSubject] = useState<string>("Physics");
  const [topic, setTopic] = useState("");
  const [subjectInstructions, setSubjectInstructions] = useState(
    "Evaluate conceptual accuracy and accept valid alternative explanations."
  );
  const [isTemplate, setIsTemplate] = useState(false);
  const [questionText, setQuestionText] = useState("");
  const [expectedAnswer, setExpectedAnswer] = useState("");
  const [changeNote, setChangeNote] = useState("Updated rubric criteria");
  const [criteria, setCriteria] = useState<DraftCriterion[]>([emptyCriterion()]);
  const [saving, setSaving] = useState(false);

  const loadRubrics = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<Rubric[]>("/rubrics/mine");
      setRubrics(Array.isArray(data) ? data : []);
    } catch (err: any) {
      notify("error", err.message || "Failed to load rubrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRubrics();
  }, []);

  const resetBuilder = () => {
    setEditingId(null);
    setName("");
    setSubject("Physics");
    setTopic("");
    setSubjectInstructions("Evaluate conceptual accuracy and accept valid alternative explanations.");
    setIsTemplate(false);
    setQuestionText("");
    setExpectedAnswer("");
    setChangeNote("Initial rubric version");
    setCriteria([emptyCriterion()]);
    setShowBuilder(false);
  };

  const startEdit = (r: Rubric) => {
    const q = r.questions[0];
    setEditingId(r._id);
    setName(r.name);
    setSubject(r.subject || "Other");
    setTopic(r.topic || "");
    setSubjectInstructions(r.subject_instructions || "");
    setIsTemplate(Boolean(r.is_template));
    setQuestionText(q?.text || "");
    setExpectedAnswer(q?.expected_answer || "");
    setChangeNote(`Updated criteria (creating v${r.current_version + 1})`);
    setCriteria(
      (q?.criteria || [emptyCriterion()]).map((c) => ({
        criterion_id: c.criterion_id,
        title: c.title,
        description: c.description,
        points: c.points,
        partial_credit_rules: c.partial_credit_rules || "",
        levels: c.levels || emptyCriterion().levels,
      }))
    );
    setShowBuilder(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const totalPoints = criteria.reduce((acc, c) => acc + Number(c.points || 0), 0);
    const payload = {
      name,
      subject,
      topic,
      subject_instructions: subjectInstructions,
      is_template: isTemplate,
      change_note: changeNote,
      questions: [
        {
          text: questionText,
          max_marks: totalPoints,
          expected_answer: expectedAnswer,
          criteria,
        },
      ],
    };

    try {
      if (editingId) {
        await apiRequest(`/rubrics/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        notify("success", "New rubric version created. Previous grades remain traceable to their original version.");
      } else {
        await apiRequest("/rubrics/create", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        notify("success", "Rubric v1 created.");
      }
      resetBuilder();
      await loadRubrics();
    } catch (err: any) {
      notify("error", err.message || "Could not save rubric.");
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async (r: Rubric) => {
    try {
      await apiRequest(`/rubrics/${r._id}/duplicate`, { method: "POST" });
      notify("success", `Duplicated "${r.name}".`);
      await loadRubrics();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleViewHistory = async (r: Rubric) => {
    try {
      const data = await apiRequest<{ versions: RubricVersion[] }>(`/rubrics/${r._id}/versions`);
      setHistoryModal({ rubric: r, versions: data.versions || [] });
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiRequest(`/rubrics/${deleteTarget._id}`, { method: "DELETE" });
      notify("success", "Rubric deleted.");
      setDeleteTarget(null);
      await loadRubrics();
    } catch (err: any) {
      notify("error", err.message);
    }
  };

  const handleApplyToExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examTarget || !examTitle.trim()) return;
    setCreatingExam(true);
    try {
      const data = await apiRequest<{ exam: { _id: string; title: string } }>("/exams", {
        method: "POST",
        body: JSON.stringify({
          title: examTitle.trim(),
          subject: examTarget.subject,
          rubric_id: examTarget._id,
          rubric_version: examTarget.current_version,
        }),
      });
      notify("success", `Rubric v${examTarget.current_version} applied to "${data.exam.title}".`);
      setExamTarget(null);
      setExamTitle("");
      navigate(`/grade-exam?examId=${data.exam._id}&rubricId=${examTarget._id}`);
    } catch (err: any) {
      notify("error", err.message || "Could not create examination.");
    } finally {
      setCreatingExam(false);
    }
  };

  return (
    <AppShell title="Configurable Rubric Library & Versioning" breadcrumb="Workspace / Rubrics">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-sm text-slate-600">
            Create multi-criteria rubrics with 4-tier performance descriptors and partial-credit rules. Every edit creates an immutable new version.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetBuilder();
            setShowBuilder(true);
          }}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${flowClasses.primaryCtaButton}`}
        >
          <Plus className="w-4 h-4" />
          <span>New Rubric</span>
        </button>
      </div>

      {showBuilder && (
        <form onSubmit={handleSave} className={`${flowClasses.requirementsCard} p-6 mb-8 space-y-6`}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? "Edit Rubric (Creates New Immutable Version)" : "Create New Rubric (v1)"}
            </h2>
            <button type="button" onClick={resetBuilder} className="text-xs font-medium text-slate-500 hover:text-slate-800">
              Cancel
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Rubric Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Thermodynamics First Law"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
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
                placeholder="e.g., Conservation of Energy"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Question Prompt</label>
              <textarea
                required
                rows={3}
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                placeholder="Enter the examination question..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Expected / Reference Answer (Optional)</label>
              <textarea
                rows={3}
                value={expectedAnswer}
                onChange={(e) => setExpectedAnswer(e.target.value)}
                placeholder="Optional reference answer; valid conceptual alternatives remain accepted..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Subject-Specific Grading Instructions</label>
              <input
                value={subjectInstructions}
                onChange={(e) => setSubjectInstructions(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Version Change Note</label>
              <input
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                Marking Criteria (Total Marks:{" "}
                <span className="font-mono tabular-nums">
                  {criteria.reduce((a, c) => a + Number(c.points || 0), 0)}
                </span>
                )
              </h3>
              <button
                type="button"
                onClick={() => setCriteria((prev) => [...prev, emptyCriterion()])}
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                + Add Criterion
              </button>
            </div>

            {criteria.map((c, idx) => (
              <div key={idx} className="p-4 rounded-lg border border-slate-200 bg-slate-50/70 space-y-3">
                <div className="grid sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Criterion Title</label>
                    <input
                      required
                      value={c.title}
                      onChange={(e) =>
                        setCriteria((prev) => prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)))
                      }
                      placeholder="e.g., Core Formula"
                      className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 bg-white"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Max Marks</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      required
                      value={c.points}
                      onChange={(e) =>
                        setCriteria((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, points: Number(e.target.value) } : x))
                        )
                      }
                      className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 bg-white font-mono tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-5 flex items-end justify-between gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Partial Credit Rule</label>
                      <input
                        value={c.partial_credit_rules}
                        onChange={(e) =>
                          setCriteria((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, partial_credit_rules: e.target.value } : x))
                          )
                        }
                        className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 bg-white"
                      />
                    </div>
                    {criteria.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        aria-label="Remove criterion"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Criterion Description</label>
                  <input
                    required
                    value={c.description}
                    onChange={(e) =>
                      setCriteria((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x))
                      )
                    }
                    placeholder="What conceptual understanding earns full credit?"
                    className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 bg-white"
                  />
                </div>

                <div className="grid sm:grid-cols-4 gap-2">
                  {(["excellent", "good", "partial", "poor"] as const).map((lvl) => (
                    <div key={lvl}>
                      <label className="block text-[11px] font-medium text-slate-500 capitalize mb-0.5">
                        {lvl} Level
                      </label>
                      <input
                        value={c.levels[lvl]}
                        onChange={(e) =>
                          setCriteria((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, levels: { ...x.levels, [lvl]: e.target.value } } : x
                            )
                          )
                        }
                        className="w-full px-2.5 py-1 text-xs rounded border border-slate-300 bg-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={isTemplate}
                onChange={(e) => setIsTemplate(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span>Save as reusable template</span>
            </label>

            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-lg bg-blue-700 text-white text-sm font-semibold hover:bg-blue-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : editingId ? "Save New Version" : "Create Rubric"}
            </button>
          </div>
        </form>
      )}

      {/* Rubrics List */}
      {loading ? (
        <BrandLoader label="Loading rubrics..." />
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {rubrics.map((r) => {
            const totalPts = r.questions.reduce((acc, q) => acc + Number(q.max_marks || 0), 0);
            const canEdit = Boolean(user && (r.owner_id === user.id || r.creator === user.email));
            return (
              <div key={r._id} className={`${flowClasses.requirementsCard} p-6 flex flex-col justify-between`}>
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="font-semibold text-[#1D4ED8]">{r.subject}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">v{r.current_version}</span>
                        <span>·</span>
                        <span className="font-mono tabular-nums">{totalPts} marks</span>
                        {r.is_template && (
                          <>
                            <span>·</span>
                            <span>Template</span>
                          </>
                        )}
                      </div>
                      <h3 className="mt-1 text-base font-bold text-slate-900">{r.name}</h3>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600 line-clamp-2">{r.questions[0]?.text}</p>
                  <p className="mt-2 text-xs text-slate-500 italic">{r.subject_instructions}</p>

                  <div className="mt-4 space-y-1.5 border-t border-blue-100 pt-3">
                    {r.questions[0]?.criteria.map((c, idx) => {
                      const jssCrit = getCriterionJss(idx);
                      return (
                        <div key={c.criterion_id} className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 truncate pr-2 inline-flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-sm shrink-0 ${jssCrit.reqSwatch}`} aria-hidden="true" />
                            <span className="truncate">{c.title}</span>
                          </span>
                          <span className="font-mono tabular-nums text-slate-500 shrink-0">{c.points} pts</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => startEdit(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit (New Version)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDuplicate(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate to Edit</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleViewHistory(r)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>History</span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleDuplicate(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Duplicate</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setExamTarget(r);
                      setExamTitle(`${r.subject} Assessment — ${r.name}`);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    <span>Apply to Exam</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/regrade?rubricId=${r._id}`)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-800 hover:bg-blue-100"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regrade</span>
                  </button>
                  {canEdit && !r.is_demo && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(r)}
                      className="ml-auto p-1.5 rounded text-slate-400 hover:text-red-600"
                      aria-label="Delete rubric"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Version History Modal */}
      {historyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{historyModal.rubric.name} — Version History</h3>
                <p className="text-xs text-slate-500">Previous evaluations remain permanently linked to their original version.</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-4">
              {historyModal.versions.map((v) => (
                <div key={v._id} className="p-4 rounded-lg border border-slate-200 bg-slate-50/60">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">Version v{v.version}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(v.created_at).toLocaleString()} · {v.created_by}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-blue-800">{v.change_note}</p>
                  <div className="mt-2 space-y-1">
                    {v.questions[0]?.criteria.map((c) => (
                      <div key={c.criterion_id} className="text-xs text-slate-600 flex justify-between">
                        <span>• {c.title}: {c.description}</span>
                        <span className="font-mono tabular-nums shrink-0 ml-2">{c.points} pts</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-slate-900">Delete Rubric?</h3>
            <p className="mt-2 text-sm text-slate-600">
              Delete "{deleteTarget.name}"? Existing grading history records remain intact, but new evaluations cannot reference this rubric.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
              >
                Delete Rubric
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Apply Rubric to Examination Modal */}
      {examTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <form onSubmit={handleApplyToExam} className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Apply Rubric to Examination</h3>
            <p className="text-xs text-slate-600">
              Links <strong>{examTarget.name}</strong> (v{examTarget.current_version}) to a new examination so all graded answers stay grouped for cohort review and bulk regrading.
            </p>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Examination Title</label>
              <input
                required
                value={examTitle}
                onChange={(e) => setExamTitle(e.target.value)}
                placeholder="e.g., Physics Quiz 2 — Section A"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300"
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setExamTarget(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingExam}
                className="px-4 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60"
              >
                {creatingExam ? "Creating..." : "Create Exam & Grade"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
