// src/app/terms/page.tsx
// Conditions Générales d'Utilisation — accessible publiquement (App Store / Play Store)

export const metadata = {
  title: "Conditions d'utilisation application Climat & Confort Moreau — Solutions & Connect",
  description: "Conditions générales d'utilisation de l'application Climat & Confort Moreau",
};

export default function TermsPage() {
  const lastUpdate = "21 mai 2025";
  const company = "Climat & Confort Moreau";
  const developpeur = "Solutions & Connect";
  const email = "solutionsandconnect@gmail.com";

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Conditions Générales d'Utilisation</h1>
        <p className="text-sm text-gray-500 mb-10">Dernière mise à jour : {lastUpdate}</p>

        <Section title="1. Objet">
          <p>
            Les présentes Conditions Générales d'Utilisation (ci-après «&nbsp;CGU&nbsp;») régissent l'accès et l'utilisation de
            l'application <strong>Climat &amp; Confort Moreau</strong> (ci-après «&nbsp;l'Application&nbsp;»), éditée pour
            <strong> {company}</strong> (ci-après «&nbsp;le Collaborateur&nbsp;»), développé par
            <strong> {developpeur}</strong> (ci-après «&nbsp;la Société&nbsp;»).
          </p>
          <p className="mt-3">
            L'Application est un outil de gestion interne destiné exclusivement aux partenaires du Collaborateur. Elle permet
            la gestion des interventions, chantiers, logements, planning et communications internes.
          </p>
          <p className="mt-3">
            L'accès à l'Application implique l'acceptation pleine et entière des présentes CGU.
          </p>
        </Section>

        <Section title="2. Accès à l'Application">
          <p>
            L'accès à l'Application est réservé aux seuls collaborateurs de {company} disposant d'un compte créé par un
            administrateur. Aucune inscription libre n'est possible.
          </p>
          <p className="mt-3">Les identifiants de connexion (email et mot de passe) sont strictement personnels et confidentiels. L'utilisateur s'engage à&nbsp;:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Ne pas communiquer ses identifiants à des tiers.</li>
            <li>Informer immédiatement un administrateur en cas de perte, vol ou suspicion d'utilisation frauduleuse de son compte.</li>
            <li>Se déconnecter de l'Application à l'issue de chaque session sur un appareil partagé.</li>
          </ul>
          <p className="mt-3">
            La Société se réserve le droit de suspendre ou de désactiver tout compte en cas de violation des présentes CGU ou à la fin de la relation professionnelle avec le Collaborateur.
          </p>
        </Section>

        <Section title="3. Utilisation de l'Application">
          <p>L'Application doit être utilisée conformément à sa destination professionnelle. L'utilisateur s'engage à&nbsp;:</p>
          <ul className="list-disc pl-6 mt-3 space-y-2">
            <li>Utiliser l'Application uniquement dans le cadre de ses fonctions au sein de {company}.</li>
            <li>Ne renseigner que des informations exactes et à jour.</li>
            <li>Ne pas utiliser l'Application à des fins personnelles, illicites ou contraires aux intérêts de la Société et de {company}.</li>
            <li>Ne pas tenter d'accéder à des données auxquelles ses droits ne lui permettent pas d'accéder.</li>
            <li>Ne pas reproduire, modifier, distribuer ou exploiter tout ou partie de l'Application sans autorisation expresse de la Société.</li>
            <li>Respecter la confidentialité des données des occupants, clients et tiers auxquelles il accède dans le cadre de ses fonctions.</li>
          </ul>
        </Section>

        <Section title="4. Données saisies">
          <p>
            L'utilisateur est responsable de l'exactitude des données qu'il saisit dans l'Application (comptes rendus, signatures,
            photos, informations de contact, etc.). La Société ne peut être tenue responsable des conséquences d'informations
            erronées saisies par un utilisateur.
          </p>
          <p className="mt-3">
            Les signatures électroniques recueillies via l'Application ont valeur probatoire dans le cadre de l'activité
            professionnelle interne de {company}. Leur portée juridique vis-à-vis des tiers dépend de la réglementation applicable.
          </p>
        </Section>

        <Section title="5. Disponibilité et maintenance">
          <p>
            La Société s'efforce d'assurer la disponibilité de l'Application 24h/24 et 7j/7, mais ne peut garantir une disponibilité
            ininterrompue. Des interruptions peuvent survenir pour des raisons de maintenance, de mise à jour ou de force majeure.
          </p>
          <p className="mt-3">
            La Société se réserve le droit de modifier, suspendre ou interrompre tout ou partie des fonctionnalités de l'Application
            à tout moment, notamment pour des raisons techniques ou d'évolution de l'activité.
          </p>
        </Section>

        <Section title="6. Responsabilités">
          <p><strong>Responsabilité de la Société&nbsp;:</strong> La Société ne peut être tenue responsable&nbsp;:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Des dommages résultant d'une utilisation non conforme de l'Application.</li>
            <li>Des interruptions de service dues à des défaillances techniques indépendantes de sa volonté (réseau, hébergeur, etc.).</li>
            <li>Des pertes de données consécutives à une défaillance technique, bien que des sauvegardes soient assurées par les services Firebase.</li>
          </ul>
          <p className="mt-3"><strong>Responsabilité de l'utilisateur&nbsp;:</strong> L'utilisateur est responsable&nbsp;:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>De l'utilisation faite de son compte et des données saisies.</li>
            <li>De la confidentialité de ses identifiants.</li>
            <li>Du respect des données personnelles des tiers auxquelles il accède dans le cadre de ses fonctions.</li>
          </ul>
        </Section>

        <Section title="7. Propriété intellectuelle">
          <p>
            L'ensemble des éléments constituant l'Application (code source, interfaces, graphismes, logos, base de données)
            sont la propriété exclusive de {developpeur} ou de ses prestataires et sont protégés par le droit de la propriété intellectuelle.
          </p>
          <p className="mt-3">
            Toute reproduction, représentation, modification ou exploitation non autorisée est strictement interdite et pourra
            faire l'objet de poursuites.
          </p>
        </Section>

        <Section title="8. Confidentialité">
          <p>
            Le traitement des données personnelles est décrit dans la{" "}
            <a href="/privacy" className="text-blue-600 underline">Politique de confidentialité</a>,
            accessible depuis l'Application.
          </p>
        </Section>

        <Section title="9. Modifications des CGU">
          <p>
            La Société se réserve le droit de modifier les présentes CGU à tout moment. Les modifications entrent en vigueur dès
            leur publication. Les utilisateurs seront informés de toute modification substantielle. La poursuite de l'utilisation
            de l'Application après notification vaut acceptation des nouvelles CGU.
          </p>
        </Section>

        <Section title="10. Droit applicable et juridiction compétente">
          <p>
            Les présentes CGU sont soumises au droit français. En cas de litige relatif à leur interprétation ou à leur exécution,
            les parties s'efforceront de trouver une solution amiable. À défaut, les tribunaux compétents du ressort du siège social
            de {developpeur} seront seuls compétents.
          </p>
        </Section>

        <Section title="11. Contact">
          <p>Pour toute question relative aux présentes CGU&nbsp;:</p>
          <p className="mt-2">
            <strong>{developpeur}</strong><br />
            Email&nbsp;: <a href={`mailto:${email}`} className="text-blue-600 underline">{email}</a>
          </p>
        </Section>

        <p className="mt-12 text-xs text-gray-400 text-center">
          © {new Date().getFullYear()} {developpeur} — Tous droits réservés
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
