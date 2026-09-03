import { randomUUID } from "node:crypto";
import {
  DEFAULT_GAME_SETTINGS,
  DAILY_REWARD_AMOUNTS,
  GAME_REWARD_DAILY_CAP,
  MAX_OWNED_ASSETS,
  WELCOME_COIN_REWARD,
  calculateGameCoinReward,
  getAssetDefinition,
  getDailyRewardStatus,
  getUtcDayKey,
  type CoinTransaction,
  type DailyRewardProgress,
  type FloorLayout,
  type GameScore,
  type GameSettings,
  type OwnedAsset,
  type PlayerEconomy,
  type WorldObject,
} from "@workhard/shared";

interface EconomyAccountRecord {
  userId: string;
  coinBalance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  dailyReward: DailyRewardProgress;
  inventory: OwnedAsset[];
}

interface PersistedCoinTransaction extends CoinTransaction {
  userId: string;
  operationKey: string;
  operationFingerprint: string;
}

export interface EconomyPersistenceState {
  accounts: EconomyAccountRecord[];
  transactions: PersistedCoinTransaction[];
  gameSettings: GameSettings;
}

export interface EconomyOperationResult {
  economy: PlayerEconomy;
  transaction: CoinTransaction;
  replayed: boolean;
}

export interface GameRewardResult {
  userId: string;
  amount: number;
  economy: PlayerEconomy;
}

export interface GameRewardInput {
  userId: string;
  roundId: string;
  lines: number;
  won: boolean;
}

export class EconomyStore {
  private accounts: EconomyAccountRecord[] = [];
  private transactions: PersistedCoinTransaction[] = [];
  private readonly transactionsByUserId = new Map<string, PersistedCoinTransaction[]>();
  private readonly transactionsByOperation = new Map<string, Map<string, PersistedCoinTransaction>>();
  private readonly gameRewardsByUserDay = new Map<string, Map<string, number>>();
  private gameSettings: GameSettings = structuredClone(DEFAULT_GAME_SETTINGS);

  constructor(userIds: Iterable<string>, now = new Date()) {
    for (const userId of userIds) {
      this.createAccount(userId, now);
    }
  }

  createAccount(userId: string, now = new Date()): void {
    if (this.accounts.some((account) => account.userId === userId)) {
      return;
    }
    const createdAt = isoTimestamp(now);
    const account: EconomyAccountRecord = {
      userId,
      coinBalance: WELCOME_COIN_REWARD,
      lifetimeEarned: WELCOME_COIN_REWARD,
      lifetimeSpent: 0,
      dailyReward: { streak: 0 },
      inventory: [],
    };
    this.accounts.push(account);
    this.appendTransaction({
      id: randomUUID(),
      userId,
      operationKey: `welcome:${userId}`,
      operationFingerprint: "welcome",
      kind: "welcome",
      amount: WELCOME_COIN_REWARD,
      balanceAfter: WELCOME_COIN_REWARD,
      createdAt,
    });
  }

  removeAccount(userId: string): void {
    this.accounts = this.accounts.filter((account) => account.userId !== userId);
    this.transactions = this.transactions.filter((transaction) => transaction.userId !== userId);
    this.transactionsByUserId.delete(userId);
    this.transactionsByOperation.delete(userId);
    this.gameRewardsByUserDay.delete(userId);
  }

