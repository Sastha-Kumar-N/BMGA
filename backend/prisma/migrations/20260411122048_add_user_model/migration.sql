-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'RESEARCHER', 'INDUSTRY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organism" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "strain" TEXT NOT NULL,
    "sampleSource" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organism_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolResult" (
    "id" SERIAL NOT NULL,
    "toolName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "organismId" INTEGER NOT NULL,

    CONSTRAINT "ToolResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ToolResult" ADD CONSTRAINT "ToolResult_organismId_fkey" FOREIGN KEY ("organismId") REFERENCES "Organism"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
