import type { ClientCommand, ServerEvent } from "@workhard/shared";
import type { ApplicationDatabase } from "../persistence/application-database.js";
import type { WorkspaceStore } from "../store.js";
import type { WorldRuntime } from "../world/world-runtime.js";

export async function saveWorkObject(command: Extract<ClientCommand, { type: "work.update" }>, options: {
  peerId: string;
  store: WorkspaceStore;
  runtime: WorldRuntime;
  database: ApplicationDatabase;
  persist: () => Promise<void>;
  send: (event: ServerEvent) => void;
}) {
  const { peerId, store, runtime, database, persist, send } = options;
  if (command.edit.type === "whiteboard.save") {
    const images = new Set(command.edit.document.cards.flatMap((card) => card.kind === "image" && card.src.startsWith("/v1/whiteboards/images/") ? [card.src.slice("/v1/whiteboards/images/".length)] : []));
    const previous = store.getObject(command.objectId)?.workState;
    if (previous?.kind === "whiteboard") {
      for (const card of previous.document.cards) if (card.kind === "image" && card.src.startsWith("/v1/whiteboards/images/")) images.delete(card.src.slice("/v1/whiteboards/images/".length));
    }
    if (images.size && !await database.retainWhiteboardImages(command.objectId, [...images])) {
      send({ type: "command.error", requestId: command.requestId, code: "IMAGE_NOT_FOUND", message: "An image has expired. Remove it and upload it again." });
      return;
    }
  }
  const previous = store.getObject(command.objectId)?.workState;
  runtime.handleCommand(peerId, command);
  if (store.getObject(command.objectId)?.workState === previous) return;
  await persist();
  send({ type: "work.saved", requestId: command.requestId });
}
