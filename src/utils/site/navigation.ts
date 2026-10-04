// src/utils/site/navigation.ts

export type NavSubmenuItem =
  | { label: string; href: string; items?: never }
  | { label: string; href?: never; items: { label: string; href: string }[] };

export type NavMenuItem = {
  href: string;
  label: string;
  submenu: NavSubmenuItem[];
};

export const MAIN_NAV_ITEMS: NavMenuItem[] = [
  {
    label: "Phones",
    href: "/phones",
    submenu: [
      {
        label: "Explainers",
        href: "/phones/explainers",
      },
      {
        label: "Tools",
        href: "/phones/tools",
      },
    ],
  },
];
