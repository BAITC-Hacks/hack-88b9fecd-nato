import { Repository } from "../src/lib/storage";
import { execute, view } from "../src/lib/service";
import { randomUUID } from "node:crypto";
const repo = new Repository(process.argv[2]);
if (process.argv[3] === "write") {
  await repo.transaction(db => { execute(db, { role: "business", id: "b1" }, { action: "create", description: "Задача из отдельного серверного процесса", requestId: randomUUID() }); execute(db, { role: "student", id: "team1" }, { action: "proposal", taskId: "task1", idea: "Прототип реестра заявок", plan: "Создать интерфейс и провести проверку", timeframe: "Три недели", url: "", requestId: randomUUID() }); });
}
const state = view(await repo.read(), { role: "business", id: "b1" });
console.log(JSON.stringify({ tasks: state.tasks.length, proposals: state.proposals.length }));
