# Minimalna aplikacija za ciscenje Watch Later

## Cilj

Narediti majhen lokalni triage tool za JSON export iz Tampermonkey skripte.

Glavni problem ni export, ampak odlocanje:

- katere videe obdrzati;
- katere izbrisati iz Watch Later;
- katere premakniti/arhivirati po temah;
- kako hitro najti Marvel, Clone Wars, Dragon Ball, reactione in podobne sklope v vec tisoc videih.

Za velik Watch Later seznam je najboljsi default obratna logika:

- uporabnik oznaci videe, ki jih zeli obdrzati;
- vse neoznacene videe se obravnava kot kandidate za brisanje;
- pred brisanjem mora app vedno pokazati dry run in export backup.

## Priporocen pristop

Najmanj bloated varianta:

- ena lokalna `index.html` datoteka;
- vanilla JavaScript;
- brez npm;
- brez build stepa;
- brez backend baze;
- stanje se shrani v browser `localStorage`;
- import/export prek JSON datotek.

To pomeni, da se app odpre direktno v browserju kot file ali prek zelo malega lokalnega serverja. Podatki ostanejo lokalno.

## Osnovni workflow

1. Na YouTube Watch Later strani kliknes `Load + JSON`.
2. V lokalni aplikaciji importas exportan JSON.
3. App naredi indeks po naslovu, kanalu, metapodatkih in trajanju.
4. Pregledujes seznam s filtri.
5. Oznacujes videe kot:
   - `keep`;
   - `delete`;
   - `maybe`;
   - `archive`;
   - custom tag, na primer `marvel`, `clone-wars`, `dragon-ball`, `reaction`, `asmr`, `dev`.
6. App shrani odlocitve v `localStorage`.
7. Na koncu exportas:
   - `keep.json`;
   - `delete.json`;
   - `delete-urls.txt`;
   - `tagged.json`;
   - opcijsko Markdown seznam za osebni arhiv.

Primarni cleanup flow naj bo:

1. import JSON exporta;
2. app samodejno predlaga `keep` za zadetke kot Marvel, Clone Wars, Dragon Ball, reaction kanale;
3. uporabnik pregleda in rocno popravi;
4. uporabnik klikne `Export delete candidates`;
5. delete candidates so vsi videi, ki niso `keep` in niso `maybe`;
6. Watch Later toolbox importira ta delete seznam in odstrani samo te videe.

## UI ideja

Prva verzija naj bo prakticna, ne lepa zaradi lepote:

- zgoraj import JSON gumb;
- search input;
- hitri filtri;
- levi seznam videov;
- desni detail panel ali inline kartice;
- keyboard shortcuts za hitro odlocanje.

Koristni filtri:

- kanal;
- naslov vsebuje;
- tag;
- status `unreviewed`, `keep`, `delete`, `maybe`;
- trajanje nad/pod X minut;
- view count nad/pod X;
- starost oziroma `uploaded` tekst;
- samo reaction vsebine;
- samo Marvel/Star Wars/Dragon Ball zadetki.

## Pametni lokalni filtri

App lahko brez AI in brez API-jev naredi preproste keyword skupine:

```js
const RULES = {
  marvel: ["marvel", "mcu", "daredevil", "punisher", "spider", "spider-noir", "captain america", "black panther"],
  starWars: ["star wars", "clone wars", "ahsoka", "maul", "andor", "kenobi"],
  dragonBall: ["dragon ball", "dbz", "dbs", "goku", "vegeta"],
  reactions: ["reaction", "reacts", "first time watching", "group reaction"],
  dev: ["javascript", "typescript", "ai", "openai", "google developers", "unreal engine"],
};
```

Vsak video dobi predlagane tage, uporabnik pa jih lahko popravi. To je dovolj za prvi velik cleanup.

## Podatki, ki jih je smiselno exportati

Trenutni JSON je ze dober za import. Uporabna polja:

