import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts", // <-- This is the new line!
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});