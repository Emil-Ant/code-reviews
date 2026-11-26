"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { parseParams, type RawSearchParams } from "@/lib/dashboard";
import { createSavedView, deleteSavedView, savedViewHref } from "@/lib/savedViews";

export type SaveViewState = { error: string | null };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Save the configuration posted by the SavedViews form, then open the new view. */
export async function saveView(_prev: SaveViewState, formData: FormData): Promise<SaveViewState> {
  const raw: RawSearchParams = {};
  for (const key of ["indicator", "year", "countries", "order", "region"]) {
    const v = formData.get(key);
    if (typeof v === "string") raw[key] = v;
  }
  const params = parseParams(raw);
  if (params.year == null) return { error: "Pick a year before saving." };

  let id: number;
  try {
    const view = await createSavedView({
      name: String(formData.get("name") ?? ""),
      ...params,
      year: params.year,
    });
    id = view.id;
  } catch (err) {
    // The API returns readable validation messages (name taken, too long, ...).
    return { error: errorMessage(err) };
  }
  redirect(savedViewHref(id));
}

export async function deleteView(id: number): Promise<{ error: string | null }> {
  try {
    await deleteSavedView(id);
  } catch (err) {
    return { error: errorMessage(err) };
  }
  refresh();
  return { error: null };
}