- `videoId`;
- `title`;
- `channel`;
- `channelUrl`;
- `cleanUrl`;
- `embedUrl`;
- `durationSeconds`;
- `views`;
- `viewCountApprox`;
- `uploaded`;
- `thumbnailUrl`;
- `searchText`;
- `isUnavailable`.

Posebej koristno za app:

- `videoId` kot stabilen ID;
- `searchText` za hiter lokalni search;
- `durationSeconds` za filtre;
- `viewCountApprox` za sortiranje;
- `thumbnailUrl` za grid/list view;
- `cleanUrl` za odpiranje v YouTubu.

## Shranjevanje stanja

Minimalna struktura v `localStorage`:

```json
{
  "S5wgoGWgdDw": {
    "status": "keep",
    "tags": ["marvel", "reaction"],
    "note": "Spider-Noir reactions",
    "updatedAt": "2026-06-01T15:48:00.000Z"
  }
}
```

Originalni imported JSON ostane locen od uporabnikovih odlocitev. Tako lahko kasneje ponovno importas novejsi export in obdrzis stare odlocitve po `videoId`.

## Export iz aplikacije

Najbolj uporabni exporti:

- `delete-urls.txt`: en URL na vrstico;
- `delete-videos.json`: polni objekti za delete;
- `keep-videos.json`: polni objekti za arhiv;
- `tagged-videos.json`: vsi videi z dodanimi statusi/tagi;
- `watchlater-report.md`: berljiv povzetek po tagih/kanalih.

## Povezava nazaj na YouTube toolbox

Kasneje se lahko Tampermonkey skripta nauci importati `delete-videos.json` ali samo seznam `videoId` vrednosti.

Potem bi tok bil:

1. lokalna aplikacija naredi delete seznam iz vseh videov, ki niso oznaceni kot `keep`;
2. Watch Later toolbox importira seznam;
3. prikaze dry run;
4. uporabnik potrdi;
5. skripta odstrani samo izbrane videe iz Watch Later.

To je varnejse kot takojsnji `Delete all`, ker je odlocanje narejeno izven YouTube UI-ja.

Alternativni tok je import `keep.json`, kjer Watch Later toolbox sam izracuna razliko:

1. toolbox nalozi cel Watch Later seznam;
2. uporabnik importira `keep.json`;
3. toolbox oznaci vse videe, ki niso v keep seznamu;
4. uporabnik klikne `Delete not kept`;
5. skripta naredi backup in odstrani samo ne-keep videe.

Ta varianta je najbolj ergonomicna, ker v lokalni aplikaciji razmisljas samo o tem, kaj zelis obdrzati.

Varnostna pravila za `Delete not kept`:

- obvezen backup JSON/CSV pred brisanjem;
- dry run z jasnim stevilom `keep`, `delete`, `missing`;
- prikaz prvih 20 kandidatov za brisanje;
- confirm z vpisom stevila kandidatov, na primer `DELETE 3821`;
- brisanje z zamikom;
- log uspesnih in spodletelih odstranitev;
- resume po prekinitvi.

## Predlagan vrstni red

1. Dokoncaj robusten JSON export.
2. Naredi `index.html` lokalni importer s searchom in statusi.
3. Dodaj tag rules za Marvel, Star Wars, Dragon Ball, reactions.
4. Dodaj export `delete-urls.txt` in `tagged-videos.json`.
5. Dodaj export `keep.json`.
6. Dodaj import `keep.json` v Tampermonkey skripto.
7. Dodaj dry-run `Delete not kept`.
8. Sele potem dodaj dejansko brisanje iz Watch Later.

## Zakaj ne baza/backend

Za ta use case baza ni nujna. `videoId` je stabilen kljuc, JSON je dovolj majhen tudi pri 4700 videih, browser pa brez tezav filtrira tak seznam v memoryju.

Backend bi postal smiseln sele, ce bi hotel:

- sync med napravami;
- vec uporabnikov;
- avtomatsko enrichment prek YouTube API-ja;
- scheduled cleanup;
- vec deset tisoc ali sto tisoc zapisov.

Za osebni Watch Later cleanup je ena HTML datoteka + JSON bolj primerna.
