# Watch Later Triage Tool Spec

## Namen

Lokalna aplikacija je vir resnice za cleanup odlocitve. YouTube/Tampermonkey userscript je samo export/import/executor plast.

Primarni cilj:

- izvoziti cel Watch Later seznam v JSON;
- lokalno oznaciti, kaj ostane;
- nazaj v userscript importati `keep/maybe` seznam;
- na YouTubu varno izbrisati vse, kar ni zasciteno.

## Glavni model odlocanja

Privzeti status vsakega videa po importu je `unreviewed`.

Statusi:

- `unreviewed`: privzet status; pri finalnem cleanupu je delete candidate;
- `keep`: video ostane v Watch Later;
- `maybe`: zasciten pred brisanjem, namenjen kasnejsemu reviewu;
- `delete`: eksplicitno oznacen delete candidate;
- `archive`: ni del MVP, kasneje lahko pomeni "shrani v arhiv, lahko odstranis iz Watch Later".

Delete logika:

```text
protected = keep + maybe
delete candidates = unreviewed + delete
```

`maybe` je vedno zasciten pred brisanjem.

## Lokalna aplikacija

### Tehnologija

MVP naj bo cim manj bloated:

- ena lokalna `index.html` datoteka;
- vanilla JavaScript;
- brez npm;
- brez build procesa;
- brez backend baze;
- brez API servisov;
- `localStorage` samo za uporabnikove odlocitve.

### Vir resnice

Lokalna aplikacija hrani odlocitve po `videoId`.

Imported JSON ni primarni persistent state. Ob importu je samo trenutni dataset v memoryju.

Minimalni `localStorage` model:

```json
{
  "S5wgoGWgdDw": {
    "status": "keep",
    "tags": ["marvel", "reaction"],
    "note": "",
    "updatedAt": "2026-06-01T16:20:00.000Z"
  }
}
```

Notes field je lahko v modelu, ampak notes UI ni del MVP.

### Orphaned decisions

Ce odlocitev obstaja v `localStorage`, video pa ni v trenutnem importu:

- odlocitev se ne izbrise avtomatsko;
- video se ne prikazuje v glavnem seznamu;
- kasneje se lahko doda maintenance panel za orphaned decisions.

### Import

MVP podpira en JSON import naenkrat.

Interno naj app deduplicira po `videoId`, da je model pripravljen na kasnejsi multi-import.

### UI

MVP je bulk-first, ne card-by-card-first.

Privzeti pogled:

- list view;
- thumbnail;
- title;
- channel;
- views;
- uploaded;
- duration;
- suggested tags;
- status controls;
- open link.

Embedded YouTube player ni del MVP. `embedUrl` ostane v JSON-u za kasneje.

### Search in filtri

MVP uporablja:

- simple text search po `searchText`;
- tag filtre;
- channel filter;
- status filter;
- selected/visible bulk akcije.

Ni query jezika v MVP. Brez `OR`, `AND`, negacije.

### Suggested tags

Keyword rules samo predlagajo tage. Ne nastavljajo statusa `keep` avtomatsko.

Rules so hardcoded v JS za MVP.

Primer:

```js
const RULES = {
  marvel: ["marvel", "mcu", "daredevil", "punisher", "spider-noir", "captain america", "black panther"],
  starWars: ["star wars", "clone wars", "maul", "ahsoka", "andor", "kenobi"],
  dragonBall: ["dragon ball", "dbz", "dbs", "goku", "vegeta"],
  reactions: ["reaction", "reacts", "first time watching", "group reaction"],
  dev: ["javascript", "typescript", "ai", "openai", "google developers", "unreal engine"]
};
```

### Bulk actions

App podpira checkbox selection.

Pravilo:

```text
ce je selectedCount > 0:
  bulk action deluje na selected
drugace:
  bulk action deluje na visible results
```

UI mora jasno pokazati, ali akcija deluje na selected ali visible.

Koristne akcije:

- `Keep selected/visible`;
- `Maybe selected/visible`;
- `Delete selected/visible`;
- `Clear selected`;
- `Invert selection`.

Channel bulk actions so dovoljene, na primer `Keep visible from this channel`.

Permanent channel auto-keep ni del MVP.

### Keyboard shortcuts

MVP podpira samo osnovne shortcut-e:

- `/`: focus search;
- `k`: mark current selected video as keep;
- `m`: mark current selected video as maybe;
- `d`: mark current selected video as delete.

