-- Appointments occupy a slot [start, start + duration) instead of blocking the whole day.
ALTER TABLE "Schedule" ADD COLUMN "durationMinutes" INTEGER;
ALTER TABLE "WorkOrder" ADD COLUMN "durationMinutes" INTEGER;
