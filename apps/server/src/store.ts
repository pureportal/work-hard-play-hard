import { assertPublicReachability } from "./world/public-reachability.js";
import { applyOrganisationEdit, validateOrganisation, validateRoomPermission } from "./organisation/organisation-store.js";
import { gameSettingsSchema } from "./organisation/organisation-schema.js";
import { PublicEconomyStore, validatePublicEconomy, type PublicEconomyState } from "./economy/public-economy-store.js";
import { canEditRoomPermissions, validatePersonalSpaces, type OrganisationEdit, type OrganisationState } from "@workhard/shared";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  BOT_DIFFICULTIES,
  CHESS_ACCESS_MODES,
  CHESS_COLORS,
  CHESS_DEFINITION_ID,
  CHESS_MATCH_RESULTS,
  CHESS_PIECE_TYPES,
  CHESS_PROMOTION_PIECES,
  CHESS_TIME_CONTROLS,
  DEFAULT_PLAYER_KIDNAPPING_SETTINGS,
  GAME_BOT_USER_ID,
  FALLING_BLOCKS_DEFINITION_ID,
  KIDNAPPING_POLICY_MODES,
  MAX_LAYOUT_OBJECTS_PER_FLOOR,
  MAX_LAYOUT_OPENINGS_PER_FLOOR,
  MAX_LAYOUT_ROOMS_PER_FLOOR,
  MAX_LAYOUT_WALLS_PER_FLOOR,
  getAssetDefinition,
  getAssetVariants,
  getEmailDomain,
  DEFAULT_CORPORATE_IDENTITY,
  hasMemberPermission,
  isValidEmailDomain,
  kidnappingPolicyAllows,
  normalizeEmailDomain,
  permissionsForMemberRole,
  randomCharacterAppearance,
} from "@workhard/shared";
import type {
  AuthUser,
  BootstrapData,
  ChatAttachment,
  ChatMessage,
  CharacterAppearance,
  ChessMatchRecord,
  Conversation,
  CorporateIdentity,
  CorporateIdentitySettings,
  Floor,
  FloorLayout,
  GameScore,
  FallingBlocksSpecialCounts,
  GlobalKidnappingSettings,
  Invitation,
  Meeting,
  Member,
  MemberRole,
  Room,
  RoomSettings,
  MiniGameDefinition,
  PlayerGameStatistics,
  PlayerKidnappingSettings,
  RegistrationSettings,
  SpotifyAppSettings,
  WorldObject,
  WorkspaceAccessData,
} from "@workhard/shared";
import { createInitialData } from "./initial-data.js";
import type { GitHubAppSettingsRecord } from "./github/github-record.js";
import { addFallingBlocksStatistics, validFallingBlocksCounts } from "./games/falling-blocks-statistics.js";
import { workObjectStateSchema } from "./work/work-object-state.js";
import { synchronizeRoomMeetings } from "./meetings/room-meetings.js";
import {
  EconomyStore,
  type EconomyOperationResult,
  type EconomyPersistenceState,
  type GameRewardResult,
} from "./economy/economy-store.js";

export interface MutableStoreState {
  organisation: OrganisationState;
  members: Member[];
  floors: Floor[];
  layouts: FloorLayout[];
  conversations: Conversation[];
  messages: ChatMessage[];
  invitations: Invitation[];
  meetings: Meeting[];
  scores: GameScore[];
  gameStatistics: PlayerGameStatistics[];
  chessMatches: ChessMatchRecord[];
  economy: EconomyPersistenceState;
  publicEconomy: PublicEconomyState;
  kidnapping: KidnappingPersistenceState;
  registrationSettings: RegistrationSettings;
  corporateIdentity: CorporateIdentitySettings;
  spotifyAppSettings: SpotifyAppSettings | null;
  githubAppSettings: GitHubAppSettingsRecord | null;
}

export interface KidnappingPersistenceState {
  global: GlobalKidnappingSettings;
  players: Array<{ userId: string; settings: PlayerKidnappingSettings }>;
}

export interface LayoutReplacement {
  layout: FloorLayout;
  economyUserIds: string[];
}

interface GameRoundScoreInput {
  userId: string;
  score: number;
  lines: number;
  level: number;
  order: number;
  won: boolean;
  fallingBlocks?: FallingBlocksSpecialCounts;
}

export interface IssuedInvitation {
  invitation: Invitation;
  token: string;
  supersededInvitationIds: string[];
}

export interface AcceptedInvitation {
  invitation: Invitation;
  member: Member;
}

const DEFAULT_REGISTRATION_SETTINGS: RegistrationSettings = {
  enabled: true,
  invitationRequired: true,
  whitelistedDomains: [],
  defaultRole: "member",
};

export class WorkspaceStore {
  private data: BootstrapData;
  private messageSequenceByConversation: Map<string, number>;
  private readonly economy: EconomyStore;
  readonly publicEconomy: PublicEconomyStore;
  private globalKidnappingSettings: GlobalKidnappingSettings;
  private readonly playerKidnappingSettings = new Map<string, PlayerKidnappingSettings>();
  private registrationSettings = structuredClone(DEFAULT_REGISTRATION_SETTINGS);
  private spotifyAppSettings: SpotifyAppSettings | null = null;
  private githubAppSettings: GitHubAppSettingsRecord | null = null;
  private corporateIdentity = structuredClone(DEFAULT_CORPORATE_IDENTITY);
  private chessMatches: ChessMatchRecord[] = [];
  dirty = false;

  constructor(initialData: BootstrapData = createInitialData()) {
    this.data = structuredClone(initialData);
    this.publicEconomy = new PublicEconomyStore(initialData.publicEconomy);
    for (const layout of this.data.layouts) {
      assertLayoutIntegrity(layout);
    }
    this.messageSequenceByConversation = indexMessageSequences(this.data.messages);
    this.economy = new EconomyStore(this.data.members.map((member) => member.id));
    this.economy.updateGameSettings(initialData.gameSettings);
    this.globalKidnappingSettings = structuredClone(initialData.kidnapping.global);
    validateCorporateIdentity(initialData.corporateIdentity);
    this.corporateIdentity = structuredClone(initialData.corporateIdentity);
    for (const member of this.data.members) {
      this.playerKidnappingSettings.set(member.id, structuredClone(DEFAULT_PLAYER_KIDNAPPING_SETTINGS));
    }
    if (initialData.currentUserId && this.playerKidnappingSettings.has(initialData.currentUserId)) {
      this.playerKidnappingSettings.set(initialData.currentUserId, structuredClone(initialData.kidnapping.player));
    }
    validateKidnappingSettings(
      {
        global: this.globalKidnappingSettings,
        players: [...this.playerKidnappingSettings].map(([userId, settings]) => ({ userId, settings })),
      },
      this.data.members,
    );
  }

  getBootstrap(currentUserId: string): BootstrapData {
    const currentMember = this.getMember(currentUserId);
    if (!currentMember) {
      throw new Error("USER_NOT_FOUND");
    }
    const layouts = this.data.layouts.map((layout) => this.getVisibleLayout(layout.floorId, currentUserId)!);
    const access = this.getWorkspaceAccess(currentUserId);
    return structuredClone({
      ...this.data,
      currentUserId,
      layouts,
      economy: this.economy.getPlayerEconomy(currentUserId),
      publicEconomy: this.getPublicEconomy(),
      gameSettings: this.economy.getGameSettings(),
      kidnapping: {
        global: this.getGlobalKidnappingSettings(),
        player: this.getPlayerKidnappingSettings(currentUserId),
      },
      corporateIdentity: this.getCorporateIdentity(),
      ...(this.canManageGlobalSettings(currentUserId) ? { registrationSettings: this.getRegistrationSettings() } : {}),
      ...access,
    });
  }

