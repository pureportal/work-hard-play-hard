import type { FloorLayout } from "@workhard/shared";

export const WHITEBOARD_IMAGE_RECOVERY_MS = 60 * 60 * 1000;

export interface WhiteboardImageWrite {
  id: string;
  image: Buffer;
  width: number;
  height: number;
  objectId: string;
}

export function whiteboardImageReferences(layouts: FloorLayout[]) {
  const boards = layouts.flatMap((layout) => layout.objects).filter((object) => object.workState?.kind === "whiteboard");
  const references = boards.flatMap((board) => board.workState?.kind === "whiteboard"
    ? board.workState.document.cards.flatMap((card) => {
      const id = card.kind === "image" && /^\/v1\/whiteboards\/images\/([a-f0-9]{64})$/.exec(card.src)?.[1];
      return id ? [{ imageId: id, objectId: board.id }] : [];
    }) : []);
  return { boardIds: new Set(layouts.flatMap((layout) => layout.objects.map((object) => object.id))), references };
}
