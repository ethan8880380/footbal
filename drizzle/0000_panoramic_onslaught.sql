CREATE TABLE `ai_reports` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`player_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_flags` (
	`league_id` text NOT NULL,
	`asset_key` text NOT NULL,
	`flag` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`league_id`, `asset_key`)
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`draft_id` text PRIMARY KEY NOT NULL,
	`league_id` text NOT NULL,
	`season` text NOT NULL,
	`status` text NOT NULL,
	`type` text,
	`rounds` integer,
	`start_time` integer,
	`slot_to_roster_id` text,
	`draft_order` text,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `league_config` (
	`league_id` text PRIMARY KEY NOT NULL,
	`my_roster_id` text,
	`strategy` text DEFAULT 'balanced' NOT NULL,
	`target_positions` text NOT NULL,
	`pick_budget` text NOT NULL,
	`consolidation_exponent` real DEFAULT 1.35 NOT NULL,
	`draft_order_rules` text,
	`manual_draft_slots` text NOT NULL,
	`confirmed_pick_seasons` text NOT NULL,
	`opponent_strategies` text NOT NULL,
	`market_provider` text DEFAULT 'statsguy' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `league_members` (
	`league_id` text NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text,
	`team_name` text,
	`avatar` text,
	`is_commissioner` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`league_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `leagues` (
	`league_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`season` text NOT NULL,
	`status` text,
	`total_rosters` integer,
	`previous_league_id` text,
	`draft_id` text,
	`avatar` text,
	`settings` text NOT NULL,
	`scoring_settings` text NOT NULL,
	`roster_positions` text NOT NULL,
	`metadata` text,
	`connected_user_id` text,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mapping_issues` (
	`sleeper_id` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`sleeper_id`, `kind`)
);
--> statement-breakpoint
CREATE TABLE `market_picks` (
	`provider` text NOT NULL,
	`variant_key` text NOT NULL,
	`pick_id` text NOT NULL,
	`year` integer NOT NULL,
	`round` integer NOT NULL,
	`slot` integer,
	`variant` text,
	`value` real,
	`valued_at` text,
	`retrieved_at` text NOT NULL,
	PRIMARY KEY(`provider`, `variant_key`, `pick_id`)
);
--> statement-breakpoint
CREATE TABLE `market_runs` (
	`provider` text NOT NULL,
	`variant_key` text NOT NULL,
	`valued_at` text,
	`retrieved_at` text NOT NULL,
	`total` integer NOT NULL,
	`source_url` text NOT NULL,
	PRIMARY KEY(`provider`, `variant_key`)
);
--> statement-breakpoint
CREATE TABLE `market_value_history` (
	`provider` text NOT NULL,
	`variant_key` text NOT NULL,
	`asset_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real,
	`origin` text NOT NULL,
	`retrieved_at` text NOT NULL,
	PRIMARY KEY(`provider`, `variant_key`, `asset_id`, `date`)
);
--> statement-breakpoint
CREATE TABLE `market_values` (
	`provider` text NOT NULL,
	`variant_key` text NOT NULL,
	`player_id` text NOT NULL,
	`value` real,
	`rank` integer,
	`position_rank` integer,
	`change_7d` real,
	`change_30d` real,
	`valued_at` text,
	`metadata_updated_at` text,
	`retrieved_at` text NOT NULL,
	`url` text,
	PRIMARY KEY(`provider`, `variant_key`, `player_id`)
);
--> statement-breakpoint
CREATE TABLE `metric_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`metric_key` text NOT NULL,
	`label` text NOT NULL,
	`value` real,
	`units` text NOT NULL,
	`provider` text NOT NULL,
	`source_url` text,
	`season` integer,
	`week_start` integer,
	`week_end` integer,
	`date_start` text,
	`date_end` text,
	`sample_size` real,
	`definition` text NOT NULL,
	`denominator` text,
	`data_cutoff` text,
	`retrieved_at` text NOT NULL,
	`kind` text NOT NULL,
	`import_batch` text
);
--> statement-breakpoint
CREATE INDEX `metric_obs_player_idx` ON `metric_observations` (`player_id`);--> statement-breakpoint
CREATE TABLE `player_ids` (
	`sleeper_id` text PRIMARY KEY NOT NULL,
	`gsis_id` text,
	`pfr_id` text,
	`sportradar_id` text,
	`resolved_via` text NOT NULL,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `players` (
	`player_id` text PRIMARY KEY NOT NULL,
	`full_name` text,
	`first_name` text,
	`last_name` text,
	`position` text,
	`fantasy_positions` text NOT NULL,
	`team` text,
	`age` real,
	`birth_date` text,
	`years_exp` integer,
	`rookie_year` text,
	`college` text,
	`status` text,
	`injury_status` text,
	`injury_body_part` text,
	`injury_start_date` text,
	`injury_notes` text,
	`practice_participation` text,
	`depth_chart_position` text,
	`depth_chart_order` integer,
	`news_updated` integer,
	`gsis_id` text,
	`sportradar_id` text,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `players_sportradar_idx` ON `players` (`sportradar_id`);--> statement-breakpoint
CREATE TABLE `prospect_combine` (
	`pfr_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`position` text,
	`school` text,
	`height` text,
	`weight` real,
	`forty` real,
	`bench` real,
	`vertical` real,
	`broad_jump` real,
	`cone` real,
	`shuttle` real
);
--> statement-breakpoint
CREATE TABLE `prospect_draft` (
	`pfr_id` text PRIMARY KEY NOT NULL,
	`gsis_id` text,
	`season` integer NOT NULL,
	`round` integer NOT NULL,
	`pick` integer NOT NULL,
	`team` text,
	`college` text,
	`position` text
);
--> statement-breakpoint
CREATE TABLE `rosters` (
	`league_id` text NOT NULL,
	`roster_id` text NOT NULL,
	`owner_id` text,
	`co_owners` text NOT NULL,
	`players` text NOT NULL,
	`starters` text NOT NULL,
	`reserve` text NOT NULL,
	`taxi` text NOT NULL,
	`settings` text NOT NULL,
	PRIMARY KEY(`league_id`, `roster_id`)
);
--> statement-breakpoint
CREATE TABLE `saved_trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` text NOT NULL,
	`name` text NOT NULL,
	`side_a_roster_id` text NOT NULL,
	`side_b_roster_id` text NOT NULL,
	`side_a` text NOT NULL,
	`side_b` text NOT NULL,
	`summary` text NOT NULL,
	`evaluation` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `schedule_games` (
	`game_id` text PRIMARY KEY NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`game_type` text NOT NULL,
	`gameday` text,
	`home_team` text NOT NULL,
	`away_team` text NOT NULL,
	`home_score` integer,
	`away_score` integer
);
--> statement-breakpoint
CREATE INDEX `schedule_season_idx` ON `schedule_games` (`season`);--> statement-breakpoint
CREATE TABLE `sleeper_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`display_name` text,
	`avatar` text,
	`retrieved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snap_weeks` (
	`game_id` text NOT NULL,
	`pfr_id` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`game_type` text NOT NULL,
	`team` text NOT NULL,
	`position` text,
	`offense_snaps` integer,
	`offense_pct` real,
	`defense_snaps` integer,
	`defense_pct` real,
	`st_snaps` integer,
	PRIMARY KEY(`game_id`, `pfr_id`)
);
--> statement-breakpoint
CREATE INDEX `snap_weeks_pfr_idx` ON `snap_weeks` (`pfr_id`);--> statement-breakpoint
CREATE INDEX `snap_weeks_team_idx` ON `snap_weeks` (`season`,`team`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`league_id` text NOT NULL,
	`roster_id` text,
	`created_at` text NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `snapshots_league_idx` ON `snapshots` (`league_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `stat_weeks` (
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`season_type` text NOT NULL,
	`gsis_id` text NOT NULL,
	`game_id` text,
	`team` text NOT NULL,
	`opponent` text,
	`position` text,
	`stats` text NOT NULL,
	PRIMARY KEY(`season`, `week`, `season_type`, `gsis_id`)
);
--> statement-breakpoint
CREATE INDEX `stat_weeks_team_idx` ON `stat_weeks` (`season`,`team`);--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`data_cutoff` text,
	`row_count` integer,
	`source_url` text,
	`started_at` text NOT NULL,
	`finished_at` text,
	PRIMARY KEY(`scope`, `key`)
);
--> statement-breakpoint
CREATE TABLE `team_game_totals` (
	`game_id` text NOT NULL,
	`team` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`targets` integer NOT NULL,
	`carries` integer NOT NULL,
	`air_yards` real NOT NULL,
	`pass_attempts` integer NOT NULL,
	`offense_snaps` integer,
	`defense_snaps` integer,
	`has_snap_coverage` integer NOT NULL,
	PRIMARY KEY(`game_id`, `team`)
);
--> statement-breakpoint
CREATE INDEX `team_totals_season_idx` ON `team_game_totals` (`season`);--> statement-breakpoint
CREATE TABLE `traded_picks` (
	`league_id` text NOT NULL,
	`season` text NOT NULL,
	`round` integer NOT NULL,
	`original_roster_id` text NOT NULL,
	`owner_roster_id` text NOT NULL,
	`previous_owner_roster_id` text,
	`retrieved_at` text NOT NULL,
	PRIMARY KEY(`league_id`, `season`, `round`, `original_roster_id`)
);
