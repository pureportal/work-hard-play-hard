import type { ReactionKind } from "@workhard/shared";
import { Container, Graphics } from "pixi.js";

const PARTICLE_COUNT: Record<ReactionKind, number> = {
  wave: 3,
  heart: 4,
  celebrate: 10,
  thumbs_up: 3,
  laugh: 4,
  clap: 5,
};

const COLORS: Record<ReactionKind, number[]> = {
  wave: [0x79d3c4, 0x8bdbe7],
  heart: [0xe85578, 0xffacc1],
  celebrate: [0xe85578, 0xf8b64b, 0x795fe0, 0x79d3c4],
  thumbs_up: [0xf8b64b, 0xffdc86],
  laugh: [0x70d3e6, 0xa5ecf4],
  clap: [0xf8b64b, 0x79d3c4],
};

export class WorldReactionParticles {
  readonly container = new Container();
  private readonly particles = Array.from({ length: 10 }, () => new Graphics());
  private kind: ReactionKind = "wave";

  constructor() {
    this.container.addChild(...this.particles);
  }

  setKind(kind: ReactionKind): void {
    this.kind = kind;
    for (const [index, particle] of this.particles.entries()) {
      particle.clear();
      particle.visible = index < PARTICLE_COUNT[kind];
      const color = COLORS[kind][index % COLORS[kind].length]!;
      if (kind === "celebrate") {
        particle.rect(-2, -3, 4, 6).fill(color);
      } else if (kind === "heart") {
        particle.circle(-1.5, -1, 2).circle(1.5, -1, 2)
          .moveTo(-3.5, 0).lineTo(0, 4).lineTo(3.5, 0).closePath().fill(color);
      } else if (kind === "clap" || kind === "thumbs_up") {
        particle.moveTo(0, -4).lineTo(1.5, -1.5).lineTo(4, 0).lineTo(1.5, 1.5)
          .lineTo(0, 4).lineTo(-1.5, 1.5).lineTo(-4, 0).lineTo(-1.5, -1.5).closePath().fill(color);
      } else if (kind === "laugh") {
        particle.moveTo(0, -4).lineTo(3, 1).lineTo(0, 3).lineTo(-3, 1).closePath().fill(color);
      } else {
        particle.circle(0, 0, 2.5).fill(color);
      }
    }
  }

  update(elapsed: number, reducedMotion: boolean): void {
    const count = PARTICLE_COUNT[this.kind];
    const duration = this.kind === "celebrate" ? 1_300 : 1_050;
    const cycle = this.kind === "celebrate" ? elapsed % duration : elapsed;
    this.container.visible = !reducedMotion && elapsed < (this.kind === "celebrate" ? 2_600 : duration);
    if (!this.container.visible) return;

    for (let index = 0; index < count; index++) {
      const particle = this.particles[index]!;
      const delay = index % 3 * 55;
      const progress = Math.max(0, Math.min(1, (cycle - delay) / (duration - delay)));
      const spread = this.kind === "celebrate" ? 39 : 25;
      const horizontal = (index - (count - 1) / 2) / Math.max(1, (count - 1) / 2);
      particle.alpha = cycle < delay ? 0 : Math.sin(progress * Math.PI) * 0.9;
      particle.position.set(horizontal * (5 + spread * progress),
        -4 - (18 + (index % 3) * 5) * progress + (this.kind === "celebrate" ? 17 * progress * progress : 0));
      particle.rotation = this.kind === "celebrate" ? progress * (index % 2 ? 2 : -2) : 0;
      particle.scale.set(0.65 + Math.sin(progress * Math.PI) * 0.45);
    }
  }
}
