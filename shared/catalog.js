export const STOCKS = [
  { symbol: 'AAPL', name: 'Apple Inc.', market: 'US', exchange: 'Nasdaq', sector: 'Technology', color: '#1d1d1f', initials: 'A' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', market: 'US', exchange: 'Nasdaq', sector: 'Semiconductors', color: '#76b900', initials: 'N' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', market: 'US', exchange: 'Nasdaq', sector: 'Technology', color: '#00a4ef', initials: 'M' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', market: 'US', exchange: 'Nasdaq', sector: 'Communication', color: '#4285f4', initials: 'G' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', market: 'US', exchange: 'Nasdaq', sector: 'Consumer cyclical', color: '#ff9900', initials: 'a' },
  { symbol: 'META', name: 'Meta Platforms Inc.', market: 'US', exchange: 'Nasdaq', sector: 'Communication', color: '#0866ff', initials: 'M' },
  { symbol: 'TSLA', name: 'Tesla Inc.', market: 'US', exchange: 'Nasdaq', sector: 'Automotive', color: '#e82127', initials: 'T' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', market: 'US', exchange: 'NYSE', sector: 'Financial services', color: '#117aca', initials: 'J' },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', market: 'IN', exchange: 'NSE', sector: 'Conglomerate', color: '#b8860b', initials: 'R' },
  { symbol: 'TCS.NS', name: 'Tata Consultancy Services', market: 'IN', exchange: 'NSE', sector: 'Technology', color: '#7b2ff7', initials: 'tcs' },
  { symbol: 'HDFCBANK.NS', name: 'HDFC Bank', market: 'IN', exchange: 'NSE', sector: 'Financial services', color: '#004c8f', initials: 'H' },
  { symbol: 'INFY.NS', name: 'Infosys', market: 'IN', exchange: 'NSE', sector: 'Technology', color: '#007cc3', initials: 'I' },
  { symbol: 'ICICIBANK.NS', name: 'ICICI Bank', market: 'IN', exchange: 'NSE', sector: 'Financial services', color: '#f58220', initials: 'I' },
  { symbol: 'BHARTIARTL.NS', name: 'Bharti Airtel', market: 'IN', exchange: 'NSE', sector: 'Telecom', color: '#e40000', initials: 'a' },
  { symbol: 'LT.NS', name: 'Larsen & Toubro', market: 'IN', exchange: 'NSE', sector: 'Industrials', color: '#005baa', initials: 'L&T' },
  { symbol: 'ITC.NS', name: 'ITC Limited', market: 'IN', exchange: 'NSE', sector: 'Consumer defensive', color: '#1a5632', initials: 'I' }
];

export const INDICES = [
  { symbol: '^NSEI', name: 'NIFTY 50', market: 'IN', exchange: 'NSE', color: '#10a779' },
  { symbol: '^BSESN', name: 'SENSEX', market: 'IN', exchange: 'BSE', color: '#10a779' },
  { symbol: '^GSPC', name: 'S&P 500', market: 'US', exchange: 'NYSE', color: '#6b8afd' },
  { symbol: '^IXIC', name: 'Nasdaq Composite', market: 'US', exchange: 'Nasdaq', color: '#6b8afd' }
];

export const DEFAULT_WATCHLIST = ['AAPL', 'RELIANCE.NS', 'NVDA', 'TCS.NS', 'MSFT'];
export const MARKET_SYMBOLS = [...INDICES, ...STOCKS].map(s => s.symbol);

const BY_SYMBOL = new Map([...STOCKS, ...INDICES].map(s => [s.symbol, s]));

export function catalogEntry(symbol) {
  return BY_SYMBOL.get(symbol) || null;
}

export function marketFor(symbol, exchange = '') {
  if (/\.(NS|BO)$/i.test(symbol)) return 'IN';
  if (['NSI', 'BSE', 'NSE'].includes(exchange)) return 'IN';
  if (['NMS', 'NGM', 'NCM', 'NYQ', 'NYS', 'ASE', 'PCX', 'BTS', 'BATS'].includes(exchange)) return 'US';
  if (!symbol.includes('.') && !symbol.includes('^')) return 'US';
  return 'OTHER';
}

export function displayName(symbol, meta = {}) {
  const entry = catalogEntry(symbol);
  if (entry) return entry.name;
  return meta.longName || meta.shortName || symbol;
}

export function currencySymbol(currency) {
  if (currency === 'INR') return '₹';
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  if (currency === 'GBP') return '£';
  return currency ? `${currency} ` : '';
}

export function formatPrice(value, currency = 'USD', digits) {
  if (value == null || !Number.isFinite(value)) return '—';
  const d = digits ?? (Math.abs(value) >= 1000 ? 2 : 2);
  return `${currencySymbol(currency)}${value.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

export function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatCompact(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

export function formatChange(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}
