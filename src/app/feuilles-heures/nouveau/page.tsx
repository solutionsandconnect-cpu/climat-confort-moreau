"use client";
// src/app/feuilles-heures/nouveau/page.tsx
// Création d'un nouveau document FH — utilise la même page que [id] avec params.id = "nouveau"
import FHDetailPage from "@/app/feuilles-heures/[id]/page";

export default function NouveauFHPage() {
  return <FHDetailPage params={{ id: "nouveau" }} />;
}
