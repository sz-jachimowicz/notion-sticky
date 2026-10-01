import { createEditor, BLOCKS, hooks, openHref } from './editor.js'
import { initDragHandle, blockOps } from './dragHandle.js'
import { icons, COLORS, colorById, relTime } from './shared.js'
import { popover, closeMenu, initTooltips, h } from './ui.js'

const id = new URLSearchParams(location.search).get('id')
const $ = (s) => document.querySelector(s)

let note = null
let editor = null
let saveTimer = null
let dirty = false

initTooltips()

// ---------- zapisywanie ----------
function snapshot() {
  let autoTitle = ''
  editor.state.doc.descendants((node) => {
    if (autoTitle) return false
    if (node.isTextblock && node.textContent.trim()) {
      autoTitle = node.textContent.trim().slice(0, 80)
      return false
    }
  })
  return {
    content: editor.getJSON(),
    text: editor.getText({ blockSeparator: '\n' }),
    autoTitle,
    empty: editor.isEmpty && !note.title,
  }
}

function scheduleSave() {
  dirty = true
  clearTimeout(saveTimer)
  saveTimer = setTimeout(flush, 250)
}

function flush() {
  clearTimeout(saveTimer)
  if (!dirty || !editor) return
  dirty = false
  window.api.updateNote(id, snapshot())
}

window.addEventListener('beforeunload', () => {
  if (dirty && editor) {
    dirty = false
    window.api.updateNoteSync(id, snapshot())
  }
})

// ---------- fokus: pokaż/ukryj opcje ----------
function setFocused(f) {
  document.body.classList.toggle('focused', f)
  if (!f) closeMenu()
  updateSpellcheck()
}

// czerwone podkreślenia tylko podczas pisania w notatce; znikają po kliknięciu gdzie indziej
function updateSpellcheck() {
  if (!editor) return
  const on = document.body.classList.contains('focused') && editor.isFocused
  const dom = editor.view.dom
  if (dom.spellcheck !== on) dom.spellcheck = on
}
window.addEventListener('focus', () => setFocused(true))
window.addEventListener('blur', () => {
  setFocused(false)
  flush()
})

// ---------- meta (kolor, przypięcie, ulubione, czcionka) ----------
function applyMeta() {
  const c = colorById(note.color)
  const root = document.documentElement.style
  root.setProperty('--note-accent', c.text || 'rgba(255,255,255,0.18)')
  root.setProperty('--note-top', c.bg || 'var(--bg-2)')
  document.body.dataset.color = c.id

  const ed = $('#editor')
  ed.classList.toggle('font-serif', note.font === 'serif')
  ed.classList.toggle('font-mono', note.font === 'mono')
  ed.classList.toggle('small', !!note.small)

  $('#btn-pin').classList.toggle('on', !!note.pinned)
  $('#btn-fav').innerHTML = note.favorite ? icons.starFill : icons.star
  $('#btn-fav').classList.toggle('fav-on', !!note.favorite)

  const t = $('#title')
  if (document.activeElement !== t) t.value = note.title || ''
  t.placeholder = note.autoTitle || 'Bez tytułu'
  document.title = note.title || note.autoTitle || 'Notatka'

  $('#tb-status').innerHTML =
    (note.pinned ? `<span class="st" data-tip="Przypięta na wierzchu">${icons.pin}</span>` : '') +
    (note.favorite ? `<span class="st fav">${icons.starFill}</span>` : '')
}

async function patchMeta(p) {
  Object.assign(note, p)
  applyMeta()
  await window.api.updateNote(id, p)
}

async function togglePin() {
  note.pinned = !note.pinned
  applyMeta()
  await window.api.setPinned(id, note.pinned)
}

window.api.onMeta((meta) => {
  Object.assign(note, meta)
  applyMeta()
})

