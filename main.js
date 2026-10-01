const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen, shell, globalShortcut, safeStorage, powerMonitor } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// testy: osobny folder danych, żeby nie kolidować z zainstalowaną aplikacją
if (process.env.NOTES_DATA_DIR) app.setPath('userData', process.env.NOTES_DATA_DIR)

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.setAppUserModelId('pl.notionsticky.app')

const ICON = path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
const DATA_DIR = app.getPath('userData')
const DB_FILE = path.join(DATA_DIR, 'notes.json')
const START_HIDDEN = process.argv.includes('--hidden')

// ---------- storage ----------
let db = { notes: [], settings: { autostart: true } }
let saveTimer = null

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8')
      const parsed = JSON.parse(raw)
      db = { notes: parsed.notes || [], settings: { autostart: true, ...(parsed.settings || {}) } }
      fs.writeFileSync(DB_FILE + '.bak', raw)
    }
  } catch (e) {
    console.error('Nie udało się wczytać notatek, próbuję kopii zapasowej', e)
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE + '.bak', 'utf8'))
      db = { notes: parsed.notes || [], settings: { autostart: true, ...(parsed.settings || {}) } }
    } catch {}
  }
}

function writeDbNow() {
  clearTimeout(saveTimer)
  saveTimer = null
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db))
  fs.renameSync(tmp, DB_FILE)
}

function saveDb() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(writeDbNow, 300)
}

const getNote = (id) => db.notes.find((n) => n.id === id)

function newNoteRecord(extra = {}) {
  const now = Date.now()
  const note = {
    id: crypto.randomUUID(),
    content: null,
    text: '',
    title: '',
    autoTitle: '',
    empty: true,
    color: 'default',
    font: 'default',
    small: false,
    favorite: false,
    pinned: false,
    open: true,
    deleted: false,
    deletedAt: null,
    bounds: null,
    createdAt: now,
    updatedAt: now,
    modified: now,
    ...extra,
  }
  db.notes.push(note)
  saveDb()
  return note
}

const displayTitle = (n) => n.title || n.autoTitle || 'Bez tytułu'

const metaOf = (n) => {
  const { content, ...meta } = n
  return meta
}

// ---------- synchronizacja (Supabase) ----------
const SYNC_CONFIG = require('./src/config.json')
const SYNC_FIELDS = ['content', 'text', 'title', 'autoTitle', 'empty', 'color', 'font', 'small',
  'favorite', 'deleted', 'deletedAt', 'createdAt', 'updatedAt', 'modified']
let sync = null
let syncStatus = { state: 'disabled' }

// sesja logowania zaszyfrowana kluczem systemu Windows (safeStorage)
const AUTH_FILE = path.join(DATA_DIR, 'sync-auth.bin')
let authCache = null
function readAuth() {
  if (authCache) return authCache
  authCache = {}
  try {
    const buf = fs.readFileSync(AUTH_FILE)
    const json = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : buf.toString('utf8')
    authCache = JSON.parse(json)
  } catch {}
  return authCache
}
function writeAuth() {
  const json = JSON.stringify(authCache || {})
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(json, 'utf8')
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(AUTH_FILE, data)
}
const authStorage = {
  getItem: (k) => (k in readAuth() ? readAuth()[k] : null),
  setItem: (k, v) => { readAuth()[k] = v; writeAuth() },
  removeItem: (k) => { delete readAuth()[k]; writeAuth() },
}

// lokalna zmiana pól synchronizowanych -> nowy znacznik i wysyłka
function touch(n) {
  n.modified = Math.max(Date.now(), (n.modified || 0) + 1)
  if (sync) sync.push(n.id)
}

// notatka znika na zawsze (lokalnie i — jeśli była w chmurze — na innych urządzeniach)
function purgeNote(id) {
  const n = getNote(id)
  db.notes = db.notes.filter((x) => x.id !== id)
  if (sync && n && n.syncedModified) sync.purge(id)
}

