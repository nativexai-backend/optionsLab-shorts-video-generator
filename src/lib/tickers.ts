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
  { symbol: "IWM", name: "iShares Russell 2000 ETF", price: 220 },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", price: 430 },
  { symbol: "GLD", name: "SPDR Gold Shares", price: 250 },
  // Industrials & transport
  { symbol: "CAT", name: "Caterpillar Inc.", price: 390 },
  { symbol: "DE", name: "Deere & Company", price: 440 },
  { symbol: "HON", name: "Honeywell International Inc.", price: 220 },
  { symbol: "MMM", name: "3M Company", price: 130 },
  { symbol: "LMT", name: "Lockheed Martin Corporation", price: 480 },
  { symbol: "RTX", name: "RTX Corporation", price: 125 },
  { symbol: "NOC", name: "Northrop Grumman Corporation", price: 490 },
  { symbol: "GD", name: "General Dynamics Corporation", price: 300 },
  { symbol: "ETN", name: "Eaton Corporation plc", price: 340 },
  { symbol: "EMR", name: "Emerson Electric Co.", price: 120 },
  { symbol: "CMI", name: "Cummins Inc.", price: 350 },
  { symbol: "UNP", name: "Union Pacific Corporation", price: 240 },
  { symbol: "CSX", name: "CSX Corporation", price: 34 },
  { symbol: "UPS", name: "United Parcel Service, Inc.", price: 130 },
  { symbol: "FDX", name: "FedEx Corporation", price: 280 },
  { symbol: "DAL", name: "Delta Air Lines, Inc.", price: 60 },
  { symbol: "UAL", name: "United Airlines Holdings, Inc.", price: 95 },
  { symbol: "AAL", name: "American Airlines Group Inc.", price: 15 },
  { symbol: "LUV", name: "Southwest Airlines Co.", price: 30 },
  // Financials
  { symbol: "GS", name: "The Goldman Sachs Group, Inc.", price: 560 },
  { symbol: "MS", name: "Morgan Stanley", price: 130 },
  { symbol: "WFC", name: "Wells Fargo & Company", price: 75 },
  { symbol: "C", name: "Citigroup Inc.", price: 80 },
  { symbol: "SCHW", name: "The Charles Schwab Corporation", price: 80 },
  { symbol: "BLK", name: "BlackRock, Inc.", price: 1000 },
  { symbol: "AXP", name: "American Express Company", price: 290 },
  { symbol: "BX", name: "Blackstone Inc.", price: 160 },
  { symbol: "KKR", name: "KKR & Co. Inc.", price: 140 },
  { symbol: "PGR", name: "The Progressive Corporation", price: 260 },
  { symbol: "USB", name: "U.S. Bancorp", price: 50 },
  { symbol: "PNC", name: "The PNC Financial Services Group", price: 200 },
  { symbol: "COF", name: "Capital One Financial Corporation", price: 190 },
  // Healthcare
  { symbol: "LLY", name: "Eli Lilly and Company", price: 800 },
  { symbol: "MRK", name: "Merck & Co., Inc.", price: 100 },
  { symbol: "TMO", name: "Thermo Fisher Scientific Inc.", price: 550 },
  { symbol: "ABT", name: "Abbott Laboratories", price: 120 },
  { symbol: "DHR", name: "Danaher Corporation", price: 240 },
  { symbol: "BMY", name: "Bristol-Myers Squibb Company", price: 55 },
  { symbol: "AMGN", name: "Amgen Inc.", price: 300 },
  { symbol: "GILD", name: "Gilead Sciences, Inc.", price: 95 },
  { symbol: "ISRG", name: "Intuitive Surgical, Inc.", price: 520 },
  { symbol: "MDT", name: "Medtronic plc", price: 90 },
  { symbol: "CVS", name: "CVS Health Corporation", price: 65 },
  { symbol: "CI", name: "The Cigna Group", price: 340 },
  { symbol: "ELV", name: "Elevance Health, Inc.", price: 400 },
  { symbol: "HUM", name: "Humana Inc.", price: 280 },
  { symbol: "MCK", name: "McKesson Corporation", price: 620 },
  { symbol: "ZTS", name: "Zoetis Inc.", price: 170 },
  { symbol: "VRTX", name: "Vertex Pharmaceuticals Incorporated", price: 440 },
  { symbol: "REGN", name: "Regeneron Pharmaceuticals, Inc.", price: 750 },
  // Tech & software
  { symbol: "IBM", name: "International Business Machines", price: 240 },
  { symbol: "NOW", name: "ServiceNow, Inc.", price: 950 },
  { symbol: "INTU", name: "Intuit Inc.", price: 640 },
  { symbol: "SNOW", name: "Snowflake Inc.", price: 160 },
  { symbol: "DDOG", name: "Datadog, Inc.", price: 130 },
  { symbol: "NET", name: "Cloudflare, Inc.", price: 105 },
  { symbol: "CRWD", name: "CrowdStrike Holdings, Inc.", price: 380 },
  { symbol: "PANW", name: "Palo Alto Networks, Inc.", price: 190 },
  { symbol: "ZS", name: "Zscaler, Inc.", price: 200 },
  { symbol: "MDB", name: "MongoDB, Inc.", price: 280 },
  { symbol: "TEAM", name: "Atlassian Corporation", price: 220 },
  { symbol: "WDAY", name: "Workday, Inc.", price: 250 },
  { symbol: "SNPS", name: "Synopsys, Inc.", price: 540 },
  { symbol: "CDNS", name: "Cadence Design Systems, Inc.", price: 300 },
  // Semiconductors
  { symbol: "LRCX", name: "Lam Research Corporation", price: 90 },
  { symbol: "AMAT", name: "Applied Materials, Inc.", price: 190 },
  { symbol: "KLAC", name: "KLA Corporation", price: 780 },
  { symbol: "ASML", name: "ASML Holding N.V.", price: 800 },
  { symbol: "TSM", name: "Taiwan Semiconductor Manufacturing", price: 200 },
  { symbol: "ARM", name: "Arm Holdings plc", price: 140 },
  { symbol: "MRVL", name: "Marvell Technology, Inc.", price: 90 },
  { symbol: "ADI", name: "Analog Devices, Inc.", price: 220 },
  { symbol: "NXPI", name: "NXP Semiconductors N.V.", price: 230 },
  { symbol: "ON", name: "ON Semiconductor Corporation", price: 65 },
  { symbol: "DELL", name: "Dell Technologies Inc.", price: 120 },
  { symbol: "ANET", name: "Arista Networks, Inc.", price: 110 },
  // Consumer & internet
  { symbol: "DASH", name: "DoorDash, Inc.", price: 180 },
  { symbol: "RBLX", name: "Roblox Corporation", price: 45 },
  { symbol: "EA", name: "Electronic Arts Inc.", price: 150 },
  { symbol: "TTWO", name: "Take-Two Interactive Software", price: 180 },
  { symbol: "ROKU", name: "Roku, Inc.", price: 70 },
  { symbol: "SNAP", name: "Snap Inc.", price: 11 },
  { symbol: "PINS", name: "Pinterest, Inc.", price: 32 },
  { symbol: "ZM", name: "Zoom Communications, Inc.", price: 70 },
  { symbol: "HOOD", name: "Robinhood Markets, Inc.", price: 45 },
  { symbol: "SOFI", name: "SoFi Technologies, Inc.", price: 12 },
  { symbol: "AFRM", name: "Affirm Holdings, Inc.", price: 55 },
  { symbol: "MSTR", name: "MicroStrategy Incorporated", price: 350 },
  { symbol: "MARA", name: "MARA Holdings, Inc.", price: 18 },
  { symbol: "CMG", name: "Chipotle Mexican Grill, Inc.", price: 55 },
  { symbol: "YUM", name: "Yum! Brands, Inc.", price: 140 },
  { symbol: "DPZ", name: "Domino's Pizza, Inc.", price: 470 },
  { symbol: "QSR", name: "Restaurant Brands International", price: 70 },
  { symbol: "LOW", name: "Lowe's Companies, Inc.", price: 250 },
  { symbol: "TGT", name: "Target Corporation", price: 130 },
  { symbol: "TJX", name: "The TJX Companies, Inc.", price: 120 },
  { symbol: "DG", name: "Dollar General Corporation", price: 90 },
  { symbol: "KR", name: "The Kroger Co.", price: 60 },
  // Consumer staples
  { symbol: "CL", name: "Colgate-Palmolive Company", price: 95 },
  { symbol: "KMB", name: "Kimberly-Clark Corporation", price: 140 },
  { symbol: "MDLZ", name: "Mondelez International, Inc.", price: 65 },
  { symbol: "MO", name: "Altria Group, Inc.", price: 55 },
  { symbol: "PM", name: "Philip Morris International Inc.", price: 130 },
  { symbol: "HSY", name: "The Hershey Company", price: 180 },
  { symbol: "KHC", name: "The Kraft Heinz Company", price: 30 },
  { symbol: "STZ", name: "Constellation Brands, Inc.", price: 230 },
  { symbol: "BUD", name: "Anheuser-Busch InBev SA/NV", price: 60 },
  // Energy
  { symbol: "COP", name: "ConocoPhillips", price: 105 },
  { symbol: "SLB", name: "SLB (Schlumberger)", price: 42 },
  { symbol: "EOG", name: "EOG Resources, Inc.", price: 125 },
  { symbol: "OXY", name: "Occidental Petroleum Corporation", price: 50 },
  { symbol: "PSX", name: "Phillips 66", price: 130 },
  { symbol: "VLO", name: "Valero Energy Corporation", price: 140 },
  { symbol: "MPC", name: "Marathon Petroleum Corporation", price: 170 },
  { symbol: "KMI", name: "Kinder Morgan, Inc.", price: 25 },
  { symbol: "HAL", name: "Halliburton Company", price: 30 },
  { symbol: "DVN", name: "Devon Energy Corporation", price: 40 },
  // Autos
  { symbol: "RIVN", name: "Rivian Automotive, Inc.", price: 12 },
  { symbol: "LCID", name: "Lucid Group, Inc.", price: 3 },
  { symbol: "NIO", name: "NIO Inc.", price: 5 },
  { symbol: "TM", name: "Toyota Motor Corporation", price: 200 },
  { symbol: "RACE", name: "Ferrari N.V.", price: 430 },
  // Media & telecom
  { symbol: "CMCSA", name: "Comcast Corporation", price: 38 },
  { symbol: "TMUS", name: "T-Mobile US, Inc.", price: 240 },
  { symbol: "CHTR", name: "Charter Communications, Inc.", price: 350 },
  { symbol: "WBD", name: "Warner Bros. Discovery, Inc.", price: 10 },
  { symbol: "SONY", name: "Sony Group Corporation", price: 105 },
  // Materials & mining
  { symbol: "LIN", name: "Linde plc", price: 460 },
  { symbol: "SHW", name: "The Sherwin-Williams Company", price: 360 },
  { symbol: "APD", name: "Air Products and Chemicals, Inc.", price: 290 },
  { symbol: "FCX", name: "Freeport-McMoRan Inc.", price: 45 },
  { symbol: "NEM", name: "Newmont Corporation", price: 50 },
  { symbol: "NUE", name: "Nucor Corporation", price: 150 },
  // Real estate & utilities
  { symbol: "AMT", name: "American Tower Corporation", price: 210 },
  { symbol: "PLD", name: "Prologis, Inc.", price: 115 },
  { symbol: "EQIX", name: "Equinix, Inc.", price: 900 },
  { symbol: "NEE", name: "NextEra Energy, Inc.", price: 75 },
  { symbol: "DUK", name: "Duke Energy Corporation", price: 110 },
  { symbol: "SO", name: "The Southern Company", price: 90 },
  { symbol: "VST", name: "Vistra Corp.", price: 130 },
  { symbol: "CEG", name: "Constellation Energy Corporation", price: 250 },
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
