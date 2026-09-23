import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { aiInputSchema, commandSchema, emptyCard, fieldKeys, Actor } from "../src/lib/domain";
import { meaningful, readinessLevel, scoreCard } from "../src/lib/scoring";
import { seedDatabase } from "../src/lib/seed";
import { execute, view } from "../src/lib/service";
import { Repository } from "../src/lib/storage";
import { analyze, validateOutput } from "../src/lib/ai";
import { fallbackAnalysis } from "../src/lib/ai/fallback";

const business: Actor = { role: "business", id: "b1" };
const student: Actor = { role: "student", id: "team1" };
test("Перезапуск процесса сохраняет задачи и отклики", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-sana-process-test-"));
  try {
    const file = path.join(dir, "db.json");
    const run = promisify(execFile);
    const first = await run(process.execPath, ["--import", "tsx", "tests/storage-worker.ts", file, "write"]);
    const second = await run(process.execPath, ["--import", "tsx", "tests/storage-worker.ts", file, "read"]);
    assert.deepEqual(JSON.parse(second.stdout), JSON.parse(first.stdout));
    assert.deepEqual(JSON.parse(second.stdout), { tasks: 2, proposals: 3 });
  } finally { await rm(dir, { recursive: true, force: true }); }
});
const proposal = (requestId = randomUUID()) => ({ action: "proposal" as const, taskId: "task1", idea: "Сделаем реестр заявок", plan: "Исследование, прототип, проверка", timeframe: "Три недели", url: "", requestId });
test("Рейтинг: границы, детерминизм и все категории дают ровно 100", () => {
  const full = seedDatabase().tasks[3].draft;
  assert.equal(scoreCard(full).total, 100);
  assert.equal(scoreCard(emptyCard()).total, 0);
  assert.deepEqual(scoreCard(full), scoreCard({ ...full }));
  for (let mask = 0; mask < 4096; mask++) { const card = { ...full }; fieldKeys.forEach((k, i) => { if (mask & (1 << i)) card[k] = ""; }); const value = scoreCard(card).total; assert.ok(Number.isInteger(value) && value >= 0 && value <= 100); }
});
test("Заглушки, пробелы и повтор одного слова не дают баллы", () => {
  for (const value of ["", "   ", "потом", "не знаю", "уточнить", "Не указано", "не знаю.", "нет данных", "todo", "тест тест тест тест"]) { const card = emptyCard(); fieldKeys.forEach(k => card[k] = value); assert.equal(scoreCard(card).total, 0, value); }
  assert.equal(meaningful("Данных пока нет; менеджер соберёт 20 обезличенных примеров."), true);
});
test("Частичные баллы зависят от конкретных условий, а не длины", () => {
  const card = { ...emptyCard(), result: "Удобное готовое решение", success: "Бизнесу удобно работать", constraints: "Используем согласованные инструменты" };
  assert.equal(scoreCard(card).total, 20);
  card.result = "Рабочий прототип системы"; card.success = "Проверка всех сценариев"; card.constraints = "Только локальные данные";
  assert.equal(scoreCard(card).total, 40);
});
test("Удаление информации понижает рейтинг; точные границы уровней", () => {
  const full = seedDatabase().tasks[3].draft; assert.equal(scoreCard({ ...full, materials: "" }).total, 90);
  for (const [score, level] of [[0,"Черновик"],[39,"Черновик"],[40,"Рабочая"],[69,"Рабочая"],[70,"Готовая"],[89,"Готовая"],[90,"Приоритетная"],[100,"Приоритетная"]] as const) assert.equal(readinessLevel(score), level);
});
test("Неподтверждённые правки не меняют публичную версию; подтверждение без изменений даёт нулевой прирост", () => {
  const db = seedDatabase(); const task = db.tasks[0]; const initial = task.score; const changed = { ...task.draft, context: "Заявки хранятся в бумажном журнале" };
  execute(db, business, { action: "save", taskId: task.id, card: changed, description: task.description, revision: 1, confirm: false });
  assert.equal(view(db, student).catalog.find(t => t.id === task.id)?.score, initial);
  assert.equal(task.confirmed?.context, "");
  execute(db, business, { action: "save", taskId: task.id, card: changed, description: task.description, revision: 2, confirm: true });
  assert.equal(task.score, initial + 10);
  execute(db, business, { action: "save", taskId: task.id, card: changed, description: task.description, revision: 3, confirm: true });
  assert.equal(task.score - task.previousScore, 0);
  execute(db, business, { action: "save", taskId: task.id, card: { ...changed, context: "" }, description: task.description, revision: 4, confirm: true });
  assert.equal(task.score, initial);
});
test("Отклики доступны при рейтинге ниже 40, квоты нет, повтор запроса идемпотентен", () => {
  const db = seedDatabase(); assert.ok(db.tasks[0].score < 40);
  const cmd = proposal(); const id = execute(db, student, cmd); assert.equal(execute(db, student, cmd), id);
  assert.equal(db.proposals.length, 6);
  for (let i = 0; i < 120; i++) execute(db, student, proposal());
  assert.equal(db.proposals.length, 126);
});
test("Можно не принимать никого или принять несколько команд; другие статусы не изменяются", () => {
  const db = seedDatabase(); assert.equal(db.proposals.filter(p => p.status === "accepted").length, 0);
  execute(db, business, { action: "decision", proposalId: "proposal1", status: "accepted" });
  assert.equal(db.proposals[1].status, "pending");
  execute(db, business, { action: "decision", proposalId: "proposal2", status: "accepted" });
  assert.equal(db.proposals.filter(p => p.taskId === "task1" && p.status === "accepted").length, 2);
});
test("Прогресс: только принятая команда, 25 баллов после ручного подтверждения, без повторного начисления", () => {
  const db = seedDatabase(); const cmd = { action: "milestone" as const, proposalId: "proposal1", description: "Готов прототип реестра заявок", url: "https://example.com/result", requestId: randomUUID() };
  assert.throws(() => execute(db, student, cmd));
  execute(db, business, { action: "decision", proposalId: "proposal1", status: "accepted" });
  assert.equal(view(db, student).teamPoints.team1, 0);
  const id = execute(db, student, cmd); assert.equal(execute(db, student, cmd), id);
  assert.equal(view(db, student).teamPoints.team1, 0);
  execute(db, business, { action: "confirmMilestone", milestoneId: id }); execute(db, business, { action: "confirmMilestone", milestoneId: id });
  assert.equal(view(db, student).teamPoints.team1, 25); assert.equal(db.tasks[0].score, 10);
});
test("Изоляция профилей, конфликт ревизий и URL валидация", () => {
  const db = seedDatabase(); assert.throws(() => execute(db, { role: "business", id: "b2" }, { action: "decision", proposalId: "proposal1", status: "accepted" }));
  assert.throws(() => execute(db, student, { action: "create", description: "Описание задачи", requestId: randomUUID() }));
  assert.throws(() => execute(db, business, { action: "publish", taskId: "task1", revision: 0 }));
  assert.equal(view(db, student).tasks.length, 0); assert.ok(view(db, student).proposals.every(p => p.teamId === student.id));
  assert.equal(commandSchema.safeParse({ ...proposal(), url: "javascript:alert(1)" }).success, false);
  assert.equal(commandSchema.safeParse({ ...proposal(), idea: " " }).success, false);
  assert.equal(aiInputSchema.safeParse({ description: " ", operation: "analyze" }).success, false);
});
test("Каталог: все опубликованные задачи, сортировка по рейтингу и устойчивый второй ключ", () => {
  const db = seedDatabase(); const catalog = view(db, student).catalog; assert.equal(catalog.length, 5); assert.equal(catalog[0].score, 100); assert.ok(catalog.some(t => t.score < 40));
  db.tasks[1].score = db.tasks[0].score;
  const tied = view(db, student).catalog.filter(t => t.score === 10); assert.deepEqual(tied.map(t => t.id), ["task1", "task2"]);
});
test("Публикация требует подтверждения, но не минимального рейтинга", () => {
  const db = seedDatabase(); const id = execute(db, business, { action: "create", description: "Новая короткая задача", requestId: randomUUID() });
  assert.throws(() => execute(db, business, { action: "publish", taskId: id, revision: 0 }));
  execute(db, business, { action: "save", taskId: id, revision: 0, description: "Новая короткая задача", card: { ...emptyCard(), title: "Новая задача" }, confirm: true });
  execute(db, business, { action: "publish", taskId: id, revision: 1 });
  assert.equal(view(db, student).catalog.find(t => t.id === id)?.score, 0);
});
test("AI: ошибки, невалидная схема и выдуманные факты переключают в честный fallback без сетевых запросов", async () => {
  const input = { description: "Нужна система для учёта заявок клиентов нашей мастерской.", answers: [], operation: "analyze" as const };
  for (const provider of [async () => { throw new Error("timeout"); }, async () => ({ wrong: true }), async () => ({ ...fallbackAnalysis(input), card: { ...emptyCard(), contact: "invented@example.com" } })]) { const result = await analyze(input, provider); assert.equal(result.mode, "fallback"); assert.ok(result.questions.length >= 3); assert.equal(result.card.contact, ""); assert.equal(result.card.problem, input.description); }
  const safe = validateOutput(fallbackAnalysis(input), input); assert.ok(safe.known.includes("problem"));
});
test("Fallback переносит ответы и явно подписанные известные поля, неизвестное остаётся пустым", () => {
  const result = fallbackAnalysis({ description: "Название: Реестр заявок\nПользователи: Мастера и администратор\nКонтекст: Заявки приходят по телефону", answers: [{ field: "materials", value: "Данных нет, соберём 20 примеров" }], operation: "structure" });
  assert.equal(result.card.title, "Реестр заявок"); assert.equal(result.card.users, "Мастера и администратор"); assert.equal(result.card.materials, "Данных нет, соберём 20 примеров"); assert.equal(result.card.contact, ""); assert.ok(!result.questions.some(q => q.field === "users"));
});
test("Подробный свободный текст: fallback распознаёт явные факты и не спрашивает их заново", () => {
  const result = fallbackAnalysis({ description: "Сейчас заявки записываем вручную. Пользователи — администраторы мастерской. Есть таблица с 30 примерами заявок. Менеджер предоставит CSV. На выходе ожидаем веб-прототип. Проверим создание и закрытие заявки. Срок — 3 недели. Контакт workshop@example.com. Созвон каждый вторник.", answers: [], operation: "analyze" });
  assert.equal(result.card.users, "Пользователи — администраторы мастерской.");
  assert.ok(result.known.includes("materials"));
  assert.ok(!result.missing.includes("feedback"));
  for (const q of result.questions) if (result.known.includes(q.field)) assert.match(q.text, /Уточните или подтвердите/);
  assert.equal(result.card.industry, "");
});
test("Диск: параллельные записи, новый экземпляр хранилища, задачи/решения/прогресс и сброс", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-sana-test-"));
  try {
    const file = path.join(dir, "db.json"); const repo = new Repository(file);
    const id = await repo.transaction(db => execute(db, business, { action: "create", description: "Новая сохраняемая задача", requestId: randomUUID() }));
    await Promise.all(Array.from({ length: 15 }, () => repo.transaction(db => execute(db, student, proposal()))));
    const milestoneId = await repo.transaction(db => { execute(db, business, { action: "decision", proposalId: "proposal1", status: "accepted" }); return execute(db, student, { action: "milestone", proposalId: "proposal1", description: "Готов первый прототип", url: "https://example.com/m", requestId: randomUUID() }); });
    await repo.transaction(db => execute(db, business, { action: "confirmMilestone", milestoneId }));
    const fresh = new Repository(file); const data = await fresh.read(); assert.equal(data.tasks.length, 6); assert.ok(data.tasks.some(t => t.id === id)); assert.equal(data.proposals.length, 20); assert.equal(data.teams.length, 5); assert.equal(view(data, student).teamPoints.team1, 25);
    await fresh.transaction(db => execute(db, business, { action: "reset", confirmation: "СБРОСИТЬ" }));
    const reset = await new Repository(file).read(); assert.equal(reset.tasks.length, 5); assert.equal(reset.proposals.length, 5); assert.equal(reset.milestones.length, 0); assert.deepEqual(reset, seedDatabase());
  } finally { await rm(dir, { recursive: true, force: true }); }
});
