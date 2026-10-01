// Aktualizuje zainstalowaną aplikację bez uruchamiania instalatora.
// Podmienia tylko resources/app.asar (kod aplikacji) — Notatki.exe zostaje ten sam,
// więc Inteligentna kontrola aplikacji Windows nie blokuje aktualizacji.
import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const installDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'notion-sticky')
const target = path.join(installDir, 'resources', 'app.asar')
const source = path.resolve('release', 'win-unpacked', 'resources', 'app.asar')

if (!fs.existsSync(target)) {
  console.error('Nie znaleziono zainstalowanej aplikacji w', installDir)
  process.exit(1)
}
if (!fs.existsSync(source)) {
  console.error('Brak zbudowanej aplikacji. Uruchom najpierw: npm run dist')
  process.exit(1)
}

try {
  // zamknięcie wymuszone zachowuje listę otwartych karteczek (zapis na dysku jest natychmiastowy)
  execSync('taskkill /IM Notatki.exe /F', { stdio: 'ignore' })
} catch {}
await new Promise((r) => setTimeout(r, 1500))

fs.copyFileSync(target, target + '.bak')
fs.copyFileSync(source, target)
console.log('Zaktualizowano:', target)

// logo: .exe zostaje bez zmian (blokada Windows), więc ikonę skrótów ustawiamy z pliku .ico
const ico = path.join(installDir, 'resources', 'icon.ico')
fs.copyFileSync(path.resolve('assets', 'icon.ico'), ico)
const shortcuts = [
  path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Notatki.lnk'),
  path.join(process.env.USERPROFILE, 'Desktop', 'Notatki.lnk'),
].filter((f) => fs.existsSync(f))
for (const lnk of shortcuts) {
  const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}'); $s.IconLocation='${ico.replace(/'/g, "''")},0'; $s.Save()`
  try {
    execSync(`powershell -NoProfile -Command "${ps}"`, { stdio: 'ignore' })
    console.log('Ikona skrótu:', lnk)
  } catch (e) {
    console.error('Nie udało się zmienić ikony skrótu', lnk)
  }
}

spawn(path.join(installDir, 'Notatki.exe'), [], { detached: true, stdio: 'ignore' }).unref()
console.log('Uruchomiono Notatki.')
