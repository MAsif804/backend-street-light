-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OPERATOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ON', 'OFF');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('Light', 'Transformer', 'Gateway');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('ON', 'OFF');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "avatar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceModel" (
    "id" TEXT NOT NULL,
    "modelCode" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "ipRating" TEXT,
    "voltage" TEXT,
    "powerRating" TEXT,
    "loadCapacity" TEXT,
    "reqCurrent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gateway" (
    "id" TEXT NOT NULL,
    "sensorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFF',
    "region" TEXT,
    "cluster" TEXT,
    "street" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "voltage" TEXT,
    "loadCapacity" TEXT,
    "ipRating" TEXT,
    "operationHours" INTEGER NOT NULL DEFAULT 0,
    "deviceConnected" INTEGER NOT NULL DEFAULT 0,
    "current" TEXT,
    "lastActive" TIMESTAMP(3),
    "installationDate" TIMESTAMP(3),
    "lastMaintenance" TIMESTAMP(3),
    "deviceModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transformer" (
    "id" TEXT NOT NULL,
    "transformerId" TEXT NOT NULL,
    "deviceId" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFF',
    "region" TEXT,
    "cluster" TEXT,
    "installationLocation" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "voltage" TEXT,
    "loadCapacity" TEXT,
    "ipRating" TEXT,
    "operationHours" INTEGER NOT NULL DEFAULT 0,
    "lastActive" TIMESTAMP(3),
    "installationDate" TIMESTAMP(3),
    "lastMaintenance" TIMESTAMP(3),
    "gatewayId" TEXT,
    "deviceModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transformer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Light" (
    "id" TEXT NOT NULL,
    "lightId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFF',
    "region" TEXT,
    "cluster" TEXT,
    "street" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "voltage" TEXT,
    "powerRating" TEXT,
    "ipRating" TEXT,
    "requiredCurrent" TEXT,
    "requiredCurrentVariation" TEXT,
    "operationHours" INTEGER NOT NULL DEFAULT 0,
    "current" TEXT,
    "lastActive" TIMESTAMP(3),
    "installationDate" TIMESTAMP(3),
    "lastMaintenance" TIMESTAMP(3),
    "transformerId" TEXT,
    "deviceModelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Light_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condition" (
    "id" TEXT NOT NULL,
    "type" "ActionType" NOT NULL DEFAULT 'ON',
    "years" INTEGER NOT NULL DEFAULT 0,
    "months" INTEGER NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 0,
    "hours" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "scheduleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Condition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimePair" (
    "id" TEXT NOT NULL,
    "onTime" TEXT NOT NULL,
    "onPeriod" TEXT NOT NULL,
    "offTime" TEXT NOT NULL,
    "offPeriod" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "conditionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimePair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ScheduleToTransformer" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ScheduleToTransformer_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceModel_modelCode_key" ON "DeviceModel"("modelCode");

-- CreateIndex
CREATE UNIQUE INDEX "Gateway_sensorId_key" ON "Gateway"("sensorId");

-- CreateIndex
CREATE INDEX "Gateway_status_idx" ON "Gateway"("status");

-- CreateIndex
CREATE INDEX "Gateway_region_idx" ON "Gateway"("region");

-- CreateIndex
CREATE UNIQUE INDEX "Transformer_transformerId_key" ON "Transformer"("transformerId");

-- CreateIndex
CREATE INDEX "Transformer_status_idx" ON "Transformer"("status");

-- CreateIndex
CREATE INDEX "Transformer_gatewayId_idx" ON "Transformer"("gatewayId");

-- CreateIndex
CREATE UNIQUE INDEX "Light_lightId_key" ON "Light"("lightId");

-- CreateIndex
CREATE INDEX "Light_status_idx" ON "Light"("status");

-- CreateIndex
CREATE INDEX "Light_transformerId_idx" ON "Light"("transformerId");

-- CreateIndex
CREATE INDEX "Condition_scheduleId_idx" ON "Condition"("scheduleId");

-- CreateIndex
CREATE INDEX "TimePair_conditionId_idx" ON "TimePair"("conditionId");

-- CreateIndex
CREATE INDEX "_ScheduleToTransformer_B_index" ON "_ScheduleToTransformer"("B");

-- AddForeignKey
ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transformer" ADD CONSTRAINT "Transformer_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "Gateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transformer" ADD CONSTRAINT "Transformer_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Light" ADD CONSTRAINT "Light_transformerId_fkey" FOREIGN KEY ("transformerId") REFERENCES "Transformer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Light" ADD CONSTRAINT "Light_deviceModelId_fkey" FOREIGN KEY ("deviceModelId") REFERENCES "DeviceModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condition" ADD CONSTRAINT "Condition_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimePair" ADD CONSTRAINT "TimePair_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "Condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ScheduleToTransformer" ADD CONSTRAINT "_ScheduleToTransformer_A_fkey" FOREIGN KEY ("A") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ScheduleToTransformer" ADD CONSTRAINT "_ScheduleToTransformer_B_fkey" FOREIGN KEY ("B") REFERENCES "Transformer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
