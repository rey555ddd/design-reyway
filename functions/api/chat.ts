// OpenAI chat proxy for design.reyway.com
// 用來讓前端 chat-panel 不暴露 API key
// 環境變數：OPENAI_API_KEY（在 Cloudflare Pages → Settings → Environment variables 設定）

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  systemPrompt?: string;
  model?: string;
  imageUrl?: string;  // 當前素材的 dataURL 或 URL，會注入到最後一則 user 訊息
  maxTokens?: number;
}

interface Env {
  OPENAI_API_KEY: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_TOKENS_CAP = 1500;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  if (!env.OPENAI_API_KEY) {
    return json({ error: 'OPENAI_API_KEY 未設定。請到 Cloudflare Pages → Settings → Environment variables 加上。' }, 500);
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  const messages: ChatMessage[] = [];

  if (body.systemPrompt) {
    messages.push({ role: 'system', content: body.systemPrompt });
  }

  const incoming = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  messages.push(...incoming);

  // 把當前素材圖注入到最後一則 user 訊息（follow-up 模式，只看當下素材）
  if (body.imageUrl && messages.length > 0) {
    const last = messages[messages.length - 1];
    if (last.role === 'user') {
      const textPart = typeof last.content === 'string' ? last.content : '';
      last.content = [
        { type: 'text', text: textPart || '請看這張素材。' },
        { type: 'image_url', image_url: { url: body.imageUrl } },
      ];
    }
  }

  const model = body.model || DEFAULT_MODEL;
  const maxTokens = Math.min(body.maxTokens ?? 800, MAX_TOKENS_CAP);

  try {
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return json({ error: `OpenAI 回應錯誤（${upstream.status}）`, detail: errText }, 502);
    }

    const data = await upstream.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const reply = data.choices?.[0]?.message?.content ?? '';
    return json({
      reply,
      usage: data.usage ?? null,
      model,
    });
  } catch (e) {
    return json({ error: '呼叫 OpenAI 失敗', detail: String(e) }, 500);
  }
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
