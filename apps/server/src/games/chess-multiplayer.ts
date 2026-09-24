import { nearbyGameParticipants } from "./game-lobby.js";
import { randomUUID } from "node:crypto";
import {
  CHESS_DEFINITION_ID,
  GAME_BOT_USER_ID,
  type ChessColor,
  type ChessLegalMove,
  type ChessMatchOutcome,
  type ChessMatchRecord,
  type ChessMatchSettings,
  type ChessMatchSummary,
  type ChessPlayerStatistics,
  type ChessMatchView,
  type ChessMoveInput,
  type ChessSquare,
  type ServerEvent,
  type WorldObject,
  type WorldPlayer,
} from "@workhard/shared";
import { Chess, DEFAULT_POSITION, type Move } from "chess.js";
import { WorkspaceStore } from "../store.js";
import { findStockfishMove, type ChessBotSearch } from "./chess-bot.js";
import type { GameEventDelivery } from "./game-event-delivery.js";
import { availableDrawClaims, boardPieces, canPossiblyMate, colorName, drawClaimResult, engineMove, hydrateChess, moveRecord, outcomeAfterMove, promotionName } from "./chess-rules.js";

const RAPID_TIME_MS = 10 * 60 * 1_000;
const DAILY_TIME_MS = 24 * 60 * 60 * 1_000;
const CLOCK_BROADCAST_INTERVAL_MS = 1_000;
export const CHESS_INVITATION_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_VISIBLE_MATCHES = 50;

type Now = () => Date;

