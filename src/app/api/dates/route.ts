import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const stmt = db.prepare("SELECT date FROM conversion_rates ORDER BY date");
    const rows = stmt.all() as unknown as { date: string }[];
    return NextResponse.json(rows.map((r) => r.date));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
