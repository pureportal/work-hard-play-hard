import type { ButtonHTMLAttributes } from "react";
import type { LucideIcon } from "lucide-react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  icon: LucideIcon;
  size?: number;
}

export function IconButton({ label, icon: Icon, size = 19, className = "", ...props }: IconButtonProps) {
  return (
    <button className={`icon-button ${className}`} aria-label={label} {...props}>
      <Icon size={size} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}