  getPlayerEconomy(userId: string, now = new Date()): PlayerEconomy {
    const account = this.requireAccount(userId);
    return structuredClone({
      coinBalance: account.coinBalance,
      lifetimeEarned: account.lifetimeEarned,
      lifetimeSpent: account.lifetimeSpent,
      dailyReward: getDailyRewardStatus(account.dailyReward, now),
      inventory: account.inventory,
      recentTransactions: [...(this.transactionsByUserId.get(userId) ?? [])]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 20)
        .map(({ userId: _userId, operationKey: _operationKey, operationFingerprint: _fingerprint, ...transaction }) => transaction),
    });
  }

  getOwnedAsset(userId: string, ownedAssetId: string): OwnedAsset {
    const asset = this.requireAccount(userId).inventory.find((candidate) => candidate.id === ownedAssetId);
    if (!asset) {
      throw new Error("ASSET_NOT_OWNED");
    }
    return structuredClone(asset);
  }

  claimDailyReward(userId: string, operationKey: string, now = new Date()): EconomyOperationResult {
    const replay = this.findOperation(userId, operationKey, "daily_bonus");
    if (replay) {
      return { economy: this.getPlayerEconomy(userId, now), transaction: replay, replayed: true };
    }
    const account = this.requireAccount(userId);
    const createdAt = isoTimestamp(now);
    const status = getDailyRewardStatus(account.dailyReward, now);
    if (!status.claimable) {
      throw new Error("DAILY_REWARD_ALREADY_CLAIMED");
    }
    const today = getUtcDayKey(now);
    const dailyReward = {
      lastClaimedDay: today,
      streak: status.streak + 1,
    };
    const transaction = this.applyTransaction(account, {
      operationKey,
      operationFingerprint: "daily_bonus",
      kind: "daily_bonus",
      amount: status.amount,
      createdAt,
      sourceId: today,
    });
    account.dailyReward = dailyReward;
    return { economy: this.getPlayerEconomy(userId, now), transaction, replayed: false };
  }

  purchaseAsset(userId: string, assetId: string, operationKey: string, now = new Date()): EconomyOperationResult {
    const fingerprint = `shop_purchase:${assetId}`;
    const replay = this.findOperation(userId, operationKey, fingerprint);
    if (replay) {
      return { economy: this.getPlayerEconomy(userId, now), transaction: replay, replayed: true };
    }
    const definition = getAssetDefinition(assetId);
    if (!definition?.buildable || !definition.shop?.available) {
      throw new Error("ASSET_UNAVAILABLE");
    }
    const account = this.requireAccount(userId);
    const createdAt = isoTimestamp(now);
    if (account.inventory.length >= MAX_OWNED_ASSETS) {
      throw new Error("INVENTORY_FULL");
    }
    if (account.coinBalance < definition.shop.price) {
      throw new Error("INSUFFICIENT_COINS");
    }
    const ownedAsset: OwnedAsset = {
      id: randomUUID(),
      assetId,
      acquiredAt: createdAt,
    };
    const transaction = this.applyTransaction(account, {
      operationKey,
      operationFingerprint: fingerprint,
      kind: "shop_purchase",
      amount: -definition.shop.price,
      createdAt,
      assetId,
      ownedAssetId: ownedAsset.id,
    });
    account.inventory.push(ownedAsset);
    return { economy: this.getPlayerEconomy(userId, now), transaction, replayed: false };
  }

  rewardGame(
    userId: string,
    roundId: string,
    lines: number,
    won: boolean,
    now = new Date(),
  ): GameRewardResult {
    return this.rewardGames([{ userId, roundId, lines, won }], now)[0]!;
  }

  rewardGames(rewards: GameRewardInput[], now = new Date()): GameRewardResult[] {
    const createdAt = isoTimestamp(now);
    const today = getUtcDayKey(now);
    if (new Set(rewards.map((reward) => reward.userId)).size !== rewards.length) {
      throw new Error("GAME_REWARD_INVALID");
    }
    const prepared = rewards.map((reward) => {
      if (
        !reward.roundId
        || reward.roundId.length > 100
        || !Number.isSafeInteger(reward.lines)
        || reward.lines < 0
        || typeof reward.won !== "boolean"
      ) {
        throw new Error("GAME_REWARD_INVALID");
      }
      const operationKey = `game:${reward.roundId}`;
      const operationFingerprint = `game_reward:${reward.lines}:${reward.won}`;
      const replay = this.findOperation(reward.userId, operationKey, operationFingerprint);
      if (replay) {
        return { reward, replay };
      }
      const account = this.requireAccount(reward.userId);
      const earnedToday = this.gameRewardsByUserDay.get(reward.userId)?.get(today) ?? 0;
      const amount = Math.min(
        calculateGameCoinReward(reward.lines, reward.won),
        Math.max(0, GAME_REWARD_DAILY_CAP - earnedToday),
      );
      this.calculateTransactionTotals(account, amount);
      return { reward, account, amount, operationKey, operationFingerprint };
    });
    for (const item of prepared) {
      if ("replay" in item) {
        continue;
      }
      this.applyTransaction(item.account, {
        operationKey: item.operationKey,
        operationFingerprint: item.operationFingerprint,
        kind: "game_reward",
        amount: item.amount,
        createdAt,
        sourceId: item.reward.roundId,
      });
    }
    return prepared.map((item) => ({
      userId: item.reward.userId,
      amount: "replay" in item ? item.replay.amount : item.amount,
      economy: this.getPlayerEconomy(item.reward.userId, now),
    }));
  }

  getGameSettings(): GameSettings {
    return structuredClone(this.gameSettings);
  }

  updateGameSettings(settings: GameSettings): GameSettings {
    this.gameSettings = structuredClone(settings);
    return this.getGameSettings();
  }

  reconcileLayout(previous: FloorLayout, next: FloorLayout, otherObjects: WorldObject[], now = new Date()): string[] {
    const placedAt = isoTimestamp(now);
    const previousById = new Map(previous.objects.map((object) => [object.id, object]));
    const nextById = new Map(next.objects.map((object) => [object.id, object]));
    const seenOwnedAssetIds = new Set<string>();
    for (const object of [...otherObjects, ...next.objects]) {
      this.validateOwnedObject(object);
      if (!object.ownedAssetId) {
        continue;
      }
      if (seenOwnedAssetIds.has(object.ownedAssetId)) {
        throw new Error("ASSET_OWNERSHIP_INVALID");
      }
      seenOwnedAssetIds.add(object.ownedAssetId);
    }
    for (const object of previous.objects) {
      const candidate = nextById.get(object.id);
      if (candidate && (
        candidate.ownerUserId !== object.ownerUserId
        || candidate.ownedAssetId !== object.ownedAssetId
        || candidate.assetId !== object.assetId
      )) {
        throw new Error("ASSET_OWNERSHIP_INVALID");
      }
    }
    const removed = previous.objects.filter((object) => object.ownedAssetId && !nextById.has(object.id));
    const added = next.objects.filter((object) => object.ownedAssetId && !previousById.has(object.id));
    for (const object of added) {
      const asset = this.getMutableOwnedAsset(object.ownerUserId!, object.ownedAssetId!);
      if (asset.placement && asset.placement.objectId !== object.id) {
        throw new Error("ASSET_ALREADY_PLACED");
      }
    }
    const affectedUserIds = new Set<string>();
    for (const object of removed) {
      const asset = this.getMutableOwnedAsset(object.ownerUserId!, object.ownedAssetId!);
      if (asset.placement?.objectId === object.id) {
        delete asset.placement;
        affectedUserIds.add(object.ownerUserId!);
      }
    }
    for (const object of added) {
      const asset = this.getMutableOwnedAsset(object.ownerUserId!, object.ownedAssetId!);
      asset.placement = {
        objectId: object.id,
        floorId: object.floorId,
        placedAt,
      };
      affectedUserIds.add(object.ownerUserId!);
    }
    return [...affectedUserIds];
  }

  exportState(): EconomyPersistenceState {
    return structuredClone({
      accounts: this.accounts,
      transactions: this.transactions,
      gameSettings: this.gameSettings,
    });
  }

  restoreState(state: EconomyPersistenceState): void {
    validatePersistenceState(state);
    this.accounts = structuredClone(state.accounts);
    this.transactions = structuredClone(state.transactions);
    this.gameSettings = structuredClone(state.gameSettings);
    this.rebuildTransactionIndexes();
  }

  validateStateForWorkspace(
    state: EconomyPersistenceState,
    userIds: Iterable<string>,
    layouts: FloorLayout[],
    scores: GameScore[],
  ): void {
    validatePersistenceState(state);
    validateWorkspaceState(state.accounts, state.transactions, userIds, layouts, scores);
  }

  validateWorkspace(userIds: Iterable<string>, layouts: FloorLayout[], scores: GameScore[]): void {
    validateWorkspaceState(this.accounts, this.transactions, userIds, layouts, scores);
  }

  private applyTransaction(
    account: EconomyAccountRecord,
    input: Omit<PersistedCoinTransaction, "id" | "userId" | "balanceAfter">,
  ): CoinTransaction {
    const { balanceAfter, lifetimeEarned, lifetimeSpent } = this.calculateTransactionTotals(account, input.amount);
    account.coinBalance = balanceAfter;
    account.lifetimeEarned = lifetimeEarned;
    account.lifetimeSpent = lifetimeSpent;
    const transaction: PersistedCoinTransaction = {
      id: randomUUID(),
      userId: account.userId,
      balanceAfter,
      ...input,
    };
    this.appendTransaction(transaction);
    const { userId: _userId, operationKey: _operationKey, operationFingerprint: _fingerprint, ...publicTransaction } = transaction;
    return structuredClone(publicTransaction);
  }

  private calculateTransactionTotals(account: EconomyAccountRecord, amount: number): {
    balanceAfter: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
  } {
    const balanceAfter = account.coinBalance + amount;
    const lifetimeEarned = account.lifetimeEarned + Math.max(amount, 0);
    const lifetimeSpent = account.lifetimeSpent + Math.max(-amount, 0);
    if (
      !Number.isSafeInteger(balanceAfter)
      || balanceAfter < 0
      || !Number.isSafeInteger(lifetimeEarned)
      || !Number.isSafeInteger(lifetimeSpent)
    ) {
      throw new Error("COIN_BALANCE_INVALID");
    }
    return { balanceAfter, lifetimeEarned, lifetimeSpent };
  }

  private findOperation(userId: string, operationKey: string, fingerprint: string): CoinTransaction | undefined {
    const transaction = this.transactionsByOperation.get(userId)?.get(operationKey);
    if (!transaction) {
      return undefined;
    }
    if (transaction.operationFingerprint !== fingerprint) {
      throw new Error("ECONOMY_REQUEST_CONFLICT");
    }
    const { userId: _userId, operationKey: _operationKey, operationFingerprint: _fingerprint, ...publicTransaction } = transaction;
    return structuredClone(publicTransaction);
  }

  private appendTransaction(transaction: PersistedCoinTransaction): void {
    this.transactions.push(transaction);
    const userTransactions = this.transactionsByUserId.get(transaction.userId) ?? [];
    userTransactions.push(transaction);
    this.transactionsByUserId.set(transaction.userId, userTransactions);
    const userOperations = this.transactionsByOperation.get(transaction.userId) ?? new Map<string, PersistedCoinTransaction>();
    userOperations.set(transaction.operationKey, transaction);
    this.transactionsByOperation.set(transaction.userId, userOperations);
    if (transaction.kind === "game_reward") {
      const rewardsByDay = this.gameRewardsByUserDay.get(transaction.userId) ?? new Map<string, number>();
      const day = transaction.createdAt.slice(0, 10);
      rewardsByDay.set(day, (rewardsByDay.get(day) ?? 0) + transaction.amount);
      this.gameRewardsByUserDay.set(transaction.userId, rewardsByDay);
    }
  }

  private rebuildTransactionIndexes(): void {
    this.transactionsByUserId.clear();
    this.transactionsByOperation.clear();
    this.gameRewardsByUserDay.clear();
    const transactions = this.transactions;
    this.transactions = [];
    for (const transaction of transactions) {
      this.appendTransaction(transaction);
    }
  }

  private validateOwnedObject(object: WorldObject): void {
    if (Boolean(object.ownerUserId) !== Boolean(object.ownedAssetId)) {
      throw new Error("ASSET_OWNERSHIP_INVALID");
    }
    if (!object.ownerUserId || !object.ownedAssetId) {
      return;
    }
    const asset = this.getMutableOwnedAsset(object.ownerUserId, object.ownedAssetId);
    if (asset.assetId !== object.assetId) {
      throw new Error("ASSET_OWNERSHIP_INVALID");
    }
  }

  private getMutableOwnedAsset(userId: string, ownedAssetId: string): OwnedAsset {
    const asset = this.requireAccount(userId).inventory.find((candidate) => candidate.id === ownedAssetId);
    if (!asset) {
      throw new Error("ASSET_NOT_OWNED");
    }
    return asset;
  }

  private requireAccount(userId: string): EconomyAccountRecord {
    const account = this.accounts.find((candidate) => candidate.userId === userId);
    if (!account) {
      throw new Error("USER_NOT_FOUND");
    }
    return account;
  }
}

