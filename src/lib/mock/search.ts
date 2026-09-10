export type SearchCategory = "Products" | "Customers" | "RFQs" | "Quotations" | "Orders" | "Documents";

export type SearchRecord = {
  id: string;
  title: string;
  category: SearchCategory;
  subtitle: string;
  href: string;
};

export const searchIndex: SearchRecord[] = [
  {
    id: "prod-amox",
    title: "Amoxicillin 500mg Capsules",
    category: "Products",
    subtitle: "Antibiotic · Capsule · 10 × 10",
    href: "/products",
  },
  {
    id: "prod-azith",
    title: "Azithromycin 500mg Tablets",
    category: "Products",
    subtitle: "Antibiotic · Tablet · 3 × 10",
    href: "/products",
  },
  {
    id: "prod-para",
    title: "Paracetamol 500mg Tablets",
    category: "Products",
    subtitle: "Analgesic · Tablet · 10 × 10",
    href: "/products",
  },
  {
    id: "cust-abc",
    title: "ABC Pharmaceuticals",
    category: "Customers",
    subtitle: "Nairobi · Wholesale",
    href: "/customers",
  },
  {
    id: "cust-rift",
    title: "Rift Valley Medical Supplies",
    category: "Customers",
    subtitle: "Nakuru · Distributor",
    href: "/customers",
  },
  {
    id: "rfq-10482",
    title: "RFQ-10482",
    category: "RFQs",
    subtitle: "2,000 units · High priority",
    href: "/rfqs",
  },
  {
    id: "rfq-10491",
    title: "RFQ-10491",
    category: "RFQs",
    subtitle: "Azithromycin · 850 packs",
    href: "/rfqs",
  },
  {
    id: "quote-2201",
    title: "QT-2201",
    category: "Quotations",
    subtitle: "ABC Pharmaceuticals · Awaiting follow-up",
    href: "/quotes",
  },
  {
    id: "ord-8812",
    title: "SO-8812",
    category: "Orders",
    subtitle: "Confirmed · KES 1.2M",
    href: "/orders",
  },
  {
    id: "doc-spc",
    title: "Amoxicillin SPC — approved",
    category: "Documents",
    subtitle: "Product document · Regulatory",
    href: "/documents",
  },
];

export function searchMock(query: string): SearchRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return searchIndex.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.subtitle.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
  );
}
