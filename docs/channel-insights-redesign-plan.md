# Izvedbeni načrt: Triage, Channel Insights in Series & Groups

## Namen in omejitve

Ta dokument je načrt, ne implementacija. Temelji na pregledu dejanskega stanja repozitorija dne 2026-07-28:

- `index.html`;
- `youtube-watchlater-toolbox.user.js`;
- `tests/triage-workspace.test.cjs`;
- `tests/userscript-reconciliation.test.cjs`;
- `README.md`, `triage-tool-spec.md`, `html-refactor-plan.md`;
- trenutna UI screenshota;
- `mocks/mock.png`;
- lokalni 4.833-video Watch Later JSON samo za preverjanje oblike in pokritosti polj.

`mocks/mock.png` je uporabljen kot orientacija za informacijsko hierarhijo Channel Insights pogleda: KPI kartice, glavna channel/age matrika, izbran kanal in podporni bloki. Ni 1:1 specifikacija. Končna rešitev mora ostati gostejša, odzivna, dostopna in vezana na podatke, ki jih aplikacija res ima.

Ohranijo se:

- vanilla HTML/CSS/JavaScript brez obveznega frameworka ali build koraka;
- neposredno lokalno odpiranje in GitHub Pages;
- popolnoma statično delovanje brez backenda;
- semantika `keep + maybe = protected`;
- funkcije za odločitve, pravila, saved views, undo zgodovino in preview progress;
- keyboard-first triage.

Trenutni lokalni podatki in odločitve so testni. Implementacija zato ne potrebuje
migracije teh instanc in lahko pred uvedbo končnih shem začne s praznim
`localStorage`. Produktna semantika in uporabne funkcije se ohranijo, testni
storage pa ne sme omejevati zasnove končne aplikacije.

Kanonični Watch Later izvoz userscripta naj od začetka končne aplikacije uporablja
verzioniran ovoj:

```js
{
  schemaVersion: 1,
  exportedAt: "2026-07-28T12:34:56.000Z",
  videos: []
}
```

`exportedAt` je obvezen ISO 8601 UTC timestamp. Triage lahko zaradi priročnega
uvoza že ustvarjenih datotek še naprej sprejme tudi golo polje, vendar to ni
migracijska zahteva in golo polje ni več kanonični output userscripta.

## 1. Current-state findings

### 1.1 Tehnična zgradba

Trenutna javna aplikacija je en 5.709-vrstični `index.html`:

- približno 1.280 vrstic inline CSS;
- približno 4.000 vrstic inline JavaScripta;
- brez `package.json`, npm odvisnosti, bundlerja ali backenda;
- en globalni `state`, en globalni register `els`, neposredni DOM event handlerji;
- vsi pogledi so trenutno deli iste strani; route/tab mehanizma ni.

`html-refactor-plan.md` je obvezna **Faza 0** tega načrta. Najprej se izvede varen premik v `docs/`, mehanska ekstrakcija CSS/JavaScripta in postopna razdelitev obstoječih odgovornosti v domenske, storage/state ter UI module. Feature Faza 1 se začne šele, ko je refaktor stabiliziran in so njegovi izhodni kriteriji izpolnjeni. Tako se funkcionalni redesign ne meša s premikanjem datotek, spremembo Pages sourcea ali razpletanjem monolita.

Oba trenutna testa sta pred pripravo tega dokumenta uspešna:

```text
triage workspace test passed
userscript reconciliation test passed
```

### 1.2 Importirani video model

Userscript trenutno izvozi golo JSON polje videov. Triage sprejme:

- golo polje;
- objekt z lastnostjo `videos`.

Video iz trenutnega userscripta vsebuje:

```text
index, playlistIndex, videoId, title, channel, channelUrl,
url, cleanUrl, embedUrl, playlistId, startTimeSeconds,
duration, durationSeconds, thumbnailUrl,
views, viewCountApprox, uploaded,
metadataText, metadata, badges, searchText, isUnavailable
```

Lokalni 4.833-video primer potrjuje, da so `videoId`, naslov, kanal, trajanje, približno število ogledov in relativna starost prisotni pri vseh zapisih v tem izvozu. `channelUrl` je pri delu zapisov lahko prazen, `badges` pa so redki. Načrt zato ne sme zahtevati:

- YouTube channel ID za vsak video;
- točnega datuma objave;
- subscription statusa;
- watch history ali dejanskega ogledanega časa;
- kategorije videa, subscriber counta ali frekvence objav kanala.

`enrichVideo()` ob importu doda samo:

- `suggestedTags`;
- sestavljeni `searchText`.

Ti dve polji se pri workspace izvozu odstranita in ob naslednjem importu ponovno izračunata.

### 1.3 Odločitve in lokalna hramba

Odločitve so shranjene po `videoId`:

```js
{
  status: "keep" | "maybe" | "delete" | "archive" | "unreviewed",
  tags: string[],
  note: string,
  updatedAt: string
}
```

UI trenutno uporablja `keep`, `maybe`, `delete` in `unreviewed`. `archive` normalizator sprejme, vendar ga trenutni status filter in števci ne obravnavajo kot aktivno UI možnost.

Implementacija `exportDeleteCandidates()` zaščiti samo `keep` in `maybe`, zato morebiten uvožen `archive` trenutno konča med delete candidates. To je robni primer in obstoječa razlika glede na ožji zapis v specifikaciji (`unreviewed + delete`). Redesign tega ne sme potiho reinterpretirati: v agregatih naj `archive` ostane ločen opcijski status, v export flowu pa se semantika spremeni samo z ločeno, eksplicitno odločitvijo in regresijskimi testi.

Obstoječi `localStorage` ključi so:

| Ključ | Vsebina |
|---|---|
| `watchlater-triage-decisions-v1` | odločitve po `videoId` |
| `watchlater-triage-history-v1` | največ 20 varnostnih snapshotov prejšnjih odločitev |
| `watchlater-triage-user-rules-v1` | uporabniška pravila za suggested tage |
| `watchlater-triage-channel-rules-v1` | channel status/tag/protection pravila |
| `watchlater-triage-saved-views-v1` | poimenovani filter pogledi |
| `watchlater-triage-dataset-baseline-v1` | samo zadnji dataset baseline |
| `watchlater-triage-time-budget-hours-v1` | tedenski časovni budget |
| `watchlater-triage-preview-progress-v1` | shranjene sekunde preview predvajanja |

Trenutni dataset sam po navadnem Watch Later importu ni shranjen kot celoten workspace v `localStorage`; v pomnilniku živi do refresha. Persistenten je skrčen primerjalni baseline. Polni dataset postane prenosljiv šele z ročnim workspace exportom.

### 1.4 Import comparison

Ob vsakem importu `compareVideoDatasets()` primerja trenutni dataset z:

1. datasetom, ki je že v pomnilniku, ali
2. zadnjim shranjenim baselineom.

Izračuna:

- `newIds`;
- `removedVideos`;
- `decidedIds`;
- `changedIds`;
- `changedFieldsById`;
- `orphanedDecisionIds`.

Baseline namenoma vsebuje le stabilnejša polja:

```text
videoId, title, channel, channelUrl, duration, durationSeconds,
badges, isUnavailable
```

`uploaded` in `views` sta iz primerjave metadata sprememb izločena kot volatilna. Obstaja torej samo primerjava “prejšnji proti trenutnemu”, ne zaporedje več importov. Trenutno so izvedljivi “New since last import”, “No longer present” in trenutni backlog. “Prisoten v zadnjih 6 importih” ali trend zmanjševanja backlog-a še nista izvedljiva.

### 1.5 Filtriranje in navigacija po seznamu

`FilterState` že podpira:

- text search;
- status;
- več kanalov;
- več tagov z AND/OR;
- min/max trajanje;
- min/max približno starost;
- min views;
- availability;
- badge;
- obstoj suggested taga;
- obstoj note-a;
- sort;
- import dataset view (`all`, `inbox`, `new`, `changed`, `decided`).

Filtri so trenutno vezani neposredno na DOM inpute prek `captureFilterState()` in `applyFilterState()`. To je uporabna obstoječa pogodba za povezavo Channel Insights → filtriran Triage; ni treba izumiti drugega filter modela.

### 1.6 Časovna statistika

`calculateDurationStats()` že v enem prehodu izračuna:

- skupni znani watch time;
- znano/neznano duration pokritost;
- pregledani watch time;
- zaščiteni watch time (`keep + maybe`);
- čas po statusu, kanalu in tagu.

`buildTimeBudgetShortlist()` iz trenutno vidnih, dosegljivih, non-delete videov sestavi statusno prioritiziran, najkrajši-prvi shortlist znotraj tedenskega budgeta.

To pomeni:

- analitični del “Time budget & statistics” sodi v Channel Insights;
- akcijski rezultat “This week's shortlist” mora dobiti gumb “Open/select in Triage”, ne ostati velik accordion na vrhu Triage.

