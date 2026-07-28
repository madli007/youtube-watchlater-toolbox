# Načrt strukturnega refaktorja spletne strani

## Namen dokumenta

Ta dokument je izvedbeni načrt za varen strukturni refaktor trenutne spletne aplikacije. V tej nalogi se ne spreminja produkcijska koda; checkboxi spodaj so namerno še vsi prazni.

Fokus je izključno na trenutnem `index.html` in na datotekah, ki bodo nastale iz njega. Userscript `youtube-watchlater-toolbox.user.js`, `trenutni-userscript-primer.js` in funkcionalni razvoj toolboxa niso del tega refaktorja.

Glavni cilj je zmanjšati velikost in število odgovornosti ene datoteke, ne da bi hkrati uvedli framework, bundler, backend ali spremembe uporabniškega obnašanja.

## Razmerje do Channel Insights redesign-a

Ta dokument je podrobni izvedbeni načrt za **Fazo 0** v
[`docs/channel-insights-redesign-plan.md`](docs/channel-insights-redesign-plan.md).

Preslikava poimenovanja:

| Ta dokument | Glavni feature načrt |
|---|---|
| Faza 0 — baseline | Podfaza 0.0 |
| Faza 1 — testi | Podfaza 0.1 |
| Faza 2 — `docs/` | Podfaza 0.2 |
| Faza 3 — CSS | Podfaza 0.3 |
| Faza 4 — en `app.js` | Podfaza 0.4 |
| Faza 5 — domain moduli | Podfaza 0.5 |
| Faza 6 — state/storage | Podfaza 0.6 |
| Faza 7 — UI moduli | Podfaza 0.7 |
| Faza 8 — bootstrap | Podfaza 0.8 |
| Faza 9 — stabilizacija | Podfaza 0.9 |

Feature Faza 1 se začne šele po izhodnem kriteriju Podfaze 0.9. S tem se navigacija, novi pogledi, dense video item, nova storage polja in vizualni redesign ne mešajo z mehanskim premikom ter ekstrakcijo obstoječe aplikacije.

Ta refaktor vseeno pripravi jasne razširitvene točke:

| Ekstrahirana odgovornost | Poznejši feature porabnik |
|---|---|
| `domain/filters.js` | compact Triage filtri in Insights → Triage bridge |
| `domain/import-comparison.js` | New since last import in poznejša import history |
| `domain/time-budget.js` | selitev time budget workflowa v Channel Insights |
| `domain/grouping.js` | izboljšani series parser, confidence in manual overrides |
| `domain/workspace.js` + `storage.js` | workspace extensions, import history in grouping overrides |
| `ui/dashboards.js` | prehodni dom trenutnih dashboardov; pozneje ga nadomestita Insights in Groups view |
| `ui/video-list.js` | dense video vrstica in keyboard-first interakcije |

Med Fazo 0 se v te module prenese samo trenutno vedenje. `insights.js`, `import-history.js`, novi view moduli in novi storage ključi nastanejo šele v ustreznih feature fazah.

## Trenutno stanje

Pregled dne 2026-07-21:

- `index.html`: 5.672 vrstic in približno 216 KB;
- vgrajeni CSS: približno 1.279 vrstic oziroma 25 KB;
- dejanski HTML markup: približno 405 vrstic oziroma 19 KB;
- vgrajeni JavaScript: približno 3.975 vrstic oziroma 170 KB;
- JavaScript vsebuje približno 234 poimenovanih funkcij;
- HTML vsebuje približno 125 elementov z `id`;
- vsa aplikacijska stanja, DOM reference, dogodki, renderiranje, poslovna pravila, import/export in `localStorage` so trenutno v enem globalnem skriptu;
- ni `package.json`, build koraka ali zunanjih runtime odvisnosti;
- stran je namenoma uporabna neposredno prek lokalnega `index.html` in prek GitHub Pages;
- `tests/triage-workspace.test.cjs` neposredno bere korenski `index.html`, z regexom izloči inline `<script>`, zamenja klic `init()` in kodo izvede v `vm` sandboxu;
- oba trenutna testa sta ob pregledu uspešna:
  - `node tests/triage-workspace.test.cjs`
  - `node tests/userscript-reconciliation.test.cjs`

