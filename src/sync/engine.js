// Synchronizacja notatek przez Supabase — wspólna dla aplikacji na komputer (proces główny Electron)
// i aplikacji na Androida (Capacitor).
//
// Zasada: każda notatka ma `modified` (ms). Przy konflikcie wygrywa nowsza wersja całej notatki.
// `syncedModified` to wartość `modified`, która jest już na serwerze — gdy się różni, notatka czeka na wysłanie.
import { createClient } from '@supabase/supabase-js'

// pola synchronizowane (pozostałe, np. pozycja okna czy "zawsze na wierzchu", zostają na urządzeniu)
export const SYNCED_FIELDS = [
  'content', 'text', 'title', 'autoTitle', 'empty', 'color', 'font', 'small',
  'favorite', 'deleted', 'deletedAt', 'createdAt', 'updatedAt', 'modified',
]

export function toRow(n) {
  const now = Date.now()
  return {
    id: n.id,
    content: n.content ?? null,
    text: n.text || '',
    title: n.title || '',
    auto_title: n.autoTitle || '',
    empty: !!n.empty,
    color: n.color || 'default',
    font: n.font || 'default',
    small: !!n.small,
    favorite: !!n.favorite,
    deleted: !!n.deleted,
    deleted_at: n.deletedAt ?? null,
    purged: false,
    created_at: n.createdAt || now,
    updated_at: n.updatedAt || now,
    modified: n.modified || n.updatedAt || now,
  }
}

export function fromRow(r) {
  return {
    id: r.id,
    content: r.content,
    text: r.text || '',
    title: r.title || '',
    autoTitle: r.auto_title || '',
    empty: !!r.empty,
    color: r.color || 'default',
    font: r.font || 'default',
    small: !!r.small,
    favorite: !!r.favorite,
    deleted: !!r.deleted,
    deletedAt: r.deleted_at == null ? null : Number(r.deleted_at),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    modified: Number(r.modified),
  }
}

const ERRORS = {
  'Invalid login credentials': 'Nieprawidłowy e-mail lub hasło.',
  'Email not confirmed': 'Potwierdź adres e-mail (link w wiadomości od Supabase), potem zaloguj się ponownie.',
  'User already registered': 'Konto z tym adresem już istnieje — zaloguj się.',
  'Password should be at least 6 characters.': 'Hasło musi mieć co najmniej 6 znaków.',
}
const plError = (e) => {
  const msg = (e && (e.message || e.error_description || String(e))) || 'Nieznany błąd'
  return ERRORS[msg] || (/fetch|network|Failed to/i.test(msg) ? 'Brak połączenia z internetem.' : msg)
}

/**
 * adapter: {
 *   list(): Note[]                      — wszystkie lokalne notatki
 *   get(id): Note | undefined
 *   applyRemote(fields)                 — zapisz notatkę z serwera (pola z SYNCED_FIELDS + id)
 *   remove(id)                          — usuń lokalnie (usunięta na zawsze na innym urządzeniu)
 *   markSynced(id, modified)            — ustaw note.syncedModified
 * }
 * storage: { getItem, setItem, removeItem } — sesja logowania i kolejka usunięć
 */
