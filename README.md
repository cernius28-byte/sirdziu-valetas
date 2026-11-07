# Širdžių valetas

Kortų žaidimas 3–8 žaidėjams naršyklėje. Kiekvienas žaidžia savo telefone ar kompiuteryje, o trūkstamus žaidėjus gali pakeisti kompiuteris.

Serveriui nereikia jokių papildomų paketų – užtenka [Node.js](https://nodejs.org) (18 ar naujesnės versijos).

## Paleidimas savo kompiuteryje

```bash
npm start
```

Terminale bus parodyti du adresai:

- `http://localhost:3000` – šiame kompiuteryje;
- `http://192.168.x.x:3000` – draugams, prisijungusiems prie to paties Wi-Fi.

Vienas žaidėjas sukuria kambarį ir nusiunčia nuorodą arba 4 raidžių kodą kitiems. Kai visi prisijungia (arba pridedami kompiuteriniai žaidėjai), kambario šeimininkas spaudžia **Pradėti žaidimą**.

## Žaidimas su draugais per internetą

Kad prisijungtų draugai iš kitur, serveris turi būti pasiekiamas internete. Paprasčiausi būdai:

1. **Laikinas Cloudflare tunelis iš savo kompiuterio** (nemokamai, be registracijos). Atsidaryk du terminalo langus projekto aplanke:
   ```bash
   npm start
   ```
   ```bash
   npm run tunnel
   ```
   Antrasis parodys adresą `https://….trycloudflare.com` – jį ir nusiųsk draugams. Tunelis veikia, kol kompiuteris įjungtas ir abi komandos nesustabdytos; kiekvieną kartą adresas būna naujas.

   `npm run tunnel` naudoja programą `.tools/cloudflared`. Jei jos nėra (pvz. kitame kompiuteryje), atsisiųsk `cloudflared-darwin-arm64.tgz` (Apple M procesoriams) arba `cloudflared-darwin-amd64.tgz` (Intel) iš [Cloudflare GitHub](https://github.com/cloudflare/cloudflared/releases/latest) ir išarchyvuok į aplanką `.tools`.

   Šis tunelis nepalaiko SSE ryšio, todėl žaidimas pats pereina prie atsarginio būdo (ilgosios apklausos) – žaisti tai netrukdo.

2. **Nemokamas talpinimas, pvz. [Render](https://render.com)**: įkelk šį aplanką į GitHub, Render'e sukurk *Web Service*, nurodyk paleidimo komandą `node server.js`. Render pats nustatys prievadą (`PORT`). Adresas bus pastovus, o kompiuterio laikyti įjungto nereikės.

## Taisyklės trumpai

- **Kaladė:** 3 žaidėjams – A, K, Q, J ir du raudoni dešimtukai (18 kortų). Kiekvienas papildomas žaidėjas prideda 6 kortas.
- **Raundai:** dalinama po 1, 2, 3, 4, 5 kortas, tada po 6 (visos kortos) tiek raundų, kiek yra žaidėjų, tada po 5, 4, 3, 2, 1.
- **Dalinimas:** dalintojas keičiasi pagal laikrodžio rodyklę, kairėje sėdintis nukelia kaladę, dalintojas kortas gauna paskutinis. Kita korta atverčiama – tai kozeris. Jei išdalintos visos kortos, kozeris yra dalintojo paskutinė korta.
- **Atverstas širdžių valetas** (iš kaladės arba dalintojo parodyta paskutinė korta): dalintojas gauna −10, kaladė permaišoma ir dalinama iš naujo.
- **Šaukimas:** nuo žaidėjo po dalintojo kiekvienas pasako, kiek kartų paims – nuo 0 (pass) iki kortų skaičiaus rankoje. Visų šaukimų suma neribojama.
- **Ėjimai:** privaloma dėti tą pačią spalvą, neturint – kozerį, neturint ir jo – bet ką. Paima aukščiausias kozeris arba aukščiausia pradėtos spalvos korta.
- **Širdžių valetas:** galima dėti bet kada. Dedant pasirenkama rūšis (♠ ♥ ♦ ♣) ir ar tai didžiausia (aukštesnė už tūzą), ar mažiausia tos rūšies korta. Kozeris jį nukerta, nebent valetui pasirinkta kozerio rūšis. Jei valetas dedamas pirmas, visi deda jo rūšies kortas; galima pareikalauti didžiausių.
- **Taškai:** pass ir nieko nepaėmė +5; paėmė tiek, kiek šaukė, +10 už kiekvieną; mažiau −10 už kiekvieną trūkstamą; daugiau +1 už kiekvieną paimtą. Paskutiniame raunde visi taškai (ir minusai) trigubinami.

Pilnos taisyklės matomos žaidime (mygtukas **?**).

## Failai

| Failas | Kas jame |
| --- | --- |
| `game.js` | žaidimo taisyklės ir taškų skaičiavimas |
| `bots.js` | kompiuterinių žaidėjų sprendimai |
| `server.js` | serveris, kambariai, būsenos siuntimas |
| `public/` | naršyklės dalis: išvaizda ir animacijos |
| `test/` | testai (`npm test`) |
