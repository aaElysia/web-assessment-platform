-- CreateTable
CREATE TABLE "Scale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scaleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "reverse" BOOLEAN NOT NULL DEFAULT false,
    "domain" TEXT NOT NULL,
    "options" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Item_scaleId_fkey" FOREIGN KEY ("scaleId") REFERENCES "Scale" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentVersion" TEXT,
    "consentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'created',
    "ageRange" TEXT,
    "gender" TEXT,
    "education" TEXT
);

-- CreateTable
CREATE TABLE "ResponseSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    CONSTRAINT "ResponseSession_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResponseItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResponseItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ResponseSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ResponseItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Scale_key_key" ON "Scale"("key");

-- CreateIndex
CREATE INDEX "Item_scaleId_idx" ON "Item"("scaleId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_scaleId_code_key" ON "Item"("scaleId", "code");

-- CreateIndex
CREATE INDEX "ResponseSession_participantId_idx" ON "ResponseSession"("participantId");

-- CreateIndex
CREATE INDEX "ResponseItem_itemId_idx" ON "ResponseItem"("itemId");

-- CreateIndex
CREATE INDEX "ResponseItem_sessionId_idx" ON "ResponseItem"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ResponseItem_sessionId_itemId_key" ON "ResponseItem"("sessionId", "itemId");
