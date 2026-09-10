import Image from "next/image";
import Link from "next/link";

import { product } from "@/lib/product";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  href?: string | null;
  compact?: boolean;
  className?: string;
};

export function BrandLogo({
  href = "/dashboard",
  compact = false,
  className,
}: BrandLogoProps) {
  const content = compact ? (
    <>
      <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden">
        <Image
          src={product.logo.mark}
          alt={product.name}
          width={32}
          height={32}
          className="size-full object-contain"
          priority
        />
      </span>
      <span className="sr-only">{product.wordmark}</span>
    </>
  ) : (
    <Image
      src={product.logo.full}
      alt={product.name}
      width={220}
      height={64}
      className="h-9 w-auto max-w-[12.5rem] object-contain object-left sm:max-w-[14rem] sm:h-10"
      priority
    />
  );

  if (href === null) {
    return <div className={cn("flex min-w-0 items-center", className)}>{content}</div>;
  }

  return (
    <Link href={href} className={cn("flex min-w-0 items-center", className)}>
      {content}
    </Link>
  );
}

export function BrandMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={product.logo.mark}
      alt={product.name}
      width={size}
      height={size}
      className={cn("object-contain", className)}
      priority
    />
  );
}

export function BrandLockup({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={product.logo.full}
      alt={product.name}
      width={240}
      height={72}
      className={cn("h-10 w-auto max-w-[15rem] object-contain object-left", className)}
      priority={priority}
    />
  );
}