function validateWorkspaceState(
  accounts: EconomyAccountRecord[],
  transactions: PersistedCoinTransaction[],
  userIds: Iterable<string>,
  layouts: FloorLayout[],
  scores: GameScore[],
): void {
  if (!Array.isArray(layouts) || !Array.isArray(scores)) {
    throw new Error("ECONOMY_STATE_INVALID");
  }
  const expectedUserIds = new Set(userIds);
  if (
    expectedUserIds.size !== accounts.length
    || accounts.some((account) => !expectedUserIds.has(account.userId))
  ) {
    throw new Error("ECONOMY_STATE_INVALID");
  }
  const accountsById = new Map(accounts.map((account) => [account.userId, account]));
  const linkedAssets = new Map<string, string>();
  const ownedObjectIds = new Set<string>();
  for (const layout of layouts) {
    for (const object of layout.objects) {
      if (Boolean(object.ownerUserId) !== Boolean(object.ownedAssetId)) {
        throw new Error("ECONOMY_STATE_INVALID");
      }
      if (!object.ownerUserId || !object.ownedAssetId) {
        continue;
      }
      const asset = accountsById.get(object.ownerUserId)?.inventory.find(
        (candidate) => candidate.id === object.ownedAssetId,
      );
      if (
        !asset
        || asset.assetId !== object.assetId
        || object.floorId !== layout.floorId
        || asset.placement?.objectId !== object.id
        || asset.placement.floorId !== layout.floorId
        || linkedAssets.has(asset.id)
        || ownedObjectIds.has(object.id)
      ) {
        throw new Error("ECONOMY_STATE_INVALID");
      }
      linkedAssets.set(asset.id, object.ownerUserId);
      ownedObjectIds.add(object.id);
    }
  }
  for (const account of accounts) {
    for (const asset of account.inventory) {
      const linkedUserId = linkedAssets.get(asset.id);
      if (Boolean(asset.placement) !== Boolean(linkedUserId) || (linkedUserId && linkedUserId !== account.userId)) {
        throw new Error("ECONOMY_STATE_INVALID");
      }
    }
  }
  const scoresByRound = new Map<string, Map<string, GameScore>>();
  for (const score of scores) {
    if (
      !score
      || typeof score !== "object"
      || typeof score.roundId !== "string"
      || !score.roundId
      || typeof score.userId !== "string"
      || !score.userId
      || !Number.isSafeInteger(score.lines)
      || score.lines < 0
      || typeof score.won !== "boolean"
      || !isValidTimestamp(score.playedAt)
    ) {
      throw new Error("ECONOMY_STATE_INVALID");
    }
    const roundScores = scoresByRound.get(score.roundId) ?? new Map<string, GameScore>();
    if (roundScores.has(score.userId)) {
      throw new Error("ECONOMY_STATE_INVALID");
    }
    roundScores.set(score.userId, score);
    scoresByRound.set(score.roundId, roundScores);
  }
  for (const transaction of transactions) {
    if (transaction.kind !== "game_reward") {
      continue;
    }
    const reward = parseGameRewardFingerprint(transaction.operationFingerprint);
    const score = transaction.sourceId
      ? scoresByRound.get(transaction.sourceId)?.get(transaction.userId)
      : undefined;
    if (
      !reward
      || !score
      || score.lines !== reward.lines
      || score.won !== reward.won
      || score.playedAt !== transaction.createdAt
    ) {
      throw new Error("ECONOMY_STATE_INVALID");
    }
  }
}