// ---------- pasek górny ----------
function initTopbar() {
  $('#btn-new').innerHTML = icons.plus
  $('#btn-all').innerHTML = icons.notes
  $('#btn-pin').innerHTML = icons.pin
  $('#btn-more').innerHTML = icons.more
  $('#btn-close').innerHTML = icons.x
  $('#btn-min').innerHTML = icons.minus
  $('#btn-min').onclick = () => window.api.minimizeNote(id)

  const t = $('#title')
  let titleTimer = null
  const saveTitle = () => {
    clearTimeout(titleTimer)
    note.title = t.value.trim()
    window.api.updateNote(id, { title: note.title, empty: editor.isEmpty && !note.title })
    document.title = note.title || note.autoTitle || 'Notatka'
  }
  t.addEventListener('input', () => {
    clearTimeout(titleTimer)
    titleTimer = setTimeout(saveTitle, 250)
  })
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault()
      editor.commands.focus('start')
    } else if (e.key === 'Escape') {
      t.value = note.title || ''
      editor.commands.focus()
    }
  })
  t.addEventListener('blur', saveTitle)

  $('#btn-new').onclick = () => window.api.createNote()
  $('#btn-all').onclick = () => window.api.openManager()
  $('#btn-pin').onclick = togglePin
  $('#btn-fav').onclick = () => patchMeta({ favorite: !note.favorite })
  $('#btn-close').onclick = closeNote
  $('#btn-more').onclick = (e) => openMoreMenu(e.currentTarget)
}

function closeNote() {
  flush()
  window.api.closeNote(id)
}

function openMoreMenu(anchor) {
  const colors = h('div', { class: 'color-dots' },
    COLORS.map((c) =>
      h('button', {
        class: 'color-dot' + (note.color === c.id ? ' sel' : ''),
        'data-tip': c.name,
        style: `--dot:${c.text || '#5a5a5a'}; --dot-bg:${c.bg || '#2a2a2a'}`,
        onclick: () => {
          patchMeta({ color: c.id })
          openMoreMenu(anchor)
        },
      })))

  const stats = editor.storage && editor.getText().trim()
  const words = stats ? stats.split(/\s+/).length : 0

  const item = (icon, label, onclick, extra = {}) =>
    h('button', { class: 'menu-item ' + (extra.cls || ''), onclick },
      h('span', { class: 'mi-icon', html: icon }), label, extra.right || null)

  const content = h('div', {},
    h('div', { class: 'menu-label' }, 'Kolor karteczki'),
    colors,
    h('div', { class: 'menu-sep' }),
    item(icons.pin, 'Zawsze na wierzchu', () => { togglePin(); openMoreMenu(anchor) },
      { right: h('span', { class: 'mi-right' }, h('span', { class: 'switch' + (note.pinned ? ' on' : '') })) }),
    item(note.favorite ? icons.starFill : icons.star, note.favorite ? 'Usuń z ulubionych' : 'Dodaj do ulubionych',
      () => { patchMeta({ favorite: !note.favorite }); closeMenu() }),
    item(icons.copy, 'Duplikuj', () => { flush(); closeMenu(); window.api.duplicateNote(id) }),
    item(icons.notes, 'Wszystkie notatki', () => { closeMenu(); window.api.openManager() }),
    item(icons.text, 'Zmień tytuł', () => { closeMenu(); $('#title').focus(); $('#title').select() }),
    h('div', { class: 'menu-sep' }),
    item(icons.trash, 'Usuń notatkę', () => confirmDelete(anchor), { cls: 'danger' }),
    h('div', { class: 'menu-foot' },
      `Słowa: ${words}`, h('br'), `Edytowano ${relTime(note.updatedAt || Date.now())}`),
  )
  popover(anchor, content, { placement: 'below', align: 'end', className: 'more-menu' })
}

function confirmDelete(anchor) {
  const content = h('div', { class: 'confirm' },
    h('div', { class: 'confirm-title' }, 'Usunąć tę notatkę?'),
    h('div', { class: 'confirm-desc' }, 'Trafi do kosza — możesz ją przywrócić w oknie „Wszystkie notatki”.'),
    h('div', { class: 'confirm-actions' },
      h('button', { class: 'btn', onclick: closeMenu }, 'Anuluj'),
      h('button', { class: 'btn danger', onclick: () => { closeMenu(); dirty = false; clearTimeout(saveTimer); window.api.trashNote(id) } }, 'Usuń')))
  popover(anchor, content, { placement: 'below', align: 'end' })
}

