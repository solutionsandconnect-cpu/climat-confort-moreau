"use client";
export const dynamic = "force-dynamic";
// src/app/batiments/[id]/edit/page.tsx — Modification d'un bâtiment

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore, isAdmin, canViewDashboard } from "@/store/authStore";
import { updateBatimentFull } from "@/lib/formsService";
import { Spinner } from "@/components/ui";
import { ArrowLeft, Building2, Check, MapPin, Key, Calendar, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface AdresseSuggestion {
  label: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  context?: string;
}

function EditBatimentPageContent({ batimentId }: { batimentId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userApp } = useAuthStore();
  const chantierId = searchParams.get("chantier");

  const [loading, setLoading] = useState(true);
  const [nom, setNom] = useState("");
  const [rue, setRue] = useState("");
  const [cp, setCp] = useState("");
  const [ville, setVille] = useState("");
  const [codeInterphone, setCodeInterphone] = useState("");
  const [infosAcces, setInfosAcces] = useState("");
  const [dateReception, setDateReception] = useState("");
  const [saving, setSaving] = useState(false);

  // Autocomplete adresse
  const [adresseQuery, setAdresseQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AdresseSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getDoc(doc(db, "Batiment", batimentId)).then(snap => {
      if (!snap.exists()) { toast.error("Bâtiment introuvable"); router.back(); return; }
      const d = snap.data();
      setNom(d.nom_batiment ?? "");
      setRue(d.rue_batiment ?? "");
      setCp(d.code_postale_batiment ?? "");
      setVille(d.ville_batiment ?? "");
      setCodeInterphone(d.code_interphone ?? "");
      setInfosAcces(d.informations_acces ?? "");
      if (d.date_reception) {
        const ts = d.date_reception as Timestamp;
        setDateReception(ts.toDate().toISOString().split("T")[0]);
      }
      const rueVal = d.rue_batiment ?? "";
      const cpVal = d.code_postale_batiment ?? "";
      const villeVal = d.ville_batiment ?? "";
      if (rueVal || cpVal || villeVal) {
        setAdresseQuery([rueVal, cpVal, villeVal].filter(Boolean).join(", "));
      }
      setLoading(false);
    });
  }, [batimentId, router]);

  useEffect(() => {
    if (adresseQuery.length < 3) { setSuggestions([]); setShowSuggestions(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresseQuery)}&limit=6&autocomplete=1`
        );
        const data = await res.json();
        const results: AdresseSuggestion[] = (data.features ?? []).map((f: any) => ({
          label: f.properties.label,
          housenumber: f.properties.housenumber,
          street: f.properties.street,
          postcode: f.properties.postcode,
          city: f.properties.city,
          context: f.properties.context,
        }));
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { setSuggestions([]); }
      finally { setLoadingSuggestions(false); }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [adresseQuery]);

  const selectAdresse = (s: AdresseSuggestion) => {
    const numRue = s.housenumber ?? "";
    const nomRue = s.street ?? "";
    setRue(`${numRue} ${nomRue}`.trim() || s.label);
    setCp(s.postcode ?? "");
    setVille(s.city ?? "");
    setAdresseQuery(s.label);
    setShowSuggestions(false);
  };

  if (loading) return <AppShell><div className="flex justify-center py-20"><Spinner size="lg" /></div></AppShell>;
  if (!isAdmin(userApp) && !canViewDashboard(userApp)) return <AppShell><div className="p-8 text-center">Accès réservé.</div></AppShell>;

  const handleSubmit = async () => {
    if (!nom.trim()) { toast.error("Le nom du bâtiment est obligatoire"); return; }
    setSaving(true);
    try {
      await updateBatimentFull(batimentId, {
        nomBatiment: nom, rue, codePostal: cp, ville,
        codeInterphone, informationsAcces: infosAcces,
        dateReception: dateReception ? new Date(dateReception) : null,
      });
      toast.success("Bâtiment mis à jour !");
      if (chantierId) {
        router.push(`/chantiers/${chantierId}`);
      } else {
        router.back();
      }
    } catch (e) { console.error(e); toast.error("Erreur lors de la mise à jour"); }
    finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="animate-page-enter px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-xl font-bold text-primary-text" style={{ fontFamily: "var(--font-inter-tight)" }}>Modifier le bâtiment</h1>
            <p className="text-xs text-secondary-text">{nom}</p>
          </div>
        </div>
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center border-2 border-primary/20"><Building2 size={28} className="text-primary" /></div>
        </div>

        <div className="space-y-4">
          {/* Nom */}
          <div className="card p-4">
            <label className="text-xs font-bold text-secondary-text uppercase tracking-wide block mb-2">Nom du bâtiment *</label>
            <input className="input-base" value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex: Bâtiment A" />
          </div>

          {/* Adresse avec autocomplétion */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
              <MapPin size={14} className="text-secondary-text" />
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Adresse</p>
            </div>
            <div className="relative">
              <label className="text-xs font-medium text-secondary-text">Rechercher une adresse</label>
              <div className="relative mt-1">
                <input className="input-base pr-9" value={adresseQuery}
                  onChange={e => setAdresseQuery(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  placeholder="Ex: 12 rue de la Paix, 44000 Nantes" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {loadingSuggestions ? <Spinner size="sm" /> : <Search size={15} className="text-secondary-text" />}
                </div>
              </div>
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-secondary-bg border border-alternate rounded-xl shadow-lg overflow-hidden">
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => selectAdresse(s)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary-bg transition-colors border-b border-alternate/50 last:border-0 flex items-start gap-2">
                      <MapPin size={13} className="text-secondary-text shrink-0 mt-0.5" />
                      <div>
                        <p className="text-primary-text text-sm leading-snug">{s.label}</p>
                        {s.context && <p className="text-xs text-secondary-text">{s.context}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-secondary-text">Ou saisissez manuellement :</p>
            <div>
              <label className="text-xs font-medium text-secondary-text">Rue / Voie</label>
              <input className="input-base mt-1" value={rue} onChange={e => setRue(e.target.value)} placeholder="Ex: 12 rue de la Paix" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-secondary-text">Code postal</label>
                <input className="input-base mt-1" value={cp} onChange={e => setCp(e.target.value)} placeholder="Ex: 44000" maxLength={5} />
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Ville</label>
                <input className="input-base mt-1" value={ville} onChange={e => setVille(e.target.value)} placeholder="Ex: Nantes" />
              </div>
            </div>
          </div>

          {/* Accès */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Key size={14} className="text-secondary-text" />
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Accès</p>
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Code interphone</label>
              <input className="input-base mt-1" value={codeInterphone} onChange={e => setCodeInterphone(e.target.value)} placeholder="Ex: 1234A" />
            </div>
            <div>
              <label className="text-xs font-medium text-secondary-text">Informations d&apos;accès</label>
              <textarea className="input-base mt-1 resize-none" rows={3} value={infosAcces} onChange={e => setInfosAcces(e.target.value)} placeholder="Ex: Digicode portail : 0000, clé boîte aux lettres..." />
            </div>
          </div>

          {/* Date réception */}
          <div className="card p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <Calendar size={14} className="text-secondary-text" />
              <label className="text-xs font-bold text-secondary-text uppercase tracking-wide">Date de réception</label>
            </div>
            <input className="input-base" type="date" value={dateReception} onChange={e => setDateReception(e.target.value)} />
          </div>

          <button onClick={handleSubmit} disabled={saving || !nom.trim()} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving ? <Spinner size="sm" /> : <Check size={16} />}
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}

export default function EditBatimentPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
      <EditBatimentPageContent batimentId={params.id} />
    </Suspense>
  );
}
