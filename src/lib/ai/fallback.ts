import { AiInput, Analysis, Card, emptyCard, Field, fieldKeys, fields } from "../domain";
import { meaningful } from "../scoring";

const questions: Record<Field, string> = {
  title: "Как назвать задачу, чтобы команда сразу поняла её смысл?",
  industry: "К какой отрасли относится ваша задача?",
  context: "Как вы работаете сейчас и на каком этапе возникает затруднение?",
  problem: "Какую конкретную проблему нужно решить?",
  users: "Кто будет пользоваться решением и для каких действий?",
  materials: "Какие данные или примеры уже есть? Если их нет, как вы планируете их собрать?",
  access: "Кто и каким способом предоставит команде доступ к материалам?",
  result: "Что команда должна передать в конце: прототип, отчёт, сайт или другой результат?",
  success: "Каким тестом, сценарием или показателем вы проверите результат?",
  constraints: "Какие сроки, ограничения доступа или технологии необходимо учесть?",
  contact: "Какой рабочий контакт можно указать для связи с бизнесом?",
  feedback: "Как часто и в каком формате вы готовы отвечать на вопросы команды?",
};
export const normalized = (v: string) => v.replace(/\s+/gu, " ").trim().toLowerCase();
export function extractedCard(input: AiInput): Card {
  const card = { ...emptyCard(), ...input.card };
  // Явные подписи поддерживают подробное описание без угадывания фактов.
  for (const line of input.description.split("\n")) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = fieldKeys.find(k => normalized(line.slice(0, colon)) === normalized(fields[k]) || k === line.slice(0, colon).trim());
    if (key) card[key] = line.slice(colon + 1).trim().slice(0, key === "title" ? 200 : key === "industry" ? 120 : key === "contact" ? 500 : 1500);
  }
  // Консервативно переносим целые предложения с явными признаками поля.
  // Никаких добавленных слов: даже при неоднозначности исходная цитата сохранена.
  const hints: Partial<Record<Field, RegExp>> = {
    context: /сейчас|в настоящее время|вручную|текущий процесс/iu,
    problem: /проблем|теря[ею]|нужна|нужен|хотим|сложно/iu,
    users: /пользовател|пользоваться будут|решение для|для администратор|для сотрудник|для студент/iu,
    materials: /есть .*(?:данн|таблиц|csv|пример)|имеется|выгрузк|набор данных|нет данных|материалы/iu,
    access: /предостав|переда[дст]|получить доступ|доступ выда|выдаст/iu,
    constraints: /срок|бюджет|не более|не позднее|за \d+ недел|огранич|без персональ/iu,
    result: /ожидаем|в результате|на выходе|нужен прототип|результат[ —:-]|команда .*(?:переда|созда)/iu,
    success: /критери|примем|проверим|проверка|тест .*(?:пройд|проход)/iu,
    contact: /[^\s@]+@[^\s@]+\.[^\s@]+/u,
    feedback: /созвон|консультац|отвечаем|обратн.*связ/iu,
  };
  const sentences = input.description.split(/(?<=[.!?])\s+|\n/u).map(s => s.trim()).filter(Boolean);
  for (const key of fieldKeys) {
    if (card[key] || !hints[key]) continue;
    const sentence = sentences.find(s => hints[key]!.test(s));
    if (sentence) card[key] = sentence.slice(0, key === "contact" ? 500 : 1500);
  }
  if (!card.problem) card.problem = input.description.slice(0, 3000);
  for (const answer of input.answers) if (answer.value.trim()) card[answer.field] = answer.value.trim().slice(0, answer.field === "title" ? 200 : answer.field === "industry" ? 120 : answer.field === "contact" ? 500 : 1500);
  return card;
}
export function fallbackAnalysis(input: AiInput): Analysis {
  const card = extractedCard(input);
  const known = fieldKeys.filter(k => !!card[k].trim());
  const missing = fieldKeys.filter(k => !card[k].trim());
  const priority: Field[] = ["context", "users", "materials", "access", "result", "success", "constraints", "contact", "feedback", "title", "industry", "problem"];
  const needed = priority.filter(k => !meaningful(card[k]));
  const targets = [...needed, ...priority.filter(k => !needed.includes(k))].slice(0, Math.max(3, Math.min(7, needed.length)));
  return { card, known, missing, questions: targets.map((field, i) => ({ id: `q-${i}-${field}`, field, text: card[field] ? `Уточните или подтвердите поле «${fields[field]}»: ${questions[field]}` : questions[field] })) };
}
