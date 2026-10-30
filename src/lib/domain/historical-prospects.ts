export interface ProspectHistory {
  draftPick: number;
  nflPpr: number;
  seasons: { year: number; ppr: number; complete: boolean; throughWeek: number }[];
  complete: boolean;
  window: string;
  sample: string;
  nflUrl: string | null;
}
