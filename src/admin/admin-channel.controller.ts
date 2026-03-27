import { Controller, Get, Post, Body, Res, Req } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AlimtalkService } from '../alimtalk/alimtalk.service.js';

const WIZARD_HTML = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>채널 등록 | 파란대나무숲</title>
  <style>
    :root {
      --bg: #1C1B22;
      --card: #272631;
      --border: #3D3C4A;
      --accent: #4268F6;
      --accent-hover: #3357E4;
      --text: #F0F0F0;
      --text-muted: #9696A0;
      --error-bg: rgba(242,76,76,0.12);
      --error-border: rgba(242,76,76,0.4);
      --error-text: #F88;
      --info-bg: rgba(66,104,246,0.12);
      --info-border: rgba(66,104,246,0.4);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--card);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    header a {
      color: var(--text-muted);
      text-decoration: none;
      font-size: 14px;
    }
    header a:hover { color: var(--text); }
    header .sep { color: var(--border); }
    header .current { color: var(--text); font-weight: 500; }
    main {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 40px 16px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      width: 100%;
      max-width: 560px;
      overflow: hidden;
    }
    .card-header {
      padding: 24px;
      border-bottom: 1px solid var(--border);
    }
    .card-header h1 {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 20px;
    }
    .steps {
      display: flex;
      align-items: center;
      gap: 0;
    }
    .step-item {
      display: flex;
      align-items: center;
      flex: 1;
    }
    .step-circle {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
      background: var(--border);
      color: var(--text-muted);
      transition: background 0.2s, color 0.2s;
    }
    .step-circle.active { background: var(--accent); color: #fff; }
    .step-circle.done { background: #2e7d32; color: #fff; }
    .step-line {
      flex: 1;
      height: 2px;
      background: var(--border);
      margin: 0 8px;
      transition: background 0.2s;
    }
    .step-line.done { background: var(--accent); }
    .step-labels {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
    }
    .step-labels span {
      font-size: 12px;
      color: var(--text-muted);
      flex: 1;
      text-align: center;
    }
    .step-labels span:first-child { text-align: left; }
    .step-labels span:last-child { text-align: right; }
    .step-labels span.active { color: var(--accent); font-weight: 500; }
    .card-body { padding: 24px; }
    .form-group { margin-bottom: 20px; }
    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--text-muted);
    }
    label .required { color: #F88; margin-left: 2px; }
    input, select {
      width: 100%;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      padding: 10px 14px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus { border-color: var(--accent); }
    input::placeholder { color: var(--text-muted); }
    select option { background: var(--card); }
    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 6px;
    }
    .alert {
      padding: 12px 14px;
      border-radius: 8px;
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .alert-error {
      background: var(--error-bg);
      border: 1px solid var(--error-border);
      color: var(--error-text);
    }
    .alert-info {
      background: var(--info-bg);
      border: 1px solid var(--info-border);
      color: #8aabff;
    }
    .confirm-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }
    .confirm-row:last-child { border-bottom: none; }
    .confirm-row .label { color: var(--text-muted); }
    .confirm-row .value { font-weight: 500; }
    .card-footer {
      padding: 16px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    button {
      padding: 9px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: background 0.2s, opacity 0.2s;
    }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: var(--border);
      color: var(--text);
    }
    .btn-secondary:hover:not(:disabled) { background: #4D4C5C; }
    .btn-primary {
      background: var(--accent);
      color: #fff;
    }
    .btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
    .btn-resend {
      width: 100%;
      background: transparent;
      border: 1px solid var(--accent);
      color: var(--accent);
      margin-top: 12px;
    }
    .btn-resend:hover:not(:disabled) { background: var(--info-bg); }
    .cooldown { text-align: center; font-size: 13px; color: var(--text-muted); margin-top: 10px; }
    .spinner {
      display: inline-block;
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .category-selects { display: flex; flex-direction: column; gap: 10px; }
    #step1, #step2, #step3 { display: none; }
  </style>
</head>
<body>
  <header>
    <a href="/skyeon15">어드민</a>
    <span class="sep">›</span>
    <span class="current">채널 등록</span>
  </header>
  <main>
    <div class="card">
      <div class="card-header">
        <h1>카카오 채널 등록</h1>
        <div class="steps">
          <div class="step-item">
            <div class="step-circle active" id="sc1">1</div>
            <div class="step-line" id="sl1"></div>
          </div>
          <div class="step-item">
            <div class="step-circle" id="sc2">2</div>
            <div class="step-line" id="sl2"></div>
          </div>
          <div class="step-item">
            <div class="step-circle" id="sc3">3</div>
          </div>
        </div>
        <div class="step-labels">
          <span id="sl-1" class="active">기본 정보</span>
          <span id="sl-2">인증</span>
          <span id="sl-3">확인</span>
        </div>
      </div>
      <div class="card-body">
        <!-- Step 1 -->
        <div id="step1">
          <div id="error1" class="alert alert-error" style="display:none"></div>
          <div class="form-group">
            <label>카카오 채널 ID <span class="required">*</span></label>
            <input type="text" id="plusId" placeholder="@채널아이디" value="@">
            <div class="hint">채널 검색용 아이디를 입력하세요</div>
          </div>
          <div class="form-group">
            <label>채널 별칭 <span class="required">*</span></label>
            <input type="text" id="channelName" placeholder="파란대나무숲">
            <div class="hint">내부에서 구분할 이름이에요</div>
          </div>
          <div class="form-group">
            <label>관리자 전화번호 <span class="required">*</span></label>
            <input type="tel" id="phone" placeholder="010-1234-5678">
            <div class="hint">카카오톡 인증번호를 받을 번호예요</div>
          </div>
          <div class="form-group">
            <label>카테고리 <span class="required">*</span></label>
            <div class="category-selects">
              <select id="cat1" onchange="onCat1Change()">
                <option value="">대분류 선택</option>
              </select>
              <select id="cat2" onchange="onCat2Change()" style="display:none">
                <option value="">중분류 선택</option>
              </select>
              <select id="cat3" style="display:none">
                <option value="">소분류 선택</option>
              </select>
            </div>
          </div>
          <div class="alert alert-info">
            <strong>다음</strong> 버튼을 누르면 입력하신 전화번호로 카카오톡 인증번호가 전송돼요.
          </div>
        </div>

        <!-- Step 2 -->
        <div id="step2">
          <div id="error2" class="alert alert-error" style="display:none"></div>
          <div id="info2" class="alert alert-info"></div>
          <div class="form-group">
            <label>인증번호 <span class="required">*</span></label>
            <input type="text" id="authNum" placeholder="카카오톡으로 받은 인증번호" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
          </div>
          <button class="btn-resend" id="btnResend" onclick="resendAuth()" disabled>인증번호 재요청</button>
          <div class="cooldown" id="cooldownText"></div>
        </div>

        <!-- Step 3 -->
        <div id="step3">
          <div id="error3" class="alert alert-error" style="display:none"></div>
          <div class="confirm-row">
            <span class="label">채널 ID</span>
            <span class="value" id="c-plusId"></span>
          </div>
          <div class="confirm-row">
            <span class="label">채널 별칭</span>
            <span class="value" id="c-name"></span>
          </div>
          <div class="confirm-row">
            <span class="label">전화번호</span>
            <span class="value" id="c-phone"></span>
          </div>
          <div class="confirm-row">
            <span class="label">카테고리</span>
            <span class="value" id="c-cat"></span>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-secondary" id="btnBack" onclick="goBack()" style="display:none">이전</button>
        <button class="btn-secondary" onclick="window.location.href='/skyeon15'">취소</button>
        <button class="btn-primary" id="btnNext" onclick="goNext()">다음</button>
      </div>
    </div>
  </main>
  <script>
    let step = 1;
    let categories = null;
    let cooldownTimer = null;

    // Init
    (async () => {
      showStep(1);
      await loadCategories();
    })();

    // Phone formatting
    document.getElementById('phone').addEventListener('input', function() {
      const nums = this.value.replace(/\\D/g, '').slice(0, 11);
      if (nums.length <= 3) this.value = nums;
      else if (nums.length <= 7) this.value = nums.slice(0,3) + '-' + nums.slice(3);
      else this.value = nums.slice(0,3) + '-' + nums.slice(3,7) + '-' + nums.slice(7);
    });

    // plusId @ prefix guard
    document.getElementById('plusId').addEventListener('input', function() {
      if (!this.value.startsWith('@')) this.value = '@' + this.value.replace(/@/g, '');
    });

    // Auth num digits only
    document.getElementById('authNum').addEventListener('input', function() {
      this.value = this.value.replace(/\\D/g, '').slice(0, 6);
    });

    async function loadCategories() {
      try {
        const res = await fetch('/skyeon15/api/alimtalk/categories');
        const data = await res.json();
        categories = data;
        const cat1 = document.getElementById('cat1');
        (data.firstBusinessType || []).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.code;
          opt.textContent = c.name;
          cat1.appendChild(opt);
        });
      } catch(e) {
        showError(1, '카테고리 로딩에 실패했어요. 새로고침 해주세요.');
      }
    }

    function onCat1Change() {
      const v = document.getElementById('cat1').value;
      const cat2 = document.getElementById('cat2');
      const cat3 = document.getElementById('cat3');
      cat2.innerHTML = '<option value="">중분류 선택</option>';
      cat3.innerHTML = '<option value="">소분류 선택</option>';
      cat3.style.display = 'none';
      if (!v || !categories) { cat2.style.display = 'none'; return; }
      const items = (categories.secondBusinessType || []).filter(c => c.parentCode === v);
      items.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.name;
        cat2.appendChild(opt);
      });
      cat2.style.display = items.length ? '' : 'none';
    }

    function onCat2Change() {
      const v = document.getElementById('cat2').value;
      const cat3 = document.getElementById('cat3');
      cat3.innerHTML = '<option value="">소분류 선택</option>';
      if (!v || !categories) { cat3.style.display = 'none'; return; }
      const items = (categories.thirdBusinessType || []).filter(c => c.parentCode === v);
      items.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.name;
        cat3.appendChild(opt);
      });
      cat3.style.display = items.length ? '' : 'none';
    }

    function getCategoryCode() {
      const t = document.getElementById('cat3').value || document.getElementById('cat2').value || document.getElementById('cat1').value;
      return t;
    }

    function getCategoryLabel() {
      const labels = [];
      const v1 = document.getElementById('cat1').value;
      const v2 = document.getElementById('cat2').value;
      const v3 = document.getElementById('cat3').value;
      if (categories) {
        const f = categories.firstBusinessType?.find(c => c.code === v1);
        if (f) labels.push(f.name);
        const s = categories.secondBusinessType?.find(c => c.code === v2);
        if (s) labels.push(s.name);
        const t = categories.thirdBusinessType?.find(c => c.code === v3);
        if (t) labels.push(t.name);
      }
      return labels.join(' › ');
    }

    function showStep(n) {
      [1,2,3].forEach(i => {
        document.getElementById('step'+i).style.display = i === n ? '' : 'none';
        const sc = document.getElementById('sc'+i);
        const sl = document.getElementById('sl-'+i);
        if (i < n) { sc.className = 'step-circle done'; sc.textContent = '✓'; }
        else if (i === n) { sc.className = 'step-circle active'; sc.textContent = i; }
        else { sc.className = 'step-circle'; sc.textContent = i; }
        if (sl) { sl.className = i === n ? 'active' : (i < n ? '' : ''); }
        if (i < 3) {
          const line = document.getElementById('sl'+i);
          if (line) line.className = 'step-line' + (i < n ? ' done' : '');
        }
      });
      document.getElementById('btnBack').style.display = n > 1 ? '' : 'none';
      document.getElementById('btnNext').textContent = n === 3 ? '채널 등록' : '다음';
      step = n;
    }

    function showError(s, msg) {
      const el = document.getElementById('error'+s);
      el.textContent = msg;
      el.style.display = '';
    }
    function clearError(s) {
      document.getElementById('error'+s).style.display = 'none';
    }

    async function goNext() {
      clearError(step);
      if (step === 1) {
        const plusId = document.getElementById('plusId').value.trim();
        const name = document.getElementById('channelName').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const catCode = getCategoryCode();
        if (plusId.length <= 1) return showError(1, '채널 ID를 입력해주세요.');
        if (!name) return showError(1, '채널 별칭을 입력해주세요.');
        if (!phone) return showError(1, '전화번호를 입력해주세요.');
        if (!catCode) return showError(1, '카테고리를 선택해주세요.');
        await requestAuth(plusId, phone);
      } else if (step === 2) {
        const authNum = document.getElementById('authNum').value.trim();
        if (!authNum) return showError(2, '인증번호를 입력해주세요.');
        showStep(3);
        document.getElementById('c-plusId').textContent = document.getElementById('plusId').value;
        document.getElementById('c-name').textContent = document.getElementById('channelName').value;
        document.getElementById('c-phone').textContent = document.getElementById('phone').value;
        document.getElementById('c-cat').textContent = getCategoryLabel();
      } else if (step === 3) {
        await submitChannel();
      }
    }

    function goBack() {
      if (step > 1) showStep(step - 1);
    }

    async function requestAuth(plusId, phone) {
      const btn = document.getElementById('btnNext');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>인증번호 전송 중...';
      try {
        const res = await fetch('/skyeon15/api/alimtalk/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plusId, phone: phone.replace(/-/g, '') }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '인증 요청에 실패했어요.');
        showStep(2);
        document.getElementById('info2').textContent = phone + ' 번호로 카카오톡 인증번호가 전송됐어요.';
        startCooldown();
        document.getElementById('authNum').focus();
      } catch(e) {
        showError(1, e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '다음';
      }
    }

    async function resendAuth() {
      clearError(2);
      const plusId = document.getElementById('plusId').value.trim();
      const phone = document.getElementById('phone').value.replace(/-/g, '');
      const btn = document.getElementById('btnResend');
      btn.disabled = true;
      try {
        const res = await fetch('/skyeon15/api/alimtalk/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plusId, phone }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '재요청에 실패했어요.');
        startCooldown();
      } catch(e) {
        showError(2, e.message);
        btn.disabled = false;
      }
    }

    function startCooldown() {
      let remaining = 60;
      const resend = document.getElementById('btnResend');
      const text = document.getElementById('cooldownText');
      resend.disabled = true;
      if (cooldownTimer) clearInterval(cooldownTimer);
      cooldownTimer = setInterval(() => {
        remaining--;
        text.textContent = remaining + '초 후 재요청 가능';
        if (remaining <= 0) {
          clearInterval(cooldownTimer);
          text.textContent = '';
          resend.disabled = false;
        }
      }, 1000);
    }

    async function submitChannel() {
      const btn = document.getElementById('btnNext');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>처리 중...';
      clearError(3);
      try {
        const body = {
          plusId: document.getElementById('plusId').value.trim(),
          name: document.getElementById('channelName').value.trim(),
          phone: document.getElementById('phone').value.replace(/-/g, ''),
          authNum: document.getElementById('authNum').value.trim(),
          categoryCode: getCategoryCode(),
        };
        const res = await fetch('/skyeon15/api/alimtalk/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || '채널 등록에 실패했어요.');
        window.location.href = '/skyeon15?success=channel';
      } catch(e) {
        showError(3, e.message);
        btn.disabled = false;
        btn.textContent = '채널 등록';
      }
    }
  </script>
</body>
</html>`;

@Controller('skyeon15')
export class AdminChannelController {
  constructor(private readonly alimtalkService: AlimtalkService) {}

  @Get('channel-wizard')
  getWizardPage(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(WIZARD_HTML);
  }

  @Get('api/alimtalk/categories')
  getCategories() {
    return this.alimtalkService.getCategories();
  }

  @Post('api/alimtalk/auth')
  requestAuth(@Body() body: { plusId: string; phone: string }) {
    return this.alimtalkService.requestChannelAuth(body.plusId, body.phone);
  }

  @Post('api/alimtalk/channels')
  addChannel(
    @Body() body: { plusId: string; authNum: string; phone: string; categoryCode: string; name: string },
    @Req() req: Request,
  ) {
    return this.alimtalkService.addChannel(body, { ip: req.ip });
  }
}
