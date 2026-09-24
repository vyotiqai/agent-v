CREATE TABLE "connections" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"account" text NOT NULL,
	"scopes" text NOT NULL,
	"refresh_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_workspaces" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"parent_id" text,
	"source" text NOT NULL,
	"page_count" integer,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"state" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"verifier" text NOT NULL,
	"capability" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_workspaces" ADD CONSTRAINT "demo_workspaces_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_provider_idx" ON "connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "files_user_idx" ON "files" USING btree ("user_id","created_at" DESC NULLS LAST);