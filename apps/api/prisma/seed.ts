import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

// Load apps/api/.env when running locally; ignored when absent (Docker sets the variables directly).
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  // rely on the process environment
}

const prisma = new PrismaClient();

async function seedGreetings() {
  const count = await prisma.greeting.count();
  if (count > 0) {
    console.log(`Greetings already seeded (${count}). Skipping.`);
    return;
  }

  await prisma.greeting.createMany({
    data: [
      { message: "Hello, World!" },
      { message: "Hello from SQLite via Prisma" },
      { message: "Hello from the GraphQL API" },
    ],
  });

  console.log("Seeded 3 greetings.");
}

// Checked separately from greetings so an existing database (e.g. a persisted
// Docker volume) still gets example views after this migration lands.
async function seedSavedViews() {
  const count = await prisma.savedView.count();
  if (count > 0) {
    console.log(`Saved views already seeded (${count}). Skipping.`);
    return;
  }

  await prisma.savedView.createMany({
    data: [
      {
        name: "G7 GDP per capita",
        indicator: "NY.GDP.PCAP.CD",
        year: 2023,
        countries: "CAN,FRA,DEU,ITA,JPN,GBR,USA",
        order: "DESC",
        region: null,
      },
      {
        name: "Life expectancy in Africa",
        indicator: "SP.DYN.LE00.IN",
        year: 2022,
        countries: "NGA,ZAF,KEN,ETH,EGY",
        order: "ASC",
        region: "Sub-Saharan Africa",
      },
      {
        name: "Population giants",
        indicator: "SP.POP.TOTL",
        year: 2023,
        countries: "CHN,IND,USA,IDN,PAK,BRA",
        order: "DESC",
        region: "South Asia",
      },
    ],
  });

  console.log("Seeded 3 saved views.");
}

async function main() {
  await seedGreetings();
  await seedSavedViews();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
