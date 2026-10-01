import { App } from '@capacitor/app'
import { createEditor, BLOCKS, INSERTS, hooks } from '../editor.js'
import { createSync } from '../sync/engine.js'
import { icons, COLORS, colorById, relTime, esc } from '../shared.js'
import { popover, closeMenu, isMenuOpen, h } from '../ui.js'
import config from '../config.json'

// ================= dane lokalne =================
const DB_KEY = 'notatki-db'
let notes = []
try {
  notes = JSON.parse(localStorage.getItem(DB_KEY) || '{"notes":[]}').notes || []
} catch {
  notes = []
}
let saveTimer = null
function saveLocal() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveLocalNow, 300)
}
function saveLocalNow() {
  clearTimeout(saveTimer)
  try {
    localStorage.setItem(DB_KEY, JSON.stringify({ notes }))
  } catch (e) {
    console.error('Zapis lokalny', e)
  }
}
const getNote = (id) => notes.find((n) => n.id === id)

const uuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

function newNote() {
  const now = Date.now()
  const n = {
    id: uuid(), content: null, text: '', title: '', autoTitle: '', empty: true,
    color: 'default', font: 'default', small: false, favorite: false,
    deleted: false, deletedAt: null, createdAt: now, updatedAt: now, modified: now,
  }
  notes.push(n)
  return n
}

function touch(n) {
  n.modified = Math.max(Date.now(), (n.modified || 0) + 1)
  saveLocal()
  if (sync) sync.push(n.id)
}

function purgeLocal(id) {
  const n = getNote(id)
  notes = notes.filter((x) => x.id !== id)
  saveLocal()
  if (sync && n && n.syncedModified) sync.purge(id)
}

// ================= synchronizacja =================
const SYNC_FIELDS = ['content', 'text', 'title', 'autoTitle', 'empty', 'color', 'font', 'small',
  'favorite', 'deleted', 'deletedAt', 'createdAt', 'updatedAt', 'modified']
let sync = null
let syncSt = { state: 'disabled' }
let renderTimer = null
const scheduleRender = () => {
  clearTimeout(renderTimer)
  renderTimer = setTimeout(() => {
    if (view === 'list') renderList()
    renderSyncDot()
  }, 80)
}

const adapter = {
  list: () => notes,
  get: (id) => getNote(id),
  applyRemote(r) {
    let n = getNote(r.id)
    if (!n) {
      n = { id: r.id }
      notes.push(n)
    }
    const contentChanged = JSON.stringify(n.content) !== JSON.stringify(r.content)
    for (const k of SYNC_FIELDS) n[k] = r[k]
    n.syncedModified = r.modified
    saveLocal()
    if (view === 'editor' && current && current.id === n.id) {
      if (n.deleted) closeEditor(false)
      else applyRemoteToEditor(n, contentChanged)
    }
    scheduleRender()
  },
  remove(id) {
    notes = notes.filter((x) => x.id !== id)
    saveLocal()
    if (view === 'editor' && current && current.id === id) closeEditor(false)
    scheduleRender()
  },
  markSynced(id, modified) {
    const n = getNote(id)
    if (n) {
      n.syncedModified = modified
      saveLocal()
    }
  },
}

const authStorage = {
  getItem: (k) => localStorage.getItem(k),
  setItem: (k, v) => localStorage.setItem(k, v),
  removeItem: (k) => localStorage.removeItem(k),
}

if (config.supabaseUrl && config.supabaseKey) {
  sync = createSync({
    url: config.supabaseUrl,
    key: config.supabaseKey,
    storage: authStorage,
    adapter,
    onStatus: (st) => {
      syncSt = st
      renderSyncDot()
      if (sheetRefresh) sheetRefresh()
    },
  })
}

// ================= skróty linków (editor.js) =================
window.api = {
  openExternal: (url) => {
    window.location.href = url // Capacitor otwiera zewnętrzne adresy w przeglądarce
  },
  openNote: (id) => {
    const n = getNote(id)
    if (n && !n.deleted) openEditor(id)
    else toast('Ta notatka nie istnieje')
  },
}

// ================= UI: pomocnicze =================
const $ = (s) => document.querySelector(s)
let view = 'list'
let filter = 'all'
let query = ''
let current = null // otwarta notatka
let editor = null
let dirty = false
let editSaveTimer = null

function toast(text) {
  const t = h('div', { class: 'toast' }, text)
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 2200)
}

