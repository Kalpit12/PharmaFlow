import { redirect } from "next/navigation";

export default function InventoryExpiryPage() {
  redirect("/inventory?view=expiry");
}
