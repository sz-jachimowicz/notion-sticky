import { position } from './ui.js'

// Renderer menu "/" dla @tiptap/suggestion
export function slashRenderer() {
  let el = null
  let flat = []
  let index = 0
  let props = null

  const render = () => {
    const groups = props.items
    flat = groups.flatMap((g) => g.items)
    if (!flat.length) {
      el.style.display = 'none'
      return
    }
    el.style.display = ''
    index = Math.min(index, flat.length - 1)
    el.innerHTML = ''
    let i = 0
    for (const g of groups) {
      const label = document.createElement('div')
      label.className = 'menu-label'
      label.textContent = g.label
      el.appendChild(label)
      for (const it of g.items) {
        const idx = i++
        const b = document.createElement('button')
        b.className = 'menu-item slash-item' + (idx === index ? ' sel' : '')
        b.innerHTML = `<span class="slash-icon">${it.icon}</span><span class="slash-text"><span class="slash-title"></span><span class="slash-desc"></span></span>${it.md ? `<span class="mi-right">${it.md}</span>` : ''}`
        b.querySelector('.slash-title').textContent = it.title
        b.querySelector('.slash-desc').textContent = it.desc
        b.addEventListener('mousedown', (e) => {
          e.preventDefault()
          props.command(it)
        })
        b.addEventListener('mousemove', () => {
          if (index !== idx) {
            index = idx
            highlight(false)
          }
        })
        el.appendChild(b)
      }
    }
    place()
    highlight(true)
  }

  const highlight = (scroll) => {
    el.querySelectorAll('.slash-item').forEach((b, i) => {
      b.classList.toggle('sel', i === index)
      if (i === index && scroll) b.scrollIntoView({ block: 'nearest' })
    })
  }

  const place = () => {
    const rect = props.clientRect && props.clientRect()
    if (!rect) return
    // preferuj pod kursorem, ale okno karteczki jest małe
    position(el, rect, 'below', 'start')
  }

  return {
    onStart(p) {
      props = p
      index = 0
      el = document.createElement('div')
      el.className = 'menu slash-menu'
      document.body.appendChild(el)
      render()
    },
    onUpdate(p) {
      props = p
      index = 0
      render()
    },
    onKeyDown({ event }) {
      if (!el || el.style.display === 'none') return false
      if (event.key === 'ArrowDown') {
        index = (index + 1) % flat.length
        highlight(true)
        return true
      }
      if (event.key === 'ArrowUp') {
        index = (index - 1 + flat.length) % flat.length
        highlight(true)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const it = flat[index]
        if (it) props.command(it)
        return true
      }
      if (event.key === 'Escape') {
        el.style.display = 'none'
        return true
      }
      return false
    },
    onExit() {
      if (el) el.remove()
      el = null
    },
  }
}
