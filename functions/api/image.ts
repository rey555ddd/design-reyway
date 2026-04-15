// OpenAI image generation proxy for scenegen.html
// 路徑：POST /api/image
// 環境變數：OPENAI_API_KEY
//
// 使用 gpt-image-1（比 DALL·E 3 更擅長產品情境合成），medium quality 一張約 $0.042 USD

interface ImageRequestBody {
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
  quality?: 'low' | 'medium' | 'high';
  n?: number; // 1 or 2
}

interface Env {
  OPENAI_API_KEY?: string;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  console.log('[image] onRequestPost hit');
  try {
    const { request, env } = context;

    if (!env.OPENAI_API_KEY) {
      return json({ error: 'OPENAI_API_KEY 未設定' }, 500);
    }

    let body: ImageRequestBody;
    try {
      body = await request.json();
    } catch {
      return json({ error: '請求格式錯誤' }, 400);
    }

    if (!body.prompt || body.prompt.trim().length < 5) {
      return json({ error: '請提供更具體的描述（至少 5 個字）' }, 400);
    }

    const size = body.size || '1024x1024';
    const quality = body.quality || 'medium';
    const n = Math.min(Math.max(body.n || 1, 1), 2);

    console.log(`[image] calling gpt-image-1 size=${size} quality=${quality} n=${n}`);

    let upstream: Response;
    try {
      upstream = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-image-1',
          prompt: body.prompt,
          size,
          quality,
          n,
        }),
      });
    } catch (e) {
      console.log('[image] fetch failed', String(e));
      return json({ error: '連線到 OpenAI 失敗', detail: String(e) }, 502);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.log(`[image] non-ok ${upstream.status} ${errText.slice(0, 200)}`);
      let hint = '';
      if (upstream.status === 401) hint = 'API Key 無效';
      else if (upstream.status === 429) hint = 'OpenAI 額度不足或速率限制';
      else if (upstream.status === 403) hint = '模型未授權（gpt-image-1 需先完成組織驗證）';
      else if (upstream.status === 400) hint = '描述內容可能違反 OpenAI 內容政策，請改寫';
      return json(
        { error: `OpenAI 回應 ${upstream.status}`, hint, detail: errText.slice(0, 600) },
        upstream.status,
      );
    }

    const data = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
      usage?: unknown;
    };

    const images = (data.data || []).map((d) => ({
      b64: d.b64_json ? `data:image/png;base64,${d.b64_json}` : null,
      url: d.url || null,
      revisedPrompt: d.revised_prompt || null,
    }));

    console.log(`[image] ok n=${images.length}`);
    return json({ images, model: 'gpt-image-1', size, quality });
  } catch (e) {
    console.log('[image] unexpected', String(e));
    const err = e as Error;
    return json({ error: '伺服器未預期錯誤', detail: err?.message || String(e) }, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ error: '此端點只接受 POST', method: 'POST' }, 405);
};
