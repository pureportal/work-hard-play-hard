import type { Member } from "@workhard/shared";
import type { ReactNode } from "react";
import { CharacterPreview } from "./CharacterPreview";
import "../character.css";

interface AvatarProps {
  member: Pick<Member, "color" | "character"> | undefined;
  className: string;
  children?: ReactNode;
  decorative?: boolean;
}

export function Avatar({ member, className, children, decorative = true }: AvatarProps) {
  return (
    <span className={`avatar ${className}`} style={{ backgroundColor: member?.color ?? "#817b89" }} aria-hidden={decorative || undefined}>
      {member ? <CharacterPreview appearance={member.character} crop="portrait" className="avatar-character" />
        : <span className="avatar-initials">?</span>}
      {children}
    </span>
  );
}
