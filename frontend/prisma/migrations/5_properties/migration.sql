-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "txn" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "quartier" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '',
    "beds" INTEGER NOT NULL DEFAULT 0,
    "baths" INTEGER NOT NULL DEFAULT 0,
    "surface" INTEGER NOT NULL,
    "badge" TEXT NOT NULL DEFAULT 'Nouveau',
    "image" TEXT NOT NULL,
    "image2" TEXT NOT NULL,
    "image3" TEXT NOT NULL,
    "photos" INTEGER NOT NULL DEFAULT 1,
    "views" INTEGER NOT NULL DEFAULT 0,
    "favs" INTEGER NOT NULL DEFAULT 0,
    "agent" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "charges" TEXT NOT NULL DEFAULT 'Non applicable',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Property_txn_status_idx" ON "Property"("txn", "status");

-- CreateIndex
CREATE INDEX "Property_city_idx" ON "Property"("city");

-- CreateIndex
CREATE INDEX "Property_ownerId_idx" ON "Property"("ownerId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
