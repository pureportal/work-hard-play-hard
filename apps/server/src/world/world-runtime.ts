import { randomUUID } from "node:crypto";
import {
  ASSET_RASTER_SIZE,
  BUILD_GRID_SIZE,
  GONG_COOLDOWN_MS,
  GONG_INTERACTION_RANGE,
  MAX_LAYOUT_OBJECTS_PER_FLOOR,
  detectLayoutRooms,
  getAssetPlacementError,
  getAssetsSupportedBy,
  getCorrespondingFloorPortals,
  getFloorPortals,
  getOutdoorBounds,
  getOpeningCenter,
  getOpeningRect,
  getPerpendicularIntersectionOffset,
  getPlacedAssetCellRects,
  getPlacedAssetBounds,
  getPlacedAssetInteraction,
  getPlayerAssetRoomError,
  getRoomDoorPosition,
  getUtcDayKey,
  getWallOpeningPlacement,
  getWallLength,
  getWallOrientation,
  getWallPlacementError,
  getWallRect,
  getWallSolidRects,
  isPointInPlacedAsset,
  isPointInRoom,
  mergeWallSegments,
  normalizeWall,
  pointInRect,
  requireAssetDefinition,
  requireAssetVariant,
  snapToAssetRaster,
  snapToBuildGrid,
  type AssetRotation,
  type Door,
  type Floor,
  type Room,
  type RoomKnock,
  type RoomSettings,
  type CallState,
  type ChatMessage,
  type ClientCommand,
  type CoinTransaction,
  type Conversation,
  type CorporateIdentity,
  type FloorLayout,
  type GlobalKidnappingSettings,
  type KidnappingEndReason,
  type LayoutEdit,
  type LayoutItemReference,
  type Member,
  type Meeting,
  type PlayerKidnappingSettings,
  type Rect,
  type ReactionKind,
  type ServerEvent,
  type TetrisCommand,
  type WorldObject,
  type WorldPlayer,
  type WorldSnapshot,
  type Wall,
  type WallOpening,
} from "@workhard/shared";
import {
  TetrisMultiplayerRuntime,
  type GameEventDelivery,
} from "../games/tetris-multiplayer.js";
import { DemoStore } from "../store.js";
import { canOccupy } from "./collision.js";
import {
  findFloorRoute,
  type FloorRouteLeg,
  type FloorRouteTransition,
} from "./floor-navigation.js";
import { findPath } from "./pathfinding.js";
import { reconcileProximityGroups } from "./proximity-groups.js";

const TICK_MS = 50;
const SNAPSHOT_INTERVAL_TICKS = 2;
const SNAPSHOT_HEARTBEAT_TICKS = 100;
const SNAPSHOT_COMMAND_TYPES = new Set<ClientCommand["type"]>([
  "movement.input",
  "movement.set_destination",
  "movement.approach_user",
  "kidnapping.start",
  "kidnapping.stop",
  "kidnapping.global_settings_update",
  "kidnapping.player_settings_update",
  "presence.set_availability",
  "proximity.set_media",
  "layout.apply",
  "player_asset.place",
  "player_asset.move",
  "player_asset.remove",
  "asset.interact",
  "seat.leave",
  "room.update_settings",
  "interaction.wave",
  "call.respond",
  "call.end",
  "meeting.join",
  "meeting.leave",
]);
const SPATIAL_COMMAND_TYPES = new Set<ClientCommand["type"]>([
  "movement.input",
  "movement.set_destination",
  "movement.approach_user",
  "kidnapping.start",
  "kidnapping.stop",
  "layout.apply",
  "player_asset.place",
  "player_asset.move",
  "player_asset.remove",
  "asset.interact",
  "seat.leave",
  "room.update_settings",
]);
const SPEED_PER_SECOND = 260;
const CALL_RANGE = 480;
const WALK_UP_CALL_RANGE = 110;
const CALL_TIMEOUT_MS = 20_000;
const KNOCK_RANGE = 84;
const KNOCK_TIMEOUT_MS = 20_000;
const REACTION_COOLDOWN_MS = 450;
const HIGH_FIVE_RANGE = 96;
const HIGH_FIVE_WINDOW_MS = 4_000;
const ASSET_INTERACTION_RANGE = 72;
const KIDNAPPING_PICKUP_DISTANCE = 0.01;
const EMPTY_ROOM_GRANTS: ReadonlySet<string> = new Set();

interface Peer {
  id: string;
  userId: string;
  floorId: string;
  send: (event: ServerEvent) => void;
}

interface MovementState {
  dx: number;
  dy: number;
  path: { x: number; y: number }[];
  controllerPeerId?: string;
  destinationRequestId?: string;
  approachUserId?: string;
  approachRequestId?: string;
  kidnappingTargetUserId?: string;
  kidnappingRequestId?: string;
  assetInteraction?: { objectId: string; interactionId: string; requestId: string };
  journey?: {
    legs: FloorRouteLeg[];
    legIndex: number;
  };
}

interface ActiveCall {
  id: string;
  callerUserId: string;
  targetUserId: string;
  state: "ringing" | "accepted";
  timer?: NodeJS.Timeout;
}

interface ActiveRoomKnock {
  knock: RoomKnock;
  recipientUserIds: Set<string>;
  timer: NodeJS.Timeout;
}

interface RecentWave {
  at: number;
  targetUserId?: string;
}

export class WorldRuntime {
  private readonly players = new Map<string, WorldPlayer>();
  private readonly connectedPlayersByFloor = new Map<string, Set<WorldPlayer>>();
  private readonly peers = new Map<string, Peer>();
  private readonly peersByFloor = new Map<string, Set<Peer>>();
  private readonly movements = new Map<string, MovementState>();
  private readonly kidnappingByCarrier = new Map<string, string>();
  private readonly kidnappingByCarried = new Map<string, string>();
  private readonly activeMovementUserIds = new Set<string>();
  private readonly movementSequences = new Map<string, number>();
  private readonly proximityMedia = new Map<string, { microphone: boolean; camera: boolean }>();
  private readonly gameRuntime: TetrisMultiplayerRuntime;
  private readonly calls = new Map<string, ActiveCall>();
  private readonly roomKnocks = new Map<string, ActiveRoomKnock>();
  private readonly roomGrants = new Map<string, Set<string>>();
  private readonly activeMeetings = new Map<string, string>();
  private readonly lastReactionAt = new Map<string, number>();
  private readonly recentWaves = new Map<string, RecentWave>();
  private readonly gongCooldowns = new Map<string, number>();
  private readonly seatOrigins = new Map<string, { x: number; y: number }>();
  private timer: NodeJS.Timeout | undefined;
  private tickNumber = 0;
  private readonly lastSnapshotTickByFloor = new Map<string, number>();
  private readonly dirtySnapshotFloorIds = new Set<string>();
  private reconciliationDirty = false;
  private economyDayKey = getUtcDayKey(new Date());
  dirty = false;

