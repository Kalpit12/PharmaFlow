"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ProcurementRecommendation, ProcurementRequisitionDetail } from "@/lib/procurement/types";

export function useProcurementActions() {
  const router = useRouter();
  const [selectedRow, setSelectedRow] = useState<ProcurementRecommendation | null>(null);
  const [detail, setDetail] = useState<ProcurementRequisitionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = async (id: string) => {
    try {
      const result = await fetch(`/api/procurement/requisitions/${id}`);
      const payload = (await result.json()) as { requisition?: ProcurementRequisitionDetail; message?: string };
      if (!result.ok || !payload.requisition) {
        setError(payload.message ?? "Unable to load requisition.");
        return;
      }
      setDetail(payload.requisition);
    } catch {
      setError("Unable to load requisition.");
    }
  };

  const openRow = (row: ProcurementRecommendation) => {
    setSelectedRow(row);
    setDetail(null);
    setError(null);
    if (row.requisitionId) void loadDetail(row.requisitionId);
  };

  const closeRow = () => {
    setSelectedRow(null);
    setDetail(null);
    setError(null);
  };

  const createDraft = async (productId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch("/api/procurement/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const payload = (await result.json()) as { requisition?: ProcurementRequisitionDetail; message?: string };
      if (!result.ok || !payload.requisition) {
        setError(payload.message ?? "Unable to create requisition draft.");
        return;
      }
      setDetail(payload.requisition);
      router.refresh();
    } catch {
      setError("Unable to create requisition draft.");
    } finally {
      setBusy(false);
    }
  };

  const createRfq = async (productId: string, requisitionId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch("/api/procurement-rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "from-procurement", productId, requisitionId }),
      });
      const payload = (await result.json()) as { rfq?: { id: string }; message?: string };
      if (!result.ok || !payload.rfq) {
        setError(payload.message ?? "Unable to create RFQ draft.");
        return;
      }
      router.push(`/rfqs/${payload.rfq.id}`);
    } catch {
      setError("Unable to create RFQ draft.");
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, decision: "review" | "reject") => {
    setBusy(true);
    setError(null);
    try {
      const result = await fetch(`/api/procurement/requisitions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const payload = (await result.json()) as { requisition?: ProcurementRequisitionDetail; message?: string };
      if (!result.ok || !payload.requisition) {
        setError(payload.message ?? "Unable to update requisition.");
        return;
      }
      setDetail(payload.requisition);
      router.refresh();
    } catch {
      setError("Unable to update requisition.");
    } finally {
      setBusy(false);
    }
  };

  return {
    selectedRow,
    detail,
    busy,
    error,
    openRow,
    closeRow,
    createDraft,
    createRfq,
    review,
  };
}