const syncAdapter = {
  list: () => db.notes,
  get: (id) => getNote(id),
  applyRemote(r) {
    let n = getNote(r.id)
    const isNew = !n
    if (!n) {
      n = { id: r.id, pinned: false, open: false, bounds: null }
      db.notes.push(n)
    }
    const contentChanged = !isNew && JSON.stringify(n.content) !== JSON.stringify(r.content)
    for (const k of SYNC_FIELDS) n[k] = r[k]
    n.syncedModified = r.modified
    saveDb()
    const win = noteWins.get(n.id)
    if (win && !win.isDestroyed()) {
      if (n.deleted) {
        n.open = false
        win.close()
      } else {
        if (contentChanged) win.webContents.send('note:remote-content', n.content)
        sendMeta(n.id)
        win.setTitle(displayTitle(n))
      }
    }
    broadcastList()
  },
  remove(id) {
    const win = noteWins.get(id)
    db.notes = db.notes.filter((x) => x.id !== id)
    saveDb()
    if (win && !win.isDestroyed()) win.close()
    broadcastList()
  },
  markSynced(id, modified) {
    const n = getNote(id)
    if (n) {
      n.syncedModified = modified
      saveDb()
    }
  },
}

function initSync() {
  if (!SYNC_CONFIG.supabaseUrl || !SYNC_CONFIG.supabaseKey) {
    syncStatus = { state: 'disabled' }
    return
  }
  const { createSync } = require('./dist/sync.cjs')
  sync = createSync({
    url: SYNC_CONFIG.supabaseUrl,
    key: SYNC_CONFIG.supabaseKey,
    storage: authStorage,
    adapter: syncAdapter,
    onStatus: (st) => {
      syncStatus = st
      if (managerWin && !managerWin.isDestroyed()) managerWin.webContents.send('sync:status', st)
    },
  })
  sync.init().catch((e) => console.error('sync init', e))
  // po wybudzeniu komputera i co 5 minut dociągnij zmiany
  powerMonitor.on('resume', () => sync.refresh())
  setInterval(() => sync.refresh(), 5 * 60 * 1000)
}

// ---------- windows ----------
const noteWins = new Map()
let managerWin = null
let tray = null
let quitting = false
let broadcastTimer = null

function broadcastList() {
  clearTimeout(broadcastTimer)
  broadcastTimer = setTimeout(() => {
    if (managerWin && !managerWin.isDestroyed()) managerWin.webContents.send('notes:changed')
    if (tray) tray.setContextMenu(buildTrayMenu())
  }, 120)
}

function sendMeta(id) {
  const win = noteWins.get(id)
  const n = getNote(id)
  if (win && !win.isDestroyed() && n) win.webContents.send('note:meta', metaOf(n))
}

function defaultBounds() {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = 340
  const height = 380
  const k = noteWins.size % 8
  return {
    x: Math.round(workArea.x + workArea.width - width - 48 - k * 28),
    y: Math.round(workArea.y + 48 + k * 28),
    width,
    height,
  }
}

function visibleBounds(b) {
  if (!b) return null
  const inside = screen.getAllDisplays().some(({ workArea: w }) =>
    b.x + 60 > w.x && b.x < w.x + w.width - 60 && b.y >= w.y - 10 && b.y < w.y + w.height - 40)
  return inside ? b : null
}

// menu pod prawym przyciskiem: podpowiedzi pisowni, "Dodaj do słownika", schowek
function attachContextMenu(win) {
  win.webContents.on('context-menu', (_e, params) => {
    const items = []
    if (params.misspelledWord) {
      for (const s of params.dictionarySuggestions.slice(0, 5)) {
        items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) })
      }
      if (!params.dictionarySuggestions.length) items.push({ label: 'Brak podpowiedzi', enabled: false })
      items.push(
        { type: 'separator' },
        {
          label: `Dodaj „${params.misspelledWord}” do słownika`,
          click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
        },
        { type: 'separator' },
      )
    }
    if (params.isEditable) {
      items.push(
        { label: 'Wytnij', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Kopiuj', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Wklej', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Zaznacz wszystko', role: 'selectAll' },
      )
    } else if (params.selectionText) {
      items.push({ label: 'Kopiuj', role: 'copy' })
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win })
  })
}

