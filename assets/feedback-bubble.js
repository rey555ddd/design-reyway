/**
 * 淨淨 CleanClean — Feedback Bubble
 * 左下角浮動泡泡，兩個分頁：Bug 回報 / 許願池
 *
 * 使用：每個 HTML <body> 加上：
 *   <script src="assets/feedback-bubble.js"></script>
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
    kind: 'bug',
    severity: 'medium',
    screenshotDataUrl: null,
    aiHistory: [],
  };

  // ---- 單一 form，用 innerHTML 建構，避免 element 共用跨 form 搬移問題 ----
  const launcher = document.createElement('button');
  launcher.className = 'cc-fb-launcher';
  launcher.title = 'Bug 回報 / 許願池';
  launcher.innerHTML = `💡<span class="pulse"></span>`;

  const panel = document.createElement('div');
  panel.className = 'cc-fb-panel';
  panel.innerHTML = `
    <div class="cc-fb-head">
      <div class="ico">💡</div>
      <div class="meta">
        <strong>Bug 回報 / 許願池</strong>
        <span>設計部內部測試通道</span>
      </div>
      <button class="cc-fb-close" title="關閉">×</button>
    </div>

    <div class="cc-fb-tabs">
      <button class="cc-fb-tab on" data-kind="bug">🐛 Bug 回報</button>
      <button class="cc-fb-tab" data-kind="wish">💡 許願池</button>
    </div>

    <div class="cc-fb-body">

      <div class="cc-fb-ai-assist" data-hint-bug>
        描述越具體越好：在哪個頁面、點了什麼、期望什麼、實際發生什麼。
      </div>
      <div class="cc-fb-ai-assist" data-hint-wish style="display:none;">
        告訴我們你希望這個工具站多什麼、或哪裡用起來不順—不論大小想法都歡迎。
      </div>

      <div class="cc-fb-field">
        <label data-label-title>問題標題（必填）</label>
        <input type="text" id="cc-fb-title" maxlength="100" placeholder="一句話標題（例：copywriter 複製按鈕沒反應）">
      </div>

      <div class="cc-fb-field">
        <label>詳細描述（必填）</label>
        <textarea id="cc-fb-detail" placeholder="詳細描述⋯"></textarea>
      </div>

      <div class="cc-fb-field" data-bug-only>
        <label>重現步驟</label>
        <textarea id="cc-fb-steps" placeholder="1. ...\n2. ...\n3. ..." style="min-height:56px;"></textarea>
      </div>

      <div class="cc-fb-field" data-bug-only>
        <label>預期行為</label>
        <input type="text" id="cc-fb-expected" placeholder="應該怎樣（例：應該跳 toast 顯示「已複製」）">
      </div>

      <div class="cc-fb-field" data-bug-only>
        <label>實際行為</label>
        <input type="text" id="cc-fb-actual" placeholder="實際發生什麼（例：按了沒反應）">
      </div>

      <div class="cc-fb-field">
        <label data-label-sev>嚴重程度</label>
        <div class="cc-fb-sev">
          <button type="button" data-sev="low">小問題 / Nice to have</button>
          <button type="button" data-sev="medium" class="on">一般</button>
          <button type="button" data-sev="high">緊急 / 擋路</button>
        </div>
      </div>

      <label class="cc-fb-screenshot" id="cc-fb-screenshot-box" data-bug-only>
        <span id="cc-fb-screenshot-label">📸 點擊附上截圖（選填）</span>
        <input type="file" id="cc-fb-screenshot-input" accept="image/*">
      </label>

      <button type="button" class="cc-fb-ai-btn" id="cc-fb-ai-toggle">
        🤖 跟 AI 討論一下再送出（幫你把描述寫清楚）
      </button>

      <div class="cc-fb-ai-chat" id="cc-fb-ai-chat">
        <div style="display:flex;gap:6px;">
          <input type="text" id="cc-fb-ai-input" placeholder="跟 AI 說⋯" style="flex:1;padding:8px 10px;border:1px solid #E1E5E8;border-radius:8px;font-size:12px;font-family:inherit;outline:none;">
          <button type="button" id="cc-fb-ai-send" class="cc-fb-btn primary" style="flex:0 0 auto;padding:8px 12px;">送</button>
        </div>
      </div>

    </div>

    <div class="cc-fb-foot">
      <div class="cc-fb-meta-info" id="cc-fb-meta"></div>
      <div class="cc-fb-success" id="cc-fb-success"></div>
      <div class="cc-fb-actions">
        <button type="button" class="cc-fb-btn primary" id="cc-fb-submit" disabled>送出</button>
        <button type="button" class="cc-fb-btn secondary" id="cc-fb-copy">📋 給 Claude</button>
        <button type="button" class="cc-fb-btn secondary" id="cc-fb-download">💾 .md</button>
      </div>
    </div>
  `;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  // ---- Refs ----
  const $ = sel => panel.querySelector(sel);
  const $$ = sel => panel.querySelectorAll(sel);

  const fTitle = $('#cc-fb-title');
  const fDetail = $('#cc-fb-detail');
  const fSteps = $('#cc-fb-steps');
  const fExpected = $('#cc-fb-expected');
  const fActual = $('#cc-fb-actual');
  const screenshotBox = $('#cc-fb-screenshot-box');
  const screenshotInput = $('#cc-fb-screenshot-input');
  const screenshotLabel = $('#cc-fb-screenshot-label');
  const aiToggle = $('#cc-fb-ai-toggle');
  const aiChat = $('#cc-fb-ai-chat');
  const aiInput = $('#cc-fb-ai-input');
  const aiSend = $('#cc-fb-ai-send');
  const metaEl = $('#cc-fb-meta');
  const successEl = $('#cc-fb-success');
  const submitBtn = $('#cc-fb-submit');
  const copyBtn = $('#cc-fb-copy');
  const downloadBtn = $('#cc-fb-download');
  const closeBtn = $('.cc-fb-close');
  const bugOnlySections = $$('[data-bug-only]');
  const hintBug = $('[data-hint-bug]');
  const hintWish = $('[data-hint-wish]');
  const labelTitle = $('[data-label-title]');
  const labelSev = $('[data-label-sev]');

  function refreshMeta(){
    metaEl.innerHTML = `頁面：${location.pathname}<br>時間：${new Date().toLocaleString('zh-TW')}`;
  }
  refreshMeta();

  // ---- Tab switching ----
  $$('.cc-fb-tab').forEach(t => {
    t.addEventListener('click', () => {
      $$('.cc-fb-tab').forEach(x => x.classList.remove('on'));
      t.classList.add('on');
      state.kind = t.dataset.kind;

      const isBug = state.kind === 'bug';
      bugOnlySections.forEach(el => el.style.display = isBug ? '' : 'none');
      hintBug.style.display = isBug ? '' : 'none';
      hintWish.style.display = isBug ? 'none' : '';
      labelTitle.textContent = isBug ? '問題標題（必填）' : '許願標題（必填）';
      labelSev.textContent = isBug ? '嚴重程度' : '重要程度';

      // 重置 AI 對話（換 tab 等於換 context）
      state.aiHistory = [];
      aiChat.classList.remove('on');
      aiChat.querySelectorAll('.cc-fb-ai-msg').forEach(m => m.remove());
    });
  });

  // ---- Severity ----
  $$('[data-sev]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.severity = btn.dataset.sev;
      $$('[data-sev]').forEach(b => b.classList.toggle('on', b.dataset.sev === state.severity));
    });
  });

  // ---- Screenshot ----
  screenshotInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ev => {
      state.screenshotDataUrl = ev.target.result;
      screenshotLabel.innerHTML = `<img src="${ev.target.result}" alt="截圖" style="max-height:100px;border-radius:6px;">`;
      screenshotBox.classList.add('has-img');
    };
    reader.readAsDataURL(f);
  });

  // ---- Validation ----
  function validate(){
    submitBtn.disabled = !(fTitle.value.trim() && fDetail.value.trim());
  }
  fTitle.addEventListener('input', validate);
  fDetail.addEventListener('input', validate);

  // ---- AI Chat ----
  aiToggle.addEventListener('click', () => {
    aiChat.classList.toggle('on');
    if (aiChat.classList.contains('on') && state.aiHistory.length === 0) {
      const greeting = state.kind === 'bug'
        ? '嗨～我來幫你把 bug 描述清楚。告訴我：你在哪個頁面、點了什麼、期望什麼、實際發生什麼？我會幫你整理成完整 bug 報告。'
        : '嗨～說說你希望這個網站多什麼功能或怎麼改會更好？我幫你把想法整理得具體，好讓工程師直接開工。';
      addAiMsg('assistant', greeting);
    }
  });

  function addAiMsg(role, text){
    const msg = document.createElement('div');
    msg.className = `cc-fb-ai-msg ${role}`;
    msg.textContent = text;
    aiChat.insertBefore(msg, aiChat.firstChild.nextSibling ? aiChat.firstChild : null);
    // 確保插在 input row 之前
    const inputRow = aiChat.querySelector('#cc-fb-ai-input').parentElement;
    aiChat.insertBefore(msg, inputRow);
    aiChat.scrollTop = aiChat.scrollHeight;
  }

  async function sendAiMsg(){
    const text = aiInput.value.trim();
    if (!text) return;
    aiInput.value = '';
    addAiMsg('user', text);
    state.aiHistory.push({ role:'user', content: text });

    aiSend.disabled = true;
    const loading = document.createElement('div');
    loading.className = 'cc-fb-ai-msg assistant';
    loading.textContent = '⋯';
    const inputRow = aiInput.parentElement;
    aiChat.insertBefore(loading, inputRow);

    const systemPrompt = `你是淨淨美學工作室內部測試工具的 bug 分類與需求釐清助手。
使用者正在${state.kind === 'bug' ? '回報 bug' : '提出許願 / 改善建議'}。
請用繁體中文（台灣），友善、精簡（最多 3 段）、問關鍵問題釐清細節。
目標：幫使用者把描述寫得「工程師看了就能動工」。
如果使用者描述已足夠完整，回覆：「資訊夠了，你可以直接填到下面表單然後送出 ✓」
不要自己編造細節，只根據使用者說的內容釐清。`;

    try {
      const res = await fetch('/api/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ systemPrompt, messages: state.aiHistory.slice(-8), stream: false, maxTokens: 400 }),
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
      aiSend.disabled = false;
      aiInput.focus();
    }
  }

  aiSend.addEventListener('click', sendAiMsg);
  aiInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMsg(); }
  });

  // ---- Payload builders ----
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
    return md + `\n\n---\n**提示給 Claude Code**：這是 design.reyway.com 內部設計部測試時的${p.kind === 'bug' ? 'Bug 回報' : '許願'}。`
      + (p.kind === 'bug' ? '請依上述重現步驟定位問題、修復、commit、push。' : '請評估可行性與實作方式，列出 1-2 個具體做法後再動工。')
      + `\n\nRepo：rey555ddd/design-reyway，本機應 clone 在 ~/design-reyway。`;
  }

  function showFlash(text, isError){
    successEl.textContent = text;
    successEl.style.background = isError ? '#FEE2E2' : '';
    successEl.style.borderColor = isError ? '#FECACA' : '';
    successEl.style.color = isError ? '#B91C1C' : '';
    successEl.classList.add('on');
    clearTimeout(successEl._t);
    successEl._t = setTimeout(() => successEl.classList.remove('on'), 3000);
  }

  function resetForm(){
    fTitle.value = ''; fDetail.value = '';
    fSteps.value = ''; fExpected.value = ''; fActual.value = '';
    state.screenshotDataUrl = null;
    state.aiHistory = [];
    screenshotLabel.textContent = '📸 點擊附上截圖（選填）';
    screenshotBox.classList.remove('has-img');
    screenshotInput.value = '';
    aiChat.classList.remove('on');
    aiChat.querySelectorAll('.cc-fb-ai-msg').forEach(m => m.remove());
    validate();
  }

  // ---- Submit ----
  submitBtn.addEventListener('click', async () => {
    const payload = buildPayload();
    submitBtn.disabled = true;
    const orig = submitBtn.textContent;
    submitBtn.textContent = '送出中…';
    try {
      const res = await fetch('/api/feedback', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showFlash(`⚠ 送出失敗：${data.error || '未知錯誤'}`, true);
      } else {
        const persisted = data.persisted ? '，已保存 90 天' : '';
        showFlash(`✓ 已送出（ID: ${(data.id || '').slice(0,8)}${persisted}）`);
        setTimeout(resetForm, 1500);
      }
    } catch (e) {
      showFlash(`⚠ 連線失敗：${e.message}`, true);
    } finally {
      submitBtn.textContent = orig;
      validate();
    }
  });

  // ---- Copy for Claude Code ----
  copyBtn.addEventListener('click', async () => {
    if (!fTitle.value.trim() || !fDetail.value.trim()) {
      showFlash('⚠ 請先填寫標題和詳細描述', true);
      return;
    }
    const prompt = buildClaudeCodePrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      showFlash('✓ 已複製為可貼給 Claude Code 的提示詞');
    } catch {
      showFlash('⚠ 複製失敗，請手動選取', true);
    }
  });

  // ---- Download .md ----
  downloadBtn.addEventListener('click', () => {
    if (!fTitle.value.trim()) { showFlash('⚠ 請先填寫標題', true); return; }
    const md = buildMarkdown();
    const blob = new Blob([md], { type:'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = fTitle.value.trim().replace(/[^\w\u4e00-\u9fa5-]+/g,'_').slice(0,30);
    a.href = url;
    a.download = `feedback-${state.kind}-${safe}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // ---- Toggle ----
  let isOpen = false;
  function toggle(force){
    isOpen = typeof force === 'boolean' ? force : !isOpen;
    panel.classList.toggle('open', isOpen);
    launcher.style.display = isOpen ? 'none' : 'flex';
    if (isOpen) { refreshMeta(); setTimeout(() => fTitle.focus(), 200); }
  }
  launcher.addEventListener('click', () => toggle(true));
  closeBtn.addEventListener('click', () => toggle(false));
})();
