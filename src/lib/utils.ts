// src/lib/utils.ts

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { fr } from "date-fns/locale";

// Fusion de classes Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatage de dates en français
export function formatDate(date: Date | undefined | null, pattern = "dd/MM/yyyy"): string {
  if (!date) return "—";
  return format(date, pattern, { locale: fr });
}

export function formatDateRelative(date: Date | undefined | null): string {
  if (!date) return "—";
  if (isToday(date)) return `Aujourd'hui ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `Hier ${format(date, "HH:mm")}`;
  return formatDistanceToNow(date, { addSuffix: true, locale: fr });
}

export function formatDateTime(date: Date | undefined | null): string {
  if (!date) return "—";
  return format(date, "dd/MM/yyyy à HH:mm", { locale: fr });
}

// Couleurs des badges d'état (équivalent des pastilles Flutter)
export function getEtatColor(etat: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (etat) {
    case "Clos":
      return { bg: "bg-green-100", text: "text-green-800", border: "border-green-200" };
    case "Travaux finis":
      return { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200" };
    case "A planifier":
      return { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-200" };
    case "En attente":
      return { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-200" };
    case "A compléter":
      return { bg: "bg-red-100", text: "text-red-800", border: "border-red-200" };
    case "Planifié":
      return { bg: "bg-secondary-50", text: "text-secondary-700", border: "border-secondary-200" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-200" };
  }
}

export function getFacturationColor(etat: string): {
  bg: string;
  text: string;
} {
  switch (etat) {
    case "Facturé":
      return { bg: "bg-green-100", text: "text-green-800" };
    case "Non facturable":
      return { bg: "bg-gray-100", text: "text-gray-600" };
    default:
      return { bg: "bg-red-100", text: "text-red-700" };
  }
}

// Initiales pour les avatars
export function getInitials(nom: string, prenom?: string): string {
  if (prenom) {
    return `${prenom.charAt(0)}${nom.charAt(0)}`.toUpperCase();
  }
  const parts = nom.split(" ");
  if (parts.length >= 2) {
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  }
  return nom.substring(0, 2).toUpperCase();
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "…";
}
