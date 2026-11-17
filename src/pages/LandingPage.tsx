import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  BarChart3,
  FileText,
  BookOpenCheck,
  FileSearch,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { EvaloraLogo } from "../components/EvaloraLogo";
import { flowClasses, getCriterionJss } from "../styles/evaloraJss";
import { useEffect, useState } from "react";

const SPOTLIGHT_REQUIREMENTS = [
  {
    id: "req_law",
    title: "Law Statement & Equation",
    marks: "3 / 3 pts",
    rule: "Must relate net force, mass, and acceleration via F = ma or proportional form.",
    quote: "net force equals mass times acceleration (F = ma",
  },
  {
    id: "req_prop",
    title: "Proportional Doubling Reasoning",
    marks: "2 / 2 pts",
    rule: "Explains that doubling net force at constant mass doubles acceleration (a = F/m).",
    quote: "When mass is constant and net force doubles, acceleration a = F/m also doubles",
  },
  {
    id: "req_units",
    title: "Units & Physical Clarity",
    marks: "1 / 1 pt",
    rule: "Cites consistent SI units (Newtons = kg·m/s²) and vector direction.",
    quote: "in Newtons = kg * m/s^2) acting in the direction of the net force",
  },
];

const SPOTLIGHT_SOURCE_SEGMENTS = [
  { text: "By Newton's second law, ", reqId: null },
  { text: "net force equals mass times acceleration (F = ma", reqId: "req_law" },
  { text: ", ", reqId: null },
  { text: "in Newtons = kg * m/s^2) acting in the direction of the net force", reqId: "req_units" },
  { text: ". ", reqId: null },
  { text: "When mass is constant and net force doubles, acceleration a = F/m also doubles", reqId: "req_prop" },
  { text: ".", reqId: null },
];