### 1.7 Obstoječe grupiranje

Trenutno obstajajo tri neodvisne detekcije:

- `series`: isti normalizirani kanal in enak base po odstranitvi episode vzorca;
- `similar`: isti normalizirani kanal in token similarity `>= 0.74`;
- `duplicate`: enak normaliziran naslov, tudi čez različne kanale.

Obstoječi series parser prepozna:

- `S01E02` in sorodne oblike;
- `1x02`;
- `Season 1 Episode 2`;
- `Episode`, `Ep`, `Part`, `Pt`, `Chapter`;
- `#2`;
- končno številko v naslovu, če ni videti kot letnica.

Omejitve:

- generični reaction/review izrazi se pred base extractionom ne odstranijo;
- `TLOU` in `The Last of Us` nista povezana;
- channel identiteta temelji na prikaznem imenu, ne primarno na `channelUrl`;
- series skupine zahtevajo skoraj enak base, fuzzy korak pride šele kot ločena “similar” skupina;
- ni confidence scorea;
- union-find pri similar naslovih lahko prek tranzitivnega “bridge” videa preširoko združi skupino;
- ni ročnega merge/split overridea;
- analiza teče samo nad trenutno filtriranim scopeom;
- cache key je velik string vseh `videoId/title/channel` vrednosti.

Obstoječe group akcije že nudijo dobro osnovo:

- select group;
- keep/maybe/delete all;
- keep newest only;
- keep most viewed only;
- safety snapshot in undo;
- protected-channel opozorilo pred delete.

### 1.8 Renderiranje in performance

Seznam je inkrementalen (`PAGE_SIZE = 220`), vendar `render()` trenutno pri skoraj vsaki odločitvi ponovno pokliče:

- `getFilteredVideos()` večkrat;
- `renderStats()`;
- `renderTimeDashboard()`;
- `renderVideoGroups()`;
- `renderVideoList()`;
- `renderSidebar()`;
- `renderHistory()`;
- `renderImportComparison()`;
- `updateBulkLabels()`.

Video vrstica ustvari thumbnail, title/meta/tage/note in sedem vertikalnih action gumbov. To pojasni veliko višino in širok prazen srednji prostor s screenshotov.

Channel Insights ne sme biti dodan kot še en klic v ta univerzalni `render()`. Potrebuje pogledovno renderiranje in memoiziran derived model.

## 2. Glavne UX težave

1. Zgornja vrstica izenači deset redkih in pogostih import/export akcij. Primarni tok ni vizualno jasen.
2. Filtri, tag chips, import comparison, šest KPI kartic, time accordion, groups accordion in bulk bar pridejo pred prvi video.
3. Triage meša tri naloge: odločanje, analitiko in upravljanje podobnih videov.
4. Sedem gumbov na desni vsake vrstice porabi veliko širine in višine; Reset, Tags/note in Open imajo enako težo kot Keep/Maybe/Delete.
5. Trenutni “Top channels” sidebar je dober filter shortcut, ne pa channel analiza.
6. Current marker in keyboard shortcuts obstajajo, vendar niso dovolj vidno razloženi; focus in selection sta vizualno blizu, konceptualno pa različna.
7. Statistika ne pokaže coverage kakovosti (`duration known`, `age parseable`) ob vsaki metriki, zato lahko uporabnik preveč zaupa nepopolnim vsotam.
8. “Decision quality” iz trenutnih podatkov ni mogoče objektivno meriti. Možni so le transparentni proxyji: review coverage, delež Maybe med odločenimi, delež eksplicitnih odločitev in starost odločitve.
9. Obstoječe groups kartice so uporabne, a velik accordion na Triage obremenjuje glavni tok in analizo omeji na trenutni filter scope.
10. Pri 5.000 videih bi naivna matrika plus sedanji univerzalni render povzročila opazne zakasnitve po vsakem pritisku `k/m/d`.

## 3. Predlagana informacijska arhitektura

### 3.1 Primarna navigacija

Uporabi en static-page hash router:

```text
#triage
#insights
#groups
```

Za deep-link filtre:

```text
#triage?channels=<encoded-channel-key>&ageBucket=6-12m&status=unreviewed
```

Hash route deluje na `file://` in GitHub Pages brez server-side rewritov. Vsi pogledi uporabljajo isti `state.videos`, `state.decisions`, pravila in storage. Route ne sme ustvariti druge kopije podatkov.

Primarni zavihki:

1. **Triage** — iskanje, filtri, hitre odločitve, bulk scope, preview.
2. **Channel Insights** — channel/age matrika, watch-time in decision agregacije, time budget.
3. **Series & Groups** — pregled detektiranih skupin, detail in skupinske odločitve.

Series & Groups naj bo ločen tab. Razlog ni samo količina UI-ja: analiza skupin je drug workflow, uporablja širši dataset, potrebuje confidence/review stanje in ročne popravke. Iz video overflow menija ali Channel Insights se lahko odpre že filtriran Groups pogled.

### 3.2 Header in akcije

Pogosto uporabljene akcije ostanejo neposredno vidne:

- `Import JSON`;
- `Export keep/maybe`;
- `Undo` samo, ko je relevanten undo na voljo;
- primarna navigacija.

Predlagani compact split/menu model:

- **Import JSON ▾**
  - glavni klik: Watch Later JSON;
  - dropdown: Import decisions, Import workspace.
- **Export keep/maybe ▾**
  - glavni klik: keep/maybe;
  - dropdown: delete candidates, selected, visible, tagged all.
- **Workspace ▾**
  - Export workspace;
  - Import workspace;
  - History/restore.
- **Decisions ▾**
  - Export decisions;
  - Import decisions;
  - Clear decisions, vizualno ločeno kot nevarna akcija.

Na ozkem zaslonu se sekundarni meniji zložijo v en “More” meni, glavni Import in Export pa ostaneta vidna.

### 3.3 Triage

Triage obdrži:

- compact search/filter vrstico;
- advanced filtre in saved views v enem disclosure/panelu;
- import comparison kot kompaktne chips/tabs;
- majhen povzetek `visible / selected / undecided`;
- sticky ali jasno omejen bulk bar;
- dense video seznam.

Iz Triage se odstranijo:

- veliki `Time budget & statistics` accordion;
- veliki `Series & similar videos` accordion;
- šest stalnih KPI kartic, če iste vrednosti že pokaže compact scope bar;
- analitični sidebar. Tag rules, channel rules in history se prestavijo v menije/dialoge.

### 3.4 Channel Insights

Privzeti measure je **število videov**, ker je najlažje interpretabilen in deluje tudi pri neznanem trajanju. Toggle omogoči **watch time**.

Klik obnašanje:

- klik vrstice/kanala izbere kanal in odpre detail panel;
- klik konkretne matrix celice odpre Triage z `channel + age bucket`;
- `View videos` v detail panelu odpre Triage z izbranim kanalom in ohrani izbrani status/age filter;
- browser Back vrne Insights izbor, ker je izbor zapisan v hash/query state.

### 3.5 Series & Groups

Groups pogled uporablja celotni dataset kot default. Lasten filter bar omogoča:

- search;
- channel;
- type: series/similar/duplicate;
- confidence: auto/review/manual;
- status mix;
- “only groups with undecided”.

Levi seznam ali grid vsebuje kompaktne group summary vrstice. Izbrana grupa odpre detail panel z vsemi epizodami, razpoznanim season/episode, confidence razlogi in bulk akcijami. To je bolj primerno kot renderiranje vseh članov vseh grup na Triage.

## 4. Wireframe opis

### 4.1 Shared header

```text
┌ Brand ─────────── [Triage] [Channel Insights] [Series & Groups] ───────┐
│                                [Import JSON ▾] [Export keep/maybe ▾]    │
│                                [Workspace ▾] [Decisions ▾] [Undo]       │
└──────────────────────────────────────────────────────────────────────────┘
```

Header ni nujno sticky na mobilnem zaslonu. Če je sticky, mora ostati dovolj nizek, da ne odvzame več vrstic vsebine.

### 4.2 Triage

```text
┌ Search ───────── Status ─ Channel ─ Sort ─ [Filters 2] [Clear] ┐
│ Import view: [All] [Inbox] [New] [Changed] [Decided]            │
├ 4,833 total · 312 visible · 8 selected · 121 undecided ─────────┤
│ [Keep selected] [Maybe selected] [Delete selected]  select tools│
├──────────────────────────────────────────────────────────────────┤
│ □ thumbnail  title + compact metadata + tags   [K][M][D][Preview][⋯]│
│ □ thumbnail  title + compact metadata + tags   [K][M][D][Preview][⋯]│
└──────────────────────────────────────────────────────────────────┘
```

Dense vrstica:

