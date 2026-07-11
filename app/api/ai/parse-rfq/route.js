import { NextResponse } from "next/server";
import { requireBuyer } from "@/lib/requireBuyer";

const MAX_TEXT_LENGTH = 1000;
const PARSE_ERROR = "Could not parse requirement — please fill the form manually.";

const SYSTEM_PROMPT = `You are an expert procurement assistant for Indian raw-material buying. Extract from the user's text and return ONLY a JSON object with keys:
- material (string, specific, e.g. "8mm TMT Steel Bars IS 1786 Fe500")
- quantity_kg (number — convert tons/quintals to kg)
- description (string, 1-2 sentences of specs/grade/delivery notes)
- window_minutes (number, default 45 unless urgency implies otherwise, keep 15-120)
- ceiling_price_suggestion_inr_per_kg (number, an indicative wholesale INR/kg market rate for this material in India, err on the higher side of the plausible band)
- price_note (string, one sentence explaining the suggested price basis)

If a field can't be inferred, use null.`;

function isPositiveNumberOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value > 0);
}

function isWindowMinutesOrNull(value) {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 15 && value <= 120)
  );
}

export async function POST(request) {
  const buyerEmail = await requireBuyer();
  if (!buyerEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json(
      { error: "Please describe your requirement first." },
      { status: 400 }
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Description is too long (max ${MAX_TEXT_LENGTH} characters).` },
      { status: 400 }
    );
  }

  let rawContent;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error("Groq API request failed", response.status, errorBody);
      return NextResponse.json({ error: PARSE_ERROR }, { status: 422 });
    }

    const data = await response.json();
    rawContent = data?.choices?.[0]?.message?.content;
  } catch (err) {
    console.error("Groq API request threw", err);
    return NextResponse.json({ error: PARSE_ERROR }, { status: 422 });
  }

  try {
    const parsed = JSON.parse(rawContent);

    // material is the one field a genuine extraction can't do without — if
    // the model couldn't infer even that (e.g. gibberish input), treat it
    // the same as a parse failure rather than "succeeding" with an
    // all-null result.
    if (
      typeof parsed.material !== "string" ||
      !parsed.material.trim() ||
      !isPositiveNumberOrNull(parsed.quantity_kg) ||
      !isWindowMinutesOrNull(parsed.window_minutes) ||
      !isPositiveNumberOrNull(parsed.ceiling_price_suggestion_inr_per_kg)
    ) {
      throw new Error("Model output failed field validation");
    }

    return NextResponse.json({
      fields: {
        material: typeof parsed.material === "string" ? parsed.material : null,
        quantity_kg: parsed.quantity_kg ?? null,
        description: typeof parsed.description === "string" ? parsed.description : null,
        window_minutes: parsed.window_minutes ?? null,
        ceiling_price_suggestion_inr_per_kg: parsed.ceiling_price_suggestion_inr_per_kg ?? null,
        price_note: typeof parsed.price_note === "string" ? parsed.price_note : null,
      },
    });
  } catch (err) {
    console.error("Failed to parse Groq model output:", rawContent, err);
    return NextResponse.json({ error: PARSE_ERROR }, { status: 422 });
  }
}
