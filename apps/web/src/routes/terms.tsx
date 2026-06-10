import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <div className="container overflow-y-auto px-12 py-8">
      <h1 className="mb-6 font-bold text-4xl">Servicevoorwaarden</h1>
      <p className="mb-4">Laatst bijgewerkt: 10 juni 2026</p>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            1. Toepassing en aanbieder
          </h2>
          <p>
            Deze voorwaarden gelden voor de SMOG&Co-website, mobiele app,
            accounts, lijsten, sponsoring en bijbehorende diensten (de
            "Dienst"), aangeboden door SMOG & CO vzw, Arthur Goemaerelei 66,
            2018 Antwerpen, België, O.N. 1009 954 991. Door de Dienst te
            gebruiken gaat u akkoord met deze voorwaarden. Dwingend
            consumentenrecht blijft altijd gelden.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            2. Beschrijving van de Dienst
          </h2>
          <p>
            De Dienst biedt een bibliotheek met gebarenvideo&apos;s, zoeken en
            filteren, favorieten, eigen en gedeelde lijsten, gastgebruik,
            accountsynchronisatie en de mogelijkheid om een gebaar te sponsoren.
            Functies kunnen per platform verschillen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            3. Accounts en gastmodus
          </h2>
          <p>
            Accounts worden via WorkOS aangemaakt. U moet correcte informatie
            verstrekken, uw account beveiligen en misbruik melden. In gastmodus
            wordt een willekeurige gast-ID aangemaakt en worden favorieten en
            lijsten in onze backend bewaard. Inactieve gastgegevens worden na 12
            maanden verwijderd. U kunt een account verwijderen via de
            instellingen; wettelijke bewaarplichten en afzonderlijke
            sponsortransacties kunnen verdere bewaring vereisen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">4. Toegestaan gebruik</h2>
          <p>U mag de Dienst niet gebruiken om:</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>de wet of rechten van anderen te schenden;</li>
            <li>
              ongeautoriseerde toegang te verkrijgen of beveiliging te omzeilen;
            </li>
            <li>
              de Dienst, infrastructuur of andere gebruikers te verstoren;
            </li>
            <li>
              zonder toestemming geautomatiseerd grote hoeveelheden inhoud op te
              vragen, te kopiëren of door te verkopen;
            </li>
            <li>
              misleidende, schadelijke of inbreukmakende sponsorinhoud aan te
              leveren.
            </li>
          </ul>
          <p className="mt-2">
            We kunnen toegang beperken of beëindigen wanneer dat redelijk nodig
            is voor beveiliging, wettelijke naleving of een ernstige schending.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            5. Intellectuele eigendom
          </h2>
          <p>
            De Dienst, software, teksten, vormgeving en gebarenvideo&apos;s zijn
            eigendom van SMOG&Co of haar licentiegevers. U krijgt een beperkte,
            herroepbare, niet-exclusieve en niet-overdraagbare licentie voor
            persoonlijk en educatief gebruik. Normale browser- of appcaching is
            toegestaan; downloaden, herpubliceren, wijzigen, commercieel
            exploiteren of een afgeleid videoproduct maken vereist voorafgaande
            toestemming, behalve waar de wet dit uitdrukkelijk toestaat.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">6. Sponsoring</h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              Een sponsoring koppelt de gekozen sponsornaam, tekst en eventueel
              logo gedurende de getoonde looptijd aan een of meer
              gebarenvideo&apos;s.
            </li>
            <li>
              De prijs, looptijd en eventuele logo-opslag worden vóór betaling
              getoond. De server controleert het verschuldigde bedrag. Een
              sponsoraanvraag is pas betaald nadat Mollie de betaling bevestigt.
            </li>
            <li>
              SMOG&Co beoordeelt de aanvraag vóór publicatie en kan inhoud
              weigeren die onwettig, misleidend, schadelijk, ongepast of
              technisch onbruikbaar is. We nemen bij afwijzing contact op over
              aanpassing of een passende afhandeling van de betaling.
            </li>
            <li>
              U garandeert dat u de nodige rechten en toestemmingen bezit voor
              namen, merken, logo&apos;s, tekst en andere aangeleverde inhoud. U
              verleent SMOG&Co voor de uitvoering van de sponsoring een
              niet-exclusieve licentie om die inhoud te verwerken, te renderen,
              te hosten en te tonen.
            </li>
            <li>
              Voorbeeld- en eindvideo&apos;s kunnen technisch worden aangepast
              voor formaat, leesbaarheid en streaming. Een door SMOG&Co
              verstrekte herbewerkingslink is persoonlijk, tijdelijk en mag niet
              worden gedeeld.
            </li>
            <li>
              Onbetaalde aanvragen kunnen na 24 uur worden geannuleerd. Voor
              annulering, terugbetaling of een foutieve betaling neemt u contact
              op; wettelijke consumentenrechten blijven van toepassing.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            7. Betaling en facturatie
          </h2>
          <p>
            Betalingen verlopen via de gehoste betaalomgeving van Mollie en zijn
            onderworpen aan de voorwaarden van de gekozen betaalmethode. U bent
            verantwoordelijk voor correcte contact- en factuurgegevens.
            Eventuele belastingen worden toegepast zoals wettelijk vereist. Bij
            een betwiste, teruggedraaide of frauduleuze betaling mogen we de
            sponsoring opschorten terwijl de zaak wordt onderzocht.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">8. Privacy</h2>
          <p>
            Ons{" "}
            <Link className="text-blue-600 underline" to="/privacy">
              privacybeleid
            </Link>{" "}
            legt uit welke gegevens nodig zijn voor de Dienst en welke
            verwerking op een andere rechtsgrond berust. Optionele analytics
            wordt alleen na afzonderlijke toestemming ingeschakeld; gebruik van
            de Dienst geldt niet als analytics-toestemming.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            9. Beschikbaarheid en educatieve inhoud
          </h2>
          <p>
            We streven naar een betrouwbare en correcte Dienst, maar garanderen
            geen ononderbroken beschikbaarheid of foutloze inhoud.
            Gebarengebruik kan per regio, persoon en context verschillen. De
            Dienst is een educatief hulpmiddel en geen professionele
            certificering, medische dienst of vervanging voor persoonlijk
            advies.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">10. Aansprakelijkheid</h2>
          <p>
            Voor zover wettelijk toegestaan is SMOG&Co niet aansprakelijk voor
            indirecte schade, gevolgschade of verlies dat niet redelijk
            voorzienbaar was. Niets in deze voorwaarden beperkt
            aansprakelijkheid die wettelijk niet kan worden uitgesloten,
            waaronder aansprakelijkheid voor opzet of zware fout waar het
            toepasselijke recht dat bepaalt. Consumenten behouden hun
            dwingendrechtelijke remedies.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            11. Inhoud van gebruikers en schadeloosstelling
          </h2>
          <p>
            U blijft verantwoordelijk voor inhoud die u aanlevert. Voor zover
            wettelijk toegestaan, vergoedt een zakelijke gebruiker SMOG&Co voor
            aanspraken van derden die rechtstreeks voortvloeien uit opzettelijk
            onrechtmatig gebruik of uit aangeleverde sponsorinhoud waarvoor die
            gebruiker de vereiste rechten niet bezit. Deze bepaling beperkt geen
            wettelijke consumentenbescherming.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            12. Wijzigingen en stopzetting
          </h2>
          <p>
            We kunnen functies wijzigen, onderhouden of stopzetten. Bij een
            belangrijke wijziging die een lopende betaalde sponsoring wezenlijk
            raakt, zoeken we een redelijke oplossing. We kunnen deze voorwaarden
            aanpassen en vermelden steeds de nieuwe datum. Voor wezenlijke
            wijzigingen informeren we gebruikers via de Dienst of een passend
            contactkanaal.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            13. Toepasselijk recht en geschillen
          </h2>
          <p>
            Belgisch recht is van toepassing. Geschillen behoren tot de bevoegde
            Belgische rechtbanken, behalve wanneer dwingend consumentenrecht u
            het recht geeft een andere bevoegde rechtbank te kiezen. Probeer een
            probleem eerst via info@smog.vlaanderen met ons op te lossen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            14. Overige bepalingen
          </h2>
          <p>
            Als een bepaling ongeldig of onafdwingbaar is, blijven de overige
            bepalingen gelden. Het niet onmiddellijk afdwingen van een recht is
            geen afstand daarvan. Deze voorwaarden en het privacybeleid vormen
            de afspraken over het gebruik van de Dienst, naast specifieke
            informatie die bij een aankoop wordt getoond.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">15. Contact</h2>
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
        </section>
      </div>
    </div>
  );
}
