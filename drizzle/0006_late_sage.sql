ALTER TABLE `purchases` ADD `isExcluded` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` ADD `excludeReason` varchar(255);