// ---- arkusz od dołu ----
let sheetEl = null
let sheetRefresh = null
function openSheet(build) {
  closeSheet()
  const backdrop = h('div', { class: 'sheet-backdrop', onclick: closeSheet })
  const sheet = h('div', { class: 'sheet' })
  const fill = () => {
    sheet.innerHTML = ''
    sheet.append(h('div', { class: 'sheet-grip' }), build())
  }
  fill()
  document.body.append(backdrop, sheet)
  sheetEl = { backdrop, sheet }
  return { refresh: fill, el: sheet }
}
function closeSheet() {
  if (!sheetEl) return false
  sheetEl.backdrop.remove()
  sheetEl.sheet.remove()
  sheetEl = null
  sheetRefresh = null
  return true
}
const sheetItem = (icon, label, fn, cls = '') =>
  h('button', { class: 'menu-item ' + cls, onclick: fn }, h('span', { class: 'mi-icon', html: icon }), label)

// ================= ekran: lista =================
const app = $('#app')
const listScreen = h('div', { class: 'screen', id: 'list-screen' })
const editorScreen = h('div', { class: 'screen', id: 'editor-screen', hidden: '' })
app.append(listScreen, editorScreen)

function buildListScreen() {
  const syncBtn = h('button', { class: 'm-btn', id: 'sync-btn', onclick: openAccountSheet, html: icons.cloud },
    h('span', { class: 'sync-dot', id: 'sync-dot' }))
  const search = h('input', { placeholder: 'Szukaj', type: 'search', enterkeyhint: 'search' })
  search.addEventListener('input', () => {
    query = search.value.trim()
    renderList()
  })
  const chips = h('div', { class: 'm-chips', id: 'chips' })
  listScreen.append(
    h('header', { class: 'm-head' }, h('h1', {}, 'Notatki'), syncBtn),
    h('label', { class: 'm-search' }, h('span', { html: icons.search }), search),
    chips,
    h('main', { class: 'm-list', id: 'm-list' }),
    h('button', { class: 'm-fab', onclick: () => openEditor(newNote().id), html: icons.plus }),
  )
}

const FILTERS = {
  all: { label: 'Wszystkie', fn: (n) => !n.deleted && !n.empty },
  fav: { label: 'Ulubione', fn: (n) => !n.deleted && n.favorite && !n.empty },
  trash: { label: 'Kosz', fn: (n) => n.deleted },
}

function renderList() {
  const chips = $('#chips')
  chips.innerHTML = ''
  for (const [k, f] of Object.entries(FILTERS)) {
    chips.append(h('button', { class: 'm-chip' + (filter === k ? ' on' : ''), onclick: () => { filter = k; renderList() } }, f.label))
  }
  const q = query.toLowerCase()
  const list = notes
    .filter(FILTERS[filter].fn)
    .filter((n) => !q || (n.title + ' ' + n.autoTitle + ' ' + n.text).toLowerCase().includes(q))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

  const root = $('#m-list')
  root.innerHTML = ''
  if (!list.length) {
    const msg = query
      ? ['Brak wyników', 'Spróbuj innej frazy.']
      : { all: ['Brak notatek', 'Dotknij +, aby utworzyć pierwszą notatkę.'], fav: ['Brak ulubionych', 'Oznacz notatkę gwiazdką.'], trash: ['Kosz jest pusty', ''] }[filter]
    root.append(h('div', { class: 'm-empty' }, h('div', { class: 'm-empty-title' }, msg[0]), msg[1]))
    return
  }
  if (filter === 'trash') {
    root.append(h('div', { class: 'm-row', style: 'padding: 4px 4px 8px' },
      h('button', { class: 'btn danger', onclick: confirmEmptyTrash }, 'Opróżnij kosz')))
  }
  if (filter === 'all' && !q && list.some((n) => n.favorite)) {
    root.append(h('div', { class: 'm-section' }, 'Ulubione'), ...list.filter((n) => n.favorite).map(card))
    root.append(h('div', { class: 'm-section' }, 'Pozostałe'), ...list.filter((n) => !n.favorite).map(card))
  } else {
    root.append(...list.map(card))
  }
}

