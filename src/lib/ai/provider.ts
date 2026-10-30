import OpenAI from "openai";

export const PROMPT_VERSION = "player-report-v1";

export interface AiConfig {
  provider: "none" | "openai";
  model: string;
  baseUrl: string | null;
}

export function aiConfig(): AiConfig {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const requested = process.env.AI_PROVIDER || (hasKey ? "openai" : "none");
  return {
    provider: requested === "openai" && hasKey ? "openai" : "none",
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    baseUrl: process.env.OPENAI_BASE_URL || null,
  };
}

export function aiProviderStatus() {
  const config = aiConfig();
  if (config.provider === "none") {
    const fix = process.env.OPENAI_API_KEY ? "Remove AI_PROVIDER=none" : "Set OPENAI_API_KEY";
    return { enabled: false, detail: `Off. Reports use deterministic templates. ${fix} to enable explanations.` };
  }
  return { enabled: true, detail: `OpenAI-compatible: ${config.model}${config.baseUrl ? ` at ${new URL(config.baseUrl).host}` : ""}.` };
}

export interface ExplanationProvider {
  id: string;
  model: string;
  complete(input: { system: string; user: string; schema: Record<string, unknown> }): Promise<string>;
}

export function createExplanationProvider(): ExplanationProvider | null {
  const config = aiConfig();
  if (config.provider !== "openai") return null;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: config.baseUrl ?? undefined, timeout: 45_000, maxRetries: 1 });
  return {
    id: "openai",
    model: config.model,
    async complete({ system, user, schema }) {
      if (!config.baseUrl) {
        const response = await client.responses.create({
          model: config.model,
          instructions: system,
          input: user,
          store: false,
          max_output_tokens: 6000,
          text: { format: { type: "json_schema", name: "evidence_response", strict: true, schema } },
        });
        return response.output_text;
      }
      const response = await client.chat.completions.create({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: "player_explanation", strict: true, schema } },
      });
      return response.choices[0]?.message?.content ?? "";
    },
  };
}
