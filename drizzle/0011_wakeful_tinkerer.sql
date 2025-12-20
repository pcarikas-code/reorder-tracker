ALTER TABLE `purchaseLines` DROP INDEX `unique_purchase_product`;--> statement-breakpoint
ALTER TABLE `purchaseLines` ADD `unleashLineGuid` varchar(64);--> statement-breakpoint
ALTER TABLE `purchaseLines` ADD CONSTRAINT `unique_purchase_line` UNIQUE(`purchaseId`,`unleashLineGuid`);