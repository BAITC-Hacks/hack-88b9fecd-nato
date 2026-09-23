import { randomUUID } from "node:crypto";
import { Actor, Command, Database, emptyCard, PublicTask, Task, ViewState } from "./domain";
import { scoreCard } from "./scoring";
import { seedDatabase } from "./seed";

export class DomainError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export const PROGRESS_POINTS = 25;
export function validateActor(db: Database, actor: Actor) {
  if (!(actor.role === "business" ? db.businesses : db.teams).some(x => x.id === actor.id)) throw new DomainError("Выберите существующий демо-профиль", 403);
}
function ownTask(db: Database, actor: Actor, id: string): Task {
  const task = db.tasks.find(t => t.id === id);
  if (!task) throw new DomainError("Задача не найдена", 404);
  if (actor.role !== "business" || task.businessId !== actor.id) throw new DomainError("Действие доступно бизнесу — автору задачи", 403);
  return task;
}
export function execute(db: Database, actor: Actor, cmd: Command) {
  validateActor(db, actor);
  const now = new Date().toISOString();
  if (cmd.action === "create") {
    if (actor.role !== "business") throw new DomainError("Создание доступно бизнесу", 403);
    const existing = db.tasks.find(t => t.id === cmd.requestId);
    if (existing) { ownTask(db, actor, existing.id); return existing.id; }
    const card = { ...emptyCard(), problem: cmd.description };
    db.tasks.push({ id: cmd.requestId, businessId: actor.id, description: cmd.description, draft: card, confirmed: null, score: 0, previousScore: 0, revision: 0, published: false, createdAt: now, confirmedAt: null });
    return cmd.requestId;
  }
  if (cmd.action === "save" || cmd.action === "publish") {
    const task = ownTask(db, actor, cmd.taskId);
    if (task.revision !== cmd.revision) throw new DomainError("Карточка изменена в другой вкладке. Откройте её заново перед сохранением.", 409);
    if (cmd.action === "save") {
      if (cmd.confirm && !cmd.card.title.trim()) throw new DomainError("Перед подтверждением укажите название");
      task.draft = structuredClone(cmd.card); task.description = cmd.description;
      if (cmd.confirm) { task.previousScore = task.score; task.confirmed = structuredClone(cmd.card); task.score = scoreCard(task.confirmed).total; task.confirmedAt = now; }
    } else {
      if (!task.confirmed) throw new DomainError("Сначала сохраните и подтвердите карточку");
      if (JSON.stringify(task.draft) !== JSON.stringify(task.confirmed)) throw new DomainError("Сначала подтвердите изменения");
      task.published = true;
    }
    task.revision++; return task.id;
  }
  if (cmd.action === "proposal") {
    if (actor.role !== "student") throw new DomainError("Отклик доступен студенческой команде", 403);
    if (!db.tasks.some(t => t.id === cmd.taskId && t.published)) throw new DomainError("Опубликованная задача не найдена", 404);
    const existing = db.proposals.find(p => p.requestId === cmd.requestId && p.teamId === actor.id);
    if (existing) return existing.id;
    const id = randomUUID();
    db.proposals.push({ id, taskId: cmd.taskId, teamId: actor.id, idea: cmd.idea, plan: cmd.plan, timeframe: cmd.timeframe, url: cmd.url, status: "pending", createdAt: now, requestId: cmd.requestId }); return id;
  }
  if (cmd.action === "decision" || cmd.action === "milestone") {
    const proposal = db.proposals.find(p => p.id === cmd.proposalId);
    if (!proposal) throw new DomainError("Отклик не найден", 404);
    if (cmd.action === "decision") { ownTask(db, actor, proposal.taskId); proposal.status = cmd.status; return proposal.id; }
    if (actor.role !== "student" || proposal.teamId !== actor.id || proposal.status !== "accepted") throw new DomainError("Результат может отправить только принятая команда", 403);
    const existing = db.milestones.find(m => m.requestId === cmd.requestId && m.proposalId === proposal.id);
    if (existing) return existing.id;
    const id = randomUUID(); db.milestones.push({ id, proposalId: proposal.id, description: cmd.description, url: cmd.url, confirmedAt: null, createdAt: now, requestId: cmd.requestId }); return id;
  }
  if (cmd.action === "confirmMilestone") {
    const milestone = db.milestones.find(m => m.id === cmd.milestoneId);
    const proposal = db.proposals.find(p => p.id === milestone?.proposalId);
    if (!milestone || !proposal) throw new DomainError("Результат не найден", 404);
    ownTask(db, actor, proposal.taskId);
    if (proposal.status !== "accepted") throw new DomainError("Подтверждение доступно для принятого отклика");
    milestone.confirmedAt ??= now; return milestone.id;
  }
  if (actor.role !== "business") throw new DomainError("Сброс доступен в демо-режиме бизнеса", 403);
  Object.assign(db, seedDatabase()); return "reset";
}
export function view(db: Database, actor: Actor): ViewState {
  validateActor(db, actor);
  const tasks = actor.role === "business" ? db.tasks.filter(t => t.businessId === actor.id) : [];
  const proposals = db.proposals.filter(p => actor.role === "student" ? p.teamId === actor.id : tasks.some(t => t.id === p.taskId));
  const catalog: PublicTask[] = db.tasks.filter(t => t.published && t.confirmed).map(t => ({ id: t.id, businessId: t.businessId, confirmed: t.confirmed, score: t.score, previousScore: t.previousScore, revision: t.revision, published: t.published, createdAt: t.createdAt, confirmedAt: t.confirmedAt })).sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return structuredClone({ businesses: db.businesses, teams: db.teams, tasks, catalog, proposals, milestones: db.milestones.filter(m => proposals.some(p => p.id === m.proposalId)), proposalCounts: Object.fromEntries(db.tasks.map(t => [t.id, db.proposals.filter(p => p.taskId === t.id).length])), teamPoints: Object.fromEntries(db.teams.map(t => [t.id, db.milestones.filter(m => m.confirmedAt && db.proposals.some(p => p.id === m.proposalId && p.teamId === t.id)).length * PROGRESS_POINTS])) });
}
