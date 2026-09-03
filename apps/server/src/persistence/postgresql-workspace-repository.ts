import { IsolationLevel, type EntityName, type RequiredEntityData } from "@mikro-orm/core";
import type { EntityManager, MikroORM } from "@mikro-orm/postgresql";
import type { Conversation, Meeting } from "@workhard/shared";
import type { WorkspacePersistenceState } from "./application-database.js";
import {
  ChatMessageEntity,
  CoinTransactionEntity,
  ConversationEntity,
  ConversationParticipantEntity,
  EconomyAccountEntity,
  FloorLayoutEntity,
  GameScoreEntity,
  InvitationEntity,
  MeetingEntity,
  MeetingParticipantEntity,
  MemberEntity,
  OwnedAssetEntity,
  PlayerGameStatisticsEntity,
  WorkspaceSettingsEntity,
  WorldPlayerEntity,
} from "./entities/index.js";
import { synchronizeRows } from "./synchronize-rows.js";

const WORKSPACE_SETTINGS_ID = "workspace";

export class PostgreSqlWorkspaceRepository {
  constructor(private readonly orm: MikroORM) {}

  async load(): Promise<WorkspacePersistenceState | undefined> {
    return this.orm.em.fork().transactional(
      (entityManager) => this.loadState(entityManager),
      {
        isolationLevel: IsolationLevel.REPEATABLE_READ,
        readOnly: true,
      },
    );
  }