function setupSpellcheck() {
  const { session } = require('electron')
  const ses = session.defaultSession
  try {
    const available = ses.availableSpellCheckerLanguages || []
    const wanted = ['pl', 'pl-PL', 'en-US'].filter((l) => !available.length || available.includes(l))
    if (wanted.length) ses.setSpellCheckerLanguages(wanted)
  } catch (e) {
    console.error('Sprawdzanie pisowni:', e)
  }
}

function hardenWebContents(win) {
  attachContextMenu(win)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:|^mailto:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) {
      e.preventDefault()
      if (/^https?:|^mailto:/.test(url)) shell.openExternal(url)
    }
  })
}

function openNote(id, { focus = true } = {}) {
  const n = getNote(id)
  if (!n || n.deleted) return null
  const existing = noteWins.get(id)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    if (focus) existing.focus()
    return existing
  }

  n.open = true
  const bounds = visibleBounds(n.bounds) || defaultBounds()
  n.bounds = bounds
  saveDb()

  const win = new BrowserWindow({
    ...bounds,
    minWidth: 250,
    minHeight: 180,
    frame: false,
    show: false,
    skipTaskbar: false,
    backgroundColor: '#191919',
    alwaysOnTop: !!n.pinned,
    icon: ICON,
    title: displayTitle(n),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      spellcheck: true,
    },
  })
  if (n.pinned) win.setAlwaysOnTop(true, 'floating')
  noteWins.set(id, win)
  hardenWebContents(win)

  win.loadFile(path.join(__dirname, 'src', 'note.html'), { query: { id } })
  win.once('ready-to-show', () => {
    if (focus) win.show()
    else win.showInactive()
  })

  let boundsTimer = null
  const storeBounds = () => {
    clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      const note = getNote(id)
      if (note && !win.isDestroyed() && !win.isMinimized()) {
        note.bounds = win.getBounds()
        saveDb()
      }
    }, 250)
  }
  win.on('move', storeBounds)
  win.on('resize', storeBounds)

  win.on('closed', () => {
    noteWins.delete(id)
    const note = getNote(id)
    if (note && !quitting) {
      if (note.empty && !note.deleted) {
        purgeNote(id)
      } else {
        note.open = false
      }
      saveDb()
    }
    broadcastList()
  })

  broadcastList()
  return win
}

function createNote(extra = {}) {
  const n = newNoteRecord(extra)
  openNote(n.id)
  broadcastList()
  return n.id
}