  getWorkspaceAccess(userId: string): WorkspaceAccessData {
    const meetings = this.data.meetings.filter((meeting) => this.canViewMeeting(userId, meeting));
    const conversations = this.data.conversations.filter((conversation) => this.canAccessConversation(userId, conversation.id));
    const conversationIds = new Set(conversations.map((conversation) => conversation.id));
    return structuredClone({
      meetings,
      conversations,
      messages: this.data.messages.filter((message) => conversationIds.has(message.conversationId)),
      invitations: this.data.invitations.filter((invitation) => this.canInviteWithRole(userId, invitation.role)),
    });
  }

  getMember(userId: string): Member | undefined {
    return this.data.members.find((member) => member.id === userId);
  }

  getFloor(floorId: string) {
    return this.data.floors.find((floor) => floor.id === floorId);
  }

  getFloors(): Floor[] {
    return this.data.floors;
  }

  addFloor(floor: Floor, layout: FloorLayout): void {
    if (this.getFloor(floor.id) || layout.floorId !== floor.id
      || this.data.floors.some((candidate) => candidate.officeId === floor.officeId && candidate.level === floor.level)) throw new Error("FLOOR_INVALID");
    assertLayoutIntegrity(layout);
    assertPublicReachability(floor, layout, this.getGameSettings());
    this.data.floors.push(structuredClone(floor));
    this.data.layouts.push(structuredClone(layout));
    this.dirty = true;
  }

  updateFloorSpawn(floorId: string, spawn: Floor["spawn"]): Floor {
    const floor = this.getFloor(floorId);
    if (!floor) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    assertPublicReachability({ ...floor, spawn }, this.getLayout(floorId)!, this.getGameSettings());
    floor.spawn = structuredClone(spawn);
    this.dirty = true;
    return structuredClone(floor);
  }

  getLayout(floorId: string): FloorLayout | undefined {
    return this.data.layouts.find((layout) => layout.floorId === floorId);
  }

  getLayouts(): FloorLayout[] {
    return this.data.layouts;
  }

  getVisibleLayout(floorId: string, userId: string): FloorLayout | undefined {
    const layout = this.getLayout(floorId);
    if (!layout || !this.getMember(userId)) {
      return undefined;
    }
    return structuredClone(layout);
  }

  getRoom(roomId: string): Room | undefined {
    return this.data.layouts.flatMap((layout) => layout.rooms).find((room) => room.id === roomId);
  }

  getObject(objectId: string): WorldObject | undefined {
    return this.data.layouts.flatMap((layout) => layout.objects).find((object) => object.id === objectId);
  }

  getMiniGame(definitionId: string): MiniGameDefinition | undefined {
    return this.data.miniGames.find((definition) => definition.id === definitionId);
  }

  getGameObjects(definitionId: string): WorldObject[] {
    const definition = this.getMiniGame(definitionId);
    return definition ? this.data.layouts.flatMap((layout) =>
      layout.objects.filter((object) => object.assetId === definition.assetId),
    ) : [];
  }

  getMeeting(meetingId: string): Meeting | undefined {
    return this.data.meetings.find((meeting) => meeting.id === meetingId);
  }

  getOrganisation(): OrganisationState {
    return this.data.organisation;
  }

  editOrganisation(actorId: string, baseRevision: number, edit: OrganisationEdit, approved = false): OrganisationState {
    if (!approved) throw new Error("PROJECT_APPROVAL_REQUIRED");
    this.data.organisation = this.previewOrganisationEdit(actorId, baseRevision, edit);
    this.dirty = true;
    return this.getOrganisation();
  }

  previewOrganisationEdit(actorId: string, baseRevision: number, edit: OrganisationEdit): OrganisationState {
    if (edit.type === "unit.delete") {
      const unitId = edit.unitId;
      if (this.publicEconomy.view().funds.some((fund) => fund.unitId === unitId)) throw new Error("ORGANISATION_UNIT_IN_USE");
      const permissions = [this.getGameSettings().roomAccess, this.getGameSettings().roomBuild,
        ...this.data.layouts.flatMap((layout) => layout.rooms.flatMap((room) => [room.access, ...(room.build ? [room.build] : [])]))];
      if (permissions.some((permission) => permission.unitGrants?.some((grant) => grant.unitId === unitId))
        || this.data.layouts.some((layout) => layout.rooms.some((room) => room.organisationUnitId === unitId))) throw new Error("ORGANISATION_UNIT_IN_USE");
    }
    return applyOrganisationEdit(this.data.organisation, this.data.members.map((member) => member.id), actorId, baseRevision, edit);
  }

  canManageRoom(userId: string, roomId: string): boolean {
    const room = this.getRoom(roomId);
    const member = this.getMember(userId);
    return Boolean(room && member && canEditRoomPermissions(room, userId, this.data.organisation));
  }

  getMembers(): Member[] {
    return this.data.members;
  }

  hasTeam(teamId: string): boolean {
    return this.data.team.id === teamId;
  }

  needsSetup(): boolean {
    return this.data.members.length === 0;
  }

  canManageGlobalSettings(userId: string): boolean {
    return this.canManageMembers(userId);
  }

  getRegistrationSettings(): RegistrationSettings {
    return structuredClone(this.registrationSettings);
  }

  getSpotifyAppSettings(): SpotifyAppSettings | null {
    return structuredClone(this.spotifyAppSettings);
  }

  updateSpotifyAppSettings(settings: SpotifyAppSettings | null): void {
    this.spotifyAppSettings = structuredClone(settings);
    this.dirty = true;
  }

  getGitHubAppSettings(): GitHubAppSettingsRecord | null {
    return structuredClone(this.githubAppSettings);
  }

  updateGitHubAppSettings(settings: GitHubAppSettingsRecord | null): void {
    this.githubAppSettings = structuredClone(settings);
    this.dirty = true;
  }

  getCorporateIdentity(): CorporateIdentity {
    return structuredClone(this.corporateIdentity);
  }

  updateCorporateIdentity(settings: CorporateIdentitySettings): CorporateIdentity {
    const normalized = normalizeCorporateIdentity({
      ...settings,
      ...(this.corporateIdentity.logoUrl ? { logoUrl: this.corporateIdentity.logoUrl } : {}),
    });
    validateCorporateIdentity(normalized);
    this.corporateIdentity = normalized;
    this.dirty = true;
    return this.getCorporateIdentity();
  }

  updateCorporateIdentityLogo(logoUrl: string | undefined, markDirty = true): CorporateIdentity {
    this.corporateIdentity = {
      ...this.corporateIdentity,
      ...(logoUrl ? { logoUrl } : {}),
    };
    if (!logoUrl) {
      delete this.corporateIdentity.logoUrl;
    }
    if (markDirty) {
      this.dirty = true;
    }
    return this.getCorporateIdentity();
  }

  updateRegistrationSettings(settings: RegistrationSettings): RegistrationSettings {
    const normalized = {
      ...settings,
      whitelistedDomains: settings.whitelistedDomains.map(normalizeEmailDomain),
    };
    validateRegistrationSettings(normalized);
    this.registrationSettings = structuredClone(normalized);
    this.dirty = true;
    return this.getRegistrationSettings();
  }

  assertRegistrationAllowed(email: string, invitationProvided: boolean): void {
    if (this.needsSetup()) {
      return;
    }
    if (!this.registrationSettings.enabled) {
      throw new Error("REGISTRATION_DISABLED");
    }
    if (
      this.registrationSettings.invitationRequired
      && !invitationProvided
      && !this.registrationSettings.whitelistedDomains.includes(getEmailDomain(email))
    ) {
      throw new Error("INVITATION_REQUIRED");
    }
  }

