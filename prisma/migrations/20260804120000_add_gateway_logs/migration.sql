-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'OK', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "GatewayLog" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "source" TEXT NOT NULL DEFAULT 'GATEWAY',
    "message" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gatewayId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GatewayLog_gatewayId_timestamp_idx" ON "GatewayLog"("gatewayId", "timestamp");

-- AddForeignKey
ALTER TABLE "GatewayLog" ADD CONSTRAINT "GatewayLog_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE CASCADE ON UPDATE CASCADE;
