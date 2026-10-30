import { z } from "zod";
import type { TradeProposal } from "@/lib/domain/trade/types";

export const advisorRequestSchema = z.object({
  mode: z.enum(["trades", "counter", "team", "changes"]),
  goal: z.enum(["fit", "lineup", "value"]).default("fit"),
  position: z.enum(["any", "QB", "RB", "WR", "TE"]).default("any"),
  keepFirsts: z.boolean().default(false),
  proposal: z.object({
    sideA: z.object({ rosterId: z.string().min(1).max(100), gives: z.array(z.string().max(150)).min(1).max(12) }),
    sideB: z.object({ rosterId: z.string().min(1).max(100), gives: z.array(z.string().max(150)).min(1).max(12) }),
  }).optional(),
}).refine((r) => r.mode !== "counter" || r.proposal, "Choose assets on both sides.");
export type AdvisorRequest = z.infer<typeof advisorRequestSchema>;

export interface AdvisorCard {
  id: string;
  title: string;
  facts: { id: string; text: string; href: string | null }[];
  risks: string[];
  href: string;
  proposal: TradeProposal | null;
  sends: string[];
  receives: string[];
}

export interface AdvisorResult {
  cards: AdvisorCard[];
  source: "ai" | "rules";
  message: string | null;
  cached: boolean;
}

export const selectionSchema = z.object({
  choices: z.array(z.object({ id: z.string(), evidenceIds: z.array(z.string()).min(1).max(3) }).strict()).min(1).max(3),
}).strict();

/** The model selects evidence; it cannot manufacture packages, facts, numbers, or links. */
export function validateSelection(raw: unknown, cards: AdvisorCard[]) {
  const parsed = selectionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const ids = new Set<string>();
  const result: AdvisorCard[] = [];
  for (const choice of parsed.data.choices) {
    const card = cards.find((c) => c.id === choice.id);
    if (!card || ids.has(card.id) || new Set(choice.evidenceIds).size !== choice.evidenceIds.length) return null;
    ids.add(card.id);
    const facts = choice.evidenceIds.map((id) => card.facts.find((f) => f.id === id));
    if (facts.some((f) => !f)) return null;
    result.push({ ...card, facts: facts as AdvisorCard["facts"] });
  }
  return result;
}

export const selectionJsonSchema = {
  type: "object", additionalProperties: false, required: ["choices"],
  properties: { choices: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["id", "evidenceIds"],
    properties: { id: { type: "string" }, evidenceIds: { type: "array", items: { type: "string" } } },
  } } },
};
