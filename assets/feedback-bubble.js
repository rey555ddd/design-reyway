/**
 * 淨淨 CleanClean — Feedback Bubble
 * 左下角浮動泡泡，兩個分頁：Bug 回報 / 許願池
 *
 * 使用：每個 HTML <body> 加上：
 *   <script src="assets/feedback-bubble.js"></script>
 * 即可自動注入（不需呼叫任何 init）。
 */
(function(){
  if (window.__ccFeedbackBubbleLoaded) return;
  window.__ccFeedbackBubbleLoaded = true;

  // 注入 CSS
  if (!document.querySelector('link[data-cc-fb]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'assets/feedback-bubble.css';
    link.setAttribute('data-cc-fb','1');
    document.head.appendChild(link);
  }

  const state = {
    kind: 'bug', // 'bug' | 'wish'
    severity: 'medium',
    screenshotDataUrl: null,
    aiHistory: [],
  };

  function h(tag, props={}, children=[]){
    const el = document.createElement(tag);
    Object.entries(props).forEach(([k,v])=>{
      if(k==='class') el.className = v;
      else if(k==='html') el.innerHTML = v;
      else if(k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if(k==='style') el.style.cssText = v;
      else el.setAttribute(k, v);
    });
    (Array.isArray(children)?children:[children]).forEach(c=>{
      if(c==null) return;
      el.appendChild(typeof c==='string' ? document.createTextNode(c) : c);
    });
    return el;
  }

  // ---- UI ----
  const launcher = h('button', { class:'cc-fb-launcher', title:'Bug 回報 / 許願池' }, [
    document.createTextNode('💡'),
    h('span',{class:'pulse'})
  ]);

  const tabBug = h('button', { class:'cc-fb-tab on', 'data-kind':'bug' }, '🐛 Bug 回報');
  const tabWish = h('button', { class:'cc-fb-tab', 'data-kind':'wish' }, '💡 許願池');

  // 表單欄位
  const fTitle = h('input', { type:'text', id:'cc-fb-title', placeholder:'一句話標題（例：copywriter 複製按鈕沒反應）', maxlength:100 });
  const fDetail = h('textarea', { id:'cc-fb-detail', placeholder:'詳細描述⋯' });
  const fSteps = h('textarea', { id:'cc-fb-steps', placeholder:'1. ...\n2. ...\n3. ...', style:'min-height:56px;' });
  const fExpected = h('input', { type:'text', id:'cc-fb-expected', placeholder:'預期應該怎樣（例：應該跳 toast 顯示「已複製」）' });
  const fActual = h('input', { type:'text', id:'cc-fb-actual', placeholder:'實際發生什麼（例：按了沒反應）' });

  const sevBtns = ['low','medium','high'].map(v => {
    const labels = { low:'小問題 / Nice to have', medium:'一般', high:'緊急 / 擋路' };
    const btn = h('button', { type:'button', 'data-sev':v }, labels[v]);
    btn.addEventListener('click', () => {
      state.severity = v;
      sevBtns.forEach(b => b.classList.toggle('on', b.dataset.sev === v));
    });
    return btn;
  });
  sevBtns[1].classList.add('on');

  // 截圖上傳
  const screenshotBox = h('label', { class:'cc-fb-screenshot' }, '📸 點擊附上截圖（選填）');
  const screenshotInput = h('input', { type:'file', accept:'image/*' });
  screenshotBox.appendChild(screenshotInput);
  screenshotInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      state.screenshotDataUrl = ev.target.result;
      screenshotBox.innerHTML = '';
      screenshotBox.appendChild(h('img', { src: ev.target.result }));
      screenshotBox.appendChild(screenshotInput);
      screenshotBox.classList.add('has-img');
    };
    reader.readAsDataURL(f);
  });

  // AI 輔助：展開小 chat 幫使用者釐清
  const aiBtn = h('button', { type:'button', class:'cc-fb-ai-btn' }, '🤖 跟 AI 討論一下再送出（幫你把描述寫清楚）');
  const aiChat = h('div', { class:'cc-fb-ai-chat' });
  const aiInputRow = h('div', { style:'display:flex;gap:6px;' }, [
    h('input', { type:'text', id:'cc-fb-ai-input', placeholder:'跟 AI 說⋯', style:'flex:1;padding:8px 10px;border:1px solid #E1E5E8;border-radius:8px;font-size:12px;font-family:inherit;outline:none;' }),
    h('button', { type:'button', id:'cc-fb-ai-send', class:'cc-fb-btn primary', style:'flex:0 0 auto;padding:8px 12px;' }, '送')
  ]);
  aiChat.appendChild(aiInputRow);

  aiBtn.addEventListener('click', () => {
    aiChat.classList.toggle('on');
    if (aiChat.classList.contains('on') && state.aiHistory.length === 0) {
      const greeting = state.kind === 'bug'
        ? '嗨～我來幫你把 bug 描述清楚。告訴我：你在哪個頁面、點了什麼、期望什麼、實際發生什麼？我會幫你整理成完整 bug 報告。'
        : '嗨～說說你希望這個網站多什麼功能或怎麼改會更好？我幫你把想法整理得具體，好讓工程師直接開工。';
      addAiMsg('assistant', greeting);
    }
  });

  function addAiMsg(role, text){
    const msg = h('div', { class:`cc-fb-ai-msg ${role}` }, text);
    aiChat.insertBefore(msg, aiInputRow);
    aiChat.scrollTop = aiChat.scrollHeight;
  }

  async function sendAiMsg(){
    const input = document.getElementById('cc-fb-ai-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addAiMsg('user', text);
    state.aiHistory.push({ role:'user', content: text });

    const sendBtn = document.getElementById('cc-fb-ai-send');
    sendBtn.disabled = true;
    const loading = h('div', { class:'cc-fb-ai-msg assistant' }, '⋯');
    aiChat.insertBefore(loading, aiInputRow);

    const systemPrompt = `你是淨淨美學工作室內部測試工具的 bug 分類與需求釐清助手。
使用者正在${state.kind === 'bug' ? '回報 bug' : '提出許願 / 改善建議'}。
請用繁體中文（台灣），友善、精簡（最多 3 段）、問關鍵問題釐清細節。
目標：幫使用者把描述寫得「工程師看了就能動工」，包含：
- 發生在哪個頁面/按鈕/功能
- 重現步驟（1/2/3...）
- 預期行為 vs 實際行為
- 影響範圍（擋工作 or 只是不便）
- 螢幕環境（手機/桌機，選填）

如果使用者描述已足夠完整，回覆：「資訊夠了，你可以直接填到下面表單然後送出 ✓」
不要自己編造細節，只根據使用者說的內容釐清。`;

    try {
      const res = await fetch('/api/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          systemPrompt,
          messages: state.aiHistory.slice(-8),
          stream: false,
          maxTokens: 400,
        }),
      });
      const data = await res.json();
      loading.remove();
      if (!res.ok || data.error) {
        addAiMsg('assistant', `⚠ ${data.error || '錯誤'}`);
      } else {
        const reply = data.reply || '（沒有回應）';
        addAiMsg('assistant', reply);
        state.aiHistory.push({ role:'assistant', content: reply });
      }
    } catch (e) {
      loading.remove();
      addAiMsg('assistant', '⚠ 連線失敗：' + e.message);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // 表單內容
  const bugForm = h('div', {}, [
    h('div', { class:'cc-fb-ai-assist' }, [
      document.createTextNode('描述越具體越好：在哪個頁面、點了什麼、期望什麼、發生什麼。'),
    ]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '問題標題（必填）'), fTitle]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '詳細描述（必填）'), fDetail]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '重現步驟'), fSteps]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '預期行為'), fExpected]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '實際行為'), fActual]),
    h('div', { class:'cc-fb-field' }, [
      h('label', {}, '嚴重程度'),
      h('div', { class:'cc-fb-sev' }, sevBtns),
    ]),
    screenshotBox,
    aiBtn,
    aiChat,
  ]);

  const wishForm = h('div', {}, [
    h('div', { class:'cc-fb-ai-assist' }, [
      document.createTextNode('告訴我們你希望這個工具站多什麼、或哪裡用起來不順—不論大小想法都歡迎。'),
    ]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '許願標題'), fTitle]),
    h('div', { class:'cc-fb-field' }, [h('label', {}, '詳細描述'), fDetail]),
    h('div', { class:'cc-fb-field' }, [
      h('label', {}, '重要程度'),
      h('div', { class:'cc-fb-sev' }, sevBtns),
    ]),
    aiBtn,
    aiChat,
  ]);

  const body = h('div', { class:'cc-fb-body' });
  body.appendChild(bugForm);

  // Meta info
  const metaInfo = h('div', { class:'cc-fb-meta-info' });
  function refreshMeta(){
    metaInfo.innerHTML = `頁面：${location.pathname}<br>時間：${new Date().toLocaleString('zh-TW')}`;
  }
  refreshMeta();

  // Success state
  const success = h('div', { class:'cc-fb-success' }, '');

  const btnSubmit = h('button', { type:'button', class:'cc-fb-btn primary', disabled:true }, '送出');
  const btnCopyForClaude = h('button', { type:'button', class:'cc-fb-btn secondary' }, '📋 複製給 Claude Code');
  const btnDownload = h('button', { type:'button', class:'cc-fb-btn secondary' }, '💾 .md');

  const foot = h('div', { class:'cc-fb-foot' }, [
    metaInfo,
    success,
    h('div', { class:'cc-fb-actions' }, [btnSubmit, btnCopyForClaude, btnDownload]),
  ]);

  const panel = h('div', { class:'cc-fb-panel' }, [
    h('div', { class:'cc-fb-head' }, [
      h('div', { class:'ico' }, '💡'),
      h('div', { class:'meta' }, [
        h('strong', {}, 'Bug 回報 / 許願池'),
        h('span', {}, '設計部內部測試通道'),
      ]),
      h('button', { class:'cc-fb-close', title:'關閉', onclick:()=>toggle(false) }, '×'),
    ]),
    h('div', { class:'cc-fb-tabs' }, [tabBug, tabWish]),
    body,
    foot,
  ]);

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  // Tab switching
  [tabBug, tabWish].forEach(t => {
    t.addEventListener('click', () => {
      [tabBug, tabWish].forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      state.kind = t.dataset.kind;
      body.innerHTML = '';
      body.appendChild(state.kind === 'bug' ? bugForm : wishForm);
      validate();
    });
  });

  // AI send button
  panel.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'cc-fb-ai-send') sendAiMsg();
  });
  panel.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'cc-fb-ai-input' && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAiMsg();
    }
  });

  // Validate
  function validate(){
    const ok = fTitle.value.trim() && fDetail.value.trim();
    btnSubmit.disabled = !ok;
  }
  [fTitle, fDetail].forEach(el => el.addEventListener('input', validate));

  // Build payload
  function buildPayload(){
    return {
      kind: state.kind,
      page: location.pathname,
      userAgent: navigator.userAgent,
      title: fTitle.value.trim(),
      detail: fDetail.value.trim(),
      steps: state.kind === 'bug' ? fSteps.value.trim() : '',
      expected: state.kind === 'bug' ? fExpected.value.trim() : '',
      actual: state.kind === 'bug' ? fActual.value.trim() : '',
      severity: state.severity,
      screenshotBase64: state.screenshotDataUrl || undefined,
    };
  }

  function buildMarkdown(){
    const p = buildPayload();
    const head = p.kind === 'bug' ? '🐛 Bug 回報' : '💡 許願 / 改善建議';
    const lines = [
      `# ${head}：${p.title}`, '',
      `- 類型：${p.kind === 'bug' ? 'Bug' : 'Wish'}`,
      `- 嚴重程度：${p.severity}`,
      `- 頁面：${p.page}`,
      `- 時間：${new Date().toLocaleString('zh-TW')}`,
      `- User Agent：${navigator.userAgent}`,
      '',
      '## 詳細描述',
      p.detail,
    ];
    if (p.steps) lines.push('', '## 重現步驟', p.steps);
    if (p.expected) lines.push('', '## 預期行為', p.expected);
    if (p.actual) lines.push('', '## 實際行為', p.actual);
    if (p.screenshotBase64) lines.push('', '## 截圖', '（附於請求中，未貼在 markdown）');
    if (state.aiHistory.length > 0) {
      lines.push('', '## AI 釐清對話');
      state.aiHistory.forEach(m => lines.push(`**${m.role === 'user' ? '笙闆' : 'AI'}**：${m.content}`));
    }
    return lines.join('\n');
  }

  function buildClaudeCodePrompt(){
    const md = buildMarkdown();
    const p = buildPayload();
    const repoHint = `\n\n---\n**提示給 Claude Code**：這是 design.reyway.com 內部設計部測試時的${p.kind === 'bug' ? 'Bug 回報' : '許願'}。`
      + (p.kind === 'bug' ? '請依上述重現步驟定位問題、修復、commit、push。' : '請評估可行性與實作方式，列出 1-2 個具體做法後再動工。')
      + `\n\nRepo：rey555ddd/design-reyway，本機應 clone 在 ~/design-reyway。`;
    return md + repoHint;
  }

  // Submit
  btnSubmit.addEventListener('click', async () => {
    const payload = buildPayload();
    btnSubmit.disabled = true;
    const origText = btnSubmit.textContent;
    btnSubmit.textContent = '送出中…';
    try {
      const res = await fetch('/api/feedback', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        success.textContent = `⚠ 送出失敗：${data.error || '未知錯誤'}`;
        success.style.background = '#FEE2E2';
        success.style.borderColor = '#FECACA';
        success.style.color = '#B91C1C';
        success.classList.add('on');
      } else {
        success.textContent = `✓ 已送出（ID: ${data.id?.slice(0,8)}）${data.persisted ? '並保存' : '（寫 log）'}`;
        success.style.background = '';
        success.style.borderColor = '';
        success.style.color = '';
        success.classList.add('on');
        setTimeout(() => {
          // 重置表單
          fTitle.value = ''; fDetail.value = '';
          fSteps.value = ''; fExpected.value = ''; fActual.value = '';
          state.screenshotDataUrl = null; state.aiHistory = [];
          screenshotBox.innerHTML = '📸 點擊附上截圖（選填）';
          screenshotBox.appendChild(screenshotInput);
          screenshotBox.classList.remove('has-img');
          aiChat.innerHTML = ''; aiChat.appendChild(aiInputRow);
          aiChat.classList.remove('on');
          success.classList.remove('on');
          validate();
        }, 3000);
      }
    } catch (e) {
      success.textContent = `⚠ 連線失敗：${e.message}`;
      success.style.background = '#FEE2E2';
      success.style.borderColor = '#FECACA';
      success.style.color = '#B91C1C';
      success.classList.add('on');
    } finally {
      btnSubmit.textContent = origText;
      validate();
    }
  });

  // Copy for Claude Code
  btnCopyForClaude.addEventListener('click', async () => {
    if (!fTitle.value.trim() || !fDetail.value.trim()) {
      alert('請先填寫標題和詳細描述');
      return;
    }
    const prompt = buildClaudeCodePrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      success.textContent = '✓ 已複製為可貼給 Claude Code 的提示詞';
      success.style.background = ''; success.style.borderColor = ''; success.style.color = '';
      success.classList.add('on');
      setTimeout(() => success.classList.remove('on'), 2500);
    } catch {
      alert('複製失敗，請手動選取');
    }
  });

  // Download as markdown
  btnDownload.addEventListener('click', () => {
    if (!fTitle.value.trim()) { alert('請先填寫標題'); return; }
    const md = buildMarkdown();
    const blob = new Blob([md], { type:'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = fTitle.value.trim().replace(/[^\w\u4e00-\u9fa5-]+/g,'_').slice(0,30);
    a.href = url; a.download = `feedback-${state.kind}-${safe}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Toggle
  let isOpen = false;
  function toggle(force){
    isOpen = typeof force === 'boolean' ? force : !isOpen;
    panel.classList.toggle('open', isOpen);
    launcher.style.display = isOpen ? 'none' : 'flex';
    if (isOpen) {
      refreshMeta();
      setTimeout(() => fTitle.focus(), 200);
    }
  }
  launcher.addEventListener('click', () => toggle(true));
})();