- 24 px checkbox/focus marker;
- 112–128 px thumbnail pri desktopu, približno 96 px na mobilnem;
- naslov največ dve vrstici;
- meta v eni ali dveh vrsticah: playlist index, kanal, starost, trajanje, views;
- največ 2–3 tag chips, nato `+N`;
- decision state je v segmentu Keep/Maybe/Delete in tudi z levim barvnim robom/labelom, ne samo z barvo;
- Preview je sekundarna vidna ikona/gumb;
- overflow vsebuje Reset, Tags/note, Open, copy URL in pozneje “Find groups”.

### 4.3 Channel Insights

```text
┌ Search channels ─ Status ─ Period ─ Measure: [Count|Watch time] ┐
├ Channels ─ Videos ─ Total time ─ Undecided ─ Oldest ─ Coverage ┤
├───────────────────────────────┬─────────────────────────────────┤
│ Channel × age heatmap         │ Selected channel                │
│ sticky channel + bucket heads │ totals / time / avg age         │
│ sortable rows                 │ decision mix                    │
│ count/time in every cell      │ age distribution                │
│ accessible legend             │ persistence / new               │
├───────────────────────────────┴─────────────────────────────────┤
│ Backlog impact │ Decision proxies │ Oldest untouched │ Time budget│
└─────────────────────────────────────────────────────────────────┘
```

Pri širokem zaslonu je detail panel desno, kot v mocku. Pri srednjem zaslonu je pod matriko; na mobilnem je drawer/dialog po izboru kanala.

Matrika:

- vrstice: kanal;
- stolpci: `0–7d`, `8–30d`, `1–3m`, `3–6m`, `6–12m`, `1y+`;
- dodatni stolpec `Unknown` se pokaže samo, če starost ni razpoznavna;
- `Total` ostane na desni;
- barvna intenziteta uporablja globalno skalo po defaultu;
- toggle “normalize per channel” je sekundaren, ker je uporaben za obliko backlog-a znotraj kanala;
- besedilna vrednost je vedno prisotna; barva ni edini nosilec informacije.

### 4.4 Series & Groups

```text
┌ Search ─ Channel ─ Type ─ Confidence ─ [Only undecided] ┐
├ Group list ─────────────────┬ Group detail ──────────────┤
│ TLOU · Channel A · 8 videos│ Canonical: The Last of Us  │
│ 92% confidence · 5 pending │ detected alias: TLOU       │
│ ...                         │ S01E01 ... [K][M][D][⋯]    │
│                             │ S01E02 ... [K][M][D][⋯]    │
│                             │ [Keep all][Maybe][Delete]  │
│                             │ [Merge][Split][Edit alias] │
└─────────────────────────────┴─────────────────────────────┘
```

## 5. Predlagane spremembe komponent in modulov

### 5.1 Začetno stanje po obvezni Fazi 0

Feature delo se začne nad strukturo, ki jo vzpostavi `html-refactor-plan.md`:

```text
docs/
  index.html
  assets/
    app-icon.png
    css/app.css
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
```

Če se Faza 0 zaradi blokade ustavi pred popolno modularizacijo, se ne začne vzporedna implementacija featurejev v korenskem `index.html`. Najprej se dokonča ali eksplicitno ponovno načrtuje strukturni gate.

### 5.2 Novi feature moduli

Na obstoječo strukturo se po vertikalnih rezih dodajo:

```text
docs/assets/js/
  domain/
    insights.js
    import-history.js
  ui/
    navigation.js
    action-menus.js
    triage-view.js
    insights-view.js
    groups-view.js
```

Obstoječi `domain/grouping.js`, `domain/time-budget.js`, `domain/filters.js`,
`domain/workspace.js`, `storage.js`, `state.js` in `ui/video-list.js` se razširijo,
ne podvojijo. Prehodni `ui/dashboards.js` se prazni po vertikalah:

- trenutni time dashboard preide v `ui/insights-view.js`;
- trenutni groups dashboard preide v `ui/groups-view.js`;
- compact Triage stats preidejo v `ui/triage-view.js`;
- import comparison ostane skupna UI odgovornost ali se kasneje premakne v Triage view, ko ima jasen en sam porabnik.

Ne uvajaj dodatnega frameworka, drugega store sistema ali obveznega build koraka.

### 5.3 Predlagane čiste pogodbe

```js
deriveVideoFacts(videos, decisions, importContext, now) -> VideoFact[]
buildChannelInsights(videoFacts, options) -> InsightsModel
createTriageFilterFromInsight(selection) -> FilterState
parseSeriesTitle(video) -> ParsedSeriesTitle
scoreSeriesMatch(left, right, overrides) -> MatchScore
buildSeriesClusters(videos, overrides) -> VideoGroup[]
appendImportSnapshot(history, videos, importMeta) -> ImportHistory
```

Čiste funkcije ne berejo DOM-a ali `localStorage` in so neposredno testabilne v obstoječem Node `vm` pristopu.

## 6. Derived data model za Channel Insights

### 6.1 Normaliziran video fact

```js
{
  videoId,
  channelKey,
  channelName,
  channelUrl,
  status,
  durationSeconds,          // null, če ni znano
  ageDays,                 // null, če parse ni uspel
  ageBucket,               // "0-7d" ... "1y+" | "unknown"
  approxPublishedAt,       // približen timestamp ali null
  viewCountApprox,         // null, če ni znano
  isUnavailable,
  isUntouched,             // status === "unreviewed"
  isNewSinceLastImport,
  decisionUpdatedAt
}
```

`channelKey`:

1. normaliziran canonical del `channelUrl`, če obstaja;
2. sicer diacritic-insensitive, lowercase, whitespace-normalized `channel`;
3. prikazno ime ostane originalno najpogostejše ime.

To prepreči, da bi manjša sprememba prikaznega imena avtomatsko ustvarila nov kanal, in hkrati deluje za 50 lokalnih primerov brez `channelUrl`.

### 6.2 Starostni bucketi

Uporabi enotne meje:

| Bucket | Pogoj |
|---|---|
| `0-7d` | `0 <= ageDays < 8` |
| `8-30d` | `8 <= ageDays < 31` |
| `1-3m` | `31 <= ageDays < 91` |
| `3-6m` | `91 <= ageDays < 183` |
| `6-12m` | `183 <= ageDays < 366` |
| `1y+` | `ageDays >= 366` |
| `unknown` | parse ni uspel |

Trenutni `uploaded` je relativno in približno besedilo. Za svež import je možen dober približek z obstoječim `parseApproximateAgeDays()`. Ob importu je treba izračun zasidrati na:

1. `sourceExportedAt`, če je prisoten v objektni obliki importa;
2. sicer `importedAt`.

Nato se shrani ali izpelje `approxPublishedAt = anchor - parsedAge`. Tako se “pred 5 meseci” po dveh mesecih ne interpretira še vedno kot samo pet mesecev star video. Kanonični userscript izvoz zato vedno vsebuje `exportedAt`; fallback na `importedAt` je namenjen le ročnim ali starim golim poljem. Vrednost je kljub sidru še vedno približna zaradi relativnega izvornega besedila in jo mora UI tako označiti.

### 6.3 Channel aggregate

```js
{
  channelKey,
  channelName,
  channelUrl,
  totalCount,
  knownDurationCount,
  totalDurationSeconds,
  knownAgeCount,
  averageAgeDays,
  oldestAgeDays,
  oldestUntouchedCount,
  statusCounts: { keep, maybe, delete, unreviewed, archive },
  ageBuckets: {
    "0-7d": { count, durationSeconds, knownDurationCount },
    "8-30d": { ... },
    "1-3m": { ... },
    "3-6m": { ... },
    "6-12m": { ... },
    "1y+": { ... },
    unknown: { ... }
  },
  newSinceLastImportCount,
  persistence: null | {
    presentSnapshots,
    totalSnapshots,
    currentVideoSurvivalRates
  }
}
```

### 6.4 Global aggregate

```js
{
  channelCount,
  videoCount,
  totalDurationSeconds,
  knownDurationCount,
  knownAgeCount,
  averageAgeDays,
  oldestVideo,
  statusCounts,
  ageBuckets,
  channels,
  coverage: {
    durationPercent,
    agePercent,
    channelIdentityPercent
  }
}
```

### 6.5 Metrike: mogoče zdaj

| Metrika | Status | Opomba |
|---|---|---|
| Channel × age count heatmap | mogoče zdaj | približna starost; `unknown` mora biti viden |
| Channel × watch-time heatmap | mogoče zdaj | pokaži duration coverage |
| Backlog impact | mogoče zdaj | count, total duration, undecided duration po kanalu |
| Keep/Maybe/Delete/Undecided | mogoče zdaj | odločitve po `videoId`; `archive` pokaži ločeno samo, če obstaja |
| Age distribution | mogoče zdaj | približna, samo parseable del + unknown |
| Oldest untouched | mogoče zdaj | približna starost, `unreviewed` |
| New since last import | mogoče zdaj | samo glede na zadnji baseline |
| Total watch time | mogoče zdaj | samo znana trajanja |
| Povprečna starost | mogoče zdaj | samo parseable starosti; označi coverage |
| Review coverage | mogoče zdaj | decided / total po countu in duration |
| Decision mix | mogoče zdaj | deleži med vsemi ali samo med odločenimi |
| Time budget / weeks remaining | mogoče zdaj | obstoječa logika |

