import { randomUUID } from "node:crypto";
import {
  getAreaBoundaryWalls,
  getAreaDoorPosition,
  getAreaDoorRect,
  isEnclosedArea,
  type Area,
  type AreaKnock,
  type AreaSettings,
  type CallState,
  type ChatMessage,
  type ClientCommand,
  type Conversation,
  type FloorLayout,
  type LayoutTool,
  type Member,
  type Meeting,
  type Rect,
  type ReactionKind,
  type ServerEvent,
  type WorldObject,
  type WorldPlayer,
} from "@workhard/shared";
import { FallingBlocksGame } from "../games/falling-blocks.js";
import { DemoStore } from "../store.js";
import { canOccupy, pointInRect } from "./collision.js";
import { findPath } from "./pathfinding.js";

const TICK_MS = 50;
const SPEED_PER_SECOND = 190;
const EDIT_GRID = 32;
const CALL_RANGE = 480;
const WALK_UP_CALL_RANGE = 110;
const CALL_TIMEOUT_MS = 20_000;
const KNOCK_RANGE = 84;
const KNOCK_TIMEOUT_MS = 20_000;
const REACTION_COOLDOWN_MS = 450;
const HIGH_FIVE_RANGE = 96;
const HIGH_FIVE_WINDOW_MS = 4_000;
const EMPTY_AREA_GRANTS: ReadonlySet<string> = new Set();

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
  destinationRequestId?: string;
  approachUserId?: string;
  approachRequestId?: string;
}

interface ActiveCall {
  id: string;
  callerUserId: string;
  targetUserId: string;
  state: "ringing" | "connected";
  timer?: NodeJS.Timeout;
}

interface ActiveAreaKnock {
  knock: AreaKnock;
  recipientUserIds: Set<string>;
  timer: NodeJS.Timeout;
}

interface RecentWave {
  at: number;
  targetUserId?: string;
}

export class WorldRuntime {
  private readonly players = new Map<string, WorldPlayer>();
  private readonly peers = new Map<string, Peer>();
  private readonly movements = new Map<string, MovementState>();
  private readonly movementSequences = new Map<string, number>();
  private readonly games = new Map<string, FallingBlocksGame>();
  private readonly calls = new Map<string, ActiveCall>();
  private readonly areaKnocks = new Map<string, ActiveAreaKnock>();
  private readonly areaGrants = new Map<string, Set<string>>();
  private readonly activeMeetings = new Map<string, { meetingId: string; spatial: boolean }>();
  private readonly meetingSuppressions = new Map<string, string>();
  private readonly lastReactionAt = new Map<string, number>();
  private readonly recentWaves = new Map<string, RecentWave>();
  private timer: NodeJS.Timeout | undefined;
  private tickNumber = 0;
  dirty = false;

