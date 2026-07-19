# Predlogi novih featurejev za YouTube Watch Later Toolbox

## Kratek povzetek trenutnega produkta

Projekt je trenutno sestavljen iz dveh povezanih delov:

- **YouTube userscript** naloži vse videe, izvozi CSV/JSON ter na podlagi uvoženega triage JSON-a vizualno označi videe in izdela dry-run poročilo.
- **Lokalna triage aplikacija** uvozi JSON, omogoča iskanje, filtre, sortiranje, statuse `keep` / `maybe` / `delete`, bulk akcije, izbor videov, predlagane tage ter več vrst izvoza. Odločitve je mogoče tudi ročno prenesti med napravami z `Export decisions` / `Import decisions`.

Osnovni proces odločanja je zato že dobro pokrit. Največ priložnosti je v zaključku cleanup procesa, varovanju uporabnikovih odločitev in hitrejšem delu z vedno novimi izvozi.

## Kaj že pokrivata zadnja dva komita

Komita `a2b934c` in `3f104b2` sta dodala načrt ter implementacijo ročnega synca odločitev:

- izvoz decision-only JSON-a iz `localStorage`;
- ponovni uvoz odločitev in merge po `videoId`;
- preview števila novih, posodobljenih, preskočenih in konfliktnih zapisov;
- pri konfliktu zmaga odločitev z novejšim `updatedAt`;
- prenašajo se status, tagi, opomba in čas spremembe.

Zato navaden **backup/restore odločitev ni več predlog za nov feature**. Spodaj je nadomeščen s širšim workspace snapshotom, zgodovino in undo funkcijo. Prav tako se odločitve po `videoId` že ohranijo ob naslednjem video importu; pri predlogu za inkrementalni import manjkata predvsem primerjava datasetov in namenski Inbox pogled.

## Predlagane prioritete

| Prioriteta | Feature | Uporabniška vrednost | Zahtevnost |
|---|---|---:|---:|
| P0 | Varna izvedba brisanja na YouTubu | Zelo visoka | Visoka |
| P0 | Preverjanje in uskladitev po izvedbi | Zelo visoka | Srednja |
| P1 | Inkrementalni import in primerjava izvozov | Visoka | Srednja |
| P1 | Workspace snapshot, zgodovina in undo | Visoka | Srednja |
| P1 | Urejanje tagov, pravil in opomb | Visoka | Srednja |
| P1 | Napredni filtri in shranjeni pogledi | Visoka | Srednja |
| P1 | Pravila na nivoju kanala | Visoka | Srednja |
| P2 | Premik v tematske playliste | Srednja do visoka | Visoka |
| P2 | Časovni proračun in statistika | Srednja | Srednja |
| P2 | Gručenje serij in podobnih videov | Srednja | Srednja |
| P3 | Vgrajen hitri ogled med triageom | Srednja | Srednja |
| P3 | Način “odloči se namesto mene” | Srednja | Nizka |

## P0: zaključek varnega cleanup procesa

- [x] 1. Varna izvedba brisanja na YouTubu
- [x] 2. Preverjanje in uskladitev po izvedbi
- [x] 3. Workspace snapshot, zgodovina in undo

### 1. Varna izvedba brisanja na YouTubu

Userscript trenutno zna uvožene odločitve prikazati kot predogled, nima pa izvedbenega koraka. Smiselna naslednja funkcija je **Execute delete candidates**.

Predlagan tok:

1. uporabnik naloži vse videe;
2. uvozi `keep/maybe` ali scoped triage JSON;
3. pregleda dry run in seznam kandidatov;
4. toolbox samodejno izvozi backup in execution plan;
5. uporabnik potrdi točno število videov za odstranitev;
6. userscript odstranjuje samo potrjene video ID-je;
7. med delom ponuja `Pause`, `Resume` in `Stop`;
8. na koncu izvozi poročilo o uspehih, napakah in preskočenih videih.

Pomemben del produkta naj bo jasna izbira načina:

- **Delete explicit**: odstrani samo videe s statusom `delete` iz scoped izvoza;
- **Delete everything not protected**: odstrani vse, kar ni v uvoženem `keep/maybe` seznamu;
- **Retry failures only**: ponovno poskusi samo neuspele elemente iz prejšnjega execution reporta.

Za velike sezname bi bili koristni nastavljiv zamik med akcijami, pavza po vsakih N videih in nadaljevanje po osvežitvi strani.

