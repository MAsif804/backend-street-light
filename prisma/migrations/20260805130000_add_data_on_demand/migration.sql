-- Data-on-demand: the dashboard leases a streaming window on a gateway, and the
-- gateway writes back what its transformers actually report.

-- AlterTable
ALTER TABLE "Gateway" ADD COLUMN "streamUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transformer" ADD COLUMN "reportedStatus" "DeviceStatus";
ALTER TABLE "Transformer" ADD COLUMN "faultCode" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transformer" ADD COLUMN "lastReportAt" TIMESTAMP(3);

-- CreateIndex
-- The gateway asks "is my lease still live"; the dashboard asks "which of these
-- transformers reported recently".
CREATE INDEX "Gateway_streamUntil_idx" ON "Gateway"("streamUntil");
CREATE INDEX "Transformer_lastReportAt_idx" ON "Transformer"("lastReportAt");
