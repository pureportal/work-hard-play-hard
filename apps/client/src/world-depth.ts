import { Container } from "pixi.js";
import { getPlacedAssetBounds, type Position, type WorldObject } from "@workhard/shared";

interface DepthView extends Position {
  container: Container;
  support?: Container;
  behind: boolean;
}

export function getWorldAssetDepth(object: WorldObject): Position {
  const bounds = getPlacedAssetBounds(object);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
}

function compareViews(left: DepthView, right: DepthView): number {
  return left.y - right.y || left.x - right.x || left.container.label.localeCompare(right.container.label);
}

export class WorldDepth {
  readonly container = new Container({ label: "world-depth", sortableChildren: true });
  private readonly views = new Map<Container, DepthView>();
  private orderedContainers: Container[] = [];
  private dirty = false;

  setPosition(container: Container, x: number, y: number): void {
    const view = this.views.get(container);
    if (view) {
      if (view.x === x && view.y === y) return;
      view.x = x;
      view.y = y;
    } else {
      this.views.set(container, { container, x, y, behind: false });
      this.container.addChild(container);
      container.once("destroyed", () => {
        this.views.delete(container);
        for (const attached of this.views.values()) {
          if (attached.support === container) delete attached.support;
        }
        this.dirty = true;
      });
    }
    this.dirty = true;
  }

  attach(container: Container, support: Container | undefined, behind = false): void {
    const view = this.views.get(container)!;
    if (view.support === support && view.behind === behind) return;
    if (support) view.support = support;
    else delete view.support;
    view.behind = behind;
    this.dirty = true;
  }

  sort(): void {
    if (!this.dirty) return;
    const roots: DepthView[] = [];
    const attachments = new Map<Container, { before: DepthView[]; after: DepthView[] }>();
    for (const view of this.views.values()) {
      if (!view.support) {
        roots.push(view);
        continue;
      }
      let group = attachments.get(view.support);
      if (!group) {
        group = { before: [], after: [] };
        attachments.set(view.support, group);
      }
      (view.behind ? group.before : group.after).push(view);
    }
    const order: Container[] = [];
    const orderViews = (views: DepthView[]) => {
      for (const view of views.sort(compareViews)) {
        const group = attachments.get(view.container);
        if (group) orderViews(group.before);
        order.push(view.container);
        if (group) orderViews(group.after);
      }
    };
    orderViews(roots);
    if (order.length !== this.orderedContainers.length
      || order.some((container, index) => container !== this.orderedContainers[index])) {
      for (const [index, container] of order.entries()) container.zIndex = index;
      this.container.sortChildren();
      this.orderedContainers = order;
    }
    this.dirty = false;
  }
}
