# Faza 0.9 — stabilizacija

**Status:** zaključena 2026-07-28.

Končno preverjanje je bilo izvedeno nad čistim `main` checkoutom pri commitu
`03747b3` (`refactor: isolate application bootstrap`). Stabilizacijski rez ne
spreminja produkcijske kode ali podatkovnih shem.

## Avtomatski testi

Uspešno je bil pognan celoten trenutni testni sklop z Node.js `v24.18.0`:

```text
bootstrap architecture test passed
domain modules test passed
state and storage test passed
triage workspace test passed
userscript reconciliation test passed
```

## Lokalni acceptance smoke

Lokalna aplikacija je bila odprta prek statičnega HTTP strežnika in preverjena s
sintetičnim fixturejem
[`tests/fixtures/watchlater-smoke.json`](../tests/fixtures/watchlater-smoke.json).

Potrjeno:

- uvoz prikaže vseh 8 sintetičnih videov;
- search, status, channel, tag in advanced duration filter pravilno zožijo scope;
- Keep, Maybe, Delete in Reset posodobijo odločitev in števce;
- bulk sprememba vseh 8 videov ustvari history snapshot, Undo pa povrne prejšnja
  stanja;
- quick preview odpre pravi video in se zapre brez izgube trenutnega videa;
- po refreshu se polni dataset skladno z obstoječim contractom ne obnovi sam,
  lokalno shranjene odločitve pa se po ponovnem uvozu fixtureja pravilno
  uporabijo;
- obstoječi osebni workspace backup se uvozi z vsemi 4.833 videi; po refreshu ga
  je mogoče ponovno uvoziti z enakim številom videov;
- workspace export/import round-trip in normalizacijo payloadov dodatno pokriva
  `triage-workspace.test.cjs`.

Vgrajeni brskalnik zaradi svoje varnostne politike ne dovoljuje navigacije na
`file://` URL. Neposredno lokalno odpiranje je bilo ročno potrjeno že v Fazi 4,
v tem končnem rezu pa je contract ponovno preverjen z
`bootstrap-architecture.test.cjs`: entrypoint uporablja urejene klasične
skripte brez `type="module"`, vsi relativni lokalni CSS/JavaScript asseti
obstajajo in aplikacija se samodejno inicializira. Dejanski UI smoke je bil
izveden nad isto vsebino prek lokalnega statičnega strežnika.

## Responsive preverjanje

Preverjeni so bili desktop ter oba obstoječa breakpointa:

| Viewport | Rezultat |
|---|---|
| 1440 × 900 | dvostolpčni workspace, sticky sidebar in petstolpčni filter bar |
| 980 × 900 | enostolpčni workspace, statični sidebar in dvostolpčni filter bar |
| 680 × 900 | enostolpčni topbar/filter bar in mobilna video vrstica |

Pri nobeni širini dokument ni imel horizontalnega overflowa. Izmerjene
`scrollWidth / innerWidth` vrednosti so bile `1425 / 1440`, `965 / 980` in
`665 / 680`.

## Produkcijski GitHub Pages

Preverjen je bil
[`https://madli007.github.io/youtube-watchlater-toolbox/`](https://madli007.github.io/youtube-watchlater-toolbox/).

- stran se odpre z naslovom `Watch Later Triage` in inicializiranim import UI-jem;
- naložijo se stylesheet, vseh 16 JavaScript assetov in app ikona;
- browser console nima errorjev ali warningov;
- `assets/app-icon.png` je naložen in dekodiran kot slika velikosti 256 × 256.

## Podatkovna in scope kontrola

- `youtube-watchlater-toolbox.user.js` ima še vedno baseline SHA-256
  `26197021BDCFF36DBEED2FDA40CED50F6216DB5AAA014F77E2072F26D597F623`;
- od referenčnega commita Faze 0.0 ni sprememb userscripta,
  `trenutni-userscript-primer.js` ali osebnih exportov;
- workspace ovoj ostaja `schemaVersion: 1`, source
  `youtube-watchlater-triage`, mode `workspace-snapshot` in vsebuje ista
  workspace polja kot pred refaktorjem;
- portable decision še vedno vsebuje samo `status`, `tags`, `note` in
  `updatedAt`;
- workspace video še vedno odstrani samo derived polji `suggestedTags` in
  `searchText`.

## Preostali tehnični dolg

Ni blokirajočega tehničnega dolga za izhod iz Faze 0. Omejitev avtomatizacije
`file://` je okoljska, ne produkcijska regresija; ob prihodnjih spremembah načina
nalaganja skript naj se neposredno odpiranje ponovno ročno preveri v običajnem
brskalniku.
