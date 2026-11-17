export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface PerformanceLevels {
  excellent: string;
  good: string;
  partial: string;
  poor: string;
}

export interface RubricCriterion {
  criterion_id: string;
  title: string;
  description: string;
  points: number;
  partial_credit_rules: string;
  levels: PerformanceLevels;
}

export interface RubricQuestion {
  question_id: string;
  text: string;
  max_marks: number;
  expected_answer: string;
  criteria: RubricCriterion[];
}

export interface Rubric {
  _id: string;
  name: string;
  subject: string;
  topic: string;
  subject_instructions: string;
  partial_credit_policy: string;
  is_template: boolean;
  is_demo?: boolean;
  owner_id: string;
  creator: string;
  current_version: number;
  questions: RubricQuestion[];
  created_at: string;
  updated_at: string;
}

export interface RubricVersion extends Rubric {
  rubric_id: string;
  version: number;
  change_note: string;
  created_by: string;
}

export interface VerifiedEvidence {
  quote: string;
  verified: boolean;
  match_type: string;
  char_start: number | null;
  char_end: number | null;
  token_overlap: number;
}

export interface CriterionEvaluation {
  criterion_id: string;
  criterion_title: string;
  max_marks: number;
  awarded_marks: number;
  explanation: string;
  evidence_quotes: string[];
  verified_evidence?: VerifiedEvidence[];
  uncertainty_flag: boolean;
  uncertainty_reason: string;
}

export interface ReliabilityReport {
  status: "reliable" | "needs_review" | "cannot_reliably_grade";
  teacher_review_required: boolean;
  reasons: string[];
  signals: {
    evidence_coverage: number;
    evidence_validity_rate: number;
    unverified_quotes: number;
    ocr_quality_score: number | null;
  };
}

export interface GradingResult {
  _id: string;
  is_demo?: boolean;
  owner_id: string;
  exam_id: string | null;
  student_name: string;
  subject: string;
  topic: string;
  question: string;
  expected_answer: string;
  student_answer: string;
  max_marks: number;
  rubric_id: string | null;
  rubric_version: number | null;
  rubric_name: string;
  grading: {
    final_marks: number;
    max_marks: number;
    answer_classification: string;
    criterion_evaluations: CriterionEvaluation[];
    missing_concepts: string[];
    incorrect_concepts: string[];
    irrelevant_content_detected: boolean;
    irrelevant_content_notes: string;
    suggestions_for_improvement: string[];
    general_feedback: string;
    model_uncertainty_flags: string[];
  };
  ai_original_score: number;
  final_score: number;
  evidence_summary: {
    total_quotes: number;
    verified_quotes: number;
    unverified_quotes: number;
    awarded_criteria: number;
    awarded_with_verified_evidence: number;
    evidence_coverage: number;
    evidence_validity_rate: number;
  };
  reliability: ReliabilityReport;
  provider_used: string;
  teacher_override: {
    overridden_by: string;
    previous_score: number;
    new_score: number;
    reason: string;
    timestamp: string;
  } | null;
  last_regrade_comparison?: {
    old_score: number;
    new_score: number;
    score_delta: number;
    criterion_changes: Array<{
      criterion_id: string;
      criterion_title: string;
      old_marks: number | null;
      new_marks: number | null;
      delta: number;
      reason: string;
    }>;
    explanation_of_change: string;
  };
  status: string;
  created_at: string;
  updated_at: string;
}

export interface BatchJob {
  _id: string;
  title: string;
  subject: string;
  topic: string;
  question: string;
  max_marks: number;
  rubric_id: string | null;
  status: string;
  total_count: number;
  completed_count: number;
  failed_count: number;
  items: Array<{
    student_name: string;
    student_answer: string;
    status: string;
    result_id: string | null;
    score: number | null;
    reliability_status: string | null;
    error: string | null;
  }>;
  created_at: string;
  updated_at: string;
}

export interface DatasetRecord {
  _id: string;
  is_demo?: boolean;
  name: string;
  filename: string;
  total_samples: number;
  counts: { train: number; validation: number; test: number };
  splits: { train: any[]; validation: any[]; test: any[] };
  leakage_verified: boolean;
  created_at: string;
}

export const SUPPORTED_SUBJECTS = [
  "Science",
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Computer Science",
  "Electronics and Engineering",
  "History",
  "Geography",
  "English",
  "Other",
] as const;
