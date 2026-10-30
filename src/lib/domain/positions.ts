export const OFFENSE_POSITIONS = ["QB", "RB", "WR", "TE"] as const;
export const IDP_POSITIONS = ["DL", "LB", "DB"] as const;

export const SLOT_ELIGIBILITY: Record<string, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  K: ["K"],
  DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["RB", "WR"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["DB"],
  IDP_FLEX: ["DL", "LB", "DB"],
};

export const NON_STARTING_SLOTS = new Set(["BN", "IR", "TAXI"]);

const POSITION_ALIASES: Record<string, string> = {
  DE: "DL",
  DT: "DL",
  NT: "DL",
  EDGE: "DL",
  OLB: "LB",
  ILB: "LB",
  MLB: "LB",
  CB: "DB",
  S: "DB",
  SS: "DB",
  FS: "DB",
};

export const SLOT_LABELS: Record<string, string> = {
  FLEX: "Flex",
  WRRB_FLEX: "W/R flex",
  REC_FLEX: "W/T flex",
  SUPER_FLEX: "Superflex",
  IDP_FLEX: "IDP flex",
};

export const SLOT_SHORT_LABELS: Record<string, string> = {
  SUPER_FLEX: "SF",
  FLEX: "FLX",
  REC_FLEX: "WRT",
  WR_RB_FLEX: "WRT",
  WRRB_FLEX: "WRT",
  IDP_FLEX: "IDP",
  DEF: "DST",
};

export function normalizePosition(position: string | null | undefined): string | null {
  if (!position) return null;
  const upper = position.toUpperCase();
  return POSITION_ALIASES[upper] ?? upper;
}

export function eligiblePositions(fantasyPositions: string[], position: string | null): string[] {
  const source = fantasyPositions.length ? fantasyPositions : position ? [position] : [];
  return [...new Set(source.map(normalizePosition).filter((p): p is string => p !== null))];
}

export function canFillSlot(slot: string, positions: string[]): boolean {
  const allowed = SLOT_ELIGIBILITY[slot];
  return Boolean(allowed && positions.some((p) => allowed.includes(p)));
}

export function isIdpPosition(position: string | null): boolean {
  return position !== null && (IDP_POSITIONS as readonly string[]).includes(position);
}

export function isIdpSlot(slot: string): boolean {
  return ["DL", "LB", "DB", "IDP_FLEX"].includes(slot);
}

export function primaryPosition(fantasyPositions: string[], position: string | null): string | null {
  return normalizePosition(position) ?? eligiblePositions(fantasyPositions, position)[0] ?? null;
}
