CREATE TABLE "demo_pages" (
	"user_id" text NOT NULL,
	"slug" text NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "demo_pages_user_id_slug_pk" PRIMARY KEY("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE "finance_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text,
	"convention" text NOT NULL,
	"summary" jsonb NOT NULL,
	"transactions" jsonb NOT NULL,
	"goal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Personal' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"prompt" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"goal_id" text,
	"task_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitor_checks" (
	"id" text PRIMARY KEY NOT NULL,
	"monitor_id" text NOT NULL,
	"user_id" text NOT NULL,
	"outcome" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"price" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"goal_id" text,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"condition" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"currency" text,
	"interval_minutes" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_check_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_hash" text,
	"last_excerpt" text DEFAULT '' NOT NULL,
	"last_price" text,
	"matched" boolean DEFAULT false NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"error" text,
	"checks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "ideas_refreshed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "goal_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "milestone_id" text;--> statement-breakpoint
ALTER TABLE "demo_pages" ADD CONSTRAINT "demo_pages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_reports" ADD CONSTRAINT "finance_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_reports" ADD CONSTRAINT "finance_reports_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_checks" ADD CONSTRAINT "monitor_checks_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitor_checks" ADD CONSTRAINT "monitor_checks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finance_reports_user_idx" ON "finance_reports" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "goals_user_idx" ON "goals" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ideas_user_idx" ON "ideas" USING btree ("user_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monitor_checks_monitor_idx" ON "monitor_checks" USING btree ("monitor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monitors_user_idx" ON "monitors" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "monitors_due_idx" ON "monitors" USING btree ("next_check_at") WHERE status = 'active';--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_goal_idx" ON "tasks" USING btree ("goal_id");