  constructor(private readonly store: DemoStore) {
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
      this.players.set(member.id, player);
      this.updateArea(player);
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
    for (const activeKnock of this.areaKnocks.values()) {
      clearTimeout(activeKnock.timer);
    }
    this.areaKnocks.clear();
    this.areaGrants.clear();
    this.movementSequences.clear();
    this.activeMeetings.clear();
    this.meetingSuppressions.clear();
    this.lastReactionAt.clear();
    this.recentWaves.clear();
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
    this.peers.set(peer.id, peer);
    let player = existing;
    if (player) {
      player.floorId = floor.id;
      player.connected = true;
      player.availability = member.availability;
      const layout = this.store.getLayout(floor.id);
      const positionIsSafe = layout && canOccupy(
        layout,
        floor,
        userId,
        floor.spawn.x,
        floor.spawn.y,
        player.x,
        player.y,
        13,
        this.getAreaAccessIds(userId, layout),
        this.getFullAreaIds(player),
      );
      if (!positionIsSafe) {
        player.x = floor.spawn.x;
        player.y = floor.spawn.y;
        delete player.areaId;
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
      this.players.set(userId, player);
    }
    this.updateArea(player);
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
    send({ type: "session.ready", userId, floorId: floor.id });
    this.sendSnapshot(peer);
    const activeMeetingId = this.activeMeetings.get(userId)?.meetingId;
    this.syncSpatialMeeting(this.players.get(userId)!);
    send({ type: "workspace.snapshot", data: this.store.getBootstrap(userId) });
    this.sendActiveSessionState(peer, activeMeetingId);
    return peer.id;
  }

  disconnect(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }
    this.peers.delete(peerId);
    this.movementSequences.delete(peerId);
    const stillConnected = [...this.peers.values()].some((item) => item.userId === peer.userId);
    if (!stillConnected) {
      this.movements.delete(peer.userId);
      const player = this.players.get(peer.userId);
      if (player) {
        player.connected = false;
        delete player.wavingUntil;
      }
      this.broadcast({ type: "presence.changed", member: this.store.updateOnline(peer.userId, false) });
      this.endCallsForUser(peer.userId);
      this.leaveActiveMeeting(peer.userId);
      this.handleKnockDisconnect(peer.userId);
      this.games.delete(peer.userId);
      this.areaGrants.delete(peer.userId);
      this.meetingSuppressions.delete(peer.userId);
      this.lastReactionAt.delete(peer.userId);
      this.clearRecentWavesForUser(peer.userId);
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
          this.handleDestination(peer, command.requestId, command.x, command.y);
          break;
        case "movement.approach_user":
          this.handleApproach(peer, command.targetUserId, command.requestId);
          break;
        case "floor.change":
          this.changeFloor(peer, command.floorId);
          break;
        case "presence.set_availability":
          this.setAvailability(peer, command.availability);
          break;
        case "chat.send":
          this.sendChat(peer, command.requestId, command.conversationId, command.body);
          break;
        case "layout.apply":
          this.applyLayout(peer, command.baseRevision, command.tool, command.x, command.y);
          break;
        case "area.update_settings":
          this.updateAreaSettings(peer, command.areaId, command.settings);
          break;
        case "area.knock":
          this.requestAreaKnock(peer, command.areaId);
          break;
        case "area.knock_respond":
          this.respondToAreaKnock(peer, command.knockId, command.accept);
          break;
        case "interaction.wave":
          this.wave(peer, command.targetUserId);
          break;
        case "interaction.react":
          this.react(peer, command.reaction);
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
          this.startGame(peer);
          break;
        case "game.end":
          this.games.delete(peer.userId);
          break;
        case "game.command":
          this.commandGame(peer, command.command);
          break;
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
    return structuredClone([...this.players.values()]);
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

  publishRoleChange(member: Member): void {
    this.reconcilePlayerAreaAccess(member.id);
    this.validateAreaKnocks();
    this.broadcast({ type: "presence.changed", member });
    this.broadcastWorkspaceAccess();
    for (const layout of this.store.getLayouts()) {
      this.broadcastLayout(layout);
    }
  }

  restorePlayers(players: WorldPlayer[]): void {
    this.areaGrants.clear();
    for (const saved of players) {
      const member = this.store.getMember(saved.userId);
      const floor = this.store.getFloor(saved.floorId);
      if (!member || !floor) {
        continue;
      }
      const layout = this.store.getLayout(saved.floorId);
      const positionIsSafe = layout && canOccupy(
        layout,
        floor,
        saved.userId,
        floor.spawn.x,
        floor.spawn.y,
        saved.x,
        saved.y,
        13,
        this.getAreaAccessIds(saved.userId, layout),
      );
      const player: WorldPlayer = {
        ...saved,
        x: positionIsSafe ? saved.x : floor.spawn.x,
        y: positionIsSafe ? saved.y : floor.spawn.y,
        connected: member.online,
      };
      this.players.set(saved.userId, player);
      this.updateArea(player);
    }
    this.dirty = false;
  }

  markClean(): void {
    this.dirty = false;
  }

  runTickForTest(deltaMs = TICK_MS): void {
    this.tick(deltaMs);
  }

  private tick(deltaMs = TICK_MS): void {
    this.tickNumber += 1;
    for (const [userId, movement] of this.movements) {
      const player = this.players.get(userId);
      if (!player?.connected) {
        continue;
      }
      this.advancePlayer(player, movement, deltaMs / 1_000);
      this.tryStartWalkUpCall(player, movement);
      this.syncSpatialMeeting(player);
    }
    this.validateAreaKnocks();
    this.validateCalls();

    for (const [userId, game] of this.games) {
      game.update(deltaMs);
      if (game.consumeChanged()) {
        this.sendToUser(userId, game.state);
      }
      if (game.completed) {
        const score = this.store.addScore({
          definitionId: "game-stack",
          userId,
          ...game.result,
        });
        this.sendToUser(userId, { type: "game.completed", score });
        this.games.delete(userId);
      }
    }

    if (this.tickNumber % 2 === 0) {
      for (const peer of this.peers.values()) {
        this.sendSnapshot(peer);
      }
    }
  }

  private advancePlayer(player: WorldPlayer, movement: MovementState, deltaSeconds: number): void {
    let dx = movement.dx;
    let dy = movement.dy;
    let pathTarget: { x: number; y: number } | undefined;
    let distance = SPEED_PER_SECOND * deltaSeconds;
    if (dx !== 0 || dy !== 0) {
      movement.path = [];
      delete movement.destinationRequestId;
      delete movement.approachUserId;
      delete movement.approachRequestId;
      const magnitude = Math.hypot(dx, dy);
      dx /= magnitude;
      dy /= magnitude;
    } else if (movement.path.length > 0) {
      pathTarget = movement.path[0];
      if (!pathTarget) {
        return;
      }
      const distanceX = pathTarget.x - player.x;
      const distanceY = pathTarget.y - player.y;
      const distanceToTarget = Math.hypot(distanceX, distanceY);
      distance = Math.min(distance, distanceToTarget);
      dx = distanceX / distanceToTarget;
      dy = distanceY / distanceToTarget;
    } else {
      return;
    }

    const layout = this.store.getLayout(player.floorId);
    const floor = this.store.getFloor(player.floorId);
    if (!layout || !floor) {
      return;
    }
    const nextX = player.x + dx * distance;
    const nextY = player.y + dy * distance;
    const areaAccessIds = this.getAreaAccessIds(player.userId, layout);
    const fullAreaIds = this.getFullAreaIds(player);
    const previousX = player.x;
    const previousY = player.y;
    if (canOccupy(layout, floor, player.userId, player.x, player.y, nextX, player.y, 13, areaAccessIds, fullAreaIds)) {
      player.x = nextX;
    }
    if (canOccupy(layout, floor, player.userId, player.x, player.y, player.x, nextY, 13, areaAccessIds, fullAreaIds)) {
      player.y = nextY;
    }
    const moved = player.x !== previousX || player.y !== previousY;
    if (pathTarget && Math.hypot(player.x - pathTarget.x, player.y - pathTarget.y) < 0.01) {
      movement.path.shift();
      if (movement.path.length === 0) {
        delete movement.destinationRequestId;
      }
    } else if (pathTarget && !moved) {
      this.cancelDestination(player.userId, movement);
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      player.facing = dx > 0 ? "right" : "left";
    } else {
      player.facing = dy > 0 ? "down" : "up";
    }
    if (moved) {
      this.updateArea(player);
      this.dirty = true;
    }
  }

  private getFullAreaIds(player: WorldPlayer): ReadonlySet<string> {
    const layout = this.store.getLayout(player.floorId);
    if (!layout) {
      return EMPTY_AREA_GRANTS;
    }
    const occupancy = new Map<string, number>();
    for (const candidate of this.players.values()) {
      if (!candidate.connected || candidate.userId === player.userId || candidate.floorId !== player.floorId || !candidate.areaId) {
        continue;
      }
      occupancy.set(candidate.areaId, (occupancy.get(candidate.areaId) ?? 0) + 1);
    }
    return new Set(layout.areas.filter((area) => (occupancy.get(area.id) ?? 0) >= area.capacity).map((area) => area.id));
  }

  private getAreaAccessIds(userId: string, layout: FloorLayout): ReadonlySet<string> {
    const accessibleAreaIds = layout.areas
      .filter((area) => this.userHasAreaAccess(userId, area))
      .map((area) => area.id);
    return accessibleAreaIds.length === 0 ? EMPTY_AREA_GRANTS : new Set(accessibleAreaIds);
  }

  private userHasAreaAccess(userId: string, area: Area): boolean {
    return Boolean(area.memberIds?.includes(userId))
      || Boolean(this.areaGrants.get(userId)?.has(area.id))
      || (area.visibility === "members" && this.store.canEdit(userId));
  }

  private cancelDestination(userId: string, movement: MovementState): void {
    if (movement.approachUserId) {
      this.cancelApproach(userId, movement, "DESTINATION_BLOCKED");
      return;
    }
    const requestId = movement.destinationRequestId;
    movement.path = [];
    delete movement.destinationRequestId;
    if (requestId) {
      this.sendToUser(userId, {
        type: "command.error",
        requestId,
        code: "DESTINATION_BLOCKED",
        message: this.userMessage("DESTINATION_BLOCKED"),
      });
    }
  }

  private updateArea(player: WorldPlayer): void {
    const previousAreaId = player.areaId;
    const layout = this.store.getLayout(player.floorId);
    const area = layout?.areas.find((item) => pointInRect(player.x, player.y, item));
    if (area) {
      player.areaId = area.id;
    } else {
      delete player.areaId;
    }
    if (previousAreaId && previousAreaId !== player.areaId) {
      this.removeKnockRecipient(player.userId, previousAreaId);
    }
  }

  private handleMovement(peer: Peer, sequence: number, dx: number, dy: number): void {
    const movement = this.movements.get(peer.userId);
    const previousSequence = this.movementSequences.get(peer.id);
    if (!movement || previousSequence === undefined || sequence <= previousSequence) {
      return;
    }
    this.movementSequences.set(peer.id, sequence);
    movement.dx = dx;
    movement.dy = dy;
    movement.path = [];
    delete movement.destinationRequestId;
    delete movement.approachUserId;
    delete movement.approachRequestId;
  }

  private handleDestination(peer: Peer, requestId: string, x: number, y: number): void {
    if (Math.abs(x) > 100_000 || Math.abs(y) > 100_000) {
      throw new Error("DESTINATION_INVALID");
    }
    const player = this.players.get(peer.userId);
    const movement = this.movements.get(peer.userId);
    const layout = player ? this.store.getLayout(player.floorId) : undefined;
    const floor = player ? this.store.getFloor(player.floorId) : undefined;
    if (!player || !movement || !layout || !floor) {
      throw new Error("WORLD_NOT_READY");
    }
    movement.dx = 0;
    movement.dy = 0;
    movement.destinationRequestId = requestId;
    delete movement.approachUserId;
    delete movement.approachRequestId;
    movement.path = findPath(
      layout,
      floor,
      peer.userId,
      player,
      { x, y },
      this.getAreaAccessIds(peer.userId, layout),
      this.getFullAreaIds(player),
    );
    if (movement.path.length === 0) {
      delete movement.destinationRequestId;
      throw new Error("DESTINATION_BLOCKED");
    }
  }

  private handleApproach(peer: Peer, targetUserId: string, requestId: string): void {
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
    if (!this.isOnPublicFloor(player) || !this.isOnPublicFloor(target)) {
      throw new Error("CALL_NOT_PUBLIC");
    }
    if (this.store.getMember(targetUserId)?.availability === "dnd") {
      throw new Error("PERSON_UNAVAILABLE");
    }
    movement.dx = 0;
    movement.dy = 0;
    delete movement.destinationRequestId;
    movement.path = this.findApproachPath(layout, peer.userId, player, target);
    if (movement.path.length === 0 && Math.hypot(player.x - target.x, player.y - target.y) > WALK_UP_CALL_RANGE) {
      throw new Error("DESTINATION_BLOCKED");
    }
    movement.approachUserId = targetUserId;
    movement.approachRequestId = requestId;
    this.tryStartWalkUpCall(player, movement);
  }

  private findApproachPath(layout: FloorLayout, userId: string, player: WorldPlayer, target: WorldPlayer): { x: number; y: number }[] {
    const floor = this.store.getFloor(player.floorId);
    if (!floor) {
      return [];
    }
    const areaAccessIds = this.getAreaAccessIds(userId, layout);
    const candidates = [{ x: target.x, y: target.y }];
    for (let index = 0; index < 16; index += 1) {
      const angle = index * Math.PI / 8;
      candidates.push({
        x: target.x + Math.cos(angle) * 96,
        y: target.y + Math.sin(angle) * 96,
      });
    }
    let shortestPath: { x: number; y: number }[] = [];
    for (const candidate of candidates) {
      const path = findPath(layout, floor, userId, player, candidate, areaAccessIds, this.getFullAreaIds(player));
      if (path.length > 0 && (shortestPath.length === 0 || path.length < shortestPath.length)) {
        shortestPath = path;
      }
    }
    return shortestPath;
  }

  private changeFloor(peer: Peer, floorId: string): void {
    const floor = this.store.getFloor(floorId);
    const player = this.players.get(peer.userId);
    if (!floor || !player) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    this.endCallsForUser(peer.userId);
    this.leaveActiveMeeting(peer.userId);
    this.handleKnockDisconnect(peer.userId);
    this.areaGrants.delete(peer.userId);
    this.meetingSuppressions.delete(peer.userId);
    this.clearRecentWavesForUser(peer.userId);
    player.floorId = floorId;
    player.x = floor.spawn.x;
    player.y = floor.spawn.y;
    delete player.areaId;
    delete player.wavingUntil;
    const movement = this.movements.get(peer.userId);
    if (movement) {
      movement.path = [];
      movement.dx = 0;
      movement.dy = 0;
      delete movement.destinationRequestId;
      delete movement.approachUserId;
      delete movement.approachRequestId;
    }
    const member = this.store.updateMemberLocation(peer.userId, floorId);
    this.broadcast({ type: "presence.changed", member });
    for (const candidate of this.peers.values()) {
      if (candidate.userId !== peer.userId) {
        continue;
      }
      candidate.floorId = floorId;
      candidate.send({ type: "session.ready", userId: peer.userId, floorId });
      this.sendSnapshot(candidate);
    }
    this.dirty = true;
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
      for (const call of [...this.calls.values()]) {
        if (call.state === "ringing" && call.targetUserId === peer.userId) {
          this.finishCall(call, "declined");
        }
      }
    }
  }

  private sendChat(peer: Peer, requestId: string, conversationId: string, body: string): void {
    const message = this.store.addMessage(conversationId, peer.userId, body);
    this.publishChatMessage(message);
    peer.send({ type: "chat.ack", requestId, messageId: message.id });
  }

  private applyLayout(peer: Peer, baseRevision: number, tool: LayoutTool, rawX: number, rawY: number): void {
    if (!this.store.canEdit(peer.userId)) {
      throw new Error("EDIT_FORBIDDEN");
    }
    const layout = this.store.getLayout(peer.floorId);
    const floor = this.store.getFloor(peer.floorId);
    if (!layout || !floor) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    if (layout.revision !== baseRevision) {
      peer.send({ type: "layout.conflict", revision: layout.revision });
      return;
    }
    const x = Math.round(rawX / EDIT_GRID) * EDIT_GRID;
    const y = Math.round(rawY / EDIT_GRID) * EDIT_GRID;
    if (Math.abs(x) > 100_000 || Math.abs(y) > 100_000) {
      throw new Error("EDIT_OUT_OF_RANGE");
    }

    const next = structuredClone(layout);
    if (tool === "erase") {
      const beforeCount = next.walls.length + next.objects.length + next.areas.reduce((count, area) => count + area.doors.length, 0);
      next.walls = next.walls.filter((wall) => !pointInRect(x, y, wall));
      next.objects = next.objects.filter((object) => !pointInRect(x, y, object));
      for (const area of next.areas) {
        area.doors = area.doors.filter((door) => !pointInRect(x, y, getAreaDoorRect(area, door, EDIT_GRID)));
      }
      const afterCount = next.walls.length + next.objects.length + next.areas.reduce((count, area) => count + area.doors.length, 0);
      if (beforeCount === afterCount) {
        throw new Error("NOTHING_TO_ERASE");
      }
    } else if (tool === "door") {
      this.addAreaDoor(next, x, y);
    } else if (tool === "wall") {
      this.assertNoPlayerOverlap(peer.floorId, x, y, EDIT_GRID, EDIT_GRID);
      this.assertPlacement(next, floor.width, floor.height, { x, y, width: EDIT_GRID, height: EDIT_GRID });
      next.walls.push({ id: randomUUID(), x, y, width: EDIT_GRID, height: EDIT_GRID });
    } else {
      const object = this.createObject(peer.floorId, tool, x, y);
      this.assertNoPlayerOverlap(peer.floorId, object.x, object.y, object.width, object.height);
      this.assertPlacement(next, floor.width, floor.height, object);
      next.objects.push(object);
    }
    if (next.areas.some((area) => isEnclosedArea(area) && area.doors.length === 0)) {
      throw new Error("ROOM_REQUIRES_DOOR");
    }
    next.revision += 1;
    const saved = this.store.replaceLayout(next);
    this.broadcastLayout(saved);
  }

  private addAreaDoor(layout: FloorLayout, x: number, y: number): void {
    const candidates = layout.areas.filter(isEnclosedArea).flatMap((area) => ([
      { area, side: "top" as const, distance: Math.abs(y - area.y), coordinate: x - area.x, length: area.width },
      { area, side: "right" as const, distance: Math.abs(x - area.x - area.width), coordinate: y - area.y, length: area.height },
      { area, side: "bottom" as const, distance: Math.abs(y - area.y - area.height), coordinate: x - area.x, length: area.width },
      { area, side: "left" as const, distance: Math.abs(x - area.x), coordinate: y - area.y, length: area.height },
    ])).filter((candidate) => candidate.coordinate >= 0 && candidate.coordinate <= candidate.length)
      .sort((left, right) => left.distance - right.distance);
    const candidate = candidates[0];
    if (!candidate || candidate.distance > EDIT_GRID) {
      throw new Error("DOOR_REQUIRES_ROOM_WALL");
    }
    const width = EDIT_GRID * 2;
    const offset = Math.round((candidate.coordinate - width / 2) / EDIT_GRID) * EDIT_GRID;
    if (offset < EDIT_GRID || offset + width > candidate.length - EDIT_GRID) {
      throw new Error("DOOR_TOO_CLOSE_TO_CORNER");
    }
    const overlaps = candidate.area.doors.some(
      (door) => door.side === candidate.side && offset < door.offset + door.width && offset + width > door.offset,
    );
    if (overlaps) {
      throw new Error("DOOR_ALREADY_EXISTS");
    }
    const door = { id: randomUUID(), side: candidate.side, offset, width };
    const clearance = getAreaDoorRect(candidate.area, door, EDIT_GRID * 2);
    if ([...layout.walls, ...layout.objects.filter((object) => object.solid)].some((collider) => rectanglesOverlap(clearance, collider))) {
      throw new Error("SPACE_OCCUPIED");
    }
    candidate.area.doors.push(door);
  }

  private assertPlacement(layout: FloorLayout, floorWidth: number, floorHeight: number, rect: Rect): void {
    if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > floorWidth || rect.y + rect.height > floorHeight) {
      throw new Error("EDIT_OUT_OF_RANGE");
    }
    const colliders: Rect[] = [
      ...layout.walls,
      ...layout.objects.filter((object) => object.solid),
      ...layout.areas.filter(isEnclosedArea).flatMap((area) => getAreaBoundaryWalls(area)),
      ...layout.areas.filter(isEnclosedArea).flatMap((area) => area.doors.map((door) => getAreaDoorRect(area, door, EDIT_GRID * 2))),
    ];
    if (colliders.some((collider) => rectanglesOverlap(rect, collider))) {
      throw new Error("SPACE_OCCUPIED");
    }
  }

