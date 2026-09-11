import React from "react";
import "./B@P.css";

// Put your image files in the "public" folder (e.g. public/hfm-logo.png).
// import.meta.env.BASE_URL is Vite's configured base path — it's "/" locally
// and automatically becomes "/your-repo-name/" when built for GitHub Pages,
// so these plain string paths resolve correctly in both places.
const base = import.meta.env.BASE_URL;

export default function BrokerCards() {
  return (
    <div className="broker-cards-page">
      <div className="content">
        <div className="section-intro">
          <h2>Brokers &amp; prop firms we trust</h2>
          <p>
            Structured courses, live trading sessions, verified signals, and
            a thriving community of real traders.
          </p>
        </div>

        <div className="section-label">Our recommended brokers</div>
        <div className="card-grid">
          <div className="card">
            <div className="card-header">
              <div className="card-logo">
                <img src={`${base}HFM LOGO.png`} alt="HFM logo" />
              </div>
              <div className="card-title-wrap">
                <h3>HFM</h3>
                <span className="badge">
                  <i className="ti ti-star" /> Recommended
                </span>
              </div>
            </div>
            <p className="card-desc">
              Designed from the ground up to suit the needs of all traders,
              from beginners to advanced.
            </p>
            <div className="card-divider" />
            <div className="features">
              <div className="feature-row">
                <i className="ti ti-trending-up" /> Spreads starting from 0.3
                pips
              </div>
              <div className="feature-row">
                <i className="ti ti-scale" /> Leverage up to 1:Unlimited
              </div>
              <div className="feature-row">
                <i className="ti ti-coin" /> Minimum deposit: ZAR 100
              </div>
            </div>
            <a
              className="visit-btn"
              href="https://www.hfm.com/za/en/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Broker <i className="ti ti-arrow-right" />
            </a>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-logo">
                <img src={`${base}space markets logo.png`} alt="Space Markets logo" />
              </div>
              <div className="card-title-wrap">
                <h3>Space Markets</h3>
                <span className="badge">
                  <i className="ti ti-star" /> Recommended
                </span>
              </div>
            </div>
            <p className="card-desc">
              Access a cutting-edge trading platform for maximum performance
              across worldwide markets.
            </p>
            <div className="card-divider" />
            <div className="features">
              <div className="feature-row">
                <i className="ti ti-trending-up" /> Spreads starting from 0.1
                pips
              </div>
              <div className="feature-row">
                <i className="ti ti-scale" /> Leverage up to 1:2000
              </div>
              <div className="feature-row">
                <i className="ti ti-coin" /> Minimum deposit: ZAR 50
              </div>
            </div>
            <a
              className="visit-btn"
              href="https://spacemarkets.io/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Broker <i className="ti ti-arrow-right" />
            </a>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-logo">
                <img src={`${base}XM logo.png`} alt="XM Global logo" />
              </div>
              <div className="card-title-wrap">
                <h3>XM Global</h3>
                <span className="badge">
                  <i className="ti ti-star" /> Recommended
                </span>
              </div>
            </div>
            <p className="card-desc">
              Trusted by over 20 million traders. Easy access to 1400+
              global assets with low spreads and fast execution.
            </p>
            <div className="card-divider" />
            <div className="features">
              <div className="feature-row">
                <i className="ti ti-trending-up" /> Spreads starting from 1.6
                pips
              </div>
              <div className="feature-row">
                <i className="ti ti-scale" /> Leverage up to 1:1000
              </div>
              <div className="feature-row">
                <i className="ti ti-coin" /> Minimum deposit: ZAR 100
              </div>
            </div>
            <a
              className="visit-btn"
              href="https://www.xm.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Broker <i className="ti ti-arrow-right" />
            </a>
          </div>
        </div>

        <div className="section-label">Our recommended prop firms</div>
        <div className="card-grid">
          <div className="card">
            <div className="card-header">
              <div className="card-logo">
                <img src={`${base}equity edge logo.jpg`} alt="Equity Edge logo" />
              </div>
              <div className="card-title-wrap">
                <h3>Equity Edge</h3>
                <span className="badge">
                  <i className="ti ti-star" /> Recommended
                </span>
              </div>
            </div>
            <p className="card-desc">
              Prove your skills with accounts up to $300K. 48-hour payouts,
              up to 90% profit split, 250K+ traders worldwide.
            </p>
            <div className="card-divider" />
            <div className="features">
              <div className="feature-row">
                <i className="ti ti-building-bank" /> Funding up to $300k
              </div>
              <div className="feature-row">
                <i className="ti ti-coin" /> Accounts starting from $15
              </div>
              <div className="feature-row">
                <i className="ti ti-percentage" /> Up to 90% profit split
              </div>
            </div>
            <a
              className="visit-btn"
              href="https://equityedge.io/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Prop Firm <i className="ti ti-arrow-right" />
            </a>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-logo">
                <img src={`${base}FTML logo.png`} alt="FTMO logo" />
              </div>
              <div className="card-title-wrap">
                <h3>FTMO</h3>
                <span className="badge">
                  <i className="ti ti-star" /> Recommended
                </span>
              </div>
            </div>
            <p className="card-desc">
              Trade demo capital with clear objectives using FTMO's
              proprietary trading solution.
            </p>
            <div className="card-divider" />
            <div className="features">
              <div className="feature-row">
                <i className="ti ti-building-bank" /> Funding up to $200k
              </div>
              <div className="feature-row">
                <i className="ti ti-coin" /> Accounts starting from $79
              </div>
              <div className="feature-row">
                <i className="ti ti-percentage" /> Up to 90% profit split
              </div>
            </div>
            <a
              className="visit-btn"
              href="https://ftmo.com/en/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Visit Prop Firm <i className="ti ti-arrow-right" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}