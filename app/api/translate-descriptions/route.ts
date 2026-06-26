import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { auth } from "@/lib/auth";

// GET — перевірити наявність ключа
export async function GET() {
  return NextResponse.json({ hasKey: !!process.env.OPENAI_API_KEY });
}

// POST — масовий переклад: lang=uk продукти, вміст яких є російським → перекласти в UA (SSE streaming)
export async function POST(_req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
      }

      if (!apiKey) {
        send({ type: "error", message: "OPENAI_API_KEY не налаштований у .env.local" });
        controller.close();
        return;
      }

      // Всі lang=uk товари з непорожнім описом (включаючи кольорові варіанти)
      const { data: products, error } = await supabaseServer
        .from("products")
        .select("id, text, descr")
        .eq("lang", "uk")
        .or("text.neq.,descr.neq.");

      if (error || !products?.length) {
        send({ type: "error", message: error?.message || "Товарів не знайдено" });
        controller.close();
        return;
      }

      const toProcess = products.filter((p: any) => (p.text || "").trim() || (p.descr || "").trim());
      const total = toProcess.length;
      send({ type: "start", total });

      const BATCH = 12;
      let translated = 0;
      let errors = 0;

      for (let i = 0; i < total; i += BATCH) {
        const batch = toProcess.slice(i, i + BATCH);
        try {
          const results = await translateBatchRuToUa(batch, apiKey);
          for (const item of results) {
            if (!item?.id) continue;
            await supabaseServer.from("products").update({
              ...(item.text !== undefined ? { text: item.text } : {}),
              ...(item.descr !== undefined ? { descr: item.descr } : {}),
            }).eq("id", item.id);
            translated++;
            send({ type: "progress", translated, total, errors });
          }
        } catch (e: any) {
          errors += batch.length;
          send({ type: "progress", translated, total, errors, batchError: e?.message });
        }
      }

      send({ type: "done", translated, total, errors });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ── Переклад батчу: текст у полі lang=uk написаний по-російськи → UA ─────────

export async function translateBatchRuToUa(
  products: { id: number; text: string | null; descr: string | null }[],
  apiKey: string
): Promise<{ id: number; text?: string; descr?: string }[]> {
  const inputLines = products
    .map((p) => {
      const parts: string[] = [`ID:${p.id}`];
      if (p.text?.trim()) parts.push(`TEXT:${p.text}`);
      if (p.descr?.trim()) parts.push(`DESCR:${p.descr}`);
      return parts.join("\n");
    })
    .join("\n---\n");

  const systemPrompt =
    "Ти перекладач. Дані товари зберігаються як українська версія (lang=uk), " +
    "але їх поля TEXT і DESCR містять текст РОСІЙСЬКОЮ мовою. " +
    "Переклади кожен текст з РОСІЙСЬКОЇ на УКРАЇНСЬКУ мову. " +
    "Зберігай всі HTML-теги (<p>, <br>, <strong>, <em>, <ul>, <li> тощо) ТОЧНО як є, не змінюй їх. " +
    "Не додавай пояснень, коментарів чи власного тексту. Повертай тільки JSON.";

  const userPrompt =
    `Переклади тексти нижче з РОСІЙСЬКОЇ на УКРАЇНСЬКУ. ` +
    `Поверни JSON: {"results":[{"id":N,"text":"...","descr":"..."},...]}.\n` +
    `Якщо поле TEXT відсутнє у вхідних даних — не додавай його у результат. ` +
    `Якщо DESCR відсутній — теж не додавай.\n\n` +
    inputLines;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${await response.text()}`);

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Порожня відповідь від GPT");

  const parsed = JSON.parse(content);
  return Array.isArray(parsed.results) ? parsed.results : [];
}
