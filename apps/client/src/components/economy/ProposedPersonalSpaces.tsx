import type { Member, Room, RoomSettings } from "@workhard/shared";

export function ProposedPersonalSpaces({ room, settings, members }: { room: Room; settings: RoomSettings; members: Member[] }) {
  const areas = settings.personalAreas ?? [];
  if (!areas.length) return null;
  const bounds = room.bounds;
  return <figure className="proposed-personal-spaces">
    <svg viewBox={`${bounds.x - 16} ${bounds.y - 16} ${bounds.width + 32} ${bounds.height + 32}`} role="img" aria-label={`Proposed areas in ${settings.name}`}>
      {room.footprint.map((rect, index) => <rect key={index} {...rect} className="proposed-space-floor" />)}
      {areas.map((area, index) => <g key={area.id}><rect {...area.bounds} className="proposed-space-area" />
        <text x={area.bounds.x + area.bounds.width / 2} y={area.bounds.y + area.bounds.height / 2} textAnchor="middle" dominantBaseline="middle">{index + 1}</text></g>)}
    </svg>
    <figcaption><ol>{areas.map((area) => <li key={area.id}>{area.name} · {members.find((member) => member.id === area.ownerUserId)?.name}</li>)}</ol></figcaption>
  </figure>;
}
