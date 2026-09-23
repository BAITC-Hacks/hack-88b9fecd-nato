import { test } from "node:test";
import assert from "node:assert/strict";
import { AiInput, Card, emptyCard } from "../src/lib/domain";
import { analyze, validateOutput } from "../src/lib/ai";
import { fallbackAnalysis } from "../src/lib/ai/fallback";

const input = (description: string): AiInput => ({ description, answers: [], operation: "structure" });
const output = (card: Partial<Card>) => ({ card: { ...emptyCard(), ...card }, known: [], missing: [], questions: [
  { id: "1", field: "materials", text: "Какие материалы доступны для этой задачи?" },
  { id: "2", field: "result", text: "Какой результат должна передать команда?" },
  { id: "3", field: "success", text: "Как вы проверите результат команды?" },
] });

test("AI: безопасное перефразирование звонков не включает fallback", async () => {
  const source = input("Мастера звонят администратору.");
  const paraphrase = "Мастера связываются с администратором по телефону.";
  const result = await analyze(source, async () => output({ context: paraphrase }));
  assert.equal(result.mode, "openai"); assert.equal(result.card.context, paraphrase);
});
test("AI: WhatsApp и ручная запись допускают консервативную переформулировку", () => {
  const source = input("Заявки идут в WhatsApp, менеджер записывает вручную.");
  const paraphrase = "Заявки поступают через WhatsApp и вручную фиксируются менеджером.";
  assert.equal(validateOutput(output({ context: paraphrase }), source).card.context, paraphrase);
});
test("AI: email, телефон, URL, число, процент, бюджет, дата и срок сохраняются точно", () => {
  for (const value of ["help@example.com", "+7 (777) 123-45-67", "https://example.com/Project?id=7", "Обрабатываем 30 заявок.", "Уменьшить ошибки на 15%.", "Бюджет 20000 KZT.", "Срок до 23.09.2026.", "Прототип за 3 недели."]) {
    const field = /@|https:|^\+/.test(value) ? "contact" : "constraints";
    assert.equal(validateOutput(output({ [field]: value }), input(value)).card[field], value);
  }
});
test("AI: новые числа и изменения точных фактов отклоняются", () => {
  for (const [source, invented] of [
    ["Обрабатываем заявки.", "Обрабатываем около 200 заявок в день."],
    ["Есть 30 заявок.", "Есть 300 заявок."],
    ["help@example.com", "sales@example.com"],
    ["+7 (777) 123-45-67", "+7 (777) 123-45-68"],
    ["https://example.com/Project", "https://example.com/project"],
    ["Срок 3 недели.", "Срок 3 дня."],
    ["Бюджет 20000 KZT.", "Бюджет 20000 USD."],
    ["Доля 15%.", "Доля 15."],
    ["Срок 23.09.2026.", "Срок 24.09.2026."],
  ]) assert.throws(() => validateOutput(output({ context: invented }), input(source)), /UNGROUNDED_OUTPUT/);
});
test("AI: число из другого предложения не подтверждает новую метрику", () => {
  assert.throws(() => validateOutput(output({ context: "Есть 30 заявок." }), input("Есть 30 мастеров. Есть заявки.")), /UNGROUNDED_OUTPUT/);
});
test("AI: неизвестное остаётся пустым; новые технологии и смена отрицания не проходят", () => {
  const source = input("Мастера не звонят администратору.");
  const result = validateOutput(output({ context: "Мастера звонят администратору.", result: "Нужна система на PostgreSQL.", contact: "Не указано" }), source);
  assert.equal(result.card.context, ""); assert.equal(result.card.result, ""); assert.equal(result.card.contact, "");
  assert.equal(result.card.materials, "");
  assert.equal(validateOutput(output({ context: "Администратор звонит мастерам." }), input("Мастера звонят администратору.")).card.context, "");
});
test("AI: ответы привязаны к полю, старый черновик не является источником новых фактов", () => {
  const source = { ...input("Нужна система заявок."), answers: [{ field: "users" as const, value: "Пять мастеров" }], card: { ...emptyCard(), contact: "invented@example.com" } };
  assert.equal(validateOutput(output({ materials: "Пять мастеров" }), source).card.materials, "");
  assert.throws(() => validateOutput(output({ contact: "invented@example.com" }), source));
  assert.equal(fallbackAnalysis(source).card.contact, "");
});
test("AI: вопросы без дублей и с приоритетом действительно пустых полей", () => {
  const source = input("Материалы: Обезличенные заявки в CSV");
  const raw = output({ materials: "Обезличенные заявки в CSV" });
  raw.questions[1] = { ...raw.questions[0] };
  const result = validateOutput(raw, source);
  assert.ok(result.questions.length >= 3 && result.questions.length <= 7);
  assert.equal(new Set(result.questions.map(q => q.field)).size, result.questions.length);
  assert.equal(new Set(result.questions.map(q => q.id)).size, result.questions.length);
  assert.ok(result.questions.every(q => q.field !== "materials"));
});
test("AI: невалидная схема и выдуманные точные факты сохраняют явно обозначенный fallback", async () => {
  for (const raw of [{ bad: true }, output({ problem: "Нужно 200 заявок в день." })]) {
    const result = await analyze(input("Нужна система заявок."), async () => raw);
    assert.equal(result.mode, "fallback"); assert.equal(result.card.problem, "Нужна система заявок.");
    assert.ok(!JSON.stringify(result.card).includes("200"));
  }
});
