import { Prisma } from "@prisma/client";

export const ZERO = new Prisma.Decimal(0);
export const MILLION = new Prisma.Decimal("1000000");
export const THOUSAND = new Prisma.Decimal("1000");

export function asDecimal(value: Prisma.Decimal | null | undefined): Prisma.Decimal {
  return value ?? ZERO;
}

export function formatKes(amount: Prisma.Decimal): string {
  const negative = amount.lt(0);
  const abs = amount.abs();
  const sign = negative ? "−" : "";
  if (abs.gte(MILLION)) {
    return `${sign}KSh ${abs.div(MILLION).toDecimalPlaces(1).toString()}M`;
  }
  if (abs.gte(THOUSAND)) {
    return `${sign}KSh ${abs.div(THOUSAND).toDecimalPlaces(0).toString()}K`;
  }
  return `${sign}KSh ${abs.toDecimalPlaces(0).toString()}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-KE").format(value);
}

export function percentChange(current: Prisma.Decimal, previous: Prisma.Decimal): { text: string; up: boolean } {
  if (previous.isZero()) return { text: "—", up: true };
  const pct = current.sub(previous).div(previous).mul(100);
  const up = !pct.lt(0);
  const body = pct.abs().toDecimalPlaces(1).toString();
  return { text: `${up ? "+" : "−"}${body}%`, up };
}

export function percentChangeCount(current: number, previous: number): { text: string; up: boolean } {
  return percentChange(new Prisma.Decimal(current), new Prisma.Decimal(previous));
}

/** Chart-only scale: KSh millions. Aggregation stays in Decimal until this boundary. */
export function toChartMillions(amount: Prisma.Decimal): number {
  return Number(amount.div(MILLION).toDecimalPlaces(3).toString());
}
