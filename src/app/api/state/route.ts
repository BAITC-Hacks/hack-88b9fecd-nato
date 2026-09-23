import { NextRequest, NextResponse } from "next/server";
import { actorFrom, failure } from "@/lib/http";
import { view } from "@/lib/service";
import { repository } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try { return NextResponse.json(view(await repository.read(), actorFrom(request)), { headers: { "Cache-Control": "no-store" } }); } catch (error) { return failure(error); }
}
