"use client";
// src/app/feuilles-heures/page.tsx
// Liste des documents FH avec les 3 types : Fiche d'heures / Demande absence / Travaux imprévus

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, orderBy, onSnapshot, doc, Timestamp, DocumentReference, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin } from "@/store/authStore";
import { EmptyState, LoadingPage, SearchInput, FilterChip, Spinner } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { FileText, Plus, ChevronDown, ChevronUp, CheckCircle2, Clock, XCircle, Pencil } from "lucide-react";
import toast from "react-hot-toast";

const CATS = ["Fiche d'heures", "Demande autorisation absence", "Fiche de retour Travaux imprévus"];
const TYPES_FH = ["Plomberie", "Électricité", "SAV", "Atelier", "Dessin", "Magasin"];

interface DocFH {
  id: string;
  refUser?: DocumentReference;
  nom?: string; prenom?: string;
  mois?: string;
  debutSemaine?: Date; finSemaine?: Date;
  nomDocument?: string;
  typeDocument?: string;
  categorieDocument?: string;
  service?: string;
  etatTraitementDocument?: string;
  nbJours?: number;
  typeAbsence?: string;
  observations?: string;
  signatureUser?: string;
  signatureChefEquipe?: string;
  signatureResponsable?: string;
  dateCreate?: Date;
  // travaux imprevus
  estimationsMateriaux?: string;
  estimationsHeures?: string;
  visaChiffrage?: boolean;
  chiffrageTransmis?: string;
  acceptationTravauxImprevus?: string;
}

function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (typeof (v as any).toDate === "function") return (v as any).toDate();
  if (v instanceof Date) return v;
  return undefined;
}

function EtatBadge({ etat }: { etat?: string }) {
  const cfg = etat === "Validé" ? "bg-green-100 text-green-800" : etat === "Refusé" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-800";
  return <span className={cn("badge border-transparent text-xs", cfg)}>{etat ?? "En attente"}</span>;
}

