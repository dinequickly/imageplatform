-- Add is_starred column to generated_content table for favoriting study guides
ALTER TABLE "public"."generated_content"
ADD COLUMN IF NOT EXISTS "is_starred" BOOLEAN DEFAULT false;

-- Add index for starred content filtering
CREATE INDEX IF NOT EXISTS "idx_generated_content_starred"
ON "public"."generated_content" ("user_id", "is_starred")
WHERE "is_starred" = true;

-- Comment on column
COMMENT ON COLUMN "public"."generated_content"."is_starred" IS 'Indicates if the generated content (study guide, etc.) is starred/favorited by the user';