  addRegisteredMember(user: AuthUser): Member {
    this.assertRegistrationAllowed(user.email, false);
    return this.createMember(user, this.registrationSettings.defaultRole);
  }

  addInitialMember(user: AuthUser): Member {
    if (!this.needsSetup()) {
      throw new Error("REGISTRATION_CLOSED");
    }
    return this.createMember(user, "owner");
  }

  addMember(
    user: AuthUser,
    role: Exclude<MemberRole, "owner"> = "member",
  ): Member {
    return this.createMember(user, role);
  }

  private createMember(
    user: AuthUser,
    role: MemberRole,
  ): Member {
    if (this.getMember(user.id)) {
      throw new Error("USER_EXISTS");
    }
    const floor = this.data.floors[0]!;
    const member: Member = {
      id: user.id,
      name: user.username,
      initials: user.username.slice(0, 2).toUpperCase(),
      character: randomCharacterAppearance(),
      email: user.email,
      title: "",
      role,
      permissions: permissionsForMemberRole(role),
      color: memberColors[this.data.members.length % memberColors.length]!,
      availability: "available",
      online: false,
      floorId: floor.id,
      position: structuredClone(floor.spawn),
    };
    this.data.members.push(member);
    this.data.organisation.revision += 1;
    this.economy.createAccount(member.id);
    this.playerKidnappingSettings.set(member.id, structuredClone(DEFAULT_PLAYER_KIDNAPPING_SETTINGS));
    this.dirty = true;
    return structuredClone(member);
  }

  removeMember(userId: string): void {
    if (this.data.organisation.ceoIds.includes(userId)) throw new Error("CEO_VOTE_REQUIRED");
    this.data.organisation.assignments = this.data.organisation.assignments.filter((person) => person.userId !== userId);
    this.data.organisation.revision += 1;
    for (const layout of this.data.layouts) {
      const next = structuredClone(layout);
      next.objects = next.objects.filter((object) => object.ownerUserId !== userId);
      let changed = next.objects.length !== layout.objects.length;
      for (const room of next.rooms) {
        if (room.ownerUserId === userId) { delete room.ownerUserId; changed = true; }
        if (room.personalAreas?.some((area) => area.ownerUserId === userId)) {
          room.personalAreas = room.personalAreas.filter((area) => area.ownerUserId !== userId);
          changed = true;
        }
        const assignedPersonIds = room.access.assignedPersonIds.filter((personId) => personId !== userId);
        if (assignedPersonIds.length !== room.access.assignedPersonIds.length) {
          changed = true;
        }
        room.access.assignedPersonIds = assignedPersonIds;
        if (room.build?.assignedPersonIds.includes(userId)) {
          room.build.assignedPersonIds = room.build.assignedPersonIds.filter((id) => id !== userId);
          changed = true;
        }
      }
      if (changed) {
        next.revision += 1;
        this.replaceLayout(next);
      }
    }
    this.data.members = this.data.members.filter((member) => member.id !== userId);
    const defaults = this.getGameSettings();
    for (const permission of [defaults.roomAccess, defaults.roomBuild]) {
      permission.assignedPersonIds = permission.assignedPersonIds.filter((id) => id !== userId);
    }
    this.updateGameSettings(defaults);
    const removedConversationIds = new Set(
      this.data.conversations
        .filter((conversation) => conversation.type === "direct" && conversation.participantIds?.includes(userId))
        .map((conversation) => conversation.id),
    );
    this.data.conversations = this.data.conversations.filter((conversation) => !removedConversationIds.has(conversation.id));
    this.data.messages = this.data.messages.filter((message) => !removedConversationIds.has(message.conversationId));
    this.chessMatches = this.chessMatches.filter((match) => (
      match.whiteUserId !== userId
      && match.blackUserId !== userId
      && match.reservedBlackUserId !== userId
    ));
    this.economy.removeAccount(userId);
    this.playerKidnappingSettings.delete(userId);
    this.globalKidnappingSettings.targetPolicy.userIds = this.globalKidnappingSettings.targetPolicy.userIds.filter((id) => id !== userId);
    for (const settings of this.playerKidnappingSettings.values()) {
      settings.carrierPolicy.userIds = settings.carrierPolicy.userIds.filter((id) => id !== userId);
    }
    this.dirty = true;
  }

  getMeetings(): Meeting[] {
    return this.data.meetings;
  }

  canViewMeeting(userId: string, meeting: Meeting): boolean {
    if (!this.getMember(userId)) {
      return false;
    }
    return Boolean(this.getRoom(meeting.location.roomId));
  }

  canAccessConversation(userId: string, conversationId: string): boolean {
    const conversation = this.data.conversations.find((item) => item.id === conversationId);
    if (!conversation || !this.getMember(userId)) {
      return false;
    }
    if (conversation.type === "team") {
      return true;
    }
    if (conversation.type === "direct") {
      return Boolean(conversation.participantIds?.includes(userId));
    }
    if (conversation.type === "room") {
      return Boolean(conversation.roomId && this.getRoom(conversation.roomId));
    }
    const meeting = conversation.meetingId ? this.getMeeting(conversation.meetingId) : undefined;
    return Boolean(meeting && meeting.participantIds.includes(userId) && this.canViewMeeting(userId, meeting));
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.data.conversations.find((conversation) => conversation.id === conversationId);
  }

  getOrCreateDirectConversation(userId: string, targetUserId: string): { conversation: Conversation; created: boolean } {
    if (userId === targetUserId) {
      throw new Error("DIRECT_CONVERSATION_SELF");
    }
    if (!this.getMember(userId) || !this.getMember(targetUserId)) {
      throw new Error("USER_NOT_FOUND");
    }
    const existing = this.data.conversations.find((conversation) =>
      conversation.type === "direct"
      && conversation.participantIds?.length === 2
      && conversation.participantIds.includes(userId)
      && conversation.participantIds.includes(targetUserId),
    );
    if (existing) {
      return { conversation: structuredClone(existing), created: false };
    }
    const conversation: Conversation = {
      id: randomUUID(),
      name: "Direct message",
      type: "direct",
      participantIds: [userId, targetUserId],
      unread: 0,
    };
    this.data.conversations.push(conversation);
    this.dirty = true;
    return { conversation: structuredClone(conversation), created: true };
  }

  getScores(): GameScore[] {
    return this.data.scores;
  }

  getGameStatistics(): PlayerGameStatistics[] {
    return this.data.gameStatistics;
  }

  getChessMatches(): ChessMatchRecord[] {
    return structuredClone(this.chessMatches);
  }

  saveChessMatch(match: ChessMatchRecord): void {
    const existingIndex = this.chessMatches.findIndex((candidate) => candidate.id === match.id);
    if (existingIndex === -1) {
      this.chessMatches.push(structuredClone(match));
    } else {
      this.chessMatches[existingIndex] = structuredClone(match);
    }
    this.dirty = true;
  }

  removeChessMatch(matchId: string): void {
    const next = this.chessMatches.filter((match) => match.id !== matchId);
    if (next.length === this.chessMatches.length) {
      throw new Error("CHESS_MATCH_NOT_FOUND");
    }
    this.chessMatches = next;
    this.dirty = true;
  }

  canManageMembers(userId: string): boolean {
    const member = this.getMember(userId);
    return Boolean(member && hasMemberPermission(member, "manage_members"));
  }

  canInviteWithRole(userId: string, role: Exclude<MemberRole, "owner">): boolean {
    const member = this.getMember(userId);
    return Boolean(member && this.canManageMembers(userId) && (member.role === "owner" || role !== "admin"));
  }