“Decision quality” naj se v UI imenuje **Decision quality proxies** ali **Decision health**, z razlago:

- reviewed coverage;
- Maybe rate med odločenimi kot indikator neodločnosti, ne napake;
- stale decisions, kjer je `updatedAt` starejši od uporabniško nastavljivega praga;
- explicit delete vs implicit delete-candidate (`unreviewed`).

Aplikacija ne ve, ali je bila odločitev dobra, zato naj tega ne trdi.
Privzeti stale prag je 180 dni. Nastavitev sprejme pozitivno število dni in
možnost `Off`; UI vedno pokaže uporabljeni prag ter count in delež stale
odločitev. Stale pomeni samo “primerno za ponovni pregled”, ne “napačna
odločitev”.

### 6.6 Metrike, ki zahtevajo dodatno zgodovino

- prisotnost kanala ali videa v zadnjih N importih;
- backlog persistence/survival rate;
- trend backlog counta ali watch timea;
- koliko novih videov je kanal dodal v vsakem intervalu;
- koliko videov je med importoma izginilo;
- starost backlog-a ob posameznem importu;
- čas od prvega zaznanega importa do odločitve.

### 6.7 Metrike, ki zahtevajo metadata enrichment

Naslednjih metrik lokalna aplikacija brez dodatnega enrichmenta ne more zanesljivo izpeljati:

- točen `publishedAt`;
- točen channel ID, kadar `channelUrl` manjka;
- subscriber count;
- dejanska publishing cadence;
- YouTube kategorija;
- ali je uporabnik naročen na kanal;
- watch progress iz YouTube računa;
- všečki, komentarji ali aktualni view count.

Če se pozneje doda enrichment, mora biti opcijski in jasno ločen od lokalno zanesljivih metrik. LLM/API ne sme biti obvezna odvisnost.

## 7. Algoritem za “ista serija + isti kanal”

### 7.1 Cilj

Visok-confidence avtomatsko združevanje mora prepoznati:

- `The Last of Us Season 1 Episode 1 Reaction`;
- `The Last of Us 1x02`;
- `The Last of Us S01E03 Reaction`;
- `Reacting to The Last of Us Episode 4`;
- `TLOU Episode 5 Reaction`;

če je kanal isti, brez obveznega API-ja ali LLM-a.

### 7.2 Večstopenjski postopek

1. **Normalizacija kanala**
   - preferiraj canonical `channelUrl`;
   - fallback na normalizirano prikazno ime;
   - kanal je trd predpogoj za series merge.
2. **Unicode in punctuation normalizacija**
   - NFKD, odstrani diakritike, lowercase;
   - `&` → `and`;
   - ločila in odvečni whitespace → presledek.
3. **Odstranitev generičnih wrapperjev**
   - `reaction`, `reacts`, `reacting to`, `review`, `watchalong`,
     `full reaction`, `first time watching`, `breakdown`, `recap`;
   - ohrani originalni naslov za prikaz in razlago.
4. **Prepoznava season/episode**
   - `S01E02`, `S1 E2`, `1x02`;
   - `Season 1 Episode 2`;
   - `Episode 2`, `Ep. 2`;
   - `Part 2`, `Pt 2`, `Chapter 2`;
   - finale/special/pilot;
   - več epizod: `Episodes 3 & 4`, `3-4`, `S01E03/E04`.
5. **Izločitev base imena**
   - odstrani episode token in generične prefix/suffix izraze;
   - odstrani kanal, če je dobesedno ponovljen v naslovu;
   - ohrani pomembne franchise/series besede.
6. **Alias in initialism**
   - iz `the last of us` izpelji `tlou`;
   - znotraj istega kanala poveži initialism samo, če obstaja daljši kandidat in ni več dvoumnih razširitev;
   - dovoli ročni alias `TLOU -> The Last of Us`;
   - ne uporabljaj globalnega hardcoded slovarja kot edine resnice.
7. **Candidate generation**
   - primerjaj samo isti `channelKey`;
   - uporabi inverted token/initialism index, ne vseh O(n²) parov;
   - exact normalized base in explicit episode sta najmočnejša kandidata.
8. **Fuzzy score**
   - token Dice/Jaccard;
   - containment za kratice in podnaslove;
   - character similarity samo kot sekundarni signal;
   - bonus za kompatibilen season/episode vzorec;
   - penalty za konfliktne franchise besede, `movie`, `trailer`, `part` brez episode konteksta.
9. **Confidence**
   - `>= 0.88`: avtomatska series skupina;
   - `0.72–0.879`: “Needs review”, brez avtomatske bulk akcije;
   - `< 0.72`: ne združi;
   - score pragovi se po fixture testih kalibrirajo, niso skriti magic numbers.
10. **Clustering**
    - ne uporabi nekontroliranega single-link uniona;
    - nov član mora biti dovolj podoben canonical baseu/medoidu skupine;
    - konfliktne season/episode interpretacije preprečijo merge;
    - forced merge/split override ima prednost.

### 7.3 Psevdokoda

```text
function buildSeriesGroups(videos, overrides):
  parsed = videos
    .filter(hasVideoId)
    .map(video => parseSeriesTitle(video, overrides.aliases))

  byChannel = groupBy(parsed, item.channelKey)
  groups = []

  for each channelItems in byChannel:
    index = buildCandidateIndex(channelItems)
    candidatePairs = index.generatePairs()
    scoredEdges = []

    for each [left, right] in candidatePairs:
      if overrides.blocks(left.videoId, right.videoId):
        continue

      score = scoreSeriesMatch(left, right)
      if score >= REVIEW_THRESHOLD:
        scoredEdges.push({ left, right, score, reasons })

    channelGroups = constrainedCluster(
      channelItems,
      scoredEdges,
      AUTO_THRESHOLD,
      REVIEW_THRESHOLD
    )

    channelGroups = applyForcedGroups(channelGroups, overrides.forcedGroups)
    groups.push(...channelGroups)

  return groups
    .filter(group => group.members.length >= 2)
    .map(addConfidenceAndExplanation)
```

```text
function parseSeriesTitle(video, aliases):
  channelKey = normalizeChannel(video.channelUrl, video.channel)
  normalized = normalizeUnicodeAndPunctuation(video.title)
  withoutWrappers = removeGenericReactionTerms(normalized)
  sequence = parseSeasonEpisodePartRange(withoutWrappers)
  base = removeSequenceAndNoise(withoutWrappers, sequence)
  tokens = meaningfulTokens(base)
  initialism = firstLetters(tokens)
  canonicalBase = resolveUnambiguousAlias(base, initialism, aliases[channelKey])

  return {
    video,
    channelKey,
    base,
    canonicalBase,
    tokens,
    initialism,
    sequence,
    warnings
  }
```

### 7.4 Confidence razlaga v UI

Vsaka skupina pokaže razloge, npr.:

```text
92% · same channel URL · exact canonical base · S01E01–S01E05 sequence
78% · same channel · strong title overlap · one title has no episode number
```

To omogoča ročno presojo in pojasni, zakaj skupina obstaja.

### 7.5 Ročni merge/split

Novi storage:

```js
{
  schemaVersion: 1,
  aliases: [
    { channelKey, alias: "tlou", canonical: "the last of us" }
  ],
  forcedGroups: [
    { id, channelKey, label, videoIds: [] }
  ],
  blockedPairs: [
    [videoIdA, videoIdB]
  ]
}
```

Pravila:

- merge je dovoljen samo znotraj istega kanala;
- split lahko blokira napačen par ali izloči člana;
- manjkajoči video ID po novem importu se ohrani kot orphaned override, ne izbriše;
- UI omogoča odstranitev zastarelega overridea;
- vse bulk decision akcije še naprej ustvarijo obstoječi undo snapshot;
- sprememba same group definicije dobi ločen undo ali potrditveni dialog.

### 7.6 Edge cases algoritma