// ---------- pasek dolny (formatowanie) ----------
const TB = []
function tbButton(key, icon, tip, run, isActive) {
  const b = h('button', { class: 'icon-btn', 'data-tip': tip, 'data-key': key, html: icon })
  b.addEventListener('mousedown', (e) => e.preventDefault()) // nie zabieraj fokusu z edytora
  b.addEventListener('click', (e) => run(e.currentTarget))
  TB.push({ key, el: b, isActive, run, icon, tip })
  return b
}
const sep = () => h('span', { class: 'tb-sep' })

function initToolbar() {
  const bar = $('#toolbar')
  const e = () => editor

  const blockBtn = h('button', { class: 'icon-btn block-btn', 'data-tip': 'Zamień na…' },
    h('span', { class: 'block-icon', html: icons.text }), h('span', { class: 'chev', html: icons.chevron }))
  blockBtn.addEventListener('mousedown', (ev) => ev.preventDefault())
  blockBtn.onclick = () => openBlockMenu(blockBtn)
  TB.push({ key: 'block', el: blockBtn })

  bar.append(
    blockBtn,
    sep(),
    tbButton('bold', icons.bold, 'Pogrubienie|Ctrl+B', () => e().chain().focus().toggleBold().run(), () => e().isActive('bold')),
    tbButton('italic', icons.italic, 'Kursywa|Ctrl+I', () => e().chain().focus().toggleItalic().run(), () => e().isActive('italic')),
    tbButton('underline', icons.underline, 'Podkreślenie|Ctrl+U', () => e().chain().focus().toggleUnderline().run(), () => e().isActive('underline')),
    tbButton('strike', icons.strike, 'Przekreślenie|Ctrl+Shift+S', () => e().chain().focus().toggleStrike().run(), () => e().isActive('strike')),
    sep(),
    tbButton('todo', icons.todo, 'Lista zadań|[] + spacja', () => e().chain().focus().toggleTaskList().run(), () => e().isActive('taskList')),
    tbButton('bullet', icons.bullet, 'Lista punktowana|- + spacja', () => e().chain().focus().toggleBulletList().run(), () => e().isActive('bulletList')),
    tbButton('ordered', icons.ordered, 'Lista numerowana|1. + spacja', () => e().chain().focus().toggleOrderedList().run(), () => e().isActive('orderedList')),
    tbButton('toggle', icons.toggle, 'Lista rozwijana|> + spacja', () => BLOCKS.find((b) => b.id === 'toggle').run(e()), () => e().isActive('details')),
    tbButton('link', icons.link, 'Link|Ctrl+K', (b) => openLinkMenu(b), () => e().isActive('link')),
    sep(),
    tbButton('color', '<span class="color-a">A</span>', 'Kolor tekstu i tła', (b) => openColorMenu(b)),
    tbButton('font', '<span class="font-aa">Aa</span>', 'Czcionka', (b) => openFontMenu(b)),
    tbButton('table', icons.table, 'Wstaw tabelę', () => e().chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()),
    tbButton('more', icons.more, 'Więcej', (b) => openInsertMenu(b)),
  )

  fitToolbar()
  window.addEventListener('resize', fitToolbar)
}

// Przyciski, które nie mieszczą się w wąskiej karteczce, trafiają do menu "⋯"
const OVERFLOW_ORDER = ['table', 'font', 'color', 'link', 'toggle', 'strike', 'underline', 'ordered', 'italic']
function fitToolbar() {
  const bar = $('#toolbar')
  for (const t of TB) t.el.style.display = ''
  bar.querySelectorAll('.tb-sep').forEach((s) => (s.style.display = ''))
  for (const key of OVERFLOW_ORDER) {
    if (bar.scrollWidth <= bar.clientWidth + 1) break
    const t = TB.find((x) => x.key === key)
    if (t) t.el.style.display = 'none'
    // ukryj zbędne separatory
    const kids = [...bar.children].filter((c) => c.style.display !== 'none')
    kids.forEach((c, i) => {
      if (c.classList.contains('tb-sep') && (kids[i + 1]?.classList.contains('tb-sep') || kids[i + 1]?.dataset.key === 'more')) c.style.display = 'none'
    })
  }
}
const hiddenTools = () => TB.filter((t) => t.run && t.key !== 'more' && t.el.style.display === 'none')

