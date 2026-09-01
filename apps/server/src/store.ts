import { randomUUID } from "node:crypto";
import type {
  Area,
  AreaSettings,
  AuthUser,
  BootstrapData,
  ChatAttachment,
  ChatMessage,
  Conversation,
  FloorLayout,
  GameScore,
  Invitation,
  Meeting,
  Member,
  MemberRole,
  WorkspaceAccessData,
} from "@workhard/shared";
import { createSeedData } from "./seed.js";

export interface MutableStoreState {
  members: Member[];
  layouts: FloorLayout[];
  conversations: Conversation[];
  messages: ChatMessage[];
  invitations: Invitation[];
  meetings: Meeting[];
  scores: GameScore[];
}

export class DemoStore {
  private data = createSeedData();
  dirty = false;

  getBootstrap(currentUserId: string): BootstrapData {
    if (!this.getMember(currentUserId)) {
      throw new Error("USER_NOT_FOUND");
    }
    const layouts = this.data.layouts.map((layout) => this.getVisibleLayout(layout.floorId, currentUserId)!);
    const access = this.getWorkspaceAccess(currentUserId);
    return structuredClone({
      ...this.data,
      currentUserId,
      layouts,
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
      invitations: this.canEdit(userId) ? this.data.invitations : [],
    });
  }

  getMember(userId: string): Member | undefined {
    return this.data.members.find((member) => member.id === userId);
  }

  getFloor(floorId: string) {
    return this.data.floors.find((floor) => floor.id === floorId);
  }

  getLayout(floorId: string): FloorLayout | undefined {
    return this.data.layouts.find((layout) => layout.floorId === floorId);
  }

  getLayouts(): FloorLayout[] {
    return this.data.layouts;
  }

  getVisibleLayout(floorId: string, userId: string): FloorLayout | undefined {
    const layout = this.getLayout(floorId);
    if (!layout) {
      return undefined;
    }
    return structuredClone({
      ...layout,
      areas: layout.areas.filter((area) => this.canViewArea(userId, area)),
    });
  }

  getArea(areaId: string): Area | undefined {
    return this.data.layouts.flatMap((layout) => layout.areas).find((area) => area.id === areaId);
  }

  getMeeting(meetingId: string): Meeting | undefined {
    return this.data.meetings.find((meeting) => meeting.id === meetingId);
  }

  getMembers(): Member[] {
    return this.data.members;
  }

  addMember(user: AuthUser): Member {
    if (this.getMember(user.id)) {
      throw new Error("USER_EXISTS");
    }
    const floor = this.data.floors[0]!;
    const member: Member = {
      id: user.id,
      name: user.username,
      initials: user.username.slice(0, 2).toUpperCase(),
      email: user.email,
      title: "",
      role: "member",
      color: memberColors[this.data.members.length % memberColors.length]!,
      availability: "available",
      online: true,
      floorId: floor.id,
      position: structuredClone(floor.spawn),
    };
    this.data.members.push(member);
    this.dirty = true;
    return structuredClone(member);
  }

  removeMember(userId: string): void {
    this.data.members = this.data.members.filter((member) => member.id !== userId);
    const removedConversationIds = new Set(
      this.data.conversations
        .filter((conversation) => conversation.type === "direct" && conversation.participantIds?.includes(userId))
        .map((conversation) => conversation.id),
    );
    this.data.conversations = this.data.conversations.filter((conversation) => !removedConversationIds.has(conversation.id));
    this.data.messages = this.data.messages.filter((message) => !removedConversationIds.has(message.conversationId));
    this.dirty = true;
  }

  getMeetings(): Meeting[] {
    return this.data.meetings;
  }

  canViewArea(userId: string, area: Area): boolean {
    return area.visibility === "public" || Boolean(area.memberIds?.includes(userId)) || this.canEdit(userId);
  }

