import { Editor, Extension, Node, mergeAttributes, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { Details, DetailsSummary, DetailsContent } from '@tiptap/extension-details'
import Blockquote from '@tiptap/extension-blockquote'
import Highlight from '@tiptap/extension-highlight'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Suggestion from '@tiptap/suggestion'
import { PluginKey, TextSelection } from '@tiptap/pm/state'
import { icons, COLORS } from './shared.js'
import { slashRenderer } from './slash.js'

// ---------- Callout (jak w Notion) ----------
const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      emoji: {
        default: '💡',
        parseHTML: (el) => el.getAttribute('data-emoji') || '💡',
        renderHTML: (attrs) => ({ 'data-emoji': attrs.emoji }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-callout': '', class: 'callout' }),
      ['span', { class: 'callout-emoji', contenteditable: 'false' }, node.attrs.emoji],
      ['div', { class: 'callout-content' }, 0],
    ]
  },
  addKeyboardShortcuts() {
    return {
      // Backspace na początku pustego calloutu -> rozpakuj
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection
        if (!empty || $from.parentOffset !== 0) return false
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'callout') {
            if ($from.index(d) === 0 && $from.parent.textContent === '') return editor.commands.lift('callout')
            return false
          }
        }
        return false
      },
    }
  },
})

// Jak w Notion: "> " = lista rozwijana, '" ' = cytat, [tekst](url) = hiperlink
const NotionInputRules = Extension.create({
  name: 'notionInputRules',
  addInputRules() {
    const editor = this.editor
    return [
      new InputRule({
        find: /^"[  ]$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).toggleBlockquote().run()
        },
      }),
      new InputRule({
        find: /^>[  ]$/,
        handler: ({ range, chain }) => {
          chain().deleteRange(range).setDetails().run()
          setTimeout(() => editor.commands.updateAttributes('details', { open: true }))
        },
      }),
      new InputRule({
        find: /\[\[$/,
        handler: ({ state, range }) => {
          state.tr.delete(range.from, range.to)
          setTimeout(() => hooks.pickNote && hooks.pickNote())
        },
      }),
      new InputRule({
        find: /\[([^\]]+)\]\(((?:https?:\/\/|mailto:|note:)[^)\s]+)\)$/,
        handler: ({ state, range, match }) => {
          const [, text, href] = match
          const mark = state.schema.marks.link.create({ href })
          state.tr.replaceWith(range.from, range.to, state.schema.text(text, [mark])).removeStoredMark(mark)
        },
      }),
    ]
  },
})

// Enter w tytule listy rozwijanej: otwarta -> pisz w środku, zwinięta -> nowy blok pod spodem
const ToggleKeys = Extension.create({
  name: 'toggleKeys',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state } = editor
        const { $head, empty } = state.selection
        if (!empty || $head.parent.type.name !== 'detailsSummary') return false
        const details = $head.node(-1)
        const paragraph = state.schema.nodes.paragraph.create()
        let tr = state.tr
        let cursor
        if (details.attrs.open) {
          const contentStart = $head.after() + 1
          const first = tr.doc.nodeAt(contentStart)
          if (first && first.type.name === 'paragraph' && first.content.size === 0) {
            cursor = contentStart + 1
          } else {
            tr = tr.insert(contentStart, paragraph)
            cursor = contentStart + 1
          }
        } else {
          const after = $head.after(-1)
          tr = tr.insert(after, paragraph)
          cursor = after + 1
        }
        tr.setSelection(TextSelection.create(tr.doc, cursor))
        editor.view.dispatch(tr.scrollIntoView())
        return true
      },
    }
  },
})

// Blok cytatu bez domyślnej reguły "> " (ta jest teraz dla listy rozwijanej)
const QuoteBlock = Blockquote.extend({
  addInputRules() {
    return []
  },
})

// Punkty zaczepienia ustawiane przez okno notatki (wybór notatki, edycja linku, tytuł)
export const hooks = {
  pickNote: null,
  editLink: null,
}

// ---------- Komendy (slash + menu "Zamień na") ----------
const today = () =>
  new Date().toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

const base = (editor, range) => {
  const c = editor.chain().focus()
  return range ? c.deleteRange(range) : c
}

