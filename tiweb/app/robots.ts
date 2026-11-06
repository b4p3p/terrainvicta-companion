import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/landing";

export const dynamic = "force-static";

/* Aperto a tutti, crawler delle AI compresi: comparire nelle loro risposte e'
   uno degli scopi. Quelli di ricerca delle AI sono nominati anche a parte,
   con le stesse regole: senza un gruppo loro, alcuni controlli SEO/GEO li
   danno per non considerati. */
const AI_SEARCH = ["OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"];

export default function robots(): MetadataRoute.Robots {
  const rule = { allow: "/", disallow: "/prova-cartella/" };
  return {
    rules: [{ userAgent: "*", ...rule }, { userAgent: AI_SEARCH, ...rule }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
