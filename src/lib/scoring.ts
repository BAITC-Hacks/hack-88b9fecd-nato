import { Card, Field } from "./domain";

const filler = /^(потом|не знаю|уточнить|не указано|нет|неизвестно|тест|todo|tbd|n\/?a|нет данных|будет позже|не определено)([.!?\s]*)$/iu;
export function meaningful(value: string): boolean {
  const text = value.trim();
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return !filler.test(text) && new Set(words).size >= 2 && words.join("").length >= 8;
}
export const readinessLevel = (score: number) => score < 40 ? "Черновик" : score < 70 ? "Рабочая" : score < 90 ? "Готовая" : "Приоритетная";
type Criterion = { field: Field; points: number; label: string; check: (value: string) => boolean };
type Category = { name: string; criteria: Criterion[] };
const artifact = /прототип|систем|приложени|сайт|панел|отч[её]т|модел|макет|бот|дашборд|таблиц|интерфейс|исследован|карта|документ|сервис|алгоритм|анализ|дизайн|план/iu;
const verify = /\d|провер|тест|при[её]м|демонстрац|сценари|экспорт|импорт|без ошибок|подтвержд|чек.?лист/iu;
const boundary = /\d|нельзя|только|без |запрещ|не более|не менее|огранич|доступ|бюджет|срок|персональ|локаль|открыт|не требу/iu;
const contact = (v: string) => /[^\s@]+@[^\s@]+\.[^\s@]+|https?:\/\/\S+|\+\d[\d ()-]{8,}/u.test(v.trim());
export const categories: Category[] = [
  { name: "Контекст и потребность", criteria: [{ field: "context", points: 10, label: "Опишите текущий процесс", check: meaningful }, { field: "problem", points: 10, label: "Опишите конкретную проблему", check: meaningful }] },
  { name: "Данные и материалы", criteria: [{ field: "materials", points: 10, label: "Перечислите материалы или план их сбора", check: meaningful }, { field: "access", points: 10, label: "Укажите источник и способ получения данных", check: meaningful }] },
  { name: "Ожидаемый результат", criteria: [{ field: "result", points: 10, label: "Опишите ожидаемый результат", check: meaningful }, { field: "result", points: 5, label: "Назовите артефакт: прототип, отчёт, сайт, модель…", check: v => meaningful(v) && artifact.test(v) }] },
  { name: "Критерии успеха", criteria: [{ field: "success", points: 5, label: "Опишите условие успешного выполнения", check: meaningful }, { field: "success", points: 10, label: "Добавьте число или способ проверки: тест, демонстрация, чек-лист…", check: v => meaningful(v) && verify.test(v) }] },
  { name: "Ограничения", criteria: [{ field: "constraints", points: 5, label: "Опишите границы проекта", check: meaningful }, { field: "constraints", points: 5, label: "Уточните срок, доступ, запрет или отсутствие ограничений", check: v => meaningful(v) && boundary.test(v) }] },
  { name: "Пользователи", criteria: [{ field: "users", points: 10, label: "Назовите пользователей решения", check: meaningful }] },
  { name: "Связь с бизнесом", criteria: [{ field: "contact", points: 5, label: "Добавьте email, телефон или ссылку для связи", check: contact }, { field: "feedback", points: 5, label: "Опишите порядок консультаций и обратной связи", check: meaningful }] },
];
export function scoreCard(card: Card) {
  const breakdown = categories.map(category => {
    const criteria = category.criteria.map(c => ({ field: c.field, label: c.label, max: c.points, earned: c.check(card[c.field]) ? c.points : 0 }));
    return { name: category.name, criteria, earned: criteria.reduce((a, c) => a + c.earned, 0), max: criteria.reduce((a, c) => a + c.max, 0) };
  });
  const total = breakdown.reduce((a, c) => a + c.earned, 0);
  return { total, level: readinessLevel(total), breakdown, recommendations: breakdown.flatMap(c => c.criteria.filter(x => !x.earned).map(x => `${x.label} (+${x.max})`)) };
}
