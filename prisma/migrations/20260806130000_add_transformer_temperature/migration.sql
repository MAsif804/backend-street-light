-- Enclosure temperature reported by the transformer's DS18B20 probe, in °C.
--
-- Nullable with no default on purpose: NULL is the meaningful "this unit does
-- not report a temperature" state that the inventory page renders as NULL and
-- the dashboard hides. A default of 0 would be indistinguishable from a real
-- freezing-cold reading.

-- AlterTable
ALTER TABLE "Transformer" ADD COLUMN "temperature" DOUBLE PRECISION;
