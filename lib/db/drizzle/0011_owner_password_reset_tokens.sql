CREATE TABLE IF NOT EXISTS "owner_password_reset_tokens" (
	"id"         serial    PRIMARY KEY NOT NULL,
	"user_id"    integer   NOT NULL,
	"token"      text      NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at"    timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "owner_password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "owner_password_reset_tokens" ADD CONSTRAINT "owner_password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
