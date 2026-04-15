// Feedback / Wish collection endpoint
// POST /api/feedback
// MVP：寫 Cloudflare Real-time logs（dashboard 可看）
// 未來可接 KV / D1 / 寄 email，端看需求

interface FeedbackBody {
  kind: 'bug' | 'wish';
  page: string;
  userAgent?: string;
  title: string;
  detail: string;
  steps?: string;
  expected?: string;
  actual?: string;
  severity?: 'low' | 'medium' | 'high';
  screenshotBase64?: string;
}

interface Env {
  FEEDBACK_KV?: KVNamespace; // 可選 binding
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  console.log('[feedback] onRequestPost hit');
  try {
    const { request, env } = context;

    let body: FeedbackBody;
    try { body = await request.json(); }
    catch { return json({ error: '請求格式錯誤' }, 400); }

    if (!body.title || !body.detail) return json({ error: '缺少標題或詳情' }, 400);
    if (!['bug', 'wish'].includes(body.kind)) return json({ error: '類型錯誤' }, 400);

    const record = {
      id: crypto.randomUUID(),
      ts: new Date().toISOString(),
      kind: body.kind,
      page: body.page,
      ua: body.userAgent?.slice(0, 200) || '',
      title: body.title.slice(0, 200),
      detail: body.detail.slice(0, 5000),
      steps: body.steps?.slice(0, 2000) || '',
      expected: body.expected?.slice(0, 1000) || '',
      actual: body.actual?.slice(0, 1000) || '',
      severity: body.severity || 'medium',
      hasScreenshot: !!body.screenshotBase64,
    };

    // 寫 log（Cloudflare Real-time logs 可看）
    console.log('[feedback] RECEIVED', JSON.stringify(record));

    // 若有 KV binding，額外持久化
    if (env.FEEDBACK_KV) {
      try {
        const key = `${record.kind}/${record.ts}/${record.id}`;
        await env.FEEDBACK_KV.put(key, JSON.stringify({ ...record, screenshot: body.screenshotBase64 || null }), {
          expirationTtl: 60 * 60 * 24 * 90, // 90 天
        });
        console.log('[feedback] persisted to KV', key);
      } catch (e) {
        console.log('[feedback] KV write failed', String(e));
      }
    }

    return json({ ok: true, id: record.id, persisted: !!env.FEEDBACK_KV });
  } catch (e) {
    console.log('[feedback] unexpected', String(e));
    return json({ error: '伺服器錯誤', detail: String(e) }, 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return json({ error: '此端點只接受 POST', method: 'POST' }, 405);
};
