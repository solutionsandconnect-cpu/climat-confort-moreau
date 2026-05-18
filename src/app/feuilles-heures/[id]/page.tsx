"use client";
// src/app/feuilles-heures/[id]/page.tsx
// Sous-collection correcte : details_chantiers_fh (champ nom_ligne)
// Tableau hebdomadaire avec vue semaine / vue jour

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { doc, addDoc, updateDoc, onSnapshot, collection, getDocs, deleteDoc, serverTimestamp, Timestamp, DocumentReference } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/authStore";
import { LoadingPage, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ArrowLeft, Save, Check, Info, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { LISTE_SERVICES } from "@/types";

const CATS = ["Fiche d'heures", "Demande autorisation absence", "Fiche de retour Travaux imprévus"];
const TYPES_FH = ["Plomberie", "Électricité", "SAV", "Atelier", "Dessin", "Magasin"];
const TYPES_ABSENCE = ["Congé payé", "Congé ancienneté", "Congé sans solde", "Jour de récupération", "Jour de repos", "Abs évènement familial"];
const ETATS = ["En attente", "Validé", "Refusé"];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

function calcJoursOuvres(debut: string, fin: string): number {
  if (!debut || !fin) return 0;
  const d = new Date(debut), f = new Date(fin);
  if (isNaN(d.getTime()) || isNaN(f.getTime()) || d > f) return 0;
  let count = 0;
  const cur = new Date(d);
  while (cur <= f) { const day = cur.getDay(); if (day !== 0 && day !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}

interface Ligne { id?: string; nomChantier: string; case1: number; case2: number; case3: number; case4: number; case5: number; }
interface UserOption { id: string; uid: string; displayName: string; nom: string; prenom: string; service?: string; }

function Chips({ label, value, options, onChange, req }: { label: string; value: string; options: string[]; onChange: (v: string) => void; req?: boolean; }) {
  return (
    <div>
      <p className="text-xs font-medium text-secondary-text mb-1.5">{label}{req && <span className="text-error ml-1">*</span>}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => <button key={o} onClick={() => onChange(o)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all", value === o ? "bg-primary text-white border-primary" : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50")}>{o}</button>)}
      </div>
    </div>
  );
}

