CREATE TABLE IF NOT EXISTS "resources" (
	"id"               serial    PRIMARY KEY NOT NULL,
	"title"            text      NOT NULL,
	"description"      text,
	"type"             text      NOT NULL,
	"category"         text,
	"thumbnail"        text,
	"url"              text,
	"file_url"         text,
	"tags"             text[]    NOT NULL DEFAULT '{}',
	"featured"         boolean   NOT NULL DEFAULT false,
	"display_order"    integer   NOT NULL DEFAULT 0,
	"status"           text      NOT NULL DEFAULT 'draft',
	"approval_status"  text      NOT NULL DEFAULT 'pending',
	"visible_to"       text      NOT NULL DEFAULT 'all',
	"created_by"       integer,
	"approved_by"      integer,
	"publish_at"       timestamp,
	"expire_at"        timestamp,
	"duration"         text,
	"video_source"     text,
	"size_label"       text,
	"plan_name"        text,
	"plan_price"       text,
	"plan_period"      text,
	"plan_features"    text[]    DEFAULT '{}',
	"plan_highlight"   boolean   DEFAULT false,
	"plan_badge"       text,
	"plan_cta"         text,
	"icon_name"        text,
	"icon_color"       text,
	"question"         text,
	"answer"           text,
	"updated_by"       integer,
	"review_notes"     text,
	"rejection_reason" text,
	"deleted_at"       timestamp,
	"created_at"       timestamp NOT NULL DEFAULT now(),
	"updated_at"       timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
