// src/utils/site/schema.ts

export const SITE_ORIGIN = "https://sortedtech.net";
export const SITE_NAME = "Sorted Tech";
export const TWITTER_HANDLE = "@SortedTechHQ";
export const DEFAULT_SITE_LOGO = "/site/images/st-logo.svg";
export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
export const LABS_ID = `${SITE_ORIGIN}/#labs`;
export const EDITORIAL_ID = `${SITE_ORIGIN}/#editorial`;

/** Official profiles: the footer links and the Organization `sameAs`. */
export const SOCIAL_PROFILES = {
  x: "https://x.com/SortedTechHQ",
  instagram: "https://www.instagram.com/SortedTechHQ",
  youtube: "https://www.youtube.com/@SortedTechHQ",
  reddit: "https://www.reddit.com/user/SortedTechHQ",
  telegram: "https://t.me/SortedTechHQ",
} as const;

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": ORGANIZATION_ID,
  name: SITE_NAME,
  url: SITE_ORIGIN,
  logo: {
    "@type": "ImageObject",
    url: normalizeUrl(DEFAULT_SITE_LOGO),
    width: 1024,
    height: 1024,
  },
  knowsAbout: [
    "Consumer Electronics",
    "Smartphone Technology",
    "Windows OS Internals",
    "Cloud Computing",
    "SaaS Architecture",
  ],
  sameAs: [
    SOCIAL_PROFILES.x,
    SOCIAL_PROFILES.instagram,
    SOCIAL_PROFILES.youtube,
    SOCIAL_PROFILES.reddit,
    SOCIAL_PROFILES.telegram,
  ],
};

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_NAME,
  alternateName: "SortedTech",
  url: `${SITE_ORIGIN}/`,
  publisher: {
    "@id": ORGANIZATION_ID,
  },
};

export const labsSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": LABS_ID,
  name: "Sorted Tech L.A.B.S.",
  alternateName: "Laboratory for Assessment, Benchmarking & Studies",
  url: `${SITE_ORIGIN}/methodology`,
  description:
    "The research and evaluation framework behind Sorted Tech's curated picks, benchmarks, and product assessments.",
  parentOrganization: {
    "@id": ORGANIZATION_ID,
  },
};

export const editorialSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": EDITORIAL_ID,
  name: "Sorted Tech Editorial",
  url: `${SITE_ORIGIN}/editorial`,
  description:
    "The editorial team responsible for Sorted Tech explainers, standards, and technical research synthesis.",
  parentOrganization: {
    "@id": ORGANIZATION_ID,
  },
};

export function normalizeUrl(url: string, siteOrigin = SITE_ORIGIN): string {
  return new URL(url, siteOrigin).href;
}

export function createAuthorSchema(
  name: string,
  url: string,
  siteOrigin = SITE_ORIGIN,
) {
  return {
    "@type": name.includes("Sorted Tech") ? "Organization" : "Person",
    name,
    url: normalizeUrl(url, siteOrigin),
  };
}

interface ArticleSchemaInput {
  authorName: string;
  authorUrl: string;
  description: string;
  image: string;
  publishedAt?: Date;
  siteOrigin?: string;
  title: string;
  updatedAt?: Date | null;
  urlPath: string;
}

interface ToolSchemaInput {
  description: string;
  name: string;
  url: string;
}

export function createTechArticleStructuredData({
  authorName,
  authorUrl,
  description,
  image,
  publishedAt,
  siteOrigin = SITE_ORIGIN,
  title,
  updatedAt,
  urlPath,
}: ArticleSchemaInput): object[] {
  const articleUrl = normalizeUrl(urlPath, siteOrigin);
  const authorAbsoluteUrl = new URL(authorUrl, siteOrigin);
  const isEditorialAuthor =
    authorName === "Sorted Tech Editorial" &&
    authorAbsoluteUrl.pathname === "/editorial";
  const authorSchema = isEditorialAuthor
    ? { "@id": EDITORIAL_ID }
    : createAuthorSchema(authorName, authorUrl, siteOrigin);

  return [
    ...(isEditorialAuthor ? [editorialSchema] : []),
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      "@id": `${articleUrl}#article`,
      headline: title,
      description,
      image: normalizeUrl(image, siteOrigin),
      url: articleUrl,
      mainEntityOfPage: articleUrl,
      ...(publishedAt ? { datePublished: publishedAt.toISOString() } : {}),
      ...(updatedAt ? { dateModified: updatedAt.toISOString() } : {}),
      author: authorSchema,
      isPartOf: { "@id": WEBSITE_ID },
      publisher: { "@id": ORGANIZATION_ID },
    },
  ];
}

export function createToolApplicationSchema({
  description,
  name,
  url,
}: ToolSchemaInput) {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern browser with JavaScript enabled.",
    isAccessibleForFree: true,
    publisher: {
      "@id": ORGANIZATION_ID,
    },
    isPartOf: {
      "@id": WEBSITE_ID,
    },
  };
}
