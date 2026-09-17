import { Metadata } from "next";
import { SubscriptionAudit } from "@/components/SubscriptionAudit";

export const metadata: Metadata = { title: "Subscriptions & renewals — preview" };

export default function PreviewSubscriptionsPage() {
  return <SubscriptionAudit demo />;
}
