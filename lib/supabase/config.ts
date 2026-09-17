const fallbackUrl = "https://eyvwmrlvolaavdiqvbzu.supabase.co";
const fallbackPublishableKey = "sb_publishable_145rfknu6w4oF2TsEgRfRQ_wIe9LHCh";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackUrl;
export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || fallbackPublishableKey;
