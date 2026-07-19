-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "workspace" TEXT NOT NULL,
    "poste" TEXT NOT NULL DEFAULT '',
    "localisation" TEXT NOT NULL DEFAULT '',
    "experience" TEXT NOT NULL DEFAULT '',
    "secteurs" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "workspace" TEXT NOT NULL,
    "franceTravailClientId" TEXT NOT NULL DEFAULT '',
    "franceTravailSecretEnc" TEXT NOT NULL DEFAULT '',
    "adzunaAppId" TEXT NOT NULL DEFAULT '',
    "adzunaAppKeyEnc" TEXT NOT NULL DEFAULT '',
    "googleCseId" TEXT NOT NULL DEFAULT '',
    "googleCseKeyEnc" TEXT NOT NULL DEFAULT '',
    "gmailAddress" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "workspace" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "entreprise" TEXT NOT NULL,
    "lieu" TEXT NOT NULL,
    "contact" TEXT,
    "exigences" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_workspace_key" ON "Profile"("workspace");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_workspace_key" ON "Settings"("workspace");

-- CreateIndex
CREATE INDEX "Offer_workspace_idx" ON "Offer"("workspace");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_workspace_externalId_key" ON "Offer"("workspace", "externalId");
