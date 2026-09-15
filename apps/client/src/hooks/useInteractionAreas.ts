import { useCallback, useEffect, useRef, useState } from "react";
import type { Rect } from "@workhard/shared";

export type InteractionHighlight = { type: "circle"; x: number; y: number; radius: number }
  | { type: "rect"; bounds: Rect };

export interface InteractionArea {
  id: string;
  label: string;
  distance: number;
  highlight: InteractionHighlight;
}

export function useInteractionAreas(areas: InteractionArea[]) {
  const [selectedId, setSelectedId] = useState<string>();
  const explicitSelection = useRef<string | undefined>(undefined);
  const select = useCallback((id: string) => {
    explicitSelection.current = id;
    setSelectedId(id);
  }, []);
  const previousIds = useRef(new Set<string>());
  const ids = areas.map((area) => area.id).join("|");
  const active = areas.find((area) => area.id === selectedId) ?? areas[0];
  useEffect(() => {
    const entered = areas.find((area) => !previousIds.current.has(area.id));
    const selected = areas.find((area) => area.id === explicitSelection.current);
    if (!selected) explicitSelection.current = undefined;
    const next = selected ?? entered ?? areas.find((area) => area.id === selectedId) ?? areas[0];
    setSelectedId(next?.id);
    previousIds.current = new Set(areas.map((area) => area.id));
  }, [ids]);
  return { active, select };
}
