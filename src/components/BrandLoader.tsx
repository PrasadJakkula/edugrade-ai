import { EvaloraLogo } from "./EvaloraLogo";

export function BrandLoader({
  label = "Loading workspace...",
}: {
  label?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center justify-center text-center">
      <div className="mb-3">
        <EvaloraLogo theme="light" size="md" />
      </div>
      <div className="w-40 h-1 bg-slate-100 rounded-full overflow-hidden my-2">
        <div className="h-full w-1/2 bg-[#1D4ED8] rounded-full animate-pulse" />
      </div>
      <p className="text-xs font-medium text-slate-600 mt-1">{label}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">Smarter Grading. Fairer Evaluation.</p>
    </div>
  );
}
