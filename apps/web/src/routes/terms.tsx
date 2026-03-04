import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <div className="container overflow-y-auto px-12 py-8">
      <h1 className="mb-6 font-bold text-4xl">Servicevoorwaarden</h1>
      <p className="mb-4">Laatst bijgewerkt: 03 maart 2026</p>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            1. Acceptatie van voorwaarden
          </h2>
          <p>
            Door toegang te krijgen tot en gebruik te maken van SMOG&Co ("de
            Dienst"), beheerd door SMOG&Co VZW (België), aanvaardt u de
            voorwaarden van deze overeenkomst en gaat u ermee akkoord. Als u
            niet akkoord gaat met deze Servicevoorwaarden, gebruik de Dienst dan
            niet.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            2. Beschrijving van de dienst
          </h2>
          <p>
            SMOG&Co is een applicatie voor het leren van gebarentaal die het
            volgende biedt:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Toegang tot een bibliotheek met gebarentaalvideo's</li>
            <li>Zoeken en categoriseren van gebaren</li>
            <li>Mogelijkheid om favoriete gebaren op te slaan</li>
            <li>
              Synchronisatie tussen apparaten voor geregistreerde gebruikers
            </li>
            <li>Gastmodus voor tijdelijke toegang zonder registratie</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">3. Gebruikersaccounts</h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.1 Account aanmaken
          </h3>
          <p>
            U kunt een account aanmaken via WorkOS-authenticatie. U bent
            verantwoordelijk voor het vertrouwelijk houden van uw
            accountgegevens en voor alle activiteiten onder uw account.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">3.2 Gastmodus</h3>
          <p>
            U kunt de Dienst als gast gebruiken zonder een account aan te maken.
            Gastgegevens worden lokaal op uw apparaat opgeslagen en na 12
            maanden inactiviteit automatisch verwijderd.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.3 Account beëindiging
          </h3>
          <p>
            U kunt uw account op elk moment verwijderen via de
            instellingenpagina. Na verwijdering worden al uw persoonsgegevens
            binnen 30 dagen definitief verwijderd.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">4. Gebruikersgedrag</h2>
          <p>U stemt ermee in NIET:</p>
          <ul className="ml-6 list-disc space-y-1">
            <li>De Dienst te gebruiken voor illegale doeleinden</li>
            <li>
              Te proberen ongeautoriseerde toegang te verkrijgen tot enig deel
              van de Dienst
            </li>
            <li>
              De Dienst of servers/netwerken die ermee verbonden zijn te
              verstoren
            </li>
            <li>
              Geautomatiseerde systemen te gebruiken om toegang te krijgen tot
              de Dienst zonder onze voorafgaande schriftelijke toestemming
            </li>
            <li>
              Een deel van de Dienst te reproduceren, dupliceren, kopiëren of
              door te verkopen
            </li>
            <li>
              Auteursrecht-, merk- of eigendomsvermeldingen te verwijderen of te
              wijzigen
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            5. Intellectuele eigendom
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">5.1 Onze inhoud</h3>
          <p>
            Alle inhoud die via de Dienst wordt aangeboden, waaronder
            gebarenvideo's, tekst, grafieken, logo's en software, is eigendom
            van SMOG&Co of haar licentiegevers en wordt beschermd door
            auteursrecht en andere wetten inzake intellectuele eigendom.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">5.2 Licentie</h3>
          <p>
            Wij verlenen u een beperkte, niet-exclusieve, niet-overdraagbare
            licentie om de Dienst te gebruiken voor persoonlijk,
            niet-commercieel gebruik. Deze licentie omvat geen rechten om:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Gebarenvideo's te downloaden of te kopiëren (behalve via normale
              caching)
            </li>
            <li>Wijzigingen aan te brengen of afgeleide werken te maken</li>
            <li>De inhoud openbaar te tonen of uit te voeren</li>
            <li>De inhoud voor commerciële doeleinden te gebruiken</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            5.3 Educatief gebruik
          </h3>
          <p>
            De Dienst is bedoeld voor educatieve doeleinden om gebruikers
            gebarentaal te leren. Gebruikers worden aangemoedigd de opgedane
            kennis te gebruiken om te communiceren en anderen te onderwijzen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">6. Privacy</h2>
          <p>
            Uw gebruik van de Dienst wordt ook beheerst door ons Privacybeleid.
            Door de Dienst te gebruiken, stemt u in met het verzamelen en
            gebruiken van uw informatie zoals beschreven in het Privacybeleid.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">7. Disclaimers</h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            7.1 Beschikbaarheid van de dienst
          </h3>
          <p>
            De Dienst wordt geleverd "zoals deze is" en "zoals beschikbaar"
            zonder enige garanties. We garanderen niet dat de Dienst
            ononderbroken, tijdig, veilig of foutloos zal zijn.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            7.2 Educatieve inhoud
          </h3>
          <p>
            Hoewel we streven naar correcte gebarendemonstraties, garanderen we
            niet de nauwkeurigheid, volledigheid of bruikbaarheid van de inhoud.
            Gebarentaal kan per regio en context verschillen.
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            7.3 Geen professioneel advies
          </h3>
          <p>
            De Dienst is uitsluitend bedoeld voor educatieve doeleinden en vormt
            geen professioneel gebarentaalonderwijs of certificering.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            8. Beperking van aansprakelijkheid
          </h2>
          <p>
            Voor zover wettelijk toegestaan is SMOG&Co niet aansprakelijk voor
            indirecte, incidentele, bijzondere, gevolg- of punitieve schade, of
            verlies van winst, inkomsten, gegevens, gebruik, goodwill of andere
            immateriële verliezen die voortvloeien uit:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Uw toegang tot of gebruik van, of het onvermogen om toegang te
              krijgen tot of gebruik te maken van de Dienst
            </li>
            <li>Het gedrag of de inhoud van derden op de Dienst</li>
            <li>Inhoud verkregen via de Dienst</li>
            <li>
              Ongeautoriseerde toegang, gebruik of wijziging van uw transmissies
              of inhoud
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">9. Vrijwaring</h2>
          <p>
            U stemt ermee in SMOG&Co, haar bestuurders, werknemers en agenten te
            vrijwaren voor claims, schade, verplichtingen, verliezen,
            aansprakelijkheden, kosten of uitgaven die voortvloeien uit: (i) uw
            gebruik van de Dienst; (ii) uw schending van deze voorwaarden; of
            (iii) uw schending van rechten van derden.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            10. Wijzigingen aan de dienst
          </h2>
          <p>
            Wij behouden ons het recht voor om de Dienst (of een deel daarvan)
            tijdelijk of permanent te wijzigen of stop te zetten, met of zonder
            voorafgaande kennisgeving. Wij zijn niet aansprakelijk voor enige
            wijziging, opschorting of stopzetting van de Dienst.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            11. Wijzigingen van voorwaarden
          </h2>
          <p>
            Wij behouden ons het recht voor om deze voorwaarden op elk moment
            bij te werken of te wijzigen. We zullen u op de hoogte stellen van
            belangrijke wijzigingen door:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>De datum "Laatst bijgewerkt" hierboven bij te werken</li>
            <li>Een in-app melding weer te geven</li>
            <li>
              Acceptatie van nieuwe voorwaarden te vereisen bij de volgende
              aanmelding
            </li>
          </ul>
          <p className="mt-2">
            Als u de Dienst blijft gebruiken na dergelijke wijzigingen, betekent
            dit dat u de nieuwe voorwaarden accepteert.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            12. Toepasselijk recht
          </h2>
          <p>
            Deze voorwaarden worden beheerst door het Belgisch recht, zonder
            rekening te houden met conflicterende rechtsregels. U stemt ermee in
            dat de rechtbanken in België exclusief bevoegd zijn voor het
            oplossen van geschillen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">13. Scheidbaarheid</h2>
          <p>
            Als een bepaling van deze voorwaarden niet afdwingbaar of ongeldig
            wordt bevonden, wordt die bepaling beperkt of verwijderd tot het
            minimum dat nodig is zodat deze voorwaarden verder volledig van
            kracht blijven.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            14. Volledige overeenkomst
          </h2>
          <p>
            Deze voorwaarden vormen samen met het Privacybeleid de volledige
            overeenkomst tussen u en SMOG&Co met betrekking tot het gebruik van
            de Dienst en vervangen alle eerdere overeenkomsten en afspraken.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">15. Contactgegevens</h2>
          <p>
            Als u vragen heeft over deze voorwaarden, neem dan contact met ons
            op via:
          </p>
          <p className="mt-2">
            <strong>E-mail:</strong> info@smog.vlaanderen
            <br />
            <strong>Adres:</strong> SMOG & CO vzw
            <br />
            Arthur Goemaerelei 66
            <br />
            2018 Antwerpen
            <br />
            <strong>Tel:</strong> 03/216 29 90
            <br />
            <strong>Ondernemings Nummer:</strong> O.N. 1009 954 991
          </p>
        </section>

        <section className="border-gray-300 border-t pt-6">
          <p className="text-sm">
            Door SMOG&Co te gebruiken, bevestigt u dat u deze Servicevoorwaarden
            hebt gelezen, begrepen en ermee akkoord gaat.
          </p>
        </section>
      </div>
    </div>
  );
}
