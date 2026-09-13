import { Migration } from "@mikro-orm/migrations";

export class Migration20260906100000 extends Migration {
  override name = "Migration20260906100000";

  override up(): void {
    this.addSql(`
      update "floor_layouts" as "layout"
      set "objects" = (
        select jsonb_agg(
          case
            when "entry"."object" ->> 'assetId' = 'equipment-tetris' then
              "entry"."object" || jsonb_build_object('assetId', 'equipment-falling-blocks')
                || case
                  when "entry"."object" ->> 'label' = 'Tetris'
                    then jsonb_build_object('label', 'Falling Blocks')
                  else '{}'::jsonb
                end
            else "entry"."object"
          end
          order by "entry"."ordinality"
        )
        from jsonb_array_elements("layout"."objects") with ordinality as "entry"("object", "ordinality")
      ),
      "revision" = "revision" + 1
      where exists (
        select 1
        from jsonb_array_elements("layout"."objects") as "entry"("object")
        where "entry"."object" ->> 'assetId' = 'equipment-tetris'
      )
    `);

    this.addSql(`
      update "owned_assets"
      set "asset_id" = 'equipment-falling-blocks'
      where "asset_id" = 'equipment-tetris'
    `);

    this.addSql(`
      update "coin_transactions"
      set "asset_id" = 'equipment-falling-blocks',
          "operation_fingerprint" = 'shop_purchase:equipment-falling-blocks'
      where "asset_id" = 'equipment-tetris'
        and "kind" = 'shop_purchase'
        and "operation_fingerprint" = 'shop_purchase:equipment-tetris'
    `);

    this.addSql(`
      update "game_scores"
      set "definition_id" = 'game-falling-blocks'
      where "definition_id" = 'game-tetris'
    `);

    this.addSql(`
      insert into "player_game_statistics" (
        "definition_id", "user_id", "games_played", "multiplayer_games_played", "multiplayer_wins",
        "highest_score", "highest_lines", "total_score", "total_lines", "sort_order"
      )
      select 'game-falling-blocks', "user_id", "games_played", "multiplayer_games_played", "multiplayer_wins",
        "highest_score", "highest_lines", "total_score", "total_lines", "sort_order"
      from "player_game_statistics"
      where "definition_id" = 'game-tetris'
      on conflict ("definition_id", "user_id") do update set
        "games_played" = "player_game_statistics"."games_played" + excluded."games_played",
        "multiplayer_games_played" = "player_game_statistics"."multiplayer_games_played" + excluded."multiplayer_games_played",
        "multiplayer_wins" = "player_game_statistics"."multiplayer_wins" + excluded."multiplayer_wins",
        "highest_score" = greatest("player_game_statistics"."highest_score", excluded."highest_score"),
        "highest_lines" = greatest("player_game_statistics"."highest_lines", excluded."highest_lines"),
        "total_score" = "player_game_statistics"."total_score" + excluded."total_score",
        "total_lines" = "player_game_statistics"."total_lines" + excluded."total_lines",
        "sort_order" = least("player_game_statistics"."sort_order", excluded."sort_order")
    `);

    this.addSql(`
      delete from "player_game_statistics"
      where "definition_id" = 'game-tetris'
    `);
  }
}