export class ChessMultiplayerRuntime {
  private readonly matches = new Map<string, ChessMatchRecord>();
  private readonly positions = new Map<string, Chess>();
  private readonly positionViews = new Map<string, Pick<ChessMatchView, "board" | "inCheck" | "legalMoves" | "drawClaims">>();
  private readonly nearbyObjectIdByUser = new Map<string, string>();
  private readonly viewingMatchIdByUser = new Map<string, string>();
  private lastClockBroadcastAt = 0;
  private botSearch: { matchId: string; controller: AbortController } | undefined;
  private readonly botErrors = new Map<string, string>();
  private botDeliveries: GameEventDelivery[] = [];
  private stopped = false;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly now: Now = () => new Date(),
    private readonly searchBot: ChessBotSearch = findStockfishMove,
  ) {
    for (const match of store.getChessMatches()) {
      if (match.status === "waiting" && this.isInvitationExpired(match, this.now())) {
        store.removeChessMatch(match.id);
        continue;
      }
      this.positions.set(match.id, hydrateChess(match));
      this.matches.set(match.id, match);
    }
  }

  syncLobby(
    players: Iterable<WorldPlayer>,
    connectedUserIds: ReadonlySet<string>,
  ): GameEventDelivery[] {
    const next = new Map<string, WorldObject>();
    const playerList = [...players];
    for (const object of this.store.getGameObjects(CHESS_DEFINITION_ID)) {
      const previous = [...this.nearbyObjectIdByUser].filter(([, objectId]) => objectId === object.id).map(([userId]) => userId);
      for (const userId of nearbyGameParticipants(playerList, object, connectedUserIds, previous)) {
        if (!next.has(userId) || this.nearbyObjectIdByUser.get(userId) === object.id) next.set(userId, object);
      }
    }
    const deliveries: GameEventDelivery[] = [];
    for (const userId of this.nearbyObjectIdByUser.keys()) {
      if (!next.has(userId)) {
        deliveries.push({
          scope: "users",
          userIds: [userId],
          event: { type: "chess.lobby_closed", definitionId: CHESS_DEFINITION_ID },
        });
        this.nearbyObjectIdByUser.delete(userId);
      }
    }
    for (const [userId, object] of next) {
      if (this.nearbyObjectIdByUser.get(userId) !== object.id) {
        deliveries.push(this.lobbyDelivery(userId, object));
      }
      this.nearbyObjectIdByUser.set(userId, object.id);
    }
    return deliveries;
  }

  create(userId: string, settings: ChessMatchSettings): GameEventDelivery[] {
    const object = this.requireChessObject(userId);
    this.requireNearby(userId);
    this.validateSettings(userId, settings);
    if (settings.bot && [...this.matches.values()].some((match) => match.creatorUserId === userId && match.settings.bot && match.status === "active")) {
      throw new Error("CHESS_BOT_MATCH_ACTIVE");
    }
    const createdAt = this.now().toISOString();
    const initialClock = initialClockMs(settings.timeControl);
    const match: ChessMatchRecord = {
      id: randomUUID(),
      definitionId: CHESS_DEFINITION_ID,
      objectId: object.id,
      creatorUserId: userId,
      whiteUserId: userId,
      ...(settings.bot ? { blackUserId: GAME_BOT_USER_ID, startedAt: createdAt }
        : settings.access === "locked" ? { reservedBlackUserId: settings.opponentUserId! } : {}),
      settings: structuredClone(settings),
      status: settings.bot ? "active" : "waiting",
      fen: DEFAULT_POSITION,
      moves: [],
      clock: {
        whiteRemainingMs: initialClock,
        blackRemainingMs: initialClock,
        ...(settings.bot && initialClock !== null ? { activeSince: createdAt } : {}),
      },
      createdAt,
      updatedAt: createdAt,
    };
    this.matches.set(match.id, match);
    this.positions.set(match.id, new Chess());
    this.store.saveChessMatch(match);
    if (settings.bot) this.viewingMatchIdByUser.set(userId, match.id);
    return [...this.lobbyDeliveries(), this.waitingDelivery(), ...this.matchViewDeliveries(match, this.now())];
  }

  join(userId: string, matchId: string): GameEventDelivery[] {
    this.requireNearby(userId);
    const match = this.requireMatch(matchId);
    if (this.isInvitationExpired(match, this.now())) {
      throw new Error("CHESS_MATCH_NOT_FOUND");
    }
    if (match.status !== "waiting") {
      throw new Error("CHESS_MATCH_STARTED");
    }
    if (match.whiteUserId === userId) {
      throw new Error("CHESS_MATCH_OWN");
    }
    if (match.settings.access === "locked" && match.reservedBlackUserId !== userId) {
      throw new Error("CHESS_MATCH_LOCKED");
    }
    const now = this.now();
    match.blackUserId = userId;
    match.status = "active";
    match.startedAt = now.toISOString();
    match.updatedAt = now.toISOString();
    if (match.settings.timeControl !== "standard") {
      match.clock.activeSince = now.toISOString();
    }
    this.viewingMatchIdByUser.set(userId, match.id);
    this.store.saveChessMatch(match);
    return [
      ...this.lobbyDeliveries(),
      this.waitingDelivery(),
      ...this.matchViewDeliveries(match, now),
    ];
  }

  open(userId: string, matchId: string): GameEventDelivery[] {
    this.requireNearby(userId);
    const match = this.requireMatch(matchId);
    this.requireParticipant(match, userId);
    this.viewingMatchIdByUser.set(userId, match.id);
    this.botErrors.delete(match.id);
    const now = this.now();
    const timeoutDeliveries = this.settleClockOrComplete(match, this.positions.get(match.id)!, now);
    if (timeoutDeliveries) {
      return timeoutDeliveries;
    }
    return [{
      scope: "users",
      userIds: [userId],
      event: { type: "chess.match_state", match: this.matchView(match, userId, now) },
    }];
  }

  close(userId: string, matchId: string): GameEventDelivery[] {
    if (this.viewingMatchIdByUser.get(userId) !== matchId) return [];
    this.viewingMatchIdByUser.delete(userId);
    return [{ scope: "users", userIds: [userId], event: { type: "chess.match_closed", matchId } }];
  }

  isViewing(userId: string): boolean {
    const matchId = this.viewingMatchIdByUser.get(userId);
    return matchId !== undefined && this.matches.get(matchId)?.status === "active";
  }

  cancel(userId: string, matchId: string): GameEventDelivery[] {
    const match = this.requireMatch(matchId);
    if (match.status !== "waiting" || match.creatorUserId !== userId) {
      throw new Error("CHESS_MATCH_CANNOT_CANCEL");
    }
    this.removeWaitingMatch(match);
    return [...this.lobbyDeliveries(), this.waitingDelivery()];
  }

  move(userId: string, matchId: string, input: ChessMoveInput): GameEventDelivery[] {
    const match = this.requireMatch(matchId);
    this.requireParticipant(match, userId);
    const now = this.now();
    const chess = this.positions.get(match.id)!;
    const timeoutDeliveries = this.settleClockOrComplete(match, chess, now);
    if (timeoutDeliveries) {
      return timeoutDeliveries;
    }
    if (match.status !== "active") {
      throw new Error("CHESS_MATCH_NOT_ACTIVE");
    }
    const movingColor = colorName(chess.turn());
    if (userIdForColor(match, movingColor) !== userId) {
      throw new Error("CHESS_NOT_YOUR_TURN");
    }

    let moved: Move;
    try {
      moved = chess.move(engineMove(input));
    } catch {
      throw new Error("CHESS_MOVE_ILLEGAL");
    }

    match.moves.push(moveRecord(moved, now));
    this.positionViews.delete(match.id);
    match.fen = chess.fen();
    if (match.drawOfferByUserId !== userId) {
      delete match.drawOfferByUserId;
    }
    if (match.settings.timeControl === "daily") {
      match.clock.whiteRemainingMs = DAILY_TIME_MS;
      match.clock.blackRemainingMs = DAILY_TIME_MS;
    }
    const outcome = outcomeAfterMove(chess, userId);
    if (outcome) {
      completeMatch(match, outcome, now);
    } else if (match.settings.timeControl !== "standard") {
      match.clock.activeSince = now.toISOString();
    }
    match.updatedAt = now.toISOString();
    this.store.saveChessMatch(match);
    return [
      ...this.matchViewDeliveries(match, now),
      ...this.lobbyDeliveries(),
    ];
  }

  resign(userId: string, matchId: string): GameEventDelivery[] {
    const match = this.requireActiveParticipant(matchId, userId);
    const now = this.now();
    const chess = this.positions.get(match.id)!;
    const timeoutDeliveries = this.settleClockOrComplete(match, chess, now);
    if (timeoutDeliveries) {
      return timeoutDeliveries;
    }
    completeMatch(match, {
      result: "resignation",
      ...(canPossiblyMate(chess, match.whiteUserId === userId ? "b" : "w")
        ? { winnerUserId: opponentUserId(match, userId) }
        : {}),
    }, now);
    this.store.saveChessMatch(match);
    return [...this.matchViewDeliveries(match, now), ...this.lobbyDeliveries()];
  }

  offerDraw(userId: string, matchId: string): GameEventDelivery[] {
    const match = this.requireActiveParticipant(matchId, userId);
    if (match.settings.bot) throw new Error("CHESS_DRAW_UNAVAILABLE");
    const now = this.now();
    const chess = this.positions.get(match.id)!;
    const timeoutDeliveries = this.settleClockOrComplete(match, chess, now);
    if (timeoutDeliveries) {
      return timeoutDeliveries;
    }
    if (match.drawOfferByUserId) {
      throw new Error("CHESS_DRAW_PENDING");
    }
    match.drawOfferByUserId = userId;
    match.updatedAt = now.toISOString();
    this.store.saveChessMatch(match);
    return this.matchViewDeliveries(match, now);
  }

  respondToDraw(userId: string, matchId: string, accept: boolean): GameEventDelivery[] {
    const match = this.requireActiveParticipant(matchId, userId);
    if (!match.drawOfferByUserId || match.drawOfferByUserId === userId) {
      throw new Error("CHESS_DRAW_NOT_FOUND");
    }
    const now = this.now();
    const chess = this.positions.get(match.id)!;
    const timeoutDeliveries = this.settleClockOrComplete(match, chess, now);
    if (timeoutDeliveries) {
      return timeoutDeliveries;
    }
    if (accept) {
      completeMatch(match, { result: "agreement" }, now);
    } else {
      delete match.drawOfferByUserId;
      match.updatedAt = now.toISOString();
    }
    this.store.saveChessMatch(match);
    return [
      ...this.matchViewDeliveries(match, now),
      ...(accept ? this.lobbyDeliveries() : []),
    ];
  }

  claimDraw(userId: string, matchId: string, intendedMove?: ChessMoveInput): GameEventDelivery[] {
    const match = this.requireActiveParticipant(matchId, userId);
    const chess = this.positions.get(match.id)!;
    if (userIdForColor(match, colorName(chess.turn())) !== userId) {
      throw new Error("CHESS_NOT_YOUR_TURN");
    }
    const now = this.now();
    const timeoutDeliveries = this.settleClockOrComplete(match, chess, now);
    if (timeoutDeliveries) {
      return timeoutDeliveries;
    }
    if (intendedMove) {
      try {
        chess.move(engineMove(intendedMove));
      } catch {
        throw new Error("CHESS_MOVE_ILLEGAL");
      }
    }
    let result;
    try {
      result = drawClaimResult(chess);
    } finally {
      if (intendedMove) {
        chess.undo();
      }
    }
    if (!result) {
      throw new Error("CHESS_DRAW_UNAVAILABLE");
    }
    completeMatch(match, { result }, now);
    this.store.saveChessMatch(match);
    return [...this.matchViewDeliveries(match, now), ...this.lobbyDeliveries()];
  }

  update(): GameEventDelivery[] {
    const now = this.now();
    const deliveries = this.botDeliveries;
    this.botDeliveries = [];
    let invitationsExpired = false;
    for (const match of this.matches.values()) {
      if (match.status === "waiting" && this.isInvitationExpired(match, now)) {
        this.removeWaitingMatch(match);
        invitationsExpired = true;
      }
    }
    if (invitationsExpired) deliveries.push(...this.lobbyDeliveries(), this.waitingDelivery());
    this.updateBot();
    for (const match of this.matches.values()) {
      if (match.status !== "active" || match.settings.timeControl === "standard") {
        continue;
      }
      const chess = this.positions.get(match.id)!;
      if (remainingForColor(match, colorName(chess.turn()), now) <= 0) {
        deliveries.push(...this.settleClockOrComplete(match, chess, now) ?? []);
      }
    }
    if (now.getTime() - this.lastClockBroadcastAt >= CLOCK_BROADCAST_INTERVAL_MS) {
      this.lastClockBroadcastAt = now.getTime();
      for (const match of this.matches.values()) {
        if (match.status === "active" && match.settings.timeControl !== "standard") {
          deliveries.push(...this.matchViewDeliveries(match, now));
        }
      }
    }
    return deliveries;
  }

  disconnect(userId: string): void {
    this.viewingMatchIdByUser.delete(userId);
    this.nearbyObjectIdByUser.delete(userId);
  }

  stop(): void {
    this.stopped = true;
    this.botSearch?.controller.abort();
    this.botDeliveries = [];
  }

  private updateBot(): void {
    if (this.stopped) return;
    if (this.botSearch) {
      if (this.matches.get(this.botSearch.matchId)?.status !== "active") this.botSearch.controller.abort();
      return;
    }
    const match = [...this.matches.values()].find((candidate) => candidate.settings.bot
      && candidate.status === "active" && this.positions.get(candidate.id)!.turn() === "b"
      && !this.botErrors.has(candidate.id));
    if (!match?.settings.bot) return;
    const controller = new AbortController();
    this.botSearch = { matchId: match.id, controller };
    const fen = match.fen;
    void this.searchBot(match.moves, match.settings.bot.difficulty, controller.signal).then((move) => {
      if (!this.stopped && !controller.signal.aborted && match.status === "active" && match.fen === fen) {
        this.botDeliveries.push(...this.move(GAME_BOT_USER_ID, match.id, move));
      }
    }).catch(() => {
      if (!this.stopped && !controller.signal.aborted && match.status === "active") {
        this.botErrors.set(match.id, "The bot could not move. Try again.");
        this.botDeliveries.push(...this.matchViewDeliveries(match, this.now()));
      }
    }).finally(() => {
      this.botSearch = undefined;
    });
  }

  getSessionEvents(userId: string): ServerEvent[] {
    const events: ServerEvent[] = [this.waitingDelivery().event];
    if (this.nearbyObjectIdByUser.has(userId)) {
      events.push(this.lobbyEvent(userId, this.requireChessObject(userId)));
    }
    const matchId = this.viewingMatchIdByUser.get(userId);
    const match = matchId ? this.matches.get(matchId) : undefined;
    if (match) events.push({ type: "chess.match_state", match: this.matchView(match, userId, this.now()) });
    return events;
  }

  private settleClockOrComplete(match: ChessMatchRecord, chess: Chess, now: Date): GameEventDelivery[] | undefined {
    if (match.status !== "active" || match.settings.timeControl === "standard") {
      return undefined;
    }
    const activeColor = colorName(chess.turn());
    const remaining = remainingForColor(match, activeColor, now);
    setRemainingForColor(match, activeColor, remaining);
    match.clock.activeSince = now.toISOString();
    if (remaining > 0) {
      return undefined;
    }
    const winnerUserId = canPossiblyMate(chess, chess.turn() === "w" ? "b" : "w")
      ? userIdForColor(match, oppositeColor(activeColor))
      : undefined;
    completeMatch(match, {
      result: "timeout",
      ...(winnerUserId ? { winnerUserId } : {}),
    }, now);
    this.store.saveChessMatch(match);
    return [...this.matchViewDeliveries(match, now), ...this.lobbyDeliveries()];
  }

  private matchViewDeliveries(match: ChessMatchRecord, now: Date): GameEventDelivery[] {
    const deliveries: GameEventDelivery[] = [];
    for (const userId of participantIds(match)) {
      if (this.viewingMatchIdByUser.get(userId) === match.id) {
        deliveries.push({
          scope: "users",
          userIds: [userId],
          event: { type: "chess.match_state", match: this.matchView(match, userId, now) },
        });
      }
    }
    return deliveries;
  }

  private matchView(match: ChessMatchRecord, userId: string, now: Date): ChessMatchView {
    const chess = this.positions.get(match.id)!;
    const turn = colorName(chess.turn());
    let positionView = this.positionViews.get(match.id);
    if (!positionView) {
      positionView = {
        board: boardPieces(chess),
        inCheck: chess.inCheck(),
        drawClaims: match.status === "active" ? availableDrawClaims(chess) : [],
        legalMoves: chess.moves({ verbose: true }).map<ChessLegalMove>((move) => ({
        from: move.from as ChessSquare,
        to: move.to as ChessSquare,
        ...(move.promotion ? { promotion: promotionName(move.promotion) } : {}),
        })),
      };
      this.positionViews.set(match.id, positionView);
    }
    const canMove = match.status === "active" && userIdForColor(match, turn) === userId;
    const activeColor = match.status === "active" && match.settings.timeControl !== "standard" ? turn : undefined;
    const pausedForWeekend = Boolean(
      activeColor
      && match.settings.pauseWeekends
      && isWeekend(now),
    );
    return {
      ...structuredClone(match),
      board: positionView.board,
      turn,
      inCheck: positionView.inCheck,
      legalMoves: canMove ? positionView.legalMoves : [],
      drawClaims: canMove ? positionView.drawClaims : [],
      clock: {
        whiteRemainingMs: match.clock.whiteRemainingMs === null
          ? null
          : remainingForColor(match, "white", now),
        blackRemainingMs: match.clock.blackRemainingMs === null
          ? null
          : remainingForColor(match, "black", now),
        ...(activeColor ? { activeColor } : {}),
        running: Boolean(activeColor) && !pausedForWeekend,
        pausedForWeekend,
      },
      serverNow: now.toISOString(),
      ...(this.botErrors.has(match.id) ? { botError: this.botErrors.get(match.id)! } : {}),
    };
  }

  private lobbyDeliveries(): GameEventDelivery[] {
    return [...this.nearbyObjectIdByUser].flatMap(([userId, objectId]) => {
      const object = this.store.getObject(objectId);
      return object ? [this.lobbyDelivery(userId, object)] : [];
    });
  }

  private lobbyDelivery(userId: string, object: WorldObject): GameEventDelivery {
    return {
      scope: "users",
      userIds: [userId],
      event: this.lobbyEvent(userId, object),
    };
  }

  private lobbyEvent(userId: string, object: WorldObject): ServerEvent {
    return {
      type: "chess.lobby_updated",
      lobby: {
        definitionId: CHESS_DEFINITION_ID,
        objectId: object.id,
        floorId: object.floorId,
        matches: [...this.matches.values()]
          .filter((match) => isVisibleInLobby(match, userId))
          .sort(compareMatchesForUser(userId))
          .filter((match, index) => match.status !== "completed" || index < MAX_VISIBLE_MATCHES)
          .map((match) => matchSummary(match)),
        statistics: chessStatistics(this.matches.values()),
      },
    };
  }

  private requireChessObject(userId: string): WorldObject {
    const definition = this.store.getMiniGame(CHESS_DEFINITION_ID);
    const objectId = this.nearbyObjectIdByUser.get(userId);
    if (!objectId) throw new Error("CHESS_TOO_FAR");
    const object = this.store.getObject(objectId);
    if (!definition || !object || object.assetId !== definition.assetId) {
      throw new Error("CHESS_NOT_FOUND");
    }
    return object;
  }

  private requireNearby(userId: string): void {
    if (!this.nearbyObjectIdByUser.has(userId)) {
      throw new Error("CHESS_TOO_FAR");
    }
  }

  private requireMatch(matchId: string): ChessMatchRecord {
    const match = this.matches.get(matchId);
    if (!match) {
      throw new Error("CHESS_MATCH_NOT_FOUND");
    }
    return match;
  }

  private requireParticipant(match: ChessMatchRecord, userId: string): void {
    if (!participantIds(match).includes(userId)) {
      throw new Error("CHESS_MATCH_FORBIDDEN");
    }
  }

  private requireActiveParticipant(matchId: string, userId: string): ChessMatchRecord {
    const match = this.requireMatch(matchId);
    this.requireParticipant(match, userId);
    if (match.status !== "active") {
      throw new Error("CHESS_MATCH_NOT_ACTIVE");
    }
    return match;
  }

  private validateSettings(userId: string, settings: ChessMatchSettings): void {
    if (settings.pauseWeekends && settings.timeControl !== "daily") {
      throw new Error("CHESS_SETTINGS_INVALID");
    }
    if (settings.bot) {
      if (settings.access !== "locked" || settings.opponentUserId !== undefined) throw new Error("CHESS_SETTINGS_INVALID");
      return;
    }
    if (settings.access === "open" && settings.opponentUserId !== undefined) {
      throw new Error("CHESS_SETTINGS_INVALID");
    }
    if (settings.access === "locked") {
      if (!settings.opponentUserId || settings.opponentUserId === userId || !this.store.getMember(settings.opponentUserId)) {
        throw new Error("CHESS_OPPONENT_INVALID");
      }
    }
  }

  private waitingDelivery(): { scope: "all"; event: Extract<ServerEvent, { type: "chess.waiting_updated" }> } {
    return {
      scope: "all",
      event: {
        type: "chess.waiting_updated",
        objectIds: [...new Set([...this.matches.values()]
          .filter((match) => match.status === "waiting")
          .map((match) => match.objectId))],
      },
    };
  }

  private isInvitationExpired(match: ChessMatchRecord, now: Date): boolean {
    return match.status === "waiting" && now.getTime() - Date.parse(match.createdAt) >= CHESS_INVITATION_TIMEOUT_MS;
  }

  private removeWaitingMatch(match: ChessMatchRecord): void {
    this.matches.delete(match.id);
    this.positions.delete(match.id);
    this.positionViews.delete(match.id);
    this.store.removeChessMatch(match.id);
    for (const [userId, viewedMatchId] of this.viewingMatchIdByUser) {
      if (viewedMatchId === match.id) this.viewingMatchIdByUser.delete(userId);
    }
  }
}

