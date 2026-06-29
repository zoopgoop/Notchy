export const theme = {
  background: "#14162B",
  surface: "#1E2142",
  surfaceAlt: "#262A52",
  border: "#33375E",
  text: "#F5F5F7",
  textMuted: "#9499BC",
  primary: "#5B8DEF",
  danger: "#E0544C",
  warning: "#E0A23C",
  frozen: "#6FB3D9",
} as const;

/** Shared lift for surface-backed cards/rows — spread into a style object alongside backgroundColor. */
export const cardShadow = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 4,
} as const;

/** Neutral fallback wherever an exercise has no category to theme off of. */
export const UNCATEGORIZED_COLOR = "#6B6B6B";
export const UNCATEGORIZED_LABEL = "Uncategorized";

/** Per-category color palette — flows through goal cards, calendar blobs, celebrations. */
export const CATEGORY_COLOR_PALETTE = [
  "#5B8DEF",
  "#4CAF50",
  "#FF9800",
  "#E0544C",
  "#9C6ADE",
  "#26C6DA",
  "#EC407A",
  "#8BC34A",
  "#FFD54F",
  "#789262",
];
