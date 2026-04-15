// Admin：列出所有 feedback 記錄（從 KV 讀）
// GET /api/feedback-list?key=ADMIN_KEY&kind=bug|wish&limit=100
//
// 保護：需 ?key=xxx 且等於 env.ADMIN_KEY（最小可行保護，非高安全需求，僅防止外部亂戳）

interface Env {
  FEEDBACK_KV?: KVNamespace;
  ADMIN_KEY?: string;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    if (!env.ADMIN_KEY) {
      return json({ error: '未設定 ADMIN_KEY 環境變數' }, 500);
    }
    const key = url.searchParams.get('key');
    if (!key || key !== env.ADMIN_KEY) {
      return json({ error: '未授權' }, 401);
    }

    if (!env.FEEDBACK_KV) {
      return json({
        error: '未綁定 FEEDBACK_KV',
        hint: 'Cloudflare Pages → Settings → Functions → KV namespace bindings 加入 FEEDBACK_KV',
        items: [],
      }, 500);
    }

    const kindFilter = url.searchParams.get('kind'); // 'bug' | 'wish' | null
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 500);

    // KV 沒 native query，先 list 所有 key 再逐一讀（feedback 量應不大）
    const prefix = kindFilter ? `${kindFilter}/` : '';
    const list = await env.FEEDBACK_KV.list({ prefix, limit });

    const items: any[] = [];
    for (const k of list.keys) {
      try {
        const raw = await env.FEEDBACK_KV.get(k.name);
        if (raw) items.push(JSON.parse(raw));
      } catch {}
    }

    // 依時間新的在前
    items.sort((a, b) => (b.ts || '').localeCompare(a.ts || ''));

    return json({
      total: items.length,
      truncated: list.list_complete === false,
      items,
    });
  } catch (e) {
    const err = e as Error;
    return json({ error: '伺服器錯誤', detail: err?.message || String(e) }, 500);
  }
};

// 刪除一筆（或全部），方便整理
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);

    if (!env.ADMIN_KEY) return json({ error: '未設定 ADMIN_KEY' }, 500);
    const key = url.searchParams.get('key');
    if (key !== env.ADMIN_KEY) return json({ error: '未授權' }, 401);

    if (!env.FEEDBACK_KV) return json({ error: '未綁定 FEEDBACK_KV' }, 500);

    const target = url.searchParams.get('id');
    if (target === 'ALL') {
      const list = await env.FEEDBACK_KV.list({ limit: 500 });
      for (const k of list.keys) await env.FEEDBACK_KV.delete(k.name);
      return json({ ok: true, deleted: list.keys.length });
    }

    if (!target) return json({ error: '缺少 id' }, 400);

    const list = await env.FEEDBACK_KV.list({ limit: 500 });
    const match = list.keys.find(k => k.name.endsWith(target));
    if (!match) return json({ error: '找不到' }, 404);
    await env.FEEDBACK_KV.delete(match.name);
    return json({ ok: true, deleted: 1 });
  } catch (e) {
    return json({ error: '伺服器錯誤', detail: String(e) }, 500);
  }
};