export const BLOCKS = [
  { id: 'p', title: 'Tekst', short: 'Tekst', desc: 'Zwykły tekst', icon: icons.text, kw: 'text tekst paragraph akapit zwykly',
    run: (e, r) => base(e, r).setParagraph().run(), active: (e) => e.isActive('paragraph') },
  { id: 'h1', title: 'Nagłówek 1', short: 'H1', desc: 'Duży nagłówek sekcji', icon: '<b class="glyph">H1</b>', kw: 'h1 heading naglowek tytul #',
    run: (e, r) => base(e, r).setHeading({ level: 1 }).run(), active: (e) => e.isActive('heading', { level: 1 }), md: '#' },
  { id: 'h2', title: 'Nagłówek 2', short: 'H2', desc: 'Średni nagłówek sekcji', icon: '<b class="glyph">H2</b>', kw: 'h2 heading naglowek ##',
    run: (e, r) => base(e, r).setHeading({ level: 2 }).run(), active: (e) => e.isActive('heading', { level: 2 }), md: '##' },
  { id: 'h3', title: 'Nagłówek 3', short: 'H3', desc: 'Mały nagłówek sekcji', icon: '<b class="glyph">H3</b>', kw: 'h3 heading naglowek ###',
    run: (e, r) => base(e, r).setHeading({ level: 3 }).run(), active: (e) => e.isActive('heading', { level: 3 }), md: '###' },
  { id: 'todo', title: 'Lista zadań', short: 'Zadania', desc: 'Lista do odhaczania', icon: icons.todo, kw: 'todo task checklist checkbox zadania lista odhacz check',
    run: (e, r) => base(e, r).toggleTaskList().run(), active: (e) => e.isActive('taskList'), md: '[]' },
  { id: 'ul', title: 'Lista punktowana', short: 'Lista', desc: 'Prosta lista punktowana', icon: icons.bullet, kw: 'bullet list lista punkty ul',
    run: (e, r) => base(e, r).toggleBulletList().run(), active: (e) => e.isActive('bulletList'), md: '-' },
  { id: 'ol', title: 'Lista numerowana', short: 'Lista 1.', desc: 'Lista z numeracją', icon: icons.ordered, kw: 'numbered ordered list lista numerowana ol',
    run: (e, r) => base(e, r).toggleOrderedList().run(), active: (e) => e.isActive('orderedList'), md: '1.' },
  { id: 'toggle', title: 'Lista rozwijana', short: 'Toggle', desc: 'Zwijana sekcja z ukrytą treścią', icon: icons.toggle, kw: 'toggle rozwijana zwijana details lista ukryj >',
    run: (e, r) => {
      if (e.isActive('details')) return base(e, r).unsetDetails().run()
      // otwieranie w osobnej transakcji (inaczej rozszerzenie przełącza stan dwa razy)
      if (base(e, r).setDetails().run()) e.commands.updateAttributes('details', { open: true })
    }, active: (e) => e.isActive('details'), md: '>' },
  { id: 'quote', title: 'Cytat', short: 'Cytat', desc: 'Wyróżniony cytat', icon: icons.quote, kw: 'quote cytat blockquote',
    run: (e, r) => base(e, r).toggleBlockquote().run(), active: (e) => e.isActive('blockquote'), md: '"' },
  { id: 'callout', title: 'Callout', short: 'Callout', desc: 'Wyróżnij tekst z ikoną', icon: icons.callout, kw: 'callout ramka info uwaga notatka',
    run: (e, r) => base(e, r).wrapIn('callout').run(), active: (e) => e.isActive('callout') },
  { id: 'code', title: 'Kod', short: 'Kod', desc: 'Blok kodu', icon: icons.code, kw: 'code kod snippet codeblock',
    run: (e, r) => base(e, r).toggleCodeBlock().run(), active: (e) => e.isActive('codeBlock'), md: '```' },
]

export const INSERTS = [
  { id: 'notelink', title: 'Link do notatki', desc: 'Odnośnik do innej karteczki', icon: icons.notes, kw: 'link notatka strona page mention odnosnik [[ @',
    run: (e, r) => { base(e, r).run(); hooks.pickNote && hooks.pickNote() } },
  { id: 'link', title: 'Link', desc: 'Hiperlink do strony www', icon: icons.link, kw: 'link url www hiperlink adres http',
    run: (e, r) => { base(e, r).run(); hooks.editLink && hooks.editLink() } },
  { id: 'table', title: 'Tabela', desc: 'Tabela 3 × 3 z nagłówkiem', icon: icons.table, kw: 'table tabela grid',
    run: (e, r) => base(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'hr', title: 'Separator', desc: 'Pozioma linia', icon: icons.divider, kw: 'divider separator hr linia ---', md: '---',
    run: (e, r) => base(e, r).setHorizontalRule().run() },
  { id: 'date', title: 'Dzisiejsza data', desc: today(), icon: icons.calendar, kw: 'date data dzis today czas',
    run: (e, r) => base(e, r).insertContent(today() + ' ').run() },
  { id: 'time', title: 'Godzina', desc: 'Wstaw aktualną godzinę', icon: icons.calendar, kw: 'time godzina czas now teraz',
    run: (e, r) => base(e, r).insertContent(new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) + ' ').run() },
]

