from typing import List, Optional, Literal, Dict, Any
from pydantic import BaseModel, Field, field_validator

SUPPORTED_SUBJECTS = [
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
]


class RubricPerformanceLevels(BaseModel):
    excellent: str = Field(default="Complete, conceptually accurate, and clearly reasoned.")
    good: str = Field(default="Mostly accurate with minor omissions.")
    partial: str = Field(default="Demonstrates partial understanding with key gaps.")
    poor: str = Field(default="Incorrect, off-topic, or missing core concepts.")


class RubricCriterion(BaseModel):
    criterion_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)
    points: float = Field(gt=0)
    partial_credit_rules: str = Field(default="Award proportional marks for valid intermediate steps or equivalent explanations.")
    levels: RubricPerformanceLevels = Field(default_factory=RubricPerformanceLevels)


class RubricQuestion(BaseModel):
    question_id: Optional[str] = None
    text: str = Field(min_length=1, max_length=4000)
    max_marks: Optional[float] = None
    expected_answer: Optional[str] = ""
    criteria: List[RubricCriterion] = Field(min_length=1)


class RubricCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    subject: str = Field(default="Other")
    topic: str = Field(default="")
    subject_instructions: str = Field(default="Evaluate conceptual accuracy and accept valid alternative explanations.")
    partial_credit_policy: str = Field(default="proportional")
    is_template: bool = False
    questions: List[RubricQuestion] = Field(min_length=1)
    change_note: str = Field(default="Initial rubric version")

    @field_validator("subject")
    @classmethod
    def check_subject(cls, v: str) -> str:
        return v if v in SUPPORTED_SUBJECTS else "Other"


class RubricUpdateRequest(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    topic: Optional[str] = None
    subject_instructions: Optional[str] = None
    partial_credit_policy: Optional[str] = None
    is_template: Optional[bool] = None
    questions: Optional[List[RubricQuestion]] = None
    change_note: str = Field(default="Updated rubric criteria")


class GradeAnswerRequest(BaseModel):
    exam_id: Optional[str] = None
    student_name: str = Field(default="Unnamed Student", max_length=200)
    subject: str = Field(default="Other")
    topic: str = Field(default="")
    question: str = Field(min_length=1, max_length=6000)
    max_marks: float = Field(gt=0)
    expected_answer: str = Field(default="")
    student_answer: str = Field(default="")
    rubric_id: Optional[str] = None
    rubric_version: Optional[int] = None
    custom_criteria: Optional[List[RubricCriterion]] = None
    subject_instructions: str = Field(default="")
    ocr_quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    ocr_warnings: List[str] = Field(default_factory=list)
    provider: Optional[str] = None
    prompt_version_id: Optional[str] = None
    calibration_offset: float = 0.0


class CriterionEvaluation(BaseModel):
    criterion_id: str
    criterion_title: str
    max_marks: float = Field(ge=0)
    awarded_marks: float = Field(ge=0)
    explanation: str
    evidence_quotes: List[str] = Field(default_factory=list)
    verified_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    uncertainty_flag: bool = False
    uncertainty_reason: str = ""


class StructuredGradingOutput(BaseModel):
    final_marks: float = Field(ge=0)
    max_marks: float = Field(gt=0)
    answer_classification: Literal["correct", "partially_correct", "incorrect", "ungradable"]
    criterion_evaluations: List[CriterionEvaluation]
    missing_concepts: List[str] = Field(default_factory=list)
    incorrect_concepts: List[str] = Field(default_factory=list)
    irrelevant_content_detected: bool = False
    irrelevant_content_notes: str = ""
    suggestions_for_improvement: List[str] = Field(default_factory=list)
    general_feedback: str = ""
    model_uncertainty_flags: List[str] = Field(default_factory=list)


class TeacherOverrideRequest(BaseModel):
    final_marks: float = Field(ge=0)
    criterion_evaluations: Optional[List[CriterionEvaluation]] = None
    override_reason: str = Field(min_length=3, max_length=1000)
    general_feedback: Optional[str] = None
    approve_result: bool = True


class RegradeRequest(BaseModel):
    result_ids: Optional[List[str]] = None
    exam_id: Optional[str] = None
    rubric_id: str
    target_version: Optional[int] = None
    confirm_bulk: bool = False
    reason: str = Field(default="Rubric criteria updated")