  private createObject(floorId: string, tool: Exclude<LayoutTool, "wall" | "door" | "erase">, x: number, y: number): WorldObject {
    const variants = {
      desk: { width: 64, height: 32, color: "#6c9b83" },
      sofa: { width: 64, height: 32, color: "#df8f72" },
      plant: { width: 32, height: 32, color: "#4e8b68" },
    };
    return {
      id: randomUUID(),
      floorId,
      type: tool,
      x,
      y,
      ...variants[tool],
      solid: true,
      interactive: tool === "desk",
    };
  }

  private assertNoPlayerOverlap(floorId: string, x: number, y: number, width: number, height: number): void {
    const overlaps = [...this.players.values()].some(
      (player) => player.connected && player.floorId === floorId && pointInRect(player.x, player.y, { x: x - 16, y: y - 16, width: width + 32, height: height + 32 }),
    );
    if (overlaps) {
      throw new Error("PLAYER_IN_THE_WAY");
    }
  }

  private updateAreaSettings(peer: Peer, areaId: string, settings: AreaSettings): void {
    if (!this.store.canEdit(peer.userId)) {
      throw new Error("EDIT_FORBIDDEN");
    }
    const layout = this.store.updateAreaSettings(areaId, settings);
    const area = layout.areas.find((item) => item.id === areaId);
    this.clearAreaGrants(areaId);
    if (area?.visibility === "members") {
      this.evictHiddenAreaPlayers(area);
    }
    this.broadcastToFloor(layout.floorId, { type: "area.access_revoked", areaId });
    if (area && !area.locked) {
      for (const activeKnock of [...this.areaKnocks.values()]) {
        if (activeKnock.knock.areaId === areaId) {
          this.finishAreaKnock(activeKnock, "accepted", peer.userId);
        }
      }
    }
    this.validateAreaKnocks();
    this.broadcastLayout(layout);
    this.broadcastWorkspaceAccess();
  }

