// OpenAI image edit proxy（基於現有圖做修改）
// POST /api/image-edit
// 使用 gpt-image-1 的 edits 端點（支援無 mask 的整圖重繪）

interface EditRequestBody {
  imageBase64: string;  // "data:image/png;base64,..." 或純 base64
  prompt: string;
  size?: '1024x1024' | '1024x1536' | '1536x1024';
  quality?: 'low' | 'medium' | 'high';
  n?: number;
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

function base64ToBlob(b64: string): Blob {
  // 支援 data:image/png;base64,xxx 或純 base64
  const comma = b64.indexOf(',');
  const payload = comma !== -1 ? b64.slice(comma + 1) : b64;
  const mimeMatch = b64.match(/^data:(image\/\w+);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  console.log('[image-edit] onRequestPost hit');
  try {
    const { request, env } = context;
    if (!env.OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY 未設定' }, 500);

    let body: EditRequestBody;
    try { body = await request.json(); }
    catch { return json({ error: '請求格式錯誤' }, 400); }

    if (!body.imageBase64) return json({ error: '缺少原圖' }, 400);
    if (!body.prompt || body.prompt.trim().length < 3) return json({ error: '請提供更具體的編修描述' }, 400);

    const size = body.size || '1024x1024';
    const quality = body.quality || 'medium';
    const n = Math.min(Math.max(body.n || 1, 1), 2);

    console.log(`[image-edit] calling gpt-image-1 edits size=${size} quality=${quality} n=${n}`);

    let blob: Blob;
    try { blob = base64ToBlob(body.imageBase64); }
    catch (e) { return json({ error: '原圖解析失敗', detail: String(e) }, 400); }

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image', blob, 'source.png');
    form.append('prompt', body.prompt);
    form.append('size', size);
    form.append('quality', quality);
    form.append('n', String(n));

    let upstream: Response;
    try {
      upstream = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
      });
    } catch (e) {
      console.log('[image-edit] fetch failed', String(e));
      return json({ error: '連線到 OpenAI 失敗', detail: String(e) }, 502);
    }

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      console.log(`[image-edit] non-ok ${upstream.status} ${errText.slice(0,200)}`);
      let hint = '';
      if (upstream.status === 401) hint = 'API Key 無效';
      else if (upstream.status === 429) hint = 'OpenAI 額度不足或速率限制';
      else if (upstream.status === 403) hint = '模型未授權（gpt-image-1 需組織驗證）';
      else if (upstream.status === 400) hint = '原圖或描述不符合要求（PNG 建議 < 25MB，描述避免違規）';
      return json({ error: `OpenAI 回應 ${upstream.status}`, hint, detail: errText.slice(0,600) }, upstream.status);
    }

    const data = (await upstream.json()) as {
      data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
    };
    const images = (data.data || []).map(d => ({
      b64: d.b64_json ? `data:image/png;base64,${d.b64_json}` : null,
      url: d.url || null,
      revisedPrompt: d.revised_prompt || null,
    }));
    console.log(`[image-edit] ok n=${images.length}`);
    return json({ images, model: 'gpt-image-1', size, quality });
  } catch (e) {
    console.log('[image-edit] unexpected', String(e));
    const err = e as Error;
    return json({ error: '伺服器未預期錯誤', detail: err?.message || String(e) }, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ error: '此端點只接受 POST', method: 'POST' }, 405);
};
