export function EvaloraLogo({
  theme = "light",
  size = "md",
  showTagline = false,
}: {
  theme?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}) {
  const iconDim = size === "sm" ? "w-7 h-7" : size === "lg" ? "w-10 h-10" : "w-8 h-8";
  const textCls =
    size === "sm"
      ? "text-base font-extrabold tracking-tight"
      : size === "lg"
        ? "text-2xl font-extrabold tracking-tight"
        : "text-xl font-extrabold tracking-tight";

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={`${iconDim} shrink-0`}
      >
        <rect
          width="64"
          height="64"
          rx="16"
          fill={theme === "dark" ? "#1E40AF" : "#0F1E33"}
        />
        <path
          d="M19 16H38L45 23V46C45 47.6569 43.6569 49 42 49H19C17.3431 49 16 47.6569 16 46V19C16 17.3431 17.3431 16 19 16Z"
          fill={theme === "dark" ? "#0F1E33" : "#172B48"}
          stroke="#93C5FD"
          strokeWidth="2.2"
        />
        <path d="M22.5 25.5H34" stroke="#F8FAFC" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M22.5 32.5H30" stroke="#CBD5E1" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M22.5 39.5H27.5" stroke="#94A3B8" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="40.5" cy="40.5" r="10.5" fill="#059669" />
        <path
          d="M36.2 40.7L39.1 43.6L44.9 37.8"
          stroke="#FFFFFF"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <span className="inline-flex flex-col leading-none">
        <span
          className={`${textCls} ${theme === "dark" ? "text-white" : "text-slate-900"}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          Evalora
        </span>
        {showTagline && (
          <span
            className={`text-[11px] font-medium mt-1 ${
              theme === "dark" ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Smarter Grading. Fairer Evaluation.
          </span>
        )}
      </span>
    </span>
  );
}
