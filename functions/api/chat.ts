// OpenAI chat proxy for design.reyway.com
// 路徑：POST /api/chat
// 環境變數：OPENAI_API_KEY（Cloudflare Pages → Settings → Environment variables）
//
// 設計原則：
//  - 任何錯誤都回 JSON（不讓 Cloudflare 邊緣吐 HTML 502）
//  - 所有 path 都 console.log，方便 Real-time logs 診斷
//  - 外層 try/catch 包住整支 handler，杜絕 uncaught exception

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  >;
}

interface ChatRequestBody {
  messages?: ChatMessage[];
  systemPrompt?: string;
  model?: string;
  imageUrl?: string;
  maxTokens?: number;
}

interface Env {
  OPENAI_API_KEY?: string;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_TOKENS_CAP = 1500;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  console.log('[chat] onRequestPost hit');

  try {
    const { request, env } = context;

    if (!env.OPENAI_API_KEY) {
      console.log('[chat] missing OPENAI_API_KEY');
      return json(
        {
          error: 'OPENAI_API_KEY 未設定',
          hint: '請到 Cloudflare Pages → Settings → Environment variables 加入，並重新部署。',
        },
        500,
      );
    }

    // Parse body
    let body: ChatRequestBody = {};
    try {
      const raw = await request.text();
      body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.log('[chat] body parse error', String(e));
      return json({ error: '請求格式錯誤', detail: String(e) }, 400);
    }

    const messages: ChatMessage[] = [];
    if (body.systemPrompt) {
      messages.push({ role: 'system', content: body.systemPrompt });
    }
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    messages.push(...incoming);

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

    if (messages.length === 0) {
      return json({ error: '缺少對話內容' }, 400);
    }

    const model = body.model || DEFAULT_MODEL;
    const maxTokens = Math.min(body.maxTokens ?? 800, MAX_TOKENS_CAP);

    console.log(`[chat] calling OpenAI model=${model} msgs=${messages.length}`);

    // Call OpenAI (絕對 try/catch 住)
    let upstream: Response;
    try {
      upstream = await fetch('https://api.openai.com/v1/chat/completions', {
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
    } catch (e) {
      console.log('[chat] fetch to OpenAI failed', String(e));
      return json({ error: '連線到 OpenAI 失敗', detail: String(e) }, 502);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.log(`[chat] OpenAI non-ok status=${upstream.status} body=${errText.slice(0, 300)}`);

      let hint = '';
      if (upstream.status === 401) {
        hint = 'OpenAI API Key 無效或帳戶權限異常。請確認 Key 正確、所屬專案未停用。';
      } else if (upstream.status === 429) {
        hint =
          'OpenAI 額度不足或觸發速率限制。請確認帳戶為 Paid tier 且有 credits；若剛升級，請等 5 分鐘讓額度生效。';
      } else if (upstream.status === 403) {
        hint = 'OpenAI 拒絕請求。可能是組織/專案權限、地區限制或模型未授權。';
      }

      return json(
        {
          error: `OpenAI 回應 ${upstream.status}`,
          hint,
          detail: errText.slice(0, 800),
        },
        upstream.status === 401 || upstream.status === 403 || upstream.status === 429
          ? upstream.status
          : 502,
      );
    }

    const data = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const reply = data.choices?.[0]?.message?.content ?? '';
    console.log(`[chat] OpenAI ok reply_len=${reply.length} tokens=${data.usage?.total_tokens}`);

    return json({
      reply,
      usage: data.usage ?? null,
      model,
    });
  } catch (e) {
    // 最終保險：任何預期外錯誤一律吞下、回 JSON
    console.log('[chat] unexpected error', String(e));
    const err = e as Error;
    return json(
      {
        error: '伺服器未預期錯誤',
        detail: err?.message || String(e),
        stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
      },
      500,
    );
  }
};

// 友善提示：若誤用 GET，不要讓它落到 SPA fallback 200
export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ error: '此端點只接受 POST', method: 'POST' }, 405);
};
