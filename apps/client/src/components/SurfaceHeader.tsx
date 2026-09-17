import { ArrowLeft, X } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";
import "../surface-header.css";

interface SurfaceHeaderProps {
  title: string;
  titleId?: string;
  className: string;
  description?: ReactNode;
  actions?: ReactNode;
  closeLabel?: string;
  closeDisabled?: boolean;
  onBack?: () => void;
  onClose: () => void;
}

export function SurfaceHeader({ title, titleId, className, description, actions, closeLabel, closeDisabled, onBack, onClose }: SurfaceHeaderProps) {
  return <header className={`surface-header ${className}`}>
    {onBack && <IconButton label="Back to build" icon={ArrowLeft} onClick={onBack} />}
    <div className="surface-header-title">
      <h2 id={titleId}>{title}</h2>
      {description && <span>{description}</span>}
    </div>
    {actions && <div className="surface-header-actions">{actions}</div>}
    <IconButton className="surface-header-close" label={closeLabel ?? `Close ${title.toLowerCase()}`} icon={X} disabled={closeDisabled} onClick={onClose} />
  </header>;
}