function SigCanvas({ label, existing, onSave }: { label: string; existing?: string; onSave: (url: string) => Promise<void>; }) {
  const canRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [mode, setMode] = useState<"view"|"draw">(existing ? "view" : "draw");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode !== "draw") return;
    const c = canRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 2; ctx.lineCap = "round";
    const pos = (e: MouseEvent|TouchEvent) => { const r = c.getBoundingClientRect(); const s = "touches" in e ? e.touches[0] : e; return { x:(s.clientX-r.left)*(c.width/r.width), y:(s.clientY-r.top)*(c.height/r.height) }; };
    const start = (e: MouseEvent|TouchEvent) => { e.preventDefault(); drawing.current=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); };
    const move = (e: MouseEvent|TouchEvent) => { e.preventDefault(); if(!drawing.current) return; const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); };
    const end = () => { drawing.current=false; };
    c.addEventListener("mousedown",start); c.addEventListener("mousemove",move); c.addEventListener("mouseup",end);
    c.addEventListener("touchstart",start,{passive:false}); c.addEventListener("touchmove",move,{passive:false}); c.addEventListener("touchend",end);
    return () => { c.removeEventListener("mousedown",start); c.removeEventListener("mousemove",move); c.removeEventListener("mouseup",end); c.removeEventListener("touchstart",start); c.removeEventListener("touchmove",move); c.removeEventListener("touchend",end); };
  }, [mode]);

  const save = async () => {
    setSaving(true);
    try { await onSave(canRef.current!.toDataURL("image/png")); setMode("view"); toast.success("Signature enregistrée !"); }
    catch { toast.error("Erreur"); } finally { setSaving(false); }
  };

  return (
    <div className="border-t border-alternate pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-secondary-text">{label}</p>
        {(existing||mode==="view") && <button onClick={() => setMode(mode==="view"?"draw":"view")} className="text-xs text-primary font-semibold">{mode==="view"?"Re-signer":"Annuler"}</button>}
      </div>
      {mode==="view" && existing ? (
        <div className="flex items-center gap-3 p-2 bg-green-50 rounded-xl"><Check size={14} className="text-green-600 shrink-0"/><img src={existing} alt="" className="max-h-12 rounded border border-alternate"/></div>
      ) : (
        <div>
          <canvas ref={canRef} width={400} height={100} className="w-full border-2 border-dashed border-alternate rounded-xl bg-white cursor-crosshair touch-none"/>
          <div className="flex gap-2 mt-2">
            <button onClick={() => { const ctx=canRef.current?.getContext("2d"); if(ctx&&canRef.current) ctx.clearRect(0,0,canRef.current.width,canRef.current.height); }} className="btn-outline text-xs px-3 py-1.5">Effacer</button>
            <button onClick={save} disabled={saving} className="btn-primary text-xs px-3 py-1.5 flex-1 flex items-center justify-center gap-1.5">{saving?<Spinner size="sm"/>:<Check size={12}/>}Valider</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Tableau hebdomadaire
// ============================================
function Tableau({ vue, jour, lignes, onChange, onAdd, onDelete, readOnly }: {
  vue: string; jour: string; lignes: Ligne[];
  onChange: (i: number, f: string, v: string|number) => void;
  onAdd: () => void; onDelete: (i: number) => void; readOnly: boolean;
}) {
  const cols = vue === "Vue Hebdomadaire" ? [0,1,2,3,4] : [JOURS.indexOf(jour)].filter(i => i >= 0);
  const vals = (l: Ligne) => [l.case1,l.case2,l.case3,l.case4,l.case5];
  const rowTotal = (l: Ligne) => cols.reduce((s,i) => s+(vals(l)[i]||0), 0);
  const colTotal = (ci: number) => lignes.reduce((s,l) => s+(vals(l)[ci]||0), 0);
  const grand = lignes.reduce((s,l) => s+rowTotal(l), 0);

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-xs border-collapse min-w-[300px]">
        <thead>
          <tr className="bg-primary/5">
            <th className="text-left px-2.5 py-2 font-semibold text-secondary-text border border-alternate text-xs min-w-[130px]">Chantier</th>
            {cols.map(i => <th key={i} className="px-2 py-2 font-semibold text-secondary-text border border-alternate text-center w-14">{JOURS[i].substring(0,3)}.</th>)}
            <th className="px-2 py-2 font-bold text-primary border border-alternate text-center w-14">Total</th>
            {!readOnly && <th className="w-7 border border-alternate bg-primary/5"/>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, idx) => {
            const cv = vals(l);
            return (
              <tr key={idx} className={idx%2===0?"bg-secondary-bg":"bg-primary-bg/30"}>
                <td className="border border-alternate p-0.5">
                  <input className="w-full bg-transparent text-xs text-primary-text px-2 py-1.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30 rounded" value={l.nomChantier}
                    onChange={e => onChange(idx,"nomChantier",e.target.value)} readOnly={readOnly} placeholder="Nom chantier…"/>
                </td>
                {cols.map(i => (
                  <td key={i} className="border border-alternate p-0.5 text-center">
                    <input type="number" min="0" step="0.5" max="24"
                      className="w-12 bg-transparent text-xs text-center text-primary-text px-1 py-1.5 focus:outline-none focus:bg-white focus:ring-1 focus:ring-primary/30 rounded"
                      value={cv[i]||""} onChange={e => onChange(idx,`case${i+1}`,parseFloat(e.target.value)||0)} readOnly={readOnly} placeholder="0"/>
                  </td>
                ))}
                <td className="border border-alternate px-2 py-1.5 text-center font-bold text-primary">{rowTotal(l)||"—"}</td>
                {!readOnly && <td className="border border-alternate px-1 py-1.5 text-center"><button onClick={() => onDelete(idx)} className="text-error hover:text-red-700"><Trash2 size={11}/></button></td>}
              </tr>
            );
          })}
          <tr className="bg-primary/5 font-bold">
            <td className="border border-alternate px-2.5 py-2 text-primary text-xs">Total général</td>
            {cols.map(i => <td key={i} className="border border-alternate px-2 py-2 text-center text-primary font-bold">{colTotal(i)||"—"}</td>)}
            <td className="border border-alternate px-2 py-2 text-center text-primary font-bold">{grand||"—"}</td>
            {!readOnly && <td className="border border-alternate"/>}
          </tr>
        </tbody>
      </table>
      {!readOnly && (
        <button onClick={onAdd} className="mt-2 flex items-center gap-1.5 text-xs text-primary font-semibold hover:text-primary-600 px-1">
          <Plus size={13}/>Ajouter un chantier
        </button>
      )}
    </div>
  );
}

