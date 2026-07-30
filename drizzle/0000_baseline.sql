CREATE TABLE "drops" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"owner_id" varchar(36),
	"kind" varchar(16) DEFAULT 'text' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"ttl_ms" integer NOT NULL,
	"max_views" integer NOT NULL,
	"used_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"first_viewed_at" timestamp,
	"last_viewed_at" timestamp,
	"exhausted_at" timestamp,
	CONSTRAINT "drops_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_by" varchar(36),
	"used_at" timestamp,
	"max_uses" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"password_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "views" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"drop_id" varchar(36) NOT NULL,
	"viewed_at" timestamp DEFAULT now() NOT NULL,
	"ua" text,
	"ip" text
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "views" ADD CONSTRAINT "views_drop_id_drops_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drops_token_idx" ON "drops" USING btree ("token");--> statement-breakpoint
CREATE INDEX "drops_state_idx" ON "drops" USING btree ("expires_at","revoked_at","used_views","max_views");--> statement-breakpoint
CREATE INDEX "drops_owner_idx" ON "drops" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "invites_exp_idx" ON "invites" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "views_drop_idx" ON "views" USING btree ("drop_id");--> statement-breakpoint
CREATE INDEX "views_time_idx" ON "views" USING btree ("viewed_at");