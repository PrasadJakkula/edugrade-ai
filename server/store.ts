import fs from "fs";
import path from "path";
import crypto from "crypto";
import { hashPassword } from "./auth.ts";
import { verifyAllEvidence, assessReliability, splitDatasetLeakageSafe } from "./engines.ts";

const DATA_DIR = path.resolve(process.cwd(), ".data");
const DB_PATH = path.join(DATA_DIR, "evaluai_db.json");

export interface EvaluAIDB {
  users: any[];
  rubrics: any[];
  rubric_versions: any[];
  exams: any[];
  grading_results: any[];
  grading_history: any[];
  batch_jobs: any[];
  datasets: any[];
  prompt_versions: any[];
  evaluation_runs: any[];
  audit_logs: any[];
}

function buildSeedData(): EvaluAIDB {
  const now = new Date().toISOString();
  const demoUserId = "demo-teacher-001";
  const demoEmail = "demo.teacher@evaluai.edu";

  const physicsRubricId = "rubric-physics-newton";
  const bioRubricId = "rubric-bio-photosynthesis";
  const csRubricId = "rubric-cs-bfs";

  const physicsV1 = {
    _id: "rv-phys-1",
    rubric_id: physicsRubricId,
    version: 1,
    name: "Newton's Second Law & Net Force",
    subject: "Physics",
    topic: "Classical Mechanics",
    subject_instructions: "Accept both symbolic (F = ma) and verbal proportional reasoning. Do not penalize minor spelling errors.",
    partial_credit_policy: "proportional",
    questions: [
      {
        question_id: "q_phys_1",
        text: "State Newton's Second Law of Motion and explain what happens to acceleration if net force doubles while mass stays constant.",
        max_marks: 6,
        expected_answer: "Acceleration is directly proportional to net force and inversely proportional to mass (F_net = ma). Doubling net force with constant mass doubles acceleration.",
        criteria: [
          {
            criterion_id: "c_phys_law",
            title: "Law Statement & Equation",
            description: "Correctly relates net force, mass, and acceleration (F = ma or proportional statement).",
            points: 3,
            partial_credit_rules: "Award 1.5 marks if formula is stated without identifying net force or mass relationship.",
            levels: {
              excellent: "Clearly defines F_net = ma and directional proportionality.",
              good: "States F = ma accurately with minor omission of vector/net force wording.",
              partial: "Mentions force causes acceleration without mass dependence.",
              poor: "Incorrect equation or unrelated physics concept.",
            },
          },
          {
            criterion_id: "c_phys_scaling",
            title: "Doubling Force Reasoning",
            description: "Concludes that doubling net force doubles acceleration when mass is held constant.",
            points: 3,
            partial_credit_rules: "Award 1.5 marks if student states acceleration increases without quantifying doubling.",
            levels: {
              excellent: "Explicitly states acceleration doubles because a = F/m is directly proportional.",
              good: "Correctly states acceleration doubles.",
              partial: "States acceleration increases without stating 2x.",
              poor: "Claims acceleration stays same or decreases.",
            },
          },
        ],
      },
    ],
    change_note: "Initial Physics rubric (v1)",
    created_by: demoEmail,
    created_at: now,
  };

  const physicsV2 = {
    ...physicsV1,
    _id: "rv-phys-2",
    version: 2,
    subject_instructions: "Require explicit mention of SI units (Newtons, kg, m/s^2) OR vector direction for full credit; accept equivalent proportional explanations.",
    questions: [
      {
        ...physicsV1.questions[0],
        max_marks: 8,
        criteria: [
          ...physicsV1.questions[0].criteria,
          {
            criterion_id: "c_phys_units",
            title: "SI Units & Vector Direction",
            description: "Includes standard SI units (N, kg, m/s^2) or notes that acceleration acts in the direction of net force.",
            points: 2,
            partial_credit_rules: "Award 1 mark if only one of units or direction is mentioned.",
            levels: {
              excellent: "Correct SI units and vector direction stated.",
              good: "Either SI units or direction clearly stated.",
              partial: "Implicit unit reference.",
              poor: "Incorrect units or direction.",
            },
          },
        ],
      },
    ],
    change_note: "Added 2-mark criterion for SI units & vector direction (v2)",
    created_at: now,
  };

  const bioRubric = {
    _id: bioRubricId,
    name: "Cellular Photosynthesis Mechanism",
    subject: "Biology",
    topic: "Plant Physiology",
    subject_instructions: "Accept word equations or balanced chemical equations. Focus on light capture, reactants, and products.",
    partial_credit_policy: "proportional",
    is_template: true,
    owner_id: demoUserId,
    creator: demoEmail,
    current_version: 1,
    questions: [
      {
        question_id: "q_bio_1",
        text: "Explain how plants convert light energy into chemical energy during photosynthesis, naming the key inputs and outputs.",
        max_marks: 6,
        expected_answer: "Chlorophyll in chloroplasts absorbs sunlight to convert carbon dioxide (CO2) and water (H2O) into glucose (C6H12O6) and oxygen (O2).",
        criteria: [
          {
            criterion_id: "c_bio_reactants",
            title: "Inputs & Light Capture",
            description: "Identifies carbon dioxide, water, and sunlight absorbed by chlorophyll/chloroplasts.",
            points: 3,
            partial_credit_rules: "1 mark per component (CO2, H2O, chlorophyll/sunlight).",
            levels: {
              excellent: "Names CO2, H2O, sunlight, and chlorophyll/chloroplast site.",
              good: "Names inputs and sunlight.",
              partial: "Names only one or two inputs.",
              poor: "Confuses photosynthesis with respiration inputs.",
            },
          },
          {
            criterion_id: "c_bio_outputs",
            title: "Products & Energy Conversion",
            description: "Identifies glucose (stored chemical energy) and oxygen gas as outputs.",
            points: 3,
            partial_credit_rules: "1.5 marks for glucose/sugar, 1.5 marks for oxygen.",
            levels: {
              excellent: "Clearly explains conversion to chemical energy in glucose + oxygen release.",
              good: "Names glucose and oxygen.",
              partial: "Names only one product.",
              poor: "Lists CO2 as product.",
            },
          },
        ],
      },
    ],
    created_at: now,
    updated_at: now,
  };

  const csRubric = {
    _id: csRubricId,
    name: "Graph Shortest Path & Complexity Analysis",
    subject: "Computer Science",
    topic: "Graph Algorithms",
    subject_instructions: "Accept BFS for unweighted graphs and Dijkstra for non-negative weighted graphs; evaluate time complexity justification.",
    partial_credit_policy: "proportional",
    is_template: true,
    owner_id: demoUserId,
    creator: demoEmail,
    current_version: 1,
    questions: [
      {
        question_id: "q_cs_1",
        text: "Which algorithm finds the shortest path in an unweighted graph, and what is its time complexity in terms of vertices V and edges E?",
        max_marks: 5,
        expected_answer: "Breadth-First Search (BFS) using a queue explores vertices layer by layer in O(V + E) time using an adjacency list.",
        criteria: [
          {
            criterion_id: "c_cs_algo",
            title: "Algorithm Selection & Justification",
            description: "Identifies Breadth-First Search (BFS) and explains layer-by-layer queue traversal.",
            points: 3,
            partial_credit_rules: "2 marks for BFS name, 1 mark for queue / level-order justification.",
            levels: {
              excellent: "Names BFS and explains level-order guarantee.",
              good: "Names BFS clearly.",
              partial: "Mentions Dijkstra without noting unweighted optimality of BFS.",
              poor: "Selects DFS as shortest path guarantee.",
            },
          },
          {
            criterion_id: "c_cs_complexity",
            title: "Asymptotic Time Complexity",
            description: "States O(V + E) for adjacency list representation.",
            points: 2,
            partial_credit_rules: "1 mark if O(V^2) noted for adjacency matrix.",
            levels: {
              excellent: "States O(V + E) and notes adjacency list.",
              good: "States O(V + E).",
              partial: "Mentions linear in graph size without Big-O.",
              poor: "Incorrect complexity.",
            },
          },
        ],
      },
    ],
    created_at: now,
    updated_at: now,
  };

  // Build 3 realistic, verified demonstration grading results (reliable, needs_review, cannot_reliably_grade)
  const ans1 =
    "According to Newton's second law, the net force acting on an object equals its mass multiplied by its acceleration (F = ma). Since acceleration a = F / m, if mass stays constant and the net force doubles, the acceleration also doubles.";
  const crit1: any[] = [
    {
      criterion_id: "c_phys_law",
      criterion_title: "Law Statement & Equation",
      max_marks: 3,
      awarded_marks: 3,
      explanation: "Accurately states F = ma and explicitly refers to net force, mass, and acceleration.",
      evidence_quotes: ["net force acting on an object equals its mass multiplied by its acceleration (F = ma)"],
      uncertainty_flag: false,
      uncertainty_reason: "",
    },
    {
      criterion_id: "c_phys_scaling",
      criterion_title: "Doubling Force Reasoning",
      max_marks: 3,
      awarded_marks: 3,
      explanation: "Correctly rearranges a = F / m and concludes acceleration doubles when net force doubles at constant mass.",
      evidence_quotes: ["if mass stays constant and the net force doubles, the acceleration also doubles"],
      uncertainty_flag: false,
      uncertainty_reason: "",
    },
  ];
  const v1 = verifyAllEvidence(crit1, ans1);
  const g1 = {
    final_marks: 6,
    max_marks: 6,
    answer_classification: "correct",
    criterion_evaluations: v1.criterion_evaluations,
    missing_concepts: [],
    incorrect_concepts: [],
    irrelevant_content_detected: false,
    irrelevant_content_notes: "",
    suggestions_for_improvement: ["Consider mentioning SI units (Newtons, kg, m/s^2) for completeness."],
    general_feedback: "Clear conceptual mastery and exact proportional reasoning (Demo Sample).",
    model_uncertainty_flags: [],
  };
  const r1 = assessReliability({
    question: physicsV1.questions[0].text,
    student_answer: ans1,
    criteria: physicsV1.questions[0].criteria,
    grading_output: g1,
    evidence_summary: v1.evidence_summary,
    ocr_quality_score: 0.98,
    ocr_warnings: [],
  });

  const ans2 =
    "Force makes objects accelerate faster when you push harder, and heavier objects resist acceleration more. Maybe the speed doubles or stays proportional when force goes up, though friction could change it.";
  const crit2: any[] = [
    {
      criterion_id: "c_phys_law",
      criterion_title: "Law Statement & Equation",
      max_marks: 3,
      awarded_marks: 2,
      explanation: "Expresses the correct qualitative proportionality between force, mass, and acceleration without writing F = ma explicitly.",
      evidence_quotes: ["Force makes objects accelerate faster when you push harder, and heavier objects resist acceleration more"],
      uncertainty_flag: false,
      uncertainty_reason: "",
    },
    {
      criterion_id: "c_phys_scaling",
      criterion_title: "Doubling Force Reasoning",
      max_marks: 3,
      awarded_marks: 1.5,
      explanation: "Hedging language ('Maybe the speed doubles') confuses velocity/speed with acceleration.",
      evidence_quotes: ["Maybe the speed doubles or stays proportional when force goes up"],
      uncertainty_flag: true,
      uncertainty_reason: "Ambiguous wording conflates 'speed' with 'acceleration' and expresses uncertainty ('Maybe').",
    },
  ];
  const v2 = verifyAllEvidence(crit2, ans2);
  const g2 = {
    final_marks: 3.5,
    max_marks: 6,
    answer_classification: "partially_correct",
    criterion_evaluations: v2.criterion_evaluations,
    missing_concepts: ["Explicit F = ma equation", "Clear distinction between speed and acceleration"],
    incorrect_concepts: ["Refers to 'speed' doubling instead of acceleration"],
    irrelevant_content_detected: false,
    irrelevant_content_notes: "",
    suggestions_for_improvement: ["State F_net = ma directly and specify that acceleration (not speed) doubles."],
    general_feedback: "Shows valid intuition about inertia and force, but ambiguous terminology requires teacher review (Demo Sample).",
    model_uncertainty_flags: ["Ambiguous wording: student says 'Maybe the speed doubles' rather than acceleration."],
  };
  const r2 = assessReliability({
    question: physicsV1.questions[0].text,
    student_answer: ans2,
    criteria: physicsV1.questions[0].criteria,
    grading_output: g2,
    evidence_summary: v2.evidence_summary,
    ocr_quality_score: 0.94,
    ocr_warnings: [],
  });

  const ans3 = "Newton law is F = [ILLEGIBLE] so when force [ILLEGIBLE] acceleration goes [ILLEGIBLE].";
  const crit3: any[] = [
    {
      criterion_id: "c_phys_law",
      criterion_title: "Law Statement & Equation",
      max_marks: 3,
      awarded_marks: 0.5,
      explanation: "Formula right-hand side is unreadable in the scanned submission.",
      evidence_quotes: ["Newton law is F = [ILLEGIBLE]"],
      uncertainty_flag: true,
      uncertainty_reason: "Handwriting smudge prevents reading the equation.",
    },
    {
      criterion_id: "c_phys_scaling",
      criterion_title: "Doubling Force Reasoning",
      max_marks: 3,
      awarded_marks: 0,
      explanation: "Concluding phrase is illegible in scan.",
      evidence_quotes: [],
      uncertainty_flag: true,
      uncertainty_reason: "Illegible OCR segment.",
    },
  ];
  const v3 = verifyAllEvidence(crit3, ans3);
  const g3 = {
    final_marks: 0.5,
    max_marks: 6,
    answer_classification: "ungradable",
    criterion_evaluations: v3.criterion_evaluations,
    missing_concepts: ["Readable equation", "Readable scaling conclusion"],
    incorrect_concepts: [],
    irrelevant_content_detected: false,
    irrelevant_content_notes: "",
    suggestions_for_improvement: ["Upload a higher-resolution scan or manually transcribe the illegible handwriting."],
    general_feedback: "Scan quality is too low for automated grading; manual evaluation required (Demo Sample).",
    model_uncertainty_flags: ["Handwritten scan contains multiple [ILLEGIBLE] markers."],
  };
  const r3 = assessReliability({
    question: physicsV1.questions[0].text,
    student_answer: ans3,
    criteria: physicsV1.questions[0].criteria,
    grading_output: g3,
    evidence_summary: v3.evidence_summary,
    ocr_quality_score: 0.44,
    ocr_warnings: ["Low contrast and motion blur detected in handwritten photo."],
  });

  // 5 additional teacher-overridden/approved demo records so Agreement Analytics has n=6 (>=5) clearly labeled demonstration data
  const demoAgreementPairs = [
    { id: "res-demo-1", student: "Elena Martinez (Demo)", ai: 6.0, human: 6.0, max: 6, ans: ans1, g: g1, v: v1, r: r1, override: { overridden_by: demoEmail, previous_score: 6.0, new_score: 6.0, reason: "Approved AI evaluation as accurate.", timestamp: now }, status: "approved" },
    { id: "res-demo-2", student: "Liam O'Connor (Demo)", ai: 3.5, human: 4.0, max: 6, ans: ans2, g: g2, v: v2, r: r2, override: { overridden_by: demoEmail, previous_score: 3.5, new_score: 4.0, reason: "Awarded +0.5 for intuitive inertia phrasing despite informal wording.", timestamp: now }, status: "approved" },
    { id: "res-demo-3", student: "Priya Nair (Demo)", ai: 0.5, human: 0.5, max: 6, ans: ans3, g: g3, v: v3, r: r3, override: null, status: "needs_review" },
    { id: "res-demo-4", student: "Noah Takahashi (Demo)", ai: 5.0, human: 5.0, max: 6, ans: "F = ma means acceleration equals net force divided by mass. Doubling net force doubles acceleration.", g: g1, v: v1, r: r1, override: { overridden_by: demoEmail, previous_score: 5.0, new_score: 5.0, reason: "Confirmed partial deduction for missing unit context.", timestamp: now }, status: "approved" },
    { id: "res-demo-5", student: "Sofia Rossi (Demo)", ai: 2.0, human: 2.5, max: 6, ans: "F = ma. Force causes motion so acceleration changes.", g: g2, v: v2, r: r2, override: { overridden_by: demoEmail, previous_score: 2.0, new_score: 2.5, reason: "Granted 0.5 more partial credit for correct formula.", timestamp: now }, status: "approved" },
    { id: "res-demo-6", student: "David Kim (Demo)", ai: 4.5, human: 4.5, max: 6, ans: "Net force = mass * acceleration. If force doubles at fixed mass, acceleration doubles.", g: g1, v: v1, r: r1, override: { overridden_by: demoEmail, previous_score: 4.5, new_score: 4.5, reason: "Verified and approved.", timestamp: now }, status: "approved" },
  ];

  const grading_results = demoAgreementPairs.map((d) => ({
    _id: d.id,
    is_demo: true,
    owner_id: demoUserId,
    exam_id: "exam-demo-phys-midterm",
    student_name: d.student,
    subject: "Physics",
    topic: "Classical Mechanics",
    question: physicsV1.questions[0].text,
    expected_answer: physicsV1.questions[0].expected_answer,
    student_answer: d.ans,
    max_marks: d.max,
    rubric_id: physicsRubricId,
    rubric_version: 1,
    rubric_name: physicsV1.name,
    criteria_snapshot: physicsV1.questions[0].criteria,
    grading: d.g,
    ai_original_score: d.ai,
    final_score: d.override ? d.override.new_score : d.ai,
    evidence_summary: d.v.evidence_summary,
    reliability: d.r,
    provider_used: "demonstration-seed",
    teacher_override: d.override,
    status: d.status,
    created_at: now,
    updated_at: now,
  }));

  const demoSamples = [
    { sample_id: "d1", subject: "Physics", topic: "Mechanics", question: "State Newton's 2nd law and doubling effect.", expected_answer: "F=ma; doubling force doubles acceleration.", student_answer: "F = ma, so doubling force at fixed mass doubles acceleration.", human_score: 6, max_marks: 6 },
    { sample_id: "d2", subject: "Physics", topic: "Mechanics", question: "State Newton's 2nd law and doubling effect.", expected_answer: "F=ma; doubling force doubles acceleration.", student_answer: "Force equals mass times acceleration, so acceleration increases.", human_score: 4.5, max_marks: 6 },
    { sample_id: "d3", subject: "Biology", topic: "Photosynthesis", question: "Name reactants and products of photosynthesis.", expected_answer: "CO2 + H2O + light -> glucose + O2", student_answer: "Plants take in carbon dioxide, water, and sunlight to produce glucose and oxygen.", human_score: 6, max_marks: 6 },
    { sample_id: "d4", subject: "Biology", topic: "Photosynthesis", question: "Name reactants and products of photosynthesis.", expected_answer: "CO2 + H2O + light -> glucose + O2", student_answer: "Plants use sunlight and water to make oxygen.", human_score: 3, max_marks: 6 },
    { sample_id: "d5", subject: "Computer Science", topic: "Graphs", question: "Shortest path algorithm in unweighted graph and complexity.", expected_answer: "BFS, O(V + E)", student_answer: "Breadth-first search visits vertices level by level in O(V + E) time.", human_score: 5, max_marks: 5 },
    { sample_id: "d6", subject: "Chemistry", topic: "Acids & Bases", question: "Define pH mathematically.", expected_answer: "pH = -log10[H+]", student_answer: "pH is the negative base-10 logarithm of hydrogen ion concentration.", human_score: 5, max_marks: 5 },
  ];
  const splits = splitDatasetLeakageSafe(demoSamples);

  return {
    users: [
      {
        _id: demoUserId,
        name: "Dr. Elena Vance (Demo Teacher)",
        email: demoEmail,
        password_hash: hashPassword("EvaluAI2026!"),
        role: "teacher",
        created_at: now,
      },
    ],
    rubrics: [
      {
        _id: physicsRubricId,
        name: physicsV2.name,
        subject: physicsV2.subject,
        topic: physicsV2.topic,
        subject_instructions: physicsV2.subject_instructions,
        partial_credit_policy: "proportional",
        is_template: true,
        is_demo: true,
        owner_id: demoUserId,
        creator: demoEmail,
        current_version: 2,
        questions: physicsV2.questions,
        created_at: now,
        updated_at: now,
      },
      { ...bioRubric, is_demo: true },
      { ...csRubric, is_demo: true },
    ],
    rubric_versions: [
      physicsV1,
      physicsV2,
      {
        ...bioRubric,
        _id: "rv-bio-1",
        rubric_id: bioRubricId,
        version: 1,
        change_note: "Initial Biology rubric (v1)",
        created_by: demoEmail,
      },
      {
        ...csRubric,
        _id: "rv-cs-1",
        rubric_id: csRubricId,
        version: 1,
        change_note: "Initial Computer Science rubric (v1)",
        created_by: demoEmail,
      },
    ],
    exams: [
      {
        _id: "exam-demo-phys-midterm",
        is_demo: true,
        owner_id: demoUserId,
        title: "Physics 101 — Short Answer Quiz (Demo)",
        subject: "Physics",
        rubric_id: physicsRubricId,
        rubric_version: 1,
        created_at: now,
      },
    ],
    grading_results,
    grading_history: grading_results.map((r) => ({
      _id: `hist-${r._id}`,
      result_id: r._id,
      owner_id: demoUserId,
      event_type: "initial_grade",
      rubric_id: r.rubric_id,
      rubric_version: r.rubric_version,
      score: r.ai_original_score,
      max_marks: r.max_marks,
      grading_snapshot: r.grading,
      reliability_snapshot: r.reliability,
      created_at: now,
    })),
    batch_jobs: [],
    datasets: [
      {
        _id: "dataset-demo-stem-v1",
        is_demo: true,
        owner_id: demoUserId,
        name: "STEM Short-Answer Benchmark (Demo Data)",
        filename: "demo_stem_benchmark.csv",
        total_samples: demoSamples.length,
        counts: {
          train: splits.train.length,
          validation: splits.validation.length,
          test: splits.test.length,
        },
        splits,
        leakage_verified: true,
        created_at: now,
      },
    ],
    prompt_versions: [
      {
        _id: "prompt-v1-standard",
        owner_id: demoUserId,
        is_template: true,
        name: "v1 — Standard Conceptual Rubric Prompt",
        instructions: "Accept scientifically valid equivalent phrasing; verify verbatim quotes from student text.",
        provider: "gemini",
        calibration_offset: 0,
        created_at: now,
      },
      {
        _id: "prompt-v2-partial",
        owner_id: demoUserId,
        is_template: true,
        name: "v2 — Generous Partial Credit & Alternative Explanations",
        instructions: "Award proportional partial marks for correct intermediate reasoning even when final notation is incomplete.",
        provider: "gemini",
        calibration_offset: 0,
        created_at: now,
      },
    ],
    evaluation_runs: [],
    audit_logs: [
      {
        _id: "audit-seed-1",
        action: "workspace.seeded_demo",
        owner_id: demoUserId,
        user_email: demoEmail,
        resource_type: "system",
        resource_id: "demo",
        details: { note: "Initialized demonstration dataset and sample graded answers (labeled as Demo)." },
        timestamp: now,
      },
    ],
  };
}

let cachedDb: EvaluAIDB | null = null;

export function loadDB(): EvaluAIDB {
  if (cachedDb) return cachedDb;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    cachedDb = buildSeedData();
    saveDB(cachedDb);
    return cachedDb;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, "utf8");
    cachedDb = JSON.parse(raw) as EvaluAIDB;
    let patched = false;
    for (const p of cachedDb.prompt_versions || []) {
      if ((p._id === "prompt-v1-standard" || p._id === "prompt-v2-partial") && !p.is_template) {
        p.is_template = true;
        patched = true;
      }
    }
    if (patched) saveDB(cachedDb);
    return cachedDb;
  } catch {
    cachedDb = buildSeedData();
    saveDB(cachedDb);
    return cachedDb;
  }
}

export function saveDB(db: EvaluAIDB): void {
  cachedDb = db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_PATH}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_PATH);
}

export function newId(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}
