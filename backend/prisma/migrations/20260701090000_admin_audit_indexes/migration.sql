CREATE INDEX IF NOT EXISTS "AdminLog_action_idx" ON "AdminLog"("action");
CREATE INDEX IF NOT EXISTS "AdminLog_targetType_targetId_createdAt_idx" ON "AdminLog"("targetType", "targetId", "createdAt");
