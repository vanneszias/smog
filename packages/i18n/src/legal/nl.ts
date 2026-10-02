import type { LegalTexts } from "./types";

/**
 * The legal texts in Dutch: the canonical version (the en and fr texts are
 * translations of this one). Ported from the old site's pages and updated
 * for the Cloudflare platform, Better Auth and on-device guest data.
 */
export const nl: LegalTexts = {
  privacy: {
    sections: [
      {
        blocks: [
          'Dit privacybeleid beschrijft hoe SMOG & CO vzw persoonsgegevens verwerkt wanneer u de SMOG&Co-website, mobiele app, accounts, gedeelde lijsten, sponsoring en bijbehorende ondersteuning gebruikt (samen: de "Dienst").',
        ],
        id: "scope",
        title: "Toepassingsgebied",
      },
      {
        blocks: [
          "SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Antwerpen, België, O.N. 1009 954 991, is de verwerkingsverantwoordelijke. Privacyvragen kunt u sturen naar [info@smog.vlaanderen](mailto:info@smog.vlaanderen).",
        ],
        id: "controller",
        title: "Verwerkingsverantwoordelijke",
      },
      {
        blocks: [
          {
            list: [
              "**Account en aanmelding:** naam, e-mailadres en of het bevestigd is, taal, rol, eventueel een profielfoto van Google (die uw browser rechtstreeks bij Google ophaalt wanneer ze getoond wordt), sessies (met IP-adres en browser- of appgegevens) en tijdstippen. Een wachtwoord bewaren we alleen als onomkeerbare hash; van een passkey bewaren we alleen de publieke sleutel. Meldt u zich aan met Google of Apple, dan ontvangen we van hen een account-ID, uw naam en uw e-mailadres.",
              "**Gebruik zonder account:** favorieten, lijsten, recente zoekopdrachten, voorkeuren en uw analyticskeuze blijven op uw apparaat. Ze verlaten uw apparaat niet, tenzij u na het aanmelden kiest om ze in uw account te importeren, en behalve de optionele analytics hieronder (bijvoorbeeld welk gebaar u bekeek of bewaarde).",
              "**Leerfuncties:** favoriete gebaren, lijsten, lijstbeschrijvingen, deellinks en hun rechten (bekijken of bewerken). Recente zoektermen blijven lokaal op uw apparaat.",
              "**Sponsoring:** contactnaam, sponsor- of bedrijfsnaam, e-mail, gekozen gebaren, weergavenaam, optioneel logo, voorbeeld- en eindvideo's, status, betaalreferentie en looptijd.",
              "**Facturatie:** factuurnaam, btw- of ondernemingsnummer en factuur-e-mailadres wanneer u een factuur vraagt. Mollie verwerkt de betaalgegevens; SMOG&Co ontvangt geen volledige kaart- of bankgegevens.",
              "**Technische gegevens:** IP-adres, apparaat-, browser- en appgegevens, beveiligingslogs, foutinformatie en gegevens die nodig zijn voor video- en netwerklevering. Bij aanmelden, registreren, wachtwoordherstel en andere formulieren (zoals het aanvragen van een aanmeldcode of -link) controleert Cloudflare Turnstile of het verzoek van een mens komt.",
              "**Toestemmingsgeschiedenis:** bent u aangemeld, dan bewaren we uw analyticskeuzes (ja of nee, tijdstip en beleidsversie), zodat we kunnen aantonen welke keuze geldt.",
              "**Optionele analytics:** alleen na toestemming: schermpad, platform, beperkte gebeurtenisgegevens, gebaar-ID's, resultaat- en categorietellingen, lengte van een zoekopdracht en voltooid afspelen, met uw IP-adres en browser- of appgegevens (zie Analytics en identificatie). We sturen geen zoektermen, namen of e-mailadressen en maken geen sessie-opnames.",
            ],
          },
        ],
        id: "data",
        title: "Welke gegevens wij verwerken",
      },
      {
        blocks: [
          {
            list: [
              "**Overeenkomst:** accounts, favorieten, lijsten, gedeelde lijsten, sponsoring, betalingen, videoverwerking en transactionele communicatie leveren.",
              "**Wettelijke verplichting:** boekhouding, facturatie, fiscale verplichtingen en beantwoording van geldige wettelijke verzoeken.",
              "**Gerechtvaardigd belang:** beveiliging, fraude- en misbruikpreventie (zoals Turnstile en limieten op het aantal verzoeken), beheer, foutdiagnose en verbetering van de betrouwbaarheid van de Dienst. U kunt hiertegen bezwaar maken.",
              "**Toestemming:** optionele OpenPanel-analytics. U kunt weigeren of later intrekken zonder dat basisfuncties wegvallen.",
            ],
          },
        ],
        id: "purposes",
        title: "Doeleinden en rechtsgronden",
      },
      {
        blocks: [
          "Alleen bevoegde medewerkers en dienstverleners die de Dienst ondersteunen krijgen toegang voor zover dat nodig is:",
          {
            list: [
              "**Cloudflare:** hosting van de website en de API (Workers), de database (D1), bestandsopslag zoals sponsorlogo's (R2), tijdelijke gegevens (KV), wachtrijen (Queues), het renderen van sponsorvideo's met naam en logo (Workflows, Containers), het verzenden van e-mails (Email) en misbruikpreventie (Turnstile). [Privacybeleid](https://www.cloudflare.com/privacypolicy/)",
              "**Better Auth:** open-source aanmeldsoftware die wij zelf binnen onze Cloudflare-omgeving draaien. Er gaan daarvoor geen gegevens naar een aparte aanbieder.",
              "**Mux:** opslag, verwerking en streaming van gebaren- en sponsorvideo's. [Privacybeleid](https://www.mux.com/privacy)",
              "**Mollie:** gehoste betaalafhandeling en betaalstatus. [Privacybeleid](https://www.mollie.com/legal/privacy)",
              "**Expo:** distributie en updates van de mobiele app. [Privacybeleid](https://expo.dev/privacy)",
              "**Google en Apple:** wanneer u kiest om u met uw Google- of Apple-account aan te melden. Hebt u een profielfoto van Google, dan haalt uw browser die bij elke weergave rechtstreeks bij Google op; Google ziet dan uw IP-adres en browsergegevens. [Google](https://policies.google.com/privacy) · [Apple](https://www.apple.com/legal/privacy/)",
              "**OpenPanel:** zelfgehoste analysesoftware op analytics.zias.be, uitsluitend na analytics-toestemming. De OpenPanel-cloud wordt niet gebruikt voor onze gebeurtenisdata.",
            ],
          },
          "Persoonsgegevens worden niet verkocht. We delen ze alleen op grond van een overeenkomst, wettelijke verplichting of ander geldig juridisch kader.",
        ],
        id: "recipients",
        title: "Ontvangers en dienstverleners",
      },
      {
        blocks: [
          "Analytics staat standaard uit. Na toestemming stuurt de website gebeurtenissen via onze eigen server door naar onze zelfgehoste OpenPanel-installatie, zonder scripts of cookies van derden. Onze server geeft daarbij uw IP-adres en browsergegevens (user agent) door; OpenPanel leidt daaruit een pseudoniem apparaatprofiel en een benaderende locatie (land en regio) af. Onze server bewaart die gegevens daarvoor zelf niet. De app stuurt gebeurtenissen rechtstreeks naar dezelfde OpenPanel-installatie, met een pseudonieme apparaat-ID. Na aanmelding wordt het profiel alleen aan uw gebruikers-ID gekoppeld; uw naam en e-mailadres gaan niet naar analytics. Bij uitloggen of intrekken wordt de analytics-identiteit gewist. Intrekken stopt nieuwe metingen; eerder rechtmatig verzamelde gegevens worden daardoor niet automatisch verwijderd. U kunt verwijdering aanvragen via ons contactadres.",
        ],
        id: "analytics",
        title: "Analytics en identificatie",
      },
      {
        blocks: [
          "SMOG & Co volgt gebruikers niet over apps of websites van andere bedrijven heen. We gebruiken analyticsgegevens niet voor gerichte advertenties of advertentiemeting en delen analyticsgegevens niet met data brokers.",
        ],
        id: "no-tracking",
        title: "Geen tracking of advertenties",
      },
      {
        blocks: [
          {
            list: [
              "Noodzakelijke cookies houden uw sessie actief wanneer u aangemeld bent en onthouden uw taal en thema. Daarnaast zetten we tijdens onderhoud een technische cookie voor beheerders, zodat zij de site kunnen blijven gebruiken.",
              "Lokale opslag bewaart onder meer favorieten en lijsten zonder account, recente zoekopdrachten, voorkeuren, appcache en uw analyticskeuze. Een keuze die u aangemeld maakte, blijft ook op het apparaat, maar geldt alleen voor uw account: wie het apparaat daarna zonder account gebruikt, krijgt de vraag opnieuw.",
              "Na analytics-toestemming kan de app lokale identificatie- en wachtrijgegevens bewaren om gebeurtenissen af te leveren. De website bewaart alleen tijdens het aanmelden een tijdelijke markering in de sessie-opslag van uw browser, zodat een voltooide aanmelding één keer wordt geteld.",
            ],
          },
          "U kunt uw analyticskeuze hieronder op elk moment wijzigen:",
          { consentControl: true },
        ],
        id: "cookies",
        title: "Cookies en lokale opslag",
      },
      {
        blocks: [
          {
            list: [
              "Accountgegevens, favorieten, lijsten en uw toestemmingsgeschiedenis blijven bewaard zolang uw account bestaat of totdat u ze verwijdert.",
              "Beheerlogs worden maximaal 3 jaar bewaard.",
              "Een sessie verloopt 7 dagen nadat u de Dienst het laatst gebruikte, of meteen wanneer u zich afmeldt. Aanmeldcodes en aanmeldlinks zijn eenmalig en 5 minuten geldig; links om uw e-mailadres te bevestigen of uw wachtwoord te herstellen 1 uur. Verlopen sessies, codes en links worden binnen 30 dagen gewist.",
              "Niet-betaalde sponsoraanvragen worden na 24 uur geannuleerd. Onderliggende technische bestanden kunnen volgens operationele back-up- en opschooncycli later verdwijnen.",
              "Betaal-, sponsor- en factuurgegevens worden bewaard zolang dat nodig is voor de overeenkomst en maximaal 10 jaar wanneer de Belgische boekhoud- of fiscale regels dat vereisen.",
              "Analyticsgegevens worden bewaard volgens de ingestelde bewaartermijn van onze OpenPanel-installatie en niet langer dan nodig voor productanalyse.",
            ],
          },
        ],
        id: "retention",
        title: "Bewaartermijnen",
      },
      {
        blocks: [
          "Op de [accountpagina](/account) kunt u uw account verwijderen. Dat verwijdert meteen uw account, sessies, aanmeldmethodes en passkeys, favorieten, eigen lijsten met hun deellinks en uw toestemmingsgeschiedenis. In beheerlogs wordt u als uitvoerder losgekoppeld; beheerlogs over uw account blijven tot het einde van hun bewaartermijn bestaan. U wordt op elk apparaat afgemeld en de gegevens op het gebruikte apparaat worden gewist. Sponsor-, betaal- en factuurgegevens zijn niet aan uw account gekoppeld en worden bewaard zolang de wet dat vereist (zie Bewaartermijnen). Back-ups en gegevens bij afzonderlijke dienstverleners kunnen hun eigen verwijdercyclus volgen.",
        ],
        id: "deletion",
        title: "Accountverwijdering",
      },
      {
        blocks: [
          "Onder de GDPR kunt u, afhankelijk van de omstandigheden, inzage, rectificatie, wissing, beperking, overdraagbaarheid of bezwaar vragen. U kunt toestemming altijd intrekken en een klacht indienen bij een toezichthouder. De [accountpagina](/account) biedt een machineleesbare export (JSON) en accountverwijdering. Voor andere verzoeken mailt u [info@smog.vlaanderen](mailto:info@smog.vlaanderen). We kunnen informatie vragen om uw identiteit te verifiëren.",
        ],
        id: "rights",
        title: "Uw rechten",
      },
      {
        blocks: [
          "Sommige dienstverleners kunnen persoonsgegevens buiten de Europese Economische Ruimte verwerken. Waar nodig gebruiken we een adequaatheidsbesluit, standaardcontractbepalingen of een ander rechtsgeldig doorgiftemechanisme en passende aanvullende beveiligingsmaatregelen.",
        ],
        id: "transfers",
        title: "Internationale doorgiften",
      },
      {
        blocks: [
          "We gebruiken passende technische en organisatorische maatregelen, waaronder toegangsbeperking, versleutelde verbindingen, gehashte wachtwoorden en afgeschermde secrets. Geen systeem is volledig risicoloos. Bij een meldingsplichtig incident informeren we de bevoegde autoriteit en, wanneer vereist, betrokken personen.",
        ],
        id: "security",
        title: "Beveiliging en incidenten",
      },
      {
        blocks: [
          "In België kan een kind vanaf 13 jaar zelf toestemming geven voor een rechtstreeks aangeboden online dienst. Is volgens het toepasselijke recht toestemming van een ouder of voogd nodig, dan moet die worden verkregen. Neem contact op wanneer u denkt dat gegevens van een kind onrechtmatig zijn verwerkt.",
        ],
        id: "children",
        title: "Kinderen",
      },
      {
        blocks: [
          "We kunnen dit beleid bijwerken wanneer de Dienst, leveranciers of wetgeving wijzigen. De datum bovenaan wordt aangepast en bij belangrijke wijzigingen informeren we gebruikers in de app of via een passend kanaal. Waar nodig vragen we opnieuw toestemming.",
        ],
        id: "changes",
        title: "Wijzigingen",
      },
      {
        blocks: [
          {
            lines: [
              "SMOG & CO vzw",
              "Arthur Goemaerelei 66, 2018 Antwerpen, België",
              "E-mail: [info@smog.vlaanderen](mailto:info@smog.vlaanderen)",
              "Tel.: 03/216 29 90",
              "O.N. 1009 954 991",
            ],
          },
          "U kunt ook een klacht indienen bij de [Belgische Gegevensbeschermingsautoriteit](https://www.gegevensbeschermingsautoriteit.be/burger/acties/klacht-indienen) of bij uw lokale toezichthouder.",
        ],
        id: "contact",
        title: "Contact en klacht",
      },
    ],
    title: "Privacybeleid",
  },
  terms: {
    sections: [
      {
        blocks: [
          'Deze voorwaarden gelden voor de SMOG&Co-website, mobiele app, accounts, lijsten, sponsoring en bijbehorende diensten (de "Dienst"), aangeboden door SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Antwerpen, België, O.N. 1009 954 991. Door de Dienst te gebruiken gaat u akkoord met deze voorwaarden. Dwingend consumentenrecht blijft altijd gelden.',
        ],
        id: "provider",
        title: "Toepassing en aanbieder",
      },
      {
        blocks: [
          "De Dienst biedt een bibliotheek met gebarenvideo's, zoeken en filteren, favorieten, eigen en gedeelde lijsten, gebruik zonder account, accountsynchronisatie en de mogelijkheid om een gebaar te sponsoren. Functies kunnen per platform verschillen.",
        ],
        id: "service",
        title: "Beschrijving van de Dienst",
      },
      {
        blocks: [
          "U kunt een account aanmaken met uw e-mailadres (met een wachtwoord, een code of een aanmeldlink), een passkey, of uw Google- of Apple-account. U moet correcte informatie verstrekken, uw account beveiligen en misbruik melden. Zonder account worden favorieten en lijsten alleen op uw apparaat bewaard; ze verdwijnen wanneer u de gegevens van uw browser of app wist. Na het aanmelden kunt u ze in uw account importeren. Een lijst delen vereist een account. U kunt uw account verwijderen via de accountpagina; wettelijke bewaarplichten en afzonderlijke sponsortransacties kunnen verdere bewaring vereisen.",
        ],
        id: "accounts",
        title: "Accounts en gebruik zonder account",
      },
      {
        blocks: [
          "U mag de Dienst niet gebruiken om:",
          {
            list: [
              "de wet of rechten van anderen te schenden;",
              "ongeautoriseerde toegang te verkrijgen of beveiliging te omzeilen;",
              "de Dienst, infrastructuur of andere gebruikers te verstoren;",
              "zonder toestemming geautomatiseerd grote hoeveelheden inhoud op te vragen, te kopiëren of door te verkopen;",
              "misleidende, schadelijke of inbreukmakende sponsorinhoud aan te leveren.",
            ],
          },
          "We kunnen toegang beperken of beëindigen wanneer dat redelijk nodig is voor beveiliging, wettelijke naleving of een ernstige schending.",
        ],
        id: "use",
        title: "Toegestaan gebruik",
      },
      {
        blocks: [
          "De Dienst, software, teksten, vormgeving en gebarenvideo's zijn eigendom van SMOG&Co of haar licentiegevers. U krijgt een beperkte, herroepbare, niet-exclusieve en niet-overdraagbare licentie voor persoonlijk en educatief gebruik. Normale browser- of appcaching is toegestaan; downloaden, herpubliceren, wijzigen, commercieel exploiteren of een afgeleid videoproduct maken vereist voorafgaande toestemming, behalve waar de wet dit uitdrukkelijk toestaat.",
        ],
        id: "ip",
        title: "Intellectuele eigendom",
      },
      {
        blocks: [
          {
            list: [
              "Een sponsoring koppelt de gekozen sponsornaam, tekst en eventueel logo gedurende de getoonde looptijd aan een of meer gebarenvideo's.",
              "De prijs, looptijd en eventuele logo-opslag worden vóór betaling getoond. De server controleert het verschuldigde bedrag. Een sponsoraanvraag is pas betaald nadat Mollie de betaling bevestigt.",
              "SMOG&Co beoordeelt de gesponsorde video vóór publicatie en kan inhoud weigeren die onwettig, misleidend, schadelijk, ongepast of technisch onbruikbaar is. We nemen bij afwijzing contact op over aanpassing of een passende afhandeling van de betaling.",
              "U garandeert dat u de nodige rechten en toestemmingen bezit voor namen, merken, logo's, tekst en andere aangeleverde inhoud. U verleent SMOG&Co voor de uitvoering van de sponsoring een niet-exclusieve licentie om die inhoud te verwerken, te renderen, te hosten en te tonen.",
              "Voorbeeld- en eindvideo's kunnen technisch worden aangepast voor formaat, leesbaarheid en streaming. Een door SMOG&Co verstrekte herbewerkingslink is persoonlijk, 7 dagen geldig en mag niet worden gedeeld.",
              "Ongeveer 30 dagen voor het einde van de looptijd ontvangt u een e-mail met een link om de sponsoring te verlengen. Een verlenging is een nieuwe betaling voor een extra jaar tegen de dan getoonde prijs; een sponsoring wordt nooit automatisch verlengd.",
              "Onbetaalde aanvragen kunnen na 24 uur worden geannuleerd. Voor annulering, terugbetaling of een foutieve betaling neemt u contact op; wettelijke consumentenrechten blijven van toepassing.",
            ],
          },
        ],
        id: "sponsoring",
        title: "Sponsoring",
      },
      {
        blocks: [
          "Betalingen verlopen via de gehoste betaalomgeving van Mollie en zijn onderworpen aan de voorwaarden van de gekozen betaalmethode. U bent verantwoordelijk voor correcte contact- en factuurgegevens. Eventuele belastingen worden toegepast zoals wettelijk vereist. Bij een betwiste, teruggedraaide of frauduleuze betaling mogen we de sponsoring opschorten terwijl de zaak wordt onderzocht.",
        ],
        id: "payment",
        title: "Betaling en facturatie",
      },
      {
        blocks: [
          "Ons [privacybeleid](/privacy) legt uit welke gegevens nodig zijn voor de Dienst en welke verwerking op een andere rechtsgrond berust. Optionele analytics wordt alleen na afzonderlijke toestemming ingeschakeld; gebruik van de Dienst geldt niet als analytics-toestemming.",
        ],
        id: "privacy",
        title: "Privacy",
      },
      {
        blocks: [
          "We streven naar een betrouwbare en correcte Dienst, maar garanderen geen ononderbroken beschikbaarheid of foutloze inhoud. Gebarengebruik kan per regio, persoon en context verschillen. De Dienst is een educatief hulpmiddel en geen professionele certificering, medische dienst of vervanging voor persoonlijk advies.",
        ],
        id: "availability",
        title: "Beschikbaarheid en educatieve inhoud",
      },
      {
        blocks: [
          "Voor zover wettelijk toegestaan is SMOG&Co niet aansprakelijk voor indirecte schade, gevolgschade of verlies dat niet redelijk voorzienbaar was. Niets in deze voorwaarden beperkt aansprakelijkheid die wettelijk niet kan worden uitgesloten, waaronder aansprakelijkheid voor opzet of zware fout waar het toepasselijke recht dat bepaalt. Consumenten behouden hun dwingendrechtelijke remedies.",
        ],
        id: "liability",
        title: "Aansprakelijkheid",
      },
      {
        blocks: [
          "U blijft verantwoordelijk voor inhoud die u aanlevert. Voor zover wettelijk toegestaan, vergoedt een zakelijke gebruiker SMOG&Co voor aanspraken van derden die rechtstreeks voortvloeien uit opzettelijk onrechtmatig gebruik of uit aangeleverde sponsorinhoud waarvoor die gebruiker de vereiste rechten niet bezit. Deze bepaling beperkt geen wettelijke consumentenbescherming.",
        ],
        id: "indemnity",
        title: "Inhoud van gebruikers en schadeloosstelling",
      },
      {
        blocks: [
          "We kunnen functies wijzigen, onderhouden of stopzetten. Bij een belangrijke wijziging die een lopende betaalde sponsoring wezenlijk raakt, zoeken we een redelijke oplossing. We kunnen deze voorwaarden aanpassen en vermelden steeds de nieuwe datum. Voor wezenlijke wijzigingen informeren we gebruikers via de Dienst of een passend contactkanaal.",
        ],
        id: "changes",
        title: "Wijzigingen en stopzetting",
      },
      {
        blocks: [
          "Belgisch recht is van toepassing. Geschillen behoren tot de bevoegde Belgische rechtbanken, behalve wanneer dwingend consumentenrecht u het recht geeft een andere bevoegde rechtbank te kiezen. Probeer een probleem eerst via [info@smog.vlaanderen](mailto:info@smog.vlaanderen) met ons op te lossen.",
        ],
        id: "law",
        title: "Toepasselijk recht en geschillen",
      },
      {
        blocks: [
          "Als een bepaling ongeldig of onafdwingbaar is, blijven de overige bepalingen gelden. Het niet onmiddellijk afdwingen van een recht is geen afstand daarvan. Deze voorwaarden en het privacybeleid vormen de afspraken over het gebruik van de Dienst, naast specifieke informatie die bij een aankoop wordt getoond.",
        ],
        id: "general",
        title: "Overige bepalingen",
      },
      {
        blocks: [
          {
            lines: [
              "SMOG & CO vzw",
              "Arthur Goemaerelei 66, 2018 Antwerpen, België",
              "E-mail: [info@smog.vlaanderen](mailto:info@smog.vlaanderen)",
              "Tel.: 03/216 29 90",
              "O.N. 1009 954 991",
            ],
          },
        ],
        id: "contact",
        title: "Contact",
      },
    ],
    title: "Servicevoorwaarden",
  },
};
