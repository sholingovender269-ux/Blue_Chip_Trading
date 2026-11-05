import { useState, useEffect, useCallback, useRef } from "react";
import "./TradingPanel.css";
import { useLivePrice, useLivePrices } from "./useLivePrice";
import {
  getOrCreateDemoAccount,
  fetchOpenPositions,
  fetchClosedPositions,
  openPosition,
  closePosition,
  updatePositionTpSl,
  resetDemoAccount,
  calculatePnl,
  getSymbolDecimals,
  roundToSymbol,
  validateTpSl,
  checkTpSlHit,
  calculateRiskRewardMoney,
  calculateRequiredMargin,
  calculateMaxLots,
  LEVERAGE,
  MIN_LOT,
  MARGIN_CALL_LEVEL,
  STOP_OUT_LEVEL,
} from "./demoTradingApi";

const SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD"];

function formatMoney(n) {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function formatPrice(symbol, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "…";
  const decimals = getSymbolDecimals(symbol);
  return Number(value).toFixed(decimals);
}

export default function TradingPanel({ user, activeSymbol }) {
  const [symbol, setSymbol] = useState(activeSymbol || SYMBOLS[0]);
  const [account, setAccount] = useState(null);
  const [openPositions, setOpenPositions] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [lotSize, setLotSize] = useState(0.01);
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [tpSlError, setTpSlError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [stopOutNotice, setStopOutNotice] = useState(null);
  const [showHistory, setShowHistory] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editTp, setEditTp] = useState("");
  const [editSl, setEditSl] = useState("");
  const [editError, setEditError] = useState(null);

  const { price: livePrice, loading: priceLoading, error: priceError } = useLivePrice(symbol);
  const { prices: allPrices } = useLivePrices();

  const closingRef = useRef(new Set());

  useEffect(() => {
    if (activeSymbol) setSymbol(activeSymbol);
  }, [activeSymbol]);

  const floatingPnl = openPositions.reduce((total, pos) => {
    const currentPrice = allPrices[pos.symbol] ?? pos.entry_price;
    return total + calculatePnl({
      symbol: pos.symbol,
      side: pos.side,
      lotSize: pos.lot_size,
      entryPrice: pos.entry_price,
      currentPrice,
    });
  }, 0);

  const balance = Number(account?.balance ?? 0);
  const equity = balance + floatingPnl;

  const usedMargin = openPositions.reduce(
    (total, pos) =>
      total +
      calculateRequiredMargin({
        symbol: pos.symbol,
        lotSize: pos.lot_size,
        price: pos.entry_price,
      }),
    0
  );

  const freeMargin = equity - usedMargin;
  const marginLevel = usedMargin > 0 ? (equity / usedMargin) * 100 : null;

  const formEntryPrice = livePrice ? roundToSymbol(symbol, livePrice) : null;
  const formLots = Math.round(Number(lotSize) * 100) / 100;
  const requiredMargin = formEntryPrice
    ? calculateRequiredMargin({ symbol, lotSize: formLots, price: formEntryPrice })
    : 0;
  const maxLots = formEntryPrice
    ? calculateMaxLots({ symbol, price: formEntryPrice, freeMargin })
    : 0;
  const insufficientMargin = requiredMargin > freeMargin;
  const lotInvalid = !Number.isFinite(formLots) || formLots < MIN_LOT;

  const loadAccountAndPositions = useCallback(async () => {
    try {
      setLoading(true);
      const acct = await getOrCreateDemoAccount();
      setAccount(acct);
      const [open, closed] = await Promise.all([
        fetchOpenPositions(acct.id),
        fetchClosedPositions(acct.id),
      ]);
      setOpenPositions(open);
      setClosedPositions(closed);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to load demo account");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccountAndPositions();
  }, [loadAccountAndPositions]);

  useEffect(() => {
    if (!livePrice || (!takeProfit && !stopLoss)) {
      setTpSlError(null);
      return;
    }
    const buyCheck = validateTpSl({
      symbol,
      side: "buy",
      entryPrice: livePrice,
      takeProfit: takeProfit || null,
      stopLoss: stopLoss || null,
    });
    const sellCheck = validateTpSl({
      symbol,
      side: "sell",
      entryPrice: livePrice,
      takeProfit: takeProfit || null,
      stopLoss: stopLoss || null,
    });
    if (!buyCheck.valid && !sellCheck.valid) {
      setTpSlError(`Check TP/SL — for Buy: ${buyCheck.error || "ok"} For Sell: ${sellCheck.error || "ok"}`);
    } else {
      setTpSlError(null);
    }
  }, [takeProfit, stopLoss, livePrice, symbol]);

  const handleOpenPosition = async (side) => {
    if (!account || !livePrice || submitting) return;

    if (lotInvalid) {
      setError(`Minimum lot size is ${MIN_LOT}.`);
      return;
    }

    const tpVal = takeProfit !== "" ? Number(takeProfit) : null;
    const slVal = stopLoss !== "" ? Number(stopLoss) : null;

    const check = validateTpSl({
      symbol,
      side,
      entryPrice: livePrice,
      takeProfit: tpVal,
      stopLoss: slVal,
    });
    if (!check.valid) {
      setError(check.error);
      return;
    }

    const entryPrice = roundToSymbol(symbol, livePrice);
    const marginNeeded = calculateRequiredMargin({ symbol, lotSize: formLots, price: entryPrice });
    if (marginNeeded > freeMargin) {
      setError(
        `Not enough free margin. This trade needs ${formatMoney(marginNeeded)} but you have ${formatMoney(
          Math.max(freeMargin, 0)
        )} free. Max lot size right now is ${maxLots.toFixed(2)}.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const newPosition = await openPosition({
        accountId: account.id,
        userId: user.id,
        symbol,
        side,
        lotSize: formLots,
        entryPrice,
        takeProfit: tpVal !== null ? roundToSymbol(symbol, tpVal) : null,
        stopLoss: slVal !== null ? roundToSymbol(symbol, slVal) : null,
      });
      setOpenPositions((prev) => [newPosition, ...prev]);
      setTakeProfit("");
      setStopLoss("");
      setStopOutNotice(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to open position");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClosePosition = useCallback(async (position, exitPriceOverride) => {
    setSubmitting(true);
    setError(null);
    try {
      const exitPrice = exitPriceOverride ?? (allPrices[position.symbol] ?? position.entry_price);
      const { closedPosition, newBalance } = await closePosition({ position, exitPrice });
      setOpenPositions((prev) => prev.filter((p) => p.id !== position.id));
      setClosedPositions((prev) => [closedPosition, ...prev]);
      setAccount((prev) => ({ ...prev, balance: newBalance }));
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to close position");
    } finally {
      setSubmitting(false);
      closingRef.current.delete(position.id);
    }
  }, [allPrices]);

  useEffect(() => {
    openPositions.forEach((pos) => {
      if (closingRef.current.has(pos.id)) return;
      const currentPrice = allPrices[pos.symbol];
      if (currentPrice == null) return;
      const hit = checkTpSlHit({
        side: pos.side,
        currentPrice,
        takeProfit: pos.take_profit,
        stopLoss: pos.stop_loss,
      });
      if (hit) {
        closingRef.current.add(pos.id);
        handleClosePosition(pos, currentPrice);
      }
    });
  }, [allPrices, openPositions, handleClosePosition]);

  useEffect(() => {
    if (usedMargin <= 0 || marginLevel === null) return;
    if (marginLevel >= STOP_OUT_LEVEL) return;
    if (closingRef.current.size > 0) return; // wait for any close in flight

    let worst = null;
    let worstPnl = Infinity;
    openPositions.forEach((pos) => {
      const currentPrice = allPrices[pos.symbol] ?? pos.entry_price;
      const pnl = calculatePnl({
        symbol: pos.symbol,
        side: pos.side,
        lotSize: pos.lot_size,
        entryPrice: pos.entry_price,
        currentPrice,
      });
      if (pnl < worstPnl) {
        worstPnl = pnl;
        worst = pos;
      }
    });

    if (worst) {
      closingRef.current.add(worst.id);
      setStopOutNotice(
        `Stop out: your ${worst.symbol} ${worst.side.toUpperCase()} position was closed because your margin level fell below ${STOP_OUT_LEVEL}%.`
      );
      handleClosePosition(worst, allPrices[worst.symbol] ?? worst.entry_price);
    }
  }, [marginLevel, usedMargin, openPositions, allPrices, handleClosePosition]);

  const handleReset = async () => {
    if (!account) return;
    if (!window.confirm("Reset your demo account? This closes and deletes all positions.")) return;
    setSubmitting(true);
    try {
      const updated = await resetDemoAccount(account.id);
      setAccount(updated);
      setOpenPositions([]);
      setClosedPositions([]);
      setStopOutNotice(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to reset account");
    } finally {
      setSubmitting(false);
    }
  };


  const startEditTpSl = (pos) => {
    setEditingId(pos.id);
    setEditTp(pos.take_profit != null ? String(pos.take_profit) : "");
    setEditSl(pos.stop_loss != null ? String(pos.stop_loss) : "");
    setEditError(null);
  };

  const cancelEditTpSl = () => {
    setEditingId(null);
    setEditTp("");
    setEditSl("");
    setEditError(null);
  };

  const saveEditTpSl = async (pos) => {
    const tpVal = editTp !== "" ? Number(editTp) : null;
    const slVal = editSl !== "" ? Number(editSl) : null;

    const check = validateTpSl({
      symbol: pos.symbol,
      side: pos.side,
      entryPrice: pos.entry_price,
      takeProfit: tpVal,
      stopLoss: slVal,
    });
    if (!check.valid) {
      setEditError(check.error);
      return;
    }

    setSubmitting(true);
    setEditError(null);
    try {
      const updated = await updatePositionTpSl({
        positionId: pos.id,
        takeProfit: tpVal !== null ? roundToSymbol(pos.symbol, tpVal) : null,
        stopLoss: slVal !== null ? roundToSymbol(pos.symbol, slVal) : null,
      });
      setOpenPositions((prev) => prev.map((p) => (p.id === pos.id ? updated : p)));
      cancelEditTpSl();
    } catch (err) {
      console.error(err);
      setEditError(err.message || "Failed to update TP/SL");
    } finally {
      setSubmitting(false);
    }
  };

  const orderFormDecimals = getSymbolDecimals(symbol);

  const rrBuyPreview = livePrice && takeProfit && stopLoss
    ? calculateRiskRewardMoney({
        symbol,
        side: "buy",
        lotSize: Number(lotSize) || 0,
        entryPrice: livePrice,
        takeProfit: Number(takeProfit),
        stopLoss: Number(stopLoss),
      })
    : null;

  const rrSellPreview = livePrice && takeProfit && stopLoss
    ? calculateRiskRewardMoney({
        symbol,
        side: "sell",
        lotSize: Number(lotSize) || 0,
        entryPrice: livePrice,
        takeProfit: Number(takeProfit),
        stopLoss: Number(stopLoss),
      })
    : null;

  const marginCall =
    marginLevel !== null && marginLevel < MARGIN_CALL_LEVEL && marginLevel >= STOP_OUT_LEVEL;

  if (loading) {
    return <div className="trading-panel trading-panel-loading">Loading demo account…</div>;
  }

  return (
    <div className="trading-panel">
      <div className="tp-header">
        <h3>Demo Trading</h3>
        <div className="tp-header-right">
          <span
            className="tp-leverage-badge"
            title={`Leverage 1:${LEVERAGE}. Margin = position value ÷ ${LEVERAGE}. Positions are closed automatically if the margin level falls below ${STOP_OUT_LEVEL}%.`}
          >
            Leverage 1:{LEVERAGE}
          </span>
          <button className="tp-reset-btn" onClick={handleReset} disabled={submitting}>
            Reset
          </button>
        </div>
      </div>

      <div className="tp-account-summary">
        <div className="tp-stat">
          <span className="tp-stat-label">Balance</span>
          <span className="tp-stat-value">{formatMoney(balance)}</span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-label">Equity</span>
          <span className="tp-stat-value">{formatMoney(equity)}</span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-label">Floating P&L</span>
          <span className={`tp-stat-value ${floatingPnl >= 0 ? "positive" : "negative"}`}>
            {formatMoney(floatingPnl)}
          </span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-label">Used Margin</span>
          <span className="tp-stat-value">{formatMoney(usedMargin)}</span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-label">Free Margin</span>
          <span className={`tp-stat-value ${freeMargin < 0 ? "negative" : ""}`}>
            {formatMoney(freeMargin)}
          </span>
        </div>
        <div className="tp-stat">
          <span className="tp-stat-label">Margin Level</span>
          <span
            className={`tp-stat-value ${
              marginLevel !== null && marginLevel < MARGIN_CALL_LEVEL ? "negative" : ""
            }`}
          >
            {marginLevel !== null ? `${marginLevel.toFixed(0)}%` : "—"}
          </span>
        </div>
      </div>

      {error && <div className="tp-error">{error}</div>}
      {stopOutNotice && <div className="tp-error">{stopOutNotice}</div>}
      {marginCall && (
        <div className="tp-warning">
          Margin call: your margin level is {marginLevel.toFixed(0)}%. If it falls below{" "}
          {STOP_OUT_LEVEL}%, your most losing position is closed automatically.
        </div>
      )}
      {priceError && <div className="tp-error">Price feed: {priceError}</div>}
      {tpSlError && <div className="tp-error">{tpSlError}</div>}
      {editError && <div className="tp-error">{editError}</div>}

      <div className="tp-order-form">
        <div className="tp-symbol-select">
          <label>Symbol</label>
          <select
            value={symbol}
            onChange={(e) => {
              setSymbol(e.target.value);
              setTakeProfit("");
              setStopLoss("");
            }}
          >
            {SYMBOLS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="tp-price-display">
          <span className="tp-price-label">Live Price</span>
          <span className="tp-price-value">
            {priceLoading || !livePrice ? "…" : formatPrice(symbol, livePrice)}
          </span>
        </div>

        <div className="tp-lot-input">
          <label>Lot Size</label>
          <input
            type="number"
            min={MIN_LOT}
            step="0.01"
            value={lotSize}
            onChange={(e) => setLotSize(e.target.value)}
          />
        </div>

        <div className="tp-lot-input">
          <label>Take Profit</label>
          <input
            type="number"
            step={1 / Math.pow(10, orderFormDecimals)}
            placeholder={livePrice ? formatPrice(symbol, livePrice) : "optional"}
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
          />
        </div>

        <div className="tp-lot-input">
          <label>Stop Loss</label>
          <input
            type="number"
            step={1 / Math.pow(10, orderFormDecimals)}
            placeholder={livePrice ? formatPrice(symbol, livePrice) : "optional"}
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
          />
        </div>

        <div className={`tp-margin-info ${insufficientMargin ? "tp-margin-info-bad" : ""}`}>
          <span>
            Margin required: <strong>{formatMoney(requiredMargin)}</strong>
          </span>
          <span>
            Free margin: <strong>{formatMoney(Math.max(freeMargin, 0))}</strong>
          </span>
          <span>
            Max size: <strong>{maxLots.toFixed(2)} lots</strong>
          </span>
          <button
            type="button"
            className="tp-max-btn"
            onClick={() => maxLots >= MIN_LOT && setLotSize(maxLots.toFixed(2))}
            disabled={maxLots < MIN_LOT}
          >
            Use max
          </button>
          {insufficientMargin && (
            <span className="tp-margin-warning">Not enough free margin for this lot size.</span>
          )}
        </div>

        {(rrBuyPreview || rrSellPreview) && (
          <div className="tp-rr-preview">
            {rrBuyPreview && (
              <div className="tp-rr-row">
                <span>If Buy:</span>
                <span className="tp-rr-ratio">{rrBuyPreview.rrLabel}</span>
                <span className="tp-rr-money">
                  risk {formatMoney(rrBuyPreview.riskMoney)} / gain {formatMoney(rrBuyPreview.rewardMoney)}
                </span>
              </div>
            )}
            {rrSellPreview && (
              <div className="tp-rr-row">
                <span>If Sell:</span>
                <span className="tp-rr-ratio">{rrSellPreview.rrLabel}</span>
                <span className="tp-rr-money">
                  risk {formatMoney(rrSellPreview.riskMoney)} / gain {formatMoney(rrSellPreview.rewardMoney)}
                </span>
              </div>
            )}
            {balance > 0 && (rrBuyPreview || rrSellPreview) && (
              <div className="tp-rr-row tp-rr-risk-pct">
                Risking {(((rrBuyPreview || rrSellPreview).riskMoney / balance) * 100).toFixed(2)}% of balance
              </div>
            )}
          </div>
        )}

        <div className="tp-order-buttons">
          <button
            className="tp-btn tp-btn-sell"
            onClick={() => handleOpenPosition("sell")}
            disabled={submitting || !livePrice || insufficientMargin || lotInvalid}
          >
            Sell
          </button>
          <button
            className="tp-btn tp-btn-buy"
            onClick={() => handleOpenPosition("buy")}
            disabled={submitting || !livePrice || insufficientMargin || lotInvalid}
          >
            Buy
          </button>
        </div>
      </div>

      <div className="tp-positions-section">
        <div className="tp-tabs">
          <button
            className={`tp-tab ${!showHistory ? "active" : ""}`}
            onClick={() => setShowHistory(false)}
          >
            Open ({openPositions.length})
          </button>
          <button
            className={`tp-tab ${showHistory ? "active" : ""}`}
            onClick={() => setShowHistory(true)}
          >
            History
          </button>
        </div>

        {!showHistory ? (
          <div className="tp-table-wrap">
            {openPositions.length === 0 ? (
              <div className="tp-empty">No open positions.</div>
            ) : (
              <table className="tp-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>Margin</th>
                    <th>TP</th>
                    <th>SL</th>
                    <th>R:R</th>
                    <th>P&L</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {openPositions.map((pos) => {
                    const currentPrice = allPrices[pos.symbol] ?? pos.entry_price;
                    const pnl = calculatePnl({
                      symbol: pos.symbol,
                      side: pos.side,
                      lotSize: pos.lot_size,
                      entryPrice: pos.entry_price,
                      currentPrice,
                    });
                    const posMargin = calculateRequiredMargin({
                      symbol: pos.symbol,
                      lotSize: pos.lot_size,
                      price: pos.entry_price,
                    });
                    const isEditing = editingId === pos.id;
                    const decimals = getSymbolDecimals(pos.symbol);
                    const step = 1 / Math.pow(10, decimals);
                    const rr = calculateRiskRewardMoney({
                      symbol: pos.symbol,
                      side: pos.side,
                      lotSize: pos.lot_size,
                      entryPrice: pos.entry_price,
                      takeProfit: pos.take_profit,
                      stopLoss: pos.stop_loss,
                    });

                    return (
                      <tr key={pos.id}>
                        <td>{pos.symbol}</td>
                        <td className={pos.side === "buy" ? "side-buy" : "side-sell"}>
                          {pos.side.toUpperCase()}
                        </td>
                        <td>{pos.lot_size}</td>
                        <td>{formatPrice(pos.symbol, pos.entry_price)}</td>
                        <td>{formatMoney(posMargin)}</td>

                        {isEditing ? (
                          <>
                            <td>
                              <input
                                type="number"
                                step={step}
                                value={editTp}
                                onChange={(e) => setEditTp(e.target.value)}
                                style={{ width: "90px" }}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={step}
                                value={editSl}
                                onChange={(e) => setEditSl(e.target.value)}
                                style={{ width: "90px" }}
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{pos.take_profit != null ? formatPrice(pos.symbol, pos.take_profit) : "—"}</td>
                            <td>{pos.stop_loss != null ? formatPrice(pos.symbol, pos.stop_loss) : "—"}</td>
                          </>
                        )}

                        <td>{rr ? rr.rrLabel : "—"}</td>

                        <td className={pnl >= 0 ? "positive" : "negative"}>
                          {formatMoney(pnl)}
                        </td>
                        <td>
                          {isEditing ? (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                className="tp-close-btn"
                                onClick={() => saveEditTpSl(pos)}
                                disabled={submitting}
                              >
                                Save
                              </button>
                              <button
                                className="tp-close-btn"
                                onClick={cancelEditTpSl}
                                disabled={submitting}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: "4px" }}>
                              <button
                                className="tp-close-btn"
                                onClick={() => startEditTpSl(pos)}
                                disabled={submitting}
                              >
                                Edit
                              </button>
                              <button
                                className="tp-close-btn"
                                onClick={() => handleClosePosition(pos)}
                                disabled={submitting}
                              >
                                Close
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="tp-table-wrap">
            {closedPositions.length === 0 ? (
              <div className="tp-empty">No closed trades yet.</div>
            ) : (
              <table className="tp-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Lots</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>P&L</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.map((pos) => (
                    <tr key={pos.id}>
                      <td>{pos.symbol}</td>
                      <td className={pos.side === "buy" ? "side-buy" : "side-sell"}>
                        {pos.side.toUpperCase()}
                      </td>
                      <td>{pos.lot_size}</td>
                      <td>{formatPrice(pos.symbol, pos.entry_price)}</td>
                      <td>{formatPrice(pos.symbol, pos.exit_price)}</td>
                      <td className={pos.pnl >= 0 ? "positive" : "negative"}>
                        {formatMoney(pos.pnl)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="tp-footnote">
        Leverage 1:{LEVERAGE} · Margin = position value ÷ {LEVERAGE} · Stop-out at {STOP_OUT_LEVEL}% margin level
      </div>
    </div>
  );
}