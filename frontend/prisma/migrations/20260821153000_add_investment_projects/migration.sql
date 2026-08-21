-- CreateTable
CREATE TABLE "InvestmentProject" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "quartier" TEXT NOT NULL,
    "priceFrom" INTEGER NOT NULL,
    "lotsLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'En cours',
    "developerName" TEXT,
    "image" TEXT NOT NULL,
    "image2" TEXT,
    "image3" TEXT,
    "recordStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentInterest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentProject_city_idx" ON "InvestmentProject"("city");

-- CreateIndex
CREATE INDEX "InvestmentProject_ownerId_idx" ON "InvestmentProject"("ownerId");

-- CreateIndex
CREATE INDEX "InvestmentProject_recordStatus_createdAt_idx" ON "InvestmentProject"("recordStatus", "createdAt");

-- CreateIndex
CREATE INDEX "InvestmentInterest_projectId_createdAt_idx" ON "InvestmentInterest"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "InvestmentProject" ADD CONSTRAINT "InvestmentProject_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentInterest" ADD CONSTRAINT "InvestmentInterest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "InvestmentProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