const colorCommands = [
  ...COLORS.map((c) => ({
    id: 'color-' + c.id,
    title: c.id === 'default' ? 'Domyślny kolor' : c.name,
    desc: 'Kolor tekstu',
    icon: `<span class="swatch-a" style="color:${c.text || 'var(--text)'}">A</span>`,
    kw: 'color kolor tekst ' + c.id + ' ' + c.name.toLowerCase(),
    run: (e, r) => (c.text ? base(e, r).setColor(c.text).run() : base(e, r).unsetColor().run()),
  })),
  ...COLORS.filter((c) => c.bg).map((c) => ({
    id: 'bg-' + c.id,
    title: c.name + ' tło',
    desc: 'Kolor tła',
    icon: `<span class="swatch-a" style="background:${c.bg}">A</span>`,
    kw: 'background tlo zakreslacz highlight ' + c.id + ' ' + c.name.toLowerCase(),
    run: (e, r) => base(e, r).setHighlight({ color: c.bg }).run(),
  })),
]

export const SLASH_GROUPS = [
  { label: 'Bloki podstawowe', items: BLOCKS },
  { label: 'Wstaw', items: INSERTS },
  { label: 'Kolory', items: colorCommands },
]

const norm = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l')

export function filterCommands(query) {
  const q = norm(query.trim())
  const out = []
  for (const g of SLASH_GROUPS) {
    const items = g.items.filter((it) => !q || norm(it.title + ' ' + it.kw).includes(q))
    if (items.length) out.push({ label: g.label, items })
  }
  return out
}

const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slash'),
        char: '/',
        allow: ({ editor }) => !editor.isActive('codeBlock'),
        items: ({ query }) => filterCommands(query),
        command: ({ editor, range, props }) => props.run(editor, range),
        render: slashRenderer,
      }),
    ]
  },
})

export function openHref(href) {
  if (!href) return
  if (href.startsWith('note:')) window.api.openNote(href.slice(5))
  else window.api.openExternal(/^[a-z]+:/i.test(href) ? href : 'https://' + href)
}

// Ctrl+klik na linku otwiera w przeglądarce
const LinkClick = Extension.create({
  name: 'linkClick',
  onCreate() {
    this.editor.view.dom.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]')
      if (a && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        openHref(a.getAttribute('href'))
      }
    })
  },
})

export function createEditor(element, content, { onUpdate, onSelection } = {}) {
  return new Editor({
    element,
    content: content || '',
    autofocus: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        blockquote: false,
        dropcursor: { color: '#2383e2', width: 3 },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: 'https',
          protocols: ['note', 'mailto'],
          isAllowedUri: (url, ctx) => url.startsWith('note:') || ctx.defaultValidate(url),
          HTMLAttributes: { rel: 'noopener noreferrer', target: null },
        },
      }),
      QuoteBlock,
      Details.configure({ persist: true, HTMLAttributes: { class: 'toggle' } }),
      DetailsSummary,
      DetailsContent,
      ToggleKeys,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({ table: { resizable: true, cellMinWidth: 60 } }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      Callout,
      NotionInputRules,
      SlashCommand,
      LinkClick,
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ node, editor }) => {
          if (node.type.name === 'heading') return 'Nagłówek ' + node.attrs.level
          if (node.type.name === 'detailsSummary') return 'Lista rozwijana'
          if (editor.isEmpty) return 'Zacznij pisać lub wpisz „/” aby wybrać polecenie…'
          if (node.type.name === 'paragraph') return 'Wpisz „/” aby wybrać polecenie…'
          return ''
        },
      }),
    ],
    onUpdate: ({ editor }) => onUpdate && onUpdate(editor),
    onSelectionUpdate: ({ editor }) => onSelection && onSelection(editor),
    onTransaction: ({ editor }) => onSelection && onSelection(editor),
  })
}
