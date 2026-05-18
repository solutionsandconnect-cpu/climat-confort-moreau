// src/components/ui/index.tsx
// Composants UI réutilisables

import { cn, getEtatColor, getFacturationColor } from "@/lib/utils";
import { Loader2 } from "lucide-react";

// ============================================
// BADGE d'état
// ============================================

interface BadgeEtatProps {
  etat: string;
  className?: string;
}

export function BadgeEtat({ etat, className }: BadgeEtatProps) {
  const colors = getEtatColor(etat);
  return (
    <span
      className={cn(
        "badge",
        colors.bg,
        colors.text,
        colors.border,
        className
      )}
    >
      {etat}
    </span>
  );
}

export function BadgeFacturation({ etat, className }: BadgeEtatProps) {
  const colors = getFacturationColor(etat);
  return (
    <span className={cn("badge border-transparent", colors.bg, colors.text, className)}>
      {etat}
    </span>
  );
}

// ============================================
// STAT CARD (cartes de stats du dashboard)
// ============================================

interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color?: "secondary" | "primary" | "warning" | "error" | "success";
  className?: string;
  onClick?: () => void;
}

const colorMap = {
  secondary: {
    icon: "text-secondary",
    bg: "bg-secondary/10",
  },
  primary: {
    icon: "text-primary",
    bg: "bg-primary/10",
  },
  warning: {
    icon: "text-yellow-600",
    bg: "bg-yellow-100",
  },
  error: {
    icon: "text-error",
    bg: "bg-red-100",
  },
  success: {
    icon: "text-success",
    bg: "bg-green-100",
  },
};

export function StatCard({
  label,
  value,
  icon,
  color = "secondary",
  className,
  onClick,
}: StatCardProps) {
  const colors = colorMap[color];
  return (
    <div
      className={cn(
        "card flex items-center gap-4 px-5 py-4 min-w-[160px]",
        onClick && "cursor-pointer hover:shadow-card-hover transition-shadow duration-200",
        className
      )}
      onClick={onClick}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", colors.bg)}>
        <span className={colors.icon}>{icon}</span>
      </div>
      <div>
        <p className="text-secondary-text text-xs font-medium">{label}</p>
        <p className="text-2xl font-bold text-primary-text leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ============================================
// LOADING SPINNER
// ============================================

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Spinner({ size = "md", className }: SpinnerProps) {
  const sizeClass = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" }[size];
  return (
    <Loader2 className={cn("animate-spin text-primary", sizeClass, className)} />
  );
}

export function LoadingPage() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[300px]">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-secondary-text text-sm">Chargement…</p>
      </div>
    </div>
  );
}

// ============================================
// EMPTY STATE
// ============================================

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-primary-bg flex items-center justify-center mb-4 text-secondary-text">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-primary-text mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-secondary-text max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ============================================
// SEARCH INPUT
// ============================================

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = "Rechercher…", className }: SearchInputProps) {
  return (
    <div className={cn("relative", className)}>
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-text"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("input-base pl-9 pr-4")}
      />
    </div>
  );
}

// ============================================
// FILTER CHIP (équivalent ChoiceChips de Flutter)
// ============================================

interface FilterChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}

export function FilterChip({ label, active, onClick, className }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-badge text-xs font-semibold border transition-all duration-200 whitespace-nowrap",
        active
          ? "bg-primary text-white border-primary shadow-sm"
          : "bg-secondary-bg text-secondary-text border-alternate hover:border-primary/50 hover:text-primary",
        className
      )}
    >
      {label}
    </button>
  );
}

// ============================================
// PRIORITAIRE BADGE
// ============================================

export function BadgePrioritaire({ prioritaire }: { prioritaire?: boolean }) {
  if (!prioritaire) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-badge bg-red-100 text-red-700 border border-red-200 text-xs font-bold">
      <span className="w-1.5 h-1.5 rounded-full bg-error" />
      Prioritaire
    </span>
  );
}

export { NavButton } from './NavButton';