  private async loadState(entityManager: EntityManager): Promise<WorkspacePersistenceState | undefined> {
    const settings = await entityManager.findOne(WorkspaceSettingsEntity, { id: WORKSPACE_SETTINGS_ID });
    if (!settings) {
      return undefined;
    }

    const members = await entityManager.find(MemberEntity, {}, { orderBy: { sortOrder: "asc" } });
    const layouts = await entityManager.find(FloorLayoutEntity, {}, { orderBy: { sortOrder: "asc" } });
    const conversations = await entityManager.find(ConversationEntity, {}, { orderBy: { sortOrder: "asc" } });
    const conversationParticipants = await entityManager.find(
      ConversationParticipantEntity,
      {},
      { orderBy: { conversationId: "asc", sortOrder: "asc" } },
    );
    const messages = await entityManager.find(ChatMessageEntity, {}, { orderBy: { sortOrder: "asc" } });
    const invitations = await entityManager.find(InvitationEntity, {}, { orderBy: { sortOrder: "asc" } });
    const meetings = await entityManager.find(MeetingEntity, {}, { orderBy: { sortOrder: "asc" } });
    const meetingParticipants = await entityManager.find(
      MeetingParticipantEntity,
      {},
      { orderBy: { meetingId: "asc", sortOrder: "asc" } },
    );
    const scores = await entityManager.find(GameScoreEntity, {}, { orderBy: { sortOrder: "asc" } });
    const gameStatistics = await entityManager.find(
      PlayerGameStatisticsEntity,
      {},
      { orderBy: { sortOrder: "asc" } },
    );
    const economyAccounts = await entityManager.find(EconomyAccountEntity, {}, { orderBy: { sortOrder: "asc" } });
    const ownedAssets = await entityManager.find(OwnedAssetEntity, {}, { orderBy: { sortOrder: "asc" } });
    const coinTransactions = await entityManager.find(CoinTransactionEntity, {}, { orderBy: { sortOrder: "asc" } });
    const players = await entityManager.find(WorldPlayerEntity, {}, { orderBy: { sortOrder: "asc" } });

    const participantIdsByConversation = groupOrderedIds(
      conversationParticipants,
      (participant) => participant.conversationId,
    );
    const participantIdsByMeeting = groupOrderedIds(meetingParticipants, (participant) => participant.meetingId);

    return {
      players: players.map((player) => ({
        userId: player.userId,
        floorId: player.floorId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        availability: player.availability,
        connected: player.connected,
        ...(player.roomId ? { roomId: player.roomId } : {}),
        ...(player.wavingUntil ? { wavingUntil: player.wavingUntil.getTime() } : {}),
      })),
      store: {
        members: members.map((member) => ({
          id: member.id,
          name: member.name,
          initials: member.initials,
          email: member.email,
          title: member.title,
          role: member.role,
          permissions: member.permissions,
          color: member.color,
          availability: member.availability,
          online: member.online,
          ...(member.floorId ? { floorId: member.floorId } : {}),
          ...(member.activity ? { activity: member.activity } : {}),
          ...(member.position ? { position: member.position } : {}),
        })),
        layouts: layouts.map((layout) => ({
          floorId: layout.floorId,
          revision: layout.revision,
          walls: layout.walls,
          openings: layout.openings,
          tiles: layout.tiles,
          objects: layout.objects,
          rooms: layout.rooms,
        })),
        conversations: conversations.map((conversation) => mapConversation(
          conversation,
          participantIdsByConversation.get(conversation.id),
        )),
        messages: messages.map((message) => ({
          id: message.id,
          conversationId: message.conversationId,
          userId: message.userId,
          body: message.body,
          createdAt: message.createdAt.toISOString(),
          sequence: message.sequence,
          ...(message.attachments ? { attachments: message.attachments } : {}),
        })),
        invitations: invitations.map((invitation) => ({
          id: invitation.id,
          teamId: invitation.teamId,
          email: invitation.email,
          role: invitation.role,
          permissions: invitation.permissions,
          status: invitation.status,
          expiresAt: invitation.expiresAt.toISOString(),
        })),
        meetings: meetings.map((meeting) => mapMeeting(
          meeting,
          participantIdsByMeeting.get(meeting.id) ?? [],
        )),
        scores: scores.map((score) => ({
          id: score.id,
          roundId: score.roundId,
          definitionId: score.definitionId,
          userId: score.userId,
          score: score.score,
          lines: score.lines,
          level: score.level,
          mode: score.mode,
          playerCount: score.playerCount,
          placement: score.placement,
          won: score.won,
          playedAt: score.playedAt.toISOString(),
        })),
        gameStatistics: gameStatistics.map((statistics) => ({
          definitionId: statistics.definitionId,
          userId: statistics.userId,
          gamesPlayed: statistics.gamesPlayed,
          multiplayerGamesPlayed: statistics.multiplayerGamesPlayed,
          multiplayerWins: statistics.multiplayerWins,
          highestScore: statistics.highestScore,
          highestLines: statistics.highestLines,
          totalScore: statistics.totalScore,
          totalLines: statistics.totalLines,
        })),
        economy: {
          accounts: economyAccounts.map((account) => ({
            userId: account.userId,
            coinBalance: account.coinBalance,
            lifetimeEarned: account.lifetimeEarned,
            lifetimeSpent: account.lifetimeSpent,
            dailyReward: {
              streak: account.dailyRewardStreak,
              ...(account.dailyRewardLastClaimedDay
                ? { lastClaimedDay: account.dailyRewardLastClaimedDay }
                : {}),
            },
            inventory: ownedAssets
              .filter((asset) => asset.userId === account.userId)
              .map((asset) => ({
                id: asset.id,
                assetId: asset.assetId,
                acquiredAt: asset.acquiredAt.toISOString(),
                ...(asset.placement ? { placement: asset.placement } : {}),
              })),
          })),
          transactions: coinTransactions.map((transaction) => ({
            id: transaction.id,
            userId: transaction.userId,
            operationKey: transaction.operationKey,
            operationFingerprint: transaction.operationFingerprint,
            kind: transaction.kind,
            amount: transaction.amount,
            balanceAfter: transaction.balanceAfter,
            createdAt: transaction.createdAt.toISOString(),
            ...(transaction.assetId ? { assetId: transaction.assetId } : {}),
            ...(transaction.ownedAssetId ? { ownedAssetId: transaction.ownedAssetId } : {}),
            ...(transaction.sourceId ? { sourceId: transaction.sourceId } : {}),
          })),
          gameSettings: settings.gameSettings,
        },
        kidnapping: {
          global: settings.kidnappingSettings,
          players: settings.playerKidnappingSettings,
        },
        registrationSettings: settings.registrationSettings,
      },
    };
  }

