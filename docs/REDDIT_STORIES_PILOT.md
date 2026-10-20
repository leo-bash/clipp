# Pilot 01 — Reddit Stories con gameplay di sottofondo

Il primo pilot editoriale di ShortFactory cambia formato. Il video racconta una storia breve ispirata a un post pubblico, con:

> hook iniziale senza finale → contesto → voice-over della storia riscritta → gameplay originale o autorizzato → sottotitoli dinamici → conclusione

La pipeline recupera candidati da Reddit, applica filtri automatici, e usa il post solo come spunto per creare un racconto originale, comprensibile e interessante. Non legge il post parola per parola e non mostra username o dettagli identificativi.

La lingua del primo canale è l'inglese: hook, voice-over, testo a schermo e sottotitoli devono essere in inglese. Le fonti possono essere in altre lingue, ma vanno riscritte e adattate prima della produzione.

Il voice-over deve avere un tono da storytime: naturale, diretto, leggermente drammatico e con pause brevi. I sottotitoli devono riportare esattamente le stesse parole pronunciate, senza riassunti o hook aggiuntivi diversi dall'audio. Possono essere resi più riconoscibili con dimensione, contrasto, colore e animazione, ma non modificando il testo.

## Temi in rotazione

Non scegliamo un solo tema fisso. Ogni storia valida entra nella rotazione in base a ciò che troviamo:

- ricordi delle scuole superiori e nostalgia;
- romance, appuntamenti e Tinder date;
- situazioni imbarazzanti e scherzi finiti male;
- bullismo, tradimenti, divorzi e drammi familiari;
- problemi economici e piccoli momenti di speranza;
- storie spaventose e incontri inquietanti, senza dettagli grafici;
- vendette innocue, conseguenze e dilemmi morali.

Il tema viene registrato nei dati del video, così potremo capire quali categorie generano più completamenti, commenti e condivisioni.

## Perché questo formato

- non dipende da un singolo streamer o da un accordo con un creator;
- può essere testato con un solo canale e una sola piattaforma;
- il valore principale è nella selezione, nella riscrittura, nella voce e nel montaggio;
- il processo è facilmente ripetibile quando il primo formato funziona.

## Struttura consigliata

1. **Hook, 0–3 secondi** — presenta il conflitto e crea curiosità senza rivelare il finale.
2. **Contesto** — chiarisce chi sono le persone coinvolte e qual è la situazione.
3. **Sviluppo** — racconta i passaggi importanti con frasi brevi e naturali.
4. **Punto di svolta** — mostra perché la storia merita attenzione.
5. **Conclusione** — chiude la vicenda e, quando ha senso, aggiunge una domanda o una riflessione originale.

Durata iniziale consigliata: 35–60 secondi. Un video deve poter essere capito anche senza leggere il post originale.

## Regole sui contenuti

Un post pubblico non è automaticamente materiale libero da copiare o monetizzare. L'autore mantiene i diritti sul proprio contenuto; la pubblicazione su Reddit concede a Reddit una licenza, ma non ci concede una licenza commerciale generale.

Per il pilot:

- preferire storie inviate direttamente dagli utenti o fonti con permesso documentabile;
- se si usa un post pubblico come spunto, riscrivere il contenuto con parole e struttura originali;
- non leggere lunghi passaggi parola per parola;
- non mostrare username, immagini o dettagli personali se non sono necessari;
- evitare minori, dati personali, accuse non verificabili, salute, violenza grafica e contenuti illegali;
- conservare URL, data di raccolta, autore dichiarato e prova dell'eventuale autorizzazione;
- bloccare il video se il diritto d'uso o la sicurezza della storia non sono chiari.

La riscrittura e il commento aiutano a rendere il video originale, ma non sostituiscono una licenza quando il contenuto viene riprodotto in modo sostanziale.

## Gameplay di sottofondo