function initialClockMs(timeControl: ChessMatchSettings["timeControl"]): number | null {
  if (timeControl === "rapid") {
    return RAPID_TIME_MS;
  }
  if (timeControl === "daily") {
    return DAILY_TIME_MS;
  }
  return null;
}

function completeMatch(match: ChessMatchRecord, outcome: ChessMatchOutcome, now: Date): void {
  match.status = "completed";
  match.outcome = outcome;
  match.completedAt = now.toISOString();
  match.updatedAt = now.toISOString();
  delete match.clock.activeSince;
  delete match.drawOfferByUserId;
}

function participantIds(match: ChessMatchRecord): string[] {
  return [match.whiteUserId, ...(match.blackUserId ? [match.blackUserId] : [])];
}

function opponentUserId(match: ChessMatchRecord, userId: string): string {
  const opponent = participantIds(match).find((participantId) => participantId !== userId);
  if (!opponent) {
    throw new Error("CHESS_MATCH_NOT_ACTIVE");
  }
  return opponent;
}

function userIdForColor(match: ChessMatchRecord, color: ChessColor): string | undefined {
  return color === "white" ? match.whiteUserId : match.blackUserId;
}

function isVisibleInLobby(match: ChessMatchRecord, userId: string): boolean {
  if (participantIds(match).includes(userId) || match.reservedBlackUserId === userId) {
    return true;
  }
  return match.status === "waiting" && match.settings.access === "open";
}