function refreshToolbar() {
  if (!editor) return
  for (const t of TB) if (t.isActive) t.el.classList.toggle('on', !!t.isActive())
  const cur = BLOCKS.slice().reverse().find((b) => b.id !== 'p' && b.active(editor)) || BLOCKS[0]
  const blk = TB.find((t) => t.key === 'block')
  if (blk) blk.el.querySelector('.block-icon').innerHTML = cur.icon
  const color = editor.getAttributes('textStyle').color
  const a = document.querySelector('.color-a')
  if (a) a.style.setProperty('--u', color || 'rgba(255,255,255,0.5)')
  renderTableBar()
}

function openBlockMenu(anchor) {
  const content = h('div', {},
    h('div', { class: 'menu-label' }, 'Zamień na'),
    BLOCKS.map((b) => {
      const active = b.active(editor) && (b.id !== 'p' || !BLOCKS.some((x) => x.id !== 'p' && x.active(editor)))
      return h('button', {
        class: 'menu-item',
        onmousedown: (ev) => ev.preventDefault(),
        onclick: () => { closeMenu(); b.run(editor) },
      },
      h('span', { class: 'mi-icon', html: b.icon }), b.title,
      h('span', { class: 'mi-right' }, active ? '✓' : (b.md || '')))
    }))
  popover(anchor, content, { placement: 'above' })
}

function openColorMenu(anchor) {
  const curColor = editor.getAttributes('textStyle').color || null
  const curBg = editor.getAttributes('highlight').color || null
  const grid = (kind) => h('div', { class: 'swatch-grid' },
    COLORS.map((c) => {
      const val = kind === 'text' ? c.text : c.bg
      const sel = kind === 'text' ? curColor === val : curBg === val
      return h('button', {
        class: 'swatch' + (sel ? ' sel' : ''),
        'data-tip': c.name,
        style: kind === 'text' ? `color:${c.text || 'var(--text)'}` : `background:${c.bg || 'transparent'}`,
        onmousedown: (ev) => ev.preventDefault(),
        onclick: () => {
          const ch = editor.chain().focus()
          if (kind === 'text') (val ? ch.setColor(val) : ch.unsetColor()).run()
          else (val ? ch.setHighlight({ color: val }) : ch.unsetHighlight()).run()
          closeMenu()
        },
      }, 'A')
    }))
  popover(anchor, h('div', {},
    h('div', { class: 'menu-label' }, 'Kolor tekstu'), grid('text'),
    h('div', { class: 'menu-label' }, 'Kolor tła'), grid('bg')),
  { placement: 'above', className: 'color-menu' })
}

function openFontMenu(anchor) {
  const fonts = [
    { id: 'default', name: 'Domyślna', cls: '' },
    { id: 'serif', name: 'Szeryfowa', cls: 'font-serif' },
    { id: 'mono', name: 'Mono', cls: 'font-mono' },
  ]
  const content = h('div', {},
    h('div', { class: 'menu-label' }, 'Styl czcionki'),
    h('div', { class: 'font-tiles' },
      fonts.map((f) => h('button', {
        class: 'font-tile ' + f.cls + ((note.font || 'default') === f.id ? ' sel' : ''),
        onmousedown: (ev) => ev.preventDefault(),
        onclick: () => { patchMeta({ font: f.id }); openFontMenu(anchor) },
      }, h('span', { class: 'ag' }, 'Ag'), h('span', { class: 'fname' }, f.name)))),
    h('div', { class: 'menu-sep' }),
    h('button', {
      class: 'menu-item',
      onmousedown: (ev) => ev.preventDefault(),
      onclick: () => { patchMeta({ small: !note.small }); openFontMenu(anchor) },
    }, 'Mały tekst', h('span', { class: 'mi-right' }, h('span', { class: 'switch' + (note.small ? ' on' : '') }))),
  )
  popover(anchor, content, { placement: 'above', className: 'font-menu' })
}

