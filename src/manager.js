import { icons, colorById, relTime, esc } from './shared.js'
import { popover, closeMenu, initTooltips, h } from './ui.js'

const $ = (s) => document.querySelector(s)
let notes = []
let settings = {}
let view = 'all'
let query = ''
let sort = 'updated'

initTooltips()

const VIEWS = {
  all: { title: 'Wszystkie notatki', icon: icons.notes, filter: (n) => !n.deleted },
  fav: { title: 'Ulubione', icon: icons.star, filter: (n) => !n.deleted && n.favorite },
  open: { title: 'Otwarte na pulpicie', icon: icons.eye, filter: (n) => !n.deleted && n.isOpen },
  pinned: { title: 'Na wierzchu', icon: icons.pin, filter: (n) => !n.deleted && n.pinned },
  trash: { title: 'Kosz', icon: icons.trash, filter: (n) => n.deleted },
}

async function load() {
  ;[notes, settings] = await Promise.all([window.api.listNotes(), window.api.getSettings()])
  render()
}

window.api.onNotesChanged(load)

function renderNav() {
  const nav = $('#nav')
  nav.innerHTML = ''
  nav.append(
    h('button', { class: 'side-item new-btn', onclick: () => window.api.createNote() },
      h('span', { class: 'si-icon', html: icons.plus }), 'Nowa notatka', h('span', { class: 'si-count' }, 'Ctrl+N')),
    h('div', { class: 'side-gap' }),
  )
  for (const [key, v] of Object.entries(VIEWS)) {
    if (key === 'trash') nav.append(h('div', { class: 'side-gap' }))
    const count = notes.filter(v.filter).length
    nav.append(
      h('button', { class: 'side-item' + (view === key ? ' active' : ''), onclick: () => { view = key; render() } },
        h('span', { class: 'si-icon', html: v.icon }), v.title, h('span', { class: 'si-count' }, count ? String(count) : '')))
  }
  const auto = $('#autostart')
  auto.innerHTML = ''
  auto.append(h('span', { class: 'si-icon', html: icons.power }), 'Uruchamiaj z Windows',
    h('span', { class: 'si-count' }, h('span', { class: 'switch' + (settings.autostart ? ' on' : '') })))
  auto.onclick = async () => {
    settings = await window.api.setSettings({ autostart: !settings.autostart })
    renderNav()
  }
}

function matches(n) {
  if (!query) return true
  const q = query.toLowerCase()
  return (n.title || '').toLowerCase().includes(q) || (n.autoTitle || '').toLowerCase().includes(q) || (n.text || '').toLowerCase().includes(q)
}

function sorted(list) {
  const by = {
    updated: (a, b) => b.updatedAt - a.updatedAt,
    created: (a, b) => b.createdAt - a.createdAt,
    title: (a, b) => (a.title || a.autoTitle || '').localeCompare(b.title || b.autoTitle || '', 'pl'),
  }[sort]
  return list.slice().sort(by)
}

function render() {
  renderNav()
  const v = VIEWS[view]
  $('#view-title').textContent = v.title
  const list = sorted(notes.filter(v.filter).filter(matches))

  $('#view-sub').textContent = query
    ? `Wyniki dla „${query}”: ${list.length}`
    : view === 'trash'
      ? 'Notatki w koszu są usuwane na stałe po 30 dniach.'
      : `${list.length} ${plural(list.length)}`

  const actions = $('#head-actions')
  actions.innerHTML = ''
  if (view === 'trash') {
    if (list.length) actions.append(h('button', { class: 'btn danger', onclick: confirmEmptyTrash }, 'Opróżnij kosz'))
  } else {
    const sortLabels = { updated: 'Ostatnio edytowane', created: 'Data utworzenia', title: 'Alfabetycznie' }
    const sortBtn = h('button', { class: 'btn ghost', onclick: () => openSortMenu(sortBtn, sortLabels) },
      sortLabels[sort], h('span', { class: 'chev', html: icons.chevron }))
    actions.append(
      sortBtn,
      h('button', { class: 'btn primary', onclick: () => window.api.createNote() }, h('span', { html: icons.plus, class: 'btn-ic' }), 'Nowa'))
  }

  const root = $('#list')
  root.innerHTML = ''
  if (!list.length) {
    root.append(emptyState())
    return
  }

  if (view === 'all' && !query && list.some((n) => n.favorite)) {
    section(root, 'Ulubione', list.filter((n) => n.favorite))
    section(root, 'Pozostałe', list.filter((n) => !n.favorite))
  } else {
    section(root, null, list)
  }
}