function validatePersistenceState(state: EconomyPersistenceState): void {
  if (
    !state
    || typeof state !== "object"
    || !Array.isArray(state.accounts)
    || !Array.isArray(state.transactions)
    || typeof state.gameSettings?.allowPlayerAssetPlacementInPublicRooms !== "boolean"
    || Object.keys(state.gameSettings).some((key) => key !== "allowPlayerAssetPlacementInPublicRooms")
  ) {
    throw new Error("ECONOMY_STATE_INVALID");
  }
  const accountIds = new Set<string>();
  const ownedAssetIds = new Set<string>();
  for (const account of state.accounts) {
    if (
      !account
      || typeof account !== "object"
      || typeof account.userId !== "string"
      || !account.userId
      || accountIds.has(account.userId)
      || !Number.isSafeInteger(account.coinBalance)
      || account.coinBalance < 0
      || !Number.isSafeInteger(account.lifetimeEarned)
      || account.lifetimeEarned < 0
      || !Number.isSafeInteger(account.lifetimeSpent)
      || account.lifetimeSpent < 0
      || !Number.isSafeInteger(account.dailyReward?.streak)
      || account.dailyReward.streak < 0
      || !isValidDailyRewardProgress(account.dailyReward)
      || !Array.isArray(account.inventory)
      || account.inventory.length > MAX_OWNED_ASSETS
    ) {
      throw new Error("ECONOMY_STATE_INVALID");
    }
    accountIds.add(account.userId);
    for (const asset of account.inventory) {
      const definition = asset && typeof asset === "object" && typeof asset.assetId === "string"
        ? getAssetDefinition(asset.assetId)
        : undefined;
      if (
        !asset
        || typeof asset !== "object"
        || typeof asset.id !== "string"
        || !asset.id
        || !definition?.buildable
        || ownedAssetIds.has(asset.id)
        || !isValidTimestamp(asset.acquiredAt)
        || (asset.placement && (
          typeof asset.placement !== "object"
          || typeof asset.placement.objectId !== "string"
          || !asset.placement.objectId
          || typeof asset.placement.floorId !== "string"
          || !asset.placement.floorId
          || !isValidTimestamp(asset.placement.placedAt)
          || Date.parse(asset.placement.placedAt) < Date.parse(asset.acquiredAt)
        ))
      ) {
        throw new Error("ECONOMY_STATE_INVALID");
      }
      ownedAssetIds.add(asset.id);
    }
  }
  const transactionIds = new Set<string>();
  const operationKeysByUserId = new Map<string, Set<string>>();
  const transactionsByUserId = new Map<string, PersistedCoinTransaction[]>();
  const purchasedAssetIds = new Set<string>();
  for (const transaction of state.transactions) {
    const operationKeys = transaction && typeof transaction === "object" && typeof transaction.userId === "string"
      ? operationKeysByUserId.get(transaction.userId) ?? new Set<string>()
      : new Set<string>();
    if (
      !transaction
      || typeof transaction !== "object"
      || typeof transaction.id !== "string"
      || !transaction.id
      || transactionIds.has(transaction.id)
      || typeof transaction.userId !== "string"
      || !accountIds.has(transaction.userId)
      || typeof transaction.operationKey !== "string"
      || !transaction.operationKey
      || typeof transaction.operationFingerprint !== "string"
      || !transaction.operationFingerprint
      || operationKeys.has(transaction.operationKey)
      || !Number.isSafeInteger(transaction.amount)
      || !Number.isSafeInteger(transaction.balanceAfter)
      || transaction.balanceAfter < 0
      || !isValidTimestamp(transaction.createdAt)
      || !isValidTransaction(transaction)
      || (transaction.kind === "shop_purchase" && purchasedAssetIds.has(transaction.ownedAssetId!))
    ) {
      throw new Error("ECONOMY_STATE_INVALID");
    }
    transactionIds.add(transaction.id);
    operationKeys.add(transaction.operationKey);
    operationKeysByUserId.set(transaction.userId, operationKeys);
    const userTransactions = transactionsByUserId.get(transaction.userId) ?? [];
    userTransactions.push(transaction);
    transactionsByUserId.set(transaction.userId, userTransactions);
    if (transaction.kind === "shop_purchase") {
      purchasedAssetIds.add(transaction.ownedAssetId!);
    }
  }
  for (const account of state.accounts) {
    const accountTransactions = transactionsByUserId.get(account.userId) ?? [];
    let balance = 0;
    let lifetimeEarned = 0;
    let lifetimeSpent = 0;
    for (const transaction of accountTransactions) {
      balance += transaction.amount;
      if (transaction.amount >= 0) {
        lifetimeEarned += transaction.amount;
      } else {
        lifetimeSpent -= transaction.amount;
      }
      if (
        !Number.isSafeInteger(balance)
        || !Number.isSafeInteger(lifetimeEarned)
        || !Number.isSafeInteger(lifetimeSpent)
        || transaction.balanceAfter !== balance
      ) {
        throw new Error("ECONOMY_STATE_INVALID");
      }
    }
    const welcomeTransactions = accountTransactions.filter((transaction) => transaction.kind === "welcome");
    const dailyTransactions = accountTransactions.filter((transaction) => transaction.kind === "daily_bonus");
    const dailyReward = replayDailyRewardProgress(dailyTransactions);
    const purchasesByOwnedAssetId = new Map(accountTransactions
      .filter((transaction) => transaction.kind === "shop_purchase")
      .map((transaction) => [transaction.ownedAssetId!, transaction]));
    if (
      welcomeTransactions.length !== 1
      || accountTransactions[0]?.kind !== "welcome"
      || account.coinBalance !== balance
      || account.lifetimeEarned !== lifetimeEarned
      || account.lifetimeSpent !== lifetimeSpent
      || !dailyReward
      || account.dailyReward.streak !== dailyReward.streak
      || account.dailyReward.lastClaimedDay !== dailyReward.lastClaimedDay
      || hasInvalidGameRewardLedger(accountTransactions)
      || account.inventory.some((asset) => {
        const purchase = purchasesByOwnedAssetId.get(asset.id);
        return !purchase || purchase.assetId !== asset.assetId || purchase.createdAt !== asset.acquiredAt;
      })
      || purchasesByOwnedAssetId.size !== account.inventory.length
      || purchasesByOwnedAssetId.size !== accountTransactions.filter((transaction) => transaction.kind === "shop_purchase").length
    ) {
      throw new Error("ECONOMY_STATE_INVALID");
    }
  }
}

