# Faza 0.0 — baseline

**Status:** zaključena 2026-07-28.

Baseline je bil zajet 2026-07-28 pred premikom ali ekstrakcijo produkcijske strani.

## Referenčno stanje

- Referenčni commit: `043ae8a494b826fde14dfa2492c566e38b8d0c5d`
  (`docs: finalize channel insights product decisions`).
- `git status --short` je bil pred začetkom sprememb prazen.
- Node.js: `v24.18.0`.
- Git: `2.54.0.windows.1`.
- Produkcijska stran ostaja `index.html`.
- Refaktor in prihodnji deployment se nanašata samo na spletno stran.
  `youtube-watchlater-toolbox.user.js` in `trenutni-userscript-primer.js` sta
  zunaj obsega Faze 0.

Referenčni SHA-256:

```text
index.html 642E2C9D40A0C2C571ACF047F63FBCD0344149B62391D5426314E0C30DAFC904
youtube-watchlater-toolbox.user.js 26197021BDCFF36DBEED2FDA40CED50F6216DB5AAA014F77E2072F26D597F623
tests/triage-workspace.test.cjs 6F23F721F0F0609DA3FAAC5A8F9F756E76FE51B2D43152A4FA6E9A9293AEA93A
tests/userscript-reconciliation.test.cjs 959F9293C07804816DB9CB75F0A7967D028C7FA6AE87F62D253B6AE6DB260B45
```

## Avtomatski baseline

Ukaza:

```powershell
node tests\triage-workspace.test.cjs
node tests\userscript-reconciliation.test.cjs
```

Rezultat 2026-07-28:

```text
triage workspace test passed
userscript reconciliation test passed
```

## Sintetični smoke fixture

Fixture je v
[`tests/fixtures/watchlater-smoke.json`](../tests/fixtures/watchlater-smoke.json).
Vsebuje samo izmišljene naslove, kanale in identifikatorje. Pokriva:

- več kanalov in različnih starosti;
- znano in neznano trajanje ter število ogledov;
- nedosegljiv video;
- badge;
- episode/series par;
- podobna naslova istega kanala;
- verjetni podvojeni naslov čez dva kanala.

Fixture namenoma uporablja trenutno podprti goli JSON array. S tem zamrzne
obstoječi import contract; verzionirani userscript ovoj je ločen feature rez.

## Workspace backup

- [x] Iz obstoječega `index.html` je izvožen workspace backup.
- [x] Backup je shranjen v ignorirani lokalni mapi
  `.personal-exports-backup/` in ni dodan v Git.
- [x] Izvoženi backup se uspešno uvozi nazaj v obstoječo aplikacijo.

Backup lahko vsebuje lokalne testne ali osebne podatke, zato njegova vsebina in
ime nista del javnega repozitorija.

Codex in-app browser ne dovoljuje navigacije na lokalni `file://` entrypoint.
Zato mora ta korak uporabnik opraviti v browser profilu, v katerem trenutno
uporablja aplikacijo; avtomatsko ustvarjen prazen ali sintetičen backup ne bi bil
ustrezno varovalo za obstoječi `localStorage`.

## Ročni acceptance checklist

Ta seznam se ponovi po vsakem strukturnem rezu:

- [ ] `index.html` se odpre brez console napak.
- [ ] `tests/fixtures/watchlater-smoke.json` se uvozi in prikaže 8 videov.
- [ ] Search, status, channel, tag in advanced filtri delujejo.
- [ ] Keep, maybe, delete in reset delujejo.
- [ ] Bulk sprememba ustvari snapshot, Undo pa povrne stanje.
- [ ] Workspace export/import povrne dataset in odločitve.
- [ ] Quick preview se odpre in zapre brez izgube trenutnega scopea.
- [ ] Refresh ohrani odločitve in ostale persistentne nastavitve.
- [ ] Userscript in njegove izvozne sheme se niso spremenili.

## Gate

Podfaza 0.0 je zaključena: baseline je ponovljiv, workspace backup je preverjen,
ročni acceptance checklist pa je zapisan za ponavljanje po strukturnih rezih.
Podfaza 0.1 se lahko začne.