function DocCard({ doc: item, userName, onEdit }: { doc: DocFH; userName?: string; onEdit: () => void; }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 cursor-pointer hover:bg-primary-bg/50" onClick={() => setOpen(!open)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><FileText size={16} className="text-primary" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-primary-text text-sm truncate">{item.nomDocument || item.typeDocument || "Document"}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {userName && <span className="text-xs text-secondary-text">{userName}</span>}
                {item.service && <span className="text-xs text-secondary-text">{item.service}</span>}
                {item.mois && <span className="text-xs text-secondary-text">{item.mois}</span>}
                {item.categorieDocument && <span className="text-xs text-primary font-medium">{item.categorieDocument}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <EtatBadge etat={item.etatTraitementDocument} />
            <button onClick={e => { e.stopPropagation(); onEdit(); }} className="p-1.5 rounded-lg text-secondary-text hover:text-primary hover:bg-primary/10"><Pencil size={13} /></button>
            {open ? <ChevronUp size={14} className="text-secondary-text" /> : <ChevronDown size={14} className="text-secondary-text" />}
          </div>
        </div>
      </div>
      {open && (
        <div className="border-t border-alternate px-4 py-3 bg-primary-bg/40 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            {item.debutSemaine && <div><p className="text-secondary-text">Semaine du</p><p className="font-medium">{formatDate(item.debutSemaine)} → {formatDate(item.finSemaine)}</p></div>}
            {item.nbJours !== undefined && item.nbJours !== null && <div><p className="text-secondary-text">Nb jours</p><p className="font-medium">{item.nbJours}</p></div>}
            {item.typeAbsence && <div><p className="text-secondary-text">Type absence</p><p className="font-medium">{item.typeAbsence}</p></div>}
            {item.estimationsMateriaux && <div><p className="text-secondary-text">Estim. matériaux</p><p className="font-medium">{item.estimationsMateriaux}</p></div>}
            {item.estimationsHeures && <div><p className="text-secondary-text">Estim. heures</p><p className="font-medium">{item.estimationsHeures}</p></div>}
            {item.chiffrageTransmis && <div><p className="text-secondary-text">Chiffrage transmis</p><p className="font-medium">{item.chiffrageTransmis}</p></div>}
          </div>
          {item.observations && <p className="text-xs text-secondary-text bg-secondary-bg rounded-lg px-3 py-2">{item.observations}</p>}
          <div className="flex flex-wrap gap-2">
            {[["Salarié", item.signatureUser], ["Chef d'équipe", item.signatureChefEquipe], ["Responsable", item.signatureResponsable]].map(([label, sig]) => (
              <div key={label} className={cn("flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg", sig ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                <CheckCircle2 size={11} />{label} {sig ? "✓" : "—"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FeuillesHeuresPage() {
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();
  const [docs, setDocs] = useState<DocFH[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState<string | null>(null);
  const [filtreEtat, setFiltreEtat] = useState<string | null>(null);
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!firebaseUser) return;
    setLoading(true);
    const userRef = doc(db, "usersapp", firebaseUser.uid);
    const q = isAdmin(userApp)
      ? query(collection(db, "Documents_fh"), orderBy("date_create", "desc"))
      : query(collection(db, "Documents_fh"), where("ref_user", "==", userRef), orderBy("date_create", "desc"));

    const unsub = onSnapshot(q, snap => {
      setDocs(snap.docs.map(d => ({
        id: d.id,
        refUser: d.data().ref_user as DocumentReference,
        nom: d.data().nom, prenom: d.data().prenom,
        mois: d.data().mois, nomDocument: d.data().nom_document,
        typeDocument: d.data().type_document,
        categorieDocument: d.data().categorie_document,
        service: d.data().service,
        etatTraitementDocument: d.data().etat_traitement_document,
        nbJours: d.data().nb_jours,
        typeAbsence: d.data().type_absence,
        observations: d.data().observations,
        debutSemaine: toDate(d.data().debut_semaine),
        finSemaine: toDate(d.data().fin_semaine),
        signatureUser: d.data().signature_user,
        signatureChefEquipe: d.data().signature_chef_equipe,
        signatureResponsable: d.data().signature_responsable,
        dateCreate: toDate(d.data().date_create),
        estimationsMateriaux: d.data().estimations_materiaux,
        estimationsHeures: d.data().estimations_heures,
        visaChiffrage: d.data().visa_chiffrage,
        chiffrageTransmis: d.data().chiffrage_transmis,
        acceptationTravauxImprevus: d.data().acceptation_travaux_imprevus,
      })));
      setLoading(false);
    });

    getDocs(collection(db, "usersapp")).then(snap => {
      const m = new Map<string, string>();
      snap.docs.forEach(d => m.set(d.id, (d.data().display_name as string) ?? `${d.data().prenom} ${d.data().nom}`));
      setUserNames(m);
    });

    return () => unsub();
  }, [firebaseUser, userApp]);

  const filtered = useMemo(() => docs.filter(d => {
    if (filtreCategorie && d.categorieDocument !== filtreCategorie) return false;
    if (filtreEtat && d.etatTraitementDocument !== filtreEtat) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const nom = d.refUser ? userNames.get(d.refUser.id) ?? "" : "";
      return d.nomDocument?.toLowerCase().includes(q) || nom.toLowerCase().includes(q) || d.mois?.toLowerCase().includes(q);
    }
    return true;
  }), [docs, filtreCategorie, filtreEtat, search, userNames]);

  if (loading) return <AppShell><LoadingPage /></AppShell>;

  return (
    <AppShell>
      <div className="animate-page-enter max-w-4xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Feuilles d&apos;heures</h1>
            <p className="text-sm text-secondary-text mt-0.5">{filtered.length} document{filtered.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => router.push("/feuilles-heures/nouveau")} className="btn-primary flex items-center gap-2">            <Plus size={16} /><span className="hidden sm:inline">Nouveau document</span>
          </button>
        </div>

        <div className="card p-4 mb-4 space-y-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Rechercher…" />
          <div>
            <p className="text-xs text-secondary-text mb-1.5">Type de document</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Tous" active={!filtreCategorie} onClick={() => setFiltreCategorie(null)} />
              {CATS.map(c => <FilterChip key={c} label={c === "Demande autorisation absence" ? "Absence" : c === "Fiche de retour Travaux imprévus" ? "Travaux imprévus" : "Fiche d'heures"} active={filtreCategorie === c} onClick={() => setFiltreCategorie(filtreCategorie === c ? null : c)} />)}
            </div>
          </div>
          <div>
            <p className="text-xs text-secondary-text mb-1.5">État</p>
            <div className="flex flex-wrap gap-1.5">
              <FilterChip label="Tous" active={!filtreEtat} onClick={() => setFiltreEtat(null)} />
              {["En attente", "Validé", "Refusé"].map(e => <FilterChip key={e} label={e} active={filtreEtat === e} onClick={() => setFiltreEtat(filtreEtat === e ? null : e)} />)}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<FileText size={28} />} title="Aucun document" description="Créez votre premier document." action={<button onClick={() => router.push("/feuilles-heures/nouveau")} className="btn-primary flex items-center gap-2"><Plus size={15} />Nouveau document</button>} />
        ) : (
          <div className="space-y-2">
            {filtered.map(d => (
              <DocCard key={d.id} doc={d}
                userName={d.refUser ? userNames.get(d.refUser.id) ?? `${d.prenom} ${d.nom}` : `${d.prenom} ${d.nom}`}
                onEdit={() => router.push(`/feuilles-heures/${d.id}`)} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
