"use client";

import { Download } from "lucide-react";
import { ru } from "@/lib/content/ru";
import { Button } from "@/components/ui/button";

export function ExportButtons() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.location.href = "/api/analytics/export?type=steps";
        }}
      >
        <Download className="h-3.5 w-3.5" />CSV: {ru.analytics.ranking.split(" ").slice(-2).join(" ")}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.location.href = "/api/analytics/export?type=people";
        }}
      >
        <Download className="h-3.5 w-3.5" />CSV: {ru.analytics.peopleReport.split(":")[0]}
      </Button>
    </div>
  );
}
