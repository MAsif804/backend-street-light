/*
  Warnings:

  - You are about to drop the column `sensorId` on the `Gateway` table. All the data in the column will be lost.
  - You are about to drop the column `street` on the `Gateway` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[deviceId]` on the table `Gateway` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `deviceId` to the `Gateway` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Gateway_sensorId_key";

-- AlterTable
ALTER TABLE "Gateway" DROP COLUMN "sensorId",
DROP COLUMN "street",
ADD COLUMN     "deviceId" TEXT NOT NULL,
ADD COLUMN     "installationLocation" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Gateway_deviceId_key" ON "Gateway"("deviceId");