function card(n) {
  const c = colorById(n.color)
  const title = n.title || n.autoTitle || 'Bez tytułu'
  const lines = (n.text || '').split('\n').map((s) => s.trim()).filter(Boolean)
  const body = !n.title && lines[0] === n.autoTitle ? lines.slice(1) : lines
  const el = h('button', {
    class: 'm-card',
    style: `--card-accent:${c.text || 'transparent'}`,
    onclick: () => (n.deleted ? null : openEditor(n.id)),
  },
  h('div', { class: 'm-card-title' }, title),
  body.length ? h('div', { class: 'm-card-preview' }, body.join(' · ').slice(0, 220)) : null,
  h('div', { class: 'm-card-foot' }, n.deleted ? 'Usunięto ' + relTime(n.deletedAt || n.updatedAt) : relTime(n.updatedAt || Date.now())),
  n.favorite && !n.deleted ? h('span', { class: 'm-card-star', html: icons.starFill }) : null,
  n.deleted
    ? h('div', { class: 'm-card-actions' },
      h('button', { class: 'btn', onclick: (e) => { e.stopPropagation(); n.deleted = false; n.deletedAt = null; touch(n); renderList() } }, 'Przywróć'),
      h('button', { class: 'btn danger', onclick: (e) => { e.stopPropagation(); purgeLocal(n.id); renderList() } }, 'Usuń na zawsze'))
    : null)
  // przytrzymanie = szybkie menu
  let pressTimer = null
  el.addEventListener('touchstart', () => {
    pressTimer = setTimeout(() => {
      pressTimer = null
      if (!n.deleted) openNoteMenu(n, true)
    }, 500)
  }, { passive: true })
  const cancel = () => clearTimeout(pressTimer)
  el.addEventListener('touchend', cancel)
  el.addEventListener('touchmove', cancel, { passive: true })
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  return el
}

function confirmEmptyTrash() {
  openSheet(() => h('div', {},
    h('div', { class: 'sheet-title' }, 'Opróżnić kosz?'),
    h('div', { class: 'sheet-desc' }, 'Notatki z kosza zostaną trwale usunięte na wszystkich urządzeniach.'),
    h('div', { class: 'm-form' },
      h('button', { class: 'btn danger', onclick: () => { notes.filter((n) => n.deleted).forEach((n) => purgeLocal(n.id)); closeSheet(); renderList() } }, 'Opróżnij kosz'),
      h('button', { class: 'btn', onclick: closeSheet }, 'Anuluj'))))
}

function renderSyncDot() {
  const dot = $('#sync-dot')
  const btn = $('#sync-btn')
  if (!dot || !btn) return
  btn.style.display = syncSt.state === 'disabled' ? 'none' : ''
  dot.className = 'sync-dot ' + syncSt.state
}

// ================= konto / logowanie =================
const SYNC_LABEL = {
  'signed-out': 'Niezalogowany',
  syncing: 'Synchronizowanie…',
  ok: 'Zsynchronizowano',
  offline: 'Brak połączenia',
  error: 'Błąd synchronizacji',
}

function openAccountSheet() {
  if (!sync) return
  const s = openSheet(() => (syncSt.state === 'signed-out' ? loginForm() : accountView()))
  sheetRefresh = () => {
    // nie przebudowuj formularza w trakcie wpisywania
    if (syncSt.state !== 'signed-out' || !s.el.querySelector('input')) s.refresh()
  }
}

function accountView() {
  return h('div', {},
    h('div', { class: 'm-account' },
      h('div', { class: 'm-avatar' }, (syncSt.email || '?')[0].toUpperCase()),
      h('div', { style: 'min-width:0' },
        h('div', { class: 'm-account-email' }, syncSt.email || ''),
        h('div', { class: 'm-account-state' }, h('span', { class: 'sync-dot ' + syncSt.state }),
          (SYNC_LABEL[syncSt.state] || '') + (syncSt.state === 'ok' && syncSt.lastSync ? ' · ' + relTime(syncSt.lastSync) : '')))),
    syncSt.error ? h('div', { class: 'form-error', style: 'padding: 0 10px 8px' }, syncSt.error) : null,
    sheetItem(icons.refresh, 'Synchronizuj teraz', () => sync.refresh()),
    sheetItem(icons.logout, 'Wyloguj', () => { sync.signOut(); closeSheet() }, 'danger'))
}

