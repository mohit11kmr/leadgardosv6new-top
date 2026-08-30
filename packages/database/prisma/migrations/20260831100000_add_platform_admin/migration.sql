-- Add platform administrator designation to User records
ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;