| Primer | Obravnava |
|---|---|
| Podobni seriji na istem kanalu | zahtevaj canonical-base prag in razlikovalne tokene; ne le skupnih `reaction/episode` besed |
| Film `Part 1` / `Part 2` | `part` sam prinese manjši bonus; brez episodic konteksta gre v review, ne auto series |
| Kompilacija epizod | shrani range/list v `sequence`; član lahko predstavlja več epizod in dobi opozorilo |
| Finale/special/pilot | kvalifikator shrani posebej; ne izmisli episode številke |
| Naslov brez številke | lahko vstopi samo z visokim base/alias ujemanjem; običajno review confidence |
| `TLOU` | initialism ali ročni per-channel alias |
| Isti kanal, več serij | channel je samo predpogoj, ne zadosten signal |
| Napačno prepoznan S/E | UI pokaže parsed vrednost in omogoči split/override |
| Letnice in resolucije | 1900–2099, 4K, 1080p se ne obravnavajo kot episode |
| Reakcija na trailer vs epizoda | `trailer` je negativen signal za series cluster |
| Reupload iste epizode | lahko je hkrati duplicate in series član; UI pokaže primary type in secondary flag |
| Spremenjen naslov po importu | override je vezan na `videoId`; parser se ponovno izvede, manual odločitev ostane |

## 8. Končne podatkovne sheme in localStorage

### 8.1 Pravilo čistega začetka

Ker so trenutne odločitve in lokalni podatki testni, migracija njihovih instanc ni
zahtevana. Pred uvedbo končnih shem se lahko lokalni storage enkrat počisti.
Končne sheme morajo biti od prve izdaje verzionirane in testirane.

Poleg smiselno ohranjenih funkcijskih ključev se uvedejo:

```text
watchlater-triage-import-history-v1
watchlater-triage-grouping-overrides-v1
watchlater-triage-insights-settings-v1
```

`watchlater-triage-insights-settings-v1` vsebuje najmanj
`decisionStaleDays: 180 | positive integer | null`, kjer `null` pomeni `Off`.
Import history se začne s prvim importom v končno aplikacijo; migracija testnega
baselinea ni potrebna.

### 8.2 Kompaktna import history shema

Ne shranjuj šestih polnih kopij 5.000-video objektov. Predlagana kompaktna oblika:

```js
{
  schemaVersion: 1,
  maxSnapshots: 6,
  snapshots: [
    {
      id,
      importedAt,
      sourceExportedAt,
      fileName,
      videoCount,
      channels: ["Channel A", "Channel B"],
      videos: [
        [videoId, channelIndex, durationSecondsOrNull, approxPublishedAtOrNull]
      ]
    }
  ]
}
```

Pred write:

- izmeri `JSON.stringify(payload).length`;
- ohrani privzeto 6, največ 12 snapshotov;
- najprej odstrani najstarejše snapshote;
- ob quota napaki ne prekini importa; pokaži opozorilo in obdrži obstoječo zgodovino;
- ne shranjuj title, thumbnail, views, tags ali odločitev v vsak snapshot.

Odločitve se berejo iz trenutnega decision storea. History je namenjen prisotnosti datasetov, ne reprodukciji starega decision stanja.

### 8.3 Workspace kompatibilnost

Ohrani zunanji workspace `schemaVersion: 1` in dodaj opcijski extension:

```js
workspace: {
  // obstoječa polja
  extensions: {
    channelInsights: {
      schemaVersion: 1,
      importHistory,
      groupingOverrides
    }
  }
}
```

Novi parser:

- sprejme stare v1 workspaces brez `extensions`;
- normalizira neznana/manjkajoča extension polja;
- izvozi extension, če obstaja;
- ob importu pred zamenjavo še vedno ustvari safety snapshot odločitev.

Stara aplikacija bo neznan extension ignorirala, zato datoteke ne zavrne. V dokumentaciji je treba opozoriti, da re-export skozi staro različico extension podatke izgubi.

## 9. Performance tveganja pri 5.000+ videih

| Tveganje | Varovalo |
|---|---|
| Večkratni `getFilteredVideos()` v enem renderju | izračunaj en `RenderContext` na render in ga podaj pod-renderjem |
| Insights agregacije po vsakem `k/m/d` | `datasetRevision` in `decisionRevision`; memoiziraj facts/agregate |
| Groups analiza blokira Triage | poganjaj samo ob vstopu v Groups ali spremembi relevantnih filtrov |
| O(n²) title primerjave | per-channel inverted token/alias index in omejeni candidate pairs |
| Union-chain overmerge | constrained clustering proti canonical baseu |
| Stotine matrix vrstic | sticky semantic table + prvih 100 vrstic/paginacija ali row virtualization |
| Preveč DOM chart elementov | CSS bars in table cells; brez tisočev SVG elementov |
| Sync `localStorage` write import history | kompaktni snapshoti, write samo po importu, quota handling |
| Velik group cache key string | revision key, ne join celotnega dataseta |
| Ponovno ustvarjanje 220 video vrstic po checkboxu | lokalna posodobitev vrstice ali keyed render; vsaj ne renderiraj drugih pogledov |
| Starostni parser na vsak render | materializiraj VideoFact enkrat na dataset/import anchor |
| Prvi Insights izračun | loading state; `requestIdleCallback` z `setTimeout` fallbackom; Web Worker šele če meritve pokažejo potrebo |

Performance acceptance budget na običajnem desktop browserju:

- `k/m/d` vizualni odziv v Triage: cilj < 100 ms;
- osnovna 5.000-video Insights agregacija: cilj < 300 ms po prvem odprtju;
- filter/sort matrike po že zgrajenem modelu: cilj < 100 ms;
- groups analiza ne sme zamrzniti UI-ja za več kot približno 100 ms brez progress/loading stanja.

Te številke so cilji za profiliranje, ne avtomatsko zagotovljene konstante.

## 10. Splošni edge cases

- prazen import in pokvarjen JSON;
- duplicate `videoId` — zadnji zapis še naprej zmaga kot danes;
- manjkajoč kanal ali `channelUrl`;
- isto prikazno ime za dva različna channel URL-ja;
- spremenjeno channel ime pri istem URL-ju;
- neznano trajanje;
- neprepoznana ali lokalizirana `uploaded` vrednost;
- prihodnji datum zaradi napačnega metadata;
- unavailable/private/deleted video;
- odločitev brez videa v trenutnem importu;
- `archive` iz starega decision importa;
- import starega workspacea brez novih extensionov;
- quota failure pri baseline/history write;
- route z neobstoječim kanalom ali zastarelim video ID-jem;
- filtered scope brez rezultatov;
- celica z watch time `0`, ker so vsa trajanja neznana — razlikuj od dejanskih 0 sekund;
- kanal z enim videom;
- zelo veliko kanalov z malo videi;
- 100% undecided ali 0% undecided;
- odločitev se spremeni med odprtim Insights detail panelom;
- keyboard shortcut ne sme delovati med tipkanjem, v selectu ali odprtem meniju/dialogu;
- color-blind uporabnik: status in heatmap ne smeta biti razpoznavna samo po barvi.

## 11. Acceptance criteria

### Informacijska arhitektura

- Faza 0 iz `html-refactor-plan.md` je zaključena; feature spremembe živijo v `docs/` assetih in modulih, ne v starem korenskem monolitu.
- Triage, Channel Insights in Series & Groups so ločeni pogledi z deljenim datasetom.
- Hash routing deluje lokalno in na GitHub Pages.
- Refresh/deep link ne povzroči 404 in veljaven hash odpre pravilen pogled.
- Browser Back/Forward ohranja pričakovano navigacijo in insight selection.

### Triage

- Pred prvim videom ni več obeh velikih dashboard accordionov.
- Primarni Import JSON in Export keep/maybe ostaneta neposredno dosegljiva.
- Vse obstoječe import/export/workspace/decision akcije ostanejo dosegljive v smiselnih menijih.
- Video vrstica jasno pokaže zahtevana metadata polja in odločitev z bistveno manjšo višino.
- Keep/Maybe/Delete so neposredni; Reset, Tags/note in Open so v overflowu; Preview je neposreden ali en keyboard korak.
- Obstoječi `/`, `p`, `k`, `m`, `d`, `j`, `J`/puščice ostanejo funkcionalni.
- Bulk scope še naprej jasno razlikuje selected od visible.

### Channel Insights

- Matrix vsebuje vseh šest age bucketov in po potrebi `Unknown`.
- Toggle count/watch time spremeni vrednosti in legend brez ponovnega importa.
- Coverage za starost in trajanje je viden.
- Klik celice odpre Triage s pravim kanalom in age bucketom.
- Channel detail pokaže status mix, total time, povprečno približno starost, oldest untouched in new-since-last-import.
- Persistence blok se ne pretvarja, da ima zgodovino: pred vsaj dvema snapshotoma pokaže jasen empty state.
- “Decision quality” je označen kot proxy/health, ne kot objektivna ocena.
- Time budget statistika je odstranjena iz glavnega Triage in dosegljiva v Insights.

### Series & Groups

- Series auto grouping je vedno omejen na isti normalized channel.
- Zahtevani The Last of Us/TLOU primeri se združijo ob prisotnosti daljšega imena ali ročnega aliasa.
- Nizko-confidence pari ne sprožijo avtomatske skupinske odločitve.
- Manual merge/split preživi refresh, workspace export/import in nov dataset import.
- Group bulk akcije ohranijo undo snapshot in protected-channel opozorilo.

