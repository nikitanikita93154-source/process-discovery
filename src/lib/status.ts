import { ru } from "@/lib/content/ru";
import type { BadgeVariant } from "@/components/ui/badge";

/** Маппинг статусов на цвета бейджей. */
export function statusBadgeVariant(status: string): BadgeVariant {
  switch (status) {
    case "completed":
    case "parsed":
    case "analyzed":
      return "success";
    case "in_progress":
    case "capturing":
    case "mapping":
    case "validating":
    case "awaiting_confirmation":
      return "default";
    case "failed":
    case "abandoned":
      return "destructive";
    default:
      return "secondary";
  }
}

/** Русская подпись статуса (с fallback на сам статус). */
export function statusLabel(status: string): string {
  const labels = ru.statuses as Record<string, string>;
  return labels[status] ?? status;
}