export function createSync({ url, key, storage, adapter, onStatus }) {
  const client = createClient(url, key, {
    auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })

  let user = null
  let channel = null
  let timer = null
  let retryTimer = null
  let flushing = false
  let pulling = null
  const queue = new Set()
  let status = { state: 'signed-out', email: null, error: null, lastSync: null }

  const setStatus = (patch) => {
    status = { ...status, ...patch }
    onStatus && onStatus(status)
  }

  // ---- kolejka usunięć na zawsze (przetrwa brak internetu) ----
  async function pendingPurges() {
    try {
      return JSON.parse((await storage.getItem('notatki-pending-purges')) || '[]')
    } catch {
      return []
    }
  }
  async function savePendingPurges(ids) {
    await storage.setItem('notatki-pending-purges', JSON.stringify(ids))
  }

  // ---- porównanie wersji ----
  function reconcile(row) {
    const local = adapter.get(row.id)
    if (row.purged) {
      if (local) adapter.remove(row.id)
      return
    }
    const remoteModified = Number(row.modified)
    if (!local) {
      adapter.applyRemote(fromRow(row))
      return
    }
    const lm = local.modified || 0
    if (remoteModified > lm) adapter.applyRemote(fromRow(row))
    else if (remoteModified < lm) queue.add(row.id)
    else if (local.syncedModified !== remoteModified) adapter.markSynced(row.id, remoteModified)
  }

  async function pullAll() {
    if (!user) return
    if (pulling) return pulling
    pulling = (async () => {
      const seen = new Set()
      const page = 500
      for (let from = 0; ; from += page) {
        const { data, error } = await client.from('notes').select('*').order('modified', { ascending: true }).range(from, from + page - 1)
        if (error) throw error
        for (const row of data) {
          seen.add(row.id)
          reconcile(row)
        }
        if (data.length < page) break
      }
      // lokalne notatki, których nie ma na serwerze -> wyślij
      for (const n of adapter.list()) {
        if (!seen.has(n.id) && !n.empty) queue.add(n.id)
      }
    })()
    try {
      await pulling
    } finally {
      pulling = null
    }
  }

  async function flush() {
    if (!user || flushing) return
    flushing = true
    clearTimeout(timer)
    try {
      // usunięcia na zawsze
      const purges = await pendingPurges()
      if (purges.length) {
        const { error } = await client
          .from('notes')
          .update({ purged: true, content: null, text: '', title: '', auto_title: '', modified: Date.now() })
          .in('id', purges)
        if (error) throw error
        await savePendingPurges([])
      }

      const ids = [...queue]
      queue.clear()
      const rows = ids
        .map((id) => adapter.get(id))
        .filter((n) => n && (!n.empty || n.syncedModified) && n.modified !== n.syncedModified)
        .map(toRow)
      if (rows.length) {
        const { error } = await client.from('notes').upsert(rows)
        if (error) {
          ids.forEach((id) => queue.add(id))
          throw error
        }
        for (const r of rows) {
          const n = adapter.get(r.id)
          if (n && n.modified === r.modified) adapter.markSynced(r.id, r.modified)
        }
      }
      setStatus({ state: 'ok', error: null, lastSync: Date.now() })
    } catch (e) {
      setStatus({ state: 'error', error: plError(e) })
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => flush(), 8000)
    } finally {
      flushing = false
      if (queue.size) schedule()
    }
  }

  function schedule(delay = 700) {
    clearTimeout(timer)
    timer = setTimeout(flush, delay)
  }

  function subscribe() {
    if (channel) client.removeChannel(channel)
    let first = true
    channel = client
      .channel('notes-' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${user.id}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          if (payload.old && payload.old.id) adapter.remove(payload.old.id)
          return
        }
        if (payload.new) reconcile(payload.new)
        if (queue.size) schedule()
      })
      .subscribe((st) => {
        if (st === 'SUBSCRIBED') {
          // po ponownym połączeniu dociągnij to, co mogło umknąć
          if (!first) refresh()
          first = false
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
          setStatus({ state: 'offline' })
        }
      })
  }

  async function start() {
    setStatus({ state: 'syncing', email: user.email, error: null })
    try {
      await pullAll()
      await flush()
      subscribe()
    } catch (e) {
      setStatus({ state: 'error', error: plError(e) })
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => user && start(), 10000)
    }
  }

  async function refresh() {
    if (!user) return
    try {
      setStatus({ state: 'syncing' })
      await pullAll()
      await flush()
    } catch (e) {
      setStatus({ state: 'error', error: plError(e) })
    }
  }

  return {
    get status() {
      return status
    },

    async init() {
      const { data } = await client.auth.getSession()
      if (data && data.session) {
        user = data.session.user
        await start()
      } else {
        setStatus({ state: 'signed-out', email: null })
      }
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
      if (error) return { error: plError(error) }
      user = data.user
      start()
      return { ok: true }
    },

    async signUp(email, password) {
      const { data, error } = await client.auth.signUp({ email: email.trim(), password })
      if (error) return { error: plError(error) }
      if (!data.session) {
        setStatus({ state: 'signed-out', error: null })
        return { confirm: true }
      }
      user = data.user
      start()
      return { ok: true }
    },

    async signOut() {
      clearTimeout(timer)
      clearTimeout(retryTimer)
      if (channel) await client.removeChannel(channel)
      channel = null
      await client.auth.signOut().catch(() => {})
      user = null
      queue.clear()
      setStatus({ state: 'signed-out', email: null, error: null })
    },

    // lokalna zmiana notatki
    push(id) {
      queue.add(id)
      if (user) schedule()
    },

    // notatka usunięta na zawsze — oznacz na serwerze, żeby zniknęła z innych urządzeń
    async purge(id) {
      queue.delete(id)
      const ids = await pendingPurges()
      if (!ids.includes(id)) ids.push(id)
      await savePendingPurges(ids)
      if (user) schedule(100)
    },

    refresh,
  }
}
