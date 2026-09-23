import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { Database } from "./domain";
import { seedDatabase } from "./seed";

// Блокировка файла защищает операции даже между worker-процессами Next.js.
export class Repository {
  constructor(readonly filename = process.env.AI_SANA_DATA_FILE || path.join(process.cwd(), ".data", "db.json")) {}
  async transaction<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    const lockPath = `${this.filename}.lock`;
    let lock;
    for (let i = 0; i < 100; i++) {
      try { lock = await open(lockPath, "wx"); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await new Promise(r => setTimeout(r, 30)); }
    }
    if (!lock) throw new Error("STORAGE_BUSY");
    const temp = `${this.filename}.${process.pid}.tmp`;
    try {
      let db: Database;
      try { db = JSON.parse(await readFile(this.filename, "utf8")); if (db.version !== 1 || !Array.isArray(db.tasks)) throw new Error("STORAGE_INVALID"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; db = seedDatabase(); }
      const result = await fn(db);
      const handle = await open(temp, "w");
      try { await handle.writeFile(JSON.stringify(db, null, 2), "utf8"); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, this.filename);
      return result;
    } finally {
      await lock.close();
      await unlink(lockPath);
      await unlink(temp).catch(() => undefined);
    }
  }
  read() { return this.transaction(db => structuredClone(db)); }
}
export const repository = new Repository();
