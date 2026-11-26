import type { DashboardParams, SortOrder } from "@/lib/dashboard";
import { gqlFetch } from "@/lib/graphql";

export type SavedView = {
  id: number;
  name: string;
  indicator: string;
  year: number;
  countries: string[];
  order: SortOrder;
  region: string | null;
  createdAt: string;
};

const FIELDS = /* GraphQL */ `
  fragment SavedViewFields on SavedView {
    id
    name
    indicator
    year
    countries
    order
    region
    createdAt
  }
`;

/** Link that opens a saved view. The dashboard loads its settings from the database. */
export function savedViewHref(id: number): string {
  return `/dashboard?view=${id}`;
}

export function savedViewToParams(view: SavedView): DashboardParams {
  return {
    indicator: view.indicator,
    year: view.year,
    countries: view.countries,
    order: view.order,
    region: view.region,
  };
}

export async function fetchSavedViews(limit?: number): Promise<SavedView[]> {
  const data = await gqlFetch<{ savedViews: SavedView[] }>(
    `${FIELDS} query SavedViews($limit: Int) { savedViews(limit: $limit) { ...SavedViewFields } }`,
    { limit },
  );
  return data.savedViews;
}

export async function fetchSavedView(id: number): Promise<SavedView | null> {
  const data = await gqlFetch<{ savedView: SavedView | null }>(
    `${FIELDS} query SavedView($id: Int!) { savedView(id: $id) { ...SavedViewFields } }`,
    { id },
  );
  return data.savedView;
}

export async function createSavedView(
  input: { name: string; year: number } & Omit<DashboardParams, "year">,
): Promise<SavedView> {
  const data = await gqlFetch<{ createSavedView: SavedView }>(
    `${FIELDS} mutation CreateSavedView($input: SavedViewInput!) { createSavedView(input: $input) { ...SavedViewFields } }`,
    { input },
  );
  return data.createSavedView;
}

export async function deleteSavedView(id: number): Promise<boolean> {
  const data = await gqlFetch<{ deleteSavedView: boolean }>(
    `mutation DeleteSavedView($id: Int!) { deleteSavedView(id: $id) }`,
    { id },
  );
  return data.deleteSavedView;
}
