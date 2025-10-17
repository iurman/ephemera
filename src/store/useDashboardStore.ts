import { create } from "zustand";
import { persist } from "zustand/middleware";

type Filter = "all" | "mine" | "active" | "expired" | "exhausted" | "revoked";

type State = {
  filter: Filter;
  search: string;
  sort: "newest" | "oldest";
  setFilter: (f: Filter) => void;
  setSearch: (q: string) => void;
  setSort: (s: "newest" | "oldest") => void;
};

export const useDashboardStore = create<State>()(
  persist(
    (set) => ({
      filter: "all",
      search: "",
      sort: "newest",
      setFilter: (filter) => set({ filter }),
      setSearch: (search) => set({ search }),
      setSort: (sort) => set({ sort }),
    }),
    { name: "ephemera-dashboard" }
  )
);