function loginForm() {
  const email = h('input', { class: 'm-input', type: 'email', placeholder: 'E-mail', autocomplete: 'email', inputmode: 'email' })
  const pass = h('input', { class: 'm-input', type: 'password', placeholder: 'Hasło (min. 6 znaków)', autocomplete: 'current-password' })
  const msg = h('div', { class: 'form-error' })
  const run = async (fn) => {
    msg.className = 'form-error'
    msg.textContent = ''
    if (!email.value.trim() || !pass.value) {
      msg.textContent = 'Podaj e-mail i hasło.'
      return
    }
    form.querySelectorAll('button').forEach((b) => (b.disabled = true))
    const res = await fn(email.value, pass.value)
    form.querySelectorAll('button').forEach((b) => (b.disabled = false))
    if (res.error) msg.textContent = res.error
    else if (res.confirm) {
      msg.className = 'form-info'
      msg.textContent = 'Konto założone. Kliknij link w mailu od Supabase, potem zaloguj się tutaj.'
    } else {
      closeSheet()
      toast('Zalogowano — synchronizuję notatki')
    }
  }
  const form = h('div', {},
    h('div', { class: 'sheet-title' }, 'Synchronizacja'),
    h('div', { class: 'sheet-desc' }, 'Zaloguj się tym samym kontem co na komputerze, aby mieć wszędzie te same notatki.'),
    h('div', { class: 'm-form' },
      email, pass, msg,
      h('button', { class: 'btn primary', onclick: () => run(sync.signIn) }, 'Zaloguj się'),
      h('button', { class: 'btn', onclick: () => run(sync.signUp) }, 'Załóż konto')))
  return form
}

