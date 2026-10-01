# Notatki

Karteczki na pulpit w stylu Notion: połączenie Microsoft Sticky Notes z edytorem Notion, w ciemnym motywie. Aplikacja na Windows zbudowana w Electronie i TipTap.

## Funkcje

- **Karteczki na pulpicie**: osobne okna, które można przesuwać, zmieniać im rozmiar i przypinać **zawsze na wierzchu**.
- **Tytuł w górnym pasku**, 10 kolorów z palety Notion, ulubione.
- **Czysty widok**: gdy karteczka nie jest aktywna, znikają wszystkie paski i podkreślenia pisowni.
- **Pasek formatowania na dole**: blok, pogrubienie, kursywa, podkreślenie, przekreślenie, listy, lista rozwijana, link, kolor, czcionka, tabela. Przyciski, które się nie mieszczą, trafiają do menu „⋯”.
- **Skróty jak w Notion**:

  | Wpisz | Efekt |
  | --- | --- |
  | `#`, `##`, `###` + spacja | nagłówki |
  | `-` + spacja | lista punktowana |
  | `1.` + spacja | lista numerowana |
  | `[]` + spacja | lista zadań (do odhaczania) |
  | `>` + spacja | lista rozwijana (toggle) |
  | `"` + spacja | cytat |
  | ```` ``` ```` | blok kodu |
  | `---` | separator |
  | `[[` | link do innej notatki |
  | `[tekst](https://…)` | hiperlink |
  | `/` | menu poleceń: tabela, callout, data, kolory… |

- **Linki**: zaznacz tekst i wklej adres, a tekst stanie się hiperlinkiem. Kliknięcie w link pokazuje dymek (otwórz, kopiuj, edytuj, usuń).
- **Przeciąganie bloków**: po zaznaczeniu tekstu w prawym górnym rogu bloku pojawia się uchwyt ⋮⋮. Działa też `Alt+↑` / `Alt+↓`.
- **Tabele** z dodawaniem i usuwaniem wierszy i kolumn oraz scalaniem komórek.
- **Sprawdzanie pisowni** (polski i angielski). Prawy przycisk na podkreślonym słowie pokazuje podpowiedzi i opcję „Dodaj do słownika”.
- **Autozapis** wszystkiego na bieżąco oraz okno „Wszystkie notatki” z wyszukiwarką, ulubionymi i koszem (30 dni).
- Ikona w zasobniku systemowym, autostart z Windows i przywracanie otwartych karteczek po restarcie.

## Skróty klawiszowe

| Skrót | Działanie |
| --- | --- |
| `Win+Shift+N` | nowa karteczka (z dowolnego miejsca) |
| `Ctrl+N` | nowa karteczka |
| `Ctrl+W` | zamknij karteczkę |
| `Ctrl+Shift+P` | zawsze na wierzchu |
| `Ctrl+K` | link |
| `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | pogrubienie / kursywa / podkreślenie |

## Instalacja

Pobierz `Notatki Setup x.y.z.exe` z zakładki [Releases](../../releases) i uruchom.

- **Nie wymaga uprawnień administratora.** Instaluje się tylko dla bieżącego użytkownika w `%LOCALAPPDATA%\Programs\notion-sticky`.
- Instalator nie jest podpisany cyfrowo, więc Windows może go zablokować.
  - **SmartScreen:** kliknij „Więcej informacji”, a potem „Uruchom mimo to”.
  - **Inteligentna kontrola aplikacji** (Windows 11) blokuje niepodpisane programy całkowicie. Wtedy zbuduj aplikację ze źródeł albo użyj innego komputera.

Notatki są zapisywane w `%APPDATA%\Notatki\notes.json`.

## Budowanie ze źródeł

Wymagany jest [Node.js](https://nodejs.org) LTS.

```bash
npm install
npm start          # uruchomienie w trybie deweloperskim
npm run dist       # instalator w folderze release/
npm run update     # aktualizacja już zainstalowanej aplikacji bez instalatora
```

`npm run update` podmienia tylko kod aplikacji (`resources/app.asar`) w zainstalowanej wersji. Przydaje się, gdy Windows blokuje nowy, niepodpisany instalator.

## Struktura

- `main.js`: proces główny (okna, zapis, zasobnik, autostart, sprawdzanie pisowni)
- `preload.js`: bezpieczny most IPC
- `src/note.*`: okno karteczki
- `src/editor.js`: edytor TipTap, reguły Markdown i polecenia `/`
- `src/dragHandle.js`: przeciąganie bloków
- `src/manager.*`: okno „Wszystkie notatki”