  private evictHiddenAreaPlayers(area: Area): void {
    for (const player of this.players.values()) {
      if (player.areaId !== area.id || this.store.canViewArea(player.userId, area)) {
        continue;
      }
      this.evictPlayerFromArea(player, area);
    }
    for (const [userId, active] of [...this.activeMeetings]) {
      const meeting = this.store.getMeeting(active.meetingId);
      if (
        meeting?.location.type === "room"
        && meeting.location.areaId === area.id
        && !this.store.canViewMeeting(userId, meeting)
      ) {
        this.leaveActiveMeeting(userId);
      }
    }
  }

  private reconcilePlayerAreaAccess(userId: string): void {
    const player = this.players.get(userId);
    const area = player?.areaId ? this.store.getArea(player.areaId) : undefined;
    if (player && area && !this.store.canViewArea(userId, area)) {
      this.evictPlayerFromArea(player, area);
    }
    const active = this.activeMeetings.get(userId);
    const meeting = active ? this.store.getMeeting(active.meetingId) : undefined;
    if (meeting && !this.store.canViewMeeting(userId, meeting)) {
      this.leaveActiveMeeting(userId);
    }
  }

  private evictPlayerFromArea(player: WorldPlayer, area: Area): void {
    const floor = this.store.getFloor(area.floorId);
    const door = area.doors[0];
    const destination = door ? getAreaDoorPosition(area, door, "outside") : floor?.spawn;
    if (!destination) {
      return;
    }
    player.x = destination.x;
    player.y = destination.y;
    delete player.areaId;
    const movement = this.movements.get(player.userId);
    if (movement) {
      movement.dx = 0;
      movement.dy = 0;
      movement.path = [];
      delete movement.destinationRequestId;
      delete movement.approachUserId;
      delete movement.approachRequestId;
    }
    this.removeKnockRecipient(player.userId, area.id);
    this.leaveActiveMeeting(player.userId);
    this.dirty = true;
  }

