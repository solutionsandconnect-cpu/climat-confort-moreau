// src/app/privacy/page.tsx
// Politique de confidentialité — accessible publiquement (App Store / Play Store)

export const metadata = {
  title: "Politique de confidentialité — Climat & Confort Moreau",
  description: "Politique de confidentialité de l'application Climat & Confort Moreau",
};

export default function PrivacyPage() {
  const lastUpdate = "21 mai 2025";
  const company = "Climat & Confort Moreau";
  const email = "contact@climatconfortmoreau.fr";
  const address = "France";

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Politique de confidentialité</h1>
        <p className="text-sm text-gray-500 mb-10">Dernière mise à jour : {lastUpdate}</p>

        <Section title="1. Présentation">
          <p>
            La présente politique de confidentialité décrit la manière dont <strong>{company}</strong> (ci-après «&nbsp;nous&nbsp;» ou «&nbsp;la Société&nbsp;»)
            collecte, utilise et protège les données à caractère personnel des utilisateurs de l'application mobile et web
            <strong> Climat &amp; Confort Moreau</strong> (ci-après «&nbsp;l'Application&nbsp;»).
          </p>
          <p className="mt-3">
            L'Application est un outil de gestion interne réservé exclusivement aux collaborateurs de {company}.
            Elle n'est pas accessible au grand public. Toute connexion est soumise à la création d'un compte par un administrateur de la Société.
          </p>
        </Section>

        <Section title="2. Responsable du traitement">
          <p><strong>{company}</strong><br />{address}<br />Email&nbsp;: <a href={`mailto:${email}`} className="text-blue-600 underline">{email}</a></p>
        </Section>

        <Section title="3. Données collectées">
          <p>Dans le cadre de l'utilisation de l'Application, nous collectons les catégories de données suivantes&nbsp;:</p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li><strong>Données d'identification et de contact&nbsp;:</strong> nom, prénom, adresse email professionnelle, numéro de téléphone, photo de profil.</li>
            <li><strong>Données professionnelles&nbsp;:</strong> service d'appartenance, type de poste (technicien, conducteur de travaux, administrateur, etc.), statut actif/inactif.</li>
            <li><strong>Données liées aux interventions&nbsp;:</strong> informations relatives aux logements gérés (numéro de logement, nom de l'occupant, coordonnées de l'occupant, étage), comptes rendus d'intervention, photos avant/après travaux, signatures électroniques, dates et horaires de rendez-vous, statuts d'avancement.</li>
            <li><strong>Données de localisation&nbsp;:</strong> adresses des chantiers et bâtiments (non collectées en temps réel depuis votre appareil). L'Application peut ouvrir un lien vers Google Maps ou Waze, ce qui soumet votre appareil aux politiques de ces services.</li>
            <li><strong>Données de messagerie interne&nbsp;:</strong> contenu des messages échangés entre collaborateurs au sein de l'Application.</li>
            <li><strong>Données de connexion&nbsp;:</strong> identifiant Firebase, date de dernière connexion, historique de sessions géré par Firebase Authentication.</li>
          </ul>
        </Section>

        <Section title="4. Finalités du traitement">
          <p>Les données sont traitées pour les finalités suivantes&nbsp;:</p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>Gestion et suivi des interventions, chantiers et logements.</li>
            <li>Coordination des équipes de techniciens (planning, affectation, relances).</li>
            <li>Génération et archivage de documents (quitus, comptes rendus, signatures).</li>
            <li>Communication interne entre collaborateurs.</li>
            <li>Notifications professionnelles (relances, alertes de planification).</li>
            <li>Administration des comptes utilisateurs.</li>
          </ul>
        </Section>

        <Section title="5. Base légale">
          <p>
            Le traitement des données repose sur&nbsp;:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li><strong>L'exécution du contrat de travail</strong>&nbsp;: l'utilisation de l'Application fait partie intégrante de l'activité professionnelle des collaborateurs.</li>
            <li><strong>L'intérêt légitime de la Société</strong>&nbsp;: organisation et suivi de l'activité opérationnelle.</li>
            <li><strong>L'obligation légale</strong>&nbsp;: conservation des documents requis par la réglementation (notamment en matière de travaux et de facturation).</li>
          </ul>
        </Section>

        <Section title="6. Durée de conservation">
          <p>Les données sont conservées aussi longtemps que nécessaire aux finalités poursuivies&nbsp;:</p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li><strong>Données de compte utilisateur&nbsp;:</strong> durée de la relation professionnelle, puis suppression ou anonymisation dans un délai raisonnable après le départ du collaborateur.</li>
            <li><strong>Données d'intervention et documents&nbsp;:</strong> durées légales applicables (notamment 10 ans pour les documents liés aux travaux de construction selon l'article L110-1 du Code de la construction).</li>
            <li><strong>Messages internes&nbsp;:</strong> 3 ans à compter de la dernière activité sur la conversation, sauf obligation légale contraire.</li>
          </ul>
        </Section>

        <Section title="7. Destinataires des données">
          <p>Les données sont accessibles aux seuls collaborateurs de {company} disposant d'un compte actif sur l'Application, dans la limite des droits correspondant à leur rôle (technicien, conducteur de travaux, administrateur).</p>
          <p className="mt-3">Aucune donnée n'est vendue, louée ou transmise à des tiers à des fins commerciales.</p>
        </Section>

        <Section title="8. Sous-traitants techniques">
          <p>Nous faisons appel aux sous-traitants suivants dans le cadre de l'hébergement et du fonctionnement de l'Application&nbsp;:</p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>
              <strong>Google Firebase (Google LLC)</strong>&nbsp;: hébergement de la base de données (Firestore), authentification, stockage de fichiers (Firebase Storage), notifications push (FCM). Google s'engage à respecter le RGPD dans le cadre de ses services Firebase (Data Processing Addendum disponible sur firebase.google.com).
            </li>
            <li>
              <strong>Vercel / hébergeur web</strong>&nbsp;: hébergement de la version web de l'Application.
            </li>
          </ul>
          <p className="mt-3">
            Des transferts de données vers les États-Unis peuvent intervenir dans le cadre des services Google. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne et le Data Privacy Framework UE-États-Unis.
          </p>
        </Section>

        <Section title="9. Sécurité">
          <p>
            Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données contre tout accès non autorisé, perte ou divulgation&nbsp;:
          </p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>Authentification sécurisée via Firebase Authentication (email / mot de passe).</li>
            <li>Règles de sécurité Firestore (Firestore Security Rules) limitant l'accès aux données selon le rôle de chaque utilisateur.</li>
            <li>Chiffrement des données en transit (HTTPS) et au repos (chiffrement AES-256 côté Google).</li>
            <li>Accès limité aux données selon le principe du moindre privilège.</li>
          </ul>
        </Section>

        <Section title="10. Droits des utilisateurs">
          <p>Conformément au Règlement Général sur la Protection des Données (RGPD – Règlement UE 2016/679) et à la loi Informatique et Libertés, chaque utilisateur dispose des droits suivants&nbsp;:</p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li><strong>Droit d'accès&nbsp;:</strong> obtenir une copie des données vous concernant.</li>
            <li><strong>Droit de rectification&nbsp;:</strong> corriger des données inexactes ou incomplètes.</li>
            <li><strong>Droit à l'effacement&nbsp;:</strong> demander la suppression de vos données, sous réserve des obligations légales de conservation.</li>
            <li><strong>Droit à la limitation du traitement&nbsp;:</strong> suspendre l'utilisation de vos données dans certains cas.</li>
            <li><strong>Droit à la portabilité&nbsp;:</strong> recevoir vos données dans un format structuré et lisible par machine.</li>
            <li><strong>Droit d'opposition&nbsp;:</strong> vous opposer à un traitement fondé sur l'intérêt légitime.</li>
          </ul>
          <p className="mt-3">
            Pour exercer ces droits, contactez-nous à&nbsp;: <a href={`mailto:${email}`} className="text-blue-600 underline">{email}</a>
          </p>
          <p className="mt-3">
            Vous disposez également du droit d'introduire une réclamation auprès de la Commission Nationale de l'Informatique et des Libertés (CNIL — <a href="https://www.cnil.fr" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">www.cnil.fr</a>).
          </p>
        </Section>

        <Section title="11. Cookies et traceurs">
          <p>
            L'Application web utilise exclusivement des cookies techniques strictement nécessaires au fonctionnement (session d'authentification Firebase). Aucun cookie publicitaire ou de suivi marketing n'est utilisé.
          </p>
        </Section>

        <Section title="12. Modifications">
          <p>
            Nous nous réservons le droit de modifier la présente politique à tout moment. En cas de modification substantielle, les utilisateurs seront informés via l'Application ou par email. La version en vigueur est celle publiée sur cette page, avec la date de dernière mise à jour indiquée en haut de document.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>Pour toute question relative à la présente politique ou au traitement de vos données&nbsp;:</p>
          <p className="mt-2"><strong>{company}</strong><br />{address}<br />Email&nbsp;: <a href={`mailto:${email}`} className="text-blue-600 underline">{email}</a></p>
        </Section>

        <p className="mt-12 text-xs text-gray-400 text-center">
          © {new Date().getFullYear()} {company} — Tous droits réservés
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-gray-800 mb-3 pb-1 border-b border-gray-200">{title}</h2>
      <div className="text-gray-700 leading-relaxed text-sm">{children}</div>
    </section>
  );
}