function section(root, label, items) {
  if (!items.length) return
  if (label) root.append(h('div', { class: 'section-label' }, label))
  root.append(h('div', { class: 'grid' }, items.map(card)))
}

const plural = (n) => (n === 1 ? 'notatka' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'notatki' : 'notatek')

function highlight(text) {
  const safe = esc(text)
  if (!query) return safe
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  return safe.replace(re, (m) => `<mark>${m}</mark>`)
}

function card(n) {
  const c = colorById(n.color)
  const lines = (n.text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const title = n.title || n.autoTitle || (n.empty ? 'Pusta notatka' : 'Bez tytułu')
  const body = !n.title && lines[0] === n.autoTitle ? lines.slice(1) : lines
  let preview = body.join('\n').slice(0, 400)
  if (query && !preview.toLowerCase().includes(query.toLowerCase())) {
    const i = (n.text || '').toLowerCase().indexOf(query.toLowerCase())
    if (i > -1) preview = '…' + n.text.slice(Math.max(0, i - 40), i + 200)
  }

  const act = (icon, tip, fn, cls = '') =>
    h('button', { class: 'icon-btn ' + cls, 'data-tip': tip, html: icon, onclick: (e) => { e.stopPropagation(); fn(e.currentTarget) } })

  const actions = view === 'trash'
    ? [act(icons.restore, 'Przywróć', () => window.api.restoreNote(n.id)),
       act(icons.trash, 'Usuń na zawsze', (b) => confirmDestroy(b, n), 'danger')]
    : [act(n.favorite ? icons.starFill : icons.star, n.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
         () => window.api.updateNote(n.id, { favorite: !n.favorite }), n.favorite ? 'fav-on' : ''),
       act(icons.pin, n.pinned ? 'Odepnij z wierzchu' : 'Zawsze na wierzchu',
         () => window.api.setPinned(n.id, !n.pinned), n.pinned ? 'on' : ''),
       act(icons.more, 'Więcej', (b) => openCardMenu(b, n))]

  const el = h('div', {
    class: 'card' + (view === 'trash' ? ' in-trash' : ''),
    style: `--card-accent:${c.text || 'transparent'}; --card-tint:${c.bg || 'transparent'}`,
    tabindex: '0',
    onclick: () => view !== 'trash' && window.api.openNote(n.id),
    onkeydown: (e) => { if (e.key === 'Enter' && view !== 'trash') window.api.openNote(n.id) },
  },
  h('div', { class: 'card-title', html: highlight(title) }),
  h('div', { class: 'card-preview', html: highlight(preview) }),
  h('div', { class: 'card-foot' },
    h('span', { class: 'card-time' }, view === 'trash' ? 'Usunięto ' + relTime(n.deletedAt || n.updatedAt) : relTime(n.updatedAt)),
    n.isOpen ? h('span', { class: 'badge', 'data-tip': 'Otwarta na pulpicie' }, 'otwarta') : null,
    n.favorite && view !== 'trash' ? h('span', { class: 'mini-star', html: icons.starFill }) : null,
    h('span', { class: 'card-actions' }, actions)))
  return el
}

function openCardMenu(anchor, n) {
  const item = (icon, label, fn, cls = '') =>
    h('button', { class: 'menu-item ' + cls, onclick: () => { closeMenu(); fn() } }, h('span', { class: 'mi-icon', html: icon }), label)
  popover(anchor, h('div', {},
    item(icons.open, n.isOpen ? 'Pokaż' : 'Otwórz na pulpicie', () => window.api.openNote(n.id)),
    item(icons.copy, 'Duplikuj', () => window.api.duplicateNote(n.id)),
    item(n.favorite ? icons.starFill : icons.star, n.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', () => window.api.updateNote(n.id, { favorite: !n.favorite })),
    item(icons.pin, n.pinned ? 'Odepnij z wierzchu' : 'Zawsze na wierzchu', () => window.api.setPinned(n.id, !n.pinned)),
    h('div', { class: 'menu-sep' }),
    item(icons.trash, 'Przenieś do kosza', () => window.api.trashNote(n.id), 'danger'),
  ), { align: 'end' })
}

function openSortMenu(anchor, labels) {
  popover(anchor, h('div', {},
    h('div', { class: 'menu-label' }, 'Sortuj według'),
    Object.entries(labels).map(([k, label]) =>
      h('button', { class: 'menu-item', onclick: () => { sort = k; closeMenu(); render() } },
        label, h('span', { class: 'mi-right' }, sort === k ? '✓' : '')))), { align: 'end' })
}

function confirmBox(anchor, title, desc, okLabel, fn) {
  popover(anchor, h('div', { class: 'confirm' },
    h('div', { class: 'confirm-title' }, title),
    h('div', { class: 'confirm-desc' }, desc),
    h('div', { class: 'confirm-actions' },
      h('button', { class: 'btn', onclick: closeMenu }, 'Anuluj'),
      h('button', { class: 'btn danger', onclick: () => { closeMenu(); fn() } }, okLabel))), { align: 'end' })
}

function confirmDestroy(anchor, n) {
  confirmBox(anchor, 'Usunąć na zawsze?', `„${n.title || n.autoTitle || 'Bez tytułu'}” zostanie trwale usunięta. Tej operacji nie można cofnąć.`, 'Usuń', () => window.api.destroyNote(n.id))
}

function confirmEmptyTrash(e) {
  confirmBox(e.currentTarget, 'Opróżnić kosz?', 'Wszystkie notatki z kosza zostaną trwale usunięte.', 'Opróżnij', () => window.api.emptyTrash())
}

function emptyState() {
  const msg = query
    ? ['Brak wyników', 'Spróbuj innej frazy.']
    : {
        all: ['Brak notatek', 'Utwórz pierwszą karteczkę — pojawi się na pulpicie.'],
        fav: ['Brak ulubionych', 'Kliknij gwiazdkę na karteczce, aby dodać ją tutaj.'],
        open: ['Brak otwartych karteczek', 'Kliknij notatkę, aby otworzyć ją na pulpicie.'],
        pinned: ['Nic nie jest na wierzchu', 'Użyj pinezki na karteczce, aby była zawsze widoczna.'],
        trash: ['Kosz jest pusty', 'Usunięte notatki trafiają tutaj.'],
      }[view]
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon', html: VIEWS[view].icon }),
    h('div', { class: 'empty-title' }, msg[0]),
    h('div', { class: 'empty-desc' }, msg[1]),
    view === 'all' && !query ? h('button', { class: 'btn primary', onclick: () => window.api.createNote() }, 'Nowa notatka') : null)
}

// ---------- wyszukiwanie i skróty ----------
$('#search-icon').innerHTML = icons.search
$('.logo').innerHTML = '<img src="../assets/icon-32.png" alt="" />'
$('#search').addEventListener('input', (e) => {
  query = e.target.value.trim()
  render()
})
$('#search').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.target.value = ''
    query = ''
    render()
    e.target.blur()
  }
})
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select() }
  if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); window.api.createNote() }
})

// odświeżaj względne czasy
setInterval(render, 60000)
window.addEventListener('focus', load)

load()