  async save(state: WorkspacePersistenceState): Promise<void> {
    await this.orm.em.fork().transactional(async (entityManager) => {
      await synchronizeRows(entityManager, MemberEntity, "id", state.store.members.map((member, sortOrder) => ({
        id: member.id,
        name: member.name,
        initials: member.initials,
        email: member.email,
        title: member.title,
        role: member.role,
        permissions: member.permissions,
        color: member.color,
        availability: member.availability,
        online: member.online,
        floorId: member.floorId ?? null,
        activity: member.activity ?? null,
        position: member.position ?? null,
        sortOrder,
      })));

      await synchronizeRows(entityManager, FloorLayoutEntity, "floorId", state.store.layouts.map((layout, sortOrder) => ({
        ...layout,
        sortOrder,
      })));

      await synchronizeRows(entityManager, ConversationEntity, "id", state.store.conversations.map((conversation, sortOrder) => ({
        id: conversation.id,
        name: conversation.name,
        type: conversation.type,
        roomId: conversation.roomId ?? null,
        meetingId: conversation.meetingId ?? null,
        unread: conversation.unread,
        sortOrder,
      })));
      await replaceRows(
        entityManager,
        ConversationParticipantEntity,
        state.store.conversations.flatMap((conversation) => (
          (conversation.participantIds ?? []).map((userId, sortOrder) => ({
            conversationId: conversation.id,
            userId,
            sortOrder,
          }))
        )),
      );
      await synchronizeRows(entityManager, ChatMessageEntity, "id", state.store.messages.map((message, sortOrder) => ({
        id: message.id,
        conversationId: message.conversationId,
        userId: message.userId,
        body: message.body,
        createdAt: new Date(message.createdAt),
        sequence: message.sequence,
        attachments: message.attachments ?? null,
        sortOrder,
      })));

      await synchronizeRows(entityManager, InvitationEntity, "id", state.store.invitations.map((invitation, sortOrder) => ({
        id: invitation.id,
        teamId: invitation.teamId,
        email: invitation.email,
        role: invitation.role,
        permissions: invitation.permissions,
        status: invitation.status,
        expiresAt: new Date(invitation.expiresAt),
        sortOrder,
      })));

      await synchronizeRows(entityManager, MeetingEntity, "id", state.store.meetings.map((meeting, sortOrder) => ({
        id: meeting.id,
        title: meeting.title,
        location: meeting.location,
        startsAt: new Date(meeting.startsAt),
        durationMinutes: meeting.durationMinutes,
        status: meeting.status,
        sortOrder,
      })));
      await replaceRows(
        entityManager,
        MeetingParticipantEntity,
        state.store.meetings.flatMap((meeting) => meeting.participantIds.map((userId, sortOrder) => ({
          meetingId: meeting.id,
          userId,
          sortOrder,
        }))),
      );

      await synchronizeRows(entityManager, GameScoreEntity, "id", state.store.scores.map((score, sortOrder) => ({
        id: score.id,
        roundId: score.roundId,
        definitionId: score.definitionId,
        userId: score.userId,
        score: score.score,
        lines: score.lines,
        level: score.level,
        mode: score.mode,
        playerCount: score.playerCount,
        placement: score.placement,
        won: score.won,
        playedAt: new Date(score.playedAt),
        sortOrder,
      })));
      await replaceRows(
        entityManager,
        PlayerGameStatisticsEntity,
        state.store.gameStatistics.map((statistics, sortOrder) => ({ ...statistics, sortOrder })),
      );

      await synchronizeRows(entityManager, EconomyAccountEntity, "userId", state.store.economy.accounts.map((account, sortOrder) => ({
        userId: account.userId,
        coinBalance: account.coinBalance,
        lifetimeEarned: account.lifetimeEarned,
        lifetimeSpent: account.lifetimeSpent,
        dailyRewardStreak: account.dailyReward.streak,
        dailyRewardLastClaimedDay: account.dailyReward.lastClaimedDay ?? null,
        sortOrder,
      })));
      await synchronizeRows(
        entityManager,
        OwnedAssetEntity,
        "id",
        state.store.economy.accounts.flatMap((account) => account.inventory.map((asset, sortOrder) => ({
          id: asset.id,
          userId: account.userId,
          assetId: asset.assetId,
          acquiredAt: new Date(asset.acquiredAt),
          placement: asset.placement ?? null,
          sortOrder,
        }))),
      );
      await synchronizeRows(entityManager, CoinTransactionEntity, "id", state.store.economy.transactions.map((transaction, sortOrder) => ({
        id: transaction.id,
        userId: transaction.userId,
        operationKey: transaction.operationKey,
        operationFingerprint: transaction.operationFingerprint,
        kind: transaction.kind,
        amount: transaction.amount,
        balanceAfter: transaction.balanceAfter,
        createdAt: new Date(transaction.createdAt),
        assetId: transaction.assetId ?? null,
        ownedAssetId: transaction.ownedAssetId ?? null,
        sourceId: transaction.sourceId ?? null,
        sortOrder,
      })));

      await synchronizeRows(entityManager, WorldPlayerEntity, "userId", state.players.map((player, sortOrder) => ({
        userId: player.userId,
        floorId: player.floorId,
        x: player.x,
        y: player.y,
        facing: player.facing,
        availability: player.availability,
        roomId: player.roomId ?? null,
        connected: player.connected,
        wavingUntil: player.wavingUntil ? new Date(player.wavingUntil) : null,
        sortOrder,
      })));

      await entityManager.upsert(WorkspaceSettingsEntity, {
        id: WORKSPACE_SETTINGS_ID,
        gameSettings: state.store.economy.gameSettings,
        kidnappingSettings: state.store.kidnapping.global,
        playerKidnappingSettings: state.store.kidnapping.players,
        registrationSettings: state.store.registrationSettings,
        updatedAt: new Date(),
      });
      await entityManager.nativeDelete(WorkspaceSettingsEntity, { id: { $ne: WORKSPACE_SETTINGS_ID } });
    });
  }

