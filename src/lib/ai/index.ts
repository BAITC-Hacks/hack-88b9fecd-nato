import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AiInput, Analysis, analysisSchema, AnalysisResult, fieldKeys } from "../domain";
import { fallbackAnalysis, questionsForCard } from "./fallback";
import { groundedValue } from "./grounding";
import { SYSTEM_PROMPT } from "./prompts";

export function validateOutput(raw: unknown, input: AiInput): Analysis {
  const output = analysisSchema.parse(raw);
  for (const field of fieldKeys) output.card[field] = groundedValue(field, output.card[field], input);
  output.known = fieldKeys.filter(k => !!output.card[k].trim());
  output.missing = fieldKeys.filter(k => !output.card[k].trim());
  const candidates = [...output.questions.filter(q => output.missing.includes(q.field)), ...questionsForCard(output.card, input.description)];
  const usedFields = new Set<string>(); const usedText = new Set<string>();
  output.questions = candidates.filter(q => {
    const text = q.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (usedFields.has(q.field) || usedText.has(text)) return false;
    usedFields.add(q.field); usedText.add(text); return true;
  }).slice(0, 7).map((q, i) => ({ ...q, id: `q-${i}-${q.field}` }));
  return output;
}
export async function requestOpenAI(input: AiInput): Promise<Analysis> {
  if (!process.env.OPENAI_API_KEY) throw new Error("MISSING_KEY");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, baseURL: "https://api.openai.com/v1", timeout: 20000, maxRetries: 0 });
  const response = await client.responses.parse({ model: process.env.OPENAI_MODEL || "gpt-4.1-mini", store: false, max_output_tokens: 3500, input: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify({ description: input.description, answers: input.answers, operation: input.operation }) }], text: { format: zodTextFormat(analysisSchema, "task_analysis") } });
  return validateOutput(response.output_parsed, input);
}
export function safeCategory(error: unknown): string {
  if (error instanceof Error && /timeout/i.test(error.name)) return "TIMEOUT";
  if (error instanceof OpenAI.APIError) return error.status === 401 || error.status === 403 ? "AUTH" : error.status === 429 ? "QUOTA_OR_RATE_LIMIT" : "API_UNAVAILABLE";
  if (error instanceof Error && ["MISSING_KEY", "UNGROUNDED_OUTPUT", "DISABLED"].includes(error.message)) return error.message;
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