### 2. Preverjanje in uskladitev po izvedbi

Po brisanju naj userscript ponovno prebere playlisto in primerja dejansko stanje z načrtom. Uporabnik mora dobiti odgovore na tri vprašanja:

- kateri kandidati so bili res odstranjeni;
- kateri so ostali in potrebujejo ponoven poskus;
- ali je bil pomotoma odstranjen oziroma izgubljen kateri od zaščitenih videov.

Rezultat naj bo `watchlater_reconciliation_YYYY-MM-DD.json`, ki ga je mogoče ponovno uvoziti za nadaljevanje. To bistveno poveča zaupanje v bulk akcije in prepreči ročno preverjanje dolge playliste.

### 3. Workspace snapshot, zgodovina in undo

Ročni export/import samih odločitev je po zadnjem komitu že implementiran. Naslednja razširitev naj pokrije celotno delovno sejo:

- **Export workspace**: odločitve, trenutno uvoženi video dataset, ročni tagi, opombe, uporabniška pravila, shranjeni pogledi in podatki o zadnjem importu;
- **Import workspace**: nadaljevanje dela v drugem brskalniku brez ponovnega YouTube izvoza;
- avtomatski lokalni snapshot pred bulk spremembo ali brisanjem odločitev;
- zgodovina zadnjih sprememb z opisom, na primer “42 visible → delete”;
- **Undo last bulk change** oziroma obnova iz izbranega snapshota.

Obstoječi decision-only JSON naj ostane lahek format za sync, workspace snapshot pa ločen format za popolno obnovo seje.

## P1: hitrejši ponavljajoči se triage

- [x] 4. Inkrementalni import in primerjava izvozov
- [x] 5. Urejanje tagov, pravil in opomb
- [x] 6. Napredni filtri in shranjeni pogledi
- [ ] 7. Pravila na nivoju kanala

### 4. Inkrementalni import in primerjava izvozov

Odločitve se po `videoId` že ohranijo med importi. Ob novem JSON izvozu naj aplikacija dodatno izračuna in prikaže razliko glede na prejšnji video dataset:

- **New since last import**;
- videi, ki jih ni več v Watch Later;
- videi z že obstoječo odločitvijo;
- videi, katerih metadata se je spremenila;
- možni orphaned decisions.

S tem bi naslednji cleanup obravnaval samo nove videe, stare odločitve pa bi ostale uporabne. Dodaten pogled **Inbox** bi lahko vseboval samo nove in še nepregledane videe.

### 5. Urejanje tagov, pravil in opomb

Aplikacija že predlaga tage iz vgrajenih pravil, vendar bi bilo uporabno omogočiti:

- dodajanje in odstranjevanje ročnih tagov na posameznem videu;
- kratko opombo, na primer “poglej pred dopustom”;
- urejanje keyword pravil neposredno v UI-ju;
- pozitivne in negativne ključne besede;
- pravila, ki veljajo samo za določen kanal;
- export/import pravil skupaj z razširjenim workspace snapshotom.

Decision sync iz zadnjega komita že zna prenašati polji `tags` in `note`, zato bi ta feature predvsem dodal manjkajoči UI za njuno urejanje ter UI za upravljanje pravil.

Predlagani tag naj ostane ločen od potrjenega uporabniškega taga, da je jasno, kaj je predlagal sistem in kaj je potrdil uporabnik.

### 6. Napredni filtri in shranjeni pogledi

Poleg trenutnih filtrov bi največ vrednosti prinesli:

- minimalno in maksimalno trajanje;
- približna starost objave;
- minimalno število ogledov;
- `isUnavailable` in posebni YouTube badge-i;
- ima/nima predlaganega taga;
- ima/nima ročne opombe;
- več tagov z logiko `AND` ali `OR`;
- kombinacija več kanalov.

Kombinacijo filtrov naj bo mogoče shraniti kot pogled, na primer:

- “kratki videi pod 10 minut”;
- “dolgi podcasti za maybe”;
- “nedostopni videi za delete”;
- “novi dev videi brez odločitve”.

### 7. Pravila na nivoju kanala

Pri velikih Watch Later seznamih se odločitve pogosto ponavljajo po kanalih. Uporabnik bi lahko določil:

