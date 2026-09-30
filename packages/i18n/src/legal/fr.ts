import type { LegalTexts } from "./types";

/** The legal texts in French: a translation of `nl.ts`, which prevails. */
export const fr: LegalTexts = {
  privacy: {
    sections: [
      {
        blocks: [
          "La présente politique de confidentialité décrit comment SMOG & CO vzw traite les données personnelles lorsque vous utilisez le site web SMOG&Co, l'application mobile, les comptes, les listes partagées, le parrainage et l'assistance associée (ensemble\u202f: le «\u202fService\u202f»).",
        ],
        id: "scope",
        title: "Champ d'application",
      },
      {
        blocks: [
          "SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Anvers, Belgique, numéro d'entreprise 1009 954 991, est le responsable du traitement. Vous pouvez envoyer vos questions sur la vie privée à [info@smog.vlaanderen](mailto:info@smog.vlaanderen).",
        ],
        id: "controller",
        title: "Responsable du traitement",
      },
      {
        blocks: [
          {
            list: [
              "**Compte et connexion\u202f:** nom, adresse e-mail et sa vérification, langue, rôle, éventuellement une photo de profil de Google ou d'Apple, sessions (avec l'adresse IP et les données du navigateur ou de l'application) et horodatages. Un mot de passe n'est conservé que sous forme de hachage irréversible\u202f; d'une clé d'accès (passkey), nous ne conservons que la clé publique. Si vous vous connectez avec Google ou Apple, ils nous transmettent un identifiant de compte, votre nom et votre adresse e-mail.",
              "**Utilisation sans compte\u202f:** les favoris, les listes, les recherches récentes, les préférences et votre choix concernant les statistiques restent sur votre appareil. Ils ne quittent pas votre appareil, sauf si, après vous être connecté, vous choisissez de les importer dans votre compte.",
              "**Fonctions d'apprentissage\u202f:** gestes favoris, listes, descriptions de listes, liens de partage et leurs droits (consulter ou modifier). Les termes de recherche récents restent localement sur votre appareil.",
              "**Parrainage\u202f:** nom de contact, nom du sponsor ou de l'entreprise, e-mail, gestes choisis, nom affiché, logo facultatif, vidéos d'aperçu et finales, statut, référence de paiement et durée.",
              "**Facturation\u202f:** nom de facturation, numéro de TVA ou d'entreprise et adresse e-mail de facturation lorsque vous demandez une facture. Mollie traite les données de paiement\u202f; SMOG&Co ne reçoit pas les données complètes de carte ou de compte bancaire.",
              "**Données techniques\u202f:** adresse IP, données de l'appareil, du navigateur et de l'application, journaux de sécurité, informations d'erreur et données nécessaires à la diffusion des vidéos et au trafic réseau. Lors de la connexion et de l'inscription, Cloudflare Turnstile vérifie que la demande provient d'un humain.",
              "**Historique du consentement\u202f:** lorsque vous êtes connecté, nous conservons vos choix concernant les statistiques (oui ou non, moment et version de la politique), afin de pouvoir démontrer quel choix s'applique.",
              "**Statistiques facultatives\u202f:** uniquement avec votre consentement\u202f: chemin de l'écran, plateforme, données d'événement limitées, identifiants de gestes, nombres de résultats et de catégories, longueur d'une recherche et lecture terminée. Nous n'envoyons ni termes de recherche, ni noms, ni adresses e-mail et n'enregistrons pas les sessions.",
            ],
          },
        ],
        id: "data",
        title: "Quelles données nous traitons",
      },
      {
        blocks: [
          {
            list: [
              "**Contrat\u202f:** fournir les comptes, les favoris, les listes, les listes partagées, le parrainage, les paiements, le traitement des vidéos et la communication transactionnelle.",
              "**Obligation légale\u202f:** comptabilité, facturation, obligations fiscales et réponse aux demandes légales valables.",
              "**Intérêt légitime\u202f:** sécurité, prévention de la fraude et des abus (comme Turnstile et des limites au nombre de requêtes), administration, diagnostic des erreurs et amélioration de la fiabilité du Service. Vous pouvez vous y opposer.",
              "**Consentement\u202f:** statistiques OpenPanel facultatives. Vous pouvez refuser ou retirer votre consentement plus tard sans perdre les fonctions de base.",
            ],
          },
        ],
        id: "purposes",
        title: "Finalités et bases juridiques",
      },
      {
        blocks: [
          "Seuls les collaborateurs autorisés et les prestataires qui soutiennent le Service y ont accès, dans la mesure nécessaire\u202f:",
          {
            list: [
              "**Cloudflare\u202f:** hébergement du site web et de l'API (Workers), de la base de données (D1), stockage de fichiers comme les logos des sponsors (R2), données temporaires (KV), files d'attente (Queues), envoi des e-mails (Email) et prévention des abus (Turnstile). [Politique de confidentialité](https://www.cloudflare.com/privacypolicy/)",
              "**Better Auth\u202f:** logiciel de connexion open source que nous faisons fonctionner nous-mêmes dans notre environnement Cloudflare. Aucune donnée n'est envoyée à un prestataire distinct pour cela.",
              "**Mux\u202f:** stockage, traitement et diffusion des vidéos de gestes et de parrainage. [Politique de confidentialité](https://www.mux.com/privacy)",
              "**Mollie\u202f:** traitement hébergé des paiements et statut des paiements. [Politique de confidentialité](https://www.mollie.com/legal/privacy)",
              "**Expo\u202f:** distribution et mises à jour de l'application mobile. [Politique de confidentialité](https://expo.dev/privacy)",
              "**Google et Apple\u202f:** uniquement lorsque vous choisissez de vous connecter avec votre compte Google ou Apple. [Google](https://policies.google.com/privacy) · [Apple](https://www.apple.com/legal/privacy/)",
              "**OpenPanel\u202f:** logiciel de statistiques auto-hébergé sur analytics.zias.be, uniquement avec le consentement aux statistiques. Le cloud OpenPanel n'est pas utilisé pour nos données d'événements.",
            ],
          },
          "Les données personnelles ne sont pas vendues. Nous ne les partageons que sur la base d'un contrat, d'une obligation légale ou d'un autre cadre juridique valable.",
        ],
        id: "recipients",
        title: "Destinataires et prestataires",
      },
      {
        blocks: [
          "Les statistiques sont désactivées par défaut. Avec votre consentement, le site web et l'application utilisent un profil d'appareil anonyme. Le site web transmet les événements par notre propre serveur, sans scripts ni cookies de tiers. Après la connexion, le profil n'est lié qu'à votre identifiant d'utilisateur\u202f; votre nom et votre adresse e-mail ne sont pas envoyés aux statistiques. La déconnexion ou le retrait du consentement efface l'identité statistique. Le retrait arrête les nouvelles mesures\u202f; les données collectées légalement auparavant ne sont pas supprimées automatiquement. Vous pouvez en demander la suppression à notre adresse de contact.",
        ],
        id: "analytics",
        title: "Statistiques et identification",
      },
      {
        blocks: [
          "SMOG & Co ne suit pas les utilisateurs à travers les applications ou sites web d'autres entreprises. Nous n'utilisons pas les données statistiques pour de la publicité ciblée ou la mesure publicitaire et ne partageons pas les données statistiques avec des courtiers en données.",
        ],
        id: "no-tracking",
        title: "Pas de pistage ni de publicité",
      },
      {
        blocks: [
          {
            list: [
              "Des cookies nécessaires maintiennent votre session active lorsque vous êtes connecté et retiennent votre langue et votre thème.",
              "Le stockage local conserve notamment les favoris et les listes sans compte, les recherches récentes, les préférences, le cache de l'application et votre choix concernant les statistiques.",
              "Avec le consentement aux statistiques, le site web et l'application peuvent conserver localement des données d'identification et de file d'attente pour transmettre les événements.",
            ],
          },
          "Vous pouvez modifier votre choix concernant les statistiques ci-dessous à tout moment\u202f:",
          { consentControl: true },
        ],
        id: "cookies",
        title: "Cookies et stockage local",
      },
      {
        blocks: [
          {
            list: [
              "Les données du compte, les favoris et les listes sont conservés tant que votre compte existe ou jusqu'à ce que vous les supprimiez.",
              "Les journaux d'administration sont conservés au maximum 3 ans.",
              "Les demandes de parrainage non payées sont annulées après 24 heures. Les fichiers techniques sous-jacents peuvent disparaître plus tard, selon les cycles opérationnels de sauvegarde et de nettoyage.",
              "Les données de paiement, de sponsor et de facturation sont conservées aussi longtemps que nécessaire pour le contrat et jusqu'à 10 ans lorsque les règles comptables ou fiscales belges l'exigent.",
              "Les données statistiques sont conservées selon la durée de conservation définie dans notre installation OpenPanel et pas plus longtemps que nécessaire pour l'analyse du produit.",
            ],
          },
        ],
        id: "retention",
        title: "Durées de conservation",
      },
      {
        blocks: [
          "Vous pouvez supprimer votre compte sur la [page du compte](/account). Cela supprime immédiatement votre compte, vos sessions, vos méthodes de connexion et clés d'accès, vos favoris, vos propres listes avec leurs liens de partage et votre historique du consentement\u202f; les journaux d'administration qui vous concernent en sont détachés. Vous êtes déconnecté sur tous les appareils et les données de l'appareil utilisé sont effacées. Les données de sponsor, de paiement et de facturation ne sont pas liées à votre compte et sont conservées aussi longtemps que la loi l'exige (voir Durées de conservation). Les sauvegardes et les données chez des prestataires distincts peuvent suivre leur propre cycle de suppression.",
        ],
        id: "deletion",
        title: "Suppression du compte",
      },
      {
        blocks: [
          "En vertu du RGPD, vous pouvez, selon les circonstances, demander l'accès, la rectification, l'effacement, la limitation, la portabilité ou vous opposer au traitement. Vous pouvez toujours retirer votre consentement et introduire une plainte auprès d'une autorité de contrôle. La [page du compte](/account) propose une exportation lisible par machine (JSON) et la suppression du compte. Pour les autres demandes, écrivez à [info@smog.vlaanderen](mailto:info@smog.vlaanderen). Nous pouvons demander des informations pour vérifier votre identité.",
        ],
        id: "rights",
        title: "Vos droits",
      },
      {
        blocks: [
          "Certains prestataires peuvent traiter des données personnelles en dehors de l'Espace économique européen. Si nécessaire, nous utilisons une décision d'adéquation, des clauses contractuelles types ou un autre mécanisme de transfert valable, ainsi que des mesures de sécurité supplémentaires appropriées.",
        ],
        id: "transfers",
        title: "Transferts internationaux",
      },
      {
        blocks: [
          "Nous utilisons des mesures techniques et organisationnelles appropriées, dont la limitation des accès, des connexions chiffrées, des mots de passe hachés et des secrets protégés. Aucun système n'est entièrement sans risque. En cas d'incident à notifier, nous informons l'autorité compétente et, si nécessaire, les personnes concernées.",
        ],
        id: "security",
        title: "Sécurité et incidents",
      },
      {
        blocks: [
          "En Belgique, un enfant de 13 ans ou plus peut donner lui-même son consentement pour un service en ligne qui lui est proposé directement. Si le droit applicable exige le consentement d'un parent ou d'un tuteur, celui-ci doit être obtenu. Contactez-nous si vous pensez que les données d'un enfant ont été traitées de manière illicite.",
        ],
        id: "children",
        title: "Enfants",
      },
      {
        blocks: [
          "Nous pouvons mettre à jour cette politique lorsque le Service, les fournisseurs ou la législation changent. La date en haut de la page est adaptée et nous informons les utilisateurs des changements importants dans l'application ou par un canal approprié. Si nécessaire, nous demandons à nouveau votre consentement.",
        ],
        id: "changes",
        title: "Modifications",
      },
      {
        blocks: [
          {
            lines: [
              "SMOG & CO vzw",
              "Arthur Goemaerelei 66, 2018 Anvers, Belgique",
              "E-mail\u202f: [info@smog.vlaanderen](mailto:info@smog.vlaanderen)",
              "Tél.\u202f: +32 3 216 29 90",
              "Numéro d'entreprise 1009 954 991",
            ],
          },
          "Vous pouvez aussi introduire une plainte auprès de l'[Autorité de protection des données belge](https://www.autoriteprotectiondonnees.be) ou de votre autorité de contrôle locale.",
        ],
        id: "contact",
        title: "Contact et plainte",
      },
    ],
    title: "Politique de confidentialité",
  },
  terms: {
    sections: [
      {
        blocks: [
          "Les présentes conditions s'appliquent au site web SMOG&Co, à l'application mobile, aux comptes, aux listes, au parrainage et aux services associés (le «\u202fService\u202f»), proposés par SMOG & CO vzw, Arthur Goemaerelei 66, 2018 Anvers, Belgique, numéro d'entreprise 1009 954 991. En utilisant le Service, vous acceptez ces conditions. Le droit impératif de la consommation reste toujours applicable.",
        ],
        id: "provider",
        title: "Application et prestataire",
      },
      {
        blocks: [
          "Le Service propose une bibliothèque de vidéos de gestes, la recherche et les filtres, les favoris, vos propres listes et des listes partagées, l'utilisation sans compte, la synchronisation du compte et la possibilité de parrainer un geste. Les fonctions peuvent différer selon la plateforme.",
        ],
        id: "service",
        title: "Description du Service",
      },
      {
        blocks: [
          "Vous pouvez créer un compte avec votre adresse e-mail (avec un mot de passe, un code ou un lien de connexion), une clé d'accès (passkey), ou votre compte Google ou Apple. Vous devez fournir des informations correctes, sécuriser votre compte et signaler les abus. Sans compte, les favoris et les listes ne sont conservés que sur votre appareil\u202f; ils disparaissent lorsque vous effacez les données de votre navigateur ou de l'application. Après la connexion, vous pouvez les importer dans votre compte. Partager une liste nécessite un compte. Vous pouvez supprimer votre compte sur la page du compte\u202f; des obligations légales de conservation et des transactions de parrainage distinctes peuvent exiger une conservation plus longue.",
        ],
        id: "accounts",
        title: "Comptes et utilisation sans compte",
      },
      {
        blocks: [
          "Vous ne pouvez pas utiliser le Service pour\u202f:",
          {
            list: [
              "enfreindre la loi ou les droits d'autrui\u202f;",
              "obtenir un accès non autorisé ou contourner la sécurité\u202f;",
              "perturber le Service, l'infrastructure ou d'autres utilisateurs\u202f;",
              "demander, copier ou revendre de grandes quantités de contenu de manière automatisée sans autorisation\u202f;",
              "fournir un contenu de parrainage trompeur, nuisible ou contrefaisant.",
            ],
          },
          "Nous pouvons limiter ou mettre fin à l'accès lorsque cela est raisonnablement nécessaire pour la sécurité, le respect de la loi ou une violation grave.",
        ],
        id: "use",
        title: "Utilisation autorisée",
      },
      {
        blocks: [
          "Le Service, les logiciels, les textes, la conception et les vidéos de gestes appartiennent à SMOG&Co ou à ses concédants. Vous obtenez une licence limitée, révocable, non exclusive et non transférable pour un usage personnel et éducatif. La mise en cache normale par le navigateur ou l'application est autorisée\u202f; le téléchargement, la republication, la modification, l'exploitation commerciale ou la création d'un produit vidéo dérivé nécessitent une autorisation préalable, sauf lorsque la loi le permet expressément.",
        ],
        id: "ip",
        title: "Propriété intellectuelle",
      },
      {
        blocks: [
          {
            list: [
              "Un parrainage associe le nom du sponsor, le texte et éventuellement le logo choisis à une ou plusieurs vidéos de gestes pendant la durée indiquée.",
              "Le prix, la durée et l'éventuel supplément pour le logo sont indiqués avant le paiement. Le serveur vérifie le montant dû. Une demande de parrainage n'est considérée comme payée qu'une fois le paiement confirmé par Mollie.",
              "SMOG&Co examine la vidéo parrainée avant sa publication et peut refuser un contenu illicite, trompeur, nuisible, inapproprié ou techniquement inutilisable. En cas de refus, nous vous contactons au sujet d'une modification ou d'un traitement approprié du paiement.",
              "Vous garantissez que vous disposez des droits et autorisations nécessaires pour les noms, marques, logos, textes et autres contenus fournis. Pour l'exécution du parrainage, vous accordez à SMOG&Co une licence non exclusive pour traiter, générer, héberger et afficher ce contenu.",
              "Les vidéos d'aperçu et finales peuvent être adaptées techniquement pour le format, la lisibilité et la diffusion. Un lien de modification fourni par SMOG&Co est personnel, valable 7 jours et ne peut pas être partagé.",
              "Environ 30 jours avant la fin de la durée, vous recevez un e-mail avec un lien pour renouveler le parrainage. Un renouvellement est un nouveau paiement pour une année supplémentaire au prix alors indiqué\u202f; un parrainage n'est jamais renouvelé automatiquement.",
              "Les demandes non payées peuvent être annulées après 24 heures. Pour une annulation, un remboursement ou un paiement erroné, contactez-nous\u202f; les droits légaux des consommateurs restent applicables.",
            ],
          },
        ],
        id: "sponsoring",
        title: "Parrainage",
      },
      {
        blocks: [
          "Les paiements passent par l'environnement de paiement hébergé de Mollie et sont soumis aux conditions du moyen de paiement choisi. Vous êtes responsable de l'exactitude des données de contact et de facturation. Les éventuelles taxes sont appliquées conformément à la loi. En cas de paiement contesté, annulé ou frauduleux, nous pouvons suspendre le parrainage pendant l'examen de l'affaire.",
        ],
        id: "payment",
        title: "Paiement et facturation",
      },
      {
        blocks: [
          "Notre [politique de confidentialité](/privacy) explique quelles données sont nécessaires au Service et quels traitements reposent sur une autre base juridique. Les statistiques facultatives ne sont activées qu'après un consentement distinct\u202f; l'utilisation du Service ne vaut pas consentement aux statistiques.",
        ],
        id: "privacy",
        title: "Vie privée",
      },
      {
        blocks: [
          "Nous visons un Service fiable et correct, mais ne garantissons ni une disponibilité ininterrompue ni un contenu sans erreur. L'usage des gestes peut varier selon la région, la personne et le contexte. Le Service est un outil éducatif et non une certification professionnelle, un service médical ou un substitut à un conseil personnel.",
        ],
        id: "availability",
        title: "Disponibilité et contenu éducatif",
      },
      {
        blocks: [
          "Dans la mesure permise par la loi, SMOG&Co n'est pas responsable des dommages indirects, des dommages consécutifs ou des pertes qui n'étaient pas raisonnablement prévisibles. Rien dans ces conditions ne limite une responsabilité qui ne peut pas être exclue par la loi, notamment la responsabilité pour faute intentionnelle ou faute grave lorsque le droit applicable le prévoit. Les consommateurs conservent leurs recours légaux impératifs.",
        ],
        id: "liability",
        title: "Responsabilité",
      },
      {
        blocks: [
          "Vous restez responsable du contenu que vous fournissez. Dans la mesure permise par la loi, un utilisateur professionnel indemnise SMOG&Co des réclamations de tiers qui résultent directement d'une utilisation intentionnellement illicite ou d'un contenu de parrainage fourni pour lequel cet utilisateur ne dispose pas des droits requis. Cette disposition ne limite pas la protection légale des consommateurs.",
        ],
        id: "indemnity",
        title: "Contenu des utilisateurs et indemnisation",
      },
      {
        blocks: [
          "Nous pouvons modifier, entretenir ou arrêter des fonctions. Si un changement important affecte substantiellement un parrainage payé en cours, nous cherchons une solution raisonnable. Nous pouvons adapter ces conditions et indiquons toujours la nouvelle date. Nous informons les utilisateurs des changements substantiels par le Service ou un canal de contact approprié.",
        ],
        id: "changes",
        title: "Modifications et arrêt",
      },
      {
        blocks: [
          "Le droit belge est applicable. Les litiges relèvent des tribunaux belges compétents, sauf lorsque le droit impératif de la consommation vous donne le droit de choisir un autre tribunal compétent. Essayez d'abord de résoudre un problème avec nous via [info@smog.vlaanderen](mailto:info@smog.vlaanderen).",
        ],
        id: "law",
        title: "Droit applicable et litiges",
      },
      {
        blocks: [
          "Si une disposition est invalide ou inapplicable, les autres dispositions restent en vigueur. Le fait de ne pas faire valoir immédiatement un droit ne constitue pas une renonciation à celui-ci. Ces conditions et la politique de confidentialité constituent les accords sur l'utilisation du Service, en plus des informations spécifiques affichées lors d'un achat.",
        ],
        id: "general",
        title: "Autres dispositions",
      },
      {
        blocks: [
          {
            lines: [
              "SMOG & CO vzw",
              "Arthur Goemaerelei 66, 2018 Anvers, Belgique",
              "E-mail\u202f: [info@smog.vlaanderen](mailto:info@smog.vlaanderen)",
              "Tél.\u202f: +32 3 216 29 90",
              "Numéro d'entreprise 1009 954 991",
            ],
          },
        ],
        id: "contact",
        title: "Contact",
      },
    ],
    title: "Conditions d'utilisation",
  },
};