  canIssueInvitation(userId: string, email: string, role: Exclude<MemberRole, "owner">): boolean {
    if (!this.canInviteWithRole(userId, role)) {
      return false;
    }
    const normalizedEmail = normalizeEmail(email);
    return !this.data.invitations.some((invitation) =>
      invitation.email === normalizedEmail
      && invitation.status === "pending"
      && !this.canInviteWithRole(userId, invitation.role),
    );
  }

  getInvitation(invitationId: string): Invitation | undefined {
    const invitation = this.data.invitations.find((item) => item.id === invitationId);
    return invitation ? structuredClone(invitation) : undefined;
  }

  canChangeMemberAccess(
    actorId: string,
    memberId: string,
    role: Exclude<MemberRole, "owner">,
  ): boolean {
    const actor = this.getMember(actorId);
    const member = this.getMember(memberId);
    if (!actor || !member || actor.id === member.id || member.role === "owner" || !this.canManageMembers(actorId)) {
      return false;
    }
    return actor.role === "owner" || (member.role !== "admin" && role !== "admin");
  }

  canInspectRoomAccess(userId: string): boolean {
    const member = this.getMember(userId);
    return Boolean(member && this.data.organisation.ceoIds.includes(userId));
  }

  updateAvailability(userId: string, availability: Member["availability"]): Member {
    const member = this.requireMember(userId);
    member.availability = availability;
    this.dirty = true;
    return structuredClone(member);
  }

  updateOnline(userId: string, online: boolean): Member {
    const member = this.requireMember(userId);
    member.online = online;
    this.dirty = true;
    return structuredClone(member);
  }

  updateMemberLocation(userId: string, floorId: string, activity?: string): Member {
    const member = this.requireMember(userId);
    member.floorId = floorId;
    if (activity) {
      member.activity = activity;
    } else {
      delete member.activity;
    }
    this.dirty = true;
    return structuredClone(member);
  }

  updateMemberCharacter(userId: string, appearance: CharacterAppearance): Member {
    const member = this.requireMember(userId);
    member.character = structuredClone(appearance);
    this.dirty = true;
    return structuredClone(member);
  }

  updateMemberAccess(
    userId: string,
    role: Exclude<MemberRole, "owner">,
  ): Member {
    const member = this.requireMember(userId);
    if (member.role === "owner") {
      throw new Error("OWNER_ROLE_IMMUTABLE");
    }
    member.role = role;
    member.permissions = permissionsForMemberRole(role);
    this.dirty = true;
    return structuredClone(member);
  }

  issueInvitation(
    email: string,
    role: Exclude<MemberRole, "owner">,
  ): IssuedInvitation {
    const normalizedEmail = normalizeEmail(email);
    if (this.data.members.some((member) => normalizeEmail(member.email) === normalizedEmail)) {
      throw new Error("INVITATION_MEMBER_EXISTS");
    }
    const supersededInvitationIds: string[] = [];
    for (const invitation of this.data.invitations) {
      if (invitation.email === normalizedEmail && invitation.status === "pending") {
        invitation.status = "revoked";
        supersededInvitationIds.push(invitation.id);
      }
    }
    const token = randomBytes(32).toString("base64url");
    const invitation: Invitation = {
      id: hashInvitationToken(token),
      teamId: this.data.team.id,
      email: normalizedEmail,
      role,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.data.invitations.push(invitation);
    this.dirty = true;
    return { invitation: structuredClone(invitation), token, supersededInvitationIds };
  }

  acceptInvitation(token: string, user: AuthUser): AcceptedInvitation {
    const invitation = this.data.invitations.find((item) => item.id === hashInvitationToken(token));
    if (!invitation) {
      throw new Error("INVITATION_INVALID");
    }
    if (invitation.status === "revoked") {
      throw new Error("INVITATION_REVOKED");
    }
    if (invitation.status === "accepted") {
      throw new Error("INVITATION_ACCEPTED");
    }
    if (Date.parse(invitation.expiresAt) <= Date.now()) {
      throw new Error("INVITATION_EXPIRED");
    }
    if (invitation.email !== normalizeEmail(user.email)) {
      throw new Error("INVITATION_EMAIL_MISMATCH");
    }
    const existingMember = this.getMember(user.id);
    if (existingMember) {
      throw new Error("INVITATION_MEMBER_EXISTS");
    }
    const member = this.addMember(user, invitation.role);
    invitation.status = "accepted";
    this.dirty = true;
    return {
      invitation: structuredClone(invitation),
      member,
    };
  }

  rollbackInvitationIssue(invitationId: string, supersededInvitationIds: string[]): void {
    const issued = this.data.invitations.find((invitation) => invitation.id === invitationId);
    if (!issued || issued.status === "accepted") return;
    this.data.invitations = this.data.invitations.filter((invitation) => invitation.id !== invitationId);
    this.dirty = true;
    if (this.data.invitations.some((invitation) => invitation.email === issued.email && invitation.status === "pending")) return;
    const superseded = new Set(supersededInvitationIds);
    for (const invitation of this.data.invitations) {
      if (superseded.has(invitation.id) && invitation.status === "revoked") {
        invitation.status = "pending";
      }
    }
    this.dirty = true;
  }

  revokeInvitation(invitationId: string): Invitation {
    const invitation = this.data.invitations.find((item) => item.id === invitationId);
    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
    }
    if (invitation.status !== "pending") {
      throw new Error("INVITATION_NOT_PENDING");
    }
    invitation.status = "revoked";
    this.dirty = true;
    return structuredClone(invitation);
  }

  addMessage(
    conversationId: string,
    userId: string,
    body: string,
    attachments: ChatAttachment[] = [],
  ): ChatMessage {
    const conversation = this.data.conversations.find((item) => item.id === conversationId);
    if (!conversation) {
      throw new Error("CONVERSATION_NOT_FOUND");
    }
    this.requireMember(userId);
    if (!this.canAccessConversation(userId, conversationId)) {
      throw new Error("CONVERSATION_FORBIDDEN");
    }
    const trimmedBody = body.trim();
    if (!trimmedBody && attachments.length === 0) {
      throw new Error("MESSAGE_EMPTY");
    }
    const sequence = (this.messageSequenceByConversation.get(conversationId) ?? 0) + 1;
    const message: ChatMessage = {
      id: randomUUID(),
      conversationId,
      userId,
      body: trimmedBody,
      createdAt: new Date().toISOString(),
      sequence,
      ...(attachments.length > 0 ? { attachments: structuredClone(attachments) } : {}),
    };
    this.data.messages.push(message);
    this.messageSequenceByConversation.set(conversationId, sequence);
    this.dirty = true;
    return structuredClone(message);
  }

  getAccessibleImage(userId: string, imageId: string): ChatAttachment | undefined {
    const message = this.data.messages.find((candidate) =>
      candidate.attachments?.some((attachment) => attachment.id === imageId && attachment.type === "image"),
    );
    if (!message || !this.canAccessConversation(userId, message.conversationId)) {
      return undefined;
    }
    const attachment = message.attachments!.find((candidate) => candidate.id === imageId)!;
    return structuredClone(attachment);
  }

  replaceLayout(layout: FloorLayout): LayoutReplacement {
    const index = this.data.layouts.findIndex((item) => item.floorId === layout.floorId);
    if (index === -1) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    const previous = this.data.layouts[index]!;
    assertLayoutIntegrity(layout);
    if (layout.revision !== previous.revision + 1) {
      throw new Error("LAYOUT_REVISION_INVALID");
    }
    const otherObjects = this.data.layouts
      .filter((item) => item.floorId !== layout.floorId)
      .flatMap((item) => item.objects);
    const economyUserIds = this.economy.reconcileLayout(previous, layout, otherObjects);
    this.data.layouts[index] = structuredClone(layout);
    synchronizeRoomMeetings(previous.rooms, layout.rooms, this.data.meetings, this.data.conversations);
    this.dirty = true;
    return { layout: structuredClone(layout), economyUserIds };
  }

