// A curated list of common tickers so the chart modal offers a searchable
// pick-list instead of free typing. `price` seeds the synthetic series at a
// realistic level (company name + price are auto-filled on select). These are
// approximate reference levels — real-time data swaps in once a market-data
// key is configured.

export interface TickerInfo {
  symbol: string;
  name: string;
  price: number; // approximate reference price, used to center synthetic candles
}

export const TICKERS: TickerInfo[] = [
  { symbol: "AAPL", name: "Apple Inc.", price: 215 },
  { symbol: "MSFT", name: "Microsoft Corporation", price: 445 },
  { symbol: "NVDA", name: "NVIDIA Corporation", price: 135 },
  { symbol: "GOOGL", name: "Alphabet Inc.", price: 180 },
  { symbol: "AMZN", name: "Amazon.com, Inc.", price: 195 },
  { symbol: "META", name: "Meta Platforms, Inc.", price: 540 },
  { symbol: "TSLA", name: "Tesla, Inc.", price: 250 },
  { symbol: "AVGO", name: "Broadcom Inc.", price: 175 },
  { symbol: "BRK.B", name: "Berkshire Hathaway Inc.", price: 460 },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", price: 215 },
  { symbol: "V", name: "Visa Inc.", price: 290 },
  { symbol: "MA", name: "Mastercard Incorporated", price: 470 },
  { symbol: "UNH", name: "UnitedHealth Group Inc.", price: 490 },
  { symbol: "XOM", name: "Exxon Mobil Corporation", price: 115 },
  { symbol: "JNJ", name: "Johnson & Johnson", price: 150 },
  { symbol: "WMT", name: "Walmart Inc.", price: 75 },
  { symbol: "PG", name: "The Procter & Gamble Company", price: 170 },
  { symbol: "HD", name: "The Home Depot, Inc.", price: 360 },
  { symbol: "COST", name: "Costco Wholesale Corporation", price: 880 },
  { symbol: "ORCL", name: "Oracle Corporation", price: 145 },
  { symbol: "NFLX", name: "Netflix, Inc.", price: 700 },
  { symbol: "AMD", name: "Advanced Micro Devices, Inc.", price: 165 },
  { symbol: "CRM", name: "Salesforce, Inc.", price: 260 },
  { symbol: "ADBE", name: "Adobe Inc.", price: 480 },
  { symbol: "INTC", name: "Intel Corporation", price: 30 },
  { symbol: "CSCO", name: "Cisco Systems, Inc.", price: 50 },
  { symbol: "PEP", name: "PepsiCo, Inc.", price: 165 },
  { symbol: "KO", name: "The Coca-Cola Company", price: 65 },
  { symbol: "DIS", name: "The Walt Disney Company", price: 100 },
  { symbol: "BAC", name: "Bank of America Corporation", price: 42 },
  { symbol: "PFE", name: "Pfizer Inc.", price: 28 },
  { symbol: "T", name: "AT&T Inc.", price: 22 },
  { symbol: "VZ", name: "Verizon Communications Inc.", price: 42 },
  { symbol: "CVX", name: "Chevron Corporation", price: 155 },
  { symbol: "ABBV", name: "AbbVie Inc.", price: 185 },
  { symbol: "NKE", name: "NIKE, Inc.", price: 78 },
  { symbol: "MCD", name: "McDonald's Corporation", price: 265 },
  { symbol: "QCOM", name: "QUALCOMM Incorporated", price: 170 },
  { symbol: "TXN", name: "Texas Instruments Incorporated", price: 200 },
  { symbol: "PYPL", name: "PayPal Holdings, Inc.", price: 70 },
  { symbol: "UBER", name: "Uber Technologies, Inc.", price: 72 },
  { symbol: "BA", name: "The Boeing Company", price: 180 },
  { symbol: "GE", name: "GE Aerospace", price: 165 },
  { symbol: "SBUX", name: "Starbucks Corporation", price: 95 },
  { symbol: "PLTR", name: "Palantir Technologies Inc.", price: 28 },
  { symbol: "COIN", name: "Coinbase Global, Inc.", price: 230 },
  { symbol: "SHOP", name: "Shopify Inc.", price: 75 },
  { symbol: "SPOT", name: "Spotify Technology S.A.", price: 320 },
  { symbol: "ABNB", name: "Airbnb, Inc.", price: 145 },
  { symbol: "MU", name: "Micron Technology, Inc.", price: 130 },
  { symbol: "BABA", name: "Alibaba Group Holding Limited", price: 80 },
  { symbol: "F", name: "Ford Motor Company", price: 12 },
  { symbol: "GM", name: "General Motors Company", price: 48 },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", price: 545 },
  { symbol: "QQQ", name: "Invesco QQQ Trust", price: 480 },
];

const TICKER_MAP: Record<string, TickerInfo> = Object.fromEntries(
  TICKERS.map((t) => [t.symbol, t]),
);

/** Exact (case-insensitive) lookup of a known ticker. */
export function findTicker(symbol: string): TickerInfo | undefined {
  return TICKER_MAP[symbol.trim().toUpperCase()];
}

/** Top matches by symbol or company name, for the search dropdown. */
export function searchTickers(query: string, limit = 8): TickerInfo[] {
  const q = query.trim().toUpperCase();
  if (!q) return TICKERS.slice(0, limit);
  // Symbol prefix first, then symbol-contains, then name-contains.
  const scored = TICKERS.map((t) => {
    const sym = t.symbol.toUpperCase();
    const name = t.name.toUpperCase();
    let score = -1;
    if (sym === q) score = 0;
    else if (sym.startsWith(q)) score = 1;
    else if (sym.includes(q)) score = 2;
    else if (name.includes(q)) score = 3;
    return { t, score };
  }).filter((x) => x.score >= 0);
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((x) => x.t);
}
