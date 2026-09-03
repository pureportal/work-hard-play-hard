import { Migration } from "@mikro-orm/migrations";

export class Migration20260903000000 extends Migration {
  override name = "Migration20260903000000";

  override up(): void {
    this.addSql(`
      create table "members" (
        "id" varchar(255) primary key,
        "name" varchar(255) not null,
        "initials" varchar(255) not null,
        "email" varchar(255) not null,
        "title" varchar(255) not null,
        "role" varchar(255) not null check ("role" in ('owner', 'admin', 'member', 'guest')),
        "permissions" jsonb not null,
        "color" varchar(255) not null,
        "availability" varchar(255) not null check ("availability" in ('available', 'busy', 'dnd', 'away')),
        "online" boolean not null,
        "floor_id" varchar(255) null,
        "activity" varchar(255) null,
        "position" jsonb null,
        "sort_order" integer not null check ("sort_order" >= 0)
      )
    `);
    this.addSql('create index "members_email_index" on "members" ("email")');

    this.addSql(`
      create table "floor_layouts" (
        "floor_id" varchar(255) primary key,
        "revision" integer not null check ("revision" >= 0),
        "walls" jsonb not null,
        "openings" jsonb not null,
        "tiles" jsonb not null,
        "objects" jsonb not null,
        "rooms" jsonb not null,
        "sort_order" integer not null check ("sort_order" >= 0)
      )
    `);

    this.addSql(`
      create table "conversations" (
        "id" varchar(255) primary key,
        "name" varchar(255) not null,
        "type" varchar(255) not null check ("type" in ('team', 'room', 'direct', 'meeting')),
        "room_id" varchar(255) null,
        "meeting_id" varchar(255) null,
        "unread" integer not null check ("unread" >= 0),
        "sort_order" integer not null check ("sort_order" >= 0)
      )
    `);

    this.addSql(`
      create table "conversation_participants" (
        "conversation_id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "sort_order" integer not null check ("sort_order" >= 0),
        primary key ("conversation_id", "user_id"),
        constraint "conversation_participants_conversation_id_foreign" foreign key ("conversation_id") references "conversations" ("id") on delete cascade
      )
    `);

    this.addSql(`
      create table "chat_messages" (
        "id" varchar(255) primary key,
        "conversation_id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "body" text not null,
        "created_at" timestamptz not null,
        "sequence" integer not null check ("sequence" > 0),
        "attachments" jsonb null,
        "sort_order" integer not null check ("sort_order" >= 0),
        constraint "chat_messages_conversation_id_sequence_unique" unique ("conversation_id", "sequence"),
        constraint "chat_messages_conversation_id_foreign" foreign key ("conversation_id") references "conversations" ("id") on delete cascade
      )
    `);
    this.addSql('create index "chat_messages_conversation_id_index" on "chat_messages" ("conversation_id")');
    this.addSql('create index "chat_messages_user_id_index" on "chat_messages" ("user_id")');

    this.addSql(`
      create table "invitations" (
        "id" varchar(255) primary key,
        "team_id" varchar(255) not null,
        "email" varchar(255) not null,
        "role" varchar(255) not null check ("role" in ('admin', 'member', 'guest')),
        "permissions" jsonb not null,
        "status" varchar(255) not null check ("status" in ('pending', 'accepted', 'revoked')),
        "expires_at" timestamptz not null,
        "sort_order" integer not null check ("sort_order" >= 0)
      )
    `);
    this.addSql('create index "invitations_team_id_index" on "invitations" ("team_id")');
    this.addSql('create index "invitations_email_index" on "invitations" ("email")');
    this.addSql('create index "invitations_expires_at_index" on "invitations" ("expires_at")');

    this.addSql(`
      create table "meetings" (
        "id" varchar(255) primary key,
        "title" varchar(255) not null,
        "location" jsonb not null,
        "starts_at" timestamptz not null,
        "duration_minutes" integer not null check ("duration_minutes" > 0),
        "status" varchar(255) not null check ("status" in ('scheduled', 'live', 'ended')),
        "sort_order" integer not null check ("sort_order" >= 0)
      )
    `);
    this.addSql('create index "meetings_starts_at_index" on "meetings" ("starts_at")');

    this.addSql(`
      create table "meeting_participants" (
        "meeting_id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "sort_order" integer not null check ("sort_order" >= 0),
        primary key ("meeting_id", "user_id"),
        constraint "meeting_participants_meeting_id_foreign" foreign key ("meeting_id") references "meetings" ("id") on delete cascade
      )
    `);

    this.addSql(`
      create table "game_scores" (
        "id" varchar(255) primary key,
        "round_id" varchar(255) not null,
        "definition_id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "score" integer not null check ("score" >= 0),
        "lines" integer not null check ("lines" >= 0),
        "level" integer not null check ("level" >= 0),
        "mode" varchar(255) not null check ("mode" in ('solo', 'multiplayer')),
        "player_count" integer not null check ("player_count" > 0),
        "placement" integer not null check ("placement" > 0),
        "won" boolean not null,
        "played_at" timestamptz not null,
        "sort_order" integer not null check ("sort_order" >= 0),
        constraint "game_scores_round_id_user_id_unique" unique ("round_id", "user_id")
      )
    `);
    this.addSql('create index "game_scores_round_id_index" on "game_scores" ("round_id")');
    this.addSql('create index "game_scores_definition_id_index" on "game_scores" ("definition_id")');
    this.addSql('create index "game_scores_user_id_index" on "game_scores" ("user_id")');
    this.addSql('create index "game_scores_played_at_index" on "game_scores" ("played_at")');

    this.addSql(`
      create table "player_game_statistics" (
        "definition_id" varchar(255) not null,
        "user_id" varchar(255) not null,
        "games_played" integer not null check ("games_played" >= 0),
        "multiplayer_games_played" integer not null check ("multiplayer_games_played" >= 0),
        "multiplayer_wins" integer not null check ("multiplayer_wins" >= 0),
        "highest_score" integer not null check ("highest_score" >= 0),
        "highest_lines" integer not null check ("highest_lines" >= 0),
        "total_score" integer not null check ("total_score" >= 0),
        "total_lines" integer not null check ("total_lines" >= 0),
        "sort_order" integer not null check ("sort_order" >= 0),
        primary key ("definition_id", "user_id")
      )
    `);

    this.addSql(`
      create table "economy_accounts" (
        "user_id" varchar(255) primary key,
        "coin_balance" integer not null check ("coin_balance" >= 0),
        "lifetime_earned" integer not null check ("lifetime_earned" >= 0),
        "lifetime_spent" integer not null check ("lifetime_spent" >= 0),
        "daily_reward_streak" integer not null check ("daily_reward_streak" >= 0),
        "daily_reward_last_claimed_day" date null,
        "sort_order" integer not null check ("sort_order" >= 0),
        constraint "economy_accounts_user_id_foreign" foreign key ("user_id") references "members" ("id") on update cascade on delete cascade
      )
    `);

    this.addSql(`
      create table "owned_assets" (
        "id" varchar(255) primary key,
        "user_id" varchar(255) not null,
        "asset_id" varchar(255) not null,
        "acquired_at" timestamptz not null,
        "placement" jsonb null,
        "sort_order" integer not null check ("sort_order" >= 0),
        constraint "owned_assets_user_id_foreign" foreign key ("user_id") references "economy_accounts" ("user_id") on delete cascade
      )
    `);
    this.addSql('create index "owned_assets_user_id_index" on "owned_assets" ("user_id")');

    this.addSql(`
      create table "coin_transactions" (
        "id" varchar(255) primary key,
        "user_id" varchar(255) not null,
        "operation_key" varchar(255) not null,
        "operation_fingerprint" varchar(255) not null,
        "kind" varchar(255) not null check ("kind" in ('welcome', 'daily_bonus', 'game_reward', 'shop_purchase')),
        "amount" integer not null,
        "balance_after" integer not null check ("balance_after" >= 0),
        "created_at" timestamptz not null,
        "asset_id" varchar(255) null,
        "owned_asset_id" varchar(255) null,
        "source_id" varchar(255) null,
        "sort_order" integer not null check ("sort_order" >= 0),
        constraint "coin_transactions_user_id_operation_key_unique" unique ("user_id", "operation_key"),
        constraint "coin_transactions_user_id_foreign" foreign key ("user_id") references "economy_accounts" ("user_id") on delete cascade
      )
    `);
    this.addSql('create index "coin_transactions_user_id_index" on "coin_transactions" ("user_id")');
    this.addSql('create index "coin_transactions_created_at_index" on "coin_transactions" ("created_at")');

    this.addSql(`
      create table "workspace_settings" (
        "id" varchar(255) primary key,
        "game_settings" jsonb not null,
        "updated_at" timestamptz not null
      )
    `);

    this.addSql(`
      create table "world_players" (
        "user_id" varchar(255) primary key,
        "floor_id" varchar(255) not null,
        "x" double precision not null,
        "y" double precision not null,
        "facing" varchar(255) not null check ("facing" in ('up', 'down', 'left', 'right')),
        "availability" varchar(255) not null check ("availability" in ('available', 'busy', 'dnd', 'away')),
        "room_id" varchar(255) null,
        "connected" boolean not null,
        "waving_until" timestamptz null,
        "sort_order" integer not null check ("sort_order" >= 0),
        constraint "world_players_user_id_foreign" foreign key ("user_id") references "members" ("id") on update cascade on delete cascade
      )
    `);
    this.addSql('create index "world_players_floor_id_index" on "world_players" ("floor_id")');

    this.addSql(`
      create table "auth_accounts" (
        "id" varchar(255) primary key,
        "username" varchar(255) not null,
        "email" varchar(255) not null,
        "password_hash" varchar(255) not null,
        "created_at" timestamptz not null,
        constraint "auth_accounts_username_unique" unique ("username"),
        constraint "auth_accounts_email_unique" unique ("email")
      )
    `);

    this.addSql(`
      create table "auth_sessions" (
        "token_hash" varchar(255) primary key,
        "user_id" varchar(255) not null,
        "expires_at" timestamptz not null,
        constraint "auth_sessions_user_id_foreign" foreign key ("user_id") references "auth_accounts" ("id") on delete cascade
      )
    `);
    this.addSql('create index "auth_sessions_user_id_index" on "auth_sessions" ("user_id")');
    this.addSql('create index "auth_sessions_expires_at_index" on "auth_sessions" ("expires_at")');

    this.addSql(`
      create table "auth_magic_links" (
        "token_hash" varchar(255) primary key,
        "user_id" varchar(255) not null,
        "expires_at" timestamptz not null,
        constraint "auth_magic_links_user_id_foreign" foreign key ("user_id") references "auth_accounts" ("id") on delete cascade
      )
    `);
    this.addSql('create index "auth_magic_links_user_id_index" on "auth_magic_links" ("user_id")');
    this.addSql('create index "auth_magic_links_expires_at_index" on "auth_magic_links" ("expires_at")');

    this.addSql(`
      create table "player_avatars" (
        "user_id" varchar(255) primary key,
        "image" bytea not null check (octet_length("image") > 0),
        "mime_type" varchar(255) not null check ("mime_type" = 'image/webp'),
        "width" integer not null check ("width" > 0),
        "height" integer not null check ("height" > 0),
        "version" varchar(255) not null,
        "updated_at" timestamptz not null
      )
    `);
  }

  override down(): void {
    this.addSql('drop table if exists "player_avatars" cascade');
    this.addSql('drop table if exists "auth_magic_links" cascade');
    this.addSql('drop table if exists "auth_sessions" cascade');
    this.addSql('drop table if exists "auth_accounts" cascade');
    this.addSql('drop table if exists "world_players" cascade');
    this.addSql('drop table if exists "workspace_settings" cascade');
    this.addSql('drop table if exists "coin_transactions" cascade');
    this.addSql('drop table if exists "owned_assets" cascade');
    this.addSql('drop table if exists "economy_accounts" cascade');
    this.addSql('drop table if exists "player_game_statistics" cascade');
    this.addSql('drop table if exists "game_scores" cascade');
    this.addSql('drop table if exists "meeting_participants" cascade');
    this.addSql('drop table if exists "meetings" cascade');
    this.addSql('drop table if exists "invitations" cascade');
    this.addSql('drop table if exists "chat_messages" cascade');
    this.addSql('drop table if exists "conversation_participants" cascade');
    this.addSql('drop table if exists "conversations" cascade');
    this.addSql('drop table if exists "floor_layouts" cascade');
    this.addSql('drop table if exists "members" cascade');
  }
}
