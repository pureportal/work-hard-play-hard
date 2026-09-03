import type { Member } from "@workhard/shared";
import type { ReactNode } from "react";
import { resolveServerUrl } from "../server-url";

interface AvatarProps {
  member: Pick<Member, "avatarUrl" | "color" | "initials"> | undefined;
  className: string;
  children?: ReactNode;
  decorative?: boolean;
}

export function Avatar({ member, className, children, decorative = true }: AvatarProps) {
  return (
    <span className={`avatar ${className}`} style={{ backgroundColor: member?.color ?? "#817b89" }} aria-hidden={decorative || undefined}>
      <span className="avatar-initials">{member?.initials ?? "?"}</span>
      {member?.avatarUrl && (
        <img
          key={member.avatarUrl}
          className="avatar-image"
          src={resolveServerUrl(member.avatarUrl)}
          alt=""
          draggable={false}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      {children}
    </span>
  );
}
