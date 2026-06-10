import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsConsentControl } from "@/components/analytics-consent-control";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="container overflow-y-auto px-12 py-8">
      <h1 className="mb-6 font-bold text-4xl">Privacybeleid</h1>
      <p className="mb-4 text-sm">Laatst bijgewerkt: 10 juni 2026</p>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">1. Toepassingsgebied</h2>
          <p>
            Dit privacybeleid beschrijft hoe SMOG & CO vzw persoonsgegevens
            verwerkt wanneer u de SMOG&Co-website, mobiele app, accounts,
            gedeelde lijsten, sponsoring en bijbehorende ondersteuning gebruikt
            (samen: de "Dienst").
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            2. Verwerkingsverantwoordelijke
          </h2>
          <p>
            SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Antwerpen, België, O.N.
            1009 954 991, is de verwerkingsverantwoordelijke. Privacyvragen kunt
            u sturen naar{" "}
            <a
              className="text-blue-600 underline"
              href="mailto:info@smog.vlaanderen"
            >
              info@smog.vlaanderen
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            3. Welke gegevens wij verwerken
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Account en authenticatie:</strong> WorkOS-gebruikers-ID,
              e-mailadres, naam, rol, sessie- en accounttijdstippen.
            </li>
            <li>
              <strong>Gastgebruik:</strong> een willekeurige gast-ID, laatste
              activiteit, favorieten en lijsten. Deze gegevens worden in Convex
              opgeslagen om de Dienst te laten werken.
            </li>
            <li>
              <strong>Leerfuncties:</strong> favoriete gebaren, lijsten,
              lijstbeschrijvingen, deelinstellingen en deelcodes. Recente
              zoektermen blijven lokaal op uw apparaat.
            </li>
            <li>
              <strong>Sponsoring:</strong> contactnaam, sponsor- of
              bedrijfsnaam, e-mail, gekozen gebaren, overlaytekst, optioneel
              logo, voorbeeldvideo's, status, betaalreferentie en looptijd.
            </li>
            <li>
              <strong>Facturatie:</strong> factuurnaam, btw- of
              ondernemingsnummer en factuur-e-mailadres wanneer u een factuur
              vraagt. Mollie verwerkt de betaalgegevens; SMOG&Co ontvangt geen
              volledige kaart- of bankgegevens.
            </li>
            <li>
              <strong>Technische gegevens:</strong> IP-adres, apparaat-,
              browser- en appgegevens, beveiligingslogs, foutinformatie en
              gegevens die nodig zijn voor video- en netwerklevering.
            </li>
            <li>
              <strong>Optionele analytics:</strong> alleen na toestemming:
              schermpad, platform, beperkte gebeurtenisgegevens,
              gebaar-ID&apos;s, resultaat- en categorietellingen, lengte van een
              zoekopdracht en voltooid afspelen. We sturen geen zoektermen en
              maken geen sessie-opnames.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            4. Doeleinden en rechtsgronden
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Overeenkomst:</strong> accounts, gastmodus, favorieten,
              lijsten, gedeelde lijsten, sponsoring, betalingen, videoverwerking
              en transactionele communicatie leveren.
            </li>
            <li>
              <strong>Wettelijke verplichting:</strong> boekhouding, facturatie,
              fiscale verplichtingen en beantwoording van geldige wettelijke
              verzoeken.
            </li>
            <li>
              <strong>Gerechtvaardigd belang:</strong> beveiliging,
              fraudepreventie, beheer, misbruikonderzoek, foutdiagnose en
              verbetering van de betrouwbaarheid van de Dienst. U kunt hiertegen
              bezwaar maken.
            </li>
            <li>
              <strong>Toestemming:</strong> optionele OpenPanel-analytics. U
              kunt weigeren of later intrekken zonder dat basisfuncties
              wegvallen.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            5. Ontvangers en dienstverleners
          </h2>
          <p className="mb-2">
            Alleen bevoegde medewerkers en dienstverleners die de Dienst
            ondersteunen krijgen toegang voor zover dat nodig is:
          </p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>WorkOS:</strong> authenticatie en accountidentiteit.{" "}
              <a
                className="text-blue-600 underline"
                href="https://workos.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacybeleid
              </a>
            </li>
            <li>
              <strong>Convex:</strong> database, serverfuncties en
              bestandsopslag.{" "}
              <a
                className="text-blue-600 underline"
                href="https://www.convex.dev/legal/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacybeleid
              </a>
            </li>
            <li>
              <strong>Mux:</strong> opslag, verwerking en streaming van gebaren-
              en sponsorvideo&apos;s.{" "}
              <a
                className="text-blue-600 underline"
                href="https://www.mux.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacybeleid
              </a>
            </li>
            <li>
              <strong>Mollie:</strong> gehoste betaalafhandeling en
              betaalstatus.{" "}
              <a
                className="text-blue-600 underline"
                href="https://www.mollie.com/legal/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacybeleid
              </a>
            </li>
            <li>
              <strong>Expo:</strong> distributie en updates van de mobiele app.{" "}
              <a
                className="text-blue-600 underline"
                href="https://expo.dev/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacybeleid
              </a>
            </li>
            <li>
              <strong>E-mail- en queue-infrastructuur:</strong> verzending en
              tijdelijke wachtrijverwerking van transactionele e-mails.
            </li>
            <li>
              <strong>OpenPanel:</strong> zelfgehoste analysesoftware op
              analytics.zias.be, uitsluitend na analytics-toestemming. De
              OpenPanel-cloud wordt niet gebruikt voor onze gebeurtenisdata.
            </li>
          </ul>
          <p className="mt-2">
            Persoonsgegevens worden niet verkocht. We delen ze alleen op grond
            van een overeenkomst, wettelijke verplichting of ander geldig
            juridisch kader.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            6. Analytics en identificatie
          </h2>
          <p>
            Analytics staat standaard uit. Na toestemming gebruikt de website
            een anoniem apparaatprofiel totdat u zich aanmeldt. De mobiele app
            kan een gastprofiel gebruiken. Na aanmelding kan het profiel worden
            gekoppeld aan uw WorkOS-ID, naam en e-mailadres. Bij uitloggen wordt
            de actieve analytics-identiteit gewist. Intrekken stopt nieuwe
            metingen; eerder rechtmatig verzamelde gegevens worden daardoor niet
            automatisch verwijderd. U kunt verwijdering aanvragen via ons
            contactadres.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            7. Cookies en lokale opslag
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              Noodzakelijke authenticatiecookies en beveiligde tokens houden uw
              sessie actief.
            </li>
            <li>
              Lokale opslag bewaart onder meer taal, thema, gastmodus, recente
              zoekopdrachten, appcache en uw analyticskeuze.
            </li>
            <li>
              Na analytics-toestemming kan OpenPanel lokale identificatie- en
              wachtrijgegevens bewaren om gebeurtenissen af te leveren.
            </li>
          </ul>
          <p className="mt-3">
            U kunt uw analyticskeuze hieronder op elk moment wijzigen:
          </p>
          <AnalyticsConsentControl />
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">8. Bewaartermijnen</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              Accountgegevens, favorieten en lijsten blijven bewaard zolang uw
              account bestaat of totdat u ze verwijdert.
            </li>
            <li>
              Gastaccounts met favorieten en lijsten worden na 12 maanden
              inactiviteit verwijderd.
            </li>
            <li>Beheerlogs worden maximaal 3 jaar bewaard.</li>
            <li>
              Niet-betaalde sponsoraanvragen worden na 24 uur geannuleerd.
              Onderliggende technische bestanden kunnen volgens operationele
              back-up- en opschooncycli later verdwijnen.
            </li>
            <li>
              Betaal-, sponsor- en factuurgegevens worden bewaard zolang dat
              nodig is voor de overeenkomst en maximaal 10 jaar wanneer de
              Belgische boekhoud- of fiscale regels dat vereisen.
            </li>
            <li>
              Analyticsgegevens worden bewaard volgens de ingestelde
              bewaartermijn van onze OpenPanel-installatie en niet langer dan
              nodig voor productanalyse.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            9. Accountverwijdering
          </h2>
          <p>
            De verwijderfunctie verwijdert het account, favorieten en eigen
            lijsten uit Convex en maakt relevante beheerreferenties los of
            anoniem. WorkOS-sessies en gegevens bij afzonderlijke
            dienstverleners kunnen hun eigen verwijdercyclus volgen. Sponsor-,
            betaal- en factuurgegevens die niet rechtstreeks aan het account
            zijn gekoppeld of wettelijk moeten worden bewaard, worden niet
            noodzakelijk door accountverwijdering gewist.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">10. Uw rechten</h2>
          <p>
            Onder de GDPR kunt u, afhankelijk van de omstandigheden, inzage,
            rectificatie, wissing, beperking, overdraagbaarheid of bezwaar
            vragen. U kunt toestemming altijd intrekken en een klacht indienen
            bij een toezichthouder. De accountpagina biedt een machineleesbare
            export en accountverwijdering. Voor andere verzoeken mailt u{" "}
            <a
              className="text-blue-600 underline"
              href="mailto:info@smog.vlaanderen"
            >
              info@smog.vlaanderen
            </a>
            . We kunnen informatie vragen om uw identiteit te verifiëren.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            11. Internationale doorgiften
          </h2>
          <p>
            Sommige dienstverleners kunnen persoonsgegevens buiten de Europese
            Economische Ruimte verwerken. Waar nodig gebruiken we een
            adequaatheidsbesluit, standaardcontractbepalingen of een ander
            rechtsgeldig doorgiftemechanisme en passende aanvullende
            beveiligingsmaatregelen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            12. Beveiliging en incidenten
          </h2>
          <p>
            We gebruiken passende technische en organisatorische maatregelen,
            waaronder toegangsbeperking, versleutelde verbindingen en
            afgeschermde secrets. Geen systeem is volledig risicoloos. Bij een
            meldingsplichtig incident informeren we de bevoegde autoriteit en,
            wanneer vereist, betrokken personen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">13. Kinderen</h2>
          <p>
            In België kan een kind vanaf 13 jaar zelf toestemming geven voor een
            rechtstreeks aangeboden online dienst. Is volgens het toepasselijke
            recht toestemming van een ouder of voogd nodig, dan moet die worden
            verkregen. Neem contact op wanneer u denkt dat gegevens van een kind
            onrechtmatig zijn verwerkt.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">14. Wijzigingen</h2>
          <p>
            We kunnen dit beleid bijwerken wanneer de Dienst, leveranciers of
            wetgeving wijzigen. De datum bovenaan wordt aangepast en bij
            belangrijke wijzigingen informeren we gebruikers in de app of via
            een passend kanaal. Waar nodig vragen we opnieuw toestemming.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">15. Contact en klacht</h2>
          <p>
            SMOG & CO vzw
            <br />
            Arthur Goemaerelei 66, 2018 Antwerpen, België
            <br />
            E-mail: info@smog.vlaanderen
            <br />
            Tel.: 03/216 29 90
            <br />
            O.N. 1009 954 991
          </p>
          <p className="mt-3">
            U kunt ook een klacht indienen bij de{" "}
            <a
              className="text-blue-600 underline"
              href="https://www.gegevensbeschermingsautoriteit.be/burger/acties/klacht-indienen"
              rel="noopener noreferrer"
              target="_blank"
            >
              Belgische Gegevensbeschermingsautoriteit
            </a>{" "}
            of bij uw lokale toezichthouder.
          </p>
        </section>
      </div>
    </div>
  );
}
