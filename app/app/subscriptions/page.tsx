import { Metadata } from "next";
import { SubscriptionAudit } from "@/components/SubscriptionAudit";

export const metadata: Metadata = { title: "Subscriptions & renewals" };

export default function SubscriptionsPage() {
  return <SubscriptionAudit />;
}
