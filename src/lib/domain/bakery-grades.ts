import { z } from "zod";
import calibration from "./bakery-calibration.json";
import { advancedKey } from "./advanced-prospects";

export const bakeryGradeSchema = z.object({
  name: z.string(), position: z.enum(["QB", "RB", "WR", "TE"]), draftYear: z.number().int(), school: z.string(),
  tier: z.string(), grade: z.number().finite(), overall: z.number().min(0).max(100), zScore: z.number().finite().nullable(), draftAge: z.number().finite().nullable().default(null),
});
export type BakeryGrade = z.infer<typeof bakeryGradeSchema>;
export const BAKERY_CALIBRATION = calibration;

/** Index grades by class, position and normalized name; ambiguous keys are dropped rather than guessed. */
export function indexBakeryGrades(grades: BakeryGrade[]) {
  const index = new Map<string, BakeryGrade | null>();
  for (const record of grades) {
    const key = advancedKey(record.name, record.position, record.draftYear);
    index.set(key, index.has(key) ? null : record);
  }
  return index;
}