- privzeti status za nove videe iz kanala;
- privzeti tag;
- “vedno obdrži” oziroma “vedno pošlji v review”;
- opozorilo, če bulk delete vsebuje video iz zaščitenega kanala.

Pravila naj bodo transparentna in reverzibilna: aplikacija naj pokaže, koliko videov bo pravilo zadelo, preden ga uporabi.

## P2: organizacija in odločanje

- [ ] 8. Premik ali kopiranje v tematske playliste
- [ ] 9. Časovni proračun in statistika
- [ ] 10. Gručenje serij in podobnih videov

### 8. Premik ali kopiranje v tematske playliste

Namesto binarne izbire obdrži/izbriši bi aplikacija lahko podprla ciljno playlisto, na primer `Dev`, `Movies`, `Music` ali `Long form`.

Možen tok:

1. v triage aplikaciji videu ali bulk izboru določiš cilj;
2. izvoziš playlist routing plan;
3. userscript video doda v ciljno playlisto;
4. po potrjenem uspehu ga po želji odstrani iz Watch Later;
5. poročilo ločeno zabeleži uspešno kopirane, odstranjene in neuspele videe.

Zaradi varnosti naj bo privzeta akcija **copy**, “move” pa šele ločen potrjen korak.

### 9. Časovni proračun in statistika

Ker export že vsebuje trajanje, lahko aplikacija pokaže:

- skupni čas vseh videov ter čas po statusih, kanalih in tagih;
- koliko ur Watch Later vsebine ostane po načrtovanem cleanupu;
- koliko videov se prilega proračunu, na primer 2 uri na teden;
- predlog kratkega seznama glede na razpoložljivi čas;
- napredek “pregledano 73 %, odločeno 41 ur od 96 ur”.

To uporabniku pomaga odločati glede na dejanski časovni strošek, ne samo glede na število videov.

### 10. Gručenje serij in podobnih videov

Naslove je mogoče lokalno združevati v skupine brez zunanjega API-ja:

- epizode iste serije;
- več videov z zelo podobnim naslovom;
- videi istega kanala z enakim naslovnim vzorcem;
- verjetni dvojniki ali ponovno naložene vsebine.

Uporabnik bi nato lahko označil celotno skupino ali izbral “obdrži samo najnovejšega / najbolj gledanega”. Pred izvedbo mora vedno videti člane skupine.

## P3: udobje pri vsakodnevni uporabi

- [ ] 11. Vgrajen hitri ogled med triageom
- [ ] 12. Način “odloči se namesto mene”

### 11. Vgrajen hitri ogled med triageom

Na vrstici videa bi se lahko odprl preview panel z embed predvajalnikom, večjo sličico in osnovnimi podatki. Pomembni dodatki:

- predvajanje brez zapuščanja trenutnega filtra in pozicije;
- gumbi `Keep`, `Maybe`, `Delete` ob predvajalniku;
- zapomnjen timestamp;
- možnost “odloči po 30 sekundah ogleda”.

To bi zmanjšalo stalno odpiranje novih zavihkov, predvsem pri nejasnih naslovih.

### 12. Način “odloči se namesto mene”

Za utrujenost pri velikem seznamu naj aplikacija ponudi fokusiran način:

- naključen nepregledan video;
- najstarejši nepregledan video;
- najdaljši video brez odločitve;
- 10 naključnih videov iz izbranega taga ali kanala;
- dnevni cilj, na primer “odloči 25 videov”.

Po vsaki odločitvi se samodejno prikaže naslednji video, na koncu seje pa kratek povzetek opravljenega dela.

## Priporočen vrstni red izvedbe

1. **Varna izvedba explicit delete seznama** s pause/resume in execution reportom.
2. **Post-run reconciliation** ter retry samo neuspelih elementov.
3. **Workspace snapshot**, zgodovina in undo zadnje bulk spremembe.
4. **Inkrementalni import** z Inbox pogledom za nove videe.
5. **Ročni tagi, opombe in urejanje pravil**.
6. **Napredni filtri in shranjeni pogledi**.
7. **Pravila po kanalih**.
8. Nato po potrebi playlist routing, časovna statistika in gručenje podobnih videov.

Prvi dve točki zaključita osnovno obljubo produkta: izvoziti Watch Later, varno sprejeti odločitve, te odločitve izvesti in dokazljivo preveriti rezultat. Naslednje funkcije varujejo opravljeno delo in skrajšujejo čas vsakega prihodnjega cleanup cikla.
