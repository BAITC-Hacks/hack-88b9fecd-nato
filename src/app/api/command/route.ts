import { NextRequest, NextResponse } from "next/server";
import { commandSchema } from "@/lib/domain";
import { actorFrom, failure, readBody } from "@/lib/http";
import { execute, view } from "@/lib/service";
import { repository } from "@/lib/storage";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = actorFrom(request); const command = commandSchema.parse(await readBody(request));
    const result = await repository.transaction(db => ({ id: execute(db, actor, command), state: view(db, actor) }));
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