Per il pilot useremo il materiale di **Orbital – No Copyright Gameplay**. Il canale dichiara che i suoi gameplay possono essere usati e monetizzati nei video, inclusi Shorts, TikTok e Reels. [Canale Orbital](https://www.youtube.com/channel/UCGongCOUx_Otho6DitLsL8Q)

Il gameplay deve essere:

- preso da un video Orbital la cui descrizione conferma la possibilità di utilizzo e monetizzazione;
- oppure acquistato dal loro shop, preferendo i file senza audio di gioco quando disponibili;
- oppure sostituito con materiale visivo creato internamente.

Non useremo gameplay scaricato da altri canali. Per ogni file salveremo URL, titolo, descrizione della licenza, data di verifica e, se acquistato, ricevuta o prova dell'acquisto. Il gameplay deve accompagnare la storia, non essere l'unico valore del video. Per la monetizzazione, YouTube richiede che il contenuto aggiunga valore originale e che i diritti commerciali del gioco o del materiale visivo siano rispettati. [Regole YouTube sui contenuti gaming](https://support.google.com/youtube/answer/138161)

## Pipeline operativa

1. Raccolta automatica di candidati dai temi in rotazione: high school, romance, embarrassing situations, bullies, family, scary, money, tinder, prank, divorce, betrayal e revenge.
2. Filtro automatico su contenuti espliciti, dati personali, post rimossi, lunghezza e qualità minima.
3. Proposta nella dashboard di esattamente 10 storie con titolo, estratto, tema, punteggio e link al post originale.
4. Selezione manuale di esattamente 5 storie per il giorno.
5. Scelta, per ogni storia, di una fascia Europe/Rome o US Eastern.
6. Salvataggio del piano e accodamento di cinque job idempotenti per generazione e pubblicazione.
7. Filtro umano su interesse, sicurezza, originalità e diritti.
8. Creazione di un riassunto e di un angolo narrativo.
9. Riscrittura con hook, sviluppo, svolta e conclusione originali.
10. Revisione umana per evitare copia, errori e rivelazione anticipata del finale.
11. Generazione o registrazione del voice-over.
12. Aggiunta del gameplay, dei sottotitoli e dei cambi visivi.
13. Controllo finale di audio, leggibilità, durata, diritti e contenuti sensibili.
14. Pubblicazione iniziale in privato o in bozza.
15. Misurazione di completamento, rewatch, commenti, costo e tempo umano.

### Fasce orarie iniziali

Sono finestre di test, non garanzie di performance. Il sistema programma l'orario centrale indicato per rendere il piano ripetibile:

- Europe/Rome: 09:00 (mattina), 13:00 (pranzo), 19:30 (sera).
- US Eastern: 13:00 (pranzo), 19:30 (sera), 22:00 (tarda sera).

La scelta del fuso viene salvata per ogni storia, così i risultati possono essere confrontati senza confondere l'orario europeo con quello statunitense.

La raccolta avviene con `POST /api/v1/reddit/proposals` dalla sezione **Candidates**. La modalità `Random theme rotation` sceglie un tema tra quelli configurati. Se Reddit restituisce HTTP 403, bisogna configurare `REDDIT_ACCESS_TOKEN` oppure `REDDIT_CLIENT_ID` e `REDDIT_CLIENT_SECRET` nel runtime: non viene usato scraping del browser.

## Criteri di successo del pilot

Il pilot è positivo se riusciamo a produrre 5–10 video coerenti, con diritti e fonti tracciati, senza revisione eccessiva e con un costo per video conosciuto. Le visualizzazioni sono importanti, ma non sono l'unico criterio della prima prova.

## Primo blocco da completare

- scegliere un primo gruppo di temi: nostalgia scolastica, romance, paura, soldi, dating, scherzi, divorzi, tradimenti o vendette innocue;
- preparare 5 storie con scheda fonte e rischio;
- registrare o generare il primo voice-over;
- selezionare un gameplay originale riutilizzabile;
- produrre tre video privati prima di automatizzare il volume.
