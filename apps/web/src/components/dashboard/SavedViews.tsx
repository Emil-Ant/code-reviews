"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { deleteView, saveView, type SaveViewState } from "@/app/dashboard/actions";
import type { SortOrder } from "@/lib/dashboard";
import { savedViewHref, type SavedView } from "@/lib/savedViews";

type Props = {
  views: Pick<SavedView, "id" | "name">[];
  activeViewId: number | null;
  /** The configuration currently on screen; this is what Save stores. */
  current: { indicator: string; year: number; countries: string[]; order: SortOrder; region: string | null };
  /** Where to go if the view being shown is deleted: the same settings, without the view. */
  exitHref: string;
};

const NAME_MAX = 60;
const initialState: SaveViewState = { error: null };

export function SavedViews({ views, activeViewId, current, exitHref }: Props) {
  const router = useRouter();
  const [state, formAction, saving] = useActionState(saveView, initialState);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  function onDelete(view: Pick<SavedView, "id" | "name">) {
    if (!window.confirm(`Delete the saved view "${view.name}"? This cannot be undone.`)) return;
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteView(view.id);
      if (result.error) setDeleteError(result.error);
      else if (view.id === activeViewId) router.replace(exitHref, { scroll: false });
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-base font-medium">Saved views</h2>
        <form action={formAction} className="flex flex-col gap-1">
          <input type="hidden" name="indicator" value={current.indicator} />
          <input type="hidden" name="year" value={current.year} />
          <input type="hidden" name="countries" value={current.countries.join(",")} />
          <input type="hidden" name="order" value={current.order} />
          <input type="hidden" name="region" value={current.region ?? ""} />
          <div className="flex gap-2">
            <input
              name="name"
              required
              maxLength={NAME_MAX}
              placeholder="Name this view"
              aria-label="Saved view name"
              aria-invalid={state.error ? true : undefined}
              aria-describedby={state.error ? "save-view-error" : undefined}
              className="w-56 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "Saving…" : "Save current view"}
            </button>
          </div>
          {state.error && (
            <p id="save-view-error" role="alert" className="text-xs text-red-700 dark:text-red-300">
              {state.error}
            </p>
          )}
        </form>
      </div>

      {views.length === 0 ? (
        <p className="text-sm text-zinc-500">No saved views yet. Set up the dashboard and save it here.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {views.map((view) => {
            const active = view.id === activeViewId;
            return (
              <li
                key={view.id}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                <Link href={savedViewHref(view.id)} aria-current={active ? "page" : undefined} className="hover:underline">
                  {view.name}
                </Link>
                <button
                  type="button"
                  disabled={deleting}
                  aria-label={`Delete ${view.name}`}
                  onClick={() => onDelete(view)}
                  className="opacity-60 hover:opacity-100 disabled:opacity-30"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {deleteError && (
        <p role="alert" className="text-xs text-red-700 dark:text-red-300">
          {deleteError}
        </p>
      )}
    </section>
  );
}
