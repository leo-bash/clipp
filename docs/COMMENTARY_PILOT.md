# Pilot 01 — Commentary con clip autorizzate

> Questo documento descrive il formato considerato in precedenza. Il pilot attivo è ora documentato in [REDDIT_STORIES_PILOT.md](/Users/leo/Documents/ChatGPT/clipp/docs/REDDIT_STORIES_PILOT.md).

## Decisione

Il primo pilot editoriale di ShortFactory parte dal formato **commentary**:

> clip breve autorizzata → contesto → commento originale → analisi/conclusione

Il pilot userà un solo canale e una sola piattaforma, con pubblicazione iniziale privata o in bozza. Non è un progetto di repost automatico e non usa clip di terzi con diritti sconosciuti.

## Obiettivo del pilot

Produrre e valutare **5–10 video** sullo stesso tema e con lo stesso stile, per capire:

- se il format è interessante per il pubblico;
- quanto tempo richiede ogni video;
- quanto costa un video approvato;
- se il commento aggiunge valore reale;
- se i diritti sono gestibili in modo documentato;
- se il formato merita di diventare una produzione ricorrente.

Il pilot non deve dimostrare che un singolo video diventa virale. Deve dimostrare che il processo è ripetibile e sostenibile.

## Ricetta editoriale del video

Ogni video deve seguire questa struttura, adattandola al caso:

1. **Hook:** perché vale la pena guardare i prossimi secondi.
2. **Clip:** solo il frammento necessario a mostrare l'evento.
3. **Contesto:** chi, cosa, quando e perché.
4. **Commento:** la nostra spiegazione, opinione o lettura del fatto.
5. **Conclusione:** il punto da ricordare o la domanda che apre la discussione.

Il commento deve essere comprensibile anche senza la clip originale. La clip è una prova o un elemento narrativo, non l'intero valore del video.

### Regole creative iniziali

- Durata obiettivo: 20–45 secondi.
- Una sola idea per video.
- Voce o presenza editoriale originale in ogni video.
- Sottotitoli leggibili e coerenti con il canale.
- Niente compilation di clip senza narrazione.
- Niente intro lunga o riempitiva.
- Niente musica di cui non abbiamo una licenza chiara.
- La quantità di clip deve essere proporzionata al commento, non il contrario.

## Regole sui diritti

Prima di creare il video registriamo la provenienza e il diritto d'uso della clip.

### Ordine di preferenza

1. Clip girata o posseduta da noi.
2. Clip con autorizzazione scritta del creator o del titolare dei diritti.
3. Clip con licenza commerciale compatibile con tutte le piattaforme del pilot.
4. Creative Commons o pubblico dominio, solo dopo aver verificato condizioni, attribuzione e uso commerciale.
5. Commento/critica/recensione valutato manualmente caso per caso.

Una clip trovata online, scaricata da un social o attribuita all'autore senza autorizzazione non è automaticamente utilizzabile.

Il credito all'autore e la frase “no copyright intended” non sostituiscono un'autorizzazione. Le eccezioni al copyright dipendono dalla giurisdizione e non eliminano il rischio di contestazioni o Content ID.

### Stati ammessi nel pilot

| Stato | Si può montare? | Si può pubblicare? | Condizione |
|---|---:|---:|---|
| `OWNED` | Sì | Sì, dopo revisione | Materiale nostro |
| `LICENSED` | Sì | Sì, dopo verifica | Prova della licenza e uso commerciale |
| `CREATIVE_COMMONS` | Sì | Solo dopo revisione | Licenza compatibile, attribuzione registrata |
| `PUBLIC_DOMAIN` | Sì | Solo dopo verifica | Prova della fonte e dello stato |
| `COMMENTARY_REVIEW` | Sì | Solo con approvazione umana | Commento/critica realmente originale |
| `UNKNOWN` | No per il pilot pubblico | No | Prima bisogna chiarire i diritti |
| `BLOCKED` | No | No | Scarto definitivo |

## Scheda obbligatoria per ogni clip

Prima di inserirla nella pipeline, compiliamo una scheda con:

