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

### Wersja przenośna (bez instalatora)

Pobierz `Notatki-portable.zip` z [Releases](../../releases) i rozpakuj go do dowolnego folderu, w którym możesz zapisywać pliki, np. `Dokumenty\Notatki`. Potem uruchom `Notatki.exe`.

- Nie wymaga instalacji ani uprawnień administratora. Działa też z pendrive'a.
- Skrót do menu Start dodasz ręcznie: prawy przycisk na `Notatki.exe` → „Przypnij do ekranu startowego” albo „Wyślij do” → „Pulpit”.
- Nie przenoś folderu po włączeniu autostartu. Jeśli go przeniesiesz, wyłącz i włącz autostart ponownie w aplikacji.

Notatki są zapisywane w `%APPDATA%\Notatki\notes.json`. Żeby przenieść notatki na inny komputer, skopiuj ten plik.

## Synchronizacja i aplikacja na Androida

Notatki synchronizują się między komputerem a telefonem przez [Supabase](https://supabase.com) (darmowy plan wystarcza).

1. Załóż projekt na supabase.com.
2. W **SQL Editor** wklej i uruchom [`supabase/schema.sql`](supabase/schema.sql). Utworzy on tabelę, zabezpieczenia (każdy widzi tylko swoje notatki) i zmiany na żywo.
3. W **Project Settings → API** skopiuj *Project URL* i klucz *publishable* (albo *anon*) do pliku `src/config.json`:
   ```json
   { "supabaseUrl": "https://xxxx.supabase.co", "supabaseKey": "sb_publishable_..." }
   ```
   Klucz publiczny może być w repozytorium, bo dostęp do danych chronią reguły RLS z `schema.sql`.
4. Zbuduj aplikację na komputer (`npm run dist` albo `npm run update`) i na Androida (niżej).
5. W aplikacji zaloguj się tym samym e-mailem i hasłem na obu urządzeniach. Na komputerze zrobisz to w oknie „Wszystkie notatki” → „Synchronizacja” w lewym dolnym rogu, a na telefonie przez ikonę chmurki.

Przy konflikcie wygrywa nowsza wersja notatki. Bez internetu wszystko działa lokalnie, a zmiany wysyłają się po odzyskaniu połączenia.

### Budowanie APK

Wymagane są Android SDK (API 36) i JDK 21.

```bash
npm run android                 # buduje www/ i kopiuje do projektu Android
cd android && ./gradlew assembleDebug
```

Plik APK znajdziesz w `android/app/build/outputs/apk/debug/app-debug.apk`. Skopiuj go na telefon i zainstaluj (Android zapyta o zgodę na instalację z nieznanego źródła).

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
