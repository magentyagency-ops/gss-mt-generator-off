/**
 * Primitives UI auto-portées, stylées comme shadcn/ui (mêmes tokens CSS vars).
 * Pas de dépendance Radix → install légère. Remplaçables par les vrais
 * composants shadcn plus tard sans changer les appels (mêmes noms/props).
 */
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- Button */
type ButtonVariant =
  | "default"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";
type ButtonSize = "default" | "sm" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  default:
    "bg-primary text-primary-foreground shadow-o1 hover:bg-primary-hover hover:shadow-o2 motion-safe:hover:-translate-y-px active:translate-y-0 active:shadow-o1",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-[#E3E9F1] active:bg-[#DCE3EC]",
  outline:
    "border border-border bg-card text-foreground shadow-o1 hover:border-[#C7D0DC] hover:bg-[#FBFCFD] active:bg-secondary",
  ghost: "text-foreground hover:bg-secondary active:bg-[#E3E9F1]",
  destructive:
    "bg-destructive text-destructive-foreground shadow-o1 hover:bg-destructive/90 hover:shadow-o2 motion-safe:hover:-translate-y-px active:translate-y-0 active:shadow-o1",
};
const buttonSizes: Record<ButtonSize, string> = {
  default: "h-[38px] px-4 py-2",
  sm: "h-8 rounded-lg px-3 text-[13px]",
  lg: "h-11 rounded-[10px] px-6 text-[15px]",
  icon: "h-[38px] w-[38px]",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[9px] text-sm font-semibold transition-[color,background-color,border-color,box-shadow,transform,translate,scale] duration-150 ease-doux focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none [&_svg]:size-4 [&_svg]:shrink-0",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";

/* ------------------------------------------------------------------- Card */
export const Card = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-xl border border-border bg-card text-card-foreground shadow-o1 transition-[box-shadow,border-color,transform,translate] duration-200 ease-doux",
      className,
    )}
    {...props}
  />
);
export const CardHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 px-5 py-[18px]", className)} {...props} />
);
export const CardTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3
    className={cn("text-[15px] font-semibold leading-snug tracking-[-0.005em]", className)}
    {...props}
  />
);
export const CardDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn("text-[13px] leading-relaxed text-muted-foreground", className)} {...props} />
);
export const CardContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("px-5 pb-5 pt-0", className)} {...props} />
);
export const CardFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex items-center px-5 pb-5 pt-0", className)} {...props} />
);

/* ------------------------------------------------------------------ Badge */
type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive";
const badgeVariants: Record<BadgeVariant, string> = {
  default: "border-transparent bg-info-soft text-info",
  secondary: "border-transparent bg-secondary text-muted-foreground",
  outline: "text-foreground",
  success: "border-transparent bg-success-soft text-success",
  warning: "border-transparent bg-warning-soft text-warning",
  destructive: "border-transparent bg-destructive-soft text-destructive",
};
export const Badge = ({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: BadgeVariant }) => (
  <div
    data-variante={variant}
    className={cn(
      // Pastille « badge-gss » (globals.css, sans priorité sur les classes passées) :
      // rayon plein et point coloré de 7 px ; variante contour en étiquette sobre.
      "badge-gss inline-flex items-center gap-1.5 border px-2.5 py-[3px] text-xs font-semibold leading-snug transition-colors",
      badgeVariants[variant],
      className,
    )}
    {...props}
  />
);

/* --------------------------------------------------------------- Progress */
export const Progress = ({
  value = 0,
  className,
  indicatorClassName,
}: {
  value?: number;
  className?: string;
  indicatorClassName?: string;
}) => (
  <div
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
      className,
    )}
  >
    <div
      className={cn(
        "h-full origin-left animate-remplir rounded-full bg-primary transition-[width,background-color] duration-700 ease-doux",
        indicatorClassName,
      )}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

/* -------------------------------------------------------------- Separator */
export const Separator = ({
  className,
  orientation = "horizontal",
}: {
  className?: string;
  orientation?: "horizontal" | "vertical";
}) => (
  <div
    className={cn(
      "shrink-0 bg-border",
      orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
      className,
    )}
  />
);

/* ------------------------------------------------------------------ Table */
export const Table = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableElement>) => (
  <div className="relative w-full overflow-auto">
    <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
  </div>
);
export const TableHeader = (
  props: React.HTMLAttributes<HTMLTableSectionElement>,
) => (
  <thead
    className="bg-[#FAFBFC] [&_tr:hover]:bg-[#FAFBFC] [&_tr:hover]:shadow-none [&_tr]:border-b"
    {...props}
  />
);
export const TableBody = (
  props: React.HTMLAttributes<HTMLTableSectionElement>,
) => <tbody className="[&_tr:last-child]:border-0" {...props} />;
export const TableRow = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn(
      "border-b border-border transition-[background-color,box-shadow] duration-150 ease-doux hover:bg-[#F8FAFD] hover:shadow-[inset_3px_0_0_hsl(var(--signal))]",
      className,
    )}
    {...props}
  />
);
export const TableHead = ({
  className,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    className={cn(
      "h-10 px-4 text-left align-middle text-[11.5px] font-semibold uppercase tracking-[0.08em] text-subtle-foreground",
      className,
    )}
    {...props}
  />
);
export const TableCell = ({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("px-4 py-3 align-middle", className)} {...props} />
);
