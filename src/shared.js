const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}><path d="${d}"/></svg>`

export const icons = {
  plus: svg('M12 5v14M5 12h14'),
  notes: svg('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8'),
  pin: svg('M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z'),
  star: svg('M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.49l-5.87 3.09 1.12-6.54L2.5 9.41l6.56-.95z'),
  starFill: svg('M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.49l-5.87 3.09 1.12-6.54L2.5 9.41l6.56-.95z', 'class="fill"'),
  more: svg('M5 12h.01M12 12h.01M19 12h.01', 'stroke-width="3"'),
  x: svg('M18 6 6 18M6 6l12 12'),
  minus: svg('M5 12h14'),
  bold: svg('M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z', 'stroke-width="2.3"'),
  italic: svg('M19 4h-9M14 20H5M15 4 9 20'),
  underline: svg('M6 4v6a6 6 0 0 0 12 0V4M4 20h16'),
  strike: svg('M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16'),
  code: svg('m16 18 6-6-6-6M8 6l-6 6 6 6'),
  bullet: svg('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', 'stroke-width="2"'),
  ordered: svg('M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'),
  todo: svg('M4 4h6v6H4zM5.5 7l1.5 1.5L10 5.5M4 14h6v6H4zM14 7h7M14 17h7'),
  table: svg('M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16'),
  quote: svg('M4 5v14M9 7h11M9 12h11M9 17h7'),
  trash: svg('M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6'),
  link: svg('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  search: svg('M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35'),
  restore: svg('M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5'),
  divider: svg('M3 12h18'),
  chevron: svg('m6 9 6 6 6-6'),
  text: svg('M5 7V5h14v2M9 19h6M12 5v14'),
  calendar: svg('M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'),
  callout: svg('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
  copy: svg('M9 9h11v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'),
  open: svg('M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'),
  highlight: svg('m9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'),
  eye: svg('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'),
  power: svg('M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04'),
  grip: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="9" cy="5.5" r="1.6"/><circle cx="15" cy="5.5" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18.5" r="1.6"/><circle cx="15" cy="18.5" r="1.6"/></svg>',
  toggle: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5.5v13l10-6.5z"/></svg>',
  up: svg('M12 19V5M5 12l7-7 7 7'),
  down: svg('M12 5v14M19 12l-7 7-7-7'),
  cloud: svg('M17.5 19a4.5 4.5 0 1 0-1.4-8.78A6 6 0 0 0 4.5 12.5 3.5 3.5 0 0 0 6.5 19z'),
  refresh: svg('M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5'),
  logout: svg('M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9'),
  clear: svg('M4 7V4h16v3M5 20h6M13 4 8 20M15 15l5 5M20 15l-5 5'),
}

// Kolory z ciemnego motywu Notion
export const COLORS = [
  { id: 'default', name: 'Domyślny', text: null, bg: null },
  { id: 'gray', name: 'Szary', text: '#9B9B9B', bg: '#2F2F2F' },
  { id: 'brown', name: 'Brązowy', text: '#BA856F', bg: '#4A3228' },
  { id: 'orange', name: 'Pomarańczowy', text: '#C77D48', bg: '#5C3B23' },
  { id: 'yellow', name: 'Żółty', text: '#CA9849', bg: '#564328' },
  { id: 'green', name: 'Zielony', text: '#529E72', bg: '#243D30' },
  { id: 'blue', name: 'Niebieski', text: '#5E87C9', bg: '#143A4E' },
  { id: 'purple', name: 'Fioletowy', text: '#9D68D3', bg: '#3C2D49' },
  { id: 'pink', name: 'Różowy', text: '#D15796', bg: '#4E2C3C' },
  { id: 'red', name: 'Czerwony', text: '#DF5452', bg: '#522E2A' },
]

export const colorById = (id) => COLORS.find((c) => c.id === id) || COLORS[0]

export function relTime(ts) {
  const diff = Date.now() - ts
  const m = Math.round(diff / 60000)
  if (m < 1) return 'przed chwilą'
  if (m < 60) return `${m} min temu`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} godz. temu`
  const d = new Date(ts)
  const today = new Date()
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d >= yest) return 'wczoraj'
  return d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
