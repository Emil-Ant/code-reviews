import { createSchema } from "graphql-yoga";
import { GraphQLError } from "graphql";
import { Prisma } from "@prisma/client";
import { prisma } from "./db.js";

export const typeDefs = /* GraphQL */ `
  type Greeting {
    id: Int!
    message: String!
    createdAt: String!
  }

  "A country as classified by the World Bank."
  type Country {
    "ISO 3166-1 alpha-3 code, e.g. GBR"
    code: String!
    "ISO 3166-1 alpha-2 code, e.g. GB"
    iso2Code: String!
    name: String!
    region: String!
    regionCode: String!
    incomeLevel: String!
    incomeLevelCode: String!
    capitalCity: String
    latitude: Float
    longitude: Float
    "Observations for this country, optionally filtered by indicator and year range."
    observations(indicatorCode: String, fromYear: Int, toYear: Int): [Observation!]!
  }

  "A World Bank data series, e.g. GDP per capita."
  type Indicator {
    code: String!
    name: String!
    sourceNote: String
    sourceOrganization: String
    lastFetchedAt: String
    "Number of stored observations for this indicator."
    observationCount: Int!
    "Earliest and latest year with data."
    yearRange: YearRange
    "Most recent year with data for at least 100 countries. Use this as a sensible default year."
    latestYear: Int
  }

  type YearRange {
    min: Int!
    max: Int!
  }

  "One indicator value for one country in one year."
  type Observation {
    id: Int!
    countryCode: String!
    indicatorCode: String!
    year: Int!
    value: Float!
    country: Country!
    indicator: Indicator!
  }

  "Row counts and freshness of the ingested dataset."
  type DataSummary {
    countries: Int!
    indicators: Int!
    observations: Int!
    regions: [String!]!
    incomeLevels: [String!]!
    lastIngestedAt: String
  }

  "Headline figures for the dashboard."
  type DashboardSummary {
    "Sum of the latest population figures across all countries."
    worldPopulation: Float!
    worldPopulationYear: Int!
    "Simple (unweighted) mean of life expectancy across countries."
    avgLifeExpectancy: Float!
    avgLifeExpectancyYear: Int!
    countries: Int!
    "Latest year present anywhere in the dataset."
    latestYear: Int!
  }

  "Unweighted mean of an indicator across the countries in a region."
  type RegionAverage {
    region: String!
    regionCode: String!
    average: Float!
    "Number of countries in the region that had a value for the year."
    countryCount: Int!
  }

  type SnapshotValue {
    indicatorCode: String!
    value: Float!
  }

  "Several indicator values for one country in one year."
  type CountrySnapshot {
    country: Country!
    "Only indicators that have a value for the year are present."
    values: [SnapshotValue!]!
  }

  enum SortOrder {
    ASC
    DESC
  }

  "A named dashboard configuration. Saved views are shared by everyone using the app."
  type SavedView {
    id: Int!
    "Unique display name, 1-60 characters."
    name: String!
    "Code of the indicator shown. It may no longer exist in the database."
    indicator: String!
    "Year used for the ranking and regional charts."
    year: Int!
    "ISO3 codes of the countries on the line chart, in display order."
    countries: [String!]!
    "Ranking order."
    order: SortOrder!
    "Region highlighted on the GDP vs life expectancy chart, or null for none."
    region: String
    createdAt: String!
  }

  "Everything needed to recreate a dashboard configuration."
  input SavedViewInput {
    "Display name. Trimmed and first letter capitalised; must be 1-60 characters and not match an existing view (ignoring case)."
    name: String!
    indicator: String!
    year: Int!
    "1 to 8 ISO3 country codes."
    countries: [String!]!
    order: SortOrder!
    region: String
  }

  type Query {
    "Simple health-check style query that does not touch the database."
    hello: String!

    "All greetings stored in the SQLite database, newest first."
    greetings: [Greeting!]!

    "Counts and freshness of the World Bank data."
    dataSummary: DataSummary!

    "Countries, optionally filtered by region and/or income level."
    countries(region: String, incomeLevel: String): [Country!]!

    "A single country by ISO3 code."
    country(code: String!): Country

    "All ingested indicators."
    indicators: [Indicator!]!

    "A single indicator by code."
    indicator(code: String!): Indicator

    """
    Observations for an indicator. Filter by country codes and/or year range.
    Results are ordered by year then country code.
    """
    observations(
      indicatorCode: String!
      countryCodes: [String!]
      fromYear: Int
      toYear: Int
    ): [Observation!]!

    """
    Top (or bottom) countries for an indicator in a given year.
    """
    ranking(indicatorCode: String!, year: Int!, limit: Int = 10, order: SortOrder = DESC): [Observation!]!

    "Headline figures for the dashboard."
    dashboardSummary: DashboardSummary!

    "Unweighted mean of an indicator per World Bank region for a year, sorted by average descending."
    regionAverages(indicatorCode: String!, year: Int!): [RegionAverage!]!

    """
    For every country, the values of the requested indicators in a year.
    Countries with no value for any of the indicators are omitted.
    """
    countrySnapshot(indicatorCodes: [String!]!, year: Int!): [CountrySnapshot!]!

    "Saved dashboard views, newest first. Pass limit to get only the most recent few."
    savedViews(limit: Int): [SavedView!]!

    "A single saved view by id, or null if it has been deleted."
    savedView(id: Int!): SavedView
  }

  type Mutation {
    "Store a new greeting in the database and return it."
    addGreeting(message: String!): Greeting!

    "Save the current dashboard configuration under a name. Fails with a readable message if the name is invalid or taken."
    createSavedView(input: SavedViewInput!): SavedView!

    "Delete a saved view. Returns false if it did not exist."
    deleteSavedView(id: Int!): Boolean!
  }
`;