### Data safety

- Vsi obstoječi storage ključi in decision payloadi ostanejo berljivi.
- Stari workspace v1 se uvozi brez izgube obstoječih podatkov.
- Quota failure pri novi history shrambi ne prekine Watch Later importa.
- Nobena metrika ne zahteva backenda, API tokena ali LLM-a.

### Testi

- Obstoječa testa ostaneta zelena.
- Dodani so čisti testi za insight facts/agregacije, routing/filter bridge, age buckete, history normalizacijo, series parser/scoring in overrides.
- Dodan je sintetičen 5.000-video performance fixture brez osebnih podatkov.
- Ročni smoke test pokrije desktop, 980 px in 680 px breakpoint.

## 12. Phased implementation plan v vertikalnih rezih

### Glavni tracker

- [x] **Faza 0:** strukturni refaktor in stabilizacija.
- [ ] **Faza 1:** navigacija, Triage cleanup, akcijski meniji in dense video item.
- [ ] **Faza 2:** osnovni Channel Insights.
- [ ] **Faza 3:** series detection, group detail in manual merge/split.
- [ ] **Faza 4:** import history, backlog persistence, accessibility in performance.

Checkbox Faze se označi šele, ko so končani vsi njeni podrejeni checkboxi in izhodni kriteriji. Podrobni taski Faze 0 imajo en vir resnice v
[`../html-refactor-plan.md`](../html-refactor-plan.md); spodnji seznam je njen povzetek za sledenje celotnemu feature programu.

### Faza 0 — strukturni refaktor

- [x] **Podfaza 0.0 — baseline:** zamrznjeni scope, zeleni testi, neosebni fixture, workspace backup in ročni acceptance checklist.
- [x] **Podfaza 0.1 — testni rob:** testi niso več vezani na korenski inline `index.html` ali krhko zamenjavo `init()`.
- [x] **Podfaza 0.2 — Pages source:** aplikacija, ikona in obstoječi načrt so varno v `docs/`; Pages uporablja `main` + `/docs`.
- [x] **Podfaza 0.3 — CSS:** obstoječi CSS je mehansko prenesen v `docs/assets/css/app.css` in vizualno nespremenjen.
- [x] **Podfaza 0.4 — JavaScript:** obstoječi inline skript je mehansko prenesen v `docs/assets/js/app.js`.
- [x] **Podfaza 0.5 — domain moduli:** decisions, import comparison, filters, time budget, grouping in workspace imajo čiste testirane meje.
- [x] **Podfaza 0.6 — state/storage:** state, persistence in browser I/O so ločeni brez spremembe obstoječih ključev ali JSON shem.
- [x] **Podfaza 0.7 — UI moduli:** DOM, dialogs, dashboards in video list so ekstrahirani z nespremenjenim DOM contractom; avtomatski init/render in ciljni dinamični DOM testi so zeleni, ročni end-to-end smoke pa je združen s končnim preverjanjem v Podfazi 0.9.
- [x] **Podfaza 0.8 — bootstrap:** `app.js` je minimalen orkestrator brez krožnih odvisnosti in podvojenih helperjev.
- [x] **Podfaza 0.9 — stabilizacija:** avtomatski testi, workspace restore, lokalni zagon, responsive smoke test in produkcijski Pages URL so preverjeni; rezultati so v [`refactor-phase-0-stabilization.md`](refactor-phase-0-stabilization.md).
- [x] **Izhodni gate Faze 0:** vsi checkboxi v `html-refactor-plan.md` so zaključeni ali je morebitni zavestno odloženi task dokumentiran kot neblokirajoč; Feature Faza 1 ne spreminja več korenskega monolita.

Faza 0 ne vključuje nove navigacije, redesign-a vrstic, Insights metrike, novih storage ključev ali sprememb grouping algoritma. Njena naloga je ustvariti varno strukturo za te feature reze.

### Faza 1 — navigacija, Triage cleanup, akcijski meniji, dense video item

#### Slice 1.1 — View shell in hash navigacija

- [x] **Slice 1.1 zaključen**
- **Cilj:** uvesti tri view containere in delujoč `#triage/#insights/#groups`, pri čemer je samo Triage polno implementiran.
- **Prizadeto:** `docs/index.html`, novi `docs/assets/js/ui/navigation.js`, `state.js`, `app.js`.
- **Podatki:** doda se samo transient `activeView`; brez storage migracije.
- **UI:** tablist z aktivnim tabom; Insights/Groups lahko začasno pokažeta “Coming in Phase 2/3”.
- **Testi:** hash parser, neveljaven hash → Triage, unique DOM IDs, keyboard focus tabov.
- **Acceptance:** Back/Forward deluje; direktno odprt `#triage` deluje na `file://`.
- **Tveganja:** univerzalni `render()` lahko še vedno renderira skrite dashboarde; že v tem sliceu uvedi `renderActiveView()`.

#### Slice 1.2 — Import/Export/Workspace/Decisions meniji

- [x] **Slice 1.2 zaključen**
- **Cilj:** zmanjšati topbar clutter brez odstranitve funkcij.
- **Prizadeto:** `docs/index.html`, `app.css`, novi `ui/action-menus.js`, `ui/dom.js`, obstoječi browser I/O handlerji v `app.js`.
- **Podatki:** brez sprememb.
- **UI:** dva split gumba in dva menija; destructive “Clear decisions” ločeno.
- **Testi:** vsak menu item sproži isti handler; Escape in click-outside zapreta meni; tab order in ARIA.
- **Acceptance:** vseh 11 trenutnih akcij je dosegljivih; Import JSON in Export keep/maybe sta en klik stran.
- **Tveganja:** skriti file inputi in label klik morajo ostati browser-compatible.

#### Slice 1.3 — Compact filter in scope vrstica

- [x] **Slice 1.3 zaključen**
- **Cilj:** združiti primarne filtre in zmanjšati višino pred seznamom.
- **Prizadeto:** `docs/index.html`, `app.css`, `domain/filters.js`, novi `ui/triage-view.js`, prehodni `ui/dashboards.js`.
- **Podatki:** obstoječi `FilterState` ostane nespremenjen.
- **UI:** Search, Status, Channel, Sort, Filters count, Clear; tagi/saved views/advanced možnosti v panelu; import views v tanki drugi vrstici.
- **Testi:** obstoječi filter assertions + round-trip capture/apply + saved view.
- **Acceptance:** vsi sedanji filtri ostanejo dosegljivi; aktivni skriti filtri so vidni kot count/summary.
- **Tveganja:** uporabnik ne sme spregledati aktivnega advanced filtra.

#### Slice 1.4 — Dense video row

- [x] **Slice 1.4 zaključen**
- **Cilj:** zmanjšati višino vrstice in ohraniti vse informacije/akcije.
- **Prizadeto:** `app.css`, `ui/video-list.js`, `ui/dialogs.js` za overflow/preview/editor povezave.
- **Podatki:** brez sprememb.
- **UI:** K/M/D segmented controls, Preview kot ikona z dostopnim imenom in tooltipom, overflow; Reset/Tags/Open v overflowu; tags `+N`.
- **Testi:** DOM test za zahtevana polja in action labels; Preview `aria-label`; active status; overflow keyboard handling.
- **Acceptance:** na 1080p se prikaže občutno več vrstic kot danes; nobena zahtevana informacija ni izgubljena.
- **Tveganja:** preveč skrit Preview ali Open bi upočasnil triage; uporabniški smoke test potrdi prioritete.

#### Slice 1.5 — Keyboard-first polish

- [x] **Slice 1.5 zaključen**
- **Cilj:** ohraniti bližnjice in dodati discoverability.
- **Prizadeto:** `app.js`, `ui/video-list.js`, `ui/dialogs.js`, `ui/triage-view.js`.
- **Podatki:** brez sprememb.
- **UI:** `?` odpre cheat sheet; predlog dodatkov: `x` checkbox, `e` tags/note, `o` open, `r` reset, `Esc` zapre menu/dialog.
- **Testi:** shortcuti ne delujejo med tipkanjem; preview in row context; focus se po odločitvi premakne pravilno.
- **Acceptance:** obstoječe bližnjice so nespremenjene; dodatne nimajo konflikta z inputi.
- **Tveganja:** `r` in `o` morata biti izključena v tekstovnih poljih in dialogih.

#### Slice 1.6 — Odstranitev analitike in groups accordionov iz Triage

- [x] **Slice 1.6 zaključen**
- **Cilj:** dokončati namenski Triage.
- **Prizadeto:** `docs/index.html`, `ui/triage-view.js`, prehodni `ui/dashboards.js`, `app.js`.
- **Podatki:** brez izbrisa obstoječe domenske logike.
- **UI:** začasne povezave “Open Channel Insights” in “Open Series & Groups”; compact counts ostanejo.
- **Testi:** Triage ne renderira time/groups; domenske funkcije ostanejo testirane.
- **Acceptance:** prvi video sledi takoj za compact scope/bulk vrstico.
- **Tveganja:** funkcije ne smejo postati nedosegljive pred Fazama 2/3; zato slice pride po view shellu in placeholderjih.

