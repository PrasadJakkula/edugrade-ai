import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import multer from "multer";
import { build as viteBuild, createServer as createViteServer } from "vite";

import {
  AuthedRequest,
  createAccessToken,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "./server/auth.ts";
import {
  computeAgreementMetrics,
  computeRubricDiff,
  computeScoreDeltas,
  fitSafeCalibrationOffset,
  parseDatasetContent,
  splitDatasetLeakageSafe,
} from "./server/engines.ts";
import { runGeminiGrading, runGeminiOcrExtraction } from "./server/gemini.ts";
import { loadDB, newId, saveDB } from "./server/store.ts";

const execFileAsync = promisify(execFile);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const ALLOWED_OCR_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"]);
const ALLOWED_DATASET_EXT = new Set([".csv", ".json"]);

function logAudit(
  ownerId: string,
  userEmail: string,
  action: string,
  resourceType: string,
  resourceId: string,
  details: Record<string, any> = {}
) {
  const db = loadDB();
  db.audit_logs.unshift({
    _id: newId("audit"),
    action,
    owner_id: ownerId,
    user_email: userEmail,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
    timestamp: new Date().toISOString(),
  });
  if (db.audit_logs.length > 500) db.audit_logs.length = 500;
  saveDB(db);
}

function normalizeRubricQuestions(questions: any[]) {
  return (questions || []).map((q, qIdx) => {
    const qId = q.question_id || `q_${qIdx + 1}_${newId("id").slice(-6)}`;
    let totalPts = 0;
    const criteria = (q.criteria || []).map((c: any, cIdx: number) => {
      const pts = Number(c.points || 0);
      totalPts += pts;
      return {
        criterion_id: c.criterion_id || `c_${qIdx + 1}_${cIdx + 1}_${newId("id").slice(-6)}`,
        title: String(c.title || `Criterion ${cIdx + 1}`).trim(),
        description: String(c.description || "").trim(),
        points: pts,
        partial_credit_rules: String(c.partial_credit_rules || "Award proportional marks for valid intermediate steps."),
        levels: {
          excellent: c.levels?.excellent || "Complete, conceptually accurate, and clearly reasoned.",
          good: c.levels?.good || "Mostly accurate with minor omissions.",
          partial: c.levels?.partial || "Demonstrates partial understanding with key gaps.",
          poor: c.levels?.poor || "Incorrect, off-topic, or missing core concepts.",
        },
      };
    });
    return {
      question_id: qId,
      text: String(q.text || "").trim(),
      max_marks: Number(q.max_marks || totalPts || 10),
      expected_answer: String(q.expected_answer || "").trim(),
      criteria,
    };
  });
}

async function processBatchJobInBackground(jobId: string, ownerId: string) {
  const db = loadDB();
  const job = db.batch_jobs.find((j) => j._id === jobId && j.owner_id === ownerId);
  if (!job) return;

  job.status = "running";
  job.updated_at = new Date().toISOString();
  saveDB(db);

  const rubricSnap = job.rubric_id
    ? db.rubric_versions.find(
        (rv) => rv.rubric_id === job.rubric_id && (job.rubric_version ? rv.version === job.rubric_version : true)
      ) ||
      db.rubric_versions
        .filter((rv) => rv.rubric_id === job.rubric_id)
        .sort((a, b) => b.version - a.version)[0]
    : null;

  const criteria = rubricSnap
    ? rubricSnap.questions.flatMap((q: any) => q.criteria || [])
    : job.custom_criteria || [];

  let completed = 0;
  let failed = 0;

  for (let i = 0; i < job.items.length; i++) {
    const item = job.items[i];
    if (item.status === "completed") {
      completed += 1;
      continue;
    }
    try {
      const graded = await runGeminiGrading({
        subject: job.subject || "Other",
        topic: job.topic || "",
        question: job.question,
        max_marks: Number(job.max_marks || 10),
        expected_answer: job.expected_answer || "",
        subject_instructions: rubricSnap?.subject_instructions || "",
        criteria,
        student_answer: item.student_answer,
        ocr_quality_score: item.ocr_quality_score ?? null,
        ocr_warnings: item.ocr_warnings || [],
      });

      const now = new Date().toISOString();
      const resultId = newId("res");
      const resultRecord = {
        _id: resultId,
        is_demo: false,
        owner_id: ownerId,
        exam_id: job.exam_id || null,
        batch_job_id: jobId,
        student_name: item.student_name,
        subject: job.subject || "Other",
        topic: job.topic || "",
        question: job.question,
        expected_answer: job.expected_answer || "",
        student_answer: item.student_answer,
        max_marks: Number(job.max_marks || 10),
        rubric_id: job.rubric_id || null,
        rubric_version: rubricSnap?.version ?? null,
        rubric_name: rubricSnap?.name || "Custom Criteria",
        criteria_snapshot: criteria,
        grading: graded.grading,
        ai_original_score: graded.grading.final_marks,
        final_score: graded.grading.final_marks,
        evidence_summary: graded.evidence_summary,
        reliability: graded.reliability,
        provider_used: graded.provider_used,
        teacher_override: null,
        status: graded.reliability.teacher_review_required ? "needs_review" : "pending_approval",
        created_at: now,
        updated_at: now,
      };

      const freshDb = loadDB();
      freshDb.grading_results.unshift(resultRecord);
      freshDb.grading_history.unshift({
        _id: newId("hist"),
        result_id: resultId,
        owner_id: ownerId,
        event_type: "initial_grade",
        rubric_id: resultRecord.rubric_id,
        rubric_version: resultRecord.rubric_version,
        score: resultRecord.final_score,
        max_marks: resultRecord.max_marks,
        grading_snapshot: resultRecord.grading,
        reliability_snapshot: resultRecord.reliability,
        created_at: now,
      });

      const liveJob = freshDb.batch_jobs.find((j) => j._id === jobId);
      if (liveJob) {
        liveJob.items[i] = {
          ...liveJob.items[i],
          status: "completed",
          result_id: resultId,
          score: resultRecord.final_score,
          reliability_status: resultRecord.reliability.status,
          error: null,
        };
        completed += 1;
        liveJob.completed_count = completed;
        liveJob.failed_count = failed;
        liveJob.updated_at = now;
        saveDB(freshDb);
      }
    } catch (err: any) {
      const freshDb = loadDB();
      const liveJob = freshDb.batch_jobs.find((j) => j._id === jobId);
      if (liveJob) {
        liveJob.items[i] = {
          ...liveJob.items[i],
          status: "failed",
          error: err?.message || "Grading failed",
        };
        failed += 1;
        liveJob.completed_count = completed;
        liveJob.failed_count = failed;
        liveJob.updated_at = new Date().toISOString();
        saveDB(freshDb);
      }
    }
  }

  const finalDb = loadDB();
  const finalJob = finalDb.batch_jobs.find((j) => j._id === jobId);
  if (finalJob) {
    finalJob.status = failed > 0 ? "completed_with_errors" : "completed";
    finalJob.updated_at = new Date().toISOString();
    saveDB(finalDb);
  }
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Health
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", has_gemini_key: Boolean(process.env.GEMINI_API_KEY) });
  });

  // ==================== AUTH & USERS ====================
  app.post("/api/users/register", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const name = String(req.body?.name || "").trim();
    const password = String(req.body?.password || "");

    if (!email || !email.includes("@")) {
      res.status(400).json({ detail: "Valid email address is required." });
      return;
    }
    if (!name) {
      res.status(400).json({ detail: "Full name is required." });
      return;
    }
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      res.status(400).json({ detail: "Password must be at least 8 characters and include a letter and a number." });
      return;
    }

    const db = loadDB();
    if (db.users.some((u) => u.email === email)) {
      res.status(400).json({ detail: "Email is already registered." });
      return;
    }
    const id = newId("usr");
    const user = {
      _id: id,
      name,
      email,
      password_hash: hashPassword(password),
      role: "teacher",
      created_at: new Date().toISOString(),
    };
    db.users.push(user);
    saveDB(db);
    logAudit(id, email, "user.register", "user", id);
    res.json({ message: "Account created successfully", id });
  });

  app.post("/api/users/login", (req, res) => {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const db = loadDB();
    const user = db.users.find((u) => u.email === email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ detail: "Invalid email or password." });
      return;
    }
    const authUser = { id: user._id, email: user.email, name: user.name, role: user.role || "teacher" };
    const token = createAccessToken(authUser);
    logAudit(user._id, user.email, "user.login", "user", user._id);
    res.json({ access_token: token, token_type: "bearer", user: authUser });
  });

  app.post("/api/users/demo-login", (_req, res) => {
    const db = loadDB();
    const demoUser = db.users.find((u) => u._id === "demo-teacher-001") || db.users[0];
    if (!demoUser) {
      res.status(404).json({ detail: "Demo user unavailable" });
      return;
    }
    const authUser = { id: demoUser._id, email: demoUser.email, name: demoUser.name, role: demoUser.role || "teacher" };
    const token = createAccessToken(authUser);
    logAudit(demoUser._id, demoUser.email, "user.demo_login", "user", demoUser._id);
    res.json({ access_token: token, token_type: "bearer", user: authUser });
  });

  app.get("/api/users/me", requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: req.user });
  });

  app.get("/api/users/audit-logs", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const logs = db.audit_logs.filter((l) => l.owner_id === req.user!.id).slice(0, 100);
    res.json({ logs });
  });

  // ==================== RUBRICS & VERSIONING ====================
  app.get("/api/rubrics/mine", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const list = db.rubrics.filter(
      (r) => r.owner_id === req.user!.id || r.creator === req.user!.email || r.is_template
    );
    res.json(list);
  });

  app.get("/api/rubrics/get/:id", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const r = db.rubrics.find((x) => x._id === req.params.id);
    if (!r || (r.owner_id !== req.user!.id && r.creator !== req.user!.email && !r.is_template)) {
      res.status(404).json({ detail: "Rubric not found" });
      return;
    }
    res.json(r);
  });

  app.post("/api/rubrics/create", requireAuth, (req: AuthedRequest, res) => {
    const body = req.body || {};
    if (!body.name || !Array.isArray(body.questions) || body.questions.length === 0) {
      res.status(400).json({ detail: "Rubric name and at least one question are required." });
      return;
    }
    const now = new Date().toISOString();
    const rubricId = newId("rubric");
    const questions = normalizeRubricQuestions(body.questions);
    const rubric = {
      _id: rubricId,
      name: String(body.name).trim(),
      subject: String(body.subject || "Other"),
      topic: String(body.topic || ""),
      subject_instructions: String(body.subject_instructions || "Evaluate conceptual understanding and accept valid equivalents."),
      partial_credit_policy: String(body.partial_credit_policy || "proportional"),
      is_template: Boolean(body.is_template),
      is_demo: false,
      owner_id: req.user!.id,
      creator: req.user!.email,
      current_version: 1,
      questions,
      created_at: now,
      updated_at: now,
    };
    const versionSnap = {
      _id: newId("rv"),
      rubric_id: rubricId,
      version: 1,
      name: rubric.name,
      subject: rubric.subject,
      topic: rubric.topic,
      subject_instructions: rubric.subject_instructions,
      partial_credit_policy: rubric.partial_credit_policy,
      questions,
      change_note: String(body.change_note || "Initial rubric version (v1)"),
      created_by: req.user!.email,
      created_at: now,
    };
    const db = loadDB();
    db.rubrics.unshift(rubric);
    db.rubric_versions.unshift(versionSnap);
    saveDB(db);
    logAudit(req.user!.id, req.user!.email, "rubric.create", "rubric", rubricId, { version: 1 });
    res.json({ message: "Rubric created", id: rubricId, rubric });
  });

  app.put("/api/rubrics/:id", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const rubric = db.rubrics.find((x) => x._id === req.params.id);
    if (!rubric || (rubric.owner_id !== req.user!.id && rubric.creator !== req.user!.email)) {
      res.status(404).json({ detail: "Rubric not found or you do not have edit permission." });
      return;
    }
    const body = req.body || {};
    const nextVersion = Number(rubric.current_version || 1) + 1;
    const now = new Date().toISOString();
    const questions = body.questions ? normalizeRubricQuestions(body.questions) : rubric.questions;

    rubric.name = body.name ? String(body.name).trim() : rubric.name;
    rubric.subject = body.subject || rubric.subject;
    rubric.topic = body.topic !== undefined ? String(body.topic) : rubric.topic;
    rubric.subject_instructions = body.subject_instructions !== undefined ? String(body.subject_instructions) : rubric.subject_instructions;
    rubric.partial_credit_policy = body.partial_credit_policy || rubric.partial_credit_policy;
    if (body.is_template !== undefined) rubric.is_template = Boolean(body.is_template);
    rubric.questions = questions;
    rubric.current_version = nextVersion;
    rubric.updated_at = now;

    const versionSnap = {
      _id: newId("rv"),
      rubric_id: rubric._id,
      version: nextVersion,
      name: rubric.name,
      subject: rubric.subject,
      topic: rubric.topic,
      subject_instructions: rubric.subject_instructions,
      partial_credit_policy: rubric.partial_credit_policy,
      questions,
      change_note: String(body.change_note || `Updated to v${nextVersion}`),
      created_by: req.user!.email,
      created_at: now,
    };
    db.rubric_versions.unshift(versionSnap);
    saveDB(db);
    logAudit(req.user!.id, req.user!.email, "rubric.version_created", "rubric", rubric._id, { version: nextVersion });
    res.json({ message: "Rubric updated with new version", rubric });
  });

  app.post("/api/rubrics/:id/duplicate", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const src = db.rubrics.find((x) => x._id === req.params.id);
    if (!src || (src.owner_id !== req.user!.id && src.creator !== req.user!.email && !src.is_template)) {
      res.status(404).json({ detail: "Rubric not found" });
      return;
    }
    const now = new Date().toISOString();
    const rubricId = newId("rubric");
    const questions = normalizeRubricQuestions(src.questions);
    const clone = {
      _id: rubricId,
      name: `${src.name} (Copy)`,
      subject: src.subject,
      topic: src.topic,
      subject_instructions: src.subject_instructions,
      partial_credit_policy: src.partial_credit_policy,
      is_template: false,
      is_demo: false,
      owner_id: req.user!.id,
      creator: req.user!.email,
      current_version: 1,
      questions,
      created_at: now,
      updated_at: now,
    };
    db.rubrics.unshift(clone);
    db.rubric_versions.unshift({
      ...clone,
      _id: newId("rv"),
      rubric_id: rubricId,
      version: 1,
      change_note: `Duplicated from ${src.name} (v${src.current_version})`,
      created_by: req.user!.email,
    });
    saveDB(db);
    logAudit(req.user!.id, req.user!.email, "rubric.duplicate", "rubric", rubricId, { source: src._id });
    res.json({ message: "Rubric duplicated", rubric: clone });
  });

  app.get("/api/rubrics/:id/versions", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const r = db.rubrics.find((x) => x._id === req.params.id);
    if (!r || (r.owner_id !== req.user!.id && r.creator !== req.user!.email && !r.is_template)) {
      res.status(404).json({ detail: "Rubric not found" });
      return;
    }
    const versions = db.rubric_versions
      .filter((rv) => rv.rubric_id === req.params.id)
      .sort((a, b) => b.version - a.version);
    res.json({ rubric_id: req.params.id, versions });
  });

  app.delete("/api/rubrics/:id", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const idx = db.rubrics.findIndex((x) => x._id === req.params.id && (x.owner_id === req.user!.id || x.creator === req.user!.email));
    if (idx === -1) {
      res.status(404).json({ detail: "Rubric not found or cannot be deleted." });
      return;
    }
    db.rubrics.splice(idx, 1);
    saveDB(db);
    logAudit(req.user!.id, req.user!.email, "rubric.delete", "rubric", req.params.id);
    res.json({ message: "Rubric deleted" });
  });

  // ==================== EXAMS ====================
  app.get("/api/exams", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const exams = db.exams.filter((e) => e.owner_id === req.user!.id);
    res.json({ exams });
  });

  app.post("/api/exams", requireAuth, (req: AuthedRequest, res) => {
    const title = String(req.body?.title || "").trim();
    if (!title) {
      res.status(400).json({ detail: "Examination title is required." });
      return;
    }
    const db = loadDB();
    let rubricId: string | null = req.body?.rubric_id || null;
    let rubricVersion: number | null = req.body?.rubric_version ? Number(req.body.rubric_version) : null;
    if (rubricId) {
      const rubric = db.rubrics.find((r) => r._id === rubricId);
      if (!rubric || (rubric.owner_id !== req.user!.id && rubric.creator !== req.user!.email && !rubric.is_template)) {
        res.status(404).json({ detail: "Rubric not found or inaccessible." });
        return;
      }
      if (!rubricVersion) rubricVersion = rubric.current_version;
    }
    const exam = {
      _id: newId("exam"),
      is_demo: false,
      owner_id: req.user!.id,
      title,
      subject: String(req.body?.subject || "Other"),
      rubric_id: rubricId,
      rubric_version: rubricVersion,
      created_at: new Date().toISOString(),
    };
    db.exams.unshift(exam);
    saveDB(db);
    logAudit(req.user!.id, req.user!.email, "exam.create", "exam", exam._id, { rubric_id: rubricId, rubric_version: rubricVersion });
    res.json({ exam });
  });

  // ==================== OCR & MULTIMODAL EXTRACTION ====================
  app.post("/api/grading/ocr-extract", requireAuth, upload.single("file"), async (req: AuthedRequest, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ detail: "No file uploaded." });
        return;
      }
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (!ALLOWED_OCR_EXT.has(ext)) {
        res.status(400).json({ detail: `Unsupported file type '${ext}'. Allowed: .pdf, .png, .jpg, .jpeg, .webp, .txt` });
        return;
      }
      if (ext === ".pdf" && !file.buffer.subarray(0, 4).toString("ascii").startsWith("%PDF")) {
        res.status(400).json({ detail: "Invalid PDF file header." });
        return;
      }
      const mimeMap: Record<string, string> = {
        ".pdf": "application/pdf",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".txt": "text/plain",
      };
      const result = await runGeminiOcrExtraction({
        buffer: file.buffer,
        mimeType: mimeMap[ext] || file.mimetype || "application/octet-stream",
        filename: path.basename(file.originalname),
      });
      res.json(result);
    } catch (err: any) {
      res.status(502).json({ detail: err?.message || "Document extraction failed." });
    }
  });

  // ==================== AI GRADING, OVERRIDES & INSTANT REGRADING ====================
  app.post("/api/grading/evaluate", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const body = req.body || {};
      const db = loadDB();
      if (body.exam_id) {
        const exam = db.exams.find((e) => e._id === body.exam_id && e.owner_id === req.user!.id);
        if (!exam) {
          res.status(404).json({ detail: "Examination not found." });
          return;
        }
      }
      let criteria = Array.isArray(body.custom_criteria) ? body.custom_criteria : [];
      let subjectInstructions = String(body.subject_instructions || "");
      let rubricVersionUsed: number | null = body.rubric_version ?? null;
      let rubricName = "Custom Criteria";

      if (body.rubric_id) {
        const rubric = db.rubrics.find((r) => r._id === body.rubric_id);
        if (!rubric || (rubric.owner_id !== req.user!.id && rubric.creator !== req.user!.email && !rubric.is_template)) {
          res.status(404).json({ detail: "Rubric not found" });
          return;
        }
        const snap =
          db.rubric_versions.find(
            (rv) => rv.rubric_id === body.rubric_id && (rubricVersionUsed ? rv.version === Number(rubricVersionUsed) : rv.version === rubric.current_version)
          ) ||
          db.rubric_versions.filter((rv) => rv.rubric_id === body.rubric_id).sort((a, b) => b.version - a.version)[0];
        if (!snap) {
          res.status(404).json({ detail: "Rubric version snapshot not found" });
          return;
        }
        rubricVersionUsed = snap.version;
        rubricName = snap.name;
        subjectInstructions = subjectInstructions || snap.subject_instructions || "";
        criteria = snap.questions.flatMap((q: any) => q.criteria || []);
      }

      if (!String(body.question || "").trim()) {
        res.status(400).json({ detail: "Question statement is required." });
        return;
      }
      if (!String(body.student_answer || "").trim()) {
        res.status(400).json({ detail: "Student answer text is required." });
        return;
      }

      const maxMarks = Number(body.max_marks || criteria.reduce((a: number, c: any) => a + Number(c.points || 0), 0) || 10);
      const graded = await runGeminiGrading({
        subject: String(body.subject || "Other"),
        topic: String(body.topic || ""),
        question: String(body.question || ""),
        max_marks: maxMarks,
        expected_answer: String(body.expected_answer || ""),
        subject_instructions: subjectInstructions,
        criteria,
        student_answer: String(body.student_answer || ""),
        ocr_quality_score: body.ocr_quality_score !== undefined && body.ocr_quality_score !== null ? Number(body.ocr_quality_score) : null,
        ocr_warnings: Array.isArray(body.ocr_warnings) ? body.ocr_warnings : [],
        calibration_offset: Number(body.calibration_offset || 0),
      });

      const now = new Date().toISOString();
      const resultId = newId("res");
      const record = {
        _id: resultId,
        is_demo: false,
        owner_id: req.user!.id,
        exam_id: body.exam_id || null,
        student_name: String(body.student_name || "Unnamed Student").trim(),
        subject: String(body.subject || "Other"),
        topic: String(body.topic || ""),
        question: String(body.question || ""),
        expected_answer: String(body.expected_answer || ""),
        student_answer: String(body.student_answer || ""),
        max_marks: maxMarks,
        rubric_id: body.rubric_id || null,
        rubric_version: rubricVersionUsed,
        rubric_name: rubricName,
        criteria_snapshot: criteria,
        grading: graded.grading,
        ai_original_score: graded.grading.final_marks,
        final_score: graded.grading.final_marks,
        evidence_summary: graded.evidence_summary,
        reliability: graded.reliability,
        provider_used: graded.provider_used,
        teacher_override: null,
        status: graded.reliability.teacher_review_required ? "needs_review" : "pending_approval",
        created_at: now,
        updated_at: now,
      };

      const freshDb = loadDB();
      freshDb.grading_results.unshift(record);
      freshDb.grading_history.unshift({
        _id: newId("hist"),
        result_id: resultId,
        owner_id: req.user!.id,
        event_type: "initial_grade",
        rubric_id: record.rubric_id,
        rubric_version: record.rubric_version,
        score: record.final_score,
        max_marks: maxMarks,
        grading_snapshot: record.grading,
        reliability_snapshot: record.reliability,
        created_at: now,
      });
      saveDB(freshDb);
      logAudit(req.user!.id, req.user!.email, "grading.evaluate", "grading_result", resultId, {
        rubric_id: record.rubric_id,
        rubric_version: record.rubric_version,
        reliability: record.reliability.status,
      });

      res.json(record);
    } catch (err: any) {
      res.status(502).json({ detail: err?.message || "AI grading request failed." });
    }
  });

  app.get("/api/grading/results", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const results = db.grading_results.filter((r) => r.owner_id === req.user!.id);
    res.json({ results });
  });

  app.get("/api/grading/results/:id", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const result = db.grading_results.find((r) => r._id === req.params.id && r.owner_id === req.user!.id);
    if (!result) {
      res.status(404).json({ detail: "Grading result not found" });
      return;
    }
    const history = db.grading_history.filter((h) => h.result_id === result._id);
    res.json({ result, history });
  });

  app.post("/api/grading/results/:id/override", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const result = db.grading_results.find((r) => r._id === req.params.id && r.owner_id === req.user!.id);
    if (!result) {
      res.status(404).json({ detail: "Grading result not found" });
      return;
    }
    const finalMarks = Number(req.body?.final_marks);
    const reason = String(req.body?.override_reason || "").trim();
    if (Number.isNaN(finalMarks) || finalMarks < 0 || finalMarks > Number(result.max_marks)) {
      res.status(400).json({ detail: `Score must be between 0 and ${result.max_marks}.` });
      return;
    }
    if (reason.length < 3) {
      res.status(400).json({ detail: "Please provide a clear reason for approval/override." });
      return;
    }
    const now = new Date().toISOString();
    const previousScore = result.final_score;
    const updatedGrading = {
      ...result.grading,
      final_marks: finalMarks,
      criterion_evaluations: req.body?.criterion_evaluations || result.grading.criterion_evaluations,
      general_feedback: req.body?.general_feedback ?? result.grading.general_feedback,
    };

    result.grading = updatedGrading;
    result.final_score = finalMarks;
    result.teacher_override = {
      overridden_by: req.user!.email,
      previous_score: previousScore,
      new_score: finalMarks,
      reason,
      timestamp: now,
    };
    result.status = req.body?.approve_result === false ? "overridden" : "approved";
    result.updated_at = now;

    db.grading_history.unshift({
      _id: newId("hist"),
      result_id: result._id,
      owner_id: req.user!.id,
      event_type: "teacher_override",
      rubric_id: result.rubric_id,
      rubric_version: result.rubric_version,
      previous_score: previousScore,
      score: finalMarks,
      reason,
      created_at: now,
    });
    saveDB(db);
    logAudit(req.user!.id, req.user!.email, "grading.override", "grading_result", result._id, {
      previous_score: previousScore,
      new_score: finalMarks,
    });
    res.json(result);
  });

  app.post("/api/grading/regrade", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const db = loadDB();
      const { rubric_id, target_version, result_ids, exam_id, confirm_bulk, reason } = req.body || {};
      const rubric = db.rubrics.find((r) => r._id === rubric_id);
      if (!rubric || (rubric.owner_id !== req.user!.id && rubric.creator !== req.user!.email && !rubric.is_template)) {
        res.status(404).json({ detail: "Rubric not found" });
        return;
      }
      const targetSnap =
        db.rubric_versions.find(
          (rv) => rv.rubric_id === rubric_id && (target_version ? rv.version === Number(target_version) : rv.version === rubric.current_version)
        ) ||
        db.rubric_versions.filter((rv) => rv.rubric_id === rubric_id).sort((a, b) => b.version - a.version)[0];
      if (!targetSnap) {
        res.status(404).json({ detail: "Target rubric version not found" });
        return;
      }

      let targets = db.grading_results.filter((r) => r.owner_id === req.user!.id);
      if (Array.isArray(result_ids) && result_ids.length > 0) {
        const idSet = new Set(result_ids);
        targets = targets.filter((r) => idSet.has(r._id));
      } else if (exam_id) {
        targets = targets.filter((r) => r.exam_id === exam_id);
      } else {
        targets = targets.filter((r) => r.rubric_id === rubric_id);
      }

      if (targets.length === 0) {
        res.status(404).json({ detail: "No matching grading results found to regrade." });
        return;
      }
      if (targets.length > 1 && !confirm_bulk) {
        res.status(400).json({ detail: "Bulk regrading multiple answers requires explicit confirmation (confirm_bulk: true)." });
        return;
      }

      const newCriteria = targetSnap.questions.flatMap((q: any) => q.criteria || []);
      const newMaxMarks = newCriteria.reduce((acc: number, c: any) => acc + Number(c.points || 0), 0) || Number(targets[0].max_marks);
      const comparisons: any[] = [];
      const now = new Date().toISOString();

      for (const doc of targets) {
        const oldVersion = doc.rubric_version;
        const oldSnap = doc.rubric_id
          ? db.rubric_versions.find((rv) => rv.rubric_id === doc.rubric_id && rv.version === oldVersion)
          : { version: 0, questions: [{ criteria: doc.criteria_snapshot || [] }] };
        const rubricDiff = computeRubricDiff(oldSnap || { version: 0, questions: [] }, targetSnap);

        const reEval = await runGeminiGrading({
          subject: doc.subject || targetSnap.subject || "Other",
          topic: doc.topic || targetSnap.topic || "",
          question: doc.question,
          max_marks: newMaxMarks,
          expected_answer: doc.expected_answer || "",
          subject_instructions: targetSnap.subject_instructions || "",
          criteria: newCriteria,
          student_answer: doc.student_answer,
          ocr_quality_score: doc.reliability?.signals?.ocr_quality_score ?? null,
          ocr_warnings: [],
        });

        const scoreDeltaReport = computeScoreDeltas(doc.grading, reEval.grading);
        const freshDb = loadDB();
        const liveDoc = freshDb.grading_results.find((r) => r._id === doc._id);
        if (liveDoc) {
          freshDb.grading_history.unshift({
            _id: newId("hist"),
            result_id: doc._id,
            owner_id: req.user!.id,
            event_type: "regrade",
            old_rubric_version: oldVersion,
            new_rubric_version: targetSnap.version,
            old_score: doc.final_score,
            new_score: reEval.grading.final_marks,
            score_delta_report: scoreDeltaReport,
            rubric_diff: rubricDiff,
            reason: String(reason || "Rubric updated"),
            previous_grading_snapshot: doc.grading,
            previous_teacher_override: doc.teacher_override || null,
            new_grading_snapshot: reEval.grading,
            created_at: now,
          });

          liveDoc.rubric_id = rubric_id;
          liveDoc.rubric_version = targetSnap.version;
          liveDoc.rubric_name = targetSnap.name;
          liveDoc.max_marks = newMaxMarks;
          liveDoc.criteria_snapshot = newCriteria;
          liveDoc.grading = reEval.grading;
          liveDoc.ai_original_score = reEval.grading.final_marks;
          liveDoc.final_score = reEval.grading.final_marks;
          liveDoc.teacher_override = null;
          liveDoc.evidence_summary = reEval.evidence_summary;
          liveDoc.reliability = reEval.reliability;
          liveDoc.last_regrade_comparison = scoreDeltaReport;
          liveDoc.status = reEval.reliability.teacher_review_required ? "needs_review" : "pending_approval";
          liveDoc.updated_at = now;
          saveDB(freshDb);
        }

        comparisons.push({
          result_id: doc._id,
          student_name: doc.student_name,
          old_rubric_version: oldVersion,
          new_rubric_version: targetSnap.version,
          old_max_marks: doc.max_marks,
          new_max_marks: newMaxMarks,
          rubric_diff: rubricDiff,
          ...scoreDeltaReport,
        });
      }

      logAudit(req.user!.id, req.user!.email, "grading.regrade", "rubric", rubric_id, {
        count: comparisons.length,
        target_version: targetSnap.version,
      });
      res.json({ regraded_count: comparisons.length, comparisons });
    } catch (err: any) {
      res.status(502).json({ detail: err?.message || "Regrading failed." });
    }
  });

  app.get("/api/grading/agreement-analytics", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const reviewed = db.grading_results.filter((r) => r.owner_id === req.user!.id && r.teacher_override !== null);
    const pairs = reviewed.map((r) => ({
      ai_score: Number(r.ai_original_score ?? 0),
      human_score: Number(r.teacher_override.new_score),
      max_marks: Number(r.max_marks || 10),
    }));
    const stats = computeAgreementMetrics(pairs);
    const hasDemoData = reviewed.some((r) => r.is_demo);
    res.json({
      ...stats,
      contains_demo_data: hasDemoData,
      paired_records: reviewed.map((r) => ({
        _id: r._id,
        student_name: r.student_name,
        subject: r.subject,
        ai_score: r.ai_original_score,
        human_score: r.teacher_override.new_score,
        max_marks: r.max_marks,
        is_demo: Boolean(r.is_demo),
        override_reason: r.teacher_override.reason,
      })),
    });
  });

  // ==================== BATCH GRADING JOBS ====================
  app.post("/api/batch/jobs", requireAuth, (req: AuthedRequest, res) => {
    const body = req.body || {};
    const submissions = Array.isArray(body.submissions) ? body.submissions : [];
    if (submissions.length === 0) {
      res.status(400).json({ detail: "At least one student submission is required." });
      return;
    }
    if (!body.question || !String(body.question).trim()) {
      res.status(400).json({ detail: "Question statement is required for batch evaluation." });
      return;
    }

    const db = loadDB();
    if (body.exam_id) {
      const exam = db.exams.find((e) => e._id === body.exam_id && e.owner_id === req.user!.id);
      if (!exam) {
        res.status(404).json({ detail: "Examination not found." });
        return;
      }
    }
    if (body.rubric_id) {
      const rubric = db.rubrics.find((r) => r._id === body.rubric_id);
      if (!rubric || (rubric.owner_id !== req.user!.id && rubric.creator !== req.user!.email && !rubric.is_template)) {
        res.status(404).json({ detail: "Rubric not found or inaccessible." });
        return;
      }
    }

    const now = new Date().toISOString();
    const jobId = newId("batch");
    const job = {
      _id: jobId,
      owner_id: req.user!.id,
      title: String(body.title || "Batch Evaluation"),
      exam_id: body.exam_id || null,
      subject: String(body.subject || "Other"),
      topic: String(body.topic || ""),
      question: String(body.question).trim(),
      expected_answer: String(body.expected_answer || ""),
      max_marks: Number(body.max_marks || 10),
      rubric_id: body.rubric_id || null,
      rubric_version: body.rubric_version || null,
      custom_criteria: body.custom_criteria || [],
      status: "queued",
      total_count: submissions.length,
      completed_count: 0,
      failed_count: 0,
      items: submissions.map((s: any, idx: number) => ({
        student_name: String(s.student_name || `Student ${idx + 1}`),
        student_answer: String(s.student_answer || ""),
        ocr_quality_score: s.ocr_quality_score ?? null,
        ocr_warnings: s.ocr_warnings || [],
        status: "pending",
        result_id: null,
        score: null,
        reliability_status: null,
        error: null,
      })),
      created_at: now,
      updated_at: now,
    };

    db.batch_jobs.unshift(job);
    saveDB(db);
    void processBatchJobInBackground(jobId, req.user!.id);
    logAudit(req.user!.id, req.user!.email, "batch.create", "batch_job", jobId, { total: submissions.length });
    res.json(job);
  });

  app.get("/api/batch/jobs", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const jobs = db.batch_jobs.filter((j) => j.owner_id === req.user!.id);
    res.json({ jobs });
  });

  app.get("/api/batch/jobs/:id", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const job = db.batch_jobs.find((j) => j._id === req.params.id && j.owner_id === req.user!.id);
    if (!job) {
      res.status(404).json({ detail: "Batch job not found" });
      return;
    }
    res.json(job);
  });

  app.post("/api/batch/jobs/:id/retry-failed", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const job = db.batch_jobs.find((j) => j._id === req.params.id && j.owner_id === req.user!.id);
    if (!job) {
      res.status(404).json({ detail: "Batch job not found" });
      return;
    }
    if (job.status === "running") {
      res.status(409).json({ detail: "Batch job is already running." });
      return;
    }
    let resetCount = 0;
    job.items = job.items.map((it: any) => {
      if (it.status === "failed") {
        resetCount += 1;
        return { ...it, status: "pending", error: null };
      }
      return it;
    });
    if (resetCount === 0) {
      res.status(400).json({ detail: "No failed submissions to retry." });
      return;
    }
    job.failed_count = 0;
    job.status = "queued";
    job.updated_at = new Date().toISOString();
    saveDB(db);
    void processBatchJobInBackground(job._id, req.user!.id);
    res.json({ message: "Retrying failed submissions", job_id: job._id, retried: resetCount });
  });

  app.get("/api/batch/jobs/:id/export.csv", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const job = db.batch_jobs.find((j) => j._id === req.params.id && j.owner_id === req.user!.id);
    if (!job) {
      res.status(404).json({ detail: "Batch job not found" });
      return;
    }
    const header = "student_name,status,score,max_marks,reliability_status,result_id,error\n";
    const rows = job.items
      .map((it: any) =>
        [
          `"${String(it.student_name || "").replace(/"/g, '""')}"`,
          it.status,
          it.score ?? "",
          job.max_marks,
          it.reliability_status ?? "",
          it.result_id ?? "",
          `"${String(it.error || "").replace(/"/g, '""')}"`,
        ].join(",")
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=batch_${job._id}.csv`);
    res.send(header + rows);
  });

  // ==================== DATASET EVALUATION, VALIDATION & CALIBRATION ====================
  app.post("/api/evaluation/datasets/upload", requireAuth, upload.single("file"), (req: AuthedRequest, res) => {
    try {
      const file = req.file;
      const name = String(req.body?.name || "").trim();
      if (!file || !name) {
        res.status(400).json({ detail: "Dataset name and .csv/.json file are required." });
        return;
      }
      const ext = path.extname(file.originalname || "").toLowerCase();
      if (!ALLOWED_DATASET_EXT.has(ext)) {
        res.status(400).json({ detail: "Dataset must be a .csv or .json file." });
        return;
      }
      const trainRatio = Number(req.body?.train_ratio ?? 0.6);
      const valRatio = Number(req.body?.val_ratio ?? 0.2);
      const samples = parseDatasetContent(file.originalname, file.buffer.toString("utf8"));
      const splits = splitDatasetLeakageSafe(samples, trainRatio, valRatio);

      const doc = {
        _id: newId("ds"),
        is_demo: false,
        owner_id: req.user!.id,
        name,
        filename: path.basename(file.originalname),
        total_samples: samples.length,
        counts: {
          train: splits.train.length,
          validation: splits.validation.length,
          test: splits.test.length,
        },
        splits,
        leakage_verified: true,
        created_at: new Date().toISOString(),
      };
      const db = loadDB();
      db.datasets.unshift(doc);
      saveDB(db);
      logAudit(req.user!.id, req.user!.email, "evaluation.dataset_upload", "dataset", doc._id);
      res.json(doc);
    } catch (err: any) {
      res.status(400).json({ detail: err?.message || "Failed to parse dataset." });
    }
  });

  app.get("/api/evaluation/datasets", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const datasets = db.datasets.filter((d) => d.owner_id === req.user!.id);
    res.json({ datasets });
  });

  app.post("/api/evaluation/prompts", requireAuth, (req: AuthedRequest, res) => {
    const name = String(req.body?.name || "").trim();
    const instructions = String(req.body?.instructions || "").trim();
    if (!name || !instructions) {
      res.status(400).json({ detail: "Prompt name and instructions are required." });
      return;
    }
    const db = loadDB();
    const doc = {
      _id: newId("prompt"),
      owner_id: req.user!.id,
      name,
      instructions,
      provider: "gemini",
      calibration_offset: Number(req.body?.calibration_offset || 0),
      created_at: new Date().toISOString(),
    };
    db.prompt_versions.unshift(doc);
    saveDB(db);
    res.json(doc);
  });

  app.get("/api/evaluation/prompts", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const prompts = db.prompt_versions.filter((p) => p.owner_id === req.user!.id || p.is_template);
    res.json({ prompts });
  });

  app.post("/api/evaluation/run", requireAuth, async (req: AuthedRequest, res) => {
    try {
      const db = loadDB();
      const {
        dataset_id,
        split = "validation",
        prompt_id,
        prompt_instructions = "",
        calibration_offset = 0,
        fit_calibration_on_validation = false,
      } = req.body || {};

      if (!["train", "validation", "test"].includes(split)) {
        res.status(400).json({ detail: "Split must be train, validation, or test." });
        return;
      }
      if (fit_calibration_on_validation && split === "test") {
        res.status(400).json({
          detail: "Leakage protection: calibration offsets cannot be fitted on the held-out test set. Fit on validation first.",
        });
        return;
      }
      const ds = db.datasets.find((d) => d._id === dataset_id && d.owner_id === req.user!.id);
      if (!ds) {
        res.status(404).json({ detail: "Dataset not found" });
        return;
      }

      const promptObj = prompt_id
        ? db.prompt_versions.find((p) => p._id === prompt_id && (p.owner_id === req.user!.id || p.is_template))
        : null;
      if (prompt_id && !promptObj) {
        res.status(404).json({ detail: "Prompt configuration not found." });
        return;
      }
      const effectivePrompt = promptObj?.instructions || prompt_instructions;
      const samples = ds.splits[split] || [];
      const evaluated: any[] = [];

      for (const sample of samples) {
        const out = await runGeminiGrading({
          subject: sample.subject || "Other",
          topic: sample.topic || "",
          question: sample.question,
          max_marks: Number(sample.max_marks || 10),
          expected_answer: sample.expected_answer || "",
          subject_instructions: effectivePrompt,
          criteria: [
            {
              criterion_id: "overall",
              title: "Conceptual Accuracy & Completeness",
              description: "Score alignment with expected answer and domain principles.",
              points: Number(sample.max_marks || 10),
            },
          ],
          student_answer: sample.student_answer,
          ocr_quality_score: null,
          ocr_warnings: [],
          prompt_override: effectivePrompt,
          calibration_offset: Number(calibration_offset || 0),
        });
        evaluated.push({
          sample_id: sample.sample_id,
          question: sample.question,
          human_score: sample.human_score,
          ai_score: out.grading.final_marks,
          max_marks: sample.max_marks,
          evidence_validity_rate: out.evidence_summary.evidence_validity_rate,
          reliability_status: out.reliability.status,
        });
      }

      const agreement = computeAgreementMetrics(
        evaluated.map((e) => ({ ai_score: e.ai_score, human_score: e.human_score, max_marks: e.max_marks }))
      );
      const n = evaluated.length;
      const avgValidity = n
        ? Number((evaluated.reduce((a, b) => a + b.evidence_validity_rate, 0) / n).toFixed(4))
        : null;
      const warningRate = n
        ? Number((evaluated.filter((e) => e.reliability_status !== "reliable").length / n).toFixed(4))
        : null;
      const calRecommendation = fit_calibration_on_validation ? fitSafeCalibrationOffset(evaluated) : null;

      const runDoc = {
        _id: newId("evalrun"),
        owner_id: req.user!.id,
        dataset_id: ds._id,
        dataset_name: ds.name,
        is_demo_dataset: Boolean(ds.is_demo),
        split,
        prompt_name: promptObj?.name || "Ad-hoc Configuration",
        calibration_offset_used: Number(calibration_offset || 0),
        calibration_recommendation: calRecommendation,
        summary: {
          agreement,
          evidence_validity: avgValidity,
          reliability_warning_rate: warningRate,
          model_fine_tuned: false,
          note: "Evaluation measures prompt & rubric calibration on held-out samples. Underlying Gemini foundation model weights are NOT fine-tuned.",
        },
        items: evaluated,
        created_at: new Date().toISOString(),
      };

      const freshDb = loadDB();
      freshDb.evaluation_runs.unshift(runDoc);
      saveDB(freshDb);
      res.json(runDoc);
    } catch (err: any) {
      res.status(502).json({ detail: err?.message || "Evaluation run failed." });
    }
  });

  app.get("/api/evaluation/runs", requireAuth, (req: AuthedRequest, res) => {
    const db = loadDB();
    const runs = db.evaluation_runs.filter((r) => r.owner_id === req.user!.id);
    res.json({ runs });
  });

  // ==================== EXPORT PROJECT ZIP ====================
  app.get("/api/export-project-zip", requireAuth, async (_req, res) => {
    try {
      const zipPath = "/tmp/EvaluAI-Project-upgraded.zip";
      const pyScript = `
import os, zipfile
root = os.getcwd()
out_zip = ${JSON.stringify(zipPath)}
exclude_dirs = {"node_modules", "dist", ".git", ".data", "__pycache__", ".pytest_cache", "build"}
with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
        for fname in filenames:
            if fname.endswith(".pyc") or fname.endswith(".zip") or fname.startswith(".env"):
                continue
            full = os.path.join(dirpath, fname)
            rel = os.path.relpath(full, root)
            zf.write(full, os.path.join("EvaluAI-Project", rel))
`;
      await execFileAsync("python3", ["-c", pyScript], { cwd: process.cwd() });
      res.download(zipPath, "EvaluAI-Project-upgraded.zip");
    } catch (err: any) {
      res.status(500).json({ detail: err?.message || "Failed to generate project ZIP archive." });
    }
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ detail: "API endpoint not found." });
  });

  app.set("trust proxy", 1);

  const httpServer = http.createServer(app);
  const isProduction = process.env.NODE_ENV === "production";
  const isHmrDisabled = process.env.DISABLE_HMR === "true";

  // Helper to check if dist/index.html is missing or older than src/ or index.html
  const getLatestMtimeMs = (targetPath: string): number => {
    if (!fs.existsSync(targetPath)) return 0;
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) return stat.mtimeMs;
    let maxMtime = stat.mtimeMs;
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const childMtime = getLatestMtimeMs(path.join(targetPath, entry.name));
      if (childMtime > maxMtime) maxMtime = childMtime;
    }
    return maxMtime;
  };

  if (isProduction || isHmrDisabled) {
    // In hosted previews (DISABLE_HMR=true) and production, Vite HMR WebSockets on port 24678
    // are neither exposed nor proxied. Serve the compiled bundle cleanly so /@vite/client is never injected.
    const distDir = path.resolve(process.cwd(), "dist");
    const distIndex = path.join(distDir, "index.html");
    const srcMtime = Math.max(
      getLatestMtimeMs(path.resolve(process.cwd(), "src")),
      getLatestMtimeMs(path.resolve(process.cwd(), "index.html"))
    );
    const distMtime = fs.existsSync(distIndex) ? fs.statSync(distIndex).mtimeMs : 0;

    if (!isProduction && (!fs.existsSync(distIndex) || srcMtime > distMtime)) {
      console.log("Building frontend bundle for preview serving...");
      await viteBuild();
    }

    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return next();
      }
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        return res.status(404).json({ detail: "API endpoint not found." });
      }
      res.sendFile(distIndex);
    });
  } else {
    // Local interactive dev with HMR enabled: bind Vite HMR WebSocket onto the same httpServer port
    // rather than spawning a separate port 24678 WebSocket server.
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  const cliPortIdx = process.argv.indexOf("--port");
  const cliPort = cliPortIdx >= 0 ? Number(process.argv[cliPortIdx + 1]) : NaN;
  const port = Number.isFinite(cliPort) && cliPort > 0 ? cliPort : Number(process.env.PORT || 3000);
  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`EvaluAI server running on http://0.0.0.0:${port}`);
  });
}

createServer().catch((err) => {
  console.error("Failed to start EvaluAI server:", err);
  process.exit(1);
});
