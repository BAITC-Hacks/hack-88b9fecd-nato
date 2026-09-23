import { AiInput, Field } from "../domain";

// Разрешённые перефразирования намеренно ограничены. Это не универсальная
// семантическая проверка: незнакомую формулировку оставляем для ручного ввода.
const descriptive = new Set<Field>(["title", "context", "problem", "users", "materials", "access", "result", "feedback"]);
const unknown = /^(?:не указано|неизвестно|не знаю|уточнить|нет информации|нет данных о сроках|tbd|todo)[.!\s]*$/iu;
const compact = (text: string) => text.replace(/\s+/gu, " ").trim();
const qualifiers = (text: string) => (text.toLowerCase().match(/(?<!\p{L})(?:не|нет|без|нельзя|возможно|примерно|около|планируем|планируется|хотим|нужно|нужна|нужен|нужны|должен|должна|должны|может|могут|если)(?!\p{L})/gu) ?? []).sort().join("|");

function canonical(text: string): string {
  return compact(text).toLowerCase().replace(/ё/gu, "е")
    // Сохраняем порядок субъект → действие → адресат при смене оборота речи.
    .replace(/связываются с ([а-я ]+?) по телефону/gu, "звонят $1")
    .replace(/связывается с ([а-я ]+?) по телефону/gu, "звонит $1")
    .replace(/(?:вручную (?:фиксируются|записываются)|(?:фиксируются|записываются) вручную) (менеджером|администратором)/gu, "$1 записывает вручную")
    .replace(/(?:фиксируются|записываются) (менеджером|администратором) вручную/gu, "$1 записывает вручную")
    .replace(/(?<!\p{L})(?:идут|поступают|приходят) (?:через|в)(?!\p{L})/gu, "поступают через")
    .replace(/(?<!\p{L})(?:менеджером|менеджер)(?!\p{L})/gu, "менеджер")
    .replace(/(?<!\p{L})(?:администратором|администратору)(?!\p{L})/gu, "администратору")
    .replace(/(?<!\p{L})(?:записывает|фиксирует)(?!\p{L})/gu, "записывает")
    .replace(/(?<!\p{L})и(?!\p{L})/gu, " ")
    .replace(/[^\p{L}\p{N}@+%/:._-]+/gu, " ").replace(/\.(?=\s|$)/gu, " ").replace(/\s+/gu, " ").trim();
}

// Контакты, числа и их формат не нормализуем: +7, 30, 30%, даты и URL
// должны присутствовать буквально в том же источнике, что и описание.
export function exactFacts(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"»]+|[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}|\+?\d[\d ()-]{7,}\d|\d+(?:[.,:/-]\d+)*(?:\s?%)?/gu)?.map(v => v.replace(/[.,;!?)]+$/u, "")) ?? [];
}

export function groundedValue(field: Field, value: string, input: AiInput): string {
  if (!value.trim() || unknown.test(value.trim())) return "";
  // Только первичные слова пользователя; старый AI-черновик не доказывает факт.
  const sources = [input.description, ...input.answers.filter(a => a.field === field).map(a => a.value)].filter(s => s.trim() && !unknown.test(s.trim()));
  const facts = exactFacts(value);
  const supportedFacts = (source: string) => facts.every(fact => exactFacts(source).includes(fact));
  if (facts.length && !sources.some(supportedFacts)) throw new Error("UNGROUNDED_OUTPUT");
  // Одно предложение не может одалживать число или контакт из другого факта.
  const candidates = sources.flatMap(source => [source, ...source.split(/(?<=[.!?;])\s+|\n/u)]);
  for (const source of candidates) {
    if (!supportedFacts(source) || qualifiers(source) !== qualifiers(value)) continue;
    if (compact(source).includes(compact(value))) return value.trim();
    if (descriptive.has(field)) {
      const original = canonical(source); const proposed = canonical(value);
      if (proposed && (` ${original} `).includes(` ${proposed} `)) return value.trim();
    }
  }
  // Подозрительные точные факты не пропускаем даже в существующем формате.
  if (facts.length || field === "contact") throw new Error("UNGROUNDED_OUTPUT");
  return "";
}