function isValidDailyRewardProgress(progress: DailyRewardProgress): boolean {
  if (!progress.lastClaimedDay) {
    return progress.streak === 0;
  }
  return progress.streak > 0 && isValidUtcDay(progress.lastClaimedDay);
}

function isValidTimestamp(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isoTimestamp(date: Date): string {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new Error("ECONOMY_TIME_INVALID");
  }
  return date.toISOString();
}

function isValidUtcDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isValidTransaction(transaction: PersistedCoinTransaction): boolean {
  if (transaction.kind === "welcome") {
    return transaction.operationKey === `welcome:${transaction.userId}`
      && transaction.operationFingerprint === "welcome"
      && transaction.amount === WELCOME_COIN_REWARD
      && transaction.assetId === undefined
      && transaction.ownedAssetId === undefined
      && transaction.sourceId === undefined;
  }
  if (transaction.kind === "daily_bonus") {
    return transaction.operationFingerprint === "daily_bonus"
      && DAILY_REWARD_AMOUNTS.some((amount) => amount === transaction.amount)
      && Boolean(transaction.sourceId && isValidUtcDay(transaction.sourceId))
      && transaction.createdAt.startsWith(transaction.sourceId!)
      && transaction.assetId === undefined
      && transaction.ownedAssetId === undefined;
  }
  if (transaction.kind === "game_reward") {
    const reward = parseGameRewardFingerprint(transaction.operationFingerprint);
    if (!reward) {
      return false;
    }
    return transaction.amount >= 0
      && transaction.amount <= calculateGameCoinReward(reward.lines, reward.won)
      && Boolean(transaction.sourceId)
      && transaction.operationKey === `game:${transaction.sourceId}`
      && transaction.assetId === undefined
      && transaction.ownedAssetId === undefined;
  }
  if (transaction.kind === "shop_purchase") {
    const definition = transaction.assetId ? getAssetDefinition(transaction.assetId) : undefined;
    return Boolean(
      definition?.buildable
      && definition.shop
      && transaction.ownedAssetId
      && transaction.operationFingerprint === `shop_purchase:${transaction.assetId}`
      && transaction.amount === -definition.shop.price
      && transaction.sourceId === undefined,
    );
  }
  return false;
}

