"use client";

import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";

export function ExportButtons() {
  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.location.href = "/api/analytics/export?type=steps";
        }}
      >
        ↓ CSV: {ru.analytics.ranking.split(" ").slice(-2).join(" ")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.location.href = "/api/analytics/export?type=people";
        }}
      >
        ↓ CSV: {ru.analytics.peopleReport.split(":")[0]}
      </Button>
    </div>
  );
}
