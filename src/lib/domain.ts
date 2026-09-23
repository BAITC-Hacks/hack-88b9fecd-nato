import { z } from "zod";
z.config(z.locales.ru());

export const fields = {
  title: "Название", industry: "Отрасль / тема", context: "Контекст",
  problem: "Потребность / проблема", users: "Пользователи", materials: "Данные и материалы",
  access: "Источник и доступ к данным", constraints: "Ограничения", result: "Ожидаемый результат",
  success: "Критерии успеха", contact: "Контакт бизнеса", feedback: "Взаимодействие и обратная связь",
} as const;
export type Field = keyof typeof fields;
export const fieldKeys = Object.keys(fields) as Field[];
export const fieldSchema = z.enum(fieldKeys as [Field, ...Field[]]);
export const cardSchema = z.object({
  title: z.string().max(200), industry: z.string().max(120), context: z.string().max(3000),
  problem: z.string().max(3000), users: z.string().max(1500), materials: z.string().max(3000),
  access: z.string().max(1500), constraints: z.string().max(2000), result: z.string().max(2000),
  success: z.string().max(2000), contact: z.string().max(500), feedback: z.string().max(1500),
});
export type Card = z.infer<typeof cardSchema>;
export const emptyCard = (): Card => Object.fromEntries(fieldKeys.map(k => [k, ""])) as Card;
export const questionSchema = z.object({ id: z.string().min(1).max(80), text: z.string().min(5).max(500), field: fieldSchema });
export const analysisSchema = z.object({ card: cardSchema, known: z.array(fieldSchema), missing: z.array(fieldSchema), questions: z.array(questionSchema).min(3).max(7) });
export type Analysis = z.infer<typeof analysisSchema>;
export type AnalysisResult = Analysis & { mode: "openai" | "fallback"; reason?: string };
export const aiInputSchema = z.object({ description: z.string().trim().min(5, "Опишите задачу: минимум 5 символов").max(10000), answers: z.array(z.object({ field: fieldSchema, value: z.string().max(3000) })).max(12).default([]), card: cardSchema.optional(), operation: z.enum(["analyze", "structure"]) });
export type AiInput = z.infer<typeof aiInputSchema>;
export const levels = ["Черновик", "Рабочая", "Готовая", "Приоритетная"] as const;
export type Role = "business" | "student";
export type Actor = { role: Role; id: string };
export type Business = { id: string; name: string };
export type Team = { id: string; name: string; interests: string; skills: string; technologies: string };
export type Task = { id: string; businessId: string; description: string; draft: Card; confirmed: Card | null; score: number; previousScore: number; revision: number; published: boolean; createdAt: string; confirmedAt: string | null };
export type PublicTask = Omit<Task, "draft" | "description">;
export const proposalStatus = { pending: "На рассмотрении", accepted: "Принят", rejected: "Отклонён" } as const;
export type Proposal = { id: string; taskId: string; teamId: string; idea: string; plan: string; timeframe: string; url: string; status: keyof typeof proposalStatus; createdAt: string; requestId: string };
export type Milestone = { id: string; proposalId: string; description: string; url: string; confirmedAt: string | null; createdAt: string; requestId: string };
export type Database = { version: 1; businesses: Business[]; teams: Team[]; tasks: Task[]; proposals: Proposal[]; milestones: Milestone[] };
export type ViewState = { businesses: Business[]; teams: Team[]; tasks: Task[]; catalog: PublicTask[]; proposals: Proposal[]; milestones: Milestone[]; proposalCounts: Record<string, number>; teamPoints: Record<string, number> };
export const httpUrl = z.string().trim().max(1000).refine(v => { try { return ["https:", "http:"].includes(new URL(v).protocol); } catch { return false; } }, "Укажите полный адрес http:// или https://");
const required = z.string().trim().min(5, "Минимум 5 символов").max(3000);
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), description: required.max(10000), requestId: z.string().uuid() }),
  z.object({ action: z.literal("save"), taskId: z.string(), card: cardSchema, description: z.string().max(10000), revision: z.number().int(), confirm: z.boolean() }),
  z.object({ action: z.literal("publish"), taskId: z.string(), revision: z.number().int() }),
  z.object({ action: z.literal("proposal"), taskId: z.string(), idea: required, plan: required, timeframe: required.max(300), url: z.union([httpUrl, z.literal("")]), requestId: z.string().uuid() }),
  z.object({ action: z.literal("decision"), proposalId: z.string(), status: z.enum(["accepted", "rejected", "pending"]) }),
  z.object({ action: z.literal("milestone"), proposalId: z.string(), description: required, url: httpUrl, requestId: z.string().uuid() }),
  z.object({ action: z.literal("confirmMilestone"), milestoneId: z.string() }),
  z.object({ action: z.literal("reset"), confirmation: z.literal("СБРОСИТЬ") }),
]);
export type Command = z.infer<typeof commandSchema>;