function openInsertMenu(anchor) {
  const item = (icon, label, run, right) => h('button', {
    class: 'menu-item',
    onmousedown: (ev) => ev.preventDefault(),
    onclick: () => { closeMenu(); run() },
  }, h('span', { class: 'mi-icon', html: icon }), label, right ? h('span', { class: 'mi-right' }, right) : null)
  const c = () => editor.chain().focus()
  const hidden = hiddenTools()
  popover(anchor, h('div', {},
    hidden.map((t) => {
      const [label, kbd] = t.tip.split('|')
      return h('button', {
        class: 'menu-item' + (t.isActive && t.isActive() ? ' on' : ''),
        onmousedown: (ev) => ev.preventDefault(),
        onclick: () => { closeMenu(); t.run(anchor) },
      }, h('span', { class: 'mi-icon', html: t.icon }), label, kbd ? h('span', { class: 'mi-right' }, kbd) : null)
    }),
    hidden.length ? h('div', { class: 'menu-sep' }) : null,
    hidden.some((t) => t.key === 'link') ? null : item(icons.link, 'Link', () => openLinkMenu(anchor), 'Ctrl+K'),
    item(icons.notes, 'Link do notatki', () => openNotePicker(anchor), '[['),
    item(icons.code, 'Kod w linii', () => c().toggleCode().run(), 'Ctrl+E'),
    item(icons.highlight, 'Zakreślenie', () => c().toggleHighlight({ color: COLORS[4].bg }).run()),
    item(icons.clear, 'Wyczyść formatowanie', () => c().unsetAllMarks().clearNodes().run()),
    h('div', { class: 'menu-sep' }),
    item(icons.quote, 'Cytat', () => c().toggleBlockquote().run(), '"'),
    item(icons.toggle, 'Lista rozwijana', () => BLOCKS.find((b) => b.id === 'toggle').run(editor), '>'),
    item(icons.callout, 'Callout', () => c().wrapIn('callout').run()),
    item('<b class="glyph">{}</b>', 'Blok kodu', () => c().toggleCodeBlock().run(), '```'),
    item(icons.divider, 'Separator', () => c().setHorizontalRule().run(), '---'),
    h('div', { class: 'menu-sep' }),
    item(icons.plus, 'Wszystkie polecenia', openSlash, '/'),
  ), { placement: 'above', align: 'end' })
}

function openSlash() {
  const { $from } = editor.state.selection
  const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset)
  editor.chain().focus().insertContent(before && before !== ' ' ? ' /' : '/').run()
}

function openLinkMenu(anchor) {
  hideLinkBubble()
  const prev = editor.getAttributes('link').href || ''
  const input = h('input', { class: 'link-input', placeholder: 'Wklej link…', value: prev, spellcheck: 'false' })
  const apply = () => {
    const url = input.value.trim()
    const ch = editor.chain().focus().extendMarkRange('link')
    if (!url) ch.unsetLink().run()
    else if (editor.state.selection.empty && prev) ch.setLink({ href: url }).run()
    else if (editor.state.selection.empty && !prev) {
      editor.chain().focus().insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }).insertContent(' ').run()
    } else ch.setLink({ href: url }).run()
    closeMenu()
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply() } })
  const el = popover(anchor, h('div', { class: 'link-box' },
    input,
    h('div', { class: 'confirm-actions' },
      prev ? h('button', { class: 'btn', onclick: () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); closeMenu() } }, 'Usuń link') : null,
      h('button', { class: 'btn primary', onclick: apply }, 'Zapisz'))),
  { placement: 'above', align: 'end' })
  setTimeout(() => { input.focus(); input.select() })
  return el
}

// ---------- dymek linku (po kliknięciu w link) ----------
let bubble = null
function hideLinkBubble() {
  if (bubble) bubble.remove()
  bubble = null
}