  updateRoomSettings(roomId: string, settings: RoomSettings): FloorLayout {
    const layout = this.data.layouts.find((item) => item.rooms.some((room) => room.id === roomId));
    const room = layout?.rooms.find((item) => item.id === roomId);
    if (!layout || !room) {
      throw new Error("ROOM_NOT_FOUND");
    }
    const memberIds = this.data.members.map((member) => member.id);
    validateRoomPermission(settings.access, this.data.organisation, memberIds);
    validatePersonalSpaces(room, settings, memberIds);
    if (settings.build) validateRoomPermission(settings.build, this.data.organisation, memberIds);
    if (settings.organisationUnitId && !this.data.organisation.units.some((unit) => unit.id === settings.organisationUnitId)) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
    if (settings.access.mode !== "open" && settings.access.mode !== "default" && !room.privateEligible) throw new Error("ROOM_NOT_PRIVATE_ELIGIBLE");
    if (settings.access.mode === "open" && settings.access.knockable) throw new Error("ROOM_KNOCK_REQUIRES_PRIVATE");
    const next = structuredClone(layout);
    const nextRoom = next.rooms.find((item) => item.id === roomId)!;
    nextRoom.name = settings.name.trim();
    nextRoom.color = settings.color;
    if (settings.meetingRoom) nextRoom.meetingRoom = true;
    else delete nextRoom.meetingRoom;
    nextRoom.access = structuredClone(settings.access);
    nextRoom.build = structuredClone(settings.build ?? { mode: "default", assignedPersonIds: [] });
    if (settings.organisationUnitId) nextRoom.organisationUnitId = settings.organisationUnitId;
    else delete nextRoom.organisationUnitId;
    if (settings.ownerUserId) nextRoom.ownerUserId = settings.ownerUserId;
    else delete nextRoom.ownerUserId;
    nextRoom.personalAreas = structuredClone(settings.personalAreas ?? []);
    next.revision += 1;
    assertPublicReachability(this.getFloor(layout.floorId)!, next, this.getGameSettings());
    return this.replaceLayout(next).layout;
  }

  joinMeeting(meetingId: string, userId: string): Meeting {
    const meeting = this.requireMeeting(meetingId);
    if (!meeting.participantIds.includes(userId)) {
      meeting.participantIds.push(userId);
    }
    meeting.status = "live";
    this.dirty = true;
    return structuredClone(meeting);
  }

  leaveMeeting(meetingId: string, userId: string): Meeting {
    const meeting = this.requireMeeting(meetingId);
    meeting.participantIds = meeting.participantIds.filter((participantId) => participantId !== userId);
    if (!meeting.startsAt && meeting.status === "live" && meeting.participantIds.length === 0) meeting.status = "idle";
    this.dirty = true;
    return structuredClone(meeting);
  }

  recordGameRound(
    roundId: string,
    definitionId: string,
    results: GameRoundScoreInput[],
    playedAt = new Date().toISOString(),
  ): { scores: GameScore[]; statistics: PlayerGameStatistics[]; economyRewards: GameRewardResult[] } {
    if (
      !roundId
      || roundId.length > 100
      || results.length === 0
      || new Set(results.map((result) => result.userId)).size !== results.length
      || results.some((result) => !this.getMember(result.userId))
      || results.some((result) =>
        !Number.isSafeInteger(result.score)
        || result.score < 0
        || !Number.isSafeInteger(result.lines)
        || result.lines < 0
        || !Number.isSafeInteger(result.level)
        || result.level < 0
        || !Number.isSafeInteger(result.order)
        || result.order < 0
        || typeof result.won !== "boolean"
        || (result.fallingBlocks !== undefined && (
          definitionId !== FALLING_BLOCKS_DEFINITION_ID || !validFallingBlocksCounts(result.fallingBlocks)
        ))
      )
      || results.filter((result) => result.won).length > 1
      || (results.length === 1 && results[0]!.won)
      || !isIsoTimestamp(playedAt)
      || !this.getMiniGame(definitionId)
    ) {
      throw new Error("GAME_RESULT_INVALID");
    }
    if (this.data.scores.some((score) => score.roundId === roundId)) {
      throw new Error("GAME_ROUND_RECORDED");
    }

    const ranked = [...results].sort((left, right) =>
      right.score - left.score
      || right.lines - left.lines
      || right.level - left.level
      || left.order - right.order
      || left.userId.localeCompare(right.userId),
    );
    const playerCount = ranked.length;
    const mode = playerCount > 1 ? "multiplayer" as const : "solo" as const;
    const scores = ranked.map<GameScore>((result, index) => ({
      id: randomUUID(),
      roundId,
      definitionId,
      userId: result.userId,
      score: result.score,
      lines: result.lines,
      level: result.level,
      mode,
      playerCount,
      placement: index + 1,
      won: result.won,
      playedAt,
      ...(result.fallingBlocks ? { fallingBlocks: { ...result.fallingBlocks } } : {}),
    }));
    const nextStatistics = structuredClone(this.data.gameStatistics);
    const statistics = scores.map((score) => {
      let playerStatistics = nextStatistics.find(
        (candidate) => candidate.definitionId === definitionId && candidate.userId === score.userId,
      );
      if (!playerStatistics) {
        playerStatistics = emptyGameStatistics(definitionId, score.userId);
        nextStatistics.push(playerStatistics);
      }
      playerStatistics.gamesPlayed += 1;
      playerStatistics.multiplayerGamesPlayed += mode === "multiplayer" ? 1 : 0;
      playerStatistics.multiplayerWins += score.won ? 1 : 0;
      playerStatistics.highestScore = Math.max(playerStatistics.highestScore, score.score);
      playerStatistics.highestLines = Math.max(playerStatistics.highestLines, score.lines);
      playerStatistics.totalScore += score.score;
      playerStatistics.totalLines += score.lines;
      if (score.fallingBlocks) {
        playerStatistics.fallingBlocks = addFallingBlocksStatistics(playerStatistics.fallingBlocks, score.fallingBlocks);
      }
      if (
        !Number.isSafeInteger(playerStatistics.gamesPlayed)
        || !Number.isSafeInteger(playerStatistics.multiplayerGamesPlayed)
        || !Number.isSafeInteger(playerStatistics.multiplayerWins)
        || !Number.isSafeInteger(playerStatistics.totalScore)
        || !Number.isSafeInteger(playerStatistics.totalLines)
      ) {
        throw new Error("GAME_RESULT_INVALID");
      }
      return playerStatistics;
    });
    if (definitionId === FALLING_BLOCKS_DEFINITION_ID && mode === "multiplayer") {
      const holder = nextStatistics.find((entry) => entry.definitionId === definitionId && entry.holdsCrown);
      const winner = scores.find((score) => score.won);
      if (winner && (!holder || results.some((result) => result.userId === holder.userId))) {
        if (holder) delete holder.holdsCrown;
        statistics.find((entry) => entry.userId === winner.userId)!.holdsCrown = true;
      }
    }
    const economyRewards = this.economy.rewardGames(scores.map((score) => ({
      userId: score.userId,
      roundId,
      lines: score.lines,
      won: score.won,
    })), new Date(playedAt));
    this.data.scores = [...this.data.scores, ...scores].sort((left, right) => right.score - left.score);
    this.data.gameStatistics = nextStatistics;
    this.dirty = true;
    return { scores: structuredClone(scores), statistics: structuredClone(statistics), economyRewards };
  }