### Glavne strukturne odgovornosti v sedanjem JavaScriptu

Sedanji skript že ima prepoznavne sklope, čeprav niso ločeni v datoteke:

1. konstante, vgrajena tag pravila in storage ključi;
2. globalno stanje aplikacije in predpomnilniki;
3. register DOM elementov in vezava dogodkov;
4. uvoz, obogatitev in primerjava datasetov;
5. odločitve, bulk akcije, zgodovina in undo;
6. filtri, saved views, kanali in tagi;
7. časovna statistika in tedenski shortlist;
8. serije, podobni videi in podvojitve;
9. renderiranje seznama, dashboardov in stranske vrstice;
10. video preview in časovnik;
11. urejevalniki videa, tag pravil in channel pravil;
12. workspace/decision import-export in browser storage;
13. keyboard shortcuts, obvestila in bootstrap.

To so naravne meje za postopno ekstrakcijo. Ne smemo jih vseh ločiti v enem koraku.

## Priporočena ciljna struktura

```text
docs/
  .nojekyll
  index.html
  channel-insights-redesign-plan.md
  assets/
    app-icon.png
    css/
      app.css
    js/
      config.js
      state.js
      storage.js
      domain/
        decisions.js
        filters.js
        import-comparison.js
        grouping.js
        time-budget.js
        workspace.js
      ui/
        dom.js
        video-list.js
        dashboards.js
        dialogs.js
      app.js
tests/
  helpers/
    load-triage-app.cjs
  fixtures/
    watchlater-minimal.json
  triage-workspace.test.cjs
```

To je ciljna smer, ne zahteva, da vse datoteke nastanejo takoj. Če se med ekstrakcijo pokaže, da sta dva predlagana modula močno sklopljena, naj začasno ostaneta skupaj. Cilj ni maksimalno število datotek, ampak jasne odgovornosti in stabilne odvisnosti.

`docs/index.html` naj ostane ena HTML datoteka. Po odstranitvi vgrajenega CSS in JavaScripta bo njen markup velik približno 400 vrstic, kar je še obvladljivo. Razbijanje HTML-ja na fragmente bi brez templating/build sistema zahtevalo runtime nalaganje fragmentov in bi po nepotrebnem povečalo tveganje.

### Zakaj `docs/` in ne `web/` ali `site/`

Pri GitHub Pages objavi neposredno iz veje sta podprta samo source folderja `/(root)` in `/docs`. Zato je `docs/` najmanj tvegan način, da je spletna stran fizično ločena od userscripta in ostalih datotek repozitorija brez novega deployment workflowa.

Poljubna mapa, na primer `site/`, je tehnično možna, vendar bi zahtevala GitHub Actions workflow, ki mapo zapakira kot Pages artifact. To za statično stran brez build procesa trenutno nima dovolj koristi.

Uradna dokumentacija:

- [Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Creating a GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)

## Temeljna pravila izvedbe

- En commit oziroma en majhen PR naj rešuje samo eno vrsto spremembe.
- Premik datotek, mehanska ekstrakcija in dejansko preoblikovanje kode ne smejo biti v istem commitu.
- Po vsakem koraku morajo biti uspešni obstoječi testi in ročni smoke test.
- Ne spreminjamo storage ključev ali JSON shem med strukturnim refaktorjem.
- Ne preimenujemo DOM `id`-jev med ekstrakcijo.
- CSS se najprej prenese nespremenjen; reorganizacija selektorjev pride šele pozneje, če je sploh potrebna.
- JavaScript se najprej prenese v en zunanji `app.js` brez preurejanja funkcij.
- Posamezen modul se izloči samo, ko ima jasen vhod, izhod in testni rob.
- Funkcionalni popravki, spremembe besedila in vizualne izboljšave se vodijo ločeno od tega refaktorja.
- Userscripta se ne ureja. Njegov test se vseeno požene kot varovalo pred nenamernimi spremembami repozitorija.