// zakres całego linku wokół kursora
function linkRange() {
  const { state } = editor
  const $pos = state.selection.$from
  const type = state.schema.marks.link
  const mark = type.isInSet($pos.marks())
  if (!mark) return null
  const href = mark.attrs.href
  const parent = $pos.parent
  const base = $pos.start()
  // zbierz ciągłe fragmenty z tym samym linkiem, wybierz ten zawierający kursor
  let runs = []
  let cur = null
  parent.forEach((child, off) => {
    const m = type.isInSet(child.marks)
    if (m && m.attrs.href === href) {
      if (cur && cur.to === base + off) cur.to = base + off + child.nodeSize
      else {
        cur = { from: base + off, to: base + off + child.nodeSize }
        runs.push(cur)
      }
    } else cur = null
  })
  const pos = state.selection.from
  const run = runs.find((r) => r.from <= pos && r.to >= pos) || runs[0]
  return run ? { ...run, href } : null
}

async function updateLinkBubble() {
  if (!editor.isFocused || !editor.state.selection.empty || !editor.isActive('link') || document.querySelector('.menu')) return hideLinkBubble()
  const r = linkRange()
  if (!r) return hideLinkBubble()
  const key = r.from + ':' + r.href
  if (bubble && bubble.dataset.key === key) return
  hideLinkBubble()
  let label = r.href
  if (r.href.startsWith('note:')) {
    const target = await window.api.getNote(r.href.slice(5))
    label = target && !target.deleted ? (target.title || target.autoTitle || 'Bez tytułu') : 'Notatka nie istnieje'
  }
  if (bubble) return
  const btn = (html, tip, fn) => h('button', { class: 'icon-btn', 'data-tip': tip, html, onmousedown: (e) => e.preventDefault(), onclick: fn })
  bubble = h('div', { class: 'link-bubble' },
    h('span', { class: 'lb-icon', html: r.href.startsWith('note:') ? icons.notes : icons.link }),
    h('button', { class: 'lb-url', 'data-tip': 'Otwórz|Ctrl+klik', onmousedown: (e) => e.preventDefault(), onclick: () => openHref(r.href) }, label),
    btn(icons.open, 'Otwórz', () => openHref(r.href)),
    r.href.startsWith('note:') ? null : btn(icons.copy, 'Kopiuj link', () => { navigator.clipboard.writeText(r.href); hideLinkBubble() }),
    btn(icons.text, 'Edytuj link', () => { editor.commands.setTextSelection({ from: r.from, to: r.to }); openLinkMenu(bubbleRect) }),
    btn(icons.x, 'Usuń link', () => { editor.chain().focus().setTextSelection({ from: r.from, to: r.to }).unsetLink().run(); hideLinkBubble() }),
  )
  bubble.dataset.key = key
  document.body.appendChild(bubble)
  const start = editor.view.coordsAtPos(r.from)
  const end = editor.view.coordsAtPos(r.to)
  const w = bubble.offsetWidth
  const bh = bubble.offsetHeight
  let top = Math.max(start.bottom, end.bottom) + 6
  if (top + bh > innerHeight - 46) top = start.top - bh - 6
  const left = Math.max(6, Math.min(start.left, innerWidth - w - 6))
  bubble.style.top = top + 'px'
  bubble.style.left = left + 'px'
  var bubbleRect = { left, right: left + w, top, bottom: top + bh }
}