#### Slice 1.7 — Verzioniran Watch Later export

- [x] **Slice 1.7 zaključen**
- **Cilj:** pred izračunom starostnih metrik uvesti kanonični userscript ovoj `{ schemaVersion, exportedAt, videos }`.
- **Prizadeto:** `youtube-watchlater-toolbox.user.js`, import normalizacija v `app.js` oziroma izločenem domenskem modulu, `tests/userscript-reconciliation.test.cjs`.
- **Podatki:** `schemaVersion: 1`, obvezen veljaven `exportedAt` v UTC in polje `videos`; golo polje ostane le toleriran vhod.
- **UI:** import summary pokaže čas izvoza, kadar je na voljo; za golo polje jasno uporabi čas importa.
- **Testi:** userscript output shape, veljaven timestamp, object/array normalizacija, neveljaven ovoj in starostni anchor.
- **Acceptance:** nov userscript vedno izvozi verzioniran objekt; Insights lahko pri vsakem novem izvozu uporabi stabilen časovni anchor.
- **Tveganja:** ročno urejen ali tuj JSON; validator mora napako razložiti brez delnega importa.

### Faza 2 — osnovni Channel Insights

#### Slice 2.1 — VideoFact in channel agregacije

- [x] **Slice 2.1 zaključen**
- **Cilj:** ustvariti en čist, testiran derived model.
- **Prizadeto:** novi `docs/assets/js/domain/insights.js`, `state.js`, testni loader.
- **Podatki:** samo derived cache, brez nove persistence.
- **UI:** še brez končnega grafa; debug/empty model samo v testih.
- **Testi:** channel key fallback, šest bucketov + unknown, duration/age coverage, status counts.
- **Acceptance:** agregati za fixture se ujemajo z ročno pričakovanimi vsotami.
- **Tveganja:** relativna starost; uporabi import anchor in approximate label.

#### Slice 2.2 — Insights shell in KPI kartice

- [x] **Slice 2.2 zaključen**
- **Cilj:** prikazati channel/video/time/undecided/oldest/coverage povzetek.
- **Prizadeto:** `docs/index.html`, `app.css`, novi `ui/insights-view.js`, `ui/navigation.js`, `state.js`.
- **Podatki:** memoized InsightsModel z `datasetRevision` in `decisionRevision`.
- **UI:** compact KPI kartice in last-import context.
- **Testi:** empty import, neznana trajanja, vse undecided, odločitev posodobi samo decision-dependent KPI.
- **Acceptance:** KPI ne prikazujejo zavajajoče ničle za neznane podatke.
- **Tveganja:** preveč kartic; coverage je lahko inline indikator namesto sedme kartice.

#### Slice 2.3 — Channel × age heatmap

- [x] **Slice 2.3 zaključen**
- **Cilj:** glavni count/watch-time matrix.
- **Prizadeto:** `domain/insights.js`, `ui/insights-view.js`, `app.css`, `state.js`.
- **Podatki:** transient `insightsMeasure`, `insightsSort`, `selectedChannelKey`.
- **UI:** semantic table, sticky headers, global/per-channel scale, privzeto top 100 po backlog countu in eksplicitni `Show all`; search vedno preišče vse kanale.
- **Testi:** cell vrednosti, totals, sort, unknown stolpec, watch-time coverage, top-100 meja, `Show all` in search čez kanale zunaj prvih 100.
- **Acceptance:** 5.000-video fixture se odpre znotraj performance cilja; tabela je uporabna brez barv.
- **Tveganja:** zelo velik DOM in nečitljiva barvna skala.

#### Slice 2.4 — Channel detail in podporni bloki

- [x] **Slice 2.4 zaključen**
- **Cilj:** dodati Backlog impact, Decision health, Age distribution, Oldest untouched in New since last import.
- **Prizadeto:** `domain/insights.js`, `domain/time-budget.js`, `ui/insights-view.js`, `app.css`.
- **Podatki:** `watchlater-triage-insights-settings-v1` za `decisionStaleDays`; persistence blok import zgodovine je empty state.
- **UI:** desni panel/odzivni drawer; grafi so preprosti CSS bars/donut le, če dostopni; Decision health omogoča nastavitev stale praga ali `Off`.
- **Testi:** izbran kanal, manjkajoč kanal po importu, status mix denominator, oldest untouched, stale prag na meji, sprememba praga in `Off`.
- **Acceptance:** noben blok ne uporablja nedostopnih subscription/watch-history podatkov.
- **Tveganja:** “quality” poimenovanje; uporabi proxy razlago.

#### Slice 2.5 — Insights → Triage filter bridge

- [x] **Slice 2.5 zaključen**
- **Cilj:** klik matrix celice ali `View videos` odpre pravilen Triage scope.
- **Prizadeto:** `domain/filters.js`, `ui/navigation.js`, `ui/insights-view.js`, `ui/triage-view.js`, `app.js`.
- **Podatki:** obstoječi FilterState; channel key se pretvori v trenutno display ime/ime filtra.
- **UI:** cell/button ima tooltip in fokus stanje; Triage pokaže aktivne filters.
- **Testi:** vseh šest bucketov se pretvori v prave min/max days; Back povrne izbor.
- **Acceptance:** klik `6–12m` ne vključuje 1y+ videov in ne izgubi drugih eksplicitnih insight filtrov.
- **Tveganja:** current filter uporablja channel display string, Insights canonical key; potreben je enoten resolver.

#### Slice 2.6 — Selitev time budget workflowa

- [ ] **Slice 2.6 zaključen**
- **Cilj:** analytics in shortlist prestaviti iz Triage v Insights.
- **Prizadeto:** `domain/time-budget.js`, `ui/insights-view.js`, `ui/triage-view.js`, prehodni `ui/dashboards.js`.
- **Podatki:** obstoječi time budget key ostane isti.
- **UI:** total/protected time, weeks, by status/channel/tag; `Open shortlist in Triage`.
- **Testi:** obstoječi time-budget testi + filter bridge/selection.
- **Acceptance:** shortlist odpre/selecta iste videe kot prejšnja logika; Triage nima velikega dashboarda.
- **Tveganja:** shortlist je lahko odvisen od Triage filtrov; UI mora jasno povedati, ali uporablja All videos ali current Insights scope. Priporočilo: default All, z eksplicitnim “Use current Insights filters”.

### Faza 3 — series detection, group detail, merge/split

#### Slice 3.1 — Novi parser naslovov

- [ ] **Slice 3.1 zaključen**
- **Cilj:** robustna normalizacija, wrapper removal in season/episode extraction.
- **Prizadeto:** `domain/grouping.js`, grouping fixtures in testi.
- **Podatki:** nov `ParsedSeriesTitle`, še brez storage.
- **UI:** test-only ali debug reason string.
- **Testi:** vse zahtevane oblike, finale/special, range, letnice, 4K, movie Part.
- **Acceptance:** parser ne spremeni video/decision podatkov in vrne razložljiv rezultat.
- **Tveganja:** agresivno odstranjevanje besed; generic terms naj bodo konfigurirani in testirani.

#### Slice 3.2 — Candidate index, scoring in constrained clustering

- [ ] **Slice 3.2 zaključen**
- **Cilj:** povezati neenake base naslove istega kanala s confidence scoreom.
- **Prizadeto:** `domain/grouping.js`, `state.js` cache/revision state, grouping performance testi.
- **Podatki:** derived groups z `confidence`, `reasons`, `reviewRequired`.
- **UI:** še brez bulk auto akcije za review confidence.
- **Testi:** TLOU initialism, podobne različne serije, transitive bridge, isti naslov drug kanal.
- **Acceptance:** series merge nikoli ne prečka kanala; performance fixture nima polnega O(n²).
- **Tveganja:** pragovi; kalibracija na sintetičnih fixtures in ročnem lokalnem smoke testu.

#### Slice 3.3 — Series & Groups pogled

- [ ] **Slice 3.3 zaključen**
- **Cilj:** ločen groups browser in detail.
- **Prizadeto:** `docs/index.html`, `app.css`, novi `ui/groups-view.js`, `ui/navigation.js`, prehodni `ui/dashboards.js`.
- **Podatki:** transient group filters in selection.
- **UI:** group summary list, detail člani, parsed S/E, confidence reasons.
- **Testi:** filtri, selection, empty state, deep link iz Triage.
- **Acceptance:** uporabnik lahko pregleda vse člane brez obremenitve glavnega seznama.
- **Tveganja:** preveč informacij; detail se odpre šele ob izboru.

#### Slice 3.4 — Skupinske odločitve in undo

