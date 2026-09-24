import { describe, expect, it } from "vitest";
import { FallingBlocksGame, type FallingBlocksCommand } from "@workhard/shared";
import { FallingBlocksPrediction } from "./falling-blocks-prediction";

describe("FallingBlocksPrediction", () => {
  it("applies inputs and gravity before the server responds, then replays pending inputs", () => {
    const server = new FallingBlocksGame("round-prediction");
    const prediction = new FallingBlocksPrediction(server.state, "classic", 0);
    const initial = prediction.state;
    const sent: Array<{ command: FallingBlocksCommand; sequence: number; sessionId: string }> = [];
    const send = (command: FallingBlocksCommand, sequence: number, sessionId: string) => {
      sent.push({ command, sequence, sessionId });
      return true;
    };

    prediction.command("left", send, 10);
    expect(prediction.state.activeCells[0]!.column).toBe(initial.activeCells[0]!.column - 1);
    prediction.command("right", send, 20);
    expect(prediction.state.activeCells).toEqual(initial.activeCells);
    prediction.tick(800);
    expect(prediction.state.activeCells[0]!.row).toBeGreaterThan(initial.activeCells[0]!.row);

    server.command("left");
    prediction.reconcile({ ...server.state, acknowledgedSequences: { [sent[0]!.sessionId]: 1 } }, 900);
    expect(prediction.state.activeCells[0]!.column).toBe(initial.activeCells[0]!.column);
    prediction.command("left", send, 910);
    expect(sent.map(({ sequence }) => sequence)).toEqual([1, 2, 3]);
  });

  it("keeps an input made while disconnected and accepts a server correction", () => {
    const server = new FallingBlocksGame("round-attack");
    const prediction = new FallingBlocksPrediction(server.state, "classic", 0);
    const before = prediction.state.activeCells;
    prediction.command("left", () => false, 10);
    expect(prediction.state.activeCells[0]!.column).toBe(before[0]!.column - 1);
    const resent: number[] = [];
    prediction.resendPending((_command, sequence) => { resent.push(sequence); return true; });
    expect(resent).toEqual([1]);

    server.addGarbageRows(2, 4);
    prediction.reconcile(server.state, 20);
    expect(prediction.state.simulation.board).toEqual(server.snapshot.board);
  });
});