  canViewMeeting(userId: string, meeting: Meeting): boolean {
    if (meeting.location.type === "public") {
      return true;
    }
    const area = this.getArea(meeting.location.areaId);
    return Boolean(area && this.canViewArea(userId, area));
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
    if (conversation.type === "area") {
      const area = conversation.areaId ? this.getArea(conversation.areaId) : undefined;
      return Boolean(area && this.canViewArea(userId, area));
    }
    const meeting = conversation.meetingId ? this.getMeeting(conversation.meetingId) : undefined;
    return Boolean(meeting && this.canViewMeeting(userId, meeting));
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

  canEdit(userId: string): boolean {
    const role = this.getMember(userId)?.role;
    return role === "owner" || role === "admin";
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

  updateRole(userId: string, role: Exclude<MemberRole, "owner">): Member {
    const member = this.requireMember(userId);
    if (member.role === "owner") {
      throw new Error("OWNER_ROLE_IMMUTABLE");
    }
    member.role = role;
    this.dirty = true;
    return structuredClone(member);
  }

  addInvitation(email: string, role: Exclude<MemberRole, "owner">): Invitation {
    const normalizedEmail = email.trim().toLowerCase();
    const duplicate = this.data.invitations.find(
      (invitation) => invitation.email === normalizedEmail && invitation.status === "pending",
    );
    if (duplicate) {
      return structuredClone(duplicate);
    }

    const invitation: Invitation = {
      id: randomUUID(),
      teamId: this.data.team.id,
      email: normalizedEmail,
      role,
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.data.invitations.push(invitation);
    this.dirty = true;
    return structuredClone(invitation);
  }

  revokeInvitation(invitationId: string): Invitation {
    const invitation = this.data.invitations.find((item) => item.id === invitationId);
    if (!invitation) {
      throw new Error("INVITATION_NOT_FOUND");
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
    const sequence = this.data.messages.reduce(
      (highest, message) =>
        message.conversationId === conversationId ? Math.max(highest, message.sequence) : highest,
      0,
    ) + 1;
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
    this.dirty = true;
    return structuredClone(message);
  }

  getAccessibleImage(userId: string, imageId: string): ChatAttachment | undefined {
    for (const message of this.data.messages) {
      if (!this.canAccessConversation(userId, message.conversationId)) {
        continue;
      }
      const attachment = message.attachments?.find((candidate) => candidate.id === imageId && candidate.type === "image");
      if (attachment) {
        return structuredClone(attachment);
      }
    }
    return undefined;
  }

  replaceLayout(layout: FloorLayout): FloorLayout {
    const index = this.data.layouts.findIndex((item) => item.floorId === layout.floorId);
    if (index === -1) {
      throw new Error("FLOOR_NOT_FOUND");
    }
    this.data.layouts[index] = structuredClone(layout);
    this.dirty = true;
    return structuredClone(layout);
  }

  updateAreaSettings(areaId: string, settings: AreaSettings): FloorLayout {
    const layout = this.data.layouts.find((item) => item.areas.some((area) => area.id === areaId));
    const area = layout?.areas.find((item) => item.id === areaId);
    if (!layout || !area) {
      throw new Error("AREA_NOT_FOUND");
    }
    if (area.type !== "private" && area.type !== "meeting") {
      throw new Error("AREA_NOT_LOCKABLE");
    }
    area.type = settings.type;
    area.locked = settings.locked;
    area.visibility = settings.visibility;
    layout.revision += 1;
    this.dirty = true;
    return structuredClone(layout);
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
    this.dirty = true;
    return structuredClone(meeting);
  }

  addScore(score: Omit<GameScore, "id" | "playedAt">): GameScore {
    const savedScore: GameScore = {
      ...score,
      id: randomUUID(),
      playedAt: new Date().toISOString(),
    };
    this.data.scores.push(savedScore);
    this.data.scores.sort((left, right) => right.score - left.score);
    this.dirty = true;
    return structuredClone(savedScore);
  }

  exportMutableState(): MutableStoreState {
    return structuredClone({
      members: this.data.members,
      layouts: this.data.layouts,
      conversations: this.data.conversations,
      messages: this.data.messages,
      invitations: this.data.invitations,
      meetings: this.data.meetings,
      scores: this.data.scores,
    });
  }

  restoreMutableState(state: MutableStoreState): void {
    this.data.members = structuredClone(state.members);
    this.data.layouts = structuredClone(state.layouts);
    this.data.conversations = structuredClone(state.conversations);
    this.data.messages = structuredClone(state.messages);
    this.data.invitations = structuredClone(state.invitations);
    this.data.meetings = structuredClone(state.meetings);
    this.data.scores = structuredClone(state.scores);
    this.dirty = false;
  }

  markClean(): void {
    this.dirty = false;
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