function compareMatchesForUser(userId: string): (left: ChessMatchRecord, right: ChessMatchRecord) => number {
  return (left, right) => {
    const statusOrder = { active: 0, waiting: 1, completed: 2 } as const;
    const statusDifference = statusOrder[left.status] - statusOrder[right.status];
    if (statusDifference !== 0) {
      return statusDifference;
    }
    const leftParticipant = participantIds(left).includes(userId) || left.reservedBlackUserId === userId;
    const rightParticipant = participantIds(right).includes(userId) || right.reservedBlackUserId === userId;
    if (leftParticipant !== rightParticipant) {
      return leftParticipant ? -1 : 1;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  };
}

function chessStatistics(matches: Iterable<ChessMatchRecord>): ChessPlayerStatistics[] {
  const byUser = new Map<string, ChessPlayerStatistics>();
  for (const match of matches) {
    if (match.status !== "completed") continue;
    for (const participantId of participantIds(match)) {
      if (participantId === GAME_BOT_USER_ID) continue;
      const entry = byUser.get(participantId) ?? { userId: participantId, games: 0, wins: 0, draws: 0 };
      entry.games++;
      if (!match.outcome?.winnerUserId) entry.draws++;
      else if (match.outcome.winnerUserId === participantId) entry.wins++;
      byUser.set(participantId, entry);
    }
  }

  return [...byUser.values()].sort((left, right) => right.wins - left.wins || right.games - left.games);
}

function matchSummary(match: ChessMatchRecord): ChessMatchSummary {
  const turn = match.status === "active" ? (match.fen.split(" ")[1] === "w" ? "white" : "black") : undefined;
  return {
    id: match.id,
    creatorUserId: match.creatorUserId,
    whiteUserId: match.whiteUserId,
    ...(match.blackUserId ? { blackUserId: match.blackUserId } : {}),
    ...(match.reservedBlackUserId ? { reservedBlackUserId: match.reservedBlackUserId } : {}),
    settings: structuredClone(match.settings),
    status: match.status,
    ...(turn ? { turn } : {}),
    ...(match.outcome ? { outcome: structuredClone(match.outcome) } : {}),
    updatedAt: match.updatedAt,
  };
}

function remainingForColor(match: ChessMatchRecord, color: ChessColor, now: Date): number {
  const stored = color === "white" ? match.clock.whiteRemainingMs : match.clock.blackRemainingMs;
  if (stored === null) {
    return 0;
  }
  if (
    match.status !== "active"
    || !match.clock.activeSince
    || (match.fen.split(" ")[1] === "w" ? "white" : "black") !== color
  ) {
    return stored;
  }
  const elapsed = elapsedClockMs(
    Date.parse(match.clock.activeSince),
    now.getTime(),
    match.settings.pauseWeekends,
  );
  return Math.max(0, stored - elapsed);
}

function setRemainingForColor(match: ChessMatchRecord, color: ChessColor, remainingMs: number): void {
  if (color === "white") {
    match.clock.whiteRemainingMs = remainingMs;
  } else {
    match.clock.blackRemainingMs = remainingMs;
  }
}

export function elapsedClockMs(startMs: number, endMs: number, pauseWeekends: boolean): number {
  if (endMs <= startMs) {
    return 0;
  }
  if (!pauseWeekends) {
    return endMs - startMs;
  }
  let elapsed = 0;
  let cursor = startMs;
  while (cursor < endMs) {
    const cursorDate = new Date(cursor);
    const dayStart = Date.UTC(cursorDate.getUTCFullYear(), cursorDate.getUTCMonth(), cursorDate.getUTCDate());
    const nextDay = dayStart + 24 * 60 * 60 * 1_000;
    const segmentEnd = Math.min(endMs, nextDay);
    if (!isWeekend(cursorDate)) {
      elapsed += segmentEnd - cursor;
    }
    cursor = segmentEnd;
  }
  return elapsed;
}

function isWeekend(date: Date): boolean {
  return date.getUTCDay() === 0 || date.getUTCDay() === 6;
}

function oppositeColor(color: ChessColor): ChessColor {
  return color === "white" ? "black" : "white";
}
