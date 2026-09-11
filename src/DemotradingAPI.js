import { supabase } from "./supabaseClient";

// Roughly standard contract sizes per instrument type — adjust these to
// match whatever your platform actually models. Kept simple on purpose:
// P&L = price difference * lot_size * contract_size * direction.
const CONTRACT_SIZE = {
  XAUUSD: 100,   // 1 lot = 100 oz
  XAGUSD: 5000,
  NAS100: 1,
  US30: 1,
  DAX: 1,
  DEFAULT_FX: 100000, // standard forex lot
};

function getContractSize(symbol) {
  if (CONTRACT_SIZE[symbol]) return CONTRACT_SIZE[symbol];
  return CONTRACT_SIZE.DEFAULT_FX;
}

// Decimal places each symbol's price/TP/SL should be rounded and
// validated to. JPY pairs = 3, other FX = 5. Extend this if you add
// indices/metals later (e.g. XAUUSD: 2, NAS100: 1).
export function getSymbolDecimals(symbol) {
  if (symbol?.includes("JPY")) return 3;
  return 5;
}

export function roundToSymbol(symbol, value) {
  const decimals = getSymbolDecimals(symbol);
  return Number(Number(value).toFixed(decimals));
}

export function calculatePnl({ symbol, side, lotSize, entryPrice, currentPrice }) {
  const direction = side === "buy" ? 1 : -1;
  const contractSize = getContractSize(symbol);
  return (currentPrice - entryPrice) * direction * lotSize * contractSize;
}

// Validates TP/SL against entry price and side. Returns { valid, error }.
// Buy:  TP must be ABOVE entry, SL must be BELOW entry.
// Sell: TP must be BELOW entry, SL must be ABOVE entry.
export function validateTpSl({ symbol, side, entryPrice, takeProfit, stopLoss }) {
  const decimals = getSymbolDecimals(symbol);
  const entry = roundToSymbol(symbol, entryPrice);

  if (takeProfit !== null && takeProfit !== undefined && takeProfit !== "") {
    const tp = roundToSymbol(symbol, takeProfit);
    if (!Number.isFinite(tp) || tp <= 0) {
      return { valid: false, error: "Take Profit must be a valid price." };
    }
    if (side === "buy" && tp <= entry) {
      return { valid: false, error: `Take Profit must be above entry price (${entry.toFixed(decimals)}) for a Buy.` };
    }
    if (side === "sell" && tp >= entry) {
      return { valid: false, error: `Take Profit must be below entry price (${entry.toFixed(decimals)}) for a Sell.` };
    }
  }

  if (stopLoss !== null && stopLoss !== undefined && stopLoss !== "") {
    const sl = roundToSymbol(symbol, stopLoss);
    if (!Number.isFinite(sl) || sl <= 0) {
      return { valid: false, error: "Stop Loss must be a valid price." };
    }
    if (side === "buy" && sl >= entry) {
      return { valid: false, error: `Stop Loss must be below entry price (${entry.toFixed(decimals)}) for a Buy.` };
    }
    if (side === "sell" && sl <= entry) {
      return { valid: false, error: `Stop Loss must be above entry price (${entry.toFixed(decimals)}) for a Sell.` };
    }
  }

  return { valid: true, error: null };
}

// Computes risk:reward for a trade from entry/SL/TP. Returns null if TP
// or SL is missing (can't compute a ratio without both legs).
// Returns { riskPips, rewardPips, ratio, rrLabel } where rrLabel is a
// friendly "1:2.0" style string, rounded to 1 decimal.
export function calculateRiskReward({ symbol, side, entryPrice, takeProfit, stopLoss }) {
  if (takeProfit == null || stopLoss == null) return null;

  const entry = roundToSymbol(symbol, entryPrice);
  const tp = roundToSymbol(symbol, takeProfit);
  const sl = roundToSymbol(symbol, stopLoss);

  const riskDistance = side === "buy" ? entry - sl : sl - entry;
  const rewardDistance = side === "buy" ? tp - entry : entry - tp;

  if (riskDistance <= 0 || rewardDistance <= 0) return null;

  const ratio = rewardDistance / riskDistance;

  return {
    riskDistance,
    rewardDistance,
    ratio,
    rrLabel: `1:${ratio.toFixed(1)}`,
  };
}

