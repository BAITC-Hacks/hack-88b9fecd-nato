import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { Actor } from "./domain";
import { DomainError } from "./service";

export function actorFrom(request: NextRequest): Actor {
  const role = request.headers.get("x-demo-role");
  const id = request.headers.get("x-demo-id");
  if ((role !== "business" && role !== "student") || !id) throw new DomainError("Выберите демо-роль", 403);
  return { role, id };
}
export async function readBody(request: NextRequest) {
  const origin = request.headers.get("origin");
  // Next.js может нормализовать 127.0.0.1 в localhost внутри nextUrl.
  // Host сохраняет адрес, по которому браузер действительно открыл приложение.
  if (origin) {
    let valid = false;
    try { const url = new URL(origin); valid = url.host === request.headers.get("host") && url.protocol === request.nextUrl.protocol; } catch {}
    if (!valid) throw new DomainError("Запрос должен быть отправлен из приложения", 403);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("Пустой запрос");
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 80000) { await reader.cancel(); throw new DomainError("Слишком большой запрос", 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new DomainError("Некорректный JSON"); }
}
export function failure(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  if (error instanceof DomainError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[AI Sana] REQUEST_FAILED");
  return NextResponse.json({ error: "Не удалось сохранить данные. Повторите попытку. При занятом хранилище дождитесь завершения другой операции." }, { status: 500 });
}