## Združljivostna odločitev za JavaScript

V prvih fazah naj se uporabljajo navadni zunanji skripti, naloženi v določenem vrstnem redu na koncu `<body>`. Ne uvajamo še `type="module"`.

Razlog: ES moduli so dobra dolgoročna možnost, vendar pri neposrednem odpiranju prek `file://` pogosto naletijo na browser CORS omejitve. Prehod na module bi zato hkrati spremenil lokalni način zagona in zahteval lokalni HTTP strežnik. To ni potrebno za prvi varen strukturni refaktor.

Pri razbijanju enega `app.js` naj novi skripti uporabljajo en ekspliciten namespace, na primer `window.WatchLaterApp`, in IIFE oziroma podoben file-local scope. Tako ne dodajamo množice novih globalnih imen. Testni helper lahko skripte še naprej izvede v skupnem `vm` kontekstu v enakem vrstnem redu kot browser.

Prehod na ES module in lokalni strežnik se lahko oceni kot ločen prihodnji projekt, ko je trenutna delitev stabilna in dobro testirana.

## Faza 0 — Zamrznitev obsega in baseline

**Namen:** določiti, kaj mora po refaktorju ostati nespremenjeno.

- [x] Zapisati referenčni commit in potrditi čist oziroma razumljen `git status`.
- [x] Pognati `node tests/triage-workspace.test.cjs`.
- [x] Pognati `node tests/userscript-reconciliation.test.cjs`.
- [x] Narediti sintetični, neosebni minimalni JSON fixture za smoke teste.
- [x] Pred kakršnimkoli premikom lokalne strani ročno izvoziti workspace backup iz obstoječe aplikacije.
- [x] Zabeležiti kratek ročni acceptance checklist: import JSON, filtriranje, sprememba statusa, bulk undo, workspace export/import, preview, refresh in ohranitev podatkov.
- [x] Potrditi, da se deployment in refaktor nanašata samo na stran, ne na userscript.

**Izhodni kriterij:** obstaja ponovljiv baseline in varnostna kopija lokalnih podatkov.

**Tveganje:** zelo nizko; ni produkcijskih sprememb.

## Faza 1 — Odklop testov od monolitne lokacije

**Namen:** odstraniti trenutno največjo tehnično oviro pred premikom in ekstrakcijo skripta.

- [x] Dodati en testni helper, ki pozna trenutno vstopno HTML datoteko in iz nje pridobi povezane skripte.
- [x] Helper naj začasno podpira inline skript in pozneje zunanje skripte, da sprememba ni big-bang.
- [x] Prestaviti logiko za unikatne DOM `id`-je in preverjanje `getElementById` referenc v ta helper.
- [x] Odstraniti neposredno odvisnost testa od `path.join(__dirname, "..", "index.html")`.
- [x] Nadomestiti krhko string zamenjavo `init()` z eksplicitnim testnim bootstrap guardom ali javnim testnim API robom.
- [x] Ohraniti vse obstoječe assertions brez spreminjanja pričakovanega obnašanja.
- [x] Dodati test, ki jasno odpove, če HTML kaže na manjkajoč CSS ali JavaScript asset.
- [x] Pognati oba obstoječa testa.

**Izhodni kriterij:** test ne predpostavlja več, da je aplikacijski JavaScript inline ali da je `index.html` nujno v korenu.

**Tveganje:** nizko do srednje, ker se spreminja način nalaganja kode v testu, ne produkcijska koda.

**Rollback:** povrnitev samo testnega helperja; aplikacija ostane nedotaknjena.

## Faza 2 — Premik objavljive strani v `docs/`

**Namen:** fizično ločiti spletno stran od userscripta in projektne dokumentacije, preden nastanejo asseti.

Najvarnejši deployment vrstni red je prehodno podvajanje, ne takojšen izbris korenskega entrypointa:

