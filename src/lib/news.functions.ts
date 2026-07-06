import { createServerFn } from "@tanstack/react-start";

type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  published_at: string;
  currencies?: string[];
};

// Free CryptoPanic public API — no key required for "posts" endpoint
export const getCryptoNews = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ items: NewsItem[] }> => {
    try {
      const res = await fetch("https://cryptopanic.com/api/free/v1/posts/?public=true", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return { items: [] };
      const json = (await res.json()) as {
        results?: Array<{
          id: number | string;
          title: string;
          url: string;
          source?: { title?: string };
          published_at?: string;
          created_at?: string;
          currencies?: Array<{ code: string }>;
        }>;
      };
      const items = (json.results ?? []).slice(0, 20).map((r) => ({
        id: String(r.id),
        title: r.title,
        url: r.url,
        source: r.source?.title ?? "CryptoPanic",
        published_at: r.published_at ?? r.created_at ?? new Date().toISOString(),
        currencies: r.currencies?.map((c) => c.code),
      }));
      return { items };
    } catch {
      return { items: [] };
    }
  });

type CoinPrice = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
};

// CoinGecko top coins ticker
export const getTopCoins = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ coins: CoinPrice[] }> => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&sparkline=false",
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return { coins: [] };
      const json = (await res.json()) as CoinPrice[];
      return { coins: json ?? [] };
    } catch {
      return { coins: [] };
    }
  });