// ================= ekran: edytor =================
const TB = []
function buildEditorScreen() {
  const title = h('input', { class: 'm-title', id: 'm-title', placeholder: 'Bez tytułu', enterkeyhint: 'next', maxlength: '120' })
  title.addEventListener('input', () => {
    if (!current) return
    current.title = title.value.trim()
    current.empty = editor ? editor.isEmpty && !current.title : !current.title
    touch(current)
  })
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      editor && editor.commands.focus('start')
    }
  })
  const favBtn = h('button', { class: 'm-btn', id: 'm-fav', onclick: () => { current.favorite = !current.favorite; touch(current); applyMeta() } })
  editorScreen.append(
    h('header', { class: 'm-ehead' },
      h('button', { class: 'm-btn', onclick: () => closeEditor(true), html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' }),
      title,
      favBtn,
      h('button', { class: 'm-btn', onclick: () => openNoteMenu(current, false), html: icons.more })),
    h('main', { class: 'm-escroll', id: 'm-escroll' }, h('div', { id: 'm-editor', class: 'page' })),
    h('div', { class: 'm-tablebar', id: 'm-tablebar' }),
    buildToolbar(),
  )
  // dotknięcie pustego miejsca pod tekstem -> kursor na końcu
  $('#m-escroll').addEventListener('click', (e) => {
    if (editor && (e.target.id === 'm-escroll' || e.target.id === 'm-editor')) editor.commands.focus('end')
  })
}

function tool(key, icon, run, isActive) {
  const b = h('button', { class: 'm-tool', html: icon })
  b.addEventListener('pointerdown', (e) => e.preventDefault()) // nie chowaj klawiatury
  b.addEventListener('click', () => editor && run(b))
  TB.push({ key, el: b, isActive })
  return b
}

function buildToolbar() {
  const e = () => editor
  const c = () => editor.chain().focus()
  const bar = h('footer', { class: 'm-toolbar', id: 'm-toolbar' })
  bar.append(
    tool('slash', icons.plus, () => openInsertSheet()),
    tool('block', icons.text, () => openBlockSheet()),
    h('span', { class: 'm-tsep' }),
    tool('todo', icons.todo, () => c().toggleTaskList().run(), () => e().isActive('taskList')),
    tool('bold', icons.bold, () => c().toggleBold().run(), () => e().isActive('bold')),
    tool('italic', icons.italic, () => c().toggleItalic().run(), () => e().isActive('italic')),
    tool('underline', icons.underline, () => c().toggleUnderline().run(), () => e().isActive('underline')),
    tool('strike', icons.strike, () => c().toggleStrike().run(), () => e().isActive('strike')),
    h('span', { class: 'm-tsep' }),
    tool('bullet', icons.bullet, () => c().toggleBulletList().run(), () => e().isActive('bulletList')),
    tool('ordered', icons.ordered, () => c().toggleOrderedList().run(), () => e().isActive('orderedList')),
    tool('toggle', icons.toggle, () => BLOCKS.find((b) => b.id === 'toggle').run(editor), () => e().isActive('details')),
    tool('link', icons.link, () => openLinkSheet(), () => e().isActive('link')),
    tool('color', '<span class="color-a">A</span>', () => openColorSheet()),
    tool('table', icons.table, () => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    tool('block-menu', icons.grip, () => openBlockMenuSheet()),
    tool('indent-out', svgPath('M21 12H9M13 6l-6 6 6 6'), () => c().liftListItem(e().isActive('taskList') ? 'taskItem' : 'listItem').run()),
    tool('indent-in', svgPath('M3 12h12M11 6l6 6-6 6'), () => c().sinkListItem(e().isActive('taskList') ? 'taskItem' : 'listItem').run()),
    tool('undo', svgPath('M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11'), () => c().undo().run()),
    tool('redo', svgPath('m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13'), () => c().redo().run()),
    tool('kb', svgPath('M6 9l6 6 6-6'), () => { editor.commands.blur(); document.activeElement && document.activeElement.blur() }),
  )
  return bar
}
const svgPath = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`

function refreshToolbar() {
  if (!editor) return
  for (const t of TB) if (t.isActive) t.el.classList.toggle('on', !!t.isActive())
  const cur = BLOCKS.slice().reverse().find((b) => b.id !== 'p' && b.active(editor)) || BLOCKS[0]
  const blk = TB.find((t) => t.key === 'block')
  if (blk) blk.el.innerHTML = cur.icon
  renderTableBar()
}

let tableBarOn = false
function renderTableBar() {
  const inTable = editor.isActive('table')
  document.body.classList.toggle('in-table', inTable)
  if (!inTable || tableBarOn) {
    tableBarOn = inTable
    return
  }
  tableBarOn = true
  const bar = $('#m-tablebar')
  bar.innerHTML = ''
  const c = () => editor.chain().focus()
  const b = (label, fn) => {
    const el = h('button', { onclick: fn }, label)
    el.addEventListener('pointerdown', (e) => e.preventDefault())
    return el
  }
  bar.append(
    b('+ Wiersz', () => c().addRowAfter().run()),
    b('+ Kolumna', () => c().addColumnAfter().run()),
    b('− Wiersz', () => c().deleteRow().run()),
    b('− Kolumna', () => c().deleteColumn().run()),
    b('Nagłówek', () => c().toggleHeaderRow().run()),
    b('Usuń tabelę', () => c().deleteTable().run()),
  )
}

// ---- otwieranie / zamykanie ----
function openEditor(id) {
  const n = getNote(id)
  if (!n) return
  closeSheet()
  closeMenu()
  if (editor) closeEditor(false, true)
  current = n
  dirty = false
  view = 'editor'
  listScreen.hidden = true
  editorScreen.hidden = false
  $('#m-title').value = n.title || ''
  $('#m-title').placeholder = n.autoTitle || 'Bez tytułu'
  const el = $('#m-editor')
  el.innerHTML = ''
  editor = createEditor(el, n.content, {
    onUpdate: () => {
      dirty = true
      clearTimeout(editSaveTimer)
      editSaveTimer = setTimeout(saveEditor, 400)
    },
    onSelection: refreshToolbar,
  })
  editor.view.dom.addEventListener('click', onEditorTap)
  applyMeta()
  refreshToolbar()
  $('#m-escroll').scrollTop = 0
  if (n.empty) setTimeout(() => editor && editor.commands.focus('end'), 150)
}

function snapshot() {
  let autoTitle = ''
  editor.state.doc.descendants((node) => {
    if (autoTitle) return false
    if (node.isTextblock && node.textContent.trim()) {
      autoTitle = node.textContent.trim().slice(0, 80)
      return false
    }
  })
  return { content: editor.getJSON(), text: editor.getText({ blockSeparator: '\n' }), autoTitle }
}

function saveEditor() {
  clearTimeout(editSaveTimer)
  if (!editor || !current || !dirty) return
  dirty = false
  const s = snapshot()
  Object.assign(current, s)
  current.empty = editor.isEmpty && !current.title
  current.updatedAt = Date.now()
  $('#m-title').placeholder = current.autoTitle || 'Bez tytułu'
  touch(current)
}

function closeEditor(save = true, silent = false) {
  if (save) saveEditor()
  else clearTimeout(editSaveTimer)
  const n = current
  if (editor) {
    editor.destroy()
    editor = null
  }
  current = null
  document.body.classList.remove('in-table')
  tableBarOn = false
  // pusta notatka nie zostaje na liście
  if (n && n.empty && !n.title && getNote(n.id)) purgeLocal(n.id)
  if (silent) return
  view = 'list'
  editorScreen.hidden = true
  listScreen.hidden = false
  closeMenu()
  renderList()
}

function applyRemoteToEditor(n, contentChanged) {
  if (document.activeElement !== $('#m-title')) $('#m-title').value = n.title || ''
  $('#m-title').placeholder = n.autoTitle || 'Bez tytułu'
  if (contentChanged && editor && !dirty) {
    const { from, to } = editor.state.selection
    editor.commands.setContent(n.content || '', { emitUpdate: false })
    const max = editor.state.doc.content.size
    try {
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) })
    } catch {}
  }
  applyMeta()
}

function applyMeta() {
  if (!current) return
  const c = colorById(current.color)
  editorScreen.style.setProperty('--note-top', c.bg || 'var(--bg)')
  const fav = $('#m-fav')
  fav.innerHTML = current.favorite ? icons.starFill : icons.star
  fav.classList.toggle('fav-on', !!current.favorite)
  const ed = $('#m-editor')
  ed.classList.toggle('font-serif', current.font === 'serif')
  ed.classList.toggle('font-mono', current.font === 'mono')
  ed.classList.toggle('small', !!current.small)
}

// ---- menu notatki ----
function openNoteMenu(n, fromList) {
  if (!n) return
  openSheet(() => h('div', {},
    h('div', { class: 'menu-label' }, 'Kolor'),
    h('div', { class: 'color-dots' }, COLORS.map((c) => h('button', {
      class: 'color-dot' + (n.color === c.id ? ' sel' : ''),
      style: `--dot:${c.text || '#5a5a5a'}; --dot-bg:${c.bg || '#2a2a2a'}`,
      onclick: () => { n.color = c.id; touch(n); applyMeta(); closeSheet(); if (fromList) renderList() },
    }))),
    h('div', { class: 'menu-label' }, 'Czcionka'),
    h('div', { class: 'font-tiles' }, [['default', 'Domyślna', ''], ['serif', 'Szeryfowa', 'font-serif'], ['mono', 'Mono', 'font-mono']].map(([id, name, cls]) =>
      h('button', { class: 'font-tile ' + cls + ((n.font || 'default') === id ? ' sel' : ''), onclick: () => { n.font = id; touch(n); applyMeta(); closeSheet() } },
        h('span', { class: 'ag' }, 'Ag'), h('span', { class: 'fname' }, name)))),
    sheetItem(icons.text, n.small ? 'Normalny tekst' : 'Mały tekst', () => { n.small = !n.small; touch(n); applyMeta(); closeSheet() }),
    sheetItem(n.favorite ? icons.starFill : icons.star, n.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych', () => { n.favorite = !n.favorite; touch(n); applyMeta(); closeSheet(); if (fromList) renderList() }),
    sheetItem(icons.copy, 'Duplikuj', () => {
      if (!fromList) saveEditor()
      const d = newNote()
      Object.assign(d, JSON.parse(JSON.stringify({ content: n.content, text: n.text, title: n.title ? n.title + ' (kopia)' : '', autoTitle: n.autoTitle, color: n.color, font: n.font, small: n.small, empty: n.empty })))
      touch(d)
      closeSheet()
      if (fromList) renderList()
      else openEditor(d.id)
    }),
    sheetItem(icons.trash, 'Przenieś do kosza', () => {
      closeSheet()
      if (!fromList) closeEditor(true)
      if (n.empty && !n.title) {
        purgeLocal(n.id)
      } else {
        n.deleted = true
        n.deletedAt = Date.now()
        touch(n)
      }
      renderList()
      toast('Przeniesiono do kosza')
    }, 'danger'),
    h('div', { class: 'sheet-desc', style: 'padding-top:10px' }, `Edytowano ${relTime(n.updatedAt || Date.now())}`)))
}

// ---- arkusze edytora ----
function keepFocus(fn) {
  return () => {
    closeSheet()
    fn()
  }
}

function openInsertSheet() {
  const all = [...BLOCKS, ...INSERTS]
  openSheet(() => h('div', {},
    h('div', { class: 'sheet-title' }, 'Wstaw'),
    ...all.map((it) => sheetItem(it.icon, it.title, keepFocus(() => it.run(editor))))))
}

function openBlockSheet() {
  openSheet(() => h('div', {},
    h('div', { class: 'sheet-title' }, 'Zamień na'),
    ...BLOCKS.map((b) => sheetItem(b.icon, b.title, keepFocus(() => b.run(editor)), b.active(editor) ? 'on' : ''))))
}

function openColorSheet() {
  const curColor = editor.getAttributes('textStyle').color || null
  const curBg = editor.getAttributes('highlight').color || null
  const grid = (kind) => h('div', { class: 'swatch-grid' }, COLORS.map((c) => {
    const val = kind === 'text' ? c.text : c.bg
    return h('button', {
      class: 'swatch' + ((kind === 'text' ? curColor : curBg) === val ? ' sel' : ''),
      style: kind === 'text' ? `color:${c.text || 'var(--text)'}` : `background:${c.bg || 'transparent'}`,
      onclick: keepFocus(() => {
        const ch = editor.chain().focus()
        if (kind === 'text') (val ? ch.setColor(val) : ch.unsetColor()).run()
        else (val ? ch.setHighlight({ color: val }) : ch.unsetHighlight()).run()
      }),
    }, 'A')
  }))
  openSheet(() => h('div', {},
    h('div', { class: 'menu-label' }, 'Kolor tekstu'), grid('text'),
    h('div', { class: 'menu-label' }, 'Kolor tła'), grid('bg')))
}

function openLinkSheet() {
  const sel = { from: editor.state.selection.from, to: editor.state.selection.to }
  const prev = editor.getAttributes('link').href || ''
  const input = h('input', { class: 'm-input', placeholder: 'https://…', value: prev, type: 'url', inputmode: 'url' })
  const apply = () => {
    const url = input.value.trim()
    closeSheet()
    const ch = editor.chain().focus().setTextSelection(sel).extendMarkRange('link')
    if (!url) ch.unsetLink().run()
    else if (sel.from === sel.to && !prev) {
      editor.chain().focus().insertContentAt(sel.from, [{ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }, { type: 'text', text: ' ' }]).run()
    } else ch.setLink({ href: url }).run()
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply() })
  openSheet(() => h('div', {},
    h('div', { class: 'sheet-title' }, prev ? 'Edytuj link' : 'Dodaj link'),
    h('div', { class: 'sheet-desc' }, 'Zaznacz tekst przed dodaniem, aby zrobić z niego hiperlink.'),
    h('div', { class: 'm-form' },
      input,
      h('button', { class: 'btn primary', onclick: apply }, 'Zapisz'),
      h('button', { class: 'btn', onclick: () => { closeSheet(); openNotePicker(sel) } }, 'Link do innej notatki'),
      prev ? h('button', { class: 'btn danger', onclick: () => { closeSheet(); editor.chain().focus().setTextSelection(sel).extendMarkRange('link').unsetLink().run() } }, 'Usuń link') : null)))
  setTimeout(() => input.focus(), 200)
}

function openNotePicker(sel) {
  const range = sel || { from: editor.state.selection.from, to: editor.state.selection.to }
  const nameOf = (n) => n.title || n.autoTitle || 'Bez tytułu'
  const others = notes.filter((n) => !n.deleted && !n.empty && (!current || n.id !== current.id)).sort((a, b) => b.updatedAt - a.updatedAt)
  const input = h('input', { class: 'm-input', placeholder: 'Szukaj notatki…', type: 'search' })
  const list = h('div', {})
  const insert = (n) => {
    closeSheet()
    const href = 'note:' + n.id
    if (range.from !== range.to) editor.chain().focus().setTextSelection(range).setLink({ href }).run()
    else editor.chain().focus().insertContentAt(range.from, [{ type: 'text', text: nameOf(n), marks: [{ type: 'link', attrs: { href } }] }, { type: 'text', text: ' ' }]).run()
  }
  const render = () => {
    const q = input.value.trim().toLowerCase()
    list.innerHTML = ''
    const items = others.filter((n) => !q || (nameOf(n) + ' ' + n.text).toLowerCase().includes(q)).slice(0, 40)
    if (!items.length) list.append(h('div', { class: 'sheet-desc' }, 'Brak innych notatek'))
    items.forEach((n) => list.append(sheetItem(icons.notes, nameOf(n), () => insert(n))))
  }
  input.addEventListener('input', render)
  render()
  openSheet(() => h('div', {}, h('div', { class: 'sheet-title' }, 'Link do notatki'), h('div', { class: 'm-form' }, input), list))
}
hooks.pickNote = () => openNotePicker()
hooks.editLink = () => openLinkSheet()

// ---- dotknięcie linku ----
function onEditorTap(e) {
  const a = e.target.closest && e.target.closest('a[href]')
  if (!a) return
  const href = a.getAttribute('href')
  const isNote = href.startsWith('note:')
  const target = isNote ? getNote(href.slice(5)) : null
  openSheet(() => h('div', {},
    h('div', { class: 'sheet-title' }, isNote ? (target ? target.title || target.autoTitle || 'Bez tytułu' : 'Notatka nie istnieje') : 'Link'),
    isNote ? null : h('div', { class: 'sheet-desc', style: 'word-break:break-all' }, href),
    sheetItem(icons.open, isNote ? 'Otwórz notatkę' : 'Otwórz w przeglądarce', () => {
      closeSheet()
      if (isNote) window.api.openNote(href.slice(5))
      else window.api.openExternal(/^[a-z]+:/i.test(href) ? href : 'https://' + href)
    }),
    isNote ? null : sheetItem(icons.copy, 'Kopiuj link', () => { navigator.clipboard && navigator.clipboard.writeText(href); closeSheet(); toast('Skopiowano') }),
    sheetItem(icons.text, 'Edytuj link', () => { closeSheet(); openLinkSheet() }),
    sheetItem(icons.x, 'Usuń link', () => { closeSheet(); editor.chain().focus().extendMarkRange('link').unsetLink().run() }, 'danger')))
}

// ---- menu bloku (przenoszenie bez myszy) ----
function currentBlock() {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d >= 1; d--) {
    const n = $from.node(d)
    if (n.type.name === 'listItem' || n.type.name === 'taskItem') return { pos: $from.before(d), node: n }
  }
  if ($from.depth >= 1) return { pos: $from.before(1), node: $from.node(1) }
  return null
}
function moveBlock(dir) {
  const b = currentBlock()
  if (!b) return
  const offset = editor.state.selection.from - b.pos
  const $pos = editor.state.doc.resolve(b.pos)
  const idx = $pos.index()
  if ((dir < 0 && idx === 0) || (dir > 0 && idx >= $pos.parent.childCount - 1)) return
  const sib = $pos.parent.child(idx + dir)
  const tr = editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize)
  const target = dir < 0 ? b.pos - sib.nodeSize : b.pos + sib.nodeSize
  tr.insert(target, b.node)
  editor.view.dispatch(tr.scrollIntoView())
  editor.chain().focus().setTextSelection(Math.min(target + offset, editor.state.doc.content.size)).run()
}
function openBlockMenuSheet() {
  const b = currentBlock()
  if (!b) return
  openSheet(() => h('div', {},
    h('div', { class: 'sheet-title' }, 'Blok'),
    sheetItem(icons.up, 'Przenieś wyżej', () => moveBlock(-1)),
    sheetItem(icons.down, 'Przenieś niżej', () => moveBlock(1)),
    sheetItem(icons.copy, 'Duplikuj', keepFocus(() => editor.view.dispatch(editor.state.tr.insert(b.pos + b.node.nodeSize, b.node)))),
    sheetItem(icons.trash, 'Usuń blok', keepFocus(() => editor.view.dispatch(editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize))), 'danger')))
}

// ================= klawiatura ekranowa =================
if (window.visualViewport) {
  const vv = window.visualViewport
  const onVV = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    document.documentElement.style.setProperty('--kb', kb + 'px')
    document.body.classList.toggle('kb-open', kb > 80 || vv.height < window.screen.height * 0.6)
  }
  vv.addEventListener('resize', onVV)
  vv.addEventListener('scroll', onVV)
}

// ================= Android: przycisk wstecz, powrót do aplikacji =================
App.addListener('backButton', () => {
  if (isMenuOpen()) return closeMenu()
  if (closeSheet()) return
  if (view === 'editor') return closeEditor(true)
  App.minimizeApp()
})
App.addListener('pause', () => {
  saveEditor()
  saveLocalNow()
})
App.addListener('resume', () => sync && sync.refresh())
window.addEventListener('online', () => sync && sync.refresh())

// ================= start =================
buildListScreen()
buildEditorScreen()
renderList()
renderSyncDot()
if (sync) {
  sync.init().then(() => {
    renderSyncDot()
    // pierwsze uruchomienie: zaproponuj logowanie
    if (syncSt.state === 'signed-out' && !localStorage.getItem('notatki-asked-login')) {
      localStorage.setItem('notatki-asked-login', '1')
      openAccountSheet()
    }
  })
}
