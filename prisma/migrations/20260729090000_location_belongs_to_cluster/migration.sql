-- Move Location from belonging to a City to belonging to a Cluster.
-- (The Location table was emptied before this migration, so dropping/adding
--  the NOT NULL column is safe.)

-- DropForeignKey
ALTER TABLE "Location" DROP CONSTRAINT "Location_cityId_fkey";

-- DropIndex
DROP INDEX "Location_cityId_idx";

-- DropIndex
DROP INDEX "Location_cityId_name_key";

-- AlterTable
ALTER TABLE "Location" DROP COLUMN "cityId",
ADD COLUMN "clusterId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Location_clusterId_idx" ON "Location"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "Location_clusterId_name_key" ON "Location"("clusterId", "name");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