Keyboard shortcuts delujejo na current/selected video, ne na vse visible rezultate.

Bulk akcije morajo biti eksplicitni UI gumbi.

## Export iz lokalne aplikacije

Primarni export za userscript je `keep/maybe`, ne delete list.

Priporocen format:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-06-01T16:45:00.000Z",
  "source": "youtube-watchlater-triage",
  "mode": "keep-list",
  "keep": [
    {
      "videoId": "S5wgoGWgdDw",
      "status": "keep",
      "tags": ["marvel", "reaction"],
      "title": "A DOUBLE CROSS!!! Spider-Noir...",
      "channel": "The Normies",
      "cleanUrl": "https://www.youtube.com/watch?v=S5wgoGWgdDw",
      "durationSeconds": 3152
    }
  ],
  "maybe": []
}
```

Userscript za logiko uporablja samo `videoId`.

Title/channel/url/tag podatki so v exportu zaradi debugiranja, dry-runa in cloveku berljivega arhiva.

Sekundarni exporti:

- `watchlater_delete_candidates_YYYY-MM-DD.json`;
- `watchlater_tagged_all_YYYY-MM-DD.json`;
- `delete-urls.txt`;
- `watchlater-report.md`.

## Tampermonkey userscript flow

### Import keep/maybe

Userscript importira `keep/maybe` export iz lokalne aplikacije.

Po importu ne brise nic.

Najprej naredi dry-run/preview:

```text
Loaded videos: 4700
Protected keep: 620
Protected maybe: 180
Delete candidates: 3900
Unknown/no videoId: 0
Missing protected IDs: 12
```

Opcijsko lahko vizualno oznaci DOM:

- keep/maybe kot zasciteno;
- delete candidates kot kandidati;
- unknown kot varno ignorirano.

### Matching

Matching je izkljucno po `videoId`.

Nikoli po:

- playlist indexu;
- title;
- channel;
- trenutni DOM poziciji.

Unknown/no `videoId` elementi se ne brisejo avtomatsko.

Unavailable/private/deleted elementi niso del prvega avtomatskega delete flowa. Kasneje lahko dobijo locen cleanup flow.

### Delete not kept

`Delete not kept` je locen drugi korak po previewu.

Pred delete mora userscript vedno narediti svez backup trenutnega nalozenega Watch Later seznama:

- JSON backup;
- opcijsko CSV backup.

Backup ni opcijski.

Po backupu mora uporabnik potrditi z vpisom:

```text
DELETE <count>
```

Primer:

```text
DELETE 3880
```

Navaden `confirm()` ni dovolj.

### Delete execution

Delete kandidati se obdelujejo od spodaj navzgor.

Pred vsakim klikom se ponovno preveri `videoId`.

Delete action mora uporabljati explicit label matching za YouTube menu item.

Sprejemljive label variante naj vkljucujejo vsaj:

- `Remove from Watch later`;
- `Remove from playlist`;
- slovenske variante za odstranitev iz Poznejsega ogleda.

Ni nevarnega fallback klika na "prvi priblizno pravilen menu item".

Userscript naj se zanaša na YouTube UI akcijo. YouTube DOM elementov naj ne odstranjuje fizicno z `remove()`.

Po uspehu lahko element:

- oznaci kot processed;
- zatemni;
- skrije s CSS class.

### Progress in resume

Delete flow mora shranjevati osnovni progress log v `localStorage`.

Minimalni model:

```json
{
  "runId": "2026-06-01T17:00:00.000Z",
  "mode": "delete-not-kept",
  "targetVideoIds": ["..."],
  "deletedVideoIds": ["..."],
  "failedVideoIds": ["..."],
  "startedAt": "2026-06-01T17:00:00.000Z",
  "updatedAt": "2026-06-01T17:05:00.000Z"
}
```

MVP UI lahko podpira:

- `Resume previous delete run`;
- `Clear previous run`;
- `Export delete log`.

## Dogovorjene MVP prioritete

1. Dokoncati robusten JSON export.
2. Narediti lokalni `index.html` importer.
3. Dodati simple search, tag/channel/status filtre.
4. Dodati suggested tags iz hardcoded rules.
5. Dodati checkbox selection in bulk actions.
6. Dodati `localStorage` decisions po `videoId`.
7. Dodati export `keep/maybe`.
8. Dodati userscript import `keep/maybe` in dry-run.
9. Dodati backup + typed confirm.
10. Sele potem dodati dejanski `Delete not kept`.