  private requestAreaKnock(peer: Peer, areaId: string): void {
    const layout = this.store.getLayout(peer.floorId);
    const area = layout?.areas.find((item) => item.id === areaId);
    const player = this.players.get(peer.userId);
    if (!area || !player) {
      throw new Error("AREA_NOT_FOUND");
    }
    if (!this.store.canViewArea(peer.userId, area)) {
      throw new Error("AREA_NOT_FOUND");
    }
    if (!area.locked || this.userHasAreaAccess(peer.userId, area) || player.areaId === area.id) {
      throw new Error("AREA_ACCESS_NOT_REQUIRED");
    }
    if (area.doors.length === 0) {
      throw new Error("ROOM_NO_DOOR");
    }
    if (this.distanceToAreaDoor(player.x, player.y, area) > KNOCK_RANGE) {
      throw new Error("KNOCK_TOO_FAR");
    }
    if ([...this.areaKnocks.values()].some((activeKnock) => activeKnock.knock.requesterUserId === peer.userId)) {
      throw new Error("KNOCK_ALREADY_PENDING");
    }

    const recipientUserIds = new Set(
      [...this.peers.values()]
        .filter((candidate) => candidate.userId !== peer.userId && candidate.floorId === area.floorId)
        .filter((candidate) => this.players.get(candidate.userId)?.areaId === area.id)
        .map((candidate) => candidate.userId),
    );
    if (recipientUserIds.size === 0) {
      throw new Error("KNOCK_NO_OCCUPANTS");
    }

    const knock: AreaKnock = {
      id: randomUUID(),
      areaId,
      requesterUserId: peer.userId,
      expiresAt: new Date(Date.now() + KNOCK_TIMEOUT_MS).toISOString(),
    };
    const timer = setTimeout(() => {
      const activeKnock = this.areaKnocks.get(knock.id);
      if (activeKnock) {
        this.finishAreaKnock(activeKnock, "expired");
      }
    }, KNOCK_TIMEOUT_MS);
    const activeKnock: ActiveAreaKnock = { knock, recipientUserIds, timer };
    this.areaKnocks.set(knock.id, activeKnock);
    peer.send({ type: "area.knock_state", knock, state: "pending" });
    for (const recipientUserId of recipientUserIds) {
      this.sendToUser(recipientUserId, { type: "area.knock_requested", knock });
    }
  }