function openManager() {
  if (managerWin && !managerWin.isDestroyed()) {
    if (managerWin.isMinimized()) managerWin.restore()
    managerWin.show()
    managerWin.focus()
    return
  }
  managerWin = new BrowserWindow({
    width: 980,
    height: 660,
    minWidth: 560,
    minHeight: 400,
    show: false,
    backgroundColor: '#191919',
    title: 'Notatki',
    icon: ICON,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#202020', symbolColor: '#d4d4d4', height: 40 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  })
  hardenWebContents(managerWin)
  managerWin.loadFile(path.join(__dirname, 'src', 'manager.html'))
  managerWin.once('ready-to-show', () => managerWin.show())
  managerWin.on('closed', () => (managerWin = null))
}

// ---------- autostart ----------
function applyAutostart() {
  if (!app.isPackaged) {
    // tryb deweloperski: electron.exe + ścieżka projektu
    app.setLoginItemSettings({
      openAtLogin: !!db.settings.autostart,
      path: process.execPath,
      args: [path.resolve(__dirname), '--hidden'],
    })
  } else {
    app.setLoginItemSettings({ openAtLogin: !!db.settings.autostart, args: ['--hidden'] })
  }
}

// ---------- tray ----------
function buildTrayMenu() {
  const favs = db.notes.filter((n) => n.favorite && !n.deleted).slice(0, 8)
  return Menu.buildFromTemplate([
    { label: 'Nowa notatka', accelerator: 'Super+Shift+N', click: () => createNote() },
    { label: 'Wszystkie notatki', click: openManager },
    { label: 'Pokaż otwarte karteczki', click: showAllOpen },
    ...(favs.length
      ? [{ type: 'separator' }, ...favs.map((n) => ({ label: '★ ' + displayTitle(n).slice(0, 40), click: () => openNote(n.id) }))]
      : []),
    { type: 'separator' },
    {
      label: 'Uruchamiaj z Windows',
      type: 'checkbox',
      checked: !!db.settings.autostart,
      click: (item) => {
        db.settings.autostart = item.checked
        saveDb()
        applyAutostart()
        broadcastList()
      },
    },
    { type: 'separator' },
    { label: 'Zamknij', click: () => app.quit() },
  ])
}

function showAllOpen() {
  const open = db.notes.filter((n) => n.open && !n.deleted)
  if (!open.length) return openManager()
  open.forEach((n) => openNote(n.id))
}

function createTray() {
  const img = nativeImage.createFromPath(ICON)
  tray = new Tray(img)
  tray.setToolTip('Notatki')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', showAllOpen)
  tray.on('double-click', openManager)
}

// ---------- IPC ----------
ipcMain.handle('note:get', (_e, id) => getNote(id) || null)

ipcMain.handle('note:update', (_e, id, patch) => applyPatch(id, patch))
ipcMain.on('note:update-sync', (e, id, patch) => {
  applyPatch(id, patch)
  try { writeDbNow() } catch {}
  e.returnValue = true
})

function applyPatch(id, patch) {
  const n = getNote(id)
  if (!n) return null
  const allowed = ['content', 'text', 'title', 'autoTitle', 'empty', 'color', 'font', 'small', 'favorite']
  let touched = false
  for (const k of allowed) {
    if (k in patch) {
      n[k] = patch[k]
      touched = true
    }
  }
  if ('content' in patch) n.updatedAt = Date.now()
  if (touched) {
    touch(n)
    saveDb()
    broadcastList()
    if (!('content' in patch)) sendMeta(id)
    const win = noteWins.get(id)
    if (win && ('title' in patch || 'autoTitle' in patch) && !win.isDestroyed()) win.setTitle(displayTitle(n))
  }
  return metaOf(n)
}

ipcMain.handle('note:setPinned', (_e, id, pinned) => {
  const n = getNote(id)
  if (!n) return
  n.pinned = !!pinned
  saveDb()
  const win = noteWins.get(id)
  if (win && !win.isDestroyed()) win.setAlwaysOnTop(!!pinned, 'floating')
  sendMeta(id)
  broadcastList()
})

ipcMain.handle('note:create', () => createNote())
ipcMain.handle('note:open', (_e, id) => { openNote(id); broadcastList() })
ipcMain.handle('note:close', (_e, id) => {
  const win = noteWins.get(id)
  if (win && !win.isDestroyed()) win.close()
})
ipcMain.handle('note:minimize', (_e, id) => {
  const win = noteWins.get(id)
  if (win && !win.isDestroyed()) win.minimize()
})

ipcMain.handle('note:trash', (_e, id) => {
  const n = getNote(id)
  if (!n) return
  const win = noteWins.get(id)
  if (n.empty) {
    purgeNote(id)
  } else {
    n.deleted = true
    n.deletedAt = Date.now()
    n.open = false
    touch(n)
  }
  saveDb()
  if (win && !win.isDestroyed()) win.close()
  broadcastList()
})

ipcMain.handle('note:restore', (_e, id) => {
  const n = getNote(id)
  if (!n) return
  n.deleted = false
  n.deletedAt = null
  touch(n)
  saveDb()
  broadcastList()
})

ipcMain.handle('note:destroy', (_e, id) => {
  const win = noteWins.get(id)
  purgeNote(id)
  saveDb()
  if (win && !win.isDestroyed()) win.close()
  broadcastList()
})

ipcMain.handle('trash:empty', () => {
  db.notes.filter((x) => x.deleted).forEach((x) => purgeNote(x.id))
  saveDb()
  broadcastList()
})

ipcMain.handle('note:duplicate', (_e, id) => {
  const n = getNote(id)
  if (!n) return
  const { id: _id, bounds, createdAt, updatedAt, modified, syncedModified, ...rest } = JSON.parse(JSON.stringify(n))
  const newId = createNote({ ...rest, favorite: false, pinned: false, deleted: false, open: true, title: rest.title })
  if (sync) sync.push(newId)
  return newId
})

ipcMain.handle('notes:list', () =>
  db.notes.map((n) => ({ ...metaOf(n), isOpen: noteWins.has(n.id) })))

ipcMain.handle('manager:open', openManager)

ipcMain.handle('settings:get', () => db.settings)
ipcMain.handle('settings:set', (_e, patch) => {
  Object.assign(db.settings, patch)
  saveDb()
  if ('autostart' in patch) applyAutostart()
  broadcastList()
  return db.settings
})

ipcMain.handle('sync:status', () => syncStatus)
ipcMain.handle('sync:signIn', (_e, email, password) => (sync ? sync.signIn(email, password) : { error: 'Synchronizacja nie jest skonfigurowana.' }))
ipcMain.handle('sync:signUp', (_e, email, password) => (sync ? sync.signUp(email, password) : { error: 'Synchronizacja nie jest skonfigurowana.' }))
ipcMain.handle('sync:signOut', () => sync && sync.signOut())
ipcMain.handle('sync:refresh', () => sync && sync.refresh())

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:|^mailto:/.test(url)) shell.openExternal(url)
})

