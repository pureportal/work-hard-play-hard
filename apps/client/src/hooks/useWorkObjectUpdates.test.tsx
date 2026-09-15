import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWorkObjectUpdates } from "./useWorkObjectUpdates";

const command = { type: "work.update" as const, requestId: "save", objectId: "board", baseRevision: 0, edit: { type: "whiteboard.save" as const, document: { text: "Plan", cards: [] } } };

describe("work save acknowledgements", () => {
  it("waits for persistence even after receiving the updated layout", async () => {
    const { result } = renderHook(useWorkObjectUpdates);
    const completed = vi.fn();
    const saving = result.current.update(() => true, command).then(completed);
    await act(async () => {
      result.current.handleEvent({ type: "layout.updated", requestId: "save", layout: { floorId: "floor", revision: 1, walls: [], openings: [], tiles: [], objects: [], rooms: [] } });
    });
    expect(completed).not.toHaveBeenCalled();
    await act(async () => {
      result.current.handleEvent({ type: "work.saved", requestId: "save" });
      await saving;
    });
    expect(completed).toHaveBeenCalledOnce();
  });

  it("retains conflict codes for automatic rebase and retry", async () => {
    const { result } = renderHook(useWorkObjectUpdates);
    const saving = result.current.update(() => true, command);
    const rejected = expect(saving).rejects.toMatchObject({ code: "WORK_OBJECT_CONFLICT" });
    act(() => result.current.handleEvent({ type: "command.error", requestId: "save", code: "WORK_OBJECT_CONFLICT", message: "The board changed." }));
    await rejected;
  });
});
