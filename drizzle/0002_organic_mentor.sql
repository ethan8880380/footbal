CREATE TABLE `player_projections` (
	`source` text NOT NULL,
	`season` integer NOT NULL,
	`week` integer NOT NULL,
	`player_id` text NOT NULL,
	`stats` text,
	`lines` text,
	`retrieved_at` text NOT NULL,
	PRIMARY KEY(`source`, `season`, `week`, `player_id`)
);