  getPlayerEconomy(userId: string) {
    return this.economy.getPlayerEconomy(userId);
  }

  getPublicEconomy() {
    this.publicEconomy.invalidateLayoutProposals(this.data.layouts);
    this.publicEconomy.refresh(this.data.organisation, this.data.members.map((member) => member.id));
    this.dirty = true;
    return this.publicEconomy.view();
  }

  donateMoney(userId: string, fundId: string, amount: number, operationKey: string): EconomyOperationResult {
    this.getPublicEconomy();
    const fund = this.publicEconomy.fund(fundId);
    if (!Number.isSafeInteger(amount) || amount <= 0 || fund.balance + amount > 2_000_000_000) throw new Error("COIN_BALANCE_INVALID");
    const result = this.economy.donateMoney(userId, amount, fundId, operationKey);
    if (!result.replayed) {
      this.publicEconomy.record(fundId, userId, "donation", amount, result.transaction.id);
    }
    this.dirty = true;
    return result;
  }

  disposeAsset(userId: string, ownedAssetId: string, kind: "asset_sale" | "asset_donation", operationKey: string, fundId?: string): EconomyOperationResult {
    const fingerprint = `${kind}:${ownedAssetId}:${fundId ?? ""}`;
    if (this.publicEconomy.findOperation(userId, operationKey, fingerprint) !== undefined) {
      return this.economy.disposeAsset(userId, ownedAssetId, kind, operationKey, fundId);
    }
    const asset = this.economy.getOwnedAsset(userId, ownedAssetId);
    if (asset.placement) throw new Error("ASSET_ALREADY_PLACED");
    if (kind === "asset_donation") this.publicEconomy.fund(fundId!);
    const result = this.economy.disposeAsset(userId, ownedAssetId, kind, operationKey, fundId);
    if (!result.replayed && kind === "asset_donation") {
      this.publicEconomy.addDonation({ id: asset.id, assetId: asset.assetId, fundId: fundId!, paid: asset.purchasePrice });
      this.publicEconomy.record(fundId!, userId, "asset_donation", 0, result.transaction.id);
    }
    this.publicEconomy.recordOperation(userId, operationKey, fingerprint, result.transaction.id);
    this.dirty = true;
    return result;
  }

  getOwnedAsset(userId: string, ownedAssetId: string) {
    return this.economy.getOwnedAsset(userId, ownedAssetId);
  }

  claimDailyReward(userId: string, operationKey: string): EconomyOperationResult {
    const result = this.economy.claimDailyReward(userId, operationKey);
    if (!result.replayed) {
      this.dirty = true;
    }
    return result;
  }

  purchaseAsset(userId: string, assetId: string, operationKey: string): EconomyOperationResult {
    const result = this.economy.purchaseAsset(userId, assetId, operationKey);
    if (!result.replayed) {
      this.dirty = true;
    }
    return result;
  }

  getGameSettings() {
    return this.economy.getGameSettings();
  }

  updateGameSettings(settings: Parameters<EconomyStore["updateGameSettings"]>[0]) {
    gameSettingsSchema.parse(settings);
    const memberIds = this.data.members.map((member) => member.id);
    validateRoomPermission(settings.roomAccess, this.data.organisation, memberIds);
    validateRoomPermission(settings.roomBuild, this.data.organisation, memberIds);
    for (const floor of this.getFloors()) assertPublicReachability(floor, this.getLayout(floor.id)!, settings);
    const updated = this.economy.updateGameSettings(settings);
    this.dirty = true;
    return updated;
  }

  getGlobalKidnappingSettings(): GlobalKidnappingSettings {
    return structuredClone(this.globalKidnappingSettings);
  }

  getPlayerKidnappingSettings(userId: string): PlayerKidnappingSettings {
    this.requireMember(userId);
    const settings = this.playerKidnappingSettings.get(userId);
    if (!settings) {
      throw new Error("KIDNAPPING_SETTINGS_INVALID");
    }
    return structuredClone(settings);
  }

  updateGlobalKidnappingSettings(settings: GlobalKidnappingSettings): GlobalKidnappingSettings {
    validateKidnappingSettings(
      {
        global: settings,
        players: [...this.playerKidnappingSettings].map(([userId, playerSettings]) => ({ userId, settings: playerSettings })),
      },
      this.data.members,
    );
    this.globalKidnappingSettings = structuredClone(settings);
    this.dirty = true;
    return this.getGlobalKidnappingSettings();
  }

  updatePlayerKidnappingSettings(userId: string, settings: PlayerKidnappingSettings): PlayerKidnappingSettings {
    this.requireMember(userId);
    validateKidnappingSettings(
      {
        global: this.globalKidnappingSettings,
        players: [...this.playerKidnappingSettings]
          .map(([candidateUserId, candidateSettings]) => ({
            userId: candidateUserId,
            settings: candidateUserId === userId ? settings : candidateSettings,
          })),
      },
      this.data.members,
    );
    this.playerKidnappingSettings.set(userId, structuredClone(settings));
    this.dirty = true;
    return this.getPlayerKidnappingSettings(userId);
  }

  canKidnap(carrierUserId: string, targetUserId: string): boolean {
    const targetSettings = this.playerKidnappingSettings.get(targetUserId);
    if (!targetSettings) {
      return false;
    }
    return carrierUserId !== targetUserId
      && this.globalKidnappingSettings.enabled
      && kidnappingPolicyAllows(this.globalKidnappingSettings.targetPolicy, targetUserId)
      && kidnappingPolicyAllows(targetSettings.carrierPolicy, carrierUserId);
  }

  exportMutableState(): MutableStoreState {
    return structuredClone({
      members: this.data.members,
      organisation: this.data.organisation,
      floors: this.data.floors,
      layouts: this.data.layouts,
      conversations: this.data.conversations,
      messages: this.data.messages,
      invitations: this.data.invitations,
      meetings: this.data.meetings,
      scores: this.data.scores,
      gameStatistics: this.data.gameStatistics,
      chessMatches: this.chessMatches,
      economy: this.economy.exportState(),
      publicEconomy: this.publicEconomy.exportState(),
      kidnapping: {
        global: this.globalKidnappingSettings,
        players: [...this.playerKidnappingSettings].map(([userId, settings]) => ({ userId, settings })),
      },
      registrationSettings: this.registrationSettings,
      corporateIdentity: corporateIdentitySettings(this.corporateIdentity),
      spotifyAppSettings: this.spotifyAppSettings,
      githubAppSettings: this.githubAppSettings,
    });
  }