  async clear(entityManager: EntityManager): Promise<void> {
    await entityManager.nativeDelete(WorkspaceSettingsEntity, {});
    await entityManager.nativeDelete(WorldPlayerEntity, {});
    await entityManager.nativeDelete(CoinTransactionEntity, {});
    await entityManager.nativeDelete(OwnedAssetEntity, {});
    await entityManager.nativeDelete(EconomyAccountEntity, {});
    await entityManager.nativeDelete(PlayerGameStatisticsEntity, {});
    await entityManager.nativeDelete(GameScoreEntity, {});
    await entityManager.nativeDelete(MeetingParticipantEntity, {});
    await entityManager.nativeDelete(MeetingEntity, {});
    await entityManager.nativeDelete(InvitationEntity, {});
    await entityManager.nativeDelete(ChatMessageEntity, {});
    await entityManager.nativeDelete(ConversationParticipantEntity, {});
    await entityManager.nativeDelete(ConversationEntity, {});
    await entityManager.nativeDelete(FloorLayoutEntity, {});
    await entityManager.nativeDelete(MemberEntity, {});
  }
}

function groupOrderedIds<T extends { userId: string }>(
  participants: T[],
  groupId: (participant: T) => string,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const participant of participants) {
    const ids = grouped.get(groupId(participant)) ?? [];
    ids.push(participant.userId);
    grouped.set(groupId(participant), ids);
  }
  return grouped;
}

function mapConversation(entity: ConversationEntity, participantIds: string[] | undefined): Conversation {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    unread: entity.unread,
    ...(participantIds ? { participantIds } : {}),
    ...(entity.roomId ? { roomId: entity.roomId } : {}),
    ...(entity.meetingId ? { meetingId: entity.meetingId } : {}),
  };
}

function mapMeeting(entity: MeetingEntity, participantIds: string[]): Meeting {
  return {
    id: entity.id,
    title: entity.title,
    location: entity.location,
    startsAt: entity.startsAt.toISOString(),
    durationMinutes: entity.durationMinutes,
    status: entity.status,
    participantIds,
  } as Meeting;
}

async function replaceRows<Entity extends object>(
  entityManager: EntityManager,
  entityName: EntityName<Entity>,
  rows: RequiredEntityData<Entity>[],
): Promise<void> {
  await entityManager.nativeDelete(entityName, {});
  if (rows.length > 0) {
    await entityManager.insertMany(entityName, rows);
  }
}
