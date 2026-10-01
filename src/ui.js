// Małe narzędzia UI: popovery i tooltipy (bez zewnętrznych zależności)

let openMenu = null

export function closeMenu() {
  if (openMenu) {
    const m = openMenu
    openMenu = null
    m.el.remove()
    m.onClose && m.onClose()
    document.removeEventListener('mousedown', m.outside, true)
    document.removeEventListener('keydown', m.key, true)
  }
}

export const isMenuOpen = () => !!openMenu

/**
 * Otwiera popover przy elemencie (anchor = element lub DOMRect).
 * placement: 'above' | 'below'
 */
export function popover(anchor, content, { placement = 'below', align = 'start', onClose, className = '' } = {}) {
  closeMenu()
  const el = document.createElement('div')
  el.className = 'menu ' + className
  if (typeof content === 'string') el.innerHTML = content
  else el.appendChild(content)
  document.body.appendChild(el)

  const rect = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor
  position(el, rect, placement, align)

  const outside = (e) => {
    if (!el.contains(e.target) && !(anchor instanceof Element && anchor.contains(e.target))) closeMenu()
  }
  const key = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeMenu()
    }
  }
  setTimeout(() => document.addEventListener('mousedown', outside, true))
  document.addEventListener('keydown', key, true)
  openMenu = { el, outside, key, onClose }
  return el
}

export function position(el, rect, placement = 'below', align = 'start') {
  const pad = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  el.style.maxHeight = ''
  const spaceBelow = vh - rect.bottom - pad
  const spaceAbove = rect.top - pad
  let place = placement
  const h = el.offsetHeight
  if (place === 'below' && h > spaceBelow && spaceAbove > spaceBelow) place = 'above'
  if (place === 'above' && h > spaceAbove && spaceBelow > spaceAbove) place = 'below'
  const avail = place === 'below' ? spaceBelow : spaceAbove
  if (h > avail) el.style.maxHeight = Math.max(80, avail - 4) + 'px'
  const realH = el.offsetHeight
  const top = place === 'below' ? rect.bottom + 4 : rect.top - realH - 4
  const w = el.offsetWidth
  let left = align === 'end' ? rect.right - w : rect.left
  left = Math.max(pad, Math.min(left, vw - w - pad))
  el.style.top = Math.max(pad, top) + 'px'
  el.style.left = left + 'px'
}

// ---- tooltipy: atrybut data-tip="Tekst|Ctrl+B" ----
let tipEl = null
let tipTimer = null
export function initTooltips() {
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest && e.target.closest('[data-tip]')
    clearTimeout(tipTimer)
    if (tipEl) { tipEl.remove(); tipEl = null }
    if (!t) return
    tipTimer = setTimeout(() => {
      if (!document.body.contains(t)) return
      const [label, kbd] = t.dataset.tip.split('|')
      tipEl = document.createElement('div')
      tipEl.className = 'tooltip'
      tipEl.textContent = label
      if (kbd) {
        const k = document.createElement('span')
        k.className = 'kbd'
        k.textContent = kbd
        tipEl.appendChild(k)
      }
      document.body.appendChild(tipEl)
      const r = t.getBoundingClientRect()
      const w = tipEl.offsetWidth
      const h = tipEl.offsetHeight
      let top = r.top - h - 6
      if (top < 4) top = r.bottom + 6
      tipEl.style.top = top + 'px'
      tipEl.style.left = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 4)) + 'px'
    }, 450)
  })
  document.addEventListener('mousedown', () => {
    clearTimeout(tipTimer)
    if (tipEl) { tipEl.remove(); tipEl = null }
  })
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v
    else if (k === 'html') el.innerHTML = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (v !== false && v != null) el.setAttribute(k, v)
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue
    el.append(c instanceof Node ? c : document.createTextNode(c))
  }
  return el
}
