import jss from "jss";
import preset from "jss-preset-default";

let initialized = false;
if (!initialized) {
  jss.setup(preset());
  initialized = true;
}

export interface CriterionColorToken {
  name: string;
  accent: string;
  softBg: string;
  border: string;
  markBg: string;
  markActiveBg: string;
  ink: string;
}

export const CRITERION_PALETTE: CriterionColorToken[] = [
  {
    name: "Sapphire",
    accent: "#1D4ED8",
    softBg: "#EFF6FF",
    border: "#BFDBFE",
    markBg: "#DBEAFE",
    markActiveBg: "#93C5FD",
    ink: "#1E3A8A",
  },
  {
    name: "Emerald",
    accent: "#059669",
    softBg: "#ECFDF5",
    border: "#A7F3D0",
    markBg: "#D1FAE5",
    markActiveBg: "#6EE7B7",
    ink: "#064E3B",
  },
  {
    name: "Amber",
    accent: "#D97706",
    softBg: "#FFFBEB",
    border: "#FDE68A",
    markBg: "#FEF3C7",
    markActiveBg: "#FCD34D",
    ink: "#78350F",
  },
  {
    name: "Indigo",
    accent: "#4F46E5",
    softBg: "#EEF2FF",
    border: "#C7D2FE",
    markBg: "#E0E7FF",
    markActiveBg: "#A5B4FC",
    ink: "#312E81",
  },
  {
    name: "Teal",
    accent: "#0D9488",
    softBg: "#F0FDFA",
    border: "#99F6E4",
    markBg: "#CCFBF1",
    markActiveBg: "#5EEAD4",
    ink: "#134E4A",
  },
  {
    name: "Rose",
    accent: "#E11D48",
    softBg: "#FFF1F2",
    border: "#FECDD3",
    markBg: "#FFE4E6",
    markActiveBg: "#FDA4AF",
    ink: "#881337",
  },
];

export function getCriterionColor(index: number): CriterionColorToken {
  return CRITERION_PALETTE[Math.abs(index) % CRITERION_PALETTE.length];
}

