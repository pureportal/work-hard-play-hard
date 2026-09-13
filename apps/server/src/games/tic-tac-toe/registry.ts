import type { TicTacToeVariantId } from "@workhard/shared";
import { ClassicTicTacToe } from "./classic.js";
import { StackingTicTacToe } from "./stacking.js";
import { UltimateTicTacToe } from "./ultimate.js";
import type { TicTacToeVariantEngine } from "./variant.js";

const variantFactories: Record<TicTacToeVariantId, () => TicTacToeVariantEngine> = {
  classic: () => new ClassicTicTacToe(),
  ultimate: () => new UltimateTicTacToe(),
  stacking: () => new StackingTicTacToe(),
};

export function createTicTacToeVariant(variantId: TicTacToeVariantId): TicTacToeVariantEngine {
  return variantFactories[variantId]();
}
