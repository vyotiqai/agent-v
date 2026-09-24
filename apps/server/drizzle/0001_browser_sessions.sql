CREATE TABLE "browser_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"task_id" text,
	"url" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_thread_id_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."threads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "browser_sessions" ADD CONSTRAINT "browser_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "browser_sessions_user_idx" ON "browser_sessions" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "browser_sessions_thread_idx" ON "browser_sessions" USING btree ("thread_id");--> statement-breakpoint
CREATE UNIQUE INDEX "browser_sessions_task_idx" ON "browser_sessions" USING btree ("task_id");