  constructor(private readonly store: DemoStore) {
    this.gameRuntime = new TetrisMultiplayerRuntime(store);
    for (const member of store.getMembers()) {
      if (!member.online || !member.floorId || !member.position) {
        continue;
      }
      const player: WorldPlayer = {
        userId: member.id,
        floorId: member.floorId,
        x: member.position.x,
        y: member.position.y,
        facing: "down",
        availability: member.availability,
        connected: member.online,
      };
      this.setPlayer(player);
      this.updateRoom(player);
    }
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const call of this.calls.values()) {
      if (call.timer) {
        clearTimeout(call.timer);
      }
    }
    this.calls.clear();
    for (const activeKnock of this.roomKnocks.values()) {
      clearTimeout(activeKnock.timer);
    }
    this.roomKnocks.clear();
    this.roomGrants.clear();
    this.kidnappingByCarrier.clear();
    this.kidnappingByCarried.clear();
    this.movementSequences.clear();
    this.proximityMedia.clear();
    for (const player of this.players.values()) {
      delete player.proximity;
      delete player.carriedByUserId;
    }
    this.activeMeetings.clear();
    this.lastReactionAt.clear();
    this.recentWaves.clear();
    this.gongCooldowns.clear();
    this.seatOrigins.clear();
  }

  publishCorporateIdentity(corporateIdentity: CorporateIdentity): void {
    this.broadcast({ type: "corporate_identity.updated", corporateIdentity });
  }

  connect(userId: string, floorId: string, send: Peer["send"]): string {
    const member = this.store.getMember(userId);
    const existing = this.players.get(userId);
    const canonicalFloorId = existing?.floorId ?? member?.floorId ?? floorId;
    const floor = this.store.getFloor(canonicalFloorId);
    if (!member || !floor) {
      throw new Error("SESSION_INVALID");
    }

    const peer: Peer = { id: randomUUID(), userId, floorId: floor.id, send };
    this.addPeer(peer);
    this.dirtySnapshotFloorIds.add(peer.floorId);
    let player = existing;
    if (player) {
      this.movePlayerToFloor(player, floor.id);
      this.setPlayerConnected(player, true);
      player.availability = member.availability;
      const layout = this.store.getLayout(floor.id);
      const seat = player.seat;
      const seatedObject = layout?.objects.find((object) => object.id === seat?.objectId);
      const seatedInteraction = seatedObject && seat
        ? getPlacedAssetInteraction(seatedObject, seat.interactionId)
        : undefined;
      const positionIsSafe = Boolean(
        seatedInteraction
        && seatedInteraction.center.x === player.x
        && seatedInteraction.center.y === player.y,
      ) || Boolean(layout && canOccupy(
          layout,
          getOutdoorBounds(floor),
          userId,
          floor.spawn.x,
          floor.spawn.y,
          player.x,
          player.y,
          13,
          this.getRoomAccessIds(userId, layout),
          this.getFullRoomIds(player),
        ));
      if (!positionIsSafe) {
        player.x = floor.spawn.x;
        player.y = floor.spawn.y;
        delete player.roomId;
        delete player.seat;
        this.seatOrigins.delete(userId);
      }
    } else {
      player = {
        userId,
        floorId: floor.id,
        x: floor.spawn.x,
        y: floor.spawn.y,
        facing: "down",
        availability: member.availability,
        connected: true,
      };
      this.setPlayer(player);
    }
    this.updateRoom(player);
    this.movementSequences.set(peer.id, -1);
    const locationChanged = member.floorId !== floor.id;
    let connectedMember = member;
    if (locationChanged) {
      connectedMember = this.store.updateMemberLocation(userId, floor.id);
    }
    if (!member.online) {
      this.broadcast({ type: "presence.changed", member: this.store.updateOnline(userId, true) });
    } else if (locationChanged) {
      this.broadcast({ type: "presence.changed", member: connectedMember });
    }
    this.movements.set(userId, { dx: 0, dy: 0, path: [] });
    this.activeMovementUserIds.delete(userId);
    send({ type: "session.ready", userId, floorId: floor.id });
    this.sendSnapshot(peer);
    const activeMeetingId = this.activeMeetings.get(userId);
    send({ type: "workspace.snapshot", data: this.store.getBootstrap(userId) });
    this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
    this.sendActiveSessionState(peer, activeMeetingId);
    send({ type: "session.synced" });
    return peer.id;
  }

  disconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    this.removePeer(peer);
    this.dirtySnapshotFloorIds.add(peer.floorId);
    this.movementSequences.delete(peerId);
    const stillConnected = [...this.peers.values()].some((item) => item.userId === peer.userId);
    if (!stillConnected) {
      this.endKidnappingForUser(peer.userId, "interrupted");
      this.movements.delete(peer.userId);
      this.activeMovementUserIds.delete(peer.userId);
      const player = this.players.get(peer.userId);
      if (player) {
        this.leaveSeat(peer.userId);
        this.setPlayerConnected(player, false);
        delete player.wavingUntil;
        delete player.proximity;
      }
      this.proximityMedia.delete(peer.userId);
      this.broadcast({ type: "presence.changed", member: this.store.updateOnline(peer.userId, false) });
      this.endCallsForUser(peer.userId);
      this.leaveActiveMeeting(peer.userId);
      this.handleKnockDisconnect(peer.userId);
      this.dispatchGameEvents(this.gameRuntime.leave(peer.userId));
      this.roomGrants.delete(peer.userId);
      this.lastReactionAt.delete(peer.userId);
      this.clearRecentWavesForUser(peer.userId);
      this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
      this.reconcileProximityCalls();
    } else {
      const movement = this.movements.get(peer.userId);
      if (movement?.controllerPeerId === peerId) {
        this.stopMovement(peer.userId);
      }
    }
  }

  handleCommand(peerId: string, command: ClientCommand): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    try {
      switch (command.type) {
        case "movement.input":
          this.handleMovement(peer, command.sequence, command.dx, command.dy);
          break;
        case "movement.set_destination":
          this.handleDestination(peer, command.requestId, command.floorId, command.x, command.y);
          break;
        case "movement.stop":
          this.stopMovement(peer.userId);
          break;
        case "movement.approach_user":
          this.handleApproach(peer, command.targetUserId, command.requestId);
          break;
        case "kidnapping.start":
          this.handleKidnappingStart(peer, command.targetUserId, command.requestId);
          break;
        case "kidnapping.stop":
          this.endKidnappingForUser(peer.userId, "cancelled");
          break;
        case "kidnapping.global_settings_update":
          this.updateGlobalKidnappingSettings(peer, command.settings);
          break;
        case "kidnapping.player_settings_update":
          this.updatePlayerKidnappingSettings(peer, command.settings);
          break;
        case "presence.set_availability":
          this.setAvailability(peer, command.availability);
          break;
        case "proximity.set_media":
          this.setProximityMedia(peer, command.microphone, command.camera);
          break;
        case "chat.send":
          this.sendChat(peer, command.requestId, command.conversationId, command.body);
          break;
        case "layout.apply":
          this.applyLayout(peer, command.requestId, command.baseRevision, command.edit);
          break;
        case "player_asset.place":
          this.placePlayerAsset(peer, command.requestId, command.baseRevision, command.ownedAssetId, command.position, command.variantId, command.rotation);
          break;
        case "player_asset.move":
          this.movePlayerAsset(peer, command.requestId, command.baseRevision, command.objectId, command.position, command.variantId, command.rotation);
          break;
        case "player_asset.remove":
          this.removePlayerAsset(peer, command.requestId, command.baseRevision, command.objectId);
          break;
        case "economy.claim_daily":
          this.claimDailyReward(peer, command.requestId);
          break;
        case "economy.purchase_asset":
          this.purchaseAsset(peer, command.requestId, command.assetId);
          break;
        case "game.settings_update":
          this.updateGameSettings(peer, command.settings);
          break;
        case "asset.interact":
          this.interactWithAsset(peer, command.requestId, command.objectId, command.interactionId);
          break;
        case "seat.leave":
          this.leaveSeat(peer.userId);
          break;
        case "room.update_settings":
          this.updateRoomSettings(peer, command.requestId, command.baseRevision, command.roomId, command.settings);
          break;
        case "room.knock":
          this.requestRoomKnock(peer, command.roomId);
          break;
        case "room.knock_respond":
          this.respondToRoomKnock(peer, command.knockId, command.accept);
          break;
        case "interaction.wave":
          this.wave(peer, command.targetUserId);
          break;
        case "interaction.react":
          this.react(peer, command.reaction);
          break;
        case "interaction.ring_gong":
          this.ringGong(peer, command.objectId);
          break;
        case "call.request":
          this.requestCall(peer, command.targetUserId);
          break;
        case "call.respond":
          this.respondToCall(peer, command.callId, command.accept);
          break;
        case "call.end":
          this.endCall(peer, command.callId);
          break;
        case "meeting.join":
          this.joinMeeting(peer, command.meetingId);
          break;
        case "meeting.leave":
          this.leaveMeeting(peer, command.meetingId);
          break;
        case "game.start":
          this.startGame(peer, command.definitionId);
          break;
        case "game.end":
          this.endGame(peer);
          break;
        case "game.command":
          this.commandGame(peer, command.command);
          break;
      }
      if (SNAPSHOT_COMMAND_TYPES.has(command.type)) {
        this.dirtySnapshotFloorIds.add(peer.floorId);
      }
      if (SPATIAL_COMMAND_TYPES.has(command.type)) {
        this.reconciliationDirty = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "COMMAND_FAILED";
      peer.send({
        type: "command.error",
        ...("requestId" in command ? { requestId: command.requestId } : {}),
        code: message,
        message: this.userMessage(message),
      });
    }
  }

  serializePlayers(): WorldPlayer[] {
    return Array.from(this.players.values(), (source) => {
      const player = cloneWorldPlayer(source);
      delete player.proximity;
      delete player.carriedByUserId;
      const origin = this.seatOrigins.get(player.userId);
      if (origin) {
        player.x = origin.x;
        player.y = origin.y;
      }
      delete player.seat;
      return player;
    });
  }

  publishChatMessage(message: ChatMessage): void {
    for (const peer of this.peers.values()) {
      if (this.store.canAccessConversation(peer.userId, message.conversationId)) {
        peer.send({ type: "chat.message_created", message });
      }
    }
  }

  publishConversation(conversation: Conversation): void {
    for (const peer of this.peers.values()) {
      if (this.store.canAccessConversation(peer.userId, conversation.id)) {
        peer.send({ type: "conversation.created", conversation });
      }
    }
  }

  publishWorkspaceAccess(): void {
    this.broadcastWorkspaceAccess();
  }

  publishMember(member: Member): void {
    this.broadcast({ type: "presence.changed", member });
  }

  publishMemberAccess(member: Member): void {
    const player = this.players.get(member.id);
    if (player) {
      this.dirtySnapshotFloorIds.add(player.floorId);
    }
    this.reconciliationDirty = true;
    this.reconcilePlayerRoomAccess(member.id);
    this.validateRoomKnocks();
    this.broadcast({ type: "presence.changed", member });
    this.broadcastWorkspaceAccess();
    for (const layout of this.store.getLayouts()) {
      this.broadcastLayout(layout);
    }
  }

  restorePlayers(players: WorldPlayer[]): void {
    this.roomGrants.clear();
    this.proximityMedia.clear();
    for (const player of this.players.values()) {
      delete player.proximity;
    }
    for (const saved of players) {
      const member = this.store.getMember(saved.userId);
      const floor = this.store.getFloor(saved.floorId);
      if (!member || !floor) {
        continue;
      }
      const layout = this.store.getLayout(saved.floorId);
      const positionIsSafe = layout && canOccupy(
        layout,
        getOutdoorBounds(floor),
        saved.userId,
        floor.spawn.x,
        floor.spawn.y,
        saved.x,
        saved.y,
        13,
        this.getRoomAccessIds(saved.userId, layout),
      );
      const player: WorldPlayer = {
        ...saved,
        x: positionIsSafe ? saved.x : floor.spawn.x,
        y: positionIsSafe ? saved.y : floor.spawn.y,
        connected: member.online,
      };
      delete player.proximity;
      delete player.seat;
      delete player.carriedByUserId;
      this.setPlayer(player);
      this.dirtySnapshotFloorIds.add(player.floorId);
      this.updateRoom(player);
    }
    this.dirty = false;
    this.reconciliationDirty = true;
  }

  markClean(): void {
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }

  runTickForTest(deltaMs = TICK_MS): void {
    this.tick(deltaMs);
  }

  private tick(deltaMs = TICK_MS): void {
    this.tickNumber += 1;
    const changedFloorIds = new Set<string>();
    for (const userId of this.activeMovementUserIds) {
      const movement = this.movements.get(userId);
      const player = this.players.get(userId);
      if (!movement || !player?.connected) {
        this.activeMovementUserIds.delete(userId);
        continue;
      }
      if (player.carriedByUserId) {
        this.activeMovementUserIds.delete(userId);
        continue;
      }
      if (this.gameRuntime.isPlaying(userId)) {
        continue;
      }
      this.validateActiveKidnapping(userId);
      const previousFloorId = player.floorId;
      if (this.advancePlayer(player, movement, deltaMs / 1_000)) {
        changedFloorIds.add(previousFloorId);
        changedFloorIds.add(player.floorId);
      }
      this.tryCompleteKidnappingPickup(player, movement);
      this.tryCompleteAssetInteraction(player, movement);
      this.tryStartWalkUpCall(player, movement);
      this.synchronizeMovementActivity(userId, movement);
    }
    if (changedFloorIds.size > 0 || this.reconciliationDirty) {
      for (const floorId of changedFloorIds) {
        this.dirtySnapshotFloorIds.add(floorId);
      }
      this.reconciliationDirty = false;
      this.validateRoomKnocks();
      this.validateCalls();
      this.reconcileProximityCalls();
      this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
    }
    const gameEvents = this.gameRuntime.update(deltaMs);
    this.dispatchGameEvents(gameEvents);
    if (gameEvents.length > 0) {
      this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
    }

    if (this.tickNumber % SNAPSHOT_HEARTBEAT_TICKS === 0) {
      const economyDayKey = getUtcDayKey(new Date());
      if (economyDayKey !== this.economyDayKey) {
        this.economyDayKey = economyDayKey;
        for (const userId of this.connectedUserIds()) {
          this.publishEconomy(userId);
        }
      }
    }

    const snapshotDue = this.tickNumber % SNAPSHOT_INTERVAL_TICKS === 0;
    if (snapshotDue && this.peers.size > 0) {
      const floorIds = this.getSnapshotFloorIdsDue();
      if (floorIds.size > 0) {
        this.broadcastSnapshots(floorIds);
        for (const floorId of floorIds) {
          this.dirtySnapshotFloorIds.delete(floorId);
          this.lastSnapshotTickByFloor.set(floorId, this.tickNumber);
        }
      }
    }
  }

  private advancePlayer(player: WorldPlayer, movement: MovementState, deltaSeconds: number): boolean {
    const carriedPlayer = this.getCarriedPlayer(player.userId);
    let dx = movement.dx;
    let dy = movement.dy;
    let pathTarget: { x: number; y: number } | undefined;
    let distance = SPEED_PER_SECOND * deltaSeconds;
    if (dx !== 0 || dy !== 0) {
      movement.path = [];
      delete movement.destinationRequestId;
      delete movement.journey;
      delete movement.approachUserId;
      delete movement.approachRequestId;
      delete movement.kidnappingTargetUserId;
      delete movement.kidnappingRequestId;
      delete movement.assetInteraction;
      const magnitude = Math.hypot(dx, dy);
      dx /= magnitude;
      dy /= magnitude;
    } else if (movement.path.length > 0) {
      pathTarget = movement.path[0];
      if (!pathTarget) {
        return false;
      }
      const distanceX = pathTarget.x - player.x;
      const distanceY = pathTarget.y - player.y;
      const distanceToTarget = Math.hypot(distanceX, distanceY);
      if (distanceToTarget < 0.01) {
        movement.path.shift();
        if (movement.path.length === 0) {
          this.advanceJourney(player, movement);
        }
        return false;
      }
      distance = Math.min(distance, distanceToTarget);
      dx = distanceX / distanceToTarget;
      dy = distanceY / distanceToTarget;
    } else if (movement.journey) {
      this.advanceJourney(player, movement);
      return false;
    } else {
      return false;
    }

    const layout = this.store.getLayout(player.floorId);
    const floor = this.store.getFloor(player.floorId);
    if (!layout || !floor) {
      return false;
    }
    const nextX = player.x + dx * distance;
    const nextY = player.y + dy * distance;
    const roomAccessIds = this.getRoomAccessIds(player.userId, layout);
    const fullRoomIds = this.getFullRoomIds(player);
    const previousX = player.x;
    const previousY = player.y;
    const navigationBounds = getOutdoorBounds(floor);
    const canMoveX = carriedPlayer
      ? this.canMoveTogether([player, carriedPlayer], nextX, player.y)
      : canOccupy(layout, navigationBounds, player.userId, player.x, player.y, nextX, player.y, 13, roomAccessIds, fullRoomIds);
    if (canMoveX) {
      player.x = nextX;
      if (carriedPlayer) {
        carriedPlayer.x = nextX;
      }
    }
    const canMoveY = carriedPlayer
      ? this.canMoveTogether([player, carriedPlayer], player.x, nextY)
      : canOccupy(layout, navigationBounds, player.userId, player.x, player.y, player.x, nextY, 13, roomAccessIds, fullRoomIds);
    if (canMoveY) {
      player.y = nextY;
      if (carriedPlayer) {
        carriedPlayer.y = nextY;
      }
    }
    const moved = player.x !== previousX || player.y !== previousY;
    if (pathTarget && Math.hypot(player.x - pathTarget.x, player.y - pathTarget.y) < 0.01) {
      movement.path.shift();
      if (movement.path.length === 0) {
        this.advanceJourney(player, movement);
      }
    } else if (pathTarget && !moved) {
      this.cancelDestination(player.userId, movement);
    }
    if (carriedPlayer && !moved) {
      this.endActiveKidnapping(player.userId, "access_revoked");
      movement.dx = 0;
      movement.dy = 0;
      movement.path = [];
      delete movement.destinationRequestId;
      delete movement.journey;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      player.facing = dx > 0 ? "right" : "left";
    } else {
      player.facing = dy > 0 ? "down" : "up";
    }
    if (moved) {
      this.updateRoom(player);
      if (carriedPlayer) {
        carriedPlayer.facing = player.facing;
        this.updateRoom(carriedPlayer);
      }
      this.dirty = true;
    }
    return moved;
  }

  private getFullRoomIds(player: WorldPlayer): ReadonlySet<string> {
    return this.getFullRoomIdsForFloor(player.userId, player.floorId);
  }

  private getFullRoomIdsForFloor(userId: string, floorId: string): ReadonlySet<string> {
    const layout = this.store.getLayout(floorId);
    if (!layout) {
      return EMPTY_ROOM_GRANTS;
    }
    const occupancy = new Map<string, number>();
    for (const candidate of this.players.values()) {
      if (!candidate.connected || candidate.userId === userId || candidate.floorId !== floorId || !candidate.roomId) {
        continue;
      }
      occupancy.set(candidate.roomId, (occupancy.get(candidate.roomId) ?? 0) + 1);
    }
    return new Set(layout.rooms.filter((room) => (occupancy.get(room.id) ?? 0) >= room.capacity).map((room) => room.id));
  }

  private getRoomAccessIds(userId: string, layout: FloorLayout): ReadonlySet<string> {
    const accessibleRoomIds = layout.rooms
      .filter((room) => this.userHasRoomAccess(userId, room))
      .map((room) => room.id);
    return accessibleRoomIds.length === 0 ? EMPTY_ROOM_GRANTS : new Set(accessibleRoomIds);
  }

  private userHasRoomAccess(userId: string, room: Room): boolean {
    return room.access.mode === "open"
      || room.access.assignedPersonIds.includes(userId)
      || Boolean(this.roomGrants.get(userId)?.has(room.id));
  }

  private getCarriedPlayer(carrierUserId: string): WorldPlayer | undefined {
    const carriedUserId = this.kidnappingByCarrier.get(carrierUserId);
    const player = carriedUserId ? this.players.get(carriedUserId) : undefined;
    return player?.carriedByUserId === carrierUserId ? player : undefined;
  }

  private getUnavailableRoomIdsForGroup(userIds: readonly string[], floorId: string): ReadonlySet<string> {
    const layout = this.store.getLayout(floorId);
    if (!layout) {
      return EMPTY_ROOM_GRANTS;
    }
    const groupUserIds = new Set(userIds);
    const occupancy = new Map<string, number>();
    for (const player of this.players.values()) {
      if (!player.connected || groupUserIds.has(player.userId) || player.floorId !== floorId || !player.roomId) {
        continue;
      }
      occupancy.set(player.roomId, (occupancy.get(player.roomId) ?? 0) + 1);
    }
    return new Set(layout.rooms
      .filter((room) => (
        userIds.some((userId) => !this.userHasRoomAccess(userId, room))
        || (occupancy.get(room.id) ?? 0) + userIds.length > room.capacity
      ))
      .map((room) => room.id));
  }

  private canMoveTogether(players: readonly WorldPlayer[], nextX: number, nextY: number): boolean {
    const first = players[0];
    if (!first || players.some((player) => !player.connected || player.floorId !== first.floorId)) {
      return false;
    }
    const layout = this.store.getLayout(first.floorId);
    const floor = this.store.getFloor(first.floorId);
    if (!layout || !floor) {
      return false;
    }
    const userIds = players.map((player) => player.userId);
    const unavailableRoomIds = this.getUnavailableRoomIdsForGroup(userIds, first.floorId);
    const bounds = getOutdoorBounds(floor);
    return players.every((player) => canOccupy(
      layout,
      bounds,
      player.userId,
      player.x,
      player.y,
      nextX,
      nextY,
      13,
      this.getRoomAccessIds(player.userId, layout),
      unavailableRoomIds,
    ));
  }

  private canGroupEnterPosition(userIds: readonly string[], floorId: string, position: { x: number; y: number }): boolean {
    const layout = this.store.getLayout(floorId);
    const floor = this.store.getFloor(floorId);
    if (!layout || !floor) {
      return false;
    }
    const containingRooms = layout.rooms.filter((room) => isPointInRoom(position.x, position.y, room));
    if (containingRooms.some((room) => userIds.some((userId) => !this.userHasRoomAccess(userId, room)))) {
      return false;
    }
    const unavailableRoomIds = this.getUnavailableRoomIdsForGroup(userIds, floorId);
    if (containingRooms.some((room) => unavailableRoomIds.has(room.id))) {
      return false;
    }
    return canOccupy(
      layout,
      getOutdoorBounds(floor),
      userIds[0] ?? "",
      floor.spawn.x,
      floor.spawn.y,
      position.x,
      position.y,
      13,
      this.getRoomAccessIds(userIds[0] ?? "", layout),
      unavailableRoomIds,
    );
  }

  private findGroupCompletePath(
    userIds: readonly string[],
    floorId: string,
    start: { x: number; y: number },
    destination: { x: number; y: number },
    startIsOccupiedByGroup: boolean,
  ): { x: number; y: number }[] | undefined {
    const layout = this.store.getLayout(floorId);
    const floor = this.store.getFloor(floorId);
    const firstUserId = userIds[0];
    if (!layout || !floor || !firstUserId || (!startIsOccupiedByGroup && !this.canGroupEnterPosition(userIds, floorId, start))) {
      return undefined;
    }
    const bounds = getOutdoorBounds(floor);
    if (
      destination.x < bounds.x
      || destination.y < bounds.y
      || destination.x > bounds.x + bounds.width
      || destination.y > bounds.y + bounds.height
      || !this.canGroupEnterPosition(userIds, floorId, destination)
    ) {
      return undefined;
    }
    const path = findPath(
      layout,
      bounds,
      firstUserId,
      start,
      destination,
      this.getRoomAccessIds(firstUserId, layout),
      this.getUnavailableRoomIdsForGroup(userIds, floorId),
    );
    const endpoint = path.at(-1) ?? start;
    return Math.hypot(endpoint.x - destination.x, endpoint.y - destination.y) < 0.01 ? path : undefined;
  }

  private findCompletePath(
    userId: string,
    floorId: string,
    start: { x: number; y: number },
    destination: { x: number; y: number },
  ): { x: number; y: number }[] | undefined {
    const layout = this.store.getLayout(floorId);
    const floor = this.store.getFloor(floorId);
    if (!layout || !floor) {
      return undefined;
    }
    const bounds = getOutdoorBounds(floor);
    if (
      destination.x < bounds.x
      || destination.y < bounds.y
      || destination.x > bounds.x + bounds.width
      || destination.y > bounds.y + bounds.height
    ) {
      return undefined;
    }
    const path = findPath(
      layout,
      bounds,
      userId,
      start,
      destination,
      this.getRoomAccessIds(userId, layout),
      this.getFullRoomIdsForFloor(userId, floorId),
    );
    const endpoint = path.at(-1) ?? start;
    return Math.hypot(endpoint.x - destination.x, endpoint.y - destination.y) < 0.01
      ? path
      : undefined;
  }

  private findReachablePath(
    userId: string,
    floorId: string,
    start: { x: number; y: number },
    destination: { x: number; y: number },
  ): { x: number; y: number }[] | undefined {
    const layout = this.store.getLayout(floorId);
    const floor = this.store.getFloor(floorId);
    if (!layout || !floor) {
      return undefined;
    }
    const bounds = getOutdoorBounds(floor);
    if (
      destination.x < bounds.x
      || destination.y < bounds.y
      || destination.x > bounds.x + bounds.width
      || destination.y > bounds.y + bounds.height
    ) {
      return undefined;
    }
    const path = findPath(
      layout,
      bounds,
      userId,
      start,
      destination,
      this.getRoomAccessIds(userId, layout),
      this.getFullRoomIdsForFloor(userId, floorId),
    );
    return path;
  }

  private advanceJourney(player: WorldPlayer, movement: MovementState): void {
    const journey = movement.journey;
    if (!journey) {
      delete movement.destinationRequestId;
      return;
    }
    const leg = journey.legs[journey.legIndex];
    if (!leg || leg.floorId !== player.floorId) {
      this.cancelDestination(player.userId, movement);
      return;
    }
    if (!leg.transition) {
      delete movement.destinationRequestId;
      delete movement.journey;
      return;
    }
    const arrival = this.resolveFloorTransition(player, leg.transition);
    if (!arrival) {
      this.cancelDestination(player.userId, movement);
      return;
    }
    const carriedPlayer = this.getCarriedPlayer(player.userId);
    if (carriedPlayer && !this.canGroupEnterPosition(
      [player.userId, carriedPlayer.userId],
      leg.transition.floorId,
      arrival,
    )) {
      this.endActiveKidnapping(player.userId, "access_revoked");
      this.cancelDestination(player.userId, movement);
      return;
    }
    this.transferPlayersThroughPortal(
      carriedPlayer ? [player, carriedPlayer] : [player],
      leg.transition.floorId,
      arrival,
    );
    journey.legIndex += 1;
    const nextLeg = journey.legs[journey.legIndex];
    if (!nextLeg || nextLeg.floorId !== player.floorId) {
      this.cancelDestination(player.userId, movement);
      return;
    }
    movement.path = [...nextLeg.path];
    if (movement.path.length === 0 && !nextLeg.transition) {
      delete movement.destinationRequestId;
      delete movement.journey;
    }
  }

  private resolveFloorTransition(
    player: WorldPlayer,
    transition: FloorRouteTransition,
  ): { x: number; y: number } | undefined {
    const portals = getFloorPortals(this.store.getFloors(), this.store.getLayouts());
    const sourcePortal = portals.find((portal) => (
      portal.floorId === player.floorId
      && portal.object.id === transition.sourcePortalId
      && portal.destinationFloorId === transition.floorId
    ));
    if (!sourcePortal || Math.hypot(player.x - sourcePortal.position.x, player.y - sourcePortal.position.y) >= 0.01) {
      return undefined;
    }
    const destinationPortal = getCorrespondingFloorPortals(portals, sourcePortal).find((portal) => (
      portal.object.id === transition.destinationPortalId
    ));
    return destinationPortal?.position;
  }

  private transferPlayersThroughPortal(
    players: readonly WorldPlayer[],
    floorId: string,
    arrival: { x: number; y: number },
  ): void {
    const previousFloorIds = new Set(players.map((player) => player.floorId));
    const members: Member[] = [];
    for (const player of players) {
      this.endCallsForUser(player.userId);
      this.leaveActiveMeeting(player.userId);
      this.handleKnockDisconnect(player.userId);
      this.roomGrants.delete(player.userId);
      this.clearRecentWavesForUser(player.userId);
      this.movePlayerToFloor(player, floorId);
      player.x = arrival.x;
      player.y = arrival.y;
      delete player.roomId;
      delete player.wavingUntil;
      this.updateRoom(player);
      members.push(this.store.updateMemberLocation(player.userId, floorId));
    }
    this.reconcileProximityCalls();
    for (const member of members) {
      this.broadcast({ type: "presence.changed", member });
    }
    const playerIds = new Set(players.map((player) => player.userId));
    for (const peer of this.peers.values()) {
      if (!playerIds.has(peer.userId)) {
        continue;
      }
      this.movePeerToFloor(peer, floorId);
      peer.send({ type: "session.ready", userId: peer.userId, floorId });
    }
    for (const peer of this.peers.values()) {
      if (!playerIds.has(peer.userId)) {
        continue;
      }
      this.sendSnapshot(peer);
    }
    for (const previousFloorId of previousFloorIds) {
      this.dirtySnapshotFloorIds.add(previousFloorId);
    }
    this.dirtySnapshotFloorIds.add(floorId);
    this.reconciliationDirty = true;
    this.dirty = true;
  }

  private cancelDestination(userId: string, movement: MovementState): void {
    if (movement.kidnappingTargetUserId) {
      this.cancelKidnappingApproach(userId, movement, "DESTINATION_BLOCKED");
      return;
    }
    if (movement.assetInteraction) {
      this.cancelAssetInteraction(userId, movement, "DESTINATION_BLOCKED");
      return;
    }
    if (movement.approachUserId) {
      this.cancelApproach(userId, movement, "DESTINATION_BLOCKED");
      return;
    }
    const requestId = movement.destinationRequestId;
    movement.path = [];
    delete movement.destinationRequestId;
    delete movement.journey;
    this.activeMovementUserIds.delete(userId);
    if (requestId) {
      this.sendToUser(userId, {
        type: "command.error",
        requestId,
        code: "DESTINATION_BLOCKED",
        message: this.userMessage("DESTINATION_BLOCKED"),
      });
    }
  }

  private updateRoom(player: WorldPlayer): void {
    const previousRoomId = player.roomId;
    const layout = this.store.getLayout(player.floorId);
    const room = layout?.rooms.find((item) => isPointInRoom(player.x, player.y, item));
    if (room) {
      player.roomId = room.id;
    } else {
      delete player.roomId;
    }
    if (previousRoomId && previousRoomId !== player.roomId) {
      this.removeKnockRecipient(player.userId, previousRoomId);
    }
  }

  private handleMovement(peer: Peer, sequence: number, dx: number, dy: number): void {
    const movement = this.movements.get(peer.userId);
    const previousSequence = this.movementSequences.get(peer.id);
    if (!movement || previousSequence === undefined || sequence <= previousSequence) {
      return;
    }
    this.movementSequences.set(peer.id, sequence);
    if (dx !== 0 || dy !== 0) {
      this.cancelPendingKidnappingForUser(peer.userId, "cancelled");
      this.endKidnappingIfCarried(peer.userId, "cancelled");
    }
    if (this.gameRuntime.isPlaying(peer.userId)) {
      return;
    }
    if ((dx !== 0 || dy !== 0) && this.players.get(peer.userId)?.seat) {
      this.leaveSeat(peer.userId);
    }
    movement.dx = dx;
    movement.dy = dy;
    movement.path = [];
    movement.controllerPeerId = peer.id;
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    delete movement.assetInteraction;
    this.synchronizeMovementActivity(peer.userId, movement);
  }

  private handleDestination(peer: Peer, requestId: string, floorId: string, x: number, y: number): void {
    this.cancelPendingKidnappingForUser(peer.userId, "cancelled");
    this.endKidnappingIfCarried(peer.userId, "cancelled");
    if (this.gameRuntime.isPlaying(peer.userId)) {
      throw new Error("GAME_IN_PROGRESS");
    }
    if (Math.abs(x) > 100_000 || Math.abs(y) > 100_000) {
      throw new Error("DESTINATION_INVALID");
    }
    const player = this.players.get(peer.userId);
    const movement = this.movements.get(peer.userId);
    if (!player || !movement) {
      throw new Error("WORLD_NOT_READY");
    }
    this.leaveSeat(peer.userId);
    movement.dx = 0;
    movement.dy = 0;
    movement.controllerPeerId = peer.id;
    movement.destinationRequestId = requestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    delete movement.assetInteraction;
    movement.path = [];
    this.activeMovementUserIds.delete(peer.userId);
    const carriedPlayer = this.getCarriedPlayer(peer.userId);
    const route = findFloorRoute({
      floors: this.store.getFloors(),
      layouts: this.store.getLayouts(),
      start: { floorId: player.floorId, x: player.x, y: player.y },
      destination: { floorId, x, y },
      findPath: (pathFloorId, start, destination, target) => {
        if (!carriedPlayer) {
          return target === "destination"
            ? this.findReachablePath(peer.userId, pathFloorId, start, destination)
            : this.findCompletePath(peer.userId, pathFloorId, start, destination);
        }
        const userIds = [peer.userId, carriedPlayer.userId];
        const startIsOccupiedByGroup = [player, carriedPlayer].every((candidate) => (
          candidate.floorId === pathFloorId
          && Math.hypot(candidate.x - start.x, candidate.y - start.y) < 0.01
        ));
        return this.findGroupCompletePath(userIds, pathFloorId, start, destination, startIsOccupiedByGroup);
      },
    });
    if (!route || route.length === 0) {
      delete movement.destinationRequestId;
      if (carriedPlayer) {
        this.endActiveKidnapping(peer.userId, "access_revoked");
      }
      throw new Error("DESTINATION_BLOCKED");
    }
    movement.journey = { legs: route, legIndex: 0 };
    movement.path = [...route[0]!.path];
    if (movement.path.length === 0 && !route[0]!.transition) {
      delete movement.destinationRequestId;
      delete movement.journey;
    }
    this.synchronizeMovementActivity(peer.userId, movement);
  }

  private handleApproach(peer: Peer, targetUserId: string, requestId: string): void {
    this.cancelPendingKidnappingForUser(peer.userId, "cancelled");
    this.endKidnappingIfCarried(peer.userId, "cancelled");
    if (this.gameRuntime.isPlaying(peer.userId)) {
      throw new Error("GAME_IN_PROGRESS");
    }
    const player = this.players.get(peer.userId);
    const target = this.players.get(targetUserId);
    const movement = this.movements.get(peer.userId);
    const layout = player ? this.store.getLayout(player.floorId) : undefined;
    if (!player || !target || !movement || !layout || !target.connected) {
      throw new Error("PERSON_OFFLINE");
    }
    if (targetUserId === peer.userId || player.floorId !== target.floorId) {
      throw new Error("CALL_INVALID");
    }
    if (this.activeMeetings.has(peer.userId)) {
      throw new Error("CALLER_IN_MEETING");
    }
    if (this.activeMeetings.has(targetUserId)) {
      throw new Error("PERSON_IN_MEETING");
    }
    if (!this.isOnPublicFloor(player) || !this.isOnPublicFloor(target)) {
      throw new Error("CALL_NOT_PUBLIC");
    }
    if (this.store.getMember(targetUserId)?.availability === "dnd") {
      throw new Error("PERSON_UNAVAILABLE");
    }
    if (this.userHasActiveCall(peer.userId) || this.userHasActiveCall(targetUserId)) {
      throw new Error("CALL_BUSY");
    }
    this.leaveSeat(peer.userId);
    movement.dx = 0;
    movement.dy = 0;
    movement.controllerPeerId = peer.id;
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.assetInteraction;
    movement.path = this.findApproachPath(layout, peer.userId, player, target);
    if (movement.path.length === 0 && Math.hypot(player.x - target.x, player.y - target.y) > WALK_UP_CALL_RANGE) {
      throw new Error("DESTINATION_BLOCKED");
    }
    movement.approachUserId = targetUserId;
    movement.approachRequestId = requestId;
    this.tryStartWalkUpCall(player, movement);
    this.synchronizeMovementActivity(peer.userId, movement);
  }

  private findApproachPath(layout: FloorLayout, userId: string, player: WorldPlayer, target: WorldPlayer): { x: number; y: number }[] {
    const floor = this.store.getFloor(player.floorId);
    if (!floor) {
      return [];
    }
    const roomAccessIds = this.getRoomAccessIds(userId, layout);
    return findPath(
      layout,
      getOutdoorBounds(floor),
      userId,
      player,
      target,
      roomAccessIds,
      this.getFullRoomIds(player),
    );
  }

  private handleKidnappingStart(peer: Peer, targetUserId: string, requestId: string): void {
    const carrier = this.players.get(peer.userId);
    const target = this.players.get(targetUserId);
    const movement = this.movements.get(peer.userId);
    if (!this.store.getGlobalKidnappingSettings().enabled) {
      throw new Error("KIDNAPPING_DISABLED");
    }
    if (!carrier?.connected || !target?.connected || !movement) {
      throw new Error("PERSON_OFFLINE");
    }
    if (carrier.userId === target.userId || carrier.floorId !== target.floorId) {
      throw new Error("KIDNAPPING_INVALID");
    }
    if (!this.store.canKidnap(carrier.userId, target.userId)) {
      throw new Error("KIDNAPPING_NOT_ALLOWED");
    }
    if (
      this.gameRuntime.isPlaying(carrier.userId)
      || this.gameRuntime.isPlaying(target.userId)
      || this.activeMeetings.has(carrier.userId)
      || this.activeMeetings.has(target.userId)
      || target.seat
    ) {
      throw new Error("KIDNAPPING_UNAVAILABLE");
    }
    if (this.isKidnappingInvolved(carrier.userId) || this.isKidnappingInvolved(target.userId)) {
      throw new Error("KIDNAPPING_BUSY");
    }
    const targetMovement = this.movements.get(target.userId);
    if (targetMovement && this.movementHasIntent(targetMovement)) {
      throw new Error("KIDNAPPING_UNAVAILABLE");
    }
    this.leaveSeat(carrier.userId);
    const path = this.findCompletePath(carrier.userId, carrier.floorId, carrier, target);
    if (!path) {
      throw new Error("DESTINATION_BLOCKED");
    }
    movement.dx = 0;
    movement.dy = 0;
    movement.path = path;
    movement.controllerPeerId = peer.id;
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    delete movement.assetInteraction;
    movement.kidnappingTargetUserId = target.userId;
    movement.kidnappingRequestId = requestId;
    this.tryCompleteKidnappingPickup(carrier, movement);
    this.synchronizeMovementActivity(carrier.userId, movement);
  }

  private tryCompleteKidnappingPickup(carrier: WorldPlayer, movement: MovementState): void {
    const targetUserId = movement.kidnappingTargetUserId;
    if (!targetUserId) {
      return;
    }
    const target = this.players.get(targetUserId);
    if (!target?.connected || target.floorId !== carrier.floorId) {
      this.cancelKidnappingApproach(carrier.userId, movement, "PERSON_OFFLINE");
      return;
    }
    if (!this.store.canKidnap(carrier.userId, target.userId)) {
      this.cancelKidnappingApproach(carrier.userId, movement, "KIDNAPPING_NOT_ALLOWED");
      return;
    }
    if (
      this.gameRuntime.isPlaying(carrier.userId)
      || this.gameRuntime.isPlaying(target.userId)
      || this.activeMeetings.has(carrier.userId)
      || this.activeMeetings.has(target.userId)
      || target.seat
    ) {
      this.cancelKidnappingApproach(carrier.userId, movement, "KIDNAPPING_UNAVAILABLE");
      return;
    }
    if (Math.hypot(carrier.x - target.x, carrier.y - target.y) > KIDNAPPING_PICKUP_DISTANCE) {
      if (movement.path.length === 0) {
        const path = this.findCompletePath(carrier.userId, carrier.floorId, carrier, target);
        if (!path || path.length === 0) {
          this.cancelKidnappingApproach(carrier.userId, movement, "DESTINATION_BLOCKED");
          return;
        }
        movement.path = path;
      }
      return;
    }
    movement.dx = 0;
    movement.dy = 0;
    movement.path = [];
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    this.stopMovementState(target.userId);
    carrier.x = target.x;
    carrier.y = target.y;
    target.carriedByUserId = carrier.userId;
    target.facing = carrier.facing;
    this.kidnappingByCarrier.set(carrier.userId, target.userId);
    this.kidnappingByCarried.set(target.userId, carrier.userId);
    const event: ServerEvent = {
      type: "kidnapping.started",
      carrierUserId: carrier.userId,
      carriedUserId: target.userId,
    };
    this.sendToUser(carrier.userId, event);
    this.sendToUser(target.userId, event);
    this.dirtySnapshotFloorIds.add(carrier.floorId);
    this.reconciliationDirty = true;
    this.dirty = true;
  }

  private movementHasIntent(movement: MovementState): boolean {
    return movement.dx !== 0
      || movement.dy !== 0
      || movement.path.length > 0
      || Boolean(movement.journey)
      || Boolean(movement.approachUserId)
      || Boolean(movement.assetInteraction)
      || Boolean(movement.kidnappingTargetUserId);
  }

  private isKidnappingInvolved(userId: string): boolean {
    if (this.kidnappingByCarrier.has(userId) || this.kidnappingByCarried.has(userId)) {
      return true;
    }
    for (const [carrierUserId, movement] of this.movements) {
      if (movement.kidnappingTargetUserId && (carrierUserId === userId || movement.kidnappingTargetUserId === userId)) {
        return true;
      }
    }
    return false;
  }

  private cancelPendingKidnappingForUser(userId: string, reason: KidnappingEndReason): void {
    for (const [carrierUserId, movement] of this.movements) {
      if (!movement.kidnappingTargetUserId) {
        continue;
      }
      if (carrierUserId === userId) {
        this.cancelKidnappingApproach(carrierUserId, movement);
      } else if (movement.kidnappingTargetUserId === userId) {
        this.cancelKidnappingApproach(
          carrierUserId,
          movement,
          reason === "access_revoked" ? "KIDNAPPING_NOT_ALLOWED" : "KIDNAPPING_CANCELLED",
        );
      }
    }
  }

  private cancelKidnappingApproach(carrierUserId: string, movement: MovementState, code?: string): void {
    const requestId = movement.kidnappingRequestId;
    movement.dx = 0;
    movement.dy = 0;
    movement.path = [];
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    this.activeMovementUserIds.delete(carrierUserId);
    if (code && requestId) {
      this.sendToUser(carrierUserId, {
        type: "command.error",
        requestId,
        code,
        message: this.userMessage(code),
      });
    }
  }

  private endKidnappingIfCarried(userId: string, reason: KidnappingEndReason): void {
    const carrierUserId = this.kidnappingByCarried.get(userId);
    if (carrierUserId) {
      this.endActiveKidnapping(carrierUserId, reason);
    }
  }

  private endKidnappingForUser(userId: string, reason: KidnappingEndReason): void {
    this.cancelPendingKidnappingForUser(userId, reason);
    const carrierUserId = this.kidnappingByCarried.get(userId);
    if (carrierUserId) {
      this.endActiveKidnapping(carrierUserId, reason);
      return;
    }
    if (this.kidnappingByCarrier.has(userId)) {
      this.endActiveKidnapping(userId, reason);
    }
  }

  private endActiveKidnapping(carrierUserId: string, reason: KidnappingEndReason): void {
    const carriedUserId = this.kidnappingByCarrier.get(carrierUserId);
    if (!carriedUserId) {
      return;
    }
    const carrier = this.players.get(carrierUserId);
    const carried = this.players.get(carriedUserId);
    this.kidnappingByCarrier.delete(carrierUserId);
    this.kidnappingByCarried.delete(carriedUserId);
    if (carried?.carriedByUserId === carrierUserId) {
      delete carried.carriedByUserId;
    }
    const event: ServerEvent = {
      type: "kidnapping.ended",
      carrierUserId,
      carriedUserId,
      reason,
    };
    this.sendToUser(carrierUserId, event);
    this.sendToUser(carriedUserId, event);
    if (carrier) {
      this.dirtySnapshotFloorIds.add(carrier.floorId);
    }
    if (carried) {
      this.dirtySnapshotFloorIds.add(carried.floorId);
    }
    this.reconciliationDirty = true;
    this.dirty = true;
  }

  private validateActiveKidnapping(carrierUserId: string): void {
    const carrier = this.players.get(carrierUserId);
    const carried = this.getCarriedPlayer(carrierUserId);
    if (
      !carrier?.connected
      || !carried?.connected
      || carrier.floorId !== carried.floorId
      || Math.hypot(carrier.x - carried.x, carrier.y - carried.y) >= 0.01
    ) {
      this.endActiveKidnapping(carrierUserId, "interrupted");
      return;
    }
    if (!this.store.canKidnap(carrierUserId, carried.userId)) {
      this.endActiveKidnapping(carrierUserId, "access_revoked");
    }
  }

  private updateGlobalKidnappingSettings(peer: Peer, settings: GlobalKidnappingSettings): void {
    if (!this.store.canManageMembers(peer.userId)) {
      throw new Error("KIDNAPPING_SETTINGS_FORBIDDEN");
    }
    const updated = this.store.updateGlobalKidnappingSettings(settings);
    this.broadcast({ type: "kidnapping.global_settings_updated", settings: updated });
    this.reconcileKidnappingPermissions();
  }

  private updatePlayerKidnappingSettings(peer: Peer, settings: PlayerKidnappingSettings): void {
    const updated = this.store.updatePlayerKidnappingSettings(peer.userId, settings);
    this.sendToUser(peer.userId, { type: "kidnapping.player_settings_updated", settings: updated });
    this.reconcileKidnappingPermissions();
  }

  private reconcileKidnappingPermissions(): void {
    for (const [carrierUserId, movement] of this.movements) {
      const targetUserId = movement.kidnappingTargetUserId;
      if (targetUserId && !this.store.canKidnap(carrierUserId, targetUserId)) {
        this.cancelKidnappingApproach(carrierUserId, movement, "KIDNAPPING_NOT_ALLOWED");
      }
    }
    for (const [carrierUserId, carriedUserId] of this.kidnappingByCarrier) {
      if (!this.store.canKidnap(carrierUserId, carriedUserId)) {
        this.endActiveKidnapping(carrierUserId, "access_revoked");
      }
    }
  }

  private setAvailability(peer: Peer, availability: WorldPlayer["availability"]): void {
    const player = this.players.get(peer.userId);
    if (!player) {
      throw new Error("WORLD_NOT_READY");
    }
    player.availability = availability;
    const member = this.store.updateAvailability(peer.userId, availability);
    this.broadcast({ type: "presence.changed", member });
    if (availability === "dnd") {
      for (const [userId, movement] of this.movements) {
        if (movement.approachUserId === peer.userId) {
          this.cancelApproach(userId, movement, "PERSON_UNAVAILABLE");
        }
      }
      for (const call of this.calls.values()) {
        if (call.state === "ringing" && call.targetUserId === peer.userId) {
          this.finishCall(call, "declined");
        }
      }
    }
    this.reconcileProximityCalls();
  }

  private setProximityMedia(peer: Peer, microphone: boolean, camera: boolean): void {
    const player = this.players.get(peer.userId);
    if (!player?.connected) {
      throw new Error("WORLD_NOT_READY");
    }
    if (microphone || camera) {
      this.proximityMedia.set(peer.userId, { microphone, camera });
    } else {
      this.proximityMedia.delete(peer.userId);
      delete player.proximity;
    }
    this.reconcileProximityCalls();
  }

  private reconcileProximityCalls(): void {
    if (this.proximityMedia.size === 0) {
      return;
    }
    const readyPlayers: Array<{ player: WorldPlayer; media: { microphone: boolean; camera: boolean } }> = [];
    const participants = [];
    for (const [userId, media] of this.proximityMedia) {
      const player = this.players.get(userId);
      if (!player) {
        continue;
      }
      const ready = player.connected
        && player.availability !== "dnd"
        && !this.activeMeetings.has(userId)
        && !this.userHasAcceptedCall(userId)
        && this.isOnPublicFloor(player);
      if (!ready) {
        delete player.proximity;
        continue;
      }
      readyPlayers.push({ player, media });
      participants.push({
        userId,
        floorId: player.floorId,
        zoneId: player.roomId ? `room:${player.roomId}` : `floor:${player.floorId}`,
        x: player.x,
        y: player.y,
        ...(player.proximity?.callId ? { groupId: player.proximity.callId } : {}),
      });
    }
    const memberships = reconcileProximityGroups(participants, randomUUID);

    for (const { player, media } of readyPlayers) {
      const callId = memberships.get(player.userId);
      player.proximity = {
        ...media,
        ...(callId ? { callId } : {}),
      };
    }
  }

  private sendChat(peer: Peer, requestId: string, conversationId: string, body: string): void {
    const message = this.store.addMessage(conversationId, peer.userId, body);
    this.publishChatMessage(message);
    peer.send({ type: "chat.ack", requestId, messageId: message.id });
  }

  private applyLayout(peer: Peer, requestId: string, baseRevision: number, edit: LayoutEdit): void {
    if (!this.store.canBuild(peer.userId)) {
      throw new Error("EDIT_FORBIDDEN");
    }
    const layout = this.store.getLayout(peer.floorId);
    const floor = this.store.getFloor(peer.floorId);
    if (!layout || !floor) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    if (layout.revision !== baseRevision) {
      peer.send({ type: "layout.conflict", requestId, revision: layout.revision });
      return;
    }
    const next = structuredClone(layout);
    const normalizedSegments = mergeWallSegments(next.walls, next.openings);
    next.walls = normalizedSegments.walls;
    next.openings = normalizedSegments.openings;
    if (edit.tool === "wall") {
      const wall = this.createWall(edit.start, edit.end);
      const wallRect = getWallRect(wall);
      this.assertNoPlayerOverlap(peer.floorId, [wallRect]);
      this.assertWallPlacement(next, floor, wall);
      next.walls.push(wall);
    } else if (edit.tool === "erase") {
      this.eraseLayoutItem(peer.floorId, next, snapToAssetRaster(edit.position.x), snapToAssetRaster(edit.position.y));
    } else if (edit.tool === "door" || edit.tool === "window") {
      this.addWallOpening(next, edit.tool, edit.position);
    } else if (edit.tool === "asset") {
      const object = this.createAsset(
        peer.floorId,
        edit.assetId,
        edit.variantId,
        edit.rotation,
        snapToAssetRaster(edit.position.x),
        snapToAssetRaster(edit.position.y),
      );
      this.assertNoPlayerOverlap(peer.floorId, getPlacedAssetCellRects(object, true));
      this.assertAssetPlacement(next, floor, object);
      next.objects.push(object);
    } else if (edit.tool === "asset.move") {
      this.moveAsset(peer.floorId, next, floor, edit.objectId, edit.position, edit.variantId, edit.rotation);
    } else if (edit.tool === "wall.move") {
      this.moveWall(peer.floorId, next, floor, edit.wallId, edit.start, edit.end);
    } else if (edit.tool === "opening.move") {
      this.moveOpening(peer.floorId, next, edit.openingId, edit.position);
    } else if (edit.tool === "item.remove") {
      this.removeLayoutItem(peer.floorId, next, edit.item);
    } else {
      throw new Error("EDIT_INVALID");
    }
    const mergedSegments = mergeWallSegments(next.walls, next.openings);
    next.walls = mergedSegments.walls;
    next.openings = mergedSegments.openings;
    next.revision += 1;
    const replacement = this.store.replaceLayout(detectLayoutRooms(next, floor));
    const saved = replacement.layout;
    this.reconcileLayoutRooms(layout, saved);
    this.broadcastLayout(saved, { userId: peer.userId, requestId });
    for (const userId of replacement.economyUserIds) {
      this.publishEconomy(userId);
    }
  }

  private placePlayerAsset(
    peer: Peer,
    requestId: string,
    baseRevision: number,
    ownedAssetId: string,
    position: { x: number; y: number },
    variantId: string,
    rotation: AssetRotation,
  ): void {
    const layout = this.store.getLayout(peer.floorId);
    const floor = this.store.getFloor(peer.floorId);
    if (!layout || !floor) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    if (layout.revision !== baseRevision) {
      peer.send({ type: "layout.conflict", requestId, revision: layout.revision });
      return;
    }
    if (layout.objects.length >= MAX_LAYOUT_OBJECTS_PER_FLOOR) {
      throw new Error("LAYOUT_CAPACITY_REACHED");
    }
    const ownedAsset = this.store.getOwnedAsset(peer.userId, ownedAssetId);
    if (ownedAsset.placement) {
      throw new Error("ASSET_ALREADY_PLACED");
    }
    const object: WorldObject = {
      ...this.createAsset(
        peer.floorId,
        ownedAsset.assetId,
        variantId,
        rotation,
        snapToAssetRaster(position.x),
        snapToAssetRaster(position.y),
      ),
      ownerUserId: peer.userId,
      ownedAssetId,
    };
    const next = structuredClone(layout);
    this.assertNoPlayerOverlap(peer.floorId, getPlacedAssetCellRects(object, true));
    this.assertAssetPlacement(next, floor, object);
    this.assertPlayerAssetRoom(next, object, peer.userId);
    next.objects.push(object);
    next.revision += 1;
    const replacement = this.store.replaceLayout(next);
    this.broadcastLayout(replacement.layout, { userId: peer.userId, requestId });
    this.publishEconomy(peer.userId, requestId);
  }

  private movePlayerAsset(
    peer: Peer,
    requestId: string,
    baseRevision: number,
    objectId: string,
    position: { x: number; y: number },
    variantId: string,
    rotation: AssetRotation,
  ): void {
    const layout = this.store.getLayout(peer.floorId);
    const floor = this.store.getFloor(peer.floorId);
    if (!layout || !floor) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    if (layout.revision !== baseRevision) {
      peer.send({ type: "layout.conflict", requestId, revision: layout.revision });
      return;
    }
    const object = layout.objects.find((candidate) => candidate.id === objectId);
    if (!object?.ownedAssetId || object.ownerUserId !== peer.userId) {
      throw new Error("ASSET_NOT_OWNED");
    }
    const ownedAsset = this.store.getOwnedAsset(peer.userId, object.ownedAssetId);
    if (ownedAsset.placement?.objectId !== object.id) {
      throw new Error("ASSET_OWNERSHIP_INVALID");
    }
    const next = structuredClone(layout);
    this.moveAsset(peer.floorId, next, floor, objectId, position, variantId, rotation, (candidate) => {
      this.assertPlayerAssetRoom(next, candidate, peer.userId);
    });
    next.revision += 1;
    const replacement = this.store.replaceLayout(next);
    this.broadcastLayout(replacement.layout, { userId: peer.userId, requestId });
    this.publishEconomy(peer.userId, requestId);
  }

  private removePlayerAsset(peer: Peer, requestId: string, baseRevision: number, objectId: string): void {
    const layout = this.store.getLayout(peer.floorId);
    if (!layout) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    if (layout.revision !== baseRevision) {
      peer.send({ type: "layout.conflict", requestId, revision: layout.revision });
      return;
    }
    const object = layout.objects.find((candidate) => candidate.id === objectId);
    if (!object?.ownedAssetId || object.ownerUserId !== peer.userId) {
      throw new Error("ASSET_NOT_OWNED");
    }
    const ownedAsset = this.store.getOwnedAsset(peer.userId, object.ownedAssetId);
    if (ownedAsset.placement?.objectId !== object.id || ownedAsset.placement.floorId !== object.floorId) {
      throw new Error("ASSET_OWNERSHIP_INVALID");
    }
    const next = structuredClone(layout);
    this.removeLayoutItem(peer.floorId, next, { type: "asset", id: objectId });
    next.revision += 1;
    const replacement = this.store.replaceLayout(next);
    this.broadcastLayout(replacement.layout, { userId: peer.userId, requestId });
    this.publishEconomy(peer.userId, requestId);
  }

  private claimDailyReward(peer: Peer, requestId: string): void {
    const result = this.store.claimDailyReward(peer.userId, requestId);
    this.publishEconomy(peer.userId, requestId, result.transaction);
  }

  private purchaseAsset(peer: Peer, requestId: string, assetId: string): void {
    const result = this.store.purchaseAsset(peer.userId, assetId, requestId);
    this.publishEconomy(peer.userId, requestId, result.transaction);
  }

  private updateGameSettings(peer: Peer, settings: Parameters<DemoStore["updateGameSettings"]>[0]): void {
    if (!this.store.canManageMembers(peer.userId)) {
      throw new Error("GAME_SETTINGS_FORBIDDEN");
    }
    const updated = this.store.updateGameSettings(settings);
    this.broadcast({ type: "game.settings_updated", settings: updated });
  }

  private assertPlayerAssetRoom(layout: FloorLayout, object: WorldObject, userId: string): void {
    const error = getPlayerAssetRoomError(layout, object, userId, this.store.getGameSettings());
    if (error) {
      throw new Error(error);
    }
  }

  private reconcileLayoutRooms(previous: FloorLayout, next: FloorLayout): void {
    const nextRoomIds = new Set(next.rooms.map((room) => room.id));
    const previousRooms = new Map(previous.rooms.map((room) => [room.id, room]));
    for (const room of previous.rooms) {
      if (!nextRoomIds.has(room.id)) {
        this.clearRoomGrants(room.id);
        this.broadcastToFloor(next.floorId, { type: "room.access_revoked", roomId: room.id });
      }
    }
    for (const room of next.rooms) {
      const previousRoom = previousRooms.get(room.id);
      if (previousRoom?.access.mode === "assigned" && room.access.mode === "open") {
        this.clearRoomGrants(room.id);
        this.broadcastToFloor(next.floorId, { type: "room.access_revoked", roomId: room.id });
      }
    }
    for (const player of this.players.values()) {
      if (player.floorId !== next.floorId) {
        continue;
      }
      this.updateRoom(player);
      const room = player.roomId ? next.rooms.find((candidate) => candidate.id === player.roomId) : undefined;
      if (room?.access.mode === "assigned" && !this.userHasRoomAccess(player.userId, room)) {
        this.evictPlayerFromRoom(player, room);
      }
    }
    for (const [userId, meetingId] of this.activeMeetings) {
      const meeting = this.store.getMeeting(meetingId);
      if (meeting?.location.type === "room" && !nextRoomIds.has(meeting.location.roomId)) {
        this.leaveActiveMeeting(userId);
      }
    }
    this.validateRoomKnocks();
  }

  private createWall(rawStart: { x: number; y: number }, rawEnd: { x: number; y: number }): Wall {
    const start = { x: snapToBuildGrid(rawStart.x), y: snapToBuildGrid(rawStart.y) };
    const horizontal = Math.abs(rawEnd.x - rawStart.x) >= Math.abs(rawEnd.y - rawStart.y);
    const end = horizontal
      ? { x: snapToBuildGrid(rawEnd.x), y: start.y }
      : { x: start.x, y: snapToBuildGrid(rawEnd.y) };
    if (start.x === end.x && start.y === end.y) {
      end.x += BUILD_GRID_SIZE;
    }
    return normalizeWall({ id: randomUUID(), start, end });
  }

  private addWallOpening(layout: FloorLayout, type: WallOpening["type"], position: { x: number; y: number }): void {
    const placement = getWallOpeningPlacement(layout, type, position);
    if (placement.error || !placement.wall || !placement.opening) {
      throw new Error(placement.error ?? "OPENING_REQUIRES_WALL");
    }
    layout.openings = [
      ...layout.openings.filter((opening) => !placement.replacedOpeningIds.includes(opening.id)),
      { ...placement.opening, id: randomUUID() },
    ];
  }

  private eraseLayoutItem(floorId: string, layout: FloorLayout, x: number, y: number): void {
    const opening = [...layout.openings].reverse().find((candidate) => {
      const wall = layout.walls.find((item) => item.id === candidate.wallId);
      return wall && pointInRect(x, y, getOpeningRect(wall, candidate, BUILD_GRID_SIZE));
    });
    if (opening) {
      this.removeLayoutItem(floorId, layout, { type: "opening", id: opening.id });
      return;
    }
    const object = getAssetRemovalCandidates(layout.objects).find((candidate) => isPointInPlacedAsset(x, y, candidate));
    if (object) {
      this.removeLayoutItem(floorId, layout, { type: "asset", id: object.id });
      return;
    }
    const wall = [...layout.walls].reverse().find((candidate) => pointInRect(x, y, getWallRect(candidate, BUILD_GRID_SIZE)));
    if (!wall) {
      throw new Error("NOTHING_TO_ERASE");
    }
    this.eraseWallSection(layout, wall, x, y);
  }

  private moveAsset(
    floorId: string,
    layout: FloorLayout,
    floor: Floor,
    objectId: string,
    position: { x: number; y: number },
    variantId: string,
    rotation: AssetRotation,
    authorize?: (candidate: WorldObject) => void,
  ): void {
    const object = layout.objects.find((candidate) => candidate.id === objectId);
    if (!object) {
      throw new Error("NOTHING_TO_ERASE");
    }
    if (getAssetsSupportedBy(layout, object).length > 0) {
      throw new Error("ASSET_SUPPORT_OCCUPIED");
    }
    requireAssetVariant(requireAssetDefinition(object.assetId), variantId);
    const candidate = {
      ...object,
      x: snapToAssetRaster(position.x),
      y: snapToAssetRaster(position.y),
      variantId,
      rotation,
    };
    this.assertAssetPlacement(layout, floor, candidate);
    this.assertNoPlayerOverlap(floorId, getPlacedAssetCellRects(candidate, true), objectId);
    authorize?.(candidate);
    this.releaseSeatsForObject(objectId);
    layout.objects = layout.objects.map((current) => current.id === objectId ? candidate : current);
  }

  private moveWall(
    floorId: string,
    layout: FloorLayout,
    floor: Floor,
    wallId: string,
    start: { x: number; y: number },
    end: { x: number; y: number },
  ): void {
    const wall = layout.walls.find((candidate) => candidate.id === wallId);
    if (!wall) {
      throw new Error("NOTHING_TO_ERASE");
    }
    const candidate = { ...this.createWall(start, end), id: wall.id };
    if (getWallLength(candidate) !== getWallLength(wall)) {
      throw new Error("EDIT_INVALID");
    }
    const wallOpenings = layout.openings.filter((opening) => opening.wallId === wall.id);
    const layoutWithoutWall: FloorLayout = {
      ...layout,
      walls: layout.walls.filter((current) => current.id !== wall.id),
      openings: layout.openings.filter((opening) => opening.wallId !== wall.id),
    };
    this.assertWallPlacement(layoutWithoutWall, floor, candidate);
    const candidateLayout: FloorLayout = {
      ...layoutWithoutWall,
      walls: [...layoutWithoutWall.walls, candidate],
      openings: [...layoutWithoutWall.openings, ...wallOpenings],
    };
    const ignoredOpeningIds = new Set(wallOpenings.map((opening) => opening.id));
    for (const opening of wallOpenings) {
      const placement = getWallOpeningPlacement(
        candidateLayout,
        opening.type,
        getOpeningCenter(candidate, opening),
        ignoredOpeningIds,
      );
      if (placement.error) {
        throw new Error(placement.error);
      }
    }
    this.assertNoPlayerOverlap(floorId, getWallSolidRects(candidate, wallOpenings));
    layout.walls = layout.walls.map((current) => current.id === wall.id ? candidate : current);
  }

  private moveOpening(floorId: string, layout: FloorLayout, openingId: string, position: { x: number; y: number }): void {
    const opening = layout.openings.find((candidate) => candidate.id === openingId);
    if (!opening) {
      throw new Error("NOTHING_TO_ERASE");
    }
    const layoutWithoutOpening: FloorLayout = {
      ...layout,
      openings: layout.openings.filter((candidate) => candidate.id !== opening.id),
    };
    const placement = getWallOpeningPlacement(layoutWithoutOpening, opening.type, position);
    if (placement.error || !placement.opening) {
      throw new Error(placement.error ?? "OPENING_REQUIRES_WALL");
    }
    const movedOpening: WallOpening = opening.type === "window"
      ? { ...placement.opening, id: opening.id, type: "window", light: opening.light }
      : { ...placement.opening, id: opening.id, type: "door" };
    const replacedIds = new Set(placement.replacedOpeningIds);
    const nextOpenings = [
      ...layoutWithoutOpening.openings.filter((candidate) => !replacedIds.has(candidate.id)),
      movedOpening,
    ];
    const impactedWallIds = new Set([opening.wallId, movedOpening.wallId]);
    const solidRects = layout.walls
      .filter((wall) => impactedWallIds.has(wall.id))
      .flatMap((wall) => getWallSolidRects(wall, nextOpenings));
    this.assertNoPlayerOverlap(floorId, solidRects);
    layout.openings = nextOpenings;
  }

  private removeLayoutItem(floorId: string, layout: FloorLayout, item: LayoutItemReference): void {
    if (item.type === "asset") {
      const object = layout.objects.find((candidate) => candidate.id === item.id);
      if (!object) {
        throw new Error("NOTHING_TO_ERASE");
      }
      if (getAssetsSupportedBy(layout, object).length > 0) {
        throw new Error("ASSET_SUPPORT_OCCUPIED");
      }
      this.releaseSeatsForObject(object.id);
      layout.objects = layout.objects.filter((candidate) => candidate.id !== object.id);
      return;
    }
    if (item.type === "opening") {
      const opening = layout.openings.find((candidate) => candidate.id === item.id);
      const wall = opening ? layout.walls.find((candidate) => candidate.id === opening.wallId) : undefined;
      if (!opening || !wall) {
        throw new Error("NOTHING_TO_ERASE");
      }
      const nextOpenings = layout.openings.filter((candidate) => candidate.id !== opening.id);
      this.assertNoPlayerOverlap(floorId, getWallSolidRects(wall, nextOpenings));
      layout.openings = nextOpenings;
      return;
    }
    if (!layout.walls.some((wall) => wall.id === item.id)) {
      throw new Error("NOTHING_TO_ERASE");
    }
    layout.walls = layout.walls.filter((wall) => wall.id !== item.id);
    layout.openings = layout.openings.filter((opening) => opening.wallId !== item.id);
  }

  private eraseWallSection(layout: FloorLayout, wallInput: Wall, x: number, y: number): void {
    const wall = normalizeWall(wallInput);
    const erasedRange = getWallSectionRange(wall, layout.walls, x, y);
    const wallLength = getWallLength(wall);
    const retainedRanges = [
      { start: 0, end: erasedRange.start },
      { start: erasedRange.end, end: wallLength },
    ].filter((range) => range.end > range.start);
    const orientation = getWallOrientation(wall);
    const retainedSections = retainedRanges.map((range, index) => ({
      range,
      wall: {
        id: index === 0 ? wall.id : randomUUID(),
        start: orientation === "horizontal"
          ? { x: wall.start.x + range.start, y: wall.start.y }
          : { x: wall.start.x, y: wall.start.y + range.start },
        end: orientation === "horizontal"
          ? { x: wall.start.x + range.end, y: wall.start.y }
          : { x: wall.start.x, y: wall.start.y + range.end },
      } satisfies Wall,
    }));

    layout.walls = layout.walls.flatMap(
      (candidate) => candidate.id === wall.id ? retainedSections.map((section) => section.wall) : [candidate],
    );
    const retainedOpenings: WallOpening[] = [];
    for (const opening of layout.openings) {
      if (opening.wallId !== wall.id) {
        retainedOpenings.push(opening);
        continue;
      }
      const retainedSection = retainedSections.find(
        ({ range }) => opening.offset >= range.start && opening.offset + opening.width <= range.end,
      );
      if (retainedSection) {
        retainedOpenings.push({
          ...opening,
          wallId: retainedSection.wall.id,
          offset: opening.offset - retainedSection.range.start,
        });
      }
    }
    layout.openings = retainedOpenings;
  }

  private assertWallPlacement(layout: FloorLayout, floor: Floor, wall: Wall): void {
    const error = getWallPlacementError(layout, getOutdoorBounds(floor), wall);
    if (error) {
      throw new Error(error);
    }
  }

  private assertAssetPlacement(layout: FloorLayout, floor: Floor, object: WorldObject): void {
    const error = getAssetPlacementError(layout, getOutdoorBounds(floor), object);
    if (error) {
      throw new Error(error);
    }
  }

  private createAsset(floorId: string, assetId: string, variantId: string, rotation: AssetRotation, x: number, y: number): WorldObject {
    const definition = requireAssetDefinition(assetId);
    if (!definition.buildable) {
      throw new Error("ASSET_NOT_BUILDABLE");
    }
    requireAssetVariant(definition, variantId);
    return {
      id: randomUUID(),
      floorId,
      assetId,
      x,
      y,
      rotation,
      variantId,
    };
  }

  private interactWithAsset(peer: Peer, requestId: string, objectId: string, interactionId: string): void {
    const player = this.players.get(peer.userId);
    const movement = this.movements.get(peer.userId);
    const layout = player ? this.store.getLayout(player.floorId) : undefined;
    const floor = player ? this.store.getFloor(player.floorId) : undefined;
    const object = layout?.objects.find((candidate) => candidate.id === objectId);
    const interaction = object ? getPlacedAssetInteraction(object, interactionId) : undefined;
    if (!player || !movement || !layout || !floor || !object || !interaction || object.floorId !== player.floorId) {
      throw new Error("ASSET_INTERACTION_INVALID");
    }
    this.endKidnappingForUser(peer.userId, "interrupted");
    if (player.seat?.objectId === objectId && player.seat.interactionId === interactionId) {
      return;
    }
    this.assertSeatAvailable(player.userId, objectId, interactionId);
    if (this.getDistanceToBounds(player.x, player.y, interaction.bounds) <= ASSET_INTERACTION_RANGE) {
      this.seatPlayer(player, objectId, interactionId, interaction.center, interaction.direction);
      return;
    }
    this.leaveSeat(player.userId);
    movement.dx = 0;
    movement.dy = 0;
    movement.controllerPeerId = peer.id;
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    movement.path = this.findAssetInteractionPath(layout, floor, player, interaction.bounds);
    this.activeMovementUserIds.delete(peer.userId);
    const destination = movement.path.at(-1);
    if (!destination || this.getDistanceToBounds(destination.x, destination.y, interaction.bounds) > ASSET_INTERACTION_RANGE) {
      movement.path = [];
      throw new Error("DESTINATION_BLOCKED");
    }
    movement.assetInteraction = { objectId, interactionId, requestId };
    this.activeMovementUserIds.add(peer.userId);
  }

  private findAssetInteractionPath(layout: FloorLayout, floor: Floor, player: WorldPlayer, bounds: Rect): { x: number; y: number }[] {
    const navigationBounds = getOutdoorBounds(floor);
    const roomAccessIds = this.getRoomAccessIds(player.userId, layout);
    const fullRoomIds = this.getFullRoomIds(player);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const candidates = [1, 2, 3, 4].flatMap((step) => {
      const margin = step * ASSET_RASTER_SIZE;
      return [
        { x: bounds.x - margin, y: center.y },
        { x: bounds.x + bounds.width + margin, y: center.y },
        { x: center.x, y: bounds.y - margin },
        { x: center.x, y: bounds.y + bounds.height + margin },
      ];
    });
    let shortest: { x: number; y: number }[] = [];
    for (const candidate of candidates) {
      if (!canOccupy(
        layout,
        navigationBounds,
        player.userId,
        player.x,
        player.y,
        candidate.x,
        candidate.y,
        13,
        roomAccessIds,
        fullRoomIds,
      )) {
        continue;
      }
      const path = findPath(
        layout,
        navigationBounds,
        player.userId,
        player,
        candidate,
        roomAccessIds,
        fullRoomIds,
      );
      const endpoint = path.at(-1);
      if (
        endpoint
        && this.getDistanceToBounds(endpoint.x, endpoint.y, bounds) <= ASSET_INTERACTION_RANGE
        && (shortest.length === 0 || path.length < shortest.length)
      ) {
        shortest = path;
      }
    }
    return shortest;
  }

  private tryCompleteAssetInteraction(player: WorldPlayer, movement: MovementState): void {
    const pending = movement.assetInteraction;
    if (!pending || movement.path.length > 0) {
      return;
    }
    const layout = this.store.getLayout(player.floorId);
    const object = layout?.objects.find((candidate) => candidate.id === pending.objectId);
    const interaction = object ? getPlacedAssetInteraction(object, pending.interactionId) : undefined;
    if (!object || !interaction) {
      this.cancelAssetInteraction(player.userId, movement, "ASSET_INTERACTION_INVALID");
      return;
    }
    if (this.getDistanceToBounds(player.x, player.y, interaction.bounds) > ASSET_INTERACTION_RANGE) {
      this.cancelAssetInteraction(player.userId, movement, "DESTINATION_BLOCKED");
      return;
    }
    try {
      this.assertSeatAvailable(player.userId, object.id, interaction.id);
      delete movement.assetInteraction;
      this.seatPlayer(player, object.id, interaction.id, interaction.center, interaction.direction);
    } catch (error) {
      this.cancelAssetInteraction(player.userId, movement, error instanceof Error ? error.message : "ASSET_INTERACTION_INVALID");
    }
  }

  private cancelAssetInteraction(userId: string, movement: MovementState, code: string): void {
    const requestId = movement.assetInteraction?.requestId;
    movement.path = [];
    delete movement.assetInteraction;
    this.activeMovementUserIds.delete(userId);
    this.sendToUser(userId, {
      type: "command.error",
      ...(requestId ? { requestId } : {}),
      code,
      message: this.userMessage(code),
    });
  }

  private assertSeatAvailable(userId: string, objectId: string, interactionId: string): void {
    const occupied = [...this.players.values()].some((candidate) => (
      candidate.userId !== userId
      && candidate.connected
      && candidate.seat?.objectId === objectId
      && candidate.seat.interactionId === interactionId
    ));
    if (occupied) {
      throw new Error("SEAT_OCCUPIED");
    }
  }

  private seatPlayer(
    player: WorldPlayer,
    objectId: string,
    interactionId: string,
    center: { x: number; y: number },
    direction: WorldPlayer["facing"],
  ): void {
    this.leaveSeat(player.userId);
    this.seatOrigins.set(player.userId, { x: player.x, y: player.y });
    this.stopMovement(player.userId);
    player.x = center.x;
    player.y = center.y;
    player.facing = direction;
    player.seat = { objectId, interactionId };
    this.updateRoom(player);
    this.dirty = true;
  }

  private getDistanceToBounds(x: number, y: number, bounds: Rect): number {
    const distanceX = Math.max(bounds.x - x, 0, x - bounds.x - bounds.width);
    const distanceY = Math.max(bounds.y - y, 0, y - bounds.y - bounds.height);
    return Math.hypot(distanceX, distanceY);
  }

  private leaveSeat(userId: string): void {
    const player = this.players.get(userId);
    if (!player?.seat) {
      return;
    }
    const origin = this.seatOrigins.get(userId);
    const destination = this.findSeatExit(player, origin);
    delete player.seat;
    this.seatOrigins.delete(userId);
    if (destination) {
      player.x = destination.x;
      player.y = destination.y;
      this.updateRoom(player);
    }
    this.dirty = true;
  }

  private findSeatExit(player: WorldPlayer, origin?: { x: number; y: number }): { x: number; y: number } | undefined {
    const layout = this.store.getLayout(player.floorId);
    const floor = this.store.getFloor(player.floorId);
    if (!layout || !floor) {
      return origin;
    }
    const candidates = origin ? [origin] : [];
    const object = layout.objects.find((candidate) => candidate.id === player.seat?.objectId);
    const interaction = object && player.seat ? getPlacedAssetInteraction(object, player.seat.interactionId) : undefined;
    if (interaction) {
      const margin = ASSET_RASTER_SIZE * 2;
      candidates.push(
        { x: interaction.bounds.x - margin, y: interaction.center.y },
        { x: interaction.bounds.x + interaction.bounds.width + margin, y: interaction.center.y },
        { x: interaction.center.x, y: interaction.bounds.y - margin },
        { x: interaction.center.x, y: interaction.bounds.y + interaction.bounds.height + margin },
      );
    }
    candidates.push(floor.spawn);
    return candidates.find((candidate) => canOccupy(
      layout,
      getOutdoorBounds(floor),
      player.userId,
      player.x,
      player.y,
      candidate.x,
      candidate.y,
      13,
      this.getRoomAccessIds(player.userId, layout),
      this.getFullRoomIds(player),
    ));
  }

  private releaseSeatsForObject(objectId: string): void {
    for (const player of this.players.values()) {
      if (player.seat?.objectId === objectId) {
        this.leaveSeat(player.userId);
      }
    }
  }

  private assertNoPlayerOverlap(floorId: string, rects: Rect[], ignoredSeatObjectId?: string): void {
    const overlaps = [...this.players.values()].some(
      (player) => player.connected
        && player.floorId === floorId
        && player.seat?.objectId !== ignoredSeatObjectId
        && rects.some((rect) => pointInRect(player.x, player.y, {
          x: rect.x - 16,
          y: rect.y - 16,
          width: rect.width + 32,
          height: rect.height + 32,
        })),
    );
    if (overlaps) {
      throw new Error("PLAYER_IN_THE_WAY");
    }
  }

  private updateRoomSettings(
    peer: Peer,
    requestId: string,
    baseRevision: number,
    roomId: string,
    settings: RoomSettings,
  ): void {
    if (!this.store.canBuild(peer.userId)) {
      throw new Error("EDIT_FORBIDDEN");
    }
    const currentRoom = this.store.getRoom(roomId);
    const currentLayout = currentRoom ? this.store.getLayout(currentRoom.floorId) : undefined;
    if (!currentLayout) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (currentLayout.revision !== baseRevision) {
      peer.send({ type: "layout.conflict", requestId, revision: currentLayout.revision });
      return;
    }
    const layout = this.store.updateRoomSettings(roomId, settings);
    const room = layout.rooms.find((item) => item.id === roomId);
    this.clearRoomGrants(roomId);
    if (room?.access.mode === "assigned") {
      this.evictRestrictedRoomPlayers(room);
    }
    this.broadcastToFloor(layout.floorId, { type: "room.access_revoked", roomId });
    if (room?.access.mode === "open") {
      for (const activeKnock of this.roomKnocks.values()) {
        if (activeKnock.knock.roomId === roomId) {
          this.finishRoomKnock(activeKnock, "accepted", peer.userId);
        }
      }
    }
    this.validateRoomKnocks();
    this.broadcastLayout(layout, { userId: peer.userId, requestId });
  }

  private evictRestrictedRoomPlayers(room: Room): void {
    for (const player of this.players.values()) {
      if (player.roomId !== room.id || this.userHasRoomAccess(player.userId, room)) {
        continue;
      }
      this.evictPlayerFromRoom(player, room);
    }
  }

  private reconcilePlayerRoomAccess(userId: string): void {
    const player = this.players.get(userId);
    const room = player?.roomId ? this.store.getRoom(player.roomId) : undefined;
    if (player && room && !this.userHasRoomAccess(userId, room)) {
      this.evictPlayerFromRoom(player, room);
    }
  }

  private evictPlayerFromRoom(player: WorldPlayer, room: Room): void {
    this.endKidnappingForUser(player.userId, "access_revoked");
    const floor = this.store.getFloor(room.floorId);
    const layout = this.store.getLayout(room.floorId);
    const doorPositions = layout?.openings
      .filter((opening): opening is Door => opening.type === "door" && room.doorIds.includes(opening.id))
      .map((door) => getRoomDoorPosition(layout, room, door, "outside")) ?? [];
    const destination = layout && floor
      ? doorPositions.find((position) => canOccupy(
        layout,
        getOutdoorBounds(floor),
        player.userId,
        player.x,
        player.y,
        position.x,
        position.y,
        13,
        this.getRoomAccessIds(player.userId, layout),
        this.getFullRoomIds(player),
      )) ?? floor.spawn
      : floor?.spawn;
    if (!destination) {
      return;
    }
    player.x = destination.x;
    player.y = destination.y;
    delete player.roomId;
    const movement = this.movements.get(player.userId);
    if (movement) {
      movement.dx = 0;
      movement.dy = 0;
      movement.path = [];
      delete movement.destinationRequestId;
      delete movement.journey;
      delete movement.approachUserId;
      delete movement.approachRequestId;
      delete movement.kidnappingTargetUserId;
      delete movement.kidnappingRequestId;
      delete movement.assetInteraction;
      this.activeMovementUserIds.delete(player.userId);
    }
    this.removeKnockRecipient(player.userId, room.id);
    this.leaveActiveMeeting(player.userId);
    this.dirty = true;
  }

  private requestRoomKnock(peer: Peer, roomId: string): void {
    const layout = this.store.getLayout(peer.floorId);
    const room = layout?.rooms.find((item) => item.id === roomId);
    const player = this.players.get(peer.userId);
    if (!room || !player) {
      throw new Error("ROOM_NOT_FOUND");
    }
    if (room.access.mode !== "assigned" || this.userHasRoomAccess(peer.userId, room) || player.roomId === room.id) {
      throw new Error("ROOM_ACCESS_NOT_REQUIRED");
    }
    if (!room.access.knockable) {
      throw new Error("ROOM_NOT_KNOCKABLE");
    }
    if (room.doorIds.length === 0) {
      throw new Error("ROOM_NO_DOOR");
    }
    if (this.distanceToRoomDoor(player.x, player.y, room) > KNOCK_RANGE) {
      throw new Error("KNOCK_TOO_FAR");
    }
    if ([...this.roomKnocks.values()].some((activeKnock) => activeKnock.knock.requesterUserId === peer.userId)) {
      throw new Error("KNOCK_ALREADY_PENDING");
    }

    const recipientUserIds = new Set(
      [...this.peers.values()]
        .filter((candidate) => candidate.userId !== peer.userId && candidate.floorId === room.floorId)
        .filter((candidate) => this.players.get(candidate.userId)?.roomId === room.id)
        .map((candidate) => candidate.userId),
    );
    if (recipientUserIds.size === 0) {
      throw new Error("KNOCK_NO_OCCUPANTS");
    }

    const knock: RoomKnock = {
      id: randomUUID(),
      roomId,
      requesterUserId: peer.userId,
      expiresAt: new Date(Date.now() + KNOCK_TIMEOUT_MS).toISOString(),
    };
    const timer = setTimeout(() => {
      const activeKnock = this.roomKnocks.get(knock.id);
      if (activeKnock) {
        this.finishRoomKnock(activeKnock, "expired");
      }
    }, KNOCK_TIMEOUT_MS);
    const activeKnock: ActiveRoomKnock = { knock, recipientUserIds, timer };
    this.roomKnocks.set(knock.id, activeKnock);
    peer.send({ type: "room.knock_state", knock, state: "pending" });
    for (const recipientUserId of recipientUserIds) {
      this.sendToUser(recipientUserId, { type: "room.knock_requested", knock });
    }
  }

  private respondToRoomKnock(peer: Peer, knockId: string, accept: boolean): void {
    const activeKnock = this.roomKnocks.get(knockId);
    const player = this.players.get(peer.userId);
    if (!activeKnock || !activeKnock.recipientUserIds.has(peer.userId) || player?.roomId !== activeKnock.knock.roomId) {
      throw new Error("KNOCK_NOT_FOUND");
    }
    const requester = this.players.get(activeKnock.knock.requesterUserId);
    const room = this.store.getRoom(activeKnock.knock.roomId);
    if (
        !requester?.connected
        || !room
        || requester.floorId !== room.floorId
        || room.access.mode !== "assigned"
        || !room.access.knockable
        || this.distanceToRoomDoor(requester.x, requester.y, room) > KNOCK_RANGE
    ) {
      this.finishRoomKnock(activeKnock, "expired");
      throw new Error("KNOCK_NOT_FOUND");
    }
    if (this.userHasRoomAccess(requester.userId, room)) {
      this.finishRoomKnock(activeKnock, "accepted");
      return;
    }
    if (accept) {
      const grants = this.roomGrants.get(activeKnock.knock.requesterUserId) ?? new Set<string>();
      grants.add(activeKnock.knock.roomId);
      this.roomGrants.set(activeKnock.knock.requesterUserId, grants);
    }
    this.finishRoomKnock(activeKnock, accept ? "accepted" : "declined", peer.userId);
  }

  private finishRoomKnock(activeKnock: ActiveRoomKnock, state: "accepted" | "declined" | "expired", responderUserId?: string): void {
    clearTimeout(activeKnock.timer);
    this.roomKnocks.delete(activeKnock.knock.id);
    const event: ServerEvent = {
      type: "room.knock_state",
      knock: activeKnock.knock,
      state,
      ...(responderUserId ? { responderUserId } : {}),
    };
    this.sendToUser(activeKnock.knock.requesterUserId, event);
    for (const recipientUserId of activeKnock.recipientUserIds) {
      this.sendToUser(recipientUserId, event);
    }
  }

  private handleKnockDisconnect(userId: string): void {
    for (const activeKnock of this.roomKnocks.values()) {
      if (activeKnock.knock.requesterUserId === userId) {
        this.finishRoomKnock(activeKnock, "expired");
        continue;
      }
      activeKnock.recipientUserIds.delete(userId);
      if (activeKnock.recipientUserIds.size === 0) {
        this.finishRoomKnock(activeKnock, "expired");
      }
    }
  }

  private removeKnockRecipient(userId: string, roomId: string): void {
    for (const activeKnock of this.roomKnocks.values()) {
      if (activeKnock.knock.roomId !== roomId || !activeKnock.recipientUserIds.delete(userId)) {
        continue;
      }
      this.sendToUser(userId, {
        type: "room.knock_state",
        knock: activeKnock.knock,
        state: "expired",
      });
      if (activeKnock.recipientUserIds.size === 0) {
        this.finishRoomKnock(activeKnock, "expired");
      }
    }
  }

  private clearRoomGrants(roomId: string): void {
    for (const grants of this.roomGrants.values()) {
      grants.delete(roomId);
    }
  }

  private validateRoomKnocks(): void {
    for (const activeKnock of this.roomKnocks.values()) {
      const requester = this.players.get(activeKnock.knock.requesterUserId);
      const room = this.store.getRoom(activeKnock.knock.roomId);
      if (
        !requester?.connected
        || !room
        || requester.floorId !== room.floorId
        || room.access.mode !== "assigned"
        || !room.access.knockable
        || this.distanceToRoomDoor(requester.x, requester.y, room) > KNOCK_RANGE
      ) {
        this.finishRoomKnock(activeKnock, "expired");
      } else if (this.userHasRoomAccess(requester.userId, room)) {
        this.finishRoomKnock(activeKnock, "accepted");
      }
    }
  }

  private distanceToRoomDoor(x: number, y: number, room: Room): number {
    const layout = this.store.getLayout(room.floorId);
    if (!layout) {
      return Number.POSITIVE_INFINITY;
    }
    const doors = layout.openings.filter((opening): opening is Door => opening.type === "door" && room.doorIds.includes(opening.id));
    return Math.min(...doors.map((door) => {
      const position = getRoomDoorPosition(layout, room, door);
      return Math.hypot(x - position.x, y - position.y);
    }));
  }

  private wave(peer: Peer, targetUserId: string): void {
    const target = this.store.getMember(targetUserId);
    if (!target?.online) {
      throw new Error("PERSON_OFFLINE");
    }
    if (targetUserId === peer.userId) {
      throw new Error("INTERACTION_INVALID");
    }
    if (target.availability === "dnd") {
      throw new Error("PERSON_UNAVAILABLE");
    }
    const player = this.players.get(peer.userId);
    if (!player?.connected) {
      throw new Error("INTERACTION_INVALID");
    }
    const now = Date.now();
    this.enforceReactionCooldown(peer.userId, now);
    const event = { type: "interaction.wave", fromUserId: peer.userId, toUserId: targetUserId, floorId: player.floorId } as const;
    this.sendToUser(targetUserId, event);
    peer.send(event);
    player.wavingUntil = now + 2_000;
    this.registerWave(peer.userId, targetUserId);
  }

  private react(peer: Peer, reaction: ReactionKind): void {
    const player = this.players.get(peer.userId);
    if (!player?.connected) {
      throw new Error("INTERACTION_INVALID");
    }
    const now = Date.now();
    this.enforceReactionCooldown(peer.userId, now);
    const activeMeetingId = this.activeMeetings.get(peer.userId);
    if (activeMeetingId) {
      const event: ServerEvent = {
        type: "interaction.reaction",
        id: randomUUID(),
        userId: peer.userId,
        reaction,
        scope: { type: "meeting", meetingId: activeMeetingId },
      };
      for (const candidate of this.peers.values()) {
        if (this.activeMeetings.get(candidate.userId) === activeMeetingId) {
          candidate.send(event);
        }
      }
    } else {
      this.broadcastToVisiblePlayer(player, {
        type: "interaction.reaction",
        id: randomUUID(),
        userId: peer.userId,
        reaction,
        scope: { type: "floor", floorId: player.floorId },
      });
    }
    if (reaction === "wave") {
      player.wavingUntil = now + 2_000;
      if (!activeMeetingId) {
        this.registerWave(peer.userId);
      }
    }
  }

  private ringGong(peer: Peer, objectId: string): void {
    const player = this.players.get(peer.userId);
    const layout = player ? this.store.getLayout(player.floorId) : undefined;
    const object = layout?.objects.find((candidate) => candidate.id === objectId);
    if (!player?.connected || !object || requireAssetDefinition(object.assetId).kind !== "gong") {
      throw new Error("GONG_NOT_FOUND");
    }
    if (this.activeMeetings.has(peer.userId)) {
      throw new Error("GONG_IN_MEETING");
    }
    if (this.gameRuntime.isPlaying(peer.userId)) {
      throw new Error("GAME_IN_PROGRESS");
    }
    if (this.getDistanceToBounds(player.x, player.y, getPlacedAssetBounds(object)) > GONG_INTERACTION_RANGE) {
      throw new Error("GONG_TOO_FAR");
    }
    const rungAt = Date.now();
    const activeCooldown = this.gongCooldowns.get(object.id) ?? 0;
    if (activeCooldown > rungAt) {
      peer.send({
        type: "interaction.gong_cooldown",
        objectId: object.id,
        floorId: player.floorId,
        cooldownUntil: activeCooldown,
      });
      throw new Error("GONG_COOLDOWN");
    }
    const cooldownUntil = rungAt + GONG_COOLDOWN_MS;
    this.gongCooldowns.set(object.id, cooldownUntil);
    const ringEvent: ServerEvent = {
      type: "interaction.gong_rang",
      ring: {
        id: randomUUID(),
        objectId: object.id,
        userId: peer.userId,
        floorId: player.floorId,
        rungAt,
        cooldownUntil,
      },
    };
    const reactionEvent: ServerEvent = {
      type: "interaction.reaction",
      id: randomUUID(),
      userId: peer.userId,
      reaction: "celebrate",
      scope: { type: "floor", floorId: player.floorId },
    };
    for (const candidate of this.peers.values()) {
      if (candidate.floorId !== player.floorId) {
        continue;
      }
      if (this.activeMeetings.has(candidate.userId)) {
        candidate.send({
          type: "interaction.gong_cooldown",
          objectId: object.id,
          floorId: player.floorId,
          cooldownUntil,
        });
        continue;
      }
      candidate.send(ringEvent);
      candidate.send(reactionEvent);
    }
  }

  private registerWave(userId: string, targetUserId?: string): void {
    const now = Date.now();
    for (const [candidateUserId, wave] of this.recentWaves) {
      if (now - wave.at > HIGH_FIVE_WINDOW_MS) {
        this.recentWaves.delete(candidateUserId);
      }
    }
    const player = this.players.get(userId);
    if (!player || this.activeMeetings.has(userId)) {
      this.clearRecentWavesForUser(userId);
      return;
    }
    const candidate = [...this.recentWaves.entries()]
      .filter(([candidateUserId, wave]) => {
        const candidatePlayer = this.players.get(candidateUserId);
        return candidateUserId !== userId
          && candidatePlayer?.connected
          && !this.activeMeetings.has(candidateUserId)
          && candidatePlayer.floorId === player.floorId
          && candidatePlayer.roomId === player.roomId
          && (!targetUserId || targetUserId === candidateUserId)
          && (!wave.targetUserId || wave.targetUserId === userId)
          && Math.hypot(candidatePlayer.x - player.x, candidatePlayer.y - player.y) <= HIGH_FIVE_RANGE;
      })
      .sort(([leftUserId], [rightUserId]) => {
        const left = this.players.get(leftUserId)!;
        const right = this.players.get(rightUserId)!;
        return Math.hypot(left.x - player.x, left.y - player.y) - Math.hypot(right.x - player.x, right.y - player.y);
      })[0];
    if (!candidate) {
      this.recentWaves.set(userId, { at: now, ...(targetUserId ? { targetUserId } : {}) });
      return;
    }
    this.recentWaves.delete(candidate[0]);
    this.recentWaves.delete(userId);
    this.broadcastToVisiblePlayer(player, {
      type: "interaction.high_five",
      id: randomUUID(),
      userIds: [candidate[0], userId],
      floorId: player.floorId,
    });
  }

  private enforceReactionCooldown(userId: string, now: number): void {
    const previousReactionAt = this.lastReactionAt.get(userId) ?? 0;
    if (now - previousReactionAt < REACTION_COOLDOWN_MS) {
      throw new Error("REACTION_RATE_LIMITED");
    }
    this.lastReactionAt.set(userId, now);
  }

  private clearRecentWavesForUser(userId: string): void {
    for (const [candidateUserId, wave] of this.recentWaves) {
      if (candidateUserId === userId || wave.targetUserId === userId) {
        this.recentWaves.delete(candidateUserId);
      }
    }
  }

  private tryStartWalkUpCall(player: WorldPlayer, movement: MovementState): void {
    const targetUserId = movement.approachUserId;
    if (!targetUserId) {
      return;
    }
    const target = this.players.get(targetUserId);
    if (!target?.connected || target.floorId !== player.floorId) {
      this.cancelApproach(player.userId, movement, "PERSON_OFFLINE");
      return;
    }
    if (this.store.getMember(targetUserId)?.availability === "dnd") {
      this.cancelApproach(player.userId, movement, "PERSON_UNAVAILABLE");
      return;
    }
    if (this.activeMeetings.has(player.userId)) {
      this.cancelApproach(player.userId, movement, "CALLER_IN_MEETING");
      return;
    }
    if (this.activeMeetings.has(targetUserId)) {
      this.cancelApproach(player.userId, movement, "PERSON_IN_MEETING");
      return;
    }
    if (!this.isOnPublicFloor(player) || !this.isOnPublicFloor(target)) {
      this.cancelApproach(player.userId, movement, "CALL_NOT_PUBLIC");
      return;
    }
    if (Math.hypot(player.x - target.x, player.y - target.y) > WALK_UP_CALL_RANGE) {
      if (movement.path.length === 0) {
        const layout = this.store.getLayout(player.floorId);
        const nextPath = layout ? this.findApproachPath(layout, player.userId, player, target) : [];
        if (nextPath.length === 0) {
          this.cancelApproach(player.userId, movement, "DESTINATION_BLOCKED");
          return;
        }
        movement.path = nextPath;
      }
      return;
    }
    const requestId = movement.approachRequestId;
    movement.path = [];
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    try {
      this.startRingingCall(player.userId, targetUserId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "CALL_FAILED";
      this.sendToUser(player.userId, {
        type: "command.error",
        ...(requestId ? { requestId } : {}),
        code,
        message: this.userMessage(code),
      });
    }
  }

  private cancelApproach(userId: string, movement: MovementState, code: string): void {
    const requestId = movement.approachRequestId;
    movement.path = [];
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    delete movement.assetInteraction;
    this.activeMovementUserIds.delete(userId);
    this.sendToUser(userId, {
      type: "command.error",
      ...(requestId ? { requestId } : {}),
      code,
      message: this.userMessage(code),
    });
  }

  private startRingingCall(callerUserId: string, targetUserId: string): void {
    const caller = this.players.get(callerUserId);
    const target = this.players.get(targetUserId);
    if (!caller || !target || !caller.connected || !target.connected || caller.floorId !== target.floorId) {
      throw new Error("PERSON_OFFLINE");
    }
    if (this.activeMeetings.has(callerUserId)) {
      throw new Error("CALLER_IN_MEETING");
    }
    if (this.activeMeetings.has(targetUserId)) {
      throw new Error("PERSON_IN_MEETING");
    }
    if (!this.isOnPublicFloor(caller) || !this.isOnPublicFloor(target)) {
      throw new Error("CALL_NOT_PUBLIC");
    }
    if (this.store.getMember(targetUserId)?.availability === "dnd") {
      throw new Error("PERSON_UNAVAILABLE");
    }
    if (this.userHasActiveCall(callerUserId) || this.userHasActiveCall(targetUserId)) {
      throw new Error("CALL_BUSY");
    }
    const callId = randomUUID();
    const timer = setTimeout(() => {
      const call = this.calls.get(callId);
      if (call) {
        this.finishCall(call, "missed");
      }
    }, CALL_TIMEOUT_MS);
    const call: ActiveCall = {
      id: callId,
      callerUserId,
      targetUserId,
      state: "ringing",
      timer,
    };
    this.calls.set(call.id, call);
    this.sendCallState(call, "ringing");
  }

  private isOnPublicFloor(player: WorldPlayer): boolean {
    const room = player.roomId
      ? this.store.getLayout(player.floorId)?.rooms.find((candidate) => candidate.id === player.roomId)
      : undefined;
    return !room || room.access.mode === "open";
  }

  private userHasActiveCall(userId: string): boolean {
    return [...this.calls.values()].some((call) => call.callerUserId === userId || call.targetUserId === userId);
  }

  private userHasAcceptedCall(userId: string): boolean {
    return [...this.calls.values()].some(
      (call) => call.state === "accepted" && (call.callerUserId === userId || call.targetUserId === userId),
    );
  }

  private requestCall(peer: Peer, targetUserId: string): void {
    const target = this.store.getMember(targetUserId);
    if (!target?.online) {
      throw new Error("PERSON_OFFLINE");
    }
    if (targetUserId === peer.userId) {
      throw new Error("CALL_INVALID");
    }
    if (target.availability === "dnd") {
      throw new Error("PERSON_UNAVAILABLE");
    }
    if (this.activeMeetings.has(peer.userId)) {
      throw new Error("CALLER_IN_MEETING");
    }
    if (this.activeMeetings.has(targetUserId)) {
      throw new Error("PERSON_IN_MEETING");
    }
    const callerPlayer = this.players.get(peer.userId);
    const targetPlayer = this.players.get(targetUserId);
    if (
      !callerPlayer
      || !targetPlayer
      || callerPlayer.floorId !== targetPlayer.floorId
      || Math.hypot(callerPlayer.x - targetPlayer.x, callerPlayer.y - targetPlayer.y) > CALL_RANGE
    ) {
      throw new Error("CALL_OUT_OF_RANGE");
    }
    if (!this.isOnPublicFloor(callerPlayer) || !this.isOnPublicFloor(targetPlayer)) {
      throw new Error("CALL_NOT_PUBLIC");
    }
    if (this.userHasActiveCall(peer.userId) || this.userHasActiveCall(targetUserId)) {
      throw new Error("CALL_BUSY");
    }
    this.startRingingCall(peer.userId, targetUserId);
  }

  private respondToCall(peer: Peer, callId: string, accept: boolean): void {
    const call = this.calls.get(callId);
    if (!call || call.targetUserId !== peer.userId || call.state !== "ringing") {
      throw new Error("CALL_NOT_FOUND");
    }
    if (call.timer) {
      clearTimeout(call.timer);
    }
    if (!accept) {
      this.finishCall(call, "declined");
      return;
    }
    const caller = this.players.get(call.callerUserId);
    const target = this.players.get(call.targetUserId);
    if (
      !caller?.connected
      || !target?.connected
      || caller.floorId !== target.floorId
      || Math.hypot(caller.x - target.x, caller.y - target.y) > CALL_RANGE
      || !this.isOnPublicFloor(caller)
      || !this.isOnPublicFloor(target)
      || this.activeMeetings.has(caller.userId)
      || this.activeMeetings.has(target.userId)
    ) {
      this.finishCall(call, "ended");
      throw new Error("CALL_EXPIRED");
    }
    call.state = "accepted";
    this.sendCallState(call, "accepted");
    this.reconcileProximityCalls();
  }

  private endCall(peer: Peer, callId: string): void {
    const call = this.calls.get(callId);
    if (!call || ![call.callerUserId, call.targetUserId].includes(peer.userId)) {
      throw new Error("CALL_NOT_FOUND");
    }
    this.finishCall(call, "ended");
  }

  private finishCall(call: ActiveCall, state: "ended" | "declined" | "missed"): void {
    if (call.timer) {
      clearTimeout(call.timer);
    }
    this.sendCallState(call, state);
    this.calls.delete(call.id);
    this.reconcileProximityCalls();
  }

  private sendCallState(call: ActiveCall, state: CallState): void {
    this.sendToUser(call.callerUserId, this.callStateEvent(call, call.callerUserId, state));
    this.sendToUser(call.targetUserId, this.callStateEvent(call, call.targetUserId, state));
  }

  private callStateEvent(call: ActiveCall, userId: string, state: CallState): ServerEvent {
    const outgoing = call.callerUserId === userId;
    return {
      type: "call.state",
      callId: call.id,
      peerUserId: outgoing ? call.targetUserId : call.callerUserId,
      direction: outgoing ? "outgoing" : "incoming",
      state,
    };
  }

  private endCallsForUser(userId: string): void {
    for (const call of this.calls.values()) {
      if (call.callerUserId === userId || call.targetUserId === userId) {
        this.finishCall(call, "ended");
      }
    }
  }

  private validateCalls(): void {
    for (const call of this.calls.values()) {
      const caller = this.players.get(call.callerUserId);
      const target = this.players.get(call.targetUserId);
      if (
        !caller?.connected
        || !target?.connected
        || caller.floorId !== target.floorId
        || Math.hypot(caller.x - target.x, caller.y - target.y) > CALL_RANGE
        || !this.isOnPublicFloor(caller)
        || !this.isOnPublicFloor(target)
        || this.activeMeetings.has(caller.userId)
        || this.activeMeetings.has(target.userId)
      ) {
        this.finishCall(call, "ended");
      }
    }
  }

  private joinMeeting(peer: Peer, meetingId: string): void {
    const meeting = this.store.getMeeting(meetingId);
    if (!meeting || meeting.status === "ended") {
      throw new Error("MEETING_NOT_FOUND");
    }
    if (!this.store.canViewMeeting(peer.userId, meeting)) {
      throw new Error("MEETING_NOT_FOUND");
    }
    if (meeting.location.type === "room") {
      const room = this.store.getRoom(meeting.location.roomId);
      const player = this.players.get(peer.userId);
      const hasAccess = room && (this.userHasRoomAccess(peer.userId, room) || player?.roomId === room.id);
      if (!room || !hasAccess) {
        throw new Error("ROOM_ACCESS_REQUIRED");
      }
      if (!meeting.participantIds.includes(peer.userId) && meeting.participantIds.length >= room.capacity) {
        throw new Error("ROOM_FULL");
      }
    }
    this.endKidnappingForUser(peer.userId, "interrupted");
    this.enterMeeting(peer.userId, meeting);
  }

  private leaveMeeting(peer: Peer, meetingId: string): void {
    const active = this.activeMeetings.get(peer.userId);
    if (active === meetingId) {
      this.leaveActiveMeeting(peer.userId);
      return;
    }
    const meeting = this.store.getMeeting(meetingId);
    if (!meeting?.participantIds.includes(peer.userId)) {
      throw new Error("MEETING_NOT_JOINED");
    }
    const left = this.store.leaveMeeting(meetingId, peer.userId);
    peer.send({ type: "meeting.left", meetingId });
    this.broadcastMeetingUpdate(left);
  }

  private enterMeeting(userId: string, meeting: Meeting): void {
    const active = this.activeMeetings.get(userId);
    if (active === meeting.id) {
      this.sendToUser(userId, { type: "meeting.joined", meeting });
      return;
    }
    if (active) {
      this.leaveActiveMeeting(userId);
    }
    this.clearRecentWavesForUser(userId);
    this.endCallsForUser(userId);
    const joined = this.store.joinMeeting(meeting.id, userId);
    this.proximityMedia.delete(userId);
    const player = this.players.get(userId);
    if (player) {
      delete player.proximity;
    }
    this.activeMeetings.set(userId, meeting.id);
    this.reconcileProximityCalls();
    this.sendToUser(userId, { type: "meeting.joined", meeting: joined });
    this.broadcastMeetingUpdate(joined);
  }

  private leaveActiveMeeting(userId: string): void {
    const meetingId = this.activeMeetings.get(userId);
    if (!meetingId) {
      return;
    }
    this.activeMeetings.delete(userId);
    const meeting = this.store.leaveMeeting(meetingId, userId);
    this.reconcileProximityCalls();
    this.sendToUser(userId, { type: "meeting.left", meetingId });
    this.broadcastMeetingUpdate(meeting);
  }

  private startGame(peer: Peer, definitionId: string): void {
    this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
    const started = this.gameRuntime.start(peer.userId, definitionId);
    for (const participantId of started.participantIds) {
      this.stopMovement(participantId);
    }
    this.dispatchGameEvents(started.deliveries);
  }

  private commandGame(peer: Peer, command: TetrisCommand): void {
    const deliveries = this.gameRuntime.command(peer.userId, command);
    this.dispatchGameEvents(deliveries);
    if (deliveries.some((delivery) => delivery.event.type === "game.round_completed")) {
      this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
    }
  }

  private endGame(peer: Peer): void {
    this.dispatchGameEvents(this.gameRuntime.leave(peer.userId));
    this.dispatchGameEvents(this.gameRuntime.syncLobbies(this.players.values(), this.connectedUserIds()));
  }

  private stopMovement(userId: string): void {
    this.endKidnappingForUser(userId, "cancelled");
    this.stopMovementState(userId);
  }

  private stopMovementState(userId: string): void {
    const movement = this.movements.get(userId);
    if (!movement) {
      return;
    }
    movement.dx = 0;
    movement.dy = 0;
    movement.path = [];
    delete movement.controllerPeerId;
    delete movement.destinationRequestId;
    delete movement.journey;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    delete movement.kidnappingTargetUserId;
    delete movement.kidnappingRequestId;
    delete movement.assetInteraction;
    this.activeMovementUserIds.delete(userId);
  }

  private synchronizeMovementActivity(userId: string, movement: MovementState): void {
    if (
      movement.dx !== 0
      || movement.dy !== 0
      || movement.path.length > 0
      || movement.journey
      || movement.approachUserId
      || movement.kidnappingTargetUserId
      || movement.assetInteraction
    ) {
      this.activeMovementUserIds.add(userId);
    } else {
      this.activeMovementUserIds.delete(userId);
    }
  }

  private setPlayer(player: WorldPlayer): void {
    const existing = this.players.get(player.userId);
    if (existing?.connected) {
      removeFromFloorIndex(this.connectedPlayersByFloor, existing.floorId, existing);
    }
    this.players.set(player.userId, player);
    if (player.connected) {
      addToFloorIndex(this.connectedPlayersByFloor, player.floorId, player);
    }
  }

  private setPlayerConnected(player: WorldPlayer, connected: boolean): void {
    if (player.connected === connected) {
      return;
    }
    if (connected) {
      player.connected = true;
      addToFloorIndex(this.connectedPlayersByFloor, player.floorId, player);
    } else {
      removeFromFloorIndex(this.connectedPlayersByFloor, player.floorId, player);
      player.connected = false;
    }
  }

  private movePlayerToFloor(player: WorldPlayer, floorId: string): void {
    if (player.floorId === floorId) {
      return;
    }
    if (player.connected) {
      removeFromFloorIndex(this.connectedPlayersByFloor, player.floorId, player);
    }
    player.floorId = floorId;
    if (player.connected) {
      addToFloorIndex(this.connectedPlayersByFloor, floorId, player);
    }
  }

  private addPeer(peer: Peer): void {
    this.peers.set(peer.id, peer);
    addToFloorIndex(this.peersByFloor, peer.floorId, peer);
  }

  private removePeer(peer: Peer): void {
    this.peers.delete(peer.id);
    removeFromFloorIndex(this.peersByFloor, peer.floorId, peer);
  }

  private movePeerToFloor(peer: Peer, floorId: string): void {
    if (peer.floorId === floorId) {
      return;
    }
    removeFromFloorIndex(this.peersByFloor, peer.floorId, peer);
    peer.floorId = floorId;
    addToFloorIndex(this.peersByFloor, floorId, peer);
  }

  private sendSnapshot(peer: Peer): void {
    peer.send(this.createSnapshot(peer.floorId, this.connectedPlayersByFloor.get(peer.floorId) ?? []));
  }

  private getSnapshotFloorIdsDue(): Set<string> {
    const floorIds = new Set<string>();
    for (const floorId of this.peersByFloor.keys()) {
      if (
        this.dirtySnapshotFloorIds.has(floorId)
        || this.tickNumber - (this.lastSnapshotTickByFloor.get(floorId) ?? 0) >= SNAPSHOT_HEARTBEAT_TICKS
      ) {
        floorIds.add(floorId);
      }
    }
    return floorIds;
  }

  private broadcastSnapshots(floorIds: ReadonlySet<string>): void {
    for (const floorId of floorIds) {
      const snapshot = this.createSnapshot(floorId, this.connectedPlayersByFloor.get(floorId) ?? []);
      for (const peer of this.peersByFloor.get(floorId) ?? []) {
        peer.send(snapshot);
      }
    }
  }

  private createSnapshot(floorId: string, players: Iterable<WorldPlayer>): WorldSnapshot {
    const layoutRevision = this.store.getLayout(floorId)?.revision ?? 0;
    return {
      type: "world.snapshot",
      tick: this.tickNumber,
      floorId,
      layoutRevision,
      players: Array.from(players, cloneWorldPlayer),
    };
  }

  private sendActiveSessionState(peer: Peer, activeMeetingId?: string): void {
    peer.send({
      type: "room.access_snapshot",
      roomIds: [...(this.roomGrants.get(peer.userId) ?? EMPTY_ROOM_GRANTS)],
    });

    const call = [...this.calls.values()].find(
      (candidate) => candidate.callerUserId === peer.userId || candidate.targetUserId === peer.userId,
    );
    if (call) {
      peer.send(this.callStateEvent(call, peer.userId, call.state));
    }

    const activeMeeting = this.activeMeetings.get(peer.userId);
    if (activeMeetingId && activeMeeting === activeMeetingId) {
      const meeting = this.store.getMeeting(activeMeetingId);
      if (meeting) {
        peer.send({ type: "meeting.joined", meeting });
      }
    }

    for (const activeKnock of this.roomKnocks.values()) {
      if (activeKnock.knock.requesterUserId === peer.userId) {
        peer.send({ type: "room.knock_state", knock: activeKnock.knock, state: "pending" });
      } else if (activeKnock.recipientUserIds.has(peer.userId)) {
        peer.send({ type: "room.knock_requested", knock: activeKnock.knock });
      }
    }

    const now = Date.now();
    for (const [objectId, cooldownUntil] of this.gongCooldowns) {
      const object = this.store.getObject(objectId);
      if (!object || cooldownUntil <= now) {
        this.gongCooldowns.delete(objectId);
        continue;
      }
      if (object.floorId === peer.floorId) {
        peer.send({
          type: "interaction.gong_cooldown",
          objectId,
          floorId: object.floorId,
          cooldownUntil,
        });
      }
    }

    for (const event of this.gameRuntime.getSessionEvents(peer.userId)) {
      peer.send(event);
    }
  }

  private dispatchGameEvents(deliveries: GameEventDelivery[]): void {
    for (const delivery of deliveries) {
      if (delivery.scope === "all") {
        this.broadcast(delivery.event);
      } else if (delivery.scope === "floor") {
        this.broadcastToFloor(delivery.floorId, delivery.event);
      } else {
        for (const userId of delivery.userIds) {
          this.sendToUser(userId, delivery.event);
        }
      }
    }
  }

  private connectedUserIds(): Set<string> {
    return new Set([...this.peers.values()].map((peer) => peer.userId));
  }

  private sendToUser(userId: string, event: ServerEvent): void {
    for (const peer of this.peers.values()) {
      if (peer.userId === userId) {
        peer.send(event);
      }
    }
  }

  private publishEconomy(userId: string, requestId?: string, transaction?: CoinTransaction): void {
    this.sendToUser(userId, {
      type: "economy.updated",
      economy: this.store.getPlayerEconomy(userId),
      ...(requestId ? { requestId } : {}),
      ...(transaction ? { transaction } : {}),
    });
  }

  private broadcastToFloor(floorId: string, event: ServerEvent): void {
    for (const peer of this.peersByFloor.get(floorId) ?? []) {
      peer.send(event);
    }
  }

  private broadcastToVisiblePlayer(player: WorldPlayer, event: ServerEvent): void {
    this.broadcastToFloor(player.floorId, event);
  }

  private broadcastLayout(layout: FloorLayout, source?: { userId: string; requestId: string }): void {
    for (const peer of this.peers.values()) {
      const visibleLayout = this.store.getVisibleLayout(layout.floorId, peer.userId);
      if (visibleLayout) {
        peer.send({
          type: "layout.updated",
          layout: visibleLayout,
          ...(source?.userId === peer.userId ? { requestId: source.requestId } : {}),
        });
      }
    }
  }

  private broadcastWorkspaceAccess(): void {
    for (const peer of this.peers.values()) {
      peer.send({ type: "workspace.access_updated", access: this.store.getWorkspaceAccess(peer.userId) });
    }
  }

  private broadcastMeetingUpdate(meeting: Meeting): void {
    for (const peer of this.peers.values()) {
      if (this.store.canViewMeeting(peer.userId, meeting)) {
        peer.send({ type: "meeting.updated", meeting });
      }
    }
  }

  private broadcast(event: ServerEvent): void {
    for (const peer of this.peers.values()) {
      peer.send(event);
    }
  }

  private userMessage(code: string): string {
    const messages: Record<string, string> = {
      DESTINATION_BLOCKED: "That spot is blocked.",
      EDIT_FORBIDDEN: "You cannot edit this office.",
      EDIT_OUT_OF_RANGE: "Place it inside the floor.",
      ASSET_OFF_RASTER: "Place it on the grid.",
      ASSET_OUT_OF_RANGE: "Place it inside the floor.",
      ASSET_BLOCKED: "That space is occupied.",
      ASSET_REQUIRES_SURFACE: "Place it on a supported surface.",
      ASSET_SUPPORT_OCCUPIED: "Remove the items on top first.",
      ASSET_NOT_BUILDABLE: "That asset cannot be placed.",
      ASSET_UNAVAILABLE: "That asset is unavailable.",
      ASSET_NOT_OWNED: "You do not own that asset.",
      ASSET_ALREADY_PLACED: "That asset is already placed.",
      ASSET_OWNERSHIP_INVALID: "That asset could not be verified.",
      ASSET_ROOM_REQUIRED: "Place it inside a room.",
      ASSET_ROOM_FORBIDDEN: "You can only place assets in your assigned rooms.",
      PUBLIC_ASSET_PLACEMENT_DISABLED: "Player assets are not enabled in this room.",
      INSUFFICIENT_COINS: "You do not have enough coins.",
      INVENTORY_FULL: "Your inventory is full.",
      LAYOUT_CAPACITY_REACHED: "Remove something before adding more.",
      DAILY_REWARD_ALREADY_CLAIMED: "You already claimed today's bonus.",
      ECONOMY_REQUEST_CONFLICT: "That purchase request is no longer valid.",
      GAME_SETTINGS_FORBIDDEN: "You cannot change game settings.",
      KIDNAPPING_DISABLED: "Kidnapping is turned off.",
      KIDNAPPING_INVALID: "That player cannot be carried.",
      KIDNAPPING_NOT_ALLOWED: "That player does not allow you to carry them.",
      KIDNAPPING_UNAVAILABLE: "That player cannot be carried right now.",
      KIDNAPPING_BUSY: "One of you is already being carried.",
      KIDNAPPING_CANCELLED: "They moved away.",
      KIDNAPPING_SETTINGS_FORBIDDEN: "You cannot change workspace kidnapping settings.",
      KIDNAPPING_SETTINGS_INVALID: "Choose valid kidnapping settings.",
      ASSET_INTERACTION_INVALID: "That seat is no longer available.",
      SEAT_OCCUPIED: "That seat is occupied.",
      PLAYER_IN_THE_WAY: "Someone is standing there.",
      PERSON_OFFLINE: "They are offline.",
      PERSON_UNAVAILABLE: "They are unavailable.",
      INTERACTION_INVALID: "That interaction is not available.",
      REACTION_RATE_LIMITED: "Give it a moment.",
      GONG_NOT_FOUND: "That gong is no longer available.",
      GONG_TOO_FAR: "Move closer to ring the gong.",
      GONG_COOLDOWN: "The gong is cooling down.",
      GONG_IN_MEETING: "Leave your meeting before ringing the gong.",
      CALL_OUT_OF_RANGE: "Move closer to call.",
      CALL_BUSY: "Someone is already on a call.",
      CALL_NOT_PUBLIC: "Walk-up calls start on the public floor.",
      CALLER_IN_MEETING: "Leave your meeting before calling.",
      PERSON_IN_MEETING: "They are in a meeting.",
      CALL_INVALID: "That call could not be started.",
      MEETING_NOT_FOUND: "That meeting is no longer available.",
      ROOM_ACCESS_NOT_REQUIRED: "This room is open to you.",
      KNOCK_TOO_FAR: "Move closer to knock.",
      KNOCK_ALREADY_PENDING: "You already knocked.",
      KNOCK_NO_OCCUPANTS: "No one is inside.",
      KNOCK_NOT_FOUND: "That request is no longer active.",
      GAME_NOT_STARTED: "Start the game first.",
      GAME_NOT_FOUND: "That game is unavailable.",
      GAME_TOO_FAR: "Gather around the Tetris blocks first.",
      GAME_ALREADY_FINISHED: "Your game is finished.",
      GAME_PAUSE_MULTIPLAYER: "Multiplayer rounds cannot be paused.",
      GAME_IN_PROGRESS: "Leave the game before moving.",
      NOTHING_TO_ERASE: "There is nothing there.",
      SPACE_OCCUPIED: "That space is occupied.",
      OPENING_REQUIRES_WALL: "Place it on a wall.",
      OPENING_TOO_CLOSE_TO_CORNER: "Move it away from the corner.",
      OPENING_AT_WALL_INTERSECTION: "Move it away from the wall junction.",
      WALL_INTERSECTS_OPENING: "A wall cannot cross an opening.",
      WALL_OVERLAP: "That wall overlaps another wall.",
      ROOM_NO_DOOR: "This room has no door.",
      ROOM_NOT_KNOCKABLE: "This room does not accept knocks.",
      ROOM_NOT_PRIVATE_ELIGIBLE: "Add a door before making this room private.",
      ROOM_NOT_FOUND: "That room no longer exists.",
      ROOM_ASSIGNEE_NOT_FOUND: "One of the selected people is no longer available.",
      ROOM_ASSIGNEE_REQUIRED: "Choose at least one person.",
      ROOM_KNOCK_REQUIRES_PRIVATE: "Knocking is only available for assigned rooms.",
      ROOM_ACCESS_REQUIRED: "You cannot join that room.",
      ROOM_FULL: "That room is full.",
      CALL_EXPIRED: "That call is no longer available.",
      CONVERSATION_FORBIDDEN: "You cannot send to that conversation.",
    };
    return messages[code] ?? "That action could not be completed.";
  }
}