export default function FHDetailPage({ params }: { params: { id: string } }) {
  const isNew = params.id === "nouveau";
  const router = useRouter();
  const { firebaseUser, userApp } = useAuthStore();

  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [categorie, setCategorie] = useState("Fiche d'heures");
  const [selectedUserId, setSelectedUserId] = useState(firebaseUser?.uid ?? "");
  const [nom, setNom] = useState(userApp?.nom ?? "");
  const [prenom, setPrenom] = useState(userApp?.prenom ?? "");
  const [service, setService] = useState(userApp?.service ?? "");
  const [etat, setEtat] = useState("En attente");
  const [observations, setObservations] = useState("");
  const [sigUser, setSigUser] = useState(""); const [sigChef, setSigChef] = useState(""); const [sigResp, setSigResp] = useState(""); const [nomResp, setNomResp] = useState("");

  // Fiche d'heures
  const [typeFH, setTypeFH] = useState("");
  const [mois, setMois] = useState("");
  const [debut, setDebut] = useState(""); const [fin, setFin] = useState("");
  const [vue, setVue] = useState("Vue Hebdomadaire");
  const [jourSel, setJourSel] = useState("Lundi");
  const [lignes, setLignes] = useState<Ligne[]>([{ nomChantier:"",case1:0,case2:0,case3:0,case4:0,case5:0 }]);

  // Absence
  const [typeAbs, setTypeAbs] = useState(""); const [debutAbs, setDebutAbs] = useState(""); const [finAbs, setFinAbs] = useState(""); const [nbJours, setNbJours] = useState(""); const [nbJoursAuto, setNbJoursAuto] = useState(0);
  useEffect(() => { if(debutAbs&&finAbs){const a=calcJoursOuvres(debutAbs,finAbs);setNbJoursAuto(a);setNbJours(a.toString());} }, [debutAbs,finAbs]);

  // Travaux imprévus
  const [nomCh,setNomCh]=useState(""); const [numCh,setNumCh]=useState(""); const [cptInter,setCptInter]=useState(""); const [ts,setTs]=useState(""); const [tma,setTma]=useState(""); const [cptProrata,setCptProrata]=useState(""); const [estMat,setEstMat]=useState(""); const [estH,setEstH]=useState(""); const [chiffrage,setChiffrage]=useState(""); const [accept,setAccept]=useState(""); const [factImprev,setFactImprev]=useState(""); const [visa,setVisa]=useState(false);

// ✅ AJOUT 1 — Pré-sélection du salarié connecté quand la liste est chargée
useEffect(() => {
  if (!isNew || users.length === 0 || !selectedUserId) return;
  const u = users.find(u => u.uid === selectedUserId || u.id === selectedUserId);
  if (u) {
    setNom(u.nom);
    setPrenom(u.prenom);
    setService(u.service ?? "");
  }
}, [users, isNew]);

// ✅ AJOUT 2 — Sécurité si firebaseUser arrive en retard
useEffect(() => {
  if (isNew && firebaseUser?.uid && !selectedUserId) {
    setSelectedUserId(firebaseUser.uid);
  }
}, [firebaseUser, isNew]);

  useEffect(() => {
    getDocs(collection(db,"usersapp")).then(snap => setUsers(snap.docs.map(d=>({id:d.id,uid:d.data().uid??d.id,nom:d.data().nom??"",prenom:d.data().prenom??"",service:d.data().service_appartenance,displayName:(d.data().display_name as string)??`${d.data().prenom} ${d.data().nom}`}))));
    if(isNew){setLoading(false);return;}
    const toStr=(v:any)=>{try{return v?.toDate?v.toDate().toISOString().split("T")[0]:"";}catch{return "";}};
    const unsub=onSnapshot(doc(db,"Documents_fh",params.id),async snap=>{
      if(!snap.exists()){router.back();return;}
      const d=snap.data();
      setCategorie(d.categorie_document??"Fiche d'heures");
      setSelectedUserId((d.ref_user as DocumentReference)?.id??"");
      setNom(d.nom??"");setPrenom(d.prenom??"");setService(d.service??"");
      setEtat(d.etat_traitement_document??"En attente");setTypeFH(d.type_document??"");setMois(d.mois??"");
      setDebut(toStr(d.debut_semaine));setFin(toStr(d.fin_semaine));
      setObservations(d.observations??"");setSigUser(d.signature_user??"");setSigChef(d.signature_chef_equipe??"");setSigResp(d.signature_responsable??"");setNomResp(d.nom_responsable??"");
      setTypeAbs(d.type_absence??"");setDebutAbs(toStr(d.debut_semaine));setFinAbs(toStr(d.fin_semaine));setNbJours(d.nb_jours?.toString()??"");
      setNomCh(d.nom_chantier_travaux_imprevus??"");setNumCh(d.num_chantier_travaux_imprevus??"");setCptInter(d.compte_inter_travaux_imprevus??"");setTs(d.ts_travaux_imprevus??"");setTma(d.tma_travaux_imprevus??"");setCptProrata(d.compte_prorata_travaux_imprevus??"");
      setEstMat(d.estimations_materiaux??"");setEstH(d.estimations_heures??"");setChiffrage(d.chiffrage_transmis??"");setAccept(d.acceptation_travaux_imprevus??"");setFactImprev(d.facturation_travaux_imprevus??"");setVisa(d.visa_chiffrage??false);
      // Charger lignes (sous-collection details_chantiers_fh)
      const sub=await getDocs(collection(db,"Documents_fh",params.id,"details_chantiers_fh"));
      if(sub.size>0) setLignes(sub.docs.map(dc=>({id:dc.id,nomChantier:dc.data().nom_ligne as string??"",case1:dc.data().case1??0,case2:dc.data().case2??0,case3:dc.data().case3??0,case4:dc.data().case4??0,case5:dc.data().case5??0})));
      setLoading(false);
    });
    return ()=>unsub();
  },[params.id,isNew,router]);

  const toTS=(s:string)=>s?Timestamp.fromDate(new Date(s)):null;
  const buildNom=()=>{
    if(categorie==="Fiche d'heures") return `${typeFH} - ${mois} sem. ${debut}`.trim();
    if(categorie==="Demande autorisation absence") return `Absence ${typeAbs} ${debutAbs} au ${finAbs}`;
    return `Travaux imprévus ${nomCh} - ${new Date().toLocaleDateString("fr-FR")}`;
  };

  const saveLignes=async(docId:string)=>{
    const sub=collection(db,"Documents_fh",docId,"details_chantiers_fh");
    const existing=await getDocs(sub);
    await Promise.all(existing.docs.map(d=>deleteDoc(d.ref)));
    await Promise.all(lignes.filter(l=>l.nomChantier).map((l,i)=>addDoc(sub,{
      nom_ligne:l.nomChantier, index:i,
      case1:l.case1??0,case2:l.case2??0,case3:l.case3??0,case4:l.case4??0,case5:l.case5??0,
      total:[l.case1,l.case2,l.case3,l.case4,l.case5].reduce((s,v)=>s+(v||0),0),
      refDocument_fh:doc(db,"Documents_fh",docId),
      refUserCreate:firebaseUser?doc(db,"usersapp",firebaseUser.uid):null,
    })));
  };

  const handleSave=async()=>{
    if(!nom.trim()||!prenom.trim()){toast.error("Nom et prénom obligatoires");return;}
    setSaving(true);
    try {
      const userRef=selectedUserId?doc(db,"usersapp",selectedUserId):(firebaseUser?doc(db,"usersapp",firebaseUser.uid):null);
      const debutTS=categorie==="Demande autorisation absence"?toTS(debutAbs):toTS(debut);
      const finTS=categorie==="Demande autorisation absence"?toTS(finAbs):toTS(fin);
      const data:Record<string,unknown>={
        ref_user:userRef, nom, prenom, service, categorie_document:categorie, nom_document:buildNom(),
        type_document:typeFH, etat_traitement_document:etat, mois, observations,
        debut_semaine:debutTS, fin_semaine:finTS,
        signature_user:sigUser, signature_chef_equipe:sigChef, signature_responsable:sigResp, nom_responsable:nomResp,
        type_absence:typeAbs, nb_jours:nbJours?parseFloat(nbJours):null,
        nom_chantier_travaux_imprevus:nomCh, num_chantier_travaux_imprevus:numCh,
        compte_inter_travaux_imprevus:cptInter, ts_travaux_imprevus:ts, tma_travaux_imprevus:tma,
        compte_prorata_travaux_imprevus:cptProrata, estimations_materiaux:estMat, estimations_heures:estH,
        chiffrage_transmis:chiffrage, acceptation_travaux_imprevus:accept, facturation_travaux_imprevus:factImprev, visa_chiffrage:visa,
      };
      let docId=params.id;
      if(isNew){data.date_create=serverTimestamp();data.create_par=firebaseUser?doc(db,"usersapp",firebaseUser.uid):null;const ref=await addDoc(collection(db,"Documents_fh"),data);docId=ref.id;}
      else await updateDoc(doc(db,"Documents_fh",params.id),data);
      if(categorie==="Fiche d'heures") await saveLignes(docId);
      toast.success(isNew?"Document créé !":"Document mis à jour !");
      if(isNew) router.replace(`/feuilles-heures/${docId}`);
    } catch(e){console.error(e);toast.error("Erreur lors de la sauvegarde");}
    finally{setSaving(false);}
  };

  const uploadSig=async(dataUrl:string,field:string):Promise<string>=>{
    try{const r=storageRef(storage,`signatures/fh_${isNew?"new":params.id}_${field}_${Date.now()}.png`);const res=await fetch(dataUrl);const blob=await res.blob();await uploadBytes(r,blob);return getDownloadURL(r);}
    catch{toast.error("Upload signature : configurez Firebase Storage");return dataUrl;}
  };
  const sUser=async(d:string)=>{const u=await uploadSig(d,"user");setSigUser(u);if(!isNew)await updateDoc(doc(db,"Documents_fh",params.id),{signature_user:u});};
  const sChef=async(d:string)=>{const u=await uploadSig(d,"chef");setSigChef(u);if(!isNew)await updateDoc(doc(db,"Documents_fh",params.id),{signature_chef_equipe:u});};
  const sResp=async(d:string)=>{const u=await uploadSig(d,"resp");setSigResp(u);if(!isNew)await updateDoc(doc(db,"Documents_fh",params.id),{signature_responsable:u});};

  if(loading) return <AppShell><LoadingPage/></AppShell>;

  const readOnly=etat!=="En attente";

  return (
    <AppShell>
      <div className="animate-page-enter max-w-3xl mx-auto px-4 lg:px-6 py-5">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={()=>router.back()} className="p-2 rounded-lg hover:bg-alternate text-secondary-text hover:text-primary"><ArrowLeft size={20}/></button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-primary-text" style={{fontFamily:"var(--font-inter-tight)"}}>{isNew?"Nouveau document":"Modifier"}</h1>
            <p className="text-xs text-secondary-text">{categorie}</p>
          </div>
          {etat!=="En attente"&&<span className={cn("badge border",etat==="Validé"?"bg-green-100 text-green-800 border-green-200":"bg-red-100 text-red-700 border-red-200")}>{etat}</span>}
        </div>

        <div className="space-y-4">
          {/* Type */}
          <div className="card p-4"><Chips label="Type de document" value={categorie} options={CATS} onChange={setCategorie}/></div>

          {/* Salarié */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Salarié concerné</p>
            <select className="input-base" value={selectedUserId} onChange={e=>{setSelectedUserId(e.target.value);const u=users.find(u=>u.uid===e.target.value||u.id===e.target.value);if(u){setNom(u.nom);setPrenom(u.prenom);setService(u.service??"")}}}><option value="">— Sélectionner —</option>{users.map(u=><option key={u.id} value={u.uid||u.id}>{u.displayName}</option>)}</select>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-secondary-text">Nom *</label><input className="input-base mt-1" value={nom} onChange={e=>setNom(e.target.value)}/></div>
              <div><label className="text-xs font-medium text-secondary-text">Prénom *</label><input className="input-base mt-1" value={prenom} onChange={e=>setPrenom(e.target.value)}/></div>
            </div>
            <div><label className="text-xs font-medium text-secondary-text">Service</label><select className="input-base mt-1" value={service} onChange={e=>setService(e.target.value)}><option value="">—</option>{LISTE_SERVICES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          </div>

          {/* FICHE D'HEURES */}
          {categorie==="Fiche d'heures"&&(
            <>
              <div className="card p-4 space-y-3">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Paramètres</p>
                <Chips label="Type de fiche" value={typeFH} options={TYPES_FH} onChange={setTypeFH} req/>
                <div><label className="text-xs font-medium text-secondary-text">Mois</label><input className="input-base mt-1" value={mois} onChange={e=>setMois(e.target.value)} placeholder="Ex: Janvier 2025"/></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-secondary-text">Début semaine</label><input className="input-base mt-1" type="date" value={debut} onChange={e=>setDebut(e.target.value)}/></div>
                  <div><label className="text-xs font-medium text-secondary-text">Fin semaine</label><input className="input-base mt-1" type="date" value={fin} onChange={e=>setFin(e.target.value)}/></div>
                </div>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Heures par chantier</p>
                  <div className="flex gap-1">
                    {["Vue Hebdomadaire","Vue Journalière"].map(v=><button key={v} onClick={()=>setVue(v)} className={cn("px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all",vue===v?"bg-primary text-white border-primary":"border-alternate text-secondary-text hover:border-primary/50")}>{v==="Vue Hebdomadaire"?"Semaine":"Jour"}</button>)}
                  </div>
                </div>
                {vue==="Vue Journalière"&&(
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {JOURS.map(j=><button key={j} onClick={()=>setJourSel(j)} className={cn("px-2.5 py-1 rounded-badge text-xs font-semibold border transition-all",jourSel===j?"bg-secondary text-white border-secondary":"border-alternate text-secondary-text hover:border-secondary/50")}>{j.substring(0,3)}.</button>)}
                  </div>
                )}
                <Tableau vue={vue} jour={jourSel} lignes={lignes}
                  onChange={(i,f,v)=>setLignes(p=>p.map((l,j)=>j===i?{...l,[f]:v}:l))}
                  onAdd={()=>setLignes(p=>[...p,{nomChantier:"",case1:0,case2:0,case3:0,case4:0,case5:0}])}
                  onDelete={i=>setLignes(p=>p.filter((_,j)=>j!==i))}
                  readOnly={readOnly}/>
                {readOnly&&<p className="text-xs text-secondary-text mt-2 flex items-center gap-1"><Info size={11}/>Document {etat.toLowerCase()} — modifications désactivées</p>}
              </div>
              <div className="card p-4"><label className="text-xs font-medium text-secondary-text">Observations</label><textarea className="input-base mt-1 resize-none" rows={2} value={observations} onChange={e=>setObservations(e.target.value)}/></div>
            </>
          )}

          {/* ABSENCE */}
          {categorie==="Demande autorisation absence"&&(
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Demande d&apos;absence</p>
              <div className="flex flex-wrap gap-1.5">
                {TYPES_ABSENCE.map(t=><button key={t} onClick={()=>setTypeAbs(t)} className={cn("px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all",typeAbs===t?"bg-primary text-white border-primary":"border-alternate text-secondary-text hover:border-primary/50")}>{t}</button>)}
                <p className="text-xs text-secondary-text mt-1 flex items-center gap-1"><Info size={11}/>Calcul auto (lun-ven)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-secondary-text">Date début</label><input className="input-base mt-1" type="date" value={debutAbs} onChange={e=>setDebutAbs(e.target.value)}/></div>
                <div><label className="text-xs font-medium text-secondary-text">Date fin</label><input className="input-base mt-1" type="date" value={finAbs} onChange={e=>setFinAbs(e.target.value)}/></div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary-text">Nombre de jours ouvrés</label>
                <div className="flex items-center gap-3 mt-1">
                  <input className="input-base flex-1" type="number" min="0" step="0.5" value={nbJours} onChange={e=>setNbJours(e.target.value)}/>
                  {nbJoursAuto>0&&<span className="text-xs text-secondary bg-secondary/10 px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap">Auto : {nbJoursAuto}j</span>}
                </div>
                {debutAbs&&finAbs&&<p className="text-xs text-secondary-text mt-1 flex items-center gap-1"><Info size={11}/>Calcul auto (lun-ven)</p>}
              </div>
              <div><label className="text-xs font-medium text-secondary-text">Observations / Motif</label><textarea className="input-base mt-1 resize-none" rows={2} value={observations} onChange={e=>setObservations(e.target.value)}/></div>
            </div>
          )}

          {/* TRAVAUX IMPRÉVUS */}
          {categorie==="Fiche de retour Travaux imprévus"&&(
            <>
              <div className="card p-4 space-y-3">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Identification chantier</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-secondary-text">Nom du chantier</label><input className="input-base mt-1" value={nomCh} onChange={e=>setNomCh(e.target.value)}/></div>
                  <div><label className="text-xs font-medium text-secondary-text">N° chantier</label><input className="input-base mt-1 font-mono" value={numCh} onChange={e=>setNumCh(e.target.value)}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-secondary-text">Compte inter</label><input className="input-base mt-1" value={cptInter} onChange={e=>setCptInter(e.target.value)}/></div>
                  <div><label className="text-xs font-medium text-secondary-text">Compte prorata</label><input className="input-base mt-1" value={cptProrata} onChange={e=>setCptProrata(e.target.value)}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-secondary-text">TS travaux imprévus</label><input className="input-base mt-1" value={ts} onChange={e=>setTs(e.target.value)}/></div>
                  <div><label className="text-xs font-medium text-secondary-text">TMA travaux imprévus</label><input className="input-base mt-1" value={tma} onChange={e=>setTma(e.target.value)}/></div>
                </div>
              </div>
              <div className="card p-4 space-y-3">
                <p className="text-xs font-bold text-secondary-text uppercase tracking-wide">Estimations & Chiffrage</p>
                <div><label className="text-xs font-medium text-secondary-text">Estimations matériaux</label><textarea className="input-base mt-1 resize-none" rows={2} value={estMat} onChange={e=>setEstMat(e.target.value)}/></div>
                <div><label className="text-xs font-medium text-secondary-text">Estimations heures</label><input className="input-base mt-1" value={estH} onChange={e=>setEstH(e.target.value)} placeholder="Ex: 4h"/></div>
                <div><label className="text-xs font-medium text-secondary-text">Chiffrage transmis</label><input className="input-base mt-1" value={chiffrage} onChange={e=>setChiffrage(e.target.value)}/></div>
                <div><label className="text-xs font-medium text-secondary-text">Acceptation travaux</label><input className="input-base mt-1" value={accept} onChange={e=>setAccept(e.target.value)}/></div>
                <div><label className="text-xs font-medium text-secondary-text">Facturation travaux imprévus</label><input className="input-base mt-1" value={factImprev} onChange={e=>setFactImprev(e.target.value)}/></div>
                <div>
                  <label className="text-xs font-medium text-secondary-text mb-1.5 block">Visa chiffrage</label>
                  <div className="flex gap-2">{["Oui","Non"].map(v=><button key={v} onClick={()=>setVisa(v==="Oui")} className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border transition-all",(visa?"Oui":"Non")===v?"bg-primary text-white border-primary":"border-alternate text-secondary-text")}>{v}</button>)}</div>
                </div>
                <div><label className="text-xs font-medium text-secondary-text">Observations</label><textarea className="input-base mt-1 resize-none" rows={2} value={observations} onChange={e=>setObservations(e.target.value)}/></div>
              </div>
            </>
          )}

          {/* État */}
          <div className="card p-4"><Chips label="État de traitement" value={etat} options={ETATS} onChange={setEtat}/></div>

          {/* Signatures */}
          <div className="card p-4 space-y-2">
            <p className="text-xs font-bold text-secondary-text uppercase tracking-wide mb-2">Signatures</p>
            <div><label className="text-xs font-medium text-secondary-text">Nom du responsable</label><input className="input-base mt-1" value={nomResp} onChange={e=>setNomResp(e.target.value)} placeholder="Nom du responsable signataire"/></div>
            <SigCanvas label="Signature salarié" existing={sigUser} onSave={sUser}/>
            <SigCanvas label="Signature chef d'équipe" existing={sigChef} onSave={sChef}/>
            <SigCanvas label="Signature responsable" existing={sigResp} onSave={sResp}/>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full py-3 flex items-center justify-center gap-2">
            {saving?<Spinner size="sm"/>:<Save size={16}/>}{saving?"Sauvegarde…":isNew?"Créer le document":"Sauvegarder"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
