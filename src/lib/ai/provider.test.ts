import { afterEach, describe, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ responses: vi.fn(), chat: vi.fn() }));
vi.mock("openai", () => ({ default: class {
  responses = { create: calls.responses };
  chat = { completions: { create: calls.chat } };
} }));
import { createExplanationProvider } from "./provider";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("AI transport", () => {
  const input = { system: "Use evidence", user: "facts", schema: { type: "object" } };
  it("uses structured Responses with storage disabled for OpenAI", async () => {
    vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_BASE_URL", "");
    calls.responses.mockResolvedValue({ output_text: "{}" });
    expect(await createExplanationProvider()!.complete(input)).toBe("{}");
    expect(calls.responses).toHaveBeenCalledWith(expect.objectContaining({ store: false, instructions: input.system, input: input.user, text: { format: { type: "json_schema", name: "evidence_response", strict: true, schema: input.schema } } }));
    expect(calls.chat).not.toHaveBeenCalled();
  });
  it("preserves Chat Completions for compatible custom endpoints", async () => {
    vi.stubEnv("AI_PROVIDER", "openai"); vi.stubEnv("OPENAI_API_KEY", "test-key"); vi.stubEnv("OPENAI_BASE_URL", "http://localhost:11434/v1");
    calls.chat.mockResolvedValue({ choices: [{ message: { content: "{}" } }] });
    expect(await createExplanationProvider()!.complete(input)).toBe("{}");
    expect(calls.chat).toHaveBeenCalled();
    expect(calls.responses).not.toHaveBeenCalled();
  });
  it("never creates requests when explicitly disabled", () => {
    vi.stubEnv("AI_PROVIDER", "none"); vi.stubEnv("OPENAI_API_KEY", "test-key");
    expect(createExplanationProvider()).toBeNull();
  });
});
