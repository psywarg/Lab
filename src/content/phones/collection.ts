import { glob } from "astro/loaders";
import { defineCollection } from "astro:content";
import { z } from "astro/zod";

export const explainers = defineCollection({
  loader: glob({
    pattern: "**/*.mdx",
    base: "./src/content/phones/explainers",
    generateId: ({ entry }) => {
      const withoutExt = entry.replace(/\.mdx$/, "");
      return withoutExt.replace(/\/index$/, "");
    },
  }),
  schema: ({ image }) =>
    z.object({
      draft: z.boolean().default(false),
      title: z.string(),
      metaDescription: z.string(),
      publishedAt: z.coerce.date().optional(),
      updatedAt: z.coerce.date().optional(),
      authorName: z.string().optional(),
      authorUrl: z.string().optional(),
      cardTitle: z.string(),
      cardDescription: z.string(),
      heading: z.string(),
      image: image(),
      series: z.string(),
      role: z.enum(["overview", "part", "related"]),
      order: z.number().optional(),
      relatedOrder: z.number().optional(),
    }),
});