| Campo | Valore da registrare |
|---|---|
| Titolo interno | Nome breve della clip |
| Creator/titolare | Persona o organizzazione che possiede i diritti |
| URL originale | Link alla fonte primaria |
| File/hash | Identificativo del file usato |
| Stato diritti | `OWNED`, `LICENSED`, `CREATIVE_COMMONS`, `PUBLIC_DOMAIN` o `COMMENTARY_REVIEW` |
| Prova | Link o percorso dell'autorizzazione/licenza |
| Uso commerciale | Sì/No/da verificare |
| Piattaforme | YouTube, TikTok, Instagram o limitazioni |
| Attribuzione | Testo richiesto dal titolare/licenza |
| Scadenza | Data di fine del permesso, se presente |
| Note | Restrizioni, persone riconoscibili, musica, marchi |
| Revisore | Persona che ha verificato la scheda |
| Data revisione | Data dell'ultima verifica |

Se manca la prova, lo stato resta `UNKNOWN` e il video non va in pubblicazione.

## Flusso operativo del pilot

1. Scegliere un creator, una fonte o un piccolo insieme di fonti.
2. Ottenere l'autorizzazione o verificare una licenza compatibile.
3. Salvare la scheda diritti e il materiale originale.
4. Preparare con Gemini/NotebookLM il contesto e una prima scaletta.
5. Scrivere un commento originale, non una semplice descrizione della clip.
6. Creare voce, sottotitoli e montaggio.
7. Eseguire il controllo qualità automatico.
8. Fare la revisione umana di contenuto, diritti e qualità.
9. Pubblicare in privato o in bozza sul primo account.
10. Registrare costo, tempo e risultato.

## Criteri di approvazione

Un video passa solo se tutte le risposte sono positive:

- la clip è identificata e il diritto d'uso è documentato;
- il commento aggiunge contesto, analisi, critica o narrazione originale;
- il video non sarebbe lo stesso senza il nostro intervento;
- la clip è breve e necessaria al punto che stiamo spiegando;
- non ci sono musica, immagini o marchi non verificati;
- voce e sottotitoli sono corretti;
- il video rispetta durata, formato e leggibilità;
- una persona lo ha approvato;
- la destinazione e la modalità di pubblicazione sono corrette.

Un video che fallisce un criterio viene rimandato alla revisione o bloccato. Non si risolve un problema di diritti con crop, zoom, blur o sottotitoli.

## Misure da raccogliere

Per ogni video registriamo:

- minuti di lavoro umano;
- costo AI, trascrizione, voce e storage;
- numero di rigenerazioni;
- esito del controllo qualità;
- tempo dalla fonte al video approvato;
- eventuale rifiuto o claim della piattaforma;
- visualizzazioni, completamento, commenti e condivisioni;
- costo per video approvato e pubblicato.

Il pilot è positivo se il processo è ripetibile, i diritti sono documentati, il lavoro umano è compatibile con il volume desiderato e il costo per video è noto. Le visualizzazioni sono importanti, ma non sono l'unico criterio di successo della prima prova.

## Collegamento con ShortFactory

La piattaforma supporta già:

- stato diritti `COMMENTARY_REVIEW`;
- blocco di `BLOCKED`;
- revisione manuale per contenuti `UNKNOWN` o soggetti a verifica;
- coda di rendering, QC, review, scheduling e publishing;
- adapter ufficiali per YouTube, TikTok e Instagram.

La rotta di test attuale usa però un video sintetico. Per il pilot reale rimane da completare il passaggio di una fonte/file reale nella pipeline e, successivamente, decidere quali provider AI e trascrizione attivare. Gli adapter mock non pubblicano sui social.

## Prossime azioni

- [ ] Scegliere il tema del primo canale commentary.
- [ ] Identificare un creator o una fonte con cui ottenere un'autorizzazione reale.
- [ ] Definire per iscritto piattaforme, uso commerciale, durata e attribuzione.
- [ ] Raccogliere 5–10 clip autorizzate.
- [ ] Preparare la prima scheda diritti per ogni clip.
- [ ] Creare il primo script commentary e farlo revisionare.
- [ ] Collegare il primo file reale alla pipeline di rendering.
- [ ] Pubblicare il primo video in privato/bozza.
- [ ] Registrare costo, tempo e risultato.

Questo documento non costituisce consulenza legale. Per licenze, persone riconoscibili, musica e uso commerciale transfrontaliero va verificato il caso concreto con il titolare dei diritti o un professionista.