- [x] Uporabiti obstoječi `docs/` (oziroma ga ustvariti, če manjka), ohraniti `docs/channel-insights-redesign-plan.md` in vanj kopirati trenutni `index.html` brez vsebinskih sprememb.
- [x] Dodati `docs/.nojekyll`, ker stran ne potrebuje Jekyll obdelave.
- [x] Kopirati `assets/app-icon.png` v `docs/assets/app-icon.png`, da relativna pot deluje tudi, ko Pages objavlja samo vsebino `docs/`.
- [x] Testni entrypoint preusmeriti na `docs/index.html`.
- [x] Posodobiti README navodilo za lokalno odpiranje.
- [x] Pognati teste in lokalno odpreti `docs/index.html`.
- [x] Commitati prehodno stanje, v katerem obstajata oba identična entrypointa.
- [x] V GitHubu spremeniti Pages source na `main` + `/docs`.
- [x] Počakati na uspešen Pages deployment in preveriti produkcijski URL, import ter refresh.
- [x] Šele po uspešni objavi odstraniti korenski `index.html`.
- [x] Ponovno pognati teste in preveriti, da repozitorij nima dveh različic aplikacije.
- [x] Statično preveriti, da vsi lokalni asseti, vključno z `assets/app-icon.png`, obstajajo znotraj objavljivega `docs/` drevesa.

**Zakaj prehodna kopija:** trenutna Pages nastavitev je po README `main` + `/(root)`. Če bi korenski `index.html` izginil pred spremembo nastavitve, bi lahko nastalo kratko obdobje z nedelujočo stranjo.

**Podatki v `localStorage`:** pri GitHub Pages bo javni URL ostal na istem originu in isti project-site poti, zato sama zamenjava source folderja praviloma ne spremeni browser storage prostora. Pri neposrednem `file://` odpiranju je obnašanje `localStorage` med browserji in potmi manj zanesljivo; zato je workspace export v Fazi 0 obvezen varnostni korak.

**Izhodni kriterij:** edini dejanski source strani je `docs/index.html`, javna stran pa deluje z istega URL-ja kot prej.

**Tveganje:** srednje zaradi ročne Pages nastavitve in lokalnega `file://` storage obnašanja; koda aplikacije se še ne spreminja.

## Faza 3 — Ekstrakcija CSS v eno datoteko

**Namen:** odstraniti približno 1.279 vrstic CSS iz HTML-ja z minimalnim tveganjem za cascade.

- [x] Ustvariti `docs/assets/css/app.css`.
- [x] Vsebino trenutnega `<style>` prenesti nespremenjeno in v enakem vrstnem redu.
- [x] `<style>` nadomestiti z relativno povezavo `./assets/css/app.css`.
- [x] Ne preimenovati razredov, ne združevati selektorjev in ne spreminjati media queries.
- [x] Dodati statični test, da HTML nima več aplikacijskega inline `<style>` in da CSS datoteka obstaja.
- [x] Primerjati desktop, 980 px in 680 px responsive postavitev.
- [x] Preveriti dialoge, video vrstice, status barve, sticky/sidebar obnašanje in focus stanja.
- [x] Pognati oba testa.
- [x] Po deploymentu preveriti GitHub Pages asset URL.

**Izhodni kriterij:** HTML vsebuje samo `<link>` do enega CSS asseta, vizualni rezultat pa je nespremenjen.

**Tveganje:** nizko, če je prenos res mehanski.

**Opomba:** `app.css` je pri približno 25 KB še vedno obvladljiva datoteka. Delitev na `base.css`, `layout.css`, `components.css` in `responsive.css` naj ne bo del iste faze, ker vrstni red selektorjev vpliva na cascade. To se lahko izvede kasneje samo, če prinese jasno korist.

## Faza 4 — Ekstrakcija JavaScripta v en `app.js`

**Namen:** odstraniti približno 3.975 vrstic JavaScripta iz HTML-ja, vendar še ne spreminjati njegove notranje zgradbe.