  private respondToAreaKnock(peer: Peer, knockId: string, accept: boolean): void {
    const activeKnock = this.areaKnocks.get(knockId);
    const player = this.players.get(peer.userId);
    if (!activeKnock || !activeKnock.recipientUserIds.has(peer.userId) || player?.areaId !== activeKnock.knock.areaId) {
      throw new Error("KNOCK_NOT_FOUND");
    }
    const requester = this.players.get(activeKnock.knock.requesterUserId);
    const area = this.store.getArea(activeKnock.knock.areaId);
    if (
      !requester?.connected
      || !area
      || requester.floorId !== area.floorId
      || !this.store.canViewArea(requester.userId, area)
      || this.distanceToAreaDoor(requester.x, requester.y, area) > KNOCK_RANGE
    ) {
      this.finishAreaKnock(activeKnock, "expired");
      throw new Error("KNOCK_NOT_FOUND");
    }
    if (!area.locked || this.userHasAreaAccess(requester.userId, area)) {
      this.finishAreaKnock(activeKnock, "accepted");
      return;
    }
    if (accept) {
      const grants = this.areaGrants.get(activeKnock.knock.requesterUserId) ?? new Set<string>();
      grants.add(activeKnock.knock.areaId);
      this.areaGrants.set(activeKnock.knock.requesterUserId, grants);
    }
    this.finishAreaKnock(activeKnock, accept ? "accepted" : "declined", peer.userId);
  }

