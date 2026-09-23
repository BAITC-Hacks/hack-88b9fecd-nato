import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AiInput, Analysis, analysisSchema, AnalysisResult, fieldKeys } from "../domain";
import { fallbackAnalysis, normalized } from "./fallback";
import { SYSTEM_PROMPT } from "./prompts";

export function validateOutput(raw: unknown, input: AiInput): Analysis {
  const output = analysisSchema.parse(raw);
  if (new Set(output.questions.map(q => q.id)).size !== output.questions.length) throw new Error("SCHEMA_INVALID");
  const sources = [input.description, ...input.answers.map(a => a.value), ...Object.values(input.card ?? {})].map(normalized);
  for (const value of Object.values(output.card)) if (value.trim() && !sources.some(s => s.includes(normalized(value)))) throw new Error("UNGROUNDED_OUTPUT");
  output.known = fieldKeys.filter(k => !!output.card[k].trim());
  output.missing = fieldKeys.filter(k => !output.card[k].trim());
  return output;
}
export async function requestOpenAI(input: AiInput): Promise<Analysis> {
  if (!process.env.OPENAI_API_KEY) throw new Error("MISSING_KEY");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeout: 20000, maxRetries: 0 });
  const response = await client.responses.parse({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, max_output_tokens: 3500, input: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(input) }], text: { format: zodTextFormat(analysisSchema, "task_analysis") } });
  return validateOutput(response.output_parsed, input);
}
export function safeCategory(error: unknown): string {
  if (error instanceof OpenAI.APIError) return error.status === 401 || error.status === 403 ? "AUTH" : error.status === 429 ? "QUOTA_OR_RATE_LIMIT" : "API_UNAVAILABLE";
  if (error instanceof Error && ["MISSING_KEY", "UNGROUNDED_OUTPUT", "DISABLED"].includes(error.message)) return error.message;
  if (error instanceof Error && /timeout/i.test(error.name)) return "TIMEOUT";
  return "NETWORK_OR_INVALID_OUTPUT";
}
export async function analyze(input: AiInput, provider: (input: AiInput) => Promise<unknown> = requestOpenAI): Promise<AnalysisResult> {
  try {
    if (process.env.AI_MODE === "fallback") throw new Error("DISABLED");
    const result = validateOutput(await provider(input), input);
    return { ...result, mode: "openai" };
  } catch (error) {
    const reason = safeCategory(error);
    console.warn(`[AI Sana] AI_FALLBACK:${reason}`);
    return { ...fallbackAnalysis(input), mode: "fallback", reason };
  }
}
