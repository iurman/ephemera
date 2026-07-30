ALTER TABLE "drops" ADD COLUMN "enc_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "iv" text;--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "kdf_salt" text;--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "password_protected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "drops" ADD COLUMN "purged_at" timestamp;