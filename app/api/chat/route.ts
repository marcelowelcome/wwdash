import OpenAI from "openai";
import { z } from "zod";

const ChatRequestSchema = z.object({
    messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
    })).min(1).max(20),
    context: z.string().max(50000).optional().default(""),
});

const SYSTEM_PROMPT = `Você é um analista de dados especializado no funil de vendas da Welcome Weddings, uma assessoria de destination weddings.

## Regras obrigatórias
- Responda SEMPRE em português (pt-BR).
- Use APENAS os dados fornecidos na seção CONTEXTO abaixo. NUNCA invente, estime ou fabrique números.
- Se uma informação não estiver no contexto, diga: "Essa informação não está disponível no contexto atual."
- Formate valores monetários como BRL (R$ X.XXX,XX).
- Seja direto e objetivo. Dê insights acionáveis quando possível.
- Use formatação markdown para organizar a resposta (negrito, listas, etc).

## Domínio de negócio
- Pipeline SDR (grupo 1): prospecção e qualificação inicial
- Pipeline Closer (grupo 3): reunião e fechamento
- "Ganho" = deal com data_fechamento preenchida (não status=0)
- Destinos principais: diversos destinos nacionais e internacionais
- Score de leads: baseado em destino (conv%), num_convidados (mediana), orçamento (ticket)
- Tiers: A (melhor), B, C

## Sobre o dashboard
O usuário está visualizando um dashboard de KPIs de vendas com abas: Visão Geral, Funil, SDR, Closer, Pipeline, Contratos, Perfil & Score, Dicionário e Chat IA.`;

export async function POST(req: Request) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "OPENAI_API_KEY não configurada" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }

    let parsed: z.infer<typeof ChatRequestSchema>;
    try {
        const raw = await req.json();
        parsed = ChatRequestSchema.parse(raw);
    } catch (e) {
        const msg = e instanceof z.ZodError ? e.issues.map((i: z.ZodIssue) => i.message).join(", ") : "Body inválido";
        return new Response(JSON.stringify({ error: msg }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const { messages, context } = parsed;

    const systemPrompt = `${SYSTEM_PROMPT}\n\n## CONTEXTO (dados reais do dashboard)\n${context || "Nenhum contexto disponível."}`;

    const client = new OpenAI({ apiKey });

    try {
        const stream = await client.chat.completions.create({
            model: "gpt-4o",
            max_tokens: 2048,
            stream: true,
            messages: [
                { role: "system", content: systemPrompt },
                ...messages.map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                })),
            ],
        });

        const encoder = new TextEncoder();
        const readable = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of stream) {
                        const delta = chunk.choices[0]?.delta?.content;
                        if (delta) {
                            controller.enqueue(
                                encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`)
                            );
                        }
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (err) {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)
                    );
                    controller.close();
                }
            },
        });

        return new Response(readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        });
    } catch (err) {
        console.error("[Chat API] Error:", err);
        return new Response(JSON.stringify({ error: "Erro ao chamar OpenAI API" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
        });
    }
}
