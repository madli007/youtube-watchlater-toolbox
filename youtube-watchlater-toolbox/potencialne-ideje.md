# Potencialne ideje za YouTube Watch Later toolbox

## Obstojece funkcije

- **Load all videos**: gumb, ki samodejno scrolla Watch Later playlisto, dokler niso nalozeni vsi videi.
- **Export CSV**: izvoz trenutno nalozenih videov v CSV z naslovom, kanalom, URL-jem, trajanjem, ogledi in casom objave.

## Visoka prioriteta

### Delete all iz Watch Later

Gumb za odstranitev vseh trenutno nalozenih videov iz Watch Later playliste.

Predlagano delovanje:

- najprej uporabnik klikne **Load all videos**;
- skripta prebere vse nalozene `ytd-playlist-video-renderer` elemente;
- za vsak video odpre meni s tremi pikami;
- izbere akcijo za odstranitev iz Watch Later;
- med brisanjem prikaze napredek, na primer `23 / 240`;
- po koncu prikaze povzetek, koliko videov je bilo odstranjenih in koliko jih je spodletelo.

Varnostne opombe:

- pred brisanjem naj bo obvezen `confirm`;
- dobro bi bilo imeti tudi "dry run" nacin, ki samo presteje videe;
- brisanje naj ima zamik med akcijami, ker YouTube UI lahko odpove, ce je tempo prehiter;
- za napake naj skripta nadaljuje z naslednjim videom in jih na koncu izpise.

### Export all

En gumb, ki najprej samodejno nalozi vse videe in sele potem naredi CSV izvoz.

To bi zdruzilo obstojeci funkciji:

1. scrollaj do konca;
2. pocakaj, da se UI stabilizira;
3. izvozi vse nalozene videe.

### Backup pred brisanjem

Pred `delete all` naj skripta samodejno izvozi CSV varnostno kopijo.

Minimalno:

- `watchlater_backup_YYYY-MM-DD.csv`;
- vkljuceni naj bodo naslov, kanal, URL, trajanje in indeks;
- sele po uspesnem prenosu backup datoteke se zacne brisanje.

## Uporabne izboljsave

### Export JSON

Poleg CSV dodaj izvoz v JSON, ki je boljsi za kasnejso obdelavo s skriptami.

Primer strukture:

```json
[
  {
    "index": 1,
    "title": "Video title",
    "channel": "Channel name",
    "url": "https://www.youtube.com/watch?v=...",
    "duration": "12:34",
    "views": "10K views",
    "uploaded": "2 years ago"
  }
]
```

### Filtriranje pred izvozom ali brisanjem

Dodaj majhen panel s filtri:

- kanal;
- beseda v naslovu;
- trajanje nad/pod doloceno mejo;
- samo videi z manjkajocim/nedostopnim naslovom;
- samo trenutno izbrani rezultati.

Uporabno za primere, ko zelis izbrisati samo dolocene kanale ali stare tipe vsebin.

### Search znotraj Watch Later

Ker YouTube pri velikih playlistah ni najbolj prakticen, bi skripta lahko dodala lokalno iskanje po vseh nalozenih videih.

Delovanje:

- po `Load all videos` skripta indeksira naslove in kanale;
- prikaze iskalno polje;
- neujemajoce videe skrije ali zatemni;
- doda stevec najdenih rezultatov.

### Oznacevanje in bulk akcije

Dodaj checkbox ob vsak video in toolbar za bulk akcije.

Mozne akcije:

- export selected;
- delete selected;
- copy URLs;
- copy titles;
- open selected in tabs.

### Copy URLs

Hiter gumb za kopiranje vseh URL-jev v clipboard.

Variacije:

- samo URL-ji;
- naslov + URL;
- Markdown seznam;
- CSV vrstica.

### Markdown export

Izvoz v Markdown za osebne zapiske.

Primer:

```md
- [Video title](https://www.youtube.com/watch?v=...) - Channel name, 12:34
```

### Statistika playliste

Po nalaganju vseh videov prikazi povzetek:

- stevilo videov;
- skupno trajanje, ce je mogoce;
- najpogostejsi kanali;
- stevilo videov brez podatkov;
- stevilo private/deleted/unavailable videov.

### Detekcija nedostopnih videov

Poseben filter ali izvoz za videe, ki so:

- private;
- deleted;
- unavailable;
- brez naslova;
- brez kanala.

To je uporabno za ciscenje Watch Later seznama.

## Naprednejse ideje

### Premik v drugo playlisto

Bulk premik ali kopiranje izbranih Watch Later videov v drugo playlisto.

Mozen tok:

1. uporabnik izbere videe;
2. klikne `Move to playlist`;
3. skripta prek YouTube menija izbere ciljno playlisto;
4. po uspesnem kopiranju jih opcijsko odstrani iz Watch Later.

### Arhiviranje po kategorijah

Dodaj lokalne oznake, na primer:

- Watch later;
- Learning;
- Music;
- Dev;
- Delete;
- Archive.

Ker Tampermonkey nima prave baze, se lahko to hrani v `localStorage`.

### Resume pri dolgih akcijah

Pri velikem Watch Later seznamu se lahko brisanje ali premikanje prekine.

Skripta bi lahko hranila stanje:

- zadnji obdelan video ID;
- seznam uspesnih akcij;
- seznam napak;
- moznost nadaljevanja.

### Rate limit in robustnost

Dodaj nastavitve:

- zamik med akcijami;
- maksimalno stevilo poskusov;
- pavza po vsakih N videih;
- avtomatsko nadaljevanje po napaki.

### Mini dashboard

Namesto posameznih gumbov lahko skripta prikaze majhen fixed panel:

- Load all;
- Export CSV;
- Export JSON;
- Copy URLs;
- Delete selected;
- Delete all;
- status/progress vrstica.

## Tehnicne opombe

- YouTube DOM se pogosto spreminja, zato naj bodo selectorji centralizirani v enem objektu.
- Besedilo gumbov in menu itemov se lahko razlikuje glede na jezik UI-ja, zato je bolje iskati po strukturi ali vec moznih labelih.
- Pri destruktivnih akcijah naj bo vedno potrditveno okno.
- Pri `delete all` naj bo predlagana privzeta pot: najprej backup, potem brisanje.
- Za CSV izvoz je dobro dodati UTF-8 BOM, da Excel pravilno odpre sumnike.
- Emoji v gumbih naj bodo zapisani v pravilnem UTF-8, ker je v trenutni kodi videti nekaj encoding tezav.

## Predlagan vrstni red izvedbe

1. Popravi encoding napisov na gumbih.
2. Zdruzi `Load all` in `Export CSV` v `Export all`.
3. Dodaj backup CSV z datumom.
4. Dodaj `Delete all` z obveznim backupom in potrditvijo.
5. Dodaj progress UI za dolge akcije.
6. Dodaj `Copy URLs` in Markdown export.
7. Dodaj filtre in `delete selected`.