function replayDailyRewardProgress(transactions: PersistedCoinTransaction[]): DailyRewardProgress | null {
  let progress: DailyRewardProgress = { streak: 0 };
  for (const transaction of transactions) {
    const claimedDay = transaction.sourceId!;
    const status = getDailyRewardStatus(progress, new Date(`${claimedDay}T12:00:00.000Z`));
    if (!status.claimable || transaction.amount !== status.amount) {
      return null;
    }
    progress = {
      streak: status.streak + 1,
      lastClaimedDay: claimedDay,
    };
  }
  return progress;
}

function hasInvalidGameRewardLedger(transactions: PersistedCoinTransaction[]): boolean {
  const rewardsByDay = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.kind !== "game_reward") {
      continue;
    }
    const reward = parseGameRewardFingerprint(transaction.operationFingerprint);
    if (!reward) {
      return true;
    }
    const day = transaction.createdAt.slice(0, 10);
    const earned = rewardsByDay.get(day) ?? 0;
    const expected = Math.min(
      calculateGameCoinReward(reward.lines, reward.won),
      Math.max(0, GAME_REWARD_DAILY_CAP - earned),
    );
    if (transaction.amount !== expected) {
      return true;
    }
    rewardsByDay.set(day, earned + transaction.amount);
  }
  return false;
}

function parseGameRewardFingerprint(fingerprint: string): { lines: number; won: boolean } | undefined {
  const match = /^game_reward:(-?\d+):(true|false)$/.exec(fingerprint);
  if (!match) {
    return undefined;
  }
  const lines = Number(match[1]);
  if (!Number.isSafeInteger(lines) || lines < 0) {
    return undefined;
  }
  return { lines, won: match[2] === "true" };
}