export function LandingPage() {
  const { user, demoLogin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);
  const [activeReqId, setActiveReqId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Evalora — Smarter Grading. Fairer Evaluation.";
  }, []);

  const handleLaunchDemo = async () => {
    if (user) {
      navigate("/dashboard");
      return;
    }
    setLaunching(true);
    try {
      await demoLogin();
      notify("success", "Signed into Evalora Demo Teacher workspace.");
      navigate("/dashboard");
    } catch (err: any) {
      notify("error", err.message || "Could not launch demo session.");
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <Link to="/" aria-label="Evalora Home" className="shrink-0">
            <EvaloraLogo theme="light" size="md" />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#flow-spotlight" className="hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0">
              Evaluation Flow
            </a>
            <a href="#capabilities" className="hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0">
              Core Engine
            </a>
            <a href="#workflow" className="hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0">
              Workflow
            </a>
            <Link to="/login" className="hover:text-[#1D4ED8] transition-colors whitespace-nowrap shrink-0">
              Sign In
            </Link>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleLaunchDemo}
              disabled={launching}
              className={`px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 disabled:opacity-60 ${flowClasses.primaryCtaButton}`}
            >
              {user ? "Open Workspace" : launching ? "Opening Demo..." : "Launch Interactive Demo"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className={flowClasses.heroCanvas}>
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20 grid lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="text-xs font-semibold text-[#1D4ED8] tracking-wide uppercase mb-2">
              Smarter Grading. Fairer Evaluation.
            </div>
            <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2 mb-4">
              <span>Requirements-First Rubrics</span>
              <span aria-hidden="true">·</span>
              <span>Verified Source Materials</span>
              <span aria-hidden="true">·</span>
              <span>Instant Regrading</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.1] text-balance">
              Put grading requirements first. Anchor every mark to source materials.
            </h1>

            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
              Grading written answers is slow, teachers disagree on borderline partial credit, and marking criteria often evolve mid-evaluation. Evalora elevates rubric requirements as the clear headliner and pairs every mark with color-verified evidence inside the student&apos;s source materials.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleLaunchDemo}
                disabled={launching}
                className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 ${flowClasses.primaryCtaButton}`}
              >
                <span>{user ? "Go to Dashboard" : "Try Live Demo Workspace"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <Link
                to="/register"
                className="inline-flex items-center px-5 py-3 rounded-lg border border-slate-300 bg-white text-slate-800 text-sm font-semibold hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                Create Teacher Account
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
              <img
                src="/src/assets/images/hero_grading_workspace_1794937043430.jpg"
                alt="Evalora educator desk with exam papers and rubric grading analytics"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Colorful Flow Spotlight: Requirements Headliner + Source Materials */}
      <section id="flow-spotlight" className="max-w-7xl mx-auto px-6 py-16 w-full">
        <div className={`${flowClasses.headlinerBanner} p-6 sm:p-8 mb-6`}>
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                Assessment Requirements Headliner · Physics · Rubric v2
              </div>
              <h2 className="mt-2 text-xl sm:text-2xl font-extrabold text-white text-balance">
                &ldquo;State Newton&apos;s Second Law of Motion and explain what happens to acceleration if net force doubles while mass stays constant.&rdquo;
              </h2>
              <p className="mt-2 text-sm text-slate-200">
                Click any grading requirement below to trace how Evalora maps rubric criteria directly into the student&apos;s source submission.
              </p>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <div className="text-xs text-slate-300">Verified Score</div>
              <div className="text-3xl font-extrabold font-mono tabular-nums text-white mt-0.5">6 / 6 pts</div>
              <div className="text-xs text-emerald-300 font-medium mt-1">100% Evidence Grounded</div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveReqId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                activeReqId === null
                  ? "bg-white text-slate-900 border-white"
                  : "bg-white/10 text-white border-white/25 hover:bg-white/20"
              }`}
            >
              Show All Requirements (3)
            </button>
            {SPOTLIGHT_REQUIREMENTS.map((req, idx) => {
              const jssCrit = getCriterionJss(idx);
              const isSelected = activeReqId === req.id;
              return (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => setActiveReqId(isSelected ? null : req.id)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                    isSelected ? jssCrit.reqKeyBtnActive : jssCrit.reqKeyBtn
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-sm ${jssCrit.reqSwatch}`} aria-hidden="true" />
                  <span>
                    0{idx + 1}. {req.title} ({req.marks})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`w-full mb-6 ${flowClasses.flowConnectorTrack}`} aria-hidden="true" />

        <div className="grid lg:grid-cols-12 gap-6 items-stretch">
          {/* Left: Requirements Breakdown */}
          <article className={`${flowClasses.requirementsCard} lg:col-span-6 p-6 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <BookOpenCheck className="w-4 h-4 text-[#1D4ED8]" />
                  <h3 className="text-base font-bold text-slate-900">1. Rubric Requirements</h3>
                </div>
                <span className="text-xs font-mono tabular-nums font-semibold text-[#1D4ED8]">3 Criteria · 6 Marks</span>
              </div>

              <div className="mt-4 space-y-3">
                {SPOTLIGHT_REQUIREMENTS.map((req, idx) => {
                  const jssCrit = getCriterionJss(idx);
                  const isSelected = activeReqId === req.id;
                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => setActiveReqId(isSelected ? null : req.id)}
                      className={`w-full text-left p-4 cursor-pointer ${
                        isSelected ? jssCrit.reqCardActive : jssCrit.reqCard
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-900">
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-mono ${jssCrit.reqSwatch}`}
                          >
                            0{idx + 1}
                          </span>
                          <span>{req.title}</span>
                        </span>
                        <span className="text-xs font-bold font-mono tabular-nums text-slate-900">{req.marks}</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">{req.rule}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </article>

          {/* Right: Source Materials & Color-Matched Evidence */}
          <article className={`${flowClasses.sourceMaterialCard} lg:col-span-6 p-6 flex flex-col justify-between`}>
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-emerald-200/70">
                <div className="flex items-center gap-2">
                  <FileSearch className="w-4 h-4 text-[#059669]" />
                  <h3 className="text-base font-bold text-slate-900">2. Source Materials &amp; Evidence</h3>
                </div>
                <span className="text-xs font-medium text-emerald-800">Digital / OCR Verified</span>
              </div>

              <div className="mt-4 p-4 rounded-lg bg-white border border-emerald-100">
                <div className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-2">
                  Student Source Submission (Maya Lin)
                </div>
                <p className="text-sm leading-relaxed text-slate-800">
                  {SPOTLIGHT_SOURCE_SEGMENTS.map((seg, idx) => {
                    if (!seg.reqId) return <span key={idx}>{seg.text}</span>;
                    const reqIdx = SPOTLIGHT_REQUIREMENTS.findIndex((r) => r.id === seg.reqId);
                    const jssCrit = getCriterionJss(reqIdx);
                    const isSelected = activeReqId === seg.reqId;
                    const cls = isSelected
                      ? `${flowClasses.evidenceMark} ${jssCrit.markActive}`
                      : !activeReqId
                        ? `${flowClasses.evidenceMark} ${jssCrit.markIdle}`
                        : `${flowClasses.evidenceMark} ${jssCrit.markDim}`;
                    return (
                      <mark
                        key={idx}
                        onClick={() => setActiveReqId(isSelected ? null : seg.reqId)}
                        className={cls}
                        title="Click to inspect linked requirement"
                      >
                        {seg.text}
                      </mark>
                    );
                  })}
                </p>
              </div>

              <div className="mt-4 grid sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-lg bg-white border border-emerald-100">
                  <div className="font-semibold text-slate-800">Expected Reference Source</div>
                  <p className="mt-1 text-slate-600 leading-relaxed">
                    F_net = ma; doubling net force at constant mass doubles acceleration (SI units: N = kg·m/s²).
                  </p>
                </div>
                <div className="p-3.5 rounded-lg bg-white border border-emerald-100">
                  <div className="font-semibold text-slate-800">OCR &amp; Provenance Signals</div>
                  <p className="mt-1 text-slate-600 leading-relaxed font-mono tabular-nums">
                    OCR Quality: 1.00 · Evidence Coverage: 100% · Reliability: Reliable
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section id="capabilities" className="max-w-7xl mx-auto px-6 pb-16 w-full">
        <div className="max-w-2xl mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
            Built for academic rigor, not black-box guessing
          </h2>
          <p className="mt-2 text-slate-600 text-sm sm:text-base">
            Every architectural layer inside Evalora pairs configurable requirements with verifiable source evidence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className={`${flowClasses.requirementsCard} p-6`}>
            <CheckCircle2 className="w-5 h-5 text-[#1D4ED8] mb-3" />
            <h3 className="text-base font-bold text-slate-900">Verbatim Evidence Grounding</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Every criterion mark cites exact substrings from the student&apos;s source response and is programmatically verified against the raw submission text.
            </p>
          </div>

          <div className={`${flowClasses.ocrWarningCard} p-6`}>
            <ShieldAlert className="w-5 h-5 text-[#D97706] mb-3" />
            <h3 className="text-base font-bold text-slate-900">3-State Reliability Engine</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Flags poor handwriting OCR, arithmetic mismatches, unverified quotes, and ambiguous phrasing as Needs Review or Manual Required.
            </p>
          </div>

          <div className={`${flowClasses.sourceMaterialCard} p-6`}>
            <RefreshCw className="w-5 h-5 text-[#059669] mb-3" />
            <h3 className="text-base font-bold text-slate-900">Versioned Instant Regrading</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Modify criteria or partial-credit rules safely. Regrade one answer or an entire cohort while preserving immutable history and score deltas.
            </p>
          </div>

          <div className={`${flowClasses.indigoAccentCard} p-6`}>
            <BarChart3 className="w-5 h-5 text-[#4F46E5] mb-3" />
            <h3 className="text-base font-bold text-slate-900">Agreement &amp; Evaluation Lab</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Measure MAE, RMSE, Within-1-Mark Agreement, and Weighted Cohen&apos;s Kappa against held-out datasets without data leakage.
            </p>
          </div>
        </div>
      </section>

      {/* Mechanism to Outcome Visual Section */}
      <section id="workflow" className="bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-16 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-5">
            <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3]">
              <img
                src="/src/assets/images/workflow_evidence_verify_1794937044095.jpg"
                alt="Handwritten student biology answer beside structured Evalora grading rubric"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="lg:col-span-7">
            <h2 className="text-2xl font-bold text-slate-900 text-balance">
              Complete End-to-End Evaluation &amp; Calibration Workflow
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Walk through the entire assessment lifecycle inside the live Evalora demo workspace:
            </p>
            <ol className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm text-slate-700">
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>01. Build subject rubrics with 4-tier descriptors &amp; partial credit rules.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#059669] shrink-0 mt-0.5" /><span>02. Upload PDFs, handwritten photos, or digital source answers.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" /><span>03. Preview OCR quality warnings &amp; edit source text before grading.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#4F46E5] shrink-0 mt-0.5" /><span>04. Inspect color-matched verbatim evidence &amp; missing concepts.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#0D9488] shrink-0 mt-0.5" /><span>05. Override uncertain scores with logged rationale.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#E11D48] shrink-0 mt-0.5" /><span>06. Edit a rubric to create v2, regrade instantly, and compare deltas.</span></li>
            </ol>
          </div>
        </div>
      </section>

      <footer className="mt-auto bg-[#0F1E33] text-slate-300 py-8 px-6 text-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <EvaloraLogo theme="dark" size="sm" />
            <span className="text-slate-400">· Smarter Grading. Fairer Evaluation.</span>
          </div>
          <span className="text-slate-400">
            Built on ArturoBarriga/EvaluAI-Project (Apache-2.0 License) · Evidence-verified AI grading
          </span>
        </div>
      </footer>
    </div>
  );
}
