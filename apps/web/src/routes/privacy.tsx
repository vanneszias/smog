import { createFileRoute } from "@tanstack/react-router";

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
          <h2 className="mb-3 font-semibold text-2xl">1. Inleiding</h2>
          <p>
            Welkom bij SMOG&Co ("we", "ons" of "onze"). We zetten ons in voor de
            bescherming van uw persoonsgegevens en respecteren uw privacy. Dit
            Privacybeleid legt uit hoe we uw informatie verzamelen, gebruiken en
            beschermen wanneer u onze applicatie voor het leren van gebarentaal
            gebruikt.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            2. Informatie over de verwerkingsverantwoordelijke
          </h2>
          <p>
            De verwerkingsverantwoordelijke voor uw persoonsgegevens is SMOG&Co
            VZW (België). Voor privacyvragen kunt u contact opnemen via
            info@smog.vlaanderen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            3. Gegevens die wij verzamelen
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.1 Accountgegevens
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>E-mailadres (via WorkOS-authenticatie)</li>
            <li>Voor- en achternaam (via WorkOS-authenticatie)</li>
            <li>Gebruikers-ID (unieke identificator)</li>
            <li>Tijdstippen van accountaanmaak en laatste activiteit</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.2 Gebruikersvoorkeuren
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>Favoriete gebaren</li>
            <li>Zoekgeschiedenis (lokaal opgeslagen op uw apparaat)</li>
            <li>Taal- en themavoorkeuren</li>
          </ul>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            3.3 Gastmodusgegevens
          </h3>
          <ul className="ml-6 list-disc space-y-1">
            <li>Anonieme gast-id (bij gebruik van gastmodus)</li>
            <li>
              Gastgegevens worden na 12 maanden inactiviteit verwijderd als
              onderdeel van ons bewaarbeleid
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            4. Rechtsgrond voor verwerking (GDPR)
          </h2>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Uitvoering van de overeenkomst:</strong> Het verwerken van
              uw accountinformatie is noodzakelijk om onze diensten te leveren
            </li>
            <li>
              <strong>Gerechtvaardigd belang:</strong> Beveiliging,
              fraudepreventie en verbetering van de dienst
            </li>
            <li>
              <strong>Wettelijke verplichting:</strong> Naleving van
              toepasselijke wet- en regelgeving
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            5. Hoe wij uw gegevens gebruiken
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>Om onze dienst te leveren en te onderhouden</li>
            <li>Om uw account te authenticeren (via WorkOS)</li>
            <li>Om uw favorieten tussen apparaten te synchroniseren</li>
            <li>Om uw leerervaring te personaliseren</li>
            <li>Om klantenondersteuning te bieden</li>
            <li>Om aan wettelijke verplichtingen te voldoen</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            6. Diensten van derden
          </h2>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.1 Authenticatie - WorkOS
          </h3>
          <p>
            We gebruiken WorkOS voor veilige authenticatie. WorkOS verwerkt uw
            e-mailadres en naam om uw account aan te maken en te beheren. Zie
            het privacybeleid van WorkOS op:{" "}
            <a
              className="text-blue-600 underline"
              href="https://workos.com/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://workos.com/privacy
            </a>
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.2 Videohosting - Mux
          </h3>
          <p>
            We gebruiken Mux voor het hosten en streamen van
            demonstratievideo's. Mux kan technische gegevens verzamelen die
            nodig zijn voor videolevering. Zie het privacybeleid van Mux op:{" "}
            <a
              className="text-blue-600 underline"
              href="https://mux.com/privacy"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://mux.com/privacy
            </a>
          </p>

          <h3 className="mt-4 mb-2 font-semibold text-xl">
            6.3 Database - Convex
          </h3>
          <p>
            We gebruiken Convex om uw accountgegevens, favorieten en
            gebruikersvoorkeuren op te slaan. Convex is onze
            backend-databaseprovider.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            7. Gegevensopslag en beveiliging
          </h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Uw gegevens worden veilig opgeslagen met
              industriestandaard-encryptie
            </li>
            <li>
              Wij nemen passende technische en organisatorische maatregelen om
              uw gegevens te beschermen
            </li>
            <li>
              Toegang tot uw persoonsgegevens is beperkt tot geautoriseerd
              personeel
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">8. Bewaartermijnen</h2>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              <strong>Actieve accounts:</strong> Gegevens worden bewaard zolang
              uw account actief is
            </li>
            <li>
              <strong>Gastaccounts:</strong> Automatisch verwijderd na 12
              maanden inactiviteit
            </li>
            <li>
              <strong>Beheerlogs:</strong> 3 jaar bewaard voor auditdoeleinden
            </li>
            <li>
              <strong>Verwijderde accounts:</strong> Alle persoonsgegevens
              worden binnen 30 dagen na verwijderingsverzoek verwijderd
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">9. Uw rechten (GDPR)</h2>
          <p className="mb-2">U hebt de volgende rechten:</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong>Recht op inzage:</strong> Vraag een kopie van uw
              persoonsgegevens op (beschikbaar in Instellingen → Mijn gegevens
              downloaden)
            </li>
            <li>
              <strong>Recht op rectificatie:</strong> Corrigeer onjuiste
              gegevens via uw accountinstellingen
            </li>
            <li>
              <strong>Recht op wissing:</strong> Verwijder uw account en alle
              bijbehorende gegevens (Instellingen → Mijn account verwijderen)
            </li>
            <li>
              <strong>Recht op beperking van verwerking:</strong> Beperk hoe wij
              uw gegevens verwerken
            </li>
            <li>
              <strong>Recht op gegevensoverdraagbaarheid:</strong> Ontvang uw
              gegevens in een machineleesbaar formaat
            </li>
            <li>
              <strong>Recht van bezwaar:</strong> Maak bezwaar tegen verwerking
              op basis van gerechtvaardigd belang
            </li>
          </ul>
          <p className="mt-3">
            Om deze rechten uit te oefenen, gebruikt u de opties in uw
            accountinstellingen of neemt u rechtstreeks contact met ons op.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            10. Privacy van kinderen
          </h2>
          <p>
            Onze dienst is bedoeld voor gebruikers van 13 jaar en ouder (of de
            leeftijd van digitale toestemming in uw land). We verzamelen niet
            bewust gegevens van kinderen onder deze leeftijd. Als u denkt dat we
            gegevens van een kind hebben verzameld, neem dan onmiddellijk
            contact met ons op.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            11. Internationale gegevensoverdrachten
          </h2>
          <p>
            Uw gegevens kunnen worden overgedragen naar en verwerkt in landen
            buiten de EER/VK. We zorgen voor passende waarborgen, waaronder:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>
              Standaard contractuele clausules met externe verwerkers waar van
              toepassing
            </li>
            <li>
              Toereikendheidsbesluiten van de Europese Commissie waar van
              toepassing
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            12. Cookies en lokale opslag
          </h2>
          <p>
            We gebruiken cookies en lokale opslag om het volgende op te slaan:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>Strikt noodzakelijke cookies voor authenticatiesessies</li>
            <li>Gebruikersvoorkeuren (taal, thema)</li>
            <li>
              Recente zoekopdrachten (lokaal, niet naar servers verzonden)
            </li>
            <li>Gecachte gebaren voor offline toegang</li>
          </ul>
          <p className="mt-2">
            U kunt deze gegevens op elk moment wissen via uw
            apparaat-/browserinstellingen.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            13. Wijzigingen in dit beleid
          </h2>
          <p>
            We kunnen dit Privacybeleid van tijd tot tijd bijwerken. We
            informeren u over belangrijke wijzigingen door:
          </p>
          <ul className="ml-6 list-disc space-y-1">
            <li>De datum "Laatst bijgewerkt" te actualiseren</li>
            <li>Een in-app melding weer te geven</li>
            <li>Waar wettelijk vereist opnieuw toestemming te vragen</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">14. Contact</h2>
          <p>
            Voor privacyvragen, het uitoefenen van uw rechten of zorgen over
            gegevensbescherming kunt u contact opnemen via:
          </p>
          <p className="mt-2">
            <strong>E-mail:</strong> info@smog.vlaanderen
            <br />
            <strong>Adres:</strong> SMOG & CO vzw, Arthur Goemaerelei 66, 2018
            Antwerpen
            <br />
            <strong>Tel:</strong> 03/216 29 90
            <br />
            <strong>Ondernemings Nummer:</strong> O.N. 1009 954 991
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-semibold text-2xl">
            15. Toezichthoudende autoriteit
          </h2>
          <p>
            Als u zich in België bevindt, hebt u het recht om een klacht in te
            dienen bij de Belgische Gegevensbeschermingsautoriteit (GBA/APD).
            Als u zich elders in de EER of het VK bevindt, kunt u contact
            opnemen met uw lokale gegevensbeschermingsautoriteit.
          </p>
        </section>

        <section className="border-gray-300 border-t pt-6">
          <p className="text-sm">
            Dit privacybeleid is opgesteld om te voldoen aan de GDPR en de
            Belgische gegevensbeschermingswetgeving. Door onze dienst te
            gebruiken, bevestigt u dat u dit beleid hebt gelezen en begrepen.
          </p>
        </section>
      </div>
    </div>
  );
}