- [x] Ustvariti `docs/assets/js/app.js`.
- [x] Inline skript prenesti mehansko, brez preimenovanj, prestavljanja funkcij ali sprememb logike.
- [x] Na istem mestu ob koncu `<body>` uporabiti relativni `<script src="./assets/js/app.js"></script>`.
- [x] Ne dodati `type="module"`, `async` ali drugega načina izvajanja.
- [x] Testni helper preusmeriti na zunanji skript.
- [x] Dodati statični test, da produkcijski HTML nima več aplikacijskega inline skripta in da script asset obstaja.
- [x] Pognati vse assertions iz `triage-workspace.test.cjs` nad zunanjo datoteko.
- [x] Izvesti celoten ročni acceptance checklist iz Faze 0.
- [x] Preveriti neposredno lokalno odpiranje in GitHub Pages.

**Izhodni kriterij:** `docs/index.html` je pretežno semantični markup, vedenje pa je enako kot pred ekstrakcijo.

**Tveganje:** nizko do srednje; glavna nevarnost sta čas nalaganja skripta in napačna relativna pot.

**Pomembna kontrolna točka:** po tej fazi je že dosežen večji del začetnega cilja. Če ni časa ali potrebe za globlji refaktor, je varno začasno ustaviti delo tukaj.

## Faza 5 — Ekstrakcija čistih domenskih modulov

**Namen:** najprej ločiti funkcije brez DOM-a in browser I/O, ker imajo najbolj jasne pogodbe in že največ testnega pokritja.

Vsak spodnji sklop naj bo samostojen commit; po vsakem se poženejo testi:

- [x] `config.js`: velikostne meje, grouping stop words, vgrajena tag pravila in nespremenljivi ključi.
- [x] `domain/decisions.js`: normalizacija odločitev in tagov, statusne transformacije ter portable decisions.
- [x] `domain/import-comparison.js`: snapshoti, baseline, primerjava datasetov in normalizacija comparison rezultata.
- [x] `domain/filters.js`: normalizacija filtrov/saved views, parse age/views in čista filter predikata.
- [x] `domain/time-budget.js`: duration statistika, grouping statistike, shortlist in formatiranje časa.
- [x] `domain/grouping.js`: normalizacija naslovov, similarity, series/duplicate/similar groups in izbira zmagovalca.
- [x] `domain/workspace.js`: sestavljanje in validacija workspace payloadov brez file input/output dela.
- [x] Vsak modul izpostaviti prek enega kontroliranega `window.WatchLaterApp` namespacea, ne prek množice naključnih globalov.
- [x] Teste preusmeriti na eksplicitne module/API-je namesto na globalno zbirko funkcij iz monolita.
- [x] Za vsak modul dodati vsaj test normalnega primera in mejnega/invalid primera.

**Priporočen vrstni red:** config/normalizacija → decisions → import comparison → filters → time budget → grouping → workspace. Poznejši moduli uporabljajo več skupnih normalizacijskih funkcij, zato se s tem zmanjša krožno odvisnost.

**Izhodni kriterij:** poslovna pravila je mogoče testirati brez DOM stubov; `app.js` ostane orkestrator in začasni dom za še neizločeno UI kodo.

**Tveganje:** srednje. To je prvi pravi refaktor funkcijskih meja, zato ne sme biti združen z vizualnimi ali deployment spremembami.

## Faza 6 — Ločitev stanja, persistence in browser I/O

**Namen:** ločiti podatke od prikaza, ne da bi spremenili storage sheme.

- [x] `state.js`: centralna inicializacija state objekta in dokumentirana oblika njegovih polj.
- [x] `storage.js`: varni read/write wrapperji za `localStorage`, dataset baseline, history in preview progress.
- [x] Ohraniti vse trenutne storage ključe dobesedno enake.
- [x] Ohraniti workspace `schemaVersion` in decision export format nespremenjena.
- [x] Ločiti serializacijo podatkov od browser akcij `FileReader`, `Blob`, object URL in download linka.
- [x] Dodati teste za pokvarjen JSON, prazen storage, starejše normalizirane oblike in neuspel write.
- [x] Dodati round-trip test: workspace export → parse/import → semantično enako stanje.
- [x] Preveriti, da refresh po odločitvi še vedno obnovi podatke.
- [x] Preveriti undo/history in preview timestamp persistence.

