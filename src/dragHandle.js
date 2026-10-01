import { NodeSelection } from '@tiptap/pm/state'
import { icons } from './shared.js'

const ITEM_TYPES = ['listItem', 'taskItem']

// Uchwyt bloku jak w Notion: pojawia się po zaznaczeniu tekstu w prawym górnym rogu bloku.
// Przeciągnij, aby przenieść blok, kliknij, aby otworzyć menu bloku.
export function initDragHandle(editor, { scroller, onMenu }) {
  const view = editor.view
  const wrap = document.createElement('div')
  wrap.className = 'block-handle'
  wrap.innerHTML = `<div class="bh-btn bh-grip" draggable="true" data-tip="Przeciągnij, aby przenieść|Kliknij: menu">${icons.grip}</div>`
  document.body.appendChild(wrap)
  const grip = wrap.querySelector('.bh-grip')

  let current = null // { pos, node }
  let dragging = false

  const hide = () => {
    if (dragging) return
    wrap.classList.remove('visible')
  }

  // blok, w którym zaczyna się zaznaczenie (punkt listy albo blok najwyższego poziomu)
  function blockFromSelection() {
    const sel = view.state.selection
    if (sel instanceof NodeSelection) return { pos: sel.from, node: sel.node }
    const $p = sel.$from
    for (let d = $p.depth; d >= 1; d--) {
      const n = $p.node(d)
      if (ITEM_TYPES.includes(n.type.name)) return { pos: $p.before(d), node: n }
    }
    if ($p.depth >= 1) return { pos: $p.before(1), node: $p.node(1) }
    return null
  }

  // ikonka w prawym górnym rogu bloku
  function place(block) {
    const dom = view.nodeDOM(block.pos)
    if (!(dom instanceof HTMLElement)) return hide()
    const r = dom.getBoundingClientRect()
    const sr = scroller.getBoundingClientRect()
    if (r.bottom < sr.top || r.top > sr.bottom) return hide()
    const first = dom.matches('p,h1,h2,h3,pre') ? dom : dom.querySelector('p,h1,h2,h3,summary') || dom
    const cs = getComputedStyle(first)
    const lh = parseFloat(cs.lineHeight) || 20
    const padTop = parseFloat(cs.paddingTop) || 0
    const fr = first.getBoundingClientRect()
    let top = fr.top + padTop + lh / 2 - 12
    if (block.node.type.name === 'horizontalRule') top = r.top + r.height / 2 - 12
    if (block.node.type.name === 'table') top = r.top - 2
    const left = Math.min(r.right + 2, sr.right - 22)
    wrap.style.left = left + 'px'
    wrap.style.top = Math.max(sr.top + 2, top) + 'px'
    wrap.classList.add('visible')
  }

  function refresh() {
    if (dragging) return
    const sel = view.state.selection
    if (sel.empty || !document.body.classList.contains('focused')) {
      current = null
      return hide()
    }
    current = blockFromSelection()
    if (current) place(current)
    else hide()
  }

  editor.on('selectionUpdate', refresh)
  editor.on('update', refresh)
  scroller.addEventListener('scroll', () => current && !dragging && place(current), { passive: true })
  window.addEventListener('resize', refresh)
  window.addEventListener('blur', hide)
  window.addEventListener('focus', refresh)

  // ---- przeciąganie ----
  grip.addEventListener('dragstart', (e) => {
    if (!current) return
    dragging = true
    const { pos } = current
    const sel = NodeSelection.create(view.state.doc, pos)
    view.dispatch(view.state.tr.setSelection(sel))
    const slice = sel.content()
    const { dom, text } = view.serializeForClipboard(slice)
    e.dataTransfer.clearData()
    e.dataTransfer.setData('text/html', dom.innerHTML)
    e.dataTransfer.setData('text/plain', text)
    e.dataTransfer.effectAllowed = 'copyMove'
    const nodeDom = view.nodeDOM(pos)
    if (nodeDom instanceof HTMLElement) e.dataTransfer.setDragImage(nodeDom, 0, 0)
    view.dragging = { slice, move: true, node: sel }
    wrap.classList.add('dragging')
  })
  grip.addEventListener('dragend', () => {
    dragging = false
    wrap.classList.remove('dragging')
    hide()
  })

  // ---- kliknięcie w uchwyt: zaznacz blok i pokaż menu ----
  grip.addEventListener('mousedown', (e) => e.stopPropagation())
  grip.addEventListener('click', () => {
    if (!current) return
    const block = current
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, block.pos)))
    view.focus()
    onMenu && onMenu(grip, block)
  })

  return { hide }
}

// Operacje z menu bloku
export const blockOps = {
  remove(editor, { pos, node }) {
    editor.view.dispatch(editor.state.tr.delete(pos, pos + node.nodeSize))
    editor.commands.focus()
  },
  duplicate(editor, { pos, node }) {
    const tr = editor.state.tr.insert(pos + node.nodeSize, node)
    editor.view.dispatch(tr)
    editor.commands.focus()
  },
  moveUp(editor, { pos, node }) {
    const $pos = editor.state.doc.resolve(pos)
    const index = $pos.index()
    if (index === 0) return
    const prev = $pos.parent.child(index - 1)
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize).insert(pos - prev.nodeSize, node)
    tr.setSelection(NodeSelection.create(tr.doc, pos - prev.nodeSize))
    editor.view.dispatch(tr.scrollIntoView())
  },
  moveDown(editor, { pos, node }) {
    const $pos = editor.state.doc.resolve(pos)
    const index = $pos.index()
    if (index >= $pos.parent.childCount - 1) return
    const next = $pos.parent.child(index + 1)
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize)
    const target = pos + next.nodeSize
    tr.insert(target, node)
    tr.setSelection(NodeSelection.create(tr.doc, target))
    editor.view.dispatch(tr.scrollIntoView())
  },
  // ustaw kursor w bloku, aby komendy "Zamień na" działały
  focusInside(editor, { pos, node }) {
    const inner = Math.min(pos + (node.isTextblock ? 1 : 2), editor.state.doc.content.size)
    try {
      editor.commands.setTextSelection(inner)
    } catch {}
  },
}