const jssStyles = {
  heroCanvas: {
    background:
      "radial-gradient(circle at 12% 18%, rgba(29, 78, 216, 0.10) 0%, transparent 45%), radial-gradient(circle at 88% 22%, rgba(5, 150, 105, 0.10) 0%, transparent 42%), linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
    borderBottom: "1px solid #E2E8F0",
  },
  sidebarShell: {
    background: "linear-gradient(180deg, #0F1E33 0%, #152A4A 58%, #0E223D 100%)",
  },
  headlinerBanner: {
    background: "linear-gradient(130deg, #0F1E33 0%, #1E3A8A 55%, #0F766E 100%)",
    color: "#FFFFFF",
    borderRadius: "14px",
    border: "1px solid rgba(147, 197, 253, 0.25)",
    boxShadow: "0 10px 28px -10px rgba(15, 30, 51, 0.35)",
  },
  headlinerSpotlightSubtle: {
    background:
      "radial-gradient(circle at 92% 10%, rgba(16, 185, 129, 0.16) 0%, transparent 42%), linear-gradient(135deg, #0F1E33 0%, #1D4ED8 100%)",
    color: "#FFFFFF",
    borderRadius: "12px",
    border: "1px solid rgba(147, 197, 253, 0.28)",
  },
  requirementsCard: {
    background: "linear-gradient(180deg, #F5F8FF 0%, #FFFFFF 90px)",
    border: "1px solid #BFDBFE",
    borderTop: "3px solid #1D4ED8",
    borderRadius: "12px",
  },
  sourceMaterialCard: {
    background: "linear-gradient(180deg, #ECFDF7 0%, #FFFFFF 90px)",
    border: "1px solid #A7F3D0",
    borderTop: "3px solid #059669",
    borderRadius: "12px",
  },
  ocrWarningCard: {
    background: "linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 90px)",
    border: "1px solid #FDE68A",
    borderTop: "3px solid #D97706",
    borderRadius: "12px",
  },
  indigoAccentCard: {
    background: "linear-gradient(180deg, #EEF2FF 0%, #FFFFFF 90px)",
    border: "1px solid #C7D2FE",
    borderTop: "3px solid #4F46E5",
    borderRadius: "12px",
  },
  tealAccentCard: {
    background: "linear-gradient(180deg, #F0FDFA 0%, #FFFFFF 90px)",
    border: "1px solid #99F6E4",
    borderTop: "3px solid #0D9488",
    borderRadius: "12px",
  },
  kpiBlue: {
    background: "linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 64%)",
    border: "1px solid #BFDBFE",
    borderTop: "3px solid #1D4ED8",
    borderRadius: "12px",
  },
  kpiAmber: {
    background: "linear-gradient(180deg, #FFFBEB 0%, #FFFFFF 64%)",
    border: "1px solid #FDE68A",
    borderTop: "3px solid #D97706",
    borderRadius: "12px",
  },
  kpiEmerald: {
    background: "linear-gradient(180deg, #ECFDF5 0%, #FFFFFF 64%)",
    border: "1px solid #A7F3D0",
    borderTop: "3px solid #059669",
    borderRadius: "12px",
  },
  kpiIndigo: {
    background: "linear-gradient(180deg, #EEF2FF 0%, #FFFFFF 64%)",
    border: "1px solid #C7D2FE",
    borderTop: "3px solid #4F46E5",
    borderRadius: "12px",
  },
  primaryCtaButton: {
    background: "linear-gradient(135deg, #1D4ED8 0%, #2563EB 60%, #0D9488 100%)",
    color: "#FFFFFF",
    transition: "transform 160ms cubic-bezier(0.16, 1, 0.3, 1), filter 160ms ease",
    "&:hover": {
      transform: "translateY(-1px)",
      filter: "brightness(1.06)",
    },
  },
  evidenceMark: {
    cursor: "pointer",
    borderRadius: "4px",
    padding: "1px 5px",
    fontWeight: 500,
    transition: "background-color 150ms ease, box-shadow 150ms ease",
  },
  flowConnectorTrack: {
    height: "2px",
    background: "linear-gradient(90deg, #1D4ED8 0%, #4F46E5 45%, #059669 100%)",
    borderRadius: "999px",
  },
  ...CRITERION_PALETTE.reduce<Record<string, any>>((acc, tok, idx) => {
    acc[`markIdle_${idx}`] = {
      backgroundColor: tok.markBg,
      color: tok.ink,
      borderBottom: `2px solid ${tok.accent}`,
    };
    acc[`markActive_${idx}`] = {
      backgroundColor: tok.markActiveBg,
      color: "#0F172A",
      boxShadow: `0 0 0 2px ${tok.accent}`,
      borderBottom: `2px solid ${tok.accent}`,
    };
    acc[`markDim_${idx}`] = {
      backgroundColor: "#F1F5F9",
      color: "#64748B",
    };
    acc[`reqCard_${idx}`] = {
      backgroundColor: "#FFFFFF",
      border: "1px solid #E2E8F0",
      borderTop: `3px solid ${tok.accent}`,
      borderRadius: "10px",
      transition: "border-color 150ms ease, background-color 150ms ease",
      "&:hover": {
        borderColor: tok.border,
        backgroundColor: tok.softBg,
      },
    };
    acc[`reqCardActive_${idx}`] = {
      backgroundColor: tok.softBg,
      border: `1px solid ${tok.accent}`,
      borderTop: `3px solid ${tok.accent}`,
      borderRadius: "10px",
    };
    acc[`reqSwatch_${idx}`] = {
      backgroundColor: tok.accent,
      color: "#FFFFFF",
    };
    acc[`reqKeyBtn_${idx}`] = {
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      border: `1px solid rgba(255, 255, 255, 0.24)`,
      color: "#FFFFFF",
      transition: "background-color 150ms ease, transform 150ms ease",
      "&:hover": {
        backgroundColor: "rgba(255, 255, 255, 0.22)",
        transform: "translateY(-1px)",
      },
    };
    acc[`reqKeyBtnActive_${idx}`] = {
      backgroundColor: tok.accent,
      border: "1px solid #FFFFFF",
      color: "#FFFFFF",
    };
    return acc;
  }, {}),
};

const sheet = jss.createStyleSheet(jssStyles, { meta: "evalora-flow-jss" }).attach();

export const flowClasses = sheet.classes as Record<string, string>;

export function getCriterionJss(index: number) {
  const i = Math.abs(index) % CRITERION_PALETTE.length;
  return {
    token: CRITERION_PALETTE[i],
    markIdle: flowClasses[`markIdle_${i}`],
    markActive: flowClasses[`markActive_${i}`],
    markDim: flowClasses[`markDim_${i}`],
    reqCard: flowClasses[`reqCard_${i}`],
    reqCardActive: flowClasses[`reqCardActive_${i}`],
    reqSwatch: flowClasses[`reqSwatch_${i}`],
    reqKeyBtn: flowClasses[`reqKeyBtn_${i}`],
    reqKeyBtnActive: flowClasses[`reqKeyBtnActive_${i}`],
  };
}