- [ ] **Slice 3.4 zaključen**
- **Cilj:** prenesti obstoječe group bulk akcije brez varnostne regresije.
- **Prizadeto:** `ui/groups-view.js`, `domain/decisions.js`, `domain/grouping.js`, `storage.js`, `app.js`.
- **Podatki:** obstoječi decisions/history shemi.
- **UI:** Keep/Maybe/Delete all, keep newest/most viewed, Select/open in Triage.
- **Testi:** snapshot restore, protected warning, no-op group, unknown age/views winner.
- **Acceptance:** vsaka več-videoska sprememba ima undo snapshot.
- **Tveganja:** low-confidence skupina; bulk gumbi so disabled, dokler uporabnik ne potrdi/uredi skupine.

#### Slice 3.5 — Manual aliases, merge in split

- [ ] **Slice 3.5 zaključen**
- **Cilj:** uporabniku dati popravek napačnih detekcij.
- **Prizadeto:** `domain/grouping.js`, `domain/workspace.js`, `storage.js`, `state.js`, `ui/groups-view.js`, `ui/dialogs.js`.
- **Podatki:** `watchlater-triage-grouping-overrides-v1`.
- **UI:** Edit alias, merge selected groups, split selected members, remove override.
- **Testi:** normalize/round-trip, orphaned IDs, cross-channel merge zavrnjen, import/export workspace.
- **Acceptance:** popravek preživi refresh in nov import; mogoče ga je razveljaviti/odstraniti.
- **Tveganja:** override lahko postane zastarel; pokaži orphaned/stale oznako.

### Faza 4 — import history, persistence, accessibility in performance

#### Slice 4.1 — Kompaktni import snapshoti

- [ ] **Slice 4.1 zaključen**
- **Cilj:** po uspešnem importu zapisati minimalen zgodovinski snapshot.
- **Prizadeto:** novi `domain/import-history.js`, `domain/import-comparison.js`, `domain/workspace.js`, `storage.js`, `state.js`, import orchestration v `app.js`.
- **Podatki:** `watchlater-triage-import-history-v1`; zgodovina se začne s prvim končnim importom.
- **UI:** nastavitev/tekst `History: 2/6 imports`, clear history z typed confirmom.
- **Testi:** append/dedupe/cap, prazen začetni history, quota failure, corrupt JSON.
- **Acceptance:** import uspe tudi, ko history write odpove; največ 6 default snapshotov.
- **Tveganja:** storage quota in podvojeni import iste datoteke; snapshot ID naj kombinira source metadata in dataset fingerprint.

#### Slice 4.2 — Backlog persistence in trendi

- [ ] **Slice 4.2 zaključen**
- **Cilj:** aktivirati persistence bloke šele z dovolj zgodovine.
- **Prizadeto:** `domain/import-history.js`, `domain/insights.js`, `ui/insights-view.js`.
- **Podatki:** bere kompaktne snapshote.
- **UI:** present in last N imports, survival rate trenutnih videov, new/removed po importu, trend count/watch time kjer je duration znan.
- **Testi:** 1/2/6 snapshotov, kanal rename, odstranjen video, unknown duration.
- **Acceptance:** denominator in časovni interval sta vedno prikazana; empty state pred dvema snapshotoma.
- **Tveganja:** importi niso nujno enakomerno časovno razmaknjeni; graf uporablja dejanske datume, ne “tedenske” predpostavke.

#### Slice 4.3 — Workspace history round-trip

- [ ] **Slice 4.3 zaključen**
- **Cilj:** prenos nove zgodovine in overrides brez izgube starih workspace podatkov.
- **Prizadeto:** `domain/workspace.js`, `domain/import-history.js`, `domain/grouping.js`, `storage.js`, workspace I/O v `app.js`.
- **Podatki:** opcijski `workspace.extensions.channelInsights`.
- **UI:** import preview pokaže snapshot/override counts.
- **Testi:** stari v1, novi v1+extension, invalid extension, old-fields preservation.
- **Acceptance:** stari workspace se uvozi; novi se semantično enako izvozi/uvozi.
- **Tveganja:** star build extension izgubi ob re-exportu; dokumentiraj.

#### Slice 4.4 — Performance stabilizacija

- [ ] **Slice 4.4 zaključen**
- **Cilj:** doseči odziven Triage in Insights pri 5.000+ videih.
- **Prizadeto:** `state.js`, `app.js`, `ui/video-list.js`, `ui/insights-view.js`, `ui/groups-view.js`, relevantni domain moduli.
- **Podatki:** transient revision counters.
- **UI:** loading/progress samo pri merljivo počasnih analizah.
- **Testi:** sintetični 5.000-video benchmark/smoke fixture; preverjanje števila recomputov.
- **Acceptance:** ciljni odzivni budgeti iz poglavja 9; `k/m/d` ne preračuna groups.
- **Tveganja:** mikro-optimizacije brez meritev; pred/po profile.

#### Slice 4.5 — Accessibility in responsive polishing

- [ ] **Slice 4.5 zaključen**
- **Cilj:** dokončati keyboard, screen-reader in mobilno uporabo.
- **Prizadeto:** `app.css`, `docs/index.html`, `ui/navigation.js`, `ui/action-menus.js`, `ui/triage-view.js`, `ui/insights-view.js`, `ui/groups-view.js`, `ui/dialogs.js`.
- **Podatki:** brez sprememb.
- **UI:** ARIA tablist/menu/table, focus trap v drawerjih, skip links, visible focus, non-color labels.
- **Testi:** keyboard-only smoke, 200% zoom, 680/980 px, reduced motion, contrast.
- **Acceptance:** vse akcije so dosegljive brez miške; matrika je razumljiva kot tabela.
- **Tveganja:** custom menu semantics; če so problematični, uporabi native `<details>`/`button` vzorec.

## Priporočen vrstni red commitov

Pred feature commiti se izvedejo vsi majhni `test/chore/refactor/docs` rezi iz
[`html-refactor-plan.md`](../html-refactor-plan.md), v tam navedenem vrstnem redu.
Šele po stabilizacijskem commitu Podfaze 0.9 sledijo:

1. `feat: add static triage view navigation`
2. `feat: group triage import and export actions`
3. `feat: compact triage filters and video rows`
4. `refactor: isolate active-view rendering`
5. `feat: version Watch Later exports with export time`
6. `feat: derive channel insight aggregates`
7. `feat: add channel age matrix and detail`
8. `feat: link channel insights to triage filters`
9. `feat: move time budget workflow to insights`
10. `feat: improve local series parsing and scoring`
11. `feat: add series groups view and safe bulk actions`
12. `feat: persist manual grouping overrides`
13. `feat: retain compact import history`
14. `feat: add backlog persistence insights`
15. `perf: cache large triage and insight derivations`
16. `a11y: polish navigation matrices and dialogs`

Vsak commit mora ohraniti uspešna obstoječa testa in imeti lasten majhen acceptance checklist.

## Odprta vprašanja in priporočeni defaulti

Repo koda že razreši večino vprašanj:

- **Route ali tab?** Hash-routed tab v isti statični aplikaciji.
- **Series kot ločen pogled?** Da.
- **Default heatmap measure?** Count; watch time kot toggle.
- **Klik kanala?** Izbere detail; klik celice ali `View videos` odpre filtriran Triage.
- **Kaj pomeni Delete candidates?** V običajnem UI toku `unreviewed + delete`; trenutna implementacija zaradi pravila “vse razen keep/maybe” vključuje tudi morebiten uvožen `archive`. To neskladje naj ostane vidno in se razreši v ločenem, testiranem product rezu.
- **Koliko import zgodovine?** 6 snapshotov privzeto, 12 kot trd največji cap.
- **Ali se časovni shortlist preseli?** Da, v Insights, z akcijo nazaj v Triage.
- **Ali potrebujemo API/LLM?** Ne.

Uporabniške produktne odločitve so zaključene:

1. `Preview` je ikona z vidnim tooltipom in dostopnim imenom za screen reader.
2. Insights privzeto prikaže top 100 kanalov po backlog countu; `Show all` razširi seznam, search pa vedno preišče vse kanale.
3. `Decision health` vključuje nastavljiv stale prag, privzeto 180 dni, z možnostjo `Off`.
4. Kanonični userscript izvoz je verzioniran objekt `{ schemaVersion, exportedAt, videos }`; aplikacija ga uporablja kot zanesljivo časovno sidro relativnih starosti.

## Definition of done celotnega redesign-a

Redesign je končan, ko je Faza 0 stabilno zaključena, glavni Triage ponovno hiter in namenski, Channel Insights transparentno pokaže samo izpeljive podatke, Series & Groups omogoča varno množično delo z razložljivim confidenceom, končne podatkovne in izvozne sheme so verzionirane in testirane, ter aplikacija še naprej deluje kot popolnoma statična stran brez API-ja ali backenda.
