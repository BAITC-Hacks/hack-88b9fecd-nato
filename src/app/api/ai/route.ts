import { NextRequest, NextResponse } from "next/server";
import { aiInputSchema } from "@/lib/domain";
import { analyze } from "@/lib/ai";
import { actorFrom, failure, readBody } from "@/lib/http";
import { DomainError, validateActor } from "@/lib/service";
import { repository } from "@/lib/storage";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = actorFrom(request); if (actor.role !== "business") throw new DomainError("Анализ доступен бизнесу", 403);
    validateActor(await repository.read(), actor);
    const input = aiInputSchema.parse(await readBody(request));
    if (JSON.stringify(input).length > 22000) throw new DomainError("Сократите описание и ответы до 22 000 символов");
    return NextResponse.json(await analyze(input));
  } catch (error) { return failure(error); }
}