// ---------- lifecycle ----------
// ponowne uruchomienie (np. ze skrótu w menu Start) pokazuje karteczki i listę notatek
app.on('second-instance', () => {
  showAllOpen()
  openManager()
})

app.whenReady().then(() => {
  loadDb()
  setupSpellcheck()
  // porządki: usuń puste notatki pozostawione po awarii, usuń z kosza starsze niż 30 dni
  // migracja: dawniej tytuł był brany z pierwszej linii
  for (const n of db.notes) {
    if (n.autoTitle === undefined) {
      n.autoTitle = n.title || ''
      n.title = ''
    }
  }
  for (const n of db.notes) {
    if (!n.modified) n.modified = n.updatedAt || Date.now()
  }
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000
  const expired = db.notes.filter((n) => (n.empty && !n.deleted) || (n.deleted && n.deletedAt && n.deletedAt < monthAgo))
  saveDb()

  initSync()
  expired.forEach((n) => purgeNote(n.id))
  saveDb()

  applyAutostart()
  createTray()

  // Win+Shift+N — bez Ctrl+Alt, bo na polskiej klawiaturze Ctrl+Alt = AltGr (ą, ę, ń…)
  try {
    globalShortcut.register('Super+Shift+N', () => createNote())
  } catch {}

  // tryb deweloperski: zrzuty własnych okien do katalogu z NOTES_SHOT_DIR
  if (process.env.NOTES_SHOT_DIR) {
    setInterval(async () => {
      for (const [i, w] of BrowserWindow.getAllWindows().entries()) {
        const img = await w.webContents.capturePage()
        fs.writeFileSync(path.join(process.env.NOTES_SHOT_DIR, `win${i}.png`), img.toPNG())
      }
    }, 2000)
  }

  const toOpen = db.notes.filter((n) => n.open && !n.deleted)
  toOpen.forEach((n) => openNote(n.id, { focus: false }))
  if (!toOpen.length && !START_HIDDEN) {
    if (db.notes.some((n) => !n.deleted)) openManager()
    else createNote()
  }
})

// aplikacja żyje w zasobniku systemowym
app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  try { writeDbNow() } catch {}
})
