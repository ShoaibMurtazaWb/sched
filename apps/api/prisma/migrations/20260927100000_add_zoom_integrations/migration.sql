-- CreateEnum if not exists
DO $$ BEGIN
    CREATE TYPE "ZoomIntegrationStatus" AS ENUM ('CONNECTED', 'REVOKED', 'DISCONNECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "zoom_integrations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ZoomIntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "account_email" TEXT NOT NULL,
    "zoom_user_id" TEXT,
    "encrypted_access_token" TEXT,
    "encrypted_refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "scope" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "zoom_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "zoom_integrations_user_id_key" ON "zoom_integrations"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "zoom_integrations_user_id_status_idx" ON "zoom_integrations"("user_id", "status");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "zoom_integrations" ADD CONSTRAINT "zoom_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
