import { NextResponse } from "next/server";
import { expenseCategories } from "@/lib/receipt";
import { createClient } from "@/lib/supabase/server";

const maxImageCharacters = 8_000_000;

function outputText(response: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  if (response.output_text) return response.output_text;
  return response.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  const gatewayToken = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey && !gatewayToken) return NextResponse.json({ error: "AI receipt scanning is temporarily unavailable." }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log in before using AI receipt scanning." }, { status: 401 });

  let payload: { image?: unknown };
  try {
    payload = await request.json() as { image?: unknown };
  } catch {
    return NextResponse.json({ error: "The receipt image could not be read." }, { status: 400 });
  }
  if (typeof payload.image !== "string" || !/^data:image\/(jpeg|png|webp);base64,/i.test(payload.image) || payload.image.length > maxImageCharacters) {
    return NextResponse.json({ error: "Upload a JPG, PNG or WebP receipt smaller than 6 MB." }, { status: 400 });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      merchant: { type: "string" },
      expense_date: { type: "string", description: "Receipt date in YYYY-MM-DD format, or an empty string when unreadable." },
      amount: { type: "number", minimum: 0 },
      category: { type: "string", enum: expenseCategories },
      confidence: { type: "number", minimum: 0, maximum: 1 },
    },
    required: ["merchant", "expense_date", "amount", "category", "confidence"],
  };

  try {
    const aiResponse = await fetch(apiKey ? "https://api.openai.com/v1/responses" : "https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey || gatewayToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: apiKey ? process.env.OPENAI_RECEIPT_MODEL || "gpt-4o-mini" : process.env.AI_GATEWAY_RECEIPT_MODEL || "openai/gpt-5.4",
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: "Read this purchase receipt. Extract the merchant, purchase date, final amount actually paid, and the best matching spending category. Do not use a subtotal. If a field is unclear, lower confidence rather than inventing it." },
            { type: "input_image", image_url: payload.image, detail: "high" },
          ],
        }],
        text: { format: { type: "json_schema", name: "receipt", strict: true, schema } },
      }),
    });
    const result = await aiResponse.json() as { error?: { message?: string }; output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    if (!aiResponse.ok) throw new Error(result.error?.message || "The AI scan failed.");
    const text = outputText(result);
    if (!text) throw new Error("The AI could not read this receipt.");
    return NextResponse.json({ receipt: JSON.parse(text) });
  } catch (error) {
    console.error("AI receipt scan failed", error);
    return NextResponse.json({ error: "The AI could not read this receipt. Try Private scan or enter it manually." }, { status: 502 });
  }
}
