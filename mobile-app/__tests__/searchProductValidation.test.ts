import { useState } from "react";
import {
  SearchProductProvider,
  useSearchProduct,
} from "@/components/providers/SearchProductProvider";
import { searchProducts } from "@/services";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useState: jest.fn(),
  useEffect: jest.fn(),
}));
jest.mock("@/components/providers/NotificationProvider", () => ({
  useNotification: () => ({ addNotification: jest.fn() }),
}));
jest.mock("@/services", () => ({ searchProducts: jest.fn() }));

type SearchContext = ReturnType<typeof useSearchProduct>;
const search = jest.mocked(searchProducts);
let states: unknown[];
let stateIndex: number;

// Exercise the provider's submission handler without a native renderer.
// Effects are not executed; these tests cover validation, API calls, and retries.
const renderProvider = (): SearchContext => {
  stateIndex = 0;
  return SearchProductProvider({ children: null }).props.value;
};

beforeEach(() => {
  jest.clearAllMocks();
  states = [];
  stateIndex = 0;
  search.mockResolvedValue([]);
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.mocked(useState).mockImplementation(((initial: unknown) => {
    const index = stateIndex++;
    if (index === states.length) {
      states.push(typeof initial === "function" ? initial() : initial);
    }
    return [states[index], (next: unknown) => {
      states[index] = typeof next === "function" ? next(states[index]) : next;
    }];
  }) as typeof useState);
});

afterEach(() => jest.restoreAllMocks());

describe("search submission validation", () => {
  it.each(["", "   ", "a", " a "])(
    "rejects %p without sending a product request",
    async (query) => {
      const context = renderProvider();
      context.setQuery(query);
      context.setProductResults([{ productName: "Old result" }] as SearchContext["productResults"]);

      await renderProvider().handleSearchProducts();
      const result = renderProvider();

      expect(search).not.toHaveBeenCalled();
      expect(result.queryInvalid).toBe(true);
      expect(result.hasSearched).toBe(true);
      expect(result.loading).toBe(false);
      expect(result.productResults).toEqual([]);
      expect(result.searchAttempt).toBe(1);
      expect(result.recentQueries).toEqual([]);
    }
  );

  it("accepts a two-character query and trims the request", async () => {
    renderProvider().setQuery(" ab ");

    await renderProvider().handleSearchProducts();
    const result = renderProvider();

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("ab");
    expect(result.lastQuery).toBe("ab");
    expect(result.queryInvalid).toBe(false);
    expect(result.loading).toBe(false);
    expect(result.searchAttempt).toBe(1);
    expect(result.recentQueries).toEqual(["ab"]);
  });

  it("records every repeated invalid keyboard submission for announcements", async () => {
    renderProvider().setQuery("x");

    await renderProvider().handleSearchProducts();
    await renderProvider().handleSearchProducts();

    expect(search).not.toHaveBeenCalled();
    expect(renderProvider().searchAttempt).toBe(2);
    expect(renderProvider().queryInvalid).toBe(true);
  });

  it("keeps recent queries unique while announcing repeated valid submissions", async () => {
    renderProvider().setQuery(" milk ");

    await renderProvider().handleSearchProducts();
    renderProvider().setQuery("milk");
    await renderProvider().handleSearchProducts();

    const result = renderProvider();
    expect(search).toHaveBeenCalledTimes(2);
    expect(result.searchAttempt).toBe(2);
    expect(result.recentQueries).toEqual(["milk"]);
  });

  it("keeps the submitted query and result announcement unchanged while editing the next query", async () => {
    renderProvider().setQuery("milk");
    await renderProvider().handleSearchProducts();

    renderProvider().setQuery("rice");
    const editing = renderProvider();
    expect(editing.query).toBe("rice");
    expect(editing.lastQuery).toBe("milk");
    expect(editing.hasSearched).toBe(true);
    expect(editing.productResults).toEqual([]);
    expect(editing.searchAttempt).toBe(1);
    expect(search).toHaveBeenCalledTimes(1);

    await editing.handleSearchProducts();
    expect(renderProvider().lastQuery).toBe("rice");
    expect(renderProvider().searchAttempt).toBe(2);
    expect(search).toHaveBeenLastCalledWith("rice");
  });

  it("keeps the five latest valid queries and allows clearing the history", async () => {
    for (const query of ["milk", "rice", "bread", "apple", "beans", "pasta"]) {
      renderProvider().setQuery(query);
      await renderProvider().handleSearchProducts();
    }

    renderProvider().setQuery(" a ");
    await renderProvider().handleSearchProducts();
    const result = renderProvider();
    expect(search).toHaveBeenCalledTimes(6);
    expect(result.recentQueries).toEqual(["pasta", "beans", "apple", "bread", "rice"]);
    expect(result.searchAttempt).toBe(7);

    result.clearRecentQueries();
    expect(renderProvider().recentQueries).toEqual([]);
  });
});
