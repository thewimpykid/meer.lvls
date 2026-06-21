import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RawOption {
  date: string;
  option_symbol: string;
  expiration: string;
  side: string;
  strike: number;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  open_interest: number;
  underlying_price: number;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const side = searchParams.get("side") ?? "both"; // call | put | both
  const minDte = parseInt(searchParams.get("min_dte") ?? "0");
  const maxDte = parseInt(searchParams.get("max_dte") ?? "365");
  // strike range as % from ATM (e.g. 10 = ±10%)
  const strikeRange = parseFloat(searchParams.get("strike_range") ?? "15");

  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });

  try {
    const db = getDb();

    const rate = db
      .prepare("SELECT ratio, nq_close, qqq_close FROM conversion_rates WHERE date = ?")
      .get(date) as { ratio: number; nq_close: number; qqq_close: number } | undefined;

    if (!rate) {
      return NextResponse.json({ error: "no conversion rate for date" }, { status: 404 });
    }

    // Get ATM price to filter strikes
    const atmRow = db
      .prepare("SELECT underlying_price FROM options_chain WHERE date = ? LIMIT 1")
      .get(date) as { underlying_price: number } | undefined;

    const atm = atmRow?.underlying_price ?? 0;
    const lo = atm * (1 - strikeRange / 100);
    const hi = atm * (1 + strikeRange / 100);

    let sideFilter = "";
    if (side === "call") sideFilter = "AND side = 'call'";
    else if (side === "put") sideFilter = "AND side = 'put'";

    const rows = db
      .prepare(
        `SELECT date, option_symbol, expiration, side, strike, dte,
                bid, ask, mid, last, volume, open_interest, underlying_price
         FROM options_chain
         WHERE date = ?
           AND dte >= ? AND dte <= ?
           AND strike >= ? AND strike <= ?
           ${sideFilter}
         ORDER BY side, strike ASC`
      )
      .all(date, minDte, maxDte, lo, hi) as unknown as RawOption[];

    const { ratio } = rate;
    const enriched = rows.map((r) => ({
      ...r,
      nq_strike: Math.round(r.strike * ratio * 4) / 4,       // round to nearest 0.25
      nq_mid_pts: parseFloat((r.mid * ratio).toFixed(2)),
      nq_value_usd: parseFloat((r.mid * ratio * 20).toFixed(2)),
      qqq_value_usd: parseFloat((r.mid * 100).toFixed(2)),
    }));

    return NextResponse.json({
      date,
      ratio: parseFloat(rate.ratio.toFixed(4)),
      nq_close: rate.nq_close,
      qqq_close: rate.qqq_close,
      atm,
      rows: enriched,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