type YearArgs = { fromYear?: number | null; toYear?: number | null };

function yearFilter({ fromYear, toYear }: YearArgs): Prisma.IntFilter | undefined {
  if (fromYear == null && toYear == null) return undefined;
  return {
    ...(fromYear != null ? { gte: fromYear } : {}),
    ...(toYear != null ? { lte: toYear } : {}),
  };
}

/** Latest year in which an indicator has values for at least `minCountries` countries. */
async function latestYearWithCoverage(indicatorCode: string, minCountries = 100): Promise<number | null> {
  const rows = await prisma.observation.groupBy({
    by: ["year"],
    where: { indicatorCode },
    _count: { _all: true },
    orderBy: { year: "desc" },
  });
  return rows.find((r) => r._count._all >= minCountries)?.year ?? null;
}

const SAVED_VIEW_NAME_MAX = 60;
const SAVED_VIEW_MAX_COUNTRIES = 8;

type SavedViewInput = {
  name: string;
  indicator: string;
  year: number;
  countries: string[];
  order: "ASC" | "DESC";
  region?: string | null;
};

/** A user-facing validation error. Yoga masks plain Errors, but passes GraphQLError messages through. */
function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function duplicateName(name: string): GraphQLError {
  return badInput(`A saved view called "${name}" already exists. Choose a different name.`);
}