// ---------- wybór notatki do podlinkowania ----------
async function openNotePicker(anchor) {
  const all = (await window.api.listNotes()).filter((n) => !n.deleted && n.id !== id && !n.empty)
  all.sort((a, b) => b.updatedAt - a.updatedAt)
  const input = h('input', { class: 'link-input', placeholder: 'Szukaj notatki…', spellcheck: 'false' })
  const list = h('div', { class: 'picker-list' })
  let sel = 0
  let items = []
  const nameOf = (n) => n.title || n.autoTitle || 'Bez tytułu'
  const savedSel = { from: editor.state.selection.from, to: editor.state.selection.to }
  const insert = (n) => {
    closeMenu()
    const href = 'note:' + n.id
    if (savedSel.from !== savedSel.to) {
      editor.chain().focus().setTextSelection(savedSel).setLink({ href }).run()
    } else {
      editor.chain().focus().insertContentAt(savedSel.from, [
        { type: 'text', text: nameOf(n), marks: [{ type: 'link', attrs: { href } }] },
        { type: 'text', text: ' ' },
      ]).run()
    }
  }
  const render = () => {
    const q = input.value.trim().toLowerCase()
    items = all.filter((n) => !q || nameOf(n).toLowerCase().includes(q) || (n.text || '').toLowerCase().includes(q)).slice(0, 30)
    sel = Math.min(sel, Math.max(0, items.length - 1))
    list.innerHTML = ''
    if (!items.length) list.append(h('div', { class: 'picker-empty' }, 'Brak innych notatek'))
    items.forEach((n, i) => {
      const b = h('button', {
        class: 'menu-item' + (i === sel ? ' sel' : ''),
        onmousedown: (e) => e.preventDefault(),
        onclick: () => insert(n),
      }, h('span', { class: 'mi-icon', html: icons.notes }), h('span', { class: 'picker-name' }, nameOf(n)))
      list.append(b)
      if (i === sel) setTimeout(() => b.scrollIntoView({ block: 'nearest' }))
    })
  }
  input.addEventListener('input', () => { sel = 0; render() })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render() }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[sel]) insert(items[sel]) }
  })
  render()
  popover(anchor || caretRect(), h('div', { class: 'picker' }, h('div', { class: 'menu-label' }, 'Link do notatki'), input, list),
    { placement: 'below' })
  setTimeout(() => input.focus())
}

function caretRect() {
  const c = editor.view.coordsAtPos(editor.state.selection.from)
  return { left: c.left, right: c.left, top: c.top, bottom: c.bottom }
}

hooks.pickNote = () => openNotePicker()
hooks.editLink = () => openLinkMenu(caretRect())

// ---------- menu bloku (uchwyt ⋮⋮) ----------
function openBlockHandleMenu(anchor, block) {
  const item = (icon, label, fn, right, cls = '') => h('button', {
    class: 'menu-item ' + cls,
    onmousedown: (e) => e.preventDefault(),
    onclick: () => { closeMenu(); fn() },
  }, h('span', { class: 'mi-icon', html: icon }), label, right ? h('span', { class: 'mi-right' }, right) : null)
  const turnInto = BLOCKS.map((b) => item(b.icon, b.title, () => { blockOps.focusInside(editor, block); b.run(editor) }, b.md))
  popover(anchor, h('div', {},
    item(icons.trash, 'Usuń', () => blockOps.remove(editor, block), 'Del', 'danger'),
    item(icons.copy, 'Duplikuj', () => blockOps.duplicate(editor, block)),
    item(icons.up, 'Przenieś wyżej', () => blockOps.moveUp(editor, block), 'Alt+↑'),
    item(icons.down, 'Przenieś niżej', () => blockOps.moveDown(editor, block), 'Alt+↓'),
    h('div', { class: 'menu-sep' }),
    h('div', { class: 'menu-label' }, 'Zamień na'),
    turnInto,
  ), { placement: 'below', className: 'block-menu' })
}

// Alt+↑ / Alt+↓ przenosi blok, w którym jest kursor
function currentBlock() {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d >= 1; d--) {
    const n = $from.node(d)
    if (n.type.name === 'listItem' || n.type.name === 'taskItem') return { pos: $from.before(d), node: n }
  }
  if ($from.depth >= 1) return { pos: $from.before(1), node: $from.node(1) }
  const node = editor.state.doc.nodeAt($from.pos)
  return node ? { pos: $from.pos, node } : null
}