  restoreMutableState(state: MutableStoreState): void {
    const next = structuredClone(state);
    if (!Array.isArray(next.layouts) || !Array.isArray(next.scores) || !Array.isArray(next.chessMatches)) {
      throw new Error("STORE_STATE_INVALID");
    }
    validateOrganisation(next.organisation, next.members.map((member) => member.id));
    validatePublicEconomy(next.publicEconomy);
    const memberIds = next.members.map((member) => member.id);
    for (const permission of [next.economy.gameSettings.roomAccess, next.economy.gameSettings.roomBuild]) {
      validateRoomPermission(permission, next.organisation, memberIds);
    }
    validateChessMatches(next.chessMatches, next.members);
    for (const layout of next.layouts) {
      assertLayoutIntegrity(layout);
      for (const room of layout.rooms) {
        validateRoomPermission(room.access, next.organisation, memberIds);
        if (room.build) validateRoomPermission(room.build, next.organisation, memberIds);
        validatePersonalSpaces(room, room, memberIds);
        if (room.organisationUnitId && !next.organisation.units.some((unit) => unit.id === room.organisationUnitId)) throw new Error("ORGANISATION_UNIT_NOT_FOUND");
      }
    }
    const messageSequences = indexMessageSequences(next.messages);
    this.economy.validateStateForWorkspace(
      next.economy,
      next.members.map((member) => member.id),
      next.layouts,
      next.scores,
    );
    validateKidnappingSettings(next.kidnapping, next.members);
    validateRegistrationSettings(next.registrationSettings);
    validateCorporateIdentity(next.corporateIdentity);
    const floors = next.floors;
    if (!Array.isArray(floors) || floors.length === 0 || new Set(floors.map((floor) => floor.id)).size !== floors.length
      || floors.some((floor) => !floor || typeof floor.id !== "string" || !floor.id || typeof floor.name !== "string" || !floor.name
        || !Number.isInteger(floor.level) || !Number.isFinite(floor.width) || floor.width <= 0
        || !Number.isFinite(floor.height) || floor.height <= 0 || !Number.isFinite(floor.spawn?.x)
        || !Number.isFinite(floor.spawn?.y) || !next.layouts.some((layout) => layout.floorId === floor.id))
      || next.layouts.some((layout) => !floors.some((floor) => floor.id === layout.floorId))) {
      throw new Error("STORE_STATE_INVALID");
    }
    this.economy.restoreState(next.economy);
    this.publicEconomy.restoreState(next.publicEconomy);
    this.data.members = next.members;
    this.data.organisation = next.organisation;
    this.data.floors = floors;
    this.data.layouts = next.layouts;
    this.data.conversations = next.conversations;
    this.data.messages = next.messages;
    this.messageSequenceByConversation = messageSequences;
    this.data.invitations = next.invitations;
    this.data.meetings = next.meetings;
    this.data.scores = next.scores;
    this.data.gameStatistics = next.gameStatistics;
    this.chessMatches = next.chessMatches;
    this.globalKidnappingSettings = next.kidnapping.global;
    this.registrationSettings = next.registrationSettings;
    this.corporateIdentity = next.corporateIdentity;
    this.spotifyAppSettings = next.spotifyAppSettings;
    this.githubAppSettings = next.githubAppSettings;
    this.playerKidnappingSettings.clear();
    for (const { userId, settings } of next.kidnapping.players) {
      this.playerKidnappingSettings.set(userId, settings);
    }
    this.dirty = false;
  }

  markClean(): void {
    this.dirty = false;
  }

  markDirty(): void {
    this.dirty = true;
  }

  private requireMember(userId: string): Member {
    const member = this.getMember(userId);
    if (!member) {
      throw new Error("USER_NOT_FOUND");
    }
    return member;
  }

  private requireMeeting(meetingId: string): Meeting {
    const meeting = this.getMeeting(meetingId);
    if (!meeting) {
      throw new Error("MEETING_NOT_FOUND");
    }
    return meeting;
  }
}

const memberColors = ["#5b8def", "#25b99a", "#f4b942", "#b26fe8", "#e36d9e", "#ff7a66"];

function emptyGameStatistics(definitionId: string, userId: string): PlayerGameStatistics {
  return {
    definitionId,
    userId,
    gamesPlayed: 0,
    multiplayerGamesPlayed: 0,
    multiplayerWins: 0,
    highestScore: 0,
    highestLines: 0,
    totalScore: 0,
    totalLines: 0,
  };
}

function indexMessageSequences(messages: ChatMessage[]): Map<string, number> {
  const sequences = new Map<string, number>();
  for (const message of messages) {
    sequences.set(
      message.conversationId,
      Math.max(sequences.get(message.conversationId) ?? 0, message.sequence),
    );
  }
  return sequences;
}

function normalizeEmail(email: string): string {
  return email.normalize("NFC").trim().toLowerCase();
}

function validateRegistrationSettings(settings: RegistrationSettings | undefined): void {
  if (
    !settings
    || typeof settings !== "object"
    || typeof settings.enabled !== "boolean"
    || typeof settings.invitationRequired !== "boolean"
    || !["admin", "member", "guest"].includes(settings.defaultRole)
    || !Array.isArray(settings.whitelistedDomains)
    || settings.whitelistedDomains.length > 100
  ) {
    throw new Error("REGISTRATION_SETTINGS_INVALID");
  }
  const domains = new Set<string>();
  for (const domain of settings.whitelistedDomains) {
    if (
      typeof domain !== "string"
      || domain !== normalizeEmailDomain(domain)
      || !isValidEmailDomain(domain)
      || domains.has(domain)
    ) {
      throw new Error("REGISTRATION_SETTINGS_INVALID");
    }
    domains.add(domain);
  }
}

const BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

function normalizeCorporateIdentity(identity: CorporateIdentity): CorporateIdentity {
  return {
    applicationName: identity.applicationName.normalize("NFC").trim(),
    primaryColor: identity.primaryColor.toLowerCase(),
    secondaryColor: identity.secondaryColor.toLowerCase(),
    authenticationLayout: identity.authenticationLayout,
    ...(identity.logoUrl ? { logoUrl: identity.logoUrl } : {}),
  };
}

function corporateIdentitySettings(identity: CorporateIdentity): CorporateIdentitySettings {
  return {
    applicationName: identity.applicationName,
    primaryColor: identity.primaryColor,
    secondaryColor: identity.secondaryColor,
    authenticationLayout: identity.authenticationLayout,
  };
}

function validateCorporateIdentity(identity: CorporateIdentity | undefined): void {
  if (
    !identity
    || typeof identity !== "object"
    || typeof identity.applicationName !== "string"
    || identity.applicationName !== identity.applicationName.normalize("NFC").trim()
    || identity.applicationName.length < 1
    || identity.applicationName.length > 60
    || typeof identity.primaryColor !== "string"
    || !BRAND_COLOR_PATTERN.test(identity.primaryColor)
    || typeof identity.secondaryColor !== "string"
    || !BRAND_COLOR_PATTERN.test(identity.secondaryColor)
    || !["split", "centered"].includes(identity.authenticationLayout)
    || (identity.logoUrl !== undefined && (
      typeof identity.logoUrl !== "string"
      || !/^\/v1\/branding\/logo\.webp\?v=[A-Za-z0-9-]+$/.test(identity.logoUrl)
    ))
  ) {
    throw new Error("CORPORATE_IDENTITY_INVALID");
  }
}

function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isIsoTimestamp(value: string): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validateKidnappingSettings(state: KidnappingPersistenceState, members: readonly Member[]): void {
  if (!state || typeof state !== "object" || !Array.isArray(state.players)) {
    throw new Error("KIDNAPPING_SETTINGS_INVALID");
  }
  const memberIds = new Set(members.map((member) => member.id));
  if (state.players.length !== memberIds.size) {
    throw new Error("KIDNAPPING_SETTINGS_INVALID");
  }
  validateKidnappingPolicy(state.global?.targetPolicy, memberIds);
  if (typeof state.global?.enabled !== "boolean") {
    throw new Error("KIDNAPPING_SETTINGS_INVALID");
  }
  const seenUserIds = new Set<string>();
  for (const player of state.players) {
    if (
      !player
      || typeof player !== "object"
      || !memberIds.has(player.userId)
      || seenUserIds.has(player.userId)
    ) {
      throw new Error("KIDNAPPING_SETTINGS_INVALID");
    }
    seenUserIds.add(player.userId);
    validateKidnappingPolicy(player.settings?.carrierPolicy, memberIds, player.userId);
  }
}

