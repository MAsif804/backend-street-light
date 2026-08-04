-- AlterTable
-- A batch of log lines posted together shares one `timestamp`, so it cannot
-- order them. `seq` is the monotonic insertion order the terminal reads by.
CREATE SEQUENCE "GatewayLog_seq_seq";
ALTER TABLE "GatewayLog" ADD COLUMN "seq" INTEGER NOT NULL DEFAULT nextval('"GatewayLog_seq_seq"');
ALTER SEQUENCE "GatewayLog_seq_seq" OWNED BY "GatewayLog"."seq";

-- CreateIndex
CREATE INDEX "GatewayLog_gatewayId_seq_idx" ON "GatewayLog"("gatewayId", "seq");