// Dollar risk/reward for a trade, using the same contract-size math as
// P&L, so the order form can show "you're risking $X to make $Y".
export function calculateRiskRewardMoney({ symbol, side, lotSize, entryPrice, takeProfit, stopLoss }) {
  const rr = calculateRiskReward({ symbol, side, entryPrice, takeProfit, stopLoss });
  if (!rr) return null;

  const contractSize = getContractSize(symbol);
  const riskMoney = rr.riskDistance * lotSize * contractSize;
  const rewardMoney = rr.rewardDistance * lotSize * contractSize;

  return { ...rr, riskMoney, rewardMoney };
}

// Checks whether a position's TP or SL has been hit by the current price.
// Returns "tp", "sl", or null.
export function checkTpSlHit({ side, currentPrice, takeProfit, stopLoss }) {
  if (side === "buy") {
    if (takeProfit != null && currentPrice >= takeProfit) return "tp";
    if (stopLoss != null && currentPrice <= stopLoss) return "sl";
  } else {
    if (takeProfit != null && currentPrice <= takeProfit) return "tp";
    if (stopLoss != null && currentPrice >= stopLoss) return "sl";
  }
  return null;
}

// Fetches the user's demo account, creating one via the SQL function
// (ensure_demo_account) if it doesn't exist yet.
export async function getOrCreateDemoAccount() {
  const { data, error } = await supabase.rpc("ensure_demo_account");
  if (error) throw error;
  return data;
}

export async function fetchOpenPositions(accountId) {
  const { data, error } = await supabase
    .from("demo_positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "open")
    .order("opened_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchClosedPositions(accountId, limit = 50) {
  const { data, error } = await supabase
    .from("demo_positions")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function openPosition({
  accountId,
  userId,
  symbol,
  side,
  lotSize,
  entryPrice,
  takeProfit = null,
  stopLoss = null,
}) {
  const { data, error } = await supabase
    .from("demo_positions")
    .insert([{
      account_id: accountId,
      user_id: userId,
      symbol,
      side,
      lot_size: lotSize,
      entry_price: entryPrice,
      take_profit: takeProfit,
      stop_loss: stopLoss,
      status: "open",
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Updates TP/SL on an already-open position. Pass null to clear either.
export async function updatePositionTpSl({ positionId, takeProfit, stopLoss }) {
  const { data, error } = await supabase
    .from("demo_positions")
    .update({
      take_profit: takeProfit,
      stop_loss: stopLoss,
    })
    .eq("id", positionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function closePosition({ position, exitPrice }) {
  const pnl = calculatePnl({
    symbol: position.symbol,
    side: position.side,
    lotSize: position.lot_size,
    entryPrice: position.entry_price,
    currentPrice: exitPrice,
  });

  const { data: closedPosition, error: updateError } = await supabase
    .from("demo_positions")
    .update({
      status: "closed",
      exit_price: exitPrice,
      pnl,
      closed_at: new Date().toISOString(),
    })
    .eq("id", position.id)
    .select()
    .single();
  if (updateError) throw updateError;

  // Apply the realized P&L to the account balance.
  const { data: account, error: fetchError } = await supabase
    .from("demo_accounts")
    .select("balance")
    .eq("id", position.account_id)
    .single();
  if (fetchError) throw fetchError;

  const newBalance = Number(account.balance) + pnl;

  const { error: balanceError } = await supabase
    .from("demo_accounts")
    .update({ balance: newBalance })
    .eq("id", position.account_id);
  if (balanceError) throw balanceError;

  return { closedPosition, newBalance };
}

export async function resetDemoAccount(accountId, startingBalance = 10000) {
  const { error: deleteError } = await supabase
    .from("demo_positions")
    .delete()
    .eq("account_id", accountId);
  if (deleteError) throw deleteError;

  const { data, error: updateError } = await supabase
    .from("demo_accounts")
    .update({ balance: startingBalance })
    .eq("id", accountId)
    .select()
    .single();
  if (updateError) throw updateError;

  return data;
}