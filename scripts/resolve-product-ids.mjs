import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const rows = await prisma.product.findMany({
  where: { tenant: { slug: "medicrest" }, sku: { in: ["AMOX-500-CAP", "PARA-500-TAB"] } },
  select: { id: true, sku: true },
});
console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.sku, r.id]))));
await prisma.$disconnect();
