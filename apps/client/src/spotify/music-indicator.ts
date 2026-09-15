import { Container, Graphics } from "pixi.js";

export class MusicIndicator {
  readonly container = new Container({ label: "spotify-notes", eventMode: "none" });
  private readonly notes: Graphics[];

  constructor() {
    this.notes = Array.from({ length: 3 }, (_, index) => {
      const note = new Graphics()
        .ellipse(-2, 3, 2.8, 2).fill(index === 1 ? "#68a998" : "#8a78bd")
        .moveTo(0, 3).lineTo(0, -6).lineTo(4, -4)
        .stroke({ color: index === 1 ? "#68a998" : "#8a78bd", width: 1.6 });
      note.x = (index - 1) * 11;
      this.container.addChild(note);
      return note;
    });
    this.container.visible = false;
  }

  update(now: number, expiresAt: number, headY: number, reducedMotion: boolean, reacting: boolean): void {
    this.container.visible = expiresAt > now && !reacting;
    if (!this.container.visible) return;
    this.container.y = headY - 14;
    for (const [index, note] of this.notes.entries()) {
      const phase = now / 650 + index * 1.8;
      note.y = reducedMotion ? 0 : Math.sin(phase) * 3;
      note.rotation = reducedMotion ? 0 : Math.sin(phase / 2) * 0.09;
      note.alpha = reducedMotion ? 0.85 : 0.7 + (Math.sin(phase) + 1) * 0.13;
    }
  }
}