function moveBlock(dir) {
  const b = currentBlock()
  if (!b) return
  const offset = editor.state.selection.from - b.pos
  const $pos = editor.state.doc.resolve(b.pos)
  const idx = $pos.index()
  if (dir < 0 && idx === 0) return
  if (dir > 0 && idx >= $pos.parent.childCount - 1) return
  const sib = $pos.parent.child(idx + dir)
  const tr = editor.state.tr.delete(b.pos, b.pos + b.node.nodeSize)
  const target = dir < 0 ? b.pos - sib.nodeSize : b.pos + sib.nodeSize
  tr.insert(target, b.node)
  editor.view.dispatch(tr.scrollIntoView())
  editor.commands.setTextSelection(Math.min(target + offset, editor.state.doc.content.size))
}

// ---------- pasek tabeli ----------
let tableBarState = ''
function renderTableBar() {
  const bar = $('#tablebar')
  const inTable = editor.isActive('table')
  document.body.classList.toggle('in-table', inTable)
  if (!inTable) {
    tableBarState = ''
    return
  }
  if (tableBarState) return
  tableBarState = 'on'
  bar.innerHTML = ''
  const c = () => editor.chain().focus()
  const b = (label, run, tip, cls = '') => {
    const el = h('button', { class: 'tbl-btn ' + cls, 'data-tip': tip || '', onmousedown: (e) => e.preventDefault(), onclick: run })
    el.innerHTML = label
    return el
  }
  bar.append(
    h('span', { class: 'tbl-label', html: icons.table }),
    b('+ Wiersz', () => c().addRowAfter().run(), 'Dodaj wiersz poniżej'),
    b('+ Kolumna', () => c().addColumnAfter().run(), 'Dodaj kolumnę po prawej'),
    b('− Wiersz', () => c().deleteRow().run(), 'Usuń wiersz'),
    b('− Kolumna', () => c().deleteColumn().run(), 'Usuń kolumnę'),
    b('Nagłówek', () => c().toggleHeaderRow().run(), 'Włącz/wyłącz wiersz nagłówka'),
    b('Scal', () => c().mergeOrSplit().run(), 'Scal / rozdziel komórki'),
    b(icons.trash, () => c().deleteTable().run(), 'Usuń tabelę', 'danger'),
  )
}

// ---------- skróty ----------
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey
  if (!mod) return
  const k = e.key.toLowerCase()
  if (k === 'n' && !e.shiftKey) { e.preventDefault(); window.api.createNote() }
  else if (k === 'w') { e.preventDefault(); closeNote() }
  else if (k === 's') { e.preventDefault(); flush() }
  else if (k === 'p' && e.shiftKey) { e.preventDefault(); togglePin() }
  else if (k === 'k') { e.preventDefault(); openLinkMenu($('#toolbar')) }
})
document.addEventListener('keydown', (e) => {
  if (e.altKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && editor && editor.isFocused) {
    e.preventDefault()
    moveBlock(e.key === 'ArrowUp' ? -1 : 1)
  }
}, true)

// kliknięcie w pusty obszar pod tekstem -> kursor na końcu
$('#scroller').addEventListener('mousedown', (e) => {
  if (e.target.id === 'scroller' || e.target.id === 'editor') {
    e.preventDefault()
    editor.commands.focus('end')
  }
})

// ---------- start ----------
async function init() {
  note = await window.api.getNote(id)
  if (!note) {
    window.close()
    return
  }
  initTopbar()
  initToolbar()
  applyMeta()
  editor = createEditor($('#editor'), note.content, {
    onUpdate: scheduleSave,
    onSelection: () => { refreshToolbar(); updateLinkBubble() },
  })
  initDragHandle(editor, { scroller: $('#scroller'), onMenu: openBlockHandleMenu })
  editor.on('focus', updateSpellcheck)
  editor.on('blur', () => setTimeout(updateSpellcheck, 0))
  updateSpellcheck()
  editor.on('blur', () => setTimeout(() => { if (!editor.isFocused && !(bubble && bubble.matches(':hover'))) hideLinkBubble() }, 150))
  window.__editor = editor
  refreshToolbar()
  if (document.hasFocus()) {
    setFocused(true)
    editor.commands.focus('end')
  }
  window.addEventListener('focus', () => {
    if (!editor.isFocused && !document.querySelector('.menu')) editor.commands.focus()
  })
}

init()