**Izhodni kriterij:** domenska logika ne bere neposredno iz `localStorage`, I/O robovi pa so zbrani in zamenljivi v testih.

**Tveganje:** srednje do visoko zaradi lokalnih uporabniških podatkov. Faza zahteva posebej previdne smoke teste in se ne kombinira z novo storage migracijo.

## Faza 7 — Postopna delitev UI kode

**Namen:** zmanjšati preostali `app.js` po funkcionalnih vertikalah, pri čemer vsak korak ohrani obstoječi DOM contract.

Predlagan vrstni red od manj centralnih do bolj centralnih delov:

- [x] `ui/dom.js`: enoten lookup/register vseh 125 DOM elementov ter zgodnja jasna napaka, če obvezen element manjka.
- [x] `ui/dialogs.js`: video editor, tag rules, channel rules in quick preview.
- [x] `ui/dashboards.js`: stats, time dashboard, import comparison, groups in sidebar summaries.
- [x] `ui/video-list.js`: render liste, posamezne vrstice, status gumbi in incremental rendering.
- [x] Iz `app.js` odstraniti UI funkcije šele po tem, ko novi modul deluje in je priklopljen.
- [x] Po vsakem modulu preveriti event handlerje in keyboard shortcuts.
- [x] Ne preimenovati obstoječih `id`, `data-*` atributov ali CSS razredov.
- [x] Za dinamično ustvarjene elemente dodati ciljne teste tam, kjer je mogoče testirati rezultat brez polnega browserja.
- [x] Ročni end-to-end smoke test vseh dialogov, bulk akcij, kanalskega menija in inkrementalnega prikazovanja je zavestno združen s končnim preverjanjem v Fazi 9; avtomatski empty-state init/render in ciljni dinamični DOM testi v tej fazi so uspešni.

**Izhodni kriterij:** renderiranje in uporabniška interakcija sta ločena od domenskih izračunov, HTML pa še vedno določa isti DOM contract.

**Navezava na redesign:** `ui/dashboards.js` je namenoma prehodni modul, ki med refaktorjem ohrani trenutno vedenje. V feature Fazah 1–3 se njegove odgovornosti postopno razdelijo med novi Triage shell, Channel Insights in Series & Groups; tega preoblikovanja ne izvajamo v Fazi 0.

**Tveganje:** srednje do visoko, ker je obstoječa UI koda močno povezana z globalnim `state` in `els`. Zato se deli po vertikalah, ne po vseh render funkcijah naenkrat.

## Faza 8 — Minimalen bootstrap in čiščenje odvisnosti

**Namen:** dokončati strukturo šele, ko so vsi večji sklopi že stabilni.

- [x] V `app.js` pustiti samo sestavo odvisnosti, inicializacijo, vezavo globalnih dogodkov in zagon prvega renderja.
- [x] Dokumentirati vrstni red nalaganja skriptov v `docs/index.html`.
- [x] Preveriti, da med moduli ni krožnih odvisnosti.
- [x] Odstraniti začasne compatibility exporte, ki jih nič več ne uporablja.
- [x] Preveriti, da ni podvojenih helper funkcij ali neposrednih storage dostopov iz domenskih/UI modulov.
- [x] Izvesti statični pregled vseh relativnih asset poti.
- [x] Ponovno oceniti, ali prehod na ES module res prinaša korist; ne izvesti ga avtomatično v tej fazi.
- [x] Posodobiti README z dejansko strukturo, lokalnim zagonom, testi in GitHub Pages sourceom.

