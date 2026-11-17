import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, ShieldAlert, RefreshCw, BarChart3, FileText } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { EvaloraLogo } from "../components/EvaloraLogo";
import { useEffect, useState } from "react";

export function LandingPage() {
  const { user, demoLogin } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [launching, setLaunching] = useState(false);

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
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <Link to="/" aria-label="Evalora Home" className="shrink-0">
            <EvaloraLogo theme="light" size="md" />
          </Link>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a href="#problem" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Why Evalora
            </a>
            <a href="#capabilities" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Core Engine
            </a>
            <a href="#workflow" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Demo Flow
            </a>
            <Link to="/login" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Sign In
            </Link>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleLaunchDemo}
              disabled={launching}
              className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              {user ? "Open Workspace" : launching ? "Opening Demo..." : "Launch Interactive Demo"}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-14 lg:py-20 grid lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="text-xs font-semibold text-[#1D4ED8] tracking-wide uppercase mb-2">
              Smarter Grading. Fairer Evaluation.
            </div>
            <div className="text-xs font-medium text-slate-500 flex flex-wrap items-center gap-2 mb-4">
              <span>Evidence-Grounded Assessment</span>
              <span aria-hidden="true">·</span>
              <span>Versioned Rubrics</span>
              <span aria-hidden="true">·</span>
              <span>Instant Regrading</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.1] text-balance">
              Explain every mark with evidence. Regrade instantly when rubrics evolve.
            </h1>

            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
              Grading written answers is slow, teachers disagree on borderline partial credit, and marking criteria often change mid-evaluation. Evalora evaluates conceptual understanding across subjects, anchors every mark to verified quotes from the student&apos;s text, flags unreliable OCR or ambiguous answers, and regrades entire cohorts when rubrics change.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleLaunchDemo}
                disabled={launching}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-blue-800 transition-colors whitespace-nowrap shrink-0"
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
            <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
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

      {/* Capabilities Grid */}
      <section id="capabilities" className="max-w-7xl mx-auto px-6 py-16 w-full">
        <div className="max-w-2xl mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-balance">
            Built for academic rigor, not black-box guessing
          </h2>
          <p className="mt-2 text-slate-600 text-sm sm:text-base">
            Every architectural layer inside Evalora is engineered to keep educators in control of scoring criteria, uncertainty thresholds, and empirical calibration.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <CheckCircle2 className="w-5 h-5 text-[#1D4ED8] mb-3" />
            <h3 className="text-base font-bold text-slate-900">Verbatim Evidence Grounding</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Every criterion mark cites exact substrings from the student&apos;s response and is programmatically verified against the raw submission text.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <ShieldAlert className="w-5 h-5 text-[#D97706] mb-3" />
            <h3 className="text-base font-bold text-slate-900">3-State Reliability Engine</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Flags poor handwriting OCR, arithmetic mismatches, unverified quotes, and ambiguous phrasing as Needs Review or Manual Required—with zero fabricated percentages.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <RefreshCw className="w-5 h-5 text-[#059669] mb-3" />
            <h3 className="text-base font-bold text-slate-900">Versioned Instant Regrading</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Modify criteria or partial-credit rules safely. Regrade one answer or an entire exam while preserving immutable history and criterion-by-criterion score deltas.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <BarChart3 className="w-5 h-5 text-[#0F1E33] mb-3" />
            <h3 className="text-base font-bold text-slate-900">Agreement &amp; Evaluation Lab</h3>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Measure MAE, RMSE, Within-1-Mark Agreement, and Weighted Cohen&apos;s Kappa against held-out datasets with strict Train/Validation/Test leakage protection.
            </p>
          </div>
        </div>
      </section>

      {/* Mechanism to Outcome Visual Section */}
      <section id="problem" className="bg-white border-y border-slate-200">
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
          <div className="lg:col-span-7" id="workflow">
            <h2 className="text-2xl font-bold text-slate-900 text-balance">
              Complete End-to-End Evaluation &amp; Calibration Workflow
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Walk through the entire assessment lifecycle inside the live Evalora demo workspace:
            </p>
            <ol className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-3 text-sm text-slate-700">
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>01. Build subject rubrics with 4-tier descriptors &amp; partial credit rules.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>02. Upload PDFs, handwritten photos, or digital text answers.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>03. Preview OCR quality warnings &amp; edit text before grading.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>04. Inspect highlighted verbatim evidence &amp; missing concepts.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>05. Override uncertain scores with logged rationale.</span></li>
              <li className="flex gap-2.5"><FileText className="w-4 h-4 text-[#1D4ED8] shrink-0 mt-0.5" /><span>06. Edit a rubric to create v2, regrade instantly, and compare deltas.</span></li>
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
