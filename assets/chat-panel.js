/**
 * 淨淨 CleanClean — Chat Panel
 *
 * 用法：
 *   CCChatPanel.init({
 *     toolName: 'Resize 小幫手',
 *     systemPrompt: '你是淨淨美學工作室的 AI 助理，專門協助 Resize ...',
 *     greeting: '有什麼想調整的嗎？例如「把標題放大一點」',
 *     suggestions: ['標題放大', '產品置中', '換配色'],
 *     getContext: () => ({ imageUrl: someDataURL, note: '當前設定：16:9' }),
 *     dailyLimit: 30,
 *   });
 *
 * - follow-up only：每次送出只帶 systemPrompt + 最近 N 則訊息 + 當前素材 context
 * - 對話歷史僅存於當前分頁記憶體（重整即清空，避免累積跨素材上下文）
 * - 額度：localStorage 客端每日計數（MVP，正式版應改為 Cloudflare KV 伺服端）
 */
(function(global){
  const MAX_HISTORY = 10;
  const STORAGE_KEY = 'cc_chat_quota';

  function todayKey(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function readQuota(limit){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      if(obj.date !== todayKey()){
        return { date: todayKey(), used: 0, limit };
      }
      return { date: obj.date, used: obj.used || 0, limit };
    }catch{ return { date: todayKey(), used: 0, limit }; }
  }
  function writeQuota(q){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); }catch{}
  }

  function h(tag, props={}, children=[]){
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k,v])=>{
      if(k==='class') el.className = v;
      else if(k==='html') el.innerHTML = v;
      else if(k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    });
    (Array.isArray(children)?children:[children]).forEach(c=>{
      if(c==null) return;
      el.appendChild(typeof c==='string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  function addMsg(body, role, text, extraClass=''){
    const el = h('div', { class: `cc-msg ${role} ${extraClass}` }, text);
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  function addLoading(body){
    const el = h('div', { class: 'cc-msg loading' }, [h('span'),h('span'),h('span')]);
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  const CCChatPanel = {
    init(options){
      const opts = Object.assign({
        toolName: '淨淨 AI',
        systemPrompt: '你是淨淨美學工作室的 AI 助理。請用繁體中文、專業但溫暖的語氣，協助使用者。回答精簡，最多 3 段。',
        greeting: '你好，有什麼我可以幫忙調整的嗎？',
        suggestions: [],
        getContext: () => ({}),
        dailyLimit: 30,
        endpoint: '/api/chat',
      }, options || {});

      // 注入 CSS（若還沒載入）
      if(!document.querySelector('link[data-cc-chat]')){
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'assets/chat-panel.css';
        link.setAttribute('data-cc-chat','1');
        document.head.appendChild(link);
      }

      const history = [];
      let quota = readQuota(opts.dailyLimit);
      let isOpen = false;
      let isSending = false;

      const launcher = h('button', { class:'cc-chat-launcher', title:'打開 AI 對話' }, [
        document.createTextNode('💬'),
        h('span',{class:'dot'})
      ]);

      const body = h('div', { class:'cc-chat-body' });
      const quotaEl = h('div', { class:'cc-chat-quota' });
      const input = h('textarea', { class:'cc-chat-input', rows:1, placeholder:'說出你想調整的地方…' });
      const sendBtn = h('button', { class:'cc-chat-send', title:'送出' }, '→');

      const suggestRow = h('div', { class:'cc-chat-suggest' },
        (opts.suggestions || []).map(s => h('button', { type:'button', onclick:()=>{ input.value = s; input.focus(); } }, s))
      );

      const panel = h('div', { class:'cc-chat-panel' }, [
        h('div', { class:'cc-chat-head' }, [
          h('div', { class:'cc-chat-avatar' }, '淨'),
          h('div', { class:'meta' }, [
            h('strong', {}, opts.toolName + ' · AI 助理'),
            h('span', {}, 'OpenAI 驅動 · follow-up 對話')
          ]),
          h('button', { class:'cc-chat-close', title:'關閉', onclick:()=>toggle(false) }, '×')
        ]),
        body,
        suggestRow,
        h('div', { class:'cc-chat-foot' }, [
          quotaEl,
          h('div', { class:'cc-chat-inputrow' }, [input, sendBtn])
        ])
      ]);

      document.body.appendChild(launcher);
      document.body.appendChild(panel);

      function renderQuota(){
        const left = Math.max(0, quota.limit - quota.used);
        quotaEl.innerHTML = `今日剩餘 <strong>${left}</strong> / ${quota.limit} 次`;
      }
      renderQuota();

      addMsg(body, 'assistant', opts.greeting);

      function toggle(force){
        isOpen = typeof force === 'boolean' ? force : !isOpen;
        panel.classList.toggle('open', isOpen);
        launcher.style.display = isOpen ? 'none' : 'flex';
        if(isOpen) setTimeout(()=>input.focus(), 200);
      }
      launcher.addEventListener('click', ()=>toggle(true));

      // auto-resize
      input.addEventListener('input', ()=>{
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
      });
      input.addEventListener('keydown', e=>{
        if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); send(); }
      });
      sendBtn.addEventListener('click', send);

      async function send(){
        const text = input.value.trim();
        if(!text || isSending) return;

        if(quota.used >= quota.limit){
          addMsg(body, 'assistant', '今日額度已用完，明天再聊～（或到 Cloudflare 調整額度）', 'error');
          return;
        }

        isSending = true;
        sendBtn.disabled = true;
        addMsg(body, 'user', text);
        history.push({ role:'user', content: text });
        input.value = '';
        input.style.height = 'auto';

        const loading = addLoading(body);

        const ctx = (opts.getContext && opts.getContext()) || {};
        const contextNote = ctx.note ? `\n\n【當前素材 context】\n${ctx.note}` : '';
        const systemPrompt = opts.systemPrompt + contextNote;

        let assistantBubble = null;
        let assistantText = '';
        let firstChunk = true;

        try{
          const res = await fetch(opts.endpoint, {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
              systemPrompt,
              messages: history.slice(-MAX_HISTORY),
              imageUrl: ctx.imageUrl || undefined,
              stream: true,
            }),
          });

          const contentType = res.headers.get('content-type') || '';

          // 錯誤路徑：後端回 JSON 錯誤（non-stream）
          if(!res.ok || contentType.includes('application/json')){
            const data = await res.json().catch(()=>({ error:'回應格式錯誤' }));
            loading.remove();
            if(!res.ok || data.error){
              const msg = `⚠ ${data.error || '發生錯誤'}${data.hint ? '\n'+data.hint : ''}${data.detail ? '\n'+data.detail : ''}`;
              addMsg(body, 'assistant', msg, 'error');
            }else if(data.reply){
              // 極端情況：後端 fallback 成 non-stream
              addMsg(body, 'assistant', data.reply);
              history.push({ role:'assistant', content: data.reply });
              quota.used += 1; writeQuota(quota); renderQuota();
            }
            return;
          }

          // Streaming 路徑：SSE 逐段讀取
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while(true){
            const { done, value } = await reader.read();
            if(done) break;
            buffer += decoder.decode(value, { stream:true });

            let idx;
            while((idx = buffer.indexOf('\n')) !== -1){
              const line = buffer.slice(0, idx).trim();
              buffer = buffer.slice(idx + 1);
              if(!line.startsWith('data:')) continue;
              const payload = line.slice(5).trim();
              if(payload === '[DONE]') continue;
              try{
                const obj = JSON.parse(payload);
                const delta = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
                if(delta){
                  if(firstChunk){
                    loading.remove();
                    assistantBubble = addMsg(body, 'assistant', '');
                    firstChunk = false;
                  }
                  assistantText += delta;
                  assistantBubble.textContent = assistantText;
                  body.scrollTop = body.scrollHeight;
                }
              }catch{ /* ignore keep-alive / 不完整片段 */ }
            }
          }

          if(firstChunk){
            // 串流沒任何內容
            loading.remove();
            addMsg(body, 'assistant', '（沒有收到回應）', 'error');
          }else{
            history.push({ role:'assistant', content: assistantText });
            quota.used += 1;
            writeQuota(quota);
            renderQuota();
          }
        }catch(e){
          try{ loading.remove(); }catch{}
          if(assistantBubble && assistantText){
            // 部分成功 → 保留已收到的內容，但標記中斷
            assistantBubble.textContent = assistantText + '\n\n⚠ 串流中斷：' + e.message;
          }else{
            addMsg(body, 'assistant', '⚠ 連線失敗：' + e.message, 'error');
          }
        }finally{
          isSending = false;
          sendBtn.disabled = false;
          input.focus();
        }
      }

      return {
        open: ()=>toggle(true),
        close: ()=>toggle(false),
        clear: ()=>{ body.innerHTML=''; history.length=0; addMsg(body,'assistant',opts.greeting); },
      };
    }
  };

  global.CCChatPanel = CCChatPanel;
})(window);