**Izhodni kriterij:** entrypoint je kratek in razumljiv, odvisnosti tečejo od app/UI sloja proti domain/storage sloju, ne obratno.

**Tveganje:** srednje, vendar je obseg posamezne spremembe po prejšnjih fazah majhen.

## Faza 9 — Stabilizacija in zaključek

**Namen:** potrditi, da je šlo za strukturni refaktor brez funkcionalnih regresij.

- [x] Pognati celoten testni sklop na čistem checkoutu.
- [x] Izvesti ročni acceptance checklist s sintetičnim fixturejem.
- [x] Uvoziti varnostni workspace in potrditi stanje po refreshu.
- [x] Preveriti desktop in oba obstoječa responsive breakpointa.
- [x] Preveriti neposredno lokalno odpiranje `docs/index.html`.
- [x] Preveriti produkcijski GitHub Pages URL in vse asset requeste brez 404.
- [x] Preveriti, da se `docs/assets/app-icon.png` pravilno naloži na produkcijskem URL-ju.
- [x] Preveriti, da v spremembah ni userscripta ali osebnih exportov.
- [x] Primerjati exportane JSON sheme pred/po refaktorju.
- [x] Dokumentirati morebitni preostali tehnični dolg kot ločene naloge, ne kot dodatek zadnjemu refaktorskemu commitu.

Rezultati, meritve in omejitev avtomatiziranega `file://` preverjanja so zapisani
v [`docs/refactor-phase-0-stabilization.md`](docs/refactor-phase-0-stabilization.md).

**Končni kriterij:** uporabnik ne opazi spremembe vedenja, razvijalec pa dobi ločen HTML, CSS, domensko logiko, persistence, UI in bootstrap.

## GitHub Pages: zahtevane nastavitve

Ko `docs/index.html` obstaja na `main`, je priporočena nastavitev:

1. odpreti repository **Settings**;
2. izbrati **Pages**;
3. pod **Build and deployment** kot **Source** izbrati **Deploy from a branch**;
4. izbrati branch **main**;
5. kot folder izbrati **/docs**;
6. shraniti in počakati na uspešen deployment.

Pomembne posledice:

- v `docs/` mora biti `index.html` neposredno na vrhu source folderja;
- reference naj bodo relativne, npr. `./assets/css/app.css`, ne `/assets/css/app.css`, ker gre za project Pages URL pod `/youtube-watchlater-toolbox/`;
- javni URL se zaradi premika iz korena v `/docs` ne bi smel spremeniti; spremeni se samo source folder;
- če bi se pozneje izbrala mapa, ki ni `/docs`, bi bilo treba Pages **Source** preklopiti na **GitHub Actions** in dodati workflow za upload/deploy Pages artifacta;
- če obstaja custom domain, mora biti njegov `CNAME` v objavljivem source folderju oziroma pravilno nastavljen v Pages nastavitvah; v trenutnem tracked drevesu `CNAME` ni prisoten;
- odstranitev `/docs` po nastavitvi Pages na ta folder povzroči build napako, zato naj se mapa ne preimenuje brez usklajene spremembe nastavitev.

## Preverjanje po vsaki fazi

### Avtomatsko

```powershell
node tests\domain-modules.test.cjs
node tests\state-storage.test.cjs
node tests\triage-workspace.test.cjs
node tests\userscript-reconciliation.test.cjs
```

Ko se doda testni helper oziroma test runner, naj obstaja še en dokumentiran ukaz za vse teste, vendar uvedba npm odvisnosti ni potrebna samo zaradi tega refaktorja.

### Ročni smoke test

- [ ] Stran se naloži brez console napak in brez manjkajočih assetov.
- [ ] Minimalni JSON se uvozi in prikaže pričakovano število videov.
- [ ] Search, status, channel, tag in advanced filtri delujejo.
- [ ] Keep/maybe/delete/reset in bulk akcije delujejo.
- [ ] Undo povrne stanje.
- [ ] Time dashboard in grouping vrneta pričakovane rezultate.
- [ ] Quick preview se odpre, zapre in shrani timestamp.
- [ ] Video editor, tag rules in channel rules se odprejo in shranijo.
- [ ] Decision in workspace export/import delujeta.
- [ ] Refresh ohrani odločitve, pravila, views, history in časovni budget.
- [ ] Mobilna postavitev nima očitnih regresij.