  private finishAreaKnock(activeKnock: ActiveAreaKnock, state: "accepted" | "declined" | "expired", responderUserId?: string): void {
    clearTimeout(activeKnock.timer);
    this.areaKnocks.delete(activeKnock.knock.id);
    const event: ServerEvent = {
      type: "area.knock_state",
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
    for (const activeKnock of [...this.areaKnocks.values()]) {
      if (activeKnock.knock.requesterUserId === userId) {
        this.finishAreaKnock(activeKnock, "expired");
        continue;
      }
      activeKnock.recipientUserIds.delete(userId);
      if (activeKnock.recipientUserIds.size === 0) {
        this.finishAreaKnock(activeKnock, "expired");
      }
    }
  }

  private removeKnockRecipient(userId: string, areaId: string): void {
    for (const activeKnock of [...this.areaKnocks.values()]) {
      if (activeKnock.knock.areaId !== areaId || !activeKnock.recipientUserIds.delete(userId)) {
        continue;
      }
      this.sendToUser(userId, {
        type: "area.knock_state",
        knock: activeKnock.knock,
        state: "expired",
      });
      if (activeKnock.recipientUserIds.size === 0) {
        this.finishAreaKnock(activeKnock, "expired");
      }
    }
  }

  private clearAreaGrants(areaId: string): void {
    for (const grants of this.areaGrants.values()) {
      grants.delete(areaId);
    }
  }

  private validateAreaKnocks(): void {
    for (const activeKnock of [...this.areaKnocks.values()]) {
      const requester = this.players.get(activeKnock.knock.requesterUserId);
      const area = this.store.getArea(activeKnock.knock.areaId);
      if (
        !requester?.connected
        || !area
        || requester.floorId !== area.floorId
        || !this.store.canViewArea(requester.userId, area)
        || this.distanceToAreaDoor(requester.x, requester.y, area) > KNOCK_RANGE
      ) {
        this.finishAreaKnock(activeKnock, "expired");
      } else if (!area.locked || this.userHasAreaAccess(requester.userId, area)) {
        this.finishAreaKnock(activeKnock, "accepted");
      }
    }
  }

  private distanceToAreaDoor(x: number, y: number, area: Area): number {
    return Math.min(...area.doors.map((door) => {
      const position = getAreaDoorPosition(area, door);
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
    const activeMeeting = this.activeMeetings.get(peer.userId);
    if (activeMeeting) {
      const event: ServerEvent = {
        type: "interaction.reaction",
        id: randomUUID(),
        userId: peer.userId,
        reaction,
        scope: { type: "meeting", meetingId: activeMeeting.meetingId },
      };
      for (const candidate of this.peers.values()) {
        if (this.activeMeetings.get(candidate.userId)?.meetingId === activeMeeting.meetingId) {
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
      if (!activeMeeting) {
        this.registerWave(peer.userId);
      }
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
          && candidatePlayer.areaId === player.areaId
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
    delete movement.approachUserId;
    delete movement.approachRequestId;
    try {
      this.startConnectedCall(player.userId, targetUserId);
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
    delete movement.approachUserId;
    delete movement.approachRequestId;
    this.sendToUser(userId, {
      type: "command.error",
      ...(requestId ? { requestId } : {}),
      code,
      message: this.userMessage(code),
    });
  }

  private startConnectedCall(callerUserId: string, targetUserId: string): void {
    const caller = this.players.get(callerUserId);
    const target = this.players.get(targetUserId);
    if (!caller || !target || !caller.connected || !target.connected || caller.floorId !== target.floorId) {
      throw new Error("PERSON_OFFLINE");
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
    const call: ActiveCall = {
      id: randomUUID(),
      callerUserId,
      targetUserId,
      state: "connected",
    };
    this.calls.set(call.id, call);
    this.sendCallState(call, "connected");
  }

  private isOnPublicFloor(player: WorldPlayer): boolean {
    if (this.getMeetingAtPosition(player)) {
      return false;
    }
    const area = player.areaId
      ? this.store.getLayout(player.floorId)?.areas.find((candidate) => candidate.id === player.areaId)
      : undefined;
    return !area || (!area.locked && area.type !== "meeting" && area.type !== "private");
  }

  private userHasActiveCall(userId: string): boolean {
    return [...this.calls.values()].some((call) => call.callerUserId === userId || call.targetUserId === userId);
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
    const callId = randomUUID();
    const timer = setTimeout(() => {
      const call = this.calls.get(callId);
      if (call) {
        this.finishCall(call, "missed");
      }
    }, CALL_TIMEOUT_MS);
    const call: ActiveCall = {
      id: callId,
      callerUserId: peer.userId,
      targetUserId,
      state: "ringing",
      timer,
    };
    this.calls.set(callId, call);
    this.sendCallState(call, "ringing");
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
    ) {
      this.finishCall(call, "ended");
      throw new Error("CALL_EXPIRED");
    }
    call.state = "connected";
    this.sendCallState(call, "connected");
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
    for (const call of [...this.calls.values()]) {
      if (call.callerUserId === userId || call.targetUserId === userId) {
        this.finishCall(call, "ended");
      }
    }
  }

  private validateCalls(): void {
    for (const call of [...this.calls.values()]) {
      const caller = this.players.get(call.callerUserId);
      const target = this.players.get(call.targetUserId);
      if (
        !caller?.connected
        || !target?.connected
        || caller.floorId !== target.floorId
        || Math.hypot(caller.x - target.x, caller.y - target.y) > CALL_RANGE
        || !this.isOnPublicFloor(caller)
        || !this.isOnPublicFloor(target)
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
      const area = this.store.getArea(meeting.location.areaId);
      const player = this.players.get(peer.userId);
      const hasAccess = area && (!area.locked || this.userHasAreaAccess(peer.userId, area) || player?.areaId === area.id);
      if (!area || !hasAccess) {
        throw new Error("ROOM_ACCESS_REQUIRED");
      }
      if (!meeting.participantIds.includes(peer.userId) && meeting.participantIds.length >= area.capacity) {
        throw new Error("AREA_FULL");
      }
    }
    this.enterMeeting(peer.userId, meeting, false);
  }

  private leaveMeeting(peer: Peer, meetingId: string): void {
    const active = this.activeMeetings.get(peer.userId);
    if (active?.meetingId === meetingId) {
      this.leaveActiveMeeting(peer.userId, true);
      return;
    }
    const meeting = this.store.getMeeting(meetingId);
    if (!meeting?.participantIds.includes(peer.userId)) {
      throw new Error("MEETING_NOT_JOINED");
    }
    this.suppressMeetingReentryIfInside(peer.userId, meeting);
    const left = this.store.leaveMeeting(meetingId, peer.userId);
    peer.send({ type: "meeting.left", meetingId });
    this.broadcastMeetingUpdate(left);
  }

  private syncSpatialMeeting(player: WorldPlayer): void {
    if (!player.connected) {
      return;
    }
    const meetingAtPosition = this.getMeetingAtPosition(player);
    const suppressedMeetingId = this.meetingSuppressions.get(player.userId);
    if (suppressedMeetingId && meetingAtPosition?.id !== suppressedMeetingId) {
      this.meetingSuppressions.delete(player.userId);
    }

    const active = this.activeMeetings.get(player.userId);
    if (active) {
      if (!active.spatial) {
        return;
      }
      const activeMeeting = this.store.getMeeting(active.meetingId);
      if (activeMeeting && this.isInsideMeeting(player, activeMeeting)) {
        return;
      }
      this.leaveActiveMeeting(player.userId);
    }

    if (meetingAtPosition && this.meetingSuppressions.get(player.userId) !== meetingAtPosition.id) {
      this.enterMeeting(player.userId, meetingAtPosition, true);
    }
  }

  private getMeetingAtPosition(player: WorldPlayer): Meeting | undefined {
    return this.store.getMeetings().find(
      (meeting) => meeting.status === "live"
        && this.store.canViewMeeting(player.userId, meeting)
        && this.isInsideMeeting(player, meeting),
    );
  }

  private isInsideMeeting(player: WorldPlayer, meeting: Meeting): boolean {
    if (meeting.location.type === "room") {
      return player.areaId === meeting.location.areaId;
    }
    return player.floorId === meeting.location.floorId
      && Math.hypot(player.x - meeting.location.x, player.y - meeting.location.y) <= meeting.location.radius;
  }

  private enterMeeting(userId: string, meeting: Meeting, spatial: boolean): void {
    const active = this.activeMeetings.get(userId);
    if (active?.meetingId === meeting.id) {
      return;
    }
    if (active) {
      this.leaveActiveMeeting(userId);
    }
    this.clearRecentWavesForUser(userId);
    this.endCallsForUser(userId);
    if (this.meetingSuppressions.get(userId) === meeting.id) {
      this.meetingSuppressions.delete(userId);
    }
    const joined = this.store.joinMeeting(meeting.id, userId);
    this.activeMeetings.set(userId, { meetingId: meeting.id, spatial });
    this.sendToUser(userId, { type: "meeting.joined", meeting: joined });
    this.broadcastMeetingUpdate(joined);
  }

  private leaveActiveMeeting(userId: string, suppressSpatialReentry = false): void {
    const active = this.activeMeetings.get(userId);
    if (!active) {
      return;
    }
    this.activeMeetings.delete(userId);
    const activeMeeting = this.store.getMeeting(active.meetingId);
    if (suppressSpatialReentry && activeMeeting) {
      this.suppressMeetingReentryIfInside(userId, activeMeeting);
    }
    const meeting = this.store.leaveMeeting(active.meetingId, userId);
    this.sendToUser(userId, { type: "meeting.left", meetingId: active.meetingId });
    this.broadcastMeetingUpdate(meeting);
  }

  private suppressMeetingReentryIfInside(userId: string, meeting: Meeting): void {
    const player = this.players.get(userId);
    if (player && this.isInsideMeeting(player, meeting)) {
      this.meetingSuppressions.set(userId, meeting.id);
    }
  }

  private startGame(peer: Peer): void {
    const game = new FallingBlocksGame();
    this.games.set(peer.userId, game);
    peer.send(game.state);
  }

  private commandGame(peer: Peer, command: Parameters<FallingBlocksGame["command"]>[0]): void {
    const game = this.games.get(peer.userId);
    if (!game) {
      throw new Error("GAME_NOT_STARTED");
    }
    game.command(command);
    if (game.consumeChanged()) {
      this.sendToUser(peer.userId, game.state);
    }
  }

  private sendSnapshot(peer: Peer): void {
    const layoutRevision = this.store.getLayout(peer.floorId)?.revision ?? 0;
    const players = [...this.players.values()].filter((player) => {
      if (player.floorId !== peer.floorId || !player.connected) {
        return false;
      }
      const area = player.areaId ? this.store.getArea(player.areaId) : undefined;
      return !area || this.store.canViewArea(peer.userId, area);
    });
    peer.send({
      type: "world.snapshot",
      tick: this.tickNumber,
      floorId: peer.floorId,
      layoutRevision,
      players: structuredClone(players),
    });
  }

  private sendActiveSessionState(peer: Peer, activeMeetingId?: string): void {
    peer.send({
      type: "area.access_snapshot",
      areaIds: [...(this.areaGrants.get(peer.userId) ?? EMPTY_AREA_GRANTS)],
    });

    const call = [...this.calls.values()].find(
      (candidate) => candidate.callerUserId === peer.userId || candidate.targetUserId === peer.userId,
    );
    if (call) {
      peer.send(this.callStateEvent(call, peer.userId, call.state));
    }

    const activeMeeting = this.activeMeetings.get(peer.userId);
    if (activeMeetingId && activeMeeting?.meetingId === activeMeetingId) {
      const meeting = this.store.getMeeting(activeMeetingId);
      if (meeting) {
        peer.send({ type: "meeting.joined", meeting });
      }
    }

    for (const activeKnock of this.areaKnocks.values()) {
      if (activeKnock.knock.requesterUserId === peer.userId) {
        peer.send({ type: "area.knock_state", knock: activeKnock.knock, state: "pending" });
      } else if (activeKnock.recipientUserIds.has(peer.userId)) {
        peer.send({ type: "area.knock_requested", knock: activeKnock.knock });
      }
    }

    const game = this.games.get(peer.userId);
    if (game) {
      peer.send(game.state);
    }
  }

  private sendToUser(userId: string, event: ServerEvent): void {
    for (const peer of this.peers.values()) {
      if (peer.userId === userId) {
        peer.send(event);
      }
    }
  }

  private broadcastToFloor(floorId: string, event: ServerEvent): void {
    for (const peer of this.peers.values()) {
      if (peer.floorId === floorId) {
        peer.send(event);
      }
    }
  }

  private broadcastToVisiblePlayer(player: WorldPlayer, event: ServerEvent): void {
    const area = player.areaId ? this.store.getArea(player.areaId) : undefined;
    for (const peer of this.peers.values()) {
      if (peer.floorId === player.floorId && (!area || this.store.canViewArea(peer.userId, area))) {
        peer.send(event);
      }
    }
  }

  private broadcastLayout(layout: FloorLayout): void {
    for (const peer of this.peers.values()) {
      const visibleLayout = this.store.getVisibleLayout(layout.floorId, peer.userId);
      if (visibleLayout) {
        peer.send({ type: "layout.updated", layout: visibleLayout });
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
      PLAYER_IN_THE_WAY: "Someone is standing there.",
      PERSON_OFFLINE: "They are offline.",
      PERSON_UNAVAILABLE: "They are unavailable.",
      INTERACTION_INVALID: "That interaction is not available.",
      REACTION_RATE_LIMITED: "Give it a moment.",
      CALL_OUT_OF_RANGE: "Move closer to call.",
      CALL_BUSY: "Someone is already on a call.",
      CALL_NOT_PUBLIC: "Walk-up calls start on the public floor.",
      CALL_INVALID: "That call could not be started.",
      MEETING_NOT_FOUND: "That meeting is no longer available.",
      AREA_ACCESS_NOT_REQUIRED: "This room is open to you.",
      KNOCK_TOO_FAR: "Move closer to knock.",
      KNOCK_ALREADY_PENDING: "You already knocked.",
      KNOCK_NO_OCCUPANTS: "No one is inside.",
      KNOCK_NOT_FOUND: "That request is no longer active.",
      GAME_NOT_STARTED: "Start the game first.",
      NOTHING_TO_ERASE: "There is nothing there.",
      SPACE_OCCUPIED: "That space is occupied.",
      DOOR_REQUIRES_ROOM_WALL: "Place the door on a room wall.",
      DOOR_TOO_CLOSE_TO_CORNER: "Move the door away from the corner.",
      DOOR_ALREADY_EXISTS: "There is already a door there.",
      ROOM_NO_DOOR: "This room has no door.",
      ROOM_REQUIRES_DOOR: "Rooms need at least one door.",
      ROOM_ACCESS_REQUIRED: "You cannot join that room.",
      AREA_FULL: "That room is full.",
      CALL_EXPIRED: "That call is no longer available.",
      CONVERSATION_FORBIDDEN: "You cannot send to that conversation.",
    };
    return messages[code] ?? "That action could not be completed.";
  }
}

function rectanglesOverlap(left: Rect, right: Rect): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}