function addToFloorIndex<T>(index: Map<string, Set<T>>, floorId: string, value: T): void {
  const entries = index.get(floorId);
  if (entries) {
    entries.add(value);
  } else {
    index.set(floorId, new Set([value]));
  }
}

function removeFromFloorIndex<T>(index: Map<string, Set<T>>, floorId: string, value: T): void {
  const entries = index.get(floorId);
  if (!entries) {
    return;
  }
  entries.delete(value);
  if (entries.size === 0) {
    index.delete(floorId);
  }
}

function cloneWorldPlayer(player: WorldPlayer): WorldPlayer {
  return {
    ...player,
    ...(player.seat ? { seat: { ...player.seat } } : {}),
    ...(player.proximity ? { proximity: { ...player.proximity } } : {}),
  };
}

function getAssetRemovalCandidates(objects: WorldObject[]): WorldObject[] {
  const layerPriority = { ground: 0, floor: 1, surface: 2 } as const;
  return objects
    .map((object, index) => ({ object, index }))
    .sort((left, right) => (
      layerPriority[requireAssetDefinition(right.object.assetId).placement.layer]
      - layerPriority[requireAssetDefinition(left.object.assetId).placement.layer]
      || right.index - left.index
    ))
    .map(({ object }) => object);
}

function getWallSectionRange(
  wall: Wall,
  walls: Wall[],
  x: number,
  y: number,
): { start: number; end: number } {
  const orientation = getWallOrientation(wall);
  const wallLength = getWallLength(wall);
  const positionOffset = orientation === "horizontal" ? x - wall.start.x : y - wall.start.y;
  const intersectionOffsets = [...new Set(walls.flatMap((candidate) => {
    if (candidate.id === wall.id) {
      return [];
    }
    const offset = getPerpendicularIntersectionOffset(wall, candidate);
    return offset !== undefined && offset > 0 && offset < wallLength ? [offset] : [];
  }))].sort((left, right) => left - right);

  let start = 0;
  for (const intersectionOffset of intersectionOffsets) {
    if (positionOffset <= intersectionOffset) {
      return { start, end: intersectionOffset };
    }
    start = intersectionOffset;
  }
  return { start, end: wallLength };
}
