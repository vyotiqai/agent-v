CREATE TABLE "computer_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"task_id" text,
	"command" text NOT NULL,
	"cwd" text NOT NULL,
	"status" text NOT NULL,
	"exit_code" integer,
	"stdout" text DEFAULT '' NOT NULL,
	"stderr" text DEFAULT '' NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "computer_commands" ADD CONSTRAINT "computer_commands_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "computer_commands" ADD CONSTRAINT "computer_commands_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "computer_commands_operation_idx" ON "computer_commands" USING btree ("user_id","operation_id");--> statement-breakpoint
CREATE INDEX "computer_commands_user_idx" ON "computer_commands" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "computer_commands_running_idx" ON "computer_commands" USING btree ("user_id") WHERE status = 'running';