function validateKidnappingPolicy(
  policy: GlobalKidnappingSettings["targetPolicy"] | undefined,
  memberIds: ReadonlySet<string>,
  excludedUserId?: string,
): void {
  if (
    !policy
    || typeof policy !== "object"
    || !KIDNAPPING_POLICY_MODES.includes(policy.mode)
    || !Array.isArray(policy.userIds)
    || policy.userIds.length > 100
    || new Set(policy.userIds).size !== policy.userIds.length
    || policy.userIds.some((userId) => typeof userId !== "string" || !memberIds.has(userId) || userId === excludedUserId)
  ) {
    throw new Error("KIDNAPPING_SETTINGS_INVALID");
  }
}

function validateChessMatches(matches: ChessMatchRecord[], members: readonly Member[]): void {
  const memberIds = new Set(members.map((member) => member.id));
  const matchIds = new Set<string>();
  for (const match of matches) {
    const participantIds = [match?.creatorUserId, match?.whiteUserId, match?.blackUserId, match?.reservedBlackUserId]
      .filter((userId): userId is string => Boolean(userId));
    if (
      !match
      || typeof match !== "object"
      || typeof match.id !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match.id)
      || matchIds.has(match.id)
      || match.definitionId !== CHESS_DEFINITION_ID
      || typeof match.objectId !== "string"
      || !match.objectId
      || !["waiting", "active", "completed"].includes(match.status)
      || !CHESS_TIME_CONTROLS.includes(match.settings?.timeControl)
      || !CHESS_ACCESS_MODES.includes(match.settings?.access)
      || typeof match.settings?.pauseWeekends !== "boolean"
      || (match.settings.pauseWeekends && match.settings.timeControl !== "daily")
      || !isValidChessParticipants(match, memberIds)
      || (match.status === "waiting" && match.blackUserId !== undefined)
      || (match.status !== "waiting" && match.blackUserId === undefined)
      || typeof match.fen !== "string"
      || !match.fen
      || !Array.isArray(match.moves)
      || !isValidChessClock(match)
      || !isIsoTimestamp(match.createdAt)
      || !isIsoTimestamp(match.updatedAt)
      || Date.parse(match.updatedAt) < Date.parse(match.createdAt)
      || (match.startedAt !== undefined && !isIsoTimestamp(match.startedAt))
      || (match.completedAt !== undefined && !isIsoTimestamp(match.completedAt))
      || (match.status === "waiting" && match.startedAt !== undefined)
      || (match.status !== "waiting" && !match.startedAt)
      || (match.drawOfferByUserId !== undefined && (
        match.status !== "active"
        || !participantIds.includes(match.drawOfferByUserId)
      ))
      || !isValidChessOutcome(match, new Set(participantIds))
      || match.moves.some((move) => (
        !/^[a-h][1-8]$/.test(move.from)
        || !/^[a-h][1-8]$/.test(move.to)
        || !CHESS_COLORS.includes(move.color)
        || !CHESS_PIECE_TYPES.includes(move.piece)
        || (move.captured !== undefined && !CHESS_PIECE_TYPES.includes(move.captured))
        || (move.promotion !== undefined && !CHESS_PROMOTION_PIECES.includes(move.promotion))
        || typeof move.san !== "string"
        || !move.san
        || !isIsoTimestamp(move.playedAt)
      ))
    ) {
      throw new Error("CHESS_STATE_INVALID");
    }
    matchIds.add(match.id);
  }
}

function isValidChessParticipants(match: ChessMatchRecord, memberIds: ReadonlySet<string>): boolean {
  const { creatorUserId, whiteUserId, blackUserId, reservedBlackUserId, settings } = match;
  if (creatorUserId !== whiteUserId || whiteUserId === GAME_BOT_USER_ID || !memberIds.has(whiteUserId)) {
    return false;
  }
  if (settings.bot !== undefined) {
    return settings.bot !== null
      && BOT_DIFFICULTIES.includes(settings.bot.difficulty)
      && settings.access === "locked"
      && settings.opponentUserId === undefined
      && reservedBlackUserId === undefined
      && blackUserId === GAME_BOT_USER_ID;
  }
  if ([blackUserId, reservedBlackUserId].some((userId) => userId !== undefined && (
    userId === GAME_BOT_USER_ID || userId === whiteUserId || !memberIds.has(userId)
  ))) {
    return false;
  }
  if (settings.access === "open") {
    return settings.opponentUserId === undefined && reservedBlackUserId === undefined;
  }
  return Boolean(settings.opponentUserId)
    && settings.opponentUserId === reservedBlackUserId
    && (blackUserId === undefined || blackUserId === reservedBlackUserId);
}

function isValidChessClock(match: ChessMatchRecord): boolean {
  const values = [match.clock?.whiteRemainingMs, match.clock?.blackRemainingMs];
  const timed = match.settings.timeControl !== "standard";
  return Boolean(match.clock)
    && values.every((value) => timed
      ? typeof value === "number" && Number.isFinite(value) && value >= 0
      : value === null)
    && (match.clock.activeSince === undefined || isIsoTimestamp(match.clock.activeSince))
    && (match.status === "active" && timed ? match.clock.activeSince !== undefined : match.clock.activeSince === undefined);
}

function isValidChessOutcome(match: ChessMatchRecord, participantIds: ReadonlySet<string>): boolean {
  if (match.status !== "completed") {
    return match.completedAt === undefined && match.outcome === undefined;
  }
  if (!match.completedAt || !match.outcome || !CHESS_MATCH_RESULTS.includes(match.outcome.result)) {
    return false;
  }
  const decisive = match.outcome.result === "checkmate"
    || (["resignation", "timeout"].includes(match.outcome.result) && match.outcome.winnerUserId !== undefined);
  return decisive
    ? typeof match.outcome.winnerUserId === "string" && participantIds.has(match.outcome.winnerUserId)
    : match.outcome.winnerUserId === undefined;
}

function assertLayoutIntegrity(layout: FloorLayout): void {
  if (
    !layout
    || typeof layout !== "object"
    || typeof layout.floorId !== "string"
    || !layout.floorId
    || !Number.isSafeInteger(layout.revision)
    || layout.revision < 0
    || !Array.isArray(layout.walls)
    || !Array.isArray(layout.openings)
    || !Array.isArray(layout.tiles)
    || !Array.isArray(layout.objects)
    || !Array.isArray(layout.rooms)
  ) {
    throw new Error("LAYOUT_STATE_INVALID");
  }
  if (
    layout.walls.length > MAX_LAYOUT_WALLS_PER_FLOOR
    || layout.openings.length > MAX_LAYOUT_OPENINGS_PER_FLOOR
    || layout.objects.length > MAX_LAYOUT_OBJECTS_PER_FLOOR
    || layout.rooms.length > MAX_LAYOUT_ROOMS_PER_FLOOR
  ) {
    throw new Error("LAYOUT_CAPACITY_REACHED");
  }
  const objectIds = new Set<string>();
  for (const object of layout.objects) {
    const definition = object && typeof object === "object" && typeof object.assetId === "string"
      ? getAssetDefinition(object.assetId)
      : undefined;
    if (
      !object
      || typeof object !== "object"
      || typeof object.id !== "string"
      || !object.id
      || objectIds.has(object.id)
      || object.floorId !== layout.floorId
      || !definition
      || typeof object.x !== "number"
      || !Number.isFinite(object.x)
      || typeof object.y !== "number"
      || !Number.isFinite(object.y)
      || ![0, 90, 180, 270].includes(object.rotation)
      || typeof object.variantId !== "string"
      || !getAssetVariants(definition).some((variant) => variant.id === object.variantId)
    ) {
      throw new Error("LAYOUT_STATE_INVALID");
    }
    objectIds.add(object.id);
    if (object.workState !== undefined && (
      !workObjectStateSchema.safeParse(object.workState).success
      || object.workState.kind !== definition.workKind
    )) {
      throw new Error("WORK_OBJECT_STATE_INVALID");
    }
  }
}
