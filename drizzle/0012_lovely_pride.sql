CREATE INDEX `idx_areas_hospital` ON `areas` (`hospitalId`);--> statement-breakpoint
CREATE INDEX `idx_purchaselines_purchase` ON `purchaseLines` (`purchaseId`);--> statement-breakpoint
CREATE INDEX `idx_purchaselines_product_type` ON `purchaseLines` (`productType`);--> statement-breakpoint
CREATE INDEX `idx_purchases_hospital` ON `purchases` (`hospitalId`);--> statement-breakpoint
CREATE INDEX `idx_purchases_area` ON `purchases` (`areaId`);--> statement-breakpoint
CREATE INDEX `idx_purchases_hospital_area` ON `purchases` (`hospitalId`,`areaId`);--> statement-breakpoint
CREATE INDEX `idx_purchases_order_date` ON `purchases` (`orderDate`);--> statement-breakpoint
CREATE INDEX `idx_purchases_invoice_date` ON `purchases` (`invoiceDate`);