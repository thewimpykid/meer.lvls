import { DatabaseSync } from "node:sqlite";
import path from "path";

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
    const dbPath = path.join(process.cwd(), "data", "options.db");
    db = new DatabaseSync(dbPath, { open: true });
  }
  return db;
}

export interface ConversionRate {
  date: string;
  nq_close: number;
  qqq_close: number;
  ratio: number;
}

export interface OptionRow {
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
  // computed
  nq_strike: number;
  nq_mid_pts: number;
  nq_value_usd: number;
  qqq_value_usd: number;
}
