import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/landing";

export const dynamic = "force-static";

/* Una sola pagina: senza salvataggio ogni scheda mostra la stessa
   presentazione, e le altre hanno il canonical sulla radice. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }];
}