## Glavna tveganja in varovala

| Tveganje | Zakaj je pomembno | Varovalo |
|---|---|---|
| Test bere inline skript iz točne poti | Ekstrakcija ali premik bi test takoj zlomila | Najprej Faza 1: nevtralen loader/helper |
| Pages pozna samo root ali `/docs` pri branch deployu | Poljubna mapa ne bo delovala brez workflowa | Uporabiti `docs/` in spremeniti Pages folder |
| Relativne poti na project Pages | Absolutni `/assets/...` kažejo na domenin root | Vedno uporabljati `./assets/...` in testirati 404 |
| Ikona je trenutno zunaj bodočega Pages sourcea | Ob objavi samo `docs/` datoteka `assets/app-icon.png` sicer ni vključena | Kopirati jo v `docs/assets/` in preveriti statično ter v produkciji |
| CSS cascade | Razdelitev ali preureditev spremeni prioritete | Najprej en nespremenjen `app.css` |
| Čas izvajanja JavaScripta | `async`, `module` ali premik v `<head>` lahko sproži init pred DOM-om | Navaden script na koncu `<body>` |
| Globalne odvisnosti med 234 funkcijami | Big-bang split hitro ustvari skrite napake | Ekstrakcija po čistih modulih, en commit na sklop |
| `localStorage` vsebuje uporabniške podatke | Napačna migracija ali drugačen `file://` kontekst lahko deluje kot izguba podatkov | Predhodni workspace export; storage ključi ostanejo enaki |
| JSON compatibility | Workspace in decision datoteke so uporabniški backup | Schema version in payload ostaneta enaka; round-trip testi |
| Userscript je v istem repozitoriju | Široke spremembe lahko zajamejo napačno datoteko | Userscript je izven scopea; preveriti diff in njegov test |

## Česa v tem refaktorju ne delamo

- ne uvajamo Reacta, Vue, Svelte ali drugega frameworka;
- ne uvajamo TypeScripta, bundlerja ali npm runtime odvisnosti;
- ne spreminjamo vizualnega dizajna;
- ne spreminjamo uporabniških besedil ali funkcionalnosti;
- ne spreminjamo storage ključev ali JSON shem;
- ne popravljamo oziroma razširjamo userscripta;
- ne delimo HTML-ja na runtime naložene fragmente;
- ne preklopimo na GitHub Actions, dokler statični `/docs` branch deployment zadostuje;
- ne združujemo refaktorja z novimi featureji.

## Priporočeni commit/PR rezi

1. `test: decouple triage tests from inline root html`
2. `chore: prepare docs pages source`
3. `chore: switch pages source and remove root entrypoint`
4. `refactor: extract triage styles`
5. `refactor: extract triage application script`
6. več majhnih `refactor: extract ... domain logic` commitov
7. `refactor: isolate state and storage`
8. več majhnih `refactor: extract ... ui` commitov
9. `docs: document site structure and pages deployment`

Vsak rez mora biti samostojno preverljiv in po možnosti povrnljiv brez povrnitve poznejših, nepovezanih sprememb.

## Priporočilo za prvi izvedbeni cikel

Prvi cikel naj se zavestno konča po Fazi 4. Takrat bo dosežena jasna, nizko tvegana struktura:

```text
docs/
  .nojekyll
  index.html
  channel-insights-redesign-plan.md
  assets/
    app-icon.png
    css/app.css
    js/app.js
```

Šele ko je ta različica stabilna lokalno in na GitHub Pages, naj se začne notranja delitev `app.js`. To prepreči, da bi bilo ob regresiji hkrati treba raziskovati Pages nastavitev, asset poti, CSS cascade in nove JavaScript module.
