CREATE TABLE "growth_events" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sessionId" TEXT,
  "path" TEXT,
  "metadata" JSONB,
  "userId" TEXT,
  "projectId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "growth_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "growth_events_name_occurredAt_idx" ON "growth_events"("name", "occurredAt");
CREATE INDEX "growth_events_sessionId_occurredAt_idx" ON "growth_events"("sessionId", "occurredAt");
CREATE INDEX "growth_events_userId_occurredAt_idx" ON "growth_events"("userId", "occurredAt");
CREATE INDEX "growth_events_projectId_occurredAt_idx" ON "growth_events"("projectId", "occurredAt");

ALTER TABLE "growth_events"
  ADD CONSTRAINT "growth_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "growth_events"
  ADD CONSTRAINT "growth_events_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
