CREATE TABLE `areaAliases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`areaId` int NOT NULL,
	`alias` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `areaAliases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hospitalId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`normalizedName` varchar(255),
	`isConfirmed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hospitals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unleashGuid` varchar(64) NOT NULL,
	`customerCode` varchar(100),
	`customerName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hospitals_id` PRIMARY KEY(`id`),
	CONSTRAINT `hospitals_unleashGuid_unique` UNIQUE(`unleashGuid`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('overdue','due_soon') NOT NULL,
	`areaId` int NOT NULL,
	`hospitalId` int NOT NULL,
	`message` text,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pendingMatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseId` int NOT NULL,
	`rawAreaText` varchar(500) NOT NULL,
	`suggestedAreaId` int,
	`suggestedAreaName` varchar(255),
	`matchScore` decimal(5,2),
	`llmSuggestion` text,
	`status` enum('pending','confirmed','rejected','new_area') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `pendingMatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchaseLines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseId` int NOT NULL,
	`unleashProductGuid` varchar(64),
	`productCode` varchar(50),
	`productDescription` text,
	`productType` enum('standard','mesh_top','other') DEFAULT 'other',
	`productSize` enum('full','medium','half','other') DEFAULT 'other',
	`productColor` varchar(100),
	`quantity` decimal(10,2) NOT NULL,
	`unitPrice` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseLines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unleashOrderGuid` varchar(64) NOT NULL,
	`orderNumber` varchar(50) NOT NULL,
	`orderDate` timestamp NOT NULL,
	`hospitalId` int NOT NULL,
	`areaId` int,
	`customerRef` text,
	`rawAreaText` varchar(500),
	`orderStatus` varchar(50),
	`isReorder` boolean,
	`reorderConfirmed` boolean NOT NULL DEFAULT false,
	`linkedPurchaseId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `syncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`syncType` varchar(50) NOT NULL,
	`status` enum('running','completed','failed') NOT NULL,
	`recordsProcessed` int DEFAULT 0,
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `syncLogs_id` PRIMARY KEY(`id`)
);
