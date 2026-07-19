-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "applied" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appliedAt" TIMESTAMP(3);
