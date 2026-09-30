CREATE TABLE `guest_import` (
	`user_id` text NOT NULL,
	`seq` integer NOT NULL,
	PRIMARY KEY(`user_id`, `seq`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
