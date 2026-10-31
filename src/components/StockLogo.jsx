import React from 'react';
import { catalogEntry } from '../../shared/catalog.js';

export default function StockLogo({ symbol, size = 38 }) {
  const entry = catalogEntry(symbol);
  const color = entry?.color || '#5b6b7a';
  const initials = entry?.initials || symbol.replace(/\..*$/, '').slice(0, 2).toUpperCase();
  return (
    <span className="stock-logo" style={{ width: size, height: size, background: `${color}14`, color, fontSize: initials.length > 2 ? size * 0.28 : size * 0.42 }} aria-hidden="true">
      {initials}
    </span>
  );
}
