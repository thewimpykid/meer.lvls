import { NextResponse } from "next/server";
import { getDb, ConversionRate } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "2020-01-01";
  const to = searchParams.get("to") ?? "2030-01-01";

  try {
    const db = getDb();
    const rows = db.prepare(
      "SELECT date, nq_close, qqq_close, ratio FROM conversion_rates WHERE date >= ? AND date <= ? ORDER BY date"
    ).all(from, to) as ConversionRate[];
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
