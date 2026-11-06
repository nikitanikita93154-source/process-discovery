import type { HTMLAttributes } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function SynaptLogo({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      <span className={cn("block overflow-hidden", markOnly ? "w-[35px]" : "w-[93px]")}>
        <Image src="/synapt-logo.svg" alt="Synapt" width={839} height={360} className="h-10 w-[93px] max-w-none" />
      </span>
    </span>
  );
}

export function Eyebrow({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("font-mono text-[10px] font-medium uppercase leading-relaxed tracking-[0.14em] text-muted sm:text-[11px]", className)} {...props} />;
}

export function PageTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h1 className={cn("break-words font-head text-2xl font-medium leading-[1.3] tracking-[-0.045em] text-ink sm:text-3xl", className)} {...props} />;
}