async function createSavedView(input: SavedViewInput) {
  const trimmed = input.name.trim();
  if (!trimmed) throw badInput("Give the view a name.");
  // Capitalise the first letter only, so acronyms and the rest of the name stay as typed.
  const name = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  if (name.length > SAVED_VIEW_NAME_MAX) {
    throw badInput(`Names can be at most ${SAVED_VIEW_NAME_MAX} characters (this one has ${name.length}).`);
  }

  const indicator = input.indicator.trim();
  if (!indicator) throw badInput("A saved view needs an indicator.");
  if (!Number.isInteger(input.year) || input.year <= 0) throw badInput("Year must be a positive whole number.");

  const countries = input.countries.map((c) => c.trim().toUpperCase());
  if (countries.length === 0 || countries.length > SAVED_VIEW_MAX_COUNTRIES) {
    throw badInput(`A saved view needs between 1 and ${SAVED_VIEW_MAX_COUNTRIES} countries.`);
  }
  if (countries.some((c) => !/^[A-Z]{3}$/.test(c))) throw badInput("Countries must be ISO3 codes such as GBR.");

  // SQLite's unique index is case-sensitive; treat "GDP" and "gdp" as the same name.
  const clash = await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM "SavedView" WHERE lower(name) = lower(${name}) LIMIT 1
  `;
  if (clash.length) throw duplicateName(name);

  try {
    return await prisma.savedView.create({
      data: {
        name,
        indicator,
        year: input.year,
        countries: countries.join(","),
        order: input.order,
        region: input.region?.trim() || null,
      },
    });
  } catch (err) {
    // Backstop for two saves racing past the check above.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw duplicateName(name);
    throw err;
  }
}

const POPULATION = "SP.POP.TOTL";
const LIFE_EXPECTANCY = "SP.DYN.LE00.IN";

export const resolvers = {
  Query: {
    hello: () => "Hello, World!",

    greetings: async () => prisma.greeting.findMany({ orderBy: { createdAt: "desc" } }),

    dataSummary: async () => {
      const [countries, indicators, observations, regionRows, incomeRows, latest] = await Promise.all([
        prisma.country.count(),
        prisma.indicator.count(),
        prisma.observation.count(),
        prisma.country.findMany({ distinct: ["region"], select: { region: true }, orderBy: { region: "asc" } }),
        prisma.country.findMany({
          distinct: ["incomeLevel"],
          select: { incomeLevel: true },
          orderBy: { incomeLevel: "asc" },
        }),
        prisma.indicator.findFirst({
          where: { lastFetchedAt: { not: null } },
          orderBy: { lastFetchedAt: "desc" },
          select: { lastFetchedAt: true },
        }),
      ]);
      return {
        countries,
        indicators,
        observations,
        regions: regionRows.map((r) => r.region),
        incomeLevels: incomeRows.map((r) => r.incomeLevel),
        lastIngestedAt: latest?.lastFetchedAt?.toISOString() ?? null,
      };
    },

    countries: async (_p: unknown, args: { region?: string | null; incomeLevel?: string | null }) =>
      prisma.country.findMany({
        where: {
          ...(args.region ? { region: args.region } : {}),
          ...(args.incomeLevel ? { incomeLevel: args.incomeLevel } : {}),
        },
        orderBy: { name: "asc" },
      }),

    country: async (_p: unknown, args: { code: string }) =>
      prisma.country.findUnique({ where: { code: args.code.toUpperCase() } }),

    indicators: async () => prisma.indicator.findMany({ orderBy: { name: "asc" } }),

    indicator: async (_p: unknown, args: { code: string }) =>
      prisma.indicator.findUnique({ where: { code: args.code } }),

    observations: async (
      _p: unknown,
      args: { indicatorCode: string; countryCodes?: string[] | null } & YearArgs,
    ) =>
      prisma.observation.findMany({
        where: {
          indicatorCode: args.indicatorCode,
          ...(args.countryCodes?.length ? { countryCode: { in: args.countryCodes.map((c) => c.toUpperCase()) } } : {}),
          ...(yearFilter(args) ? { year: yearFilter(args) } : {}),
        },
        orderBy: [{ year: "asc" }, { countryCode: "asc" }],
      }),

    ranking: async (
      _p: unknown,
      args: { indicatorCode: string; year: number; limit?: number | null; order?: "ASC" | "DESC" | null },
    ) => {
      const limit = Math.min(Math.max(args.limit ?? 10, 1), 250);
      return prisma.observation.findMany({
        where: { indicatorCode: args.indicatorCode, year: args.year },
        orderBy: { value: args.order === "ASC" ? "asc" : "desc" },
        take: limit,
      });
    },

    dashboardSummary: async () => {
      const [popYear, leYear, countries, latest] = await Promise.all([
        latestYearWithCoverage(POPULATION),
        latestYearWithCoverage(LIFE_EXPECTANCY),
        prisma.country.count(),
        prisma.observation.aggregate({ _max: { year: true } }),
      ]);
      const [pop, le] = await Promise.all([
        popYear == null
          ? null
          : prisma.observation.aggregate({ where: { indicatorCode: POPULATION, year: popYear }, _sum: { value: true } }),
        leYear == null
          ? null
          : prisma.observation.aggregate({ where: { indicatorCode: LIFE_EXPECTANCY, year: leYear }, _avg: { value: true } }),
      ]);
      return {
        worldPopulation: pop?._sum.value ?? 0,
        worldPopulationYear: popYear ?? 0,
        avgLifeExpectancy: le?._avg.value ?? 0,
        avgLifeExpectancyYear: leYear ?? 0,
        countries,
        latestYear: latest._max.year ?? 0,
      };
    },

    regionAverages: async (_p: unknown, args: { indicatorCode: string; year: number }) => {
      const rows = await prisma.observation.findMany({
        where: { indicatorCode: args.indicatorCode, year: args.year },
        select: { value: true, country: { select: { region: true, regionCode: true } } },
      });
      const buckets = new Map<string, { region: string; regionCode: string; sum: number; count: number }>();
      for (const row of rows) {
        const b = buckets.get(row.country.regionCode) ?? {
          region: row.country.region,
          regionCode: row.country.regionCode,
          sum: 0,
          count: 0,
        };
        b.sum += row.value;
        b.count += 1;
        buckets.set(row.country.regionCode, b);
      }
      return [...buckets.values()]
        .map((b) => ({ region: b.region, regionCode: b.regionCode, average: b.sum / b.count, countryCount: b.count }))
        .sort((a, b) => b.average - a.average);
    },

    countrySnapshot: async (_p: unknown, args: { indicatorCodes: string[]; year: number }) => {
      const rows = await prisma.observation.findMany({
        where: { indicatorCode: { in: args.indicatorCodes }, year: args.year },
        include: { country: true },
        orderBy: { countryCode: "asc" },
      });
      const byCountry = new Map<string, { country: (typeof rows)[number]["country"]; values: { indicatorCode: string; value: number }[] }>();
      for (const row of rows) {
        const entry = byCountry.get(row.countryCode) ?? { country: row.country, values: [] };
        entry.values.push({ indicatorCode: row.indicatorCode, value: row.value });
        byCountry.set(row.countryCode, entry);
      }
      return [...byCountry.values()];
    },

    savedViews: async (_p: unknown, args: { limit?: number | null }) =>
      prisma.savedView.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(args.limit != null ? { take: Math.max(args.limit, 0) } : {}),
      }),

    savedView: async (_p: unknown, args: { id: number }) => prisma.savedView.findUnique({ where: { id: args.id } }),
  },

  Mutation: {
    addGreeting: async (_parent: unknown, args: { message: string }) => {
      const message = args.message.trim();
      if (!message) {
        throw new Error("Greeting message cannot be empty.");
      }
      return prisma.greeting.create({ data: { message } });
    },

    createSavedView: async (_p: unknown, args: { input: SavedViewInput }) => createSavedView(args.input),

    deleteSavedView: async (_p: unknown, args: { id: number }) => {
      const { count } = await prisma.savedView.deleteMany({ where: { id: args.id } });
      return count > 0;
    },
  },

  SavedView: {
    countries: (parent: { countries: string }) => parent.countries.split(",").filter(Boolean),
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },

  Greeting: {
    createdAt: (parent: { createdAt: Date }) => parent.createdAt.toISOString(),
  },

  Country: {
    observations: async (parent: { code: string }, args: { indicatorCode?: string | null } & YearArgs) =>
      prisma.observation.findMany({
        where: {
          countryCode: parent.code,
          ...(args.indicatorCode ? { indicatorCode: args.indicatorCode } : {}),
          ...(yearFilter(args) ? { year: yearFilter(args) } : {}),
        },
        orderBy: [{ indicatorCode: "asc" }, { year: "asc" }],
      }),
  },

  Indicator: {
    lastFetchedAt: (parent: { lastFetchedAt: Date | null }) => parent.lastFetchedAt?.toISOString() ?? null,
    observationCount: (parent: { code: string }) =>
      prisma.observation.count({ where: { indicatorCode: parent.code } }),
    latestYear: (parent: { code: string }) => latestYearWithCoverage(parent.code),
    yearRange: async (parent: { code: string }) => {
      const agg = await prisma.observation.aggregate({
        where: { indicatorCode: parent.code },
        _min: { year: true },
        _max: { year: true },
      });
      if (agg._min.year == null || agg._max.year == null) return null;
      return { min: agg._min.year, max: agg._max.year };
    },
  },

  Observation: {
    country: (parent: { countryCode: string }) =>
      prisma.country.findUniqueOrThrow({ where: { code: parent.countryCode } }),
    indicator: (parent: { indicatorCode: string }) =>
      prisma.indicator.findUniqueOrThrow({ where: { code: parent.indicatorCode } }),
  },
};

export const schema = createSchema({ typeDefs, resolvers });
