// ==================== 状態管理 ====================
let currentPage = 'home';
let currentMonth = new Date();
let collapsedCards = {};
let isCategoryChartCollapsed = true;
let cards = [];
let transactions = [];
let bankAccounts = [];
let recurringPayments = [];
let recurringLogs = [];

// ==================== ナビ設定 ====================
const ALL_NAV_ITEMS = [
  { id: 'home', label: 'ホーム', icon: 'ph-house', required: true },
  { id: 'monthly', label: '月別', icon: 'ph-calendar-blank' },
  { id: 'reserved', label: '予約', icon: 'ph-list-checks' },
  { id: 'bookmarks', label: 'ブックマーク', icon: 'ph-bookmark-simple' },
  { id: 'search', label: '検索', icon: 'ph-magnifying-glass' },
  { id: 'banks', label: '口座', icon: 'ph-bank' },
  { id: 'recurring', label: '定期支払い', icon: 'ph-arrows-clockwise' },
  { id: 'cards', label: 'カード', icon: 'ph-credit-card' },
];

const ALL_DRAWER_ITEMS = [
  { id: 'home', label: 'ホーム', icon: 'ph-house' },
  { id: 'monthly', label: '月別一覧', icon: 'ph-calendar-blank' },
  { id: 'reserved', label: '予約管理', icon: 'ph-bookmark' },
  { id: 'search', label: '検索', icon: 'ph-magnifying-glass' },
  { id: 'bookmarks', label: 'ブックマーク', icon: 'ph-bookmark' },
  { id: 'banks', label: '口座管理', icon: 'ph-bank' },
  { id: 'cards', label: 'カード管理', icon: 'ph-credit-card' },
  { id: 'recurring', label: '定期支払い', icon: 'ph-arrows-clockwise' },
  { id: 'deleted', label: '削除済み一覧', icon: 'ph-trash' },
];

function loadNavSettings() {
  try {
    const saved = localStorage.getItem('nav-settings');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  return {
    bottomNav: ALL_NAV_ITEMS.map(i => ({ id: i.id, visible: true })),
    drawerNav: ALL_DRAWER_ITEMS.map(i => ({ id: i.id }))
  };
}

function saveNavSettings(settings) {
  localStorage.setItem('nav-settings', JSON.stringify(settings));
}

let navSettings = loadNavSettings();

// ==================== 初期化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  await checkAuth();
});

async function checkAuth() {
  const progress = document.getElementById('progress-bar');

  const setProgress = (pct) => {
    if (progress) progress.style.width = pct + '%';
  };
  // 起動時に最終更新日時取得
  fetch('https://api.github.com/repos/sevenpersonalip7-commits/card-manager/commits/main', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      const date = new Date(data.commit.committer.date);
      const formatted = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      sessionStorage.setItem('app-version', data.sha.substring(0, 7));
      sessionStorage.setItem('app-version-date', formatted);
    })
    .catch(() => {});

  setProgress(20);
  const { data: { session } } = await window._db.auth.getSession();
  setProgress(50);

  if (session) {
    await loadData();
    setProgress(90);
    await new Promise(r => setTimeout(r, 300));
    setProgress(100);
    await new Promise(r => setTimeout(r, 200));
    renderApp();
  } else {
    setProgress(100);
    await new Promise(r => setTimeout(r, 200));
    renderLogin();
  }
}


function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0f1a;padding:24px">
      <div style="width:100%;max-width:360px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:48px;margin-bottom:12px">💳</div>
          <h1 style="font-size:24px;font-weight:500;color:#6ec6cf">カード管理</h1>
        </div>
        <div style="background:#1a1a2e;border-radius:16px;padding:24px">
          <div class="form-group">
            <label class="form-label">メールアドレス</label>
            <input class="form-input" id="login-email" type="email" placeholder="example@email.com">
          </div>
          <div class="form-group">
            <label class="form-label">パスワード</label>
            <input class="form-input" id="login-password" type="password" placeholder="パスワード">
          </div>
          <div id="login-error" style="color:#ff6b6b;font-size:13px;margin-bottom:12px;display:none">
            メールアドレスまたはパスワードが違います
          </div>
          <button class="btn btn-primary btn-full" onclick="login()">ログイン</button>
        </div>
      </div>
    </div>
  `;
}

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  const { error } = await window._db.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.style.display = 'block';
  } else {
    await loadData();
    renderApp();
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/card-manager/service-worker.js')
      .then(reg => {
        // 新バージョンが見つかったら自動で更新
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast('🔄 新バージョンがあります。タップして更新', 'warning', () => {
                newWorker.postMessage('skipWaiting');
                window.location.reload();
              });
            }
          });
        });
      });

    // Service Worker が切り替わったらリロード
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
}


async function loadData() {
  try {
    const { data: cardsData, error: cardsError } = await window._db
      .from('cards').select('*').eq('is_deleted', false).order('created_at');
    if (cardsError) throw cardsError;

    const { data: transData, error: transError } = await window._db
      .from('transactions').select('*').eq('is_deleted', false).order('used_date');
    if (transError) throw transError;

    const { data: bankData, error: bankError } = await window._db
      .from('bank_accounts').select('*').eq('is_deleted', false).order('created_at');
    if (bankError) throw bankError;

    cards = cardsData || [];
    transactions = transData || [];
    bankAccounts = bankData || [];

    const { data: recurringData, error: recurringError } = await window._db
      .from('recurring_payments').select('*').eq('is_deleted', false).order('billing_day');
    if (recurringError) throw recurringError;

    const { data: logsData, error: logsError } = await window._db
      .from('recurring_payment_logs').select('*').order('processed_at', { ascending: false });
    if (logsError) throw logsError;

    recurringPayments = recurringData || [];
    recurringLogs = logsData || [];
    
  } catch (e) {
    showToast('⚠️ データの読み込みに失敗しました', 'warning');
    console.error(e);
    cards = [];
    transactions = [];
  }
}

// ==================== レンダリング ====================
function renderApp() {
  document.getElementById('app').innerHTML = `
<div class="header">
      <button onclick="toggleDrawer()" style="background:none;border:none;color:white;font-size:22px;cursor:pointer;padding:4px 8px">
        <i class="ph-bold ph-list"></i>
      </button>
      <h1>💳 カード管理</h1>
      <div style="width:40px"></div>
    </div>
    <!-- オーバーレイ -->
    <div id="drawer-overlay" onclick="toggleDrawer()" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:150"></div>
    <!-- ドロワー -->
    <div id="drawer" style="position:fixed;top:0;left:-280px;width:280px;height:100vh;background:#1a1a2e;z-index:200;transition:left 0.3s ease;padding:0;display:flex;flex-direction:column">
      <div style="padding:24px 20px;border-bottom:1px solid #2a2a3e">
        <div style="font-size:13px;color:var(--gray-400);margin-bottom:4px">ログイン中</div>
        <div id="drawer-email" style="font-size:14px;color:var(--gray-800);font-weight:500"></div>
      </div>
<nav style="flex:1;padding:16px 0;overflow-y:auto">
        ${navSettings.drawerNav.map(n => {
          const item = ALL_DRAWER_ITEMS.find(i => i.id === n.id);
          if (!item) return '';
          return `
            <button onclick="navigateDrawer('${item.id}')" class="drawer-item ${currentPage === item.id ? 'drawer-active' : ''}">
              <i class="ph-bold ${item.icon}"></i>${item.label}
            </button>
          `;
        }).join('')}
        <button onclick="navigateDrawer('settings')" class="drawer-item ${currentPage === 'settings' ? 'drawer-active' : ''}">
          <i class="ph-bold ph-gear"></i>ナビ設定
        </button>
      </nav>
      
      <div id="last-updated" style="font-size:11px;color:var(--gray-400);text-align:center;margin-bottom:6px"></div>
        <button onclick="checkUpdate()" class="btn btn-ghost btn-full" style="margin-bottom:8px">
          <i class="ph-bold ph-arrow-clockwise"></i>　更新を確認
        </button>
        
        <button onclick="logout()" class="btn btn-danger btn-full">
          <i class="ph-bold ph-sign-out"></i>　ログアウト
        </button>
      </div>
        </div>
    <div class="main" id="main-content"></div>
<nav class="bottom-nav">
      ${navSettings.bottomNav
        .filter(n => n.visible)
        .map(n => {
          const item = ALL_NAV_ITEMS.find(i => i.id === n.id);
          if (!item) return '';
          return `
            <button onclick="navigate('${item.id}')" class="${currentPage === item.id ? 'active' : ''}">
              <i class="ph-bold ${item.icon}"></i>${item.label}
            </button>
          `;
        }).join('')}

<!-- 削除済み一覧（頻繁に使用しないためコメントアウト）
        <button onclick="navigateDrawer('deleted')" class="drawer-item ${currentPage === 'deleted' ? 'drawer-active' : ''}">
          <i class="ph-bold ph-trash"></i>削除済み一覧
        </button>
        -->
    </nav>
    ${currentPage !== 'cards' ? `<button class="fab" onclick="openAddTransaction()"><i class="ph-bold ph-plus"></i></button>` : ''}
  `;
  renderPage();
}

function navigate(page) {
  currentPage = page;
  renderApp();
}

function renderPage() {
  const el = document.getElementById('main-content');
if (currentPage === 'home') el.innerHTML = renderHome();
  else if (currentPage === 'monthly') el.innerHTML = renderMonthly();
  else if (currentPage === 'reserved') el.innerHTML = renderReserved();
  else if (currentPage === 'cards') el.innerHTML = renderCards();
else if (currentPage === 'banks') el.innerHTML = renderBanks();
  else if (currentPage === 'recurring') el.innerHTML = renderRecurring();
  else if (currentPage === 'bookmarks') el.innerHTML = renderBookmarks();
  else if (currentPage === 'search') el.innerHTML = renderSearch();
  else if (currentPage === 'category-detail') el.innerHTML = renderCategoryDetail();
else if (currentPage === 'deleted') el.innerHTML = renderDeleted();
  else if (currentPage === 'settings') el.innerHTML = renderNavSettings();
}

// ==================== 日付ユーティリティ ====================
function formatDate(date) {
  const d = new Date(date);
  const days = ['日','月','火','水','木','金','土'];
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}(${days[d.getDay()]})`;
}

function calcBillingDate(usedDate, closingDay, billingDay) {
  const used = new Date(usedDate);
  const year = used.getFullYear();
  const month = used.getMonth();
  const day = used.getDate();

  let billingMonth = month + 1;
  if (day <= closingDay) billingMonth = month;
  billingMonth += 1;

  const billingYear = year + Math.floor(billingMonth / 12);
  const normalizedMonth = billingMonth % 12;

  const lastDay = new Date(billingYear, normalizedMonth + 1, 0).getDate();
  const actualDay = Math.min(billingDay, lastDay);

  return new Date(billingYear, normalizedMonth, actualDay);
}

function formatYearMonth(date) {
  return `${date.getFullYear()}年${date.getMonth()+1}月`;
}

function isSameMonth(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth();
}

function formatAmount(num) {
  return Number(num).toLocaleString('ja-JP') + '円';
}

// ==================== 定期支払いユーティリティ ====================
const FREQUENCY_LABELS = {
  monthly: '毎月',
  bimonthly: '隔月',
  quarterly: '四半期（3ヶ月ごと）',
  biannual: '年2回（6ヶ月ごと）',
  annual: '年1回'
};

const FREQUENCY_MONTHS = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  biannual: 6,
  annual: 12
};

function isRecurringDueThisMonth(payment, targetDate) {
  const start = new Date(payment.start_date);
  const target = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
  const startMonth = new Date(start.getFullYear(), start.getMonth(), 1);

  if (target < startMonth) return false;

  const monthDiff = (target.getFullYear() - startMonth.getFullYear()) * 12
    + (target.getMonth() - startMonth.getMonth());

  const interval = FREQUENCY_MONTHS[payment.frequency] || 1;
  return monthDiff % interval === 0;
}

function isRecurringProcessed(paymentId, year, month) {
  return recurringLogs.some(log =>
    log.recurring_payment_id === paymentId &&
    log.target_year === year &&
    log.target_month === month
  );
}

// ==================== ホーム画面 ====================
function renderHome() {
  const targetTx = transactions.filter(tx => {
    const card = cards.find(c => c.id === tx.card_id);
    if (!card) return false;
    const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
    return isSameMonth(billing, currentMonth);
  });

  const totalAmount = targetTx.reduce((sum, tx) => sum + tx.amount, 0);
  const confirmedCount = targetTx.filter(tx => tx.is_confirmed).length;
  const unconfirmedCount = targetTx.filter(tx => !tx.is_confirmed).length;

const cardGroups = cards.map(card => {
    const cardTx = targetTx
      .filter(tx => tx.card_id === card.id)
      .sort((a, b) => new Date(b.used_date) - new Date(a.used_date));
    const cardTotal = cardTx.reduce((sum, tx) => sum + tx.amount, 0);

    // その月の引き落とし予定日を計算
    const billingLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const billingDay = Math.min(card.billing_day, billingLastDay);
    const billingDate = `${currentMonth.getMonth() + 1}/${String(billingDay).padStart(2, '0')}`;

    return { card, transactions: cardTx, total: cardTotal, billingDate };
  }).filter(g => g.transactions.length > 0);

return `
<div>
    <div class="month-nav">
      <button onclick="changeMonth(-1)">‹</button>
      <span class="month-label" ontouchstart="handleTouchStart(event)" ontouchend="handleTouchEnd(event)" style="padding:12px 24px;cursor:grab">${formatYearMonth(currentMonth)}</span>
      <button onclick="changeMonth(1)">›</button>
    </div>
        <div class="card">
      <div class="summary-amount">${formatAmount(totalAmount)}</div>
      <div class="summary-sub">確定 ${confirmedCount}件 ／ 未確定 ${unconfirmedCount}件</div>
    </div>
    ${cardGroups.length > 0 ? `
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button class="btn btn-ghost" style="flex:1;font-size:12px;padding:6px" onclick="expandAllCards()">
        <i class="ph-bold ph-arrows-out"></i>　全て開く
      </button>
      <button class="btn btn-ghost" style="flex:1;font-size:12px;padding:6px" onclick="collapseAllCards()">
        <i class="ph-bold ph-arrows-in"></i>　全て閉じる
      </button>
    </div>
    ` : ''}
    ${targetTx.length > 0 ? renderCategoryChart(targetTx) : ''}
    ${cardGroups.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">データがありません</div>' :
      cardGroups.map(g => {
const isCollapsed = collapsedCards[g.card.id] !== undefined ? collapsedCards[g.card.id] : true;
        return `
          <div class="card" style="width:100%;box-sizing:border-box;padding:0;overflow:hidden">
            <div class="card-total-row" onclick="toggleCardGroup('${g.card.id}')" style="cursor:pointer">
              <div style="display:flex;align-items:center;gap:8px">
                <i class="ph-bold ${isCollapsed ? 'ph-caret-right' : 'ph-caret-down'}" style="font-size:14px;opacity:0.8"></i>
                <span class="card-total-label">🏦 ${g.card.name}　${g.billingDate}引き落とし</span>
              </div>
              <span class="card-total-amount">${formatAmount(g.total)}</span>
              </div>
            <div id="card-group-${g.card.id}" style="display:${isCollapsed ? 'none' : 'block'}">
              <div class="card-transactions" style="padding:0 16px">
              ${g.transactions.map(tx => `
                <div class="transaction-item" onclick="openEditTransaction('${tx.id}')">
                  <div class="transaction-info">
                    <div class="shop">${tx.shop || '（購入先未設定）'}
                      ${tx.is_confirmed ? '<span class="badge badge-confirmed">確定</span>' : '<span class="badge badge-reserved">未確定</span>'}
                    </div>
                    <div class="date">${formatDate(tx.used_date)}　${tx.category || ''}</div>
                    ${tx.detail ? `<div style="font-size:12px;color:var(--gray-400);margin-top:2px">${tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail}</div>` : ''}
                  </div>
                  <div class="transaction-amount">${formatAmount(tx.amount)}</div>
                </div>
              `).join('')}
              </div>
              <div style="padding:8px 16px;text-align:right;font-size:12px;color:var(--gray-400)">
                ${g.transactions.length}件
              </div>
            </div>
          </div>
        `;
      }).join('')
    }
  `;
}

function changeMonth(diff) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + diff, 1);
  renderPage();
}

function toggleCardGroup(cardId) {
  collapsedCards[cardId] = !collapsedCards[cardId];
  renderPage();
}

function expandAllCards() {
  cards.forEach(card => { collapsedCards[card.id] = false; });
  renderPage();
}

function collapseAllCards() {
  cards.forEach(card => { collapsedCards[card.id] = true; });
  renderPage();
}

function toggleCategoryChart() {
  isCategoryChartCollapsed = !isCategoryChartCollapsed;
  renderPage();
}

// ==================== カテゴリグラフ ====================
const CHART_COLORS = [
  '#6ec6cf', '#a78bfa', '#f472b6', '#fb923c',
  '#34d399', '#60a5fa', '#fbbf24', '#e879f9',
  '#4ade80', '#f87171'
];

function renderCategoryChart(targetTx) {
  const categoryMap = {};
  targetTx.forEach(tx => {
    const key = tx.category || '未分類';
    if (!categoryMap[key]) categoryMap[key] = 0;
    categoryMap[key] += tx.amount;
  });

  const sorted = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1]);

  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return '';

  const bars = sorted.map(([label, value], i) => {
    const ratio = value / total;
    const percent = Math.round(ratio * 100);
    const color = CHART_COLORS[i % CHART_COLORS.length];

    return `
      <div class="legend-item" onclick="openCategoryDetail('${encodeURIComponent(label)}')">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div class="legend-left">
              <div class="legend-dot" style="background:${color}"></div>
              <span class="legend-label">${label}</span>
            </div>
            <div style="text-align:right">
              <span class="legend-amount">${formatAmount(value)}</span>
              <span class="legend-percent" style="margin-left:6px">${percent}%</span>
            </div>
          </div>
          <div style="background:var(--gray-200);border-radius:99px;height:6px;overflow:hidden">
            <div style="background:${color};width:${percent}%;height:100%;border-radius:99px;transition:width 0.3s ease"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="card" style="padding:0;overflow:hidden">
      <div onclick="toggleCategoryChart()" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;background:var(--gray-200)">
        <div style="display:flex;align-items:center;gap:8px">
          <i class="ph-bold ${isCategoryChartCollapsed ? 'ph-caret-right' : 'ph-caret-down'}" style="color:var(--primary);font-size:16px"></i>
          <span style="font-size:14px;font-weight:500">カテゴリ別集計</span>
        </div>
        <span style="font-size:13px;color:var(--gray-400)">${formatAmount(total)}</span>
      </div>
      <div id="category-chart-body" style="display:${isCategoryChartCollapsed ? 'none' : 'block'};padding:16px">
        ${bars}
      </div>
    </div>
  `;
}

function openCategoryDetail(encodedCategory) {
  const category = decodeURIComponent(encodedCategory);
  currentPage = 'category-detail';
  window._categoryDetail = { category, month: new Date(currentMonth) };
  renderPage();
}

function renderCategoryDetail() {
  const { category, month } = window._categoryDetail;

  const targetTx = transactions.filter(tx => {
    const card = cards.find(c => c.id === tx.card_id);
    if (!card) return false;
    const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
    const txCategory = tx.category || '未分類';
    return isSameMonth(billing, month) && txCategory === category;
  });

  const total = targetTx.reduce((sum, tx) => sum + tx.amount, 0);

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <button onclick="navigate('home')" style="background:none;border:none;color:var(--primary);font-size:24px;cursor:pointer;padding:4px">
        <i class="ph-bold ph-arrow-left"></i>
      </button>
      <div>
        <div style="font-size:16px;font-weight:500">${category}</div>
        <div style="font-size:12px;color:var(--gray-400)">${formatYearMonth(month)}</div>
      </div>
      <div style="margin-left:auto;font-size:18px;font-weight:500;color:var(--primary)">${formatAmount(total)}</div>
    </div>
    ${targetTx.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">データがありません</div>' :
      targetTx.map(tx => {
        const card = cards.find(c => c.id === tx.card_id);
        return `
          <div class="card transaction-item" onclick="openEditTransaction('${tx.id}')">
            <div class="transaction-info">
              <div class="shop">${tx.shop || '（購入先未設定）'}
                ${tx.is_confirmed ? '<span class="badge badge-confirmed">確定</span>' : '<span class="badge badge-reserved">未確定</span>'}
              </div>
              <div class="date">${formatDate(tx.used_date)}　${card ? card.name : ''}</div>
              ${tx.detail ? `<div style="font-size:12px;color:var(--gray-400);margin-top:2px">${tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail}</div>` : ''}
            </div>
            <div class="transaction-amount">${formatAmount(tx.amount)}</div>
          </div>
        `;
      }).join('')
    }
  `;
}

// ==================== 月別一覧 ====================
let collapsedYears = {};

function renderMonthly() {
  const monthMap = {};
  transactions.forEach(tx => {
    const card = cards.find(c => c.id === tx.card_id);
    if (!card) return;
    const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
    const key = `${billing.getFullYear()}-${String(billing.getMonth()+1).padStart(2,'0')}`;
    if (!monthMap[key]) monthMap[key] = { date: billing, total: 0 };
    monthMap[key].total += tx.amount;
  });

  const sorted = Object.entries(monthMap).sort((a,b) => b[0].localeCompare(a[0]));

  // 年別にグループ化
  const yearMap = {};
  sorted.forEach(([key, val]) => {
    const year = val.date.getFullYear();
    if (!yearMap[year]) yearMap[year] = [];
    yearMap[year].push([key, val]);
  });

  const currentYear = new Date().getFullYear();
  const years = Object.keys(yearMap).sort((a,b) => b - a);

  // 年別合計
  const yearTotals = {};
  years.forEach(year => {
    yearTotals[year] = yearMap[year].reduce((sum, [, val]) => sum + val.total, 0);
  });

  return `
      <h2 style="font-size:16px;font-weight:500;margin-bottom:12px">月別引き落とし一覧</h2>
    ${years.length > 0 ? `
    <div style="display:flex;gap:8px;margin-bottom:8px">
      <button class="btn btn-ghost" style="flex:1;font-size:12px;padding:6px" onclick="expandAllYears()">
        <i class="ph-bold ph-arrows-out"></i>　全て開く
      </button>
      <button class="btn btn-ghost" style="flex:1;font-size:12px;padding:6px" onclick="collapseAllYears()">
        <i class="ph-bold ph-arrows-in"></i>　全て閉じる
      </button>
    </div>
    ` : ''}
    ${years.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">データがありません</div>' :
      years.map(year => {
        const isCurrentYear = parseInt(year) === currentYear;
        const isCollapsed = collapsedYears[year] !== undefined ? collapsedYears[year] : !isCurrentYear;

        return `
          <div class="card" style="padding:0;overflow:hidden;margin-bottom:12px">
            <!-- 年ヘッダー -->
            <div onclick="toggleYear(${year})" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;background:var(--gray-200)">
              <div style="display:flex;align-items:center;gap:8px">
                <i class="ph-bold ${isCollapsed ? 'ph-caret-right' : 'ph-caret-down'}" style="color:var(--primary);font-size:16px"></i>
                <span style="font-size:16px;font-weight:500">${year}年</span>
              </div>
              <span style="font-size:15px;font-weight:500;color:var(--primary)">${formatAmount(yearTotals[year])}</span>
            </div>
            <!-- 月別リスト -->
            <div id="year-${year}" style="display:${isCollapsed ? 'none' : 'block'}">
              ${yearMap[year].map(([key, val]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--gray-200);cursor:pointer" onclick="goToMonth('${key}')">
                  <span style="font-size:15px">${val.date.getMonth()+1}月 引き落とし</span>
                  <span style="font-size:15px;font-weight:500">${formatAmount(val.total)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }).join('')
    }
  `;
}

function toggleYear(year) {
  const el = document.getElementById(`year-${year}`);
  if (!el) return;
  const isCollapsed = el.style.display === 'none';
  el.style.display = isCollapsed ? 'block' : 'none';
  collapsedYears[year] = !isCollapsed;
  renderPage();
}

function expandAllYears() {
  const years = Object.keys(yearMap || {});
  document.querySelectorAll('[id^="year-"]').forEach(el => {
    el.style.display = 'block';
    const year = el.id.replace('year-', '');
    collapsedYears[year] = false;
  });
  renderPage();
}

function collapseAllYears() {
  document.querySelectorAll('[id^="year-"]').forEach(el => {
    el.style.display = 'none';
    const year = el.id.replace('year-', '');
    collapsedYears[year] = true;
  });
  renderPage();
}

function goToMonth(key) {
  const [y, m] = key.split('-').map(Number);
  currentMonth = new Date(y, m - 1, 1);
  navigate('home');
}

// ==================== 予約管理 ====================
let expandedDetails = {};

function renderReserved() {
  let reserved = transactions.filter(tx => !tx.is_confirmed);
  reserved.sort((a,b) => new Date(a.used_date) - new Date(b.used_date));

  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:12px">予約・未確定管理</h2>
    ${reserved.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">未確定データはありません</div>' :
      reserved.map(tx => {
        const card = cards.find(c => c.id === tx.card_id);
        const isExpanded = expandedDetails[tx.id] || false;
        const detailLines = (tx.detail || '').split('\n');
        const isLong = detailLines.length > 2 || (tx.detail || '').length > 60;
        const previewDetail = detailLines.slice(0, 2).join('\n');

        return `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;cursor:pointer" onclick="openEditTransaction('${tx.id}')">
              <div>
                <div class="shop">${tx.shop || '（購入先未設定）'}</div>
                <div class="date" style="font-size:12px;color:var(--gray-400);margin-top:2px">${formatDate(tx.used_date)}　${card ? card.name : ''}　${tx.category || ''}</div>
              </div>
              <div class="transaction-amount" style="white-space:nowrap;margin-left:8px">${formatAmount(tx.amount)}</div>
            </div>
            ${tx.detail ? `
              <div style="border-top:1px solid var(--gray-200);padding-top:8px;margin-top:4px">
                <div style="font-size:13px;color:var(--gray-600);white-space:pre-wrap">${isExpanded ? tx.detail : previewDetail}${!isExpanded && isLong ? '…' : ''}</div>
                ${isLong ? `
                  <div onclick="toggleDetail('${tx.id}')" style="font-size:12px;color:var(--primary);margin-top:6px;cursor:pointer;text-align:right">
                    ${isExpanded ? '<i class="ph-bold ph-caret-up"></i> 閉じる' : '<i class="ph-bold ph-caret-down"></i> すべて表示'}
                  </div>
                ` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('')
    }
  `;
}

function toggleDetail(txId) {
  expandedDetails[txId] = !expandedDetails[txId];
  renderPage();
}
    // ==================== 定期支払い管理 ====================
function renderRecurring() {
  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:12px">定期支払い管理</h2>
    <button class="btn btn-primary btn-full" style="margin-bottom:16px" onclick="openAddRecurring()">
      ＋ 定期支払いを追加
    </button>
    ${recurringPayments.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">定期支払いが登録されていません</div>' :
      recurringPayments.map(r => {
        const bank = bankAccounts.find(b => b.id === r.bank_account_id);
        const today = new Date();
        const isDue = isRecurringDueThisMonth(r, today);
        const processed = isRecurringProcessed(r.id, today.getFullYear(), today.getMonth() + 1);

        return `
          <div class="card" style="margin-bottom:12px;opacity:${r.is_active ? '1' : '0.6'}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div style="flex:1;cursor:pointer" onclick="openEditRecurring('${r.id}')">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-size:15px;font-weight:500">${r.name}</span>
                  ${!r.is_active ? '<span style="font-size:11px;background:var(--gray-200);color:var(--gray-400);padding:2px 6px;border-radius:99px">オフ中</span>' : ''}
                  ${isDue && processed ? '<span style="font-size:11px;background:#1a2d1a;color:var(--success);padding:2px 6px;border-radius:99px">今月処理済</span>' : ''}
                  ${isDue && !processed && r.is_active ? '<span style="font-size:11px;background:#2d1a1a;color:var(--danger);padding:2px 6px;border-radius:99px">今月未処理</span>' : ''}
                </div>
                <div style="font-size:13px;color:var(--gray-400)">${FREQUENCY_LABELS[r.frequency]}　${r.billing_day}日　${bank ? bank.name : '口座未設定'}</div>
                ${r.memo ? `<div style="font-size:12px;color:var(--gray-400);margin-top:4px">${r.memo}</div>` : ''}
              </div>
              <div style="text-align:right;margin-left:12px">
                <div style="font-size:16px;font-weight:500">${formatAmount(r.amount)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('')
    }
  `;
}

function openAddRecurring() {
  showRecurringModal(null);
}

function openEditRecurring(id) {
  const r = recurringPayments.find(r => r.id === id);
  showRecurringModal(r);
}

function showRecurringModal(r) {
  const isEdit = !!r;
  const todayString = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${isEdit ? '定期支払い編集' : '定期支払い追加'}</div>
      <div class="form-group">
        <label class="form-label">名称 *</label>
        <input class="form-input" id="rec-name" value="${r?.name || ''}" placeholder="例：家賃・電気代">
      </div>
      <div class="form-group">
        <label class="form-label">金額（円） *</label>
        <input class="form-input" id="rec-amount" type="number" value="${r?.amount || ''}" placeholder="例：50000">
      </div>
      <div class="form-group">
        <label class="form-label">引き落とし口座</label>
        <select class="form-input" id="rec-bank">
          <option value="">未設定</option>
          ${bankAccounts.map(b => `<option value="${b.id}" ${r?.bank_account_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">引き落とし日 *</label>
        <input class="form-input" id="rec-day" type="number" min="1" max="31" value="${r?.billing_day || ''}" placeholder="例：27">
      </div>
      <div class="form-group">
        <label class="form-label">頻度 *</label>
        <select class="form-input" id="rec-frequency">
          ${Object.entries(FREQUENCY_LABELS).map(([val, label]) =>
            `<option value="${val}" ${r?.frequency === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">開始日 *</label>
        <input class="form-input" id="rec-start" type="date" value="${r?.start_date || todayString}">
      </div>
      <div class="form-group">
        <label class="form-label">メモ</label>
        <input class="form-input" id="rec-memo" value="${r?.memo || ''}" placeholder="任意メモ">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="rec-active" ${r?.is_active !== false ? 'checked' : ''}>
        <label for="rec-active" class="form-label" style="margin:0">有効（オン）</label>
      </div>
      ${isEdit ? `
        <div class="delete-check">
          <input type="checkbox" id="rec-delete">
          <label for="rec-delete">この定期支払いを削除する</label>
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveRecurring('${r?.id || ''}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

async function saveRecurring(id) {
  const name = document.getElementById('rec-name').value.trim();
  const amount = parseInt(document.getElementById('rec-amount').value);
  const bank_account_id = document.getElementById('rec-bank').value || null;
  const billing_day = parseInt(document.getElementById('rec-day').value);
  const frequency = document.getElementById('rec-frequency').value;
  const start_date = document.getElementById('rec-start').value;
  const memo = document.getElementById('rec-memo').value.trim();
  const is_active = document.getElementById('rec-active').checked;
  const is_deleted = document.getElementById('rec-delete')?.checked || false;

  if (!name || isNaN(amount) || !billing_day || !frequency || !start_date) {
    alert('必須項目を入力してください');
    return;
  }

  try {
    if (id) {
      const { error } = await window._db.from('recurring_payments')
        .update({ name, amount, bank_account_id, billing_day, frequency, start_date, memo, is_active, is_deleted, updated_at: new Date() })
        .eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window._db.from('recurring_payments')
        .insert({ name, amount, bank_account_id, billing_day, frequency, start_date, memo, is_active });
      if (error) throw error;
    }
    closeModal();
    await loadData();
    renderPage();
    showToast('✅ 保存しました');
  } catch (e) {
    showToast('❌ 保存に失敗しました', 'error');
    console.error(e);
  }
}

  // ==================== 口座管理 ====================
function renderBanks() {
  const today = new Date();

  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:12px">口座管理</h2>
    <button class="btn btn-primary btn-full mt-8" onclick="openAddBank()" style="margin-bottom:16px">
      ＋ 口座を追加
    </button>
    ${bankAccounts.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">口座が登録されていません</div>' :
      bankAccounts.map(bank => {
        // この口座に紐付いたカードを取得
        const linkedCards = cards.filter(c => c.bank_account_id === bank.id);

        // 各カードの今月引き落とし予定額を集計
        let totalBilling = 0;
        const cardBillings = linkedCards.map(card => {
          const billingLastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
          const billingDay = Math.min(card.billing_day, billingLastDay);
          const billingDate = new Date(today.getFullYear(), today.getMonth(), billingDay);

          // 引き落とし日を過ぎていたら除外
          if (today > billingDate) return { card, amount: 0, billingDate, isPast: true };

          const cardTx = transactions.filter(tx => {
            if (tx.card_id !== card.id) return false;
            const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
            return isSameMonth(billing, today);
          });

          const amount = cardTx.reduce((sum, tx) => sum + tx.amount, 0);
          totalBilling += amount;
          return { card, amount, billingDate, isPast: false };
        });

        const balance = bank.balance;
        const remaining = balance - totalBilling;
        const isShort = remaining < 0;

        return `
          <div class="card" style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <div>
                <div style="font-size:16px;font-weight:500">${bank.name}</div>
                <div style="font-size:12px;color:var(--gray-400);margin-top:2px">残高</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:20px;font-weight:500;color:var(--primary)">${formatAmount(balance)}</div>
                <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px;margin-top:4px" onclick="openEditBank('${bank.id}')">
                  <i class="ph-bold ph-pencil"></i> 編集
                </button>
              </div>
            </div>

            ${(() => {
              // この口座の定期支払いを取得
              const linkedRecurring = recurringPayments.filter(r => r.bank_account_id === bank.id);
              const dueRecurring = linkedRecurring.filter(r =>
                isRecurringDueThisMonth(r, today)
              );

              if (dueRecurring.length === 0) return '';

              const recurringTotal = dueRecurring
                .filter(r => r.is_active)
                .reduce((sum, r) => {
                  const processed = isRecurringProcessed(r.id, today.getFullYear(), today.getMonth() + 1);
                  return processed ? sum : sum + r.amount;
                }, 0);

              totalBilling += recurringTotal;

              return `
                <div style="border-top:1px solid var(--gray-200);padding-top:12px;margin-top:12px">
                  <div style="font-size:13px;color:var(--gray-400);margin-bottom:8px">今月の定期支払い</div>
                  ${dueRecurring.map(r => {
                    const processed = isRecurringProcessed(r.id, today.getFullYear(), today.getMonth() + 1);
                    return `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-200)">
                        <div>
                          <div style="font-size:14px">${r.name}
                            ${!r.is_active ? '<span style="font-size:11px;color:var(--gray-400);margin-left:4px">オフ中</span>' : ''}
                            ${processed ? '<span style="font-size:11px;color:var(--success);margin-left:4px">処理済</span>' : ''}
                          </div>
                          <div style="font-size:11px;color:var(--gray-400)">${r.billing_day}日　${FREQUENCY_LABELS[r.frequency]}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px">
                          <div style="font-size:14px;font-weight:500;color:${!r.is_active || processed ? 'var(--gray-400)' : 'var(--gray-800)'}">${formatAmount(r.amount)}</div>
                          ${r.is_active && !processed ? `
                            <button class="btn btn-ghost" style="font-size:11px;padding:4px 8px" onclick="processRecurring('${r.id}', ${r.amount}, ${today.getFullYear()}, ${today.getMonth() + 1})">
                              処理
                            </button>
                          ` : ''}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              `;
            })()}
            ${linkedCards.length > 0 ? `
              <div style="border-top:1px solid var(--gray-200);padding-top:12px">
                <div style="font-size:13px;color:var(--gray-400);margin-bottom:8px">今月の引き落とし予定</div>
                ${cardBillings.map(({ card, amount, billingDate, isPast }) => `
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--gray-200)">
                    <div>
                      <div style="font-size:14px">${card.name}</div>
                      <div style="font-size:11px;color:var(--gray-400)">${billingDate.getMonth()+1}/${String(billingDate.getDate()).padStart(2,'0')}引き落とし${isPast ? '（済）' : ''}</div>
                    </div>
                    <div style="font-size:14px;font-weight:500;color:${isPast ? 'var(--gray-400)' : 'var(--gray-800)'}">${isPast ? '-' : formatAmount(amount)}</div>
                  </div>
                `).join('')}

                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;margin-top:4px">
                  <div style="font-size:14px;font-weight:500">引き落とし合計</div>
                  <div style="font-size:16px;font-weight:500">${formatAmount(totalBilling)}</div>
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;background:${isShort ? '#2d1a1a' : '#1a2d1a'}">
                  <div style="font-size:14px;font-weight:500;color:${isShort ? 'var(--danger)' : 'var(--success)'}">${isShort ? '⚠️ 残高不足' : '✅ 残高充足'}</div>
                  <div style="font-size:16px;font-weight:500;color:${isShort ? 'var(--danger)' : 'var(--success)'}">
                    ${isShort ? '-' : '+'}${formatAmount(Math.abs(remaining))}
                  </div>
                </div>

                ${totalBilling > 0 ? `
                  <button class="btn btn-primary btn-full" style="margin-top:12px" onclick="createBillingTransaction('${bank.id}', ${totalBilling})">
                    <i class="ph-bold ph-check-circle"></i>　引き落とし確定レコードを作成
                  </button>
                ` : ''}
              </div>
            ` : '<div style="font-size:13px;color:var(--gray-400);padding-top:8px;border-top:1px solid var(--gray-200)">紐付きカードなし</div>'}
          </div>
        `;
      }).join('')
    }
  `;
}

async function createBillingTransaction(bankId, totalAmount) {
  const today = new Date();
  const todayString = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  if (!confirm(`${formatAmount(totalAmount)}の引き落とし確定レコードを作成しますか？`)) return;

  // 残高を更新
  const bank = bankAccounts.find(b => b.id === bankId);
  const newBalance = bank.balance - totalAmount;

  try {
    const { error } = await window._db.from('bank_accounts')
      .update({ balance: newBalance, updated_at: new Date() })
      .eq('id', bankId);
    if (error) throw error;

    showToast('✅ 残高を更新しました');
    await loadData();
    renderPage();
  } catch (e) {
    showToast('❌ 更新に失敗しました', 'error');
    console.error(e);
  }
}

function openAddBank() {
  showBankModal(null);
}

function openEditBank(id) {
  const bank = bankAccounts.find(b => b.id === id);
  showBankModal(bank);
}

function showBankModal(bank) {
  const isEdit = !!bank;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${isEdit ? '口座編集' : '口座追加'}</div>
      <div class="form-group">
        <label class="form-label">口座名 *</label>
        <input class="form-input" id="bank-name" value="${bank?.name || ''}" placeholder="例：楽天銀行">
      </div>
      <div class="form-group">
        <label class="form-label">残高（円） *</label>
        <input class="form-input" id="bank-balance" type="number" value="${bank?.balance || ''}" placeholder="例：100000">
      </div>
      ${isEdit ? `
        <div class="delete-check">
          <input type="checkbox" id="bank-delete">
          <label for="bank-delete">この口座を削除する</label>
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveBank('${bank?.id || ''}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

async function saveBank(id) {
  const name = document.getElementById('bank-name').value.trim();
  const balance = parseInt(document.getElementById('bank-balance').value);
  const is_deleted = document.getElementById('bank-delete')?.checked || false;

  if (!name || isNaN(balance)) {
    alert('口座名と残高は必須です');
    return;
  }

  try {
    if (id) {
      const { error } = await window._db.from('bank_accounts')
        .update({ name, balance, is_deleted, updated_at: new Date() }).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window._db.from('bank_accounts')
        .insert({ name, balance });
      if (error) throw error;
    }
    closeModal();
    await loadData();
    renderPage();
    showToast('✅ 保存しました');
  } catch (e) {
    showToast('❌ 保存に失敗しました', 'error');
    console.error(e);
  }
}

async function processRecurring(paymentId, amount, year, month) {
  const payment = recurringPayments.find(r => r.id === paymentId);
  if (!confirm(`${payment.name}　${formatAmount(amount)}を処理しますか？\n口座残高からマイナスされます。`)) return;

  const bank = bankAccounts.find(b => b.id === payment.bank_account_id);
  if (!bank) return;

  try {
    // 処理ログを追加
    const { error: logError } = await window._db.from('recurring_payment_logs').insert({
      recurring_payment_id: paymentId,
      target_year: year,
      target_month: month,
      amount
    });
    if (logError) throw logError;

    // 残高をマイナス
    const { error: bankError } = await window._db.from('bank_accounts')
      .update({ balance: bank.balance - amount, updated_at: new Date() })
      .eq('id', bank.id);
    if (bankError) throw bankError;

    showToast('✅ 処理しました');
    await loadData();
    renderPage();
  } catch (e) {
    showToast('❌ 処理に失敗しました', 'error');
    console.error(e);
  }
}


// ==================== カード管理 ====================
function renderCards() {
  return `
    <h2 style="font-size:16px;font-weight:700;margin-bottom:12px">カード管理</h2>
    <button class="btn btn-primary btn-full mt-8" onclick="openAddCard()">＋ カードを追加</button>
    <div class="mt-16">
    ${cards.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">カードが登録されていません</div>' :
      cards.map(card => `
        <div class="card transaction-item" onclick="openEditCard('${card.id}')">
          <div class="transaction-info">
            <div class="shop">${card.name}</div>
            <div class="date">${card.brand}　締め日:${card.closing_day}日　引き落とし:${card.billing_day}日</div>
          </div>
          <div style="color:var(--gray-400);font-size:13px">${formatAmount(card.credit_limit)}</div>
        </div>
      `).join('')
    }
    </div>
  `;
}

// ==================== ブックマーク ====================
function renderBookmarks() {
  const bookmarked = transactions.filter(tx => tx.is_bookmarked);

  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:12px">ブックマーク</h2>
    ${bookmarked.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">ブックマークはありません</div>' :
      bookmarked.map(tx => {
        const card = cards.find(c => c.id === tx.card_id);
        return `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
              <div style="flex:1">
                <div class="shop">${tx.shop || '（購入先未設定）'}</div>
                <div class="date" style="font-size:12px;color:var(--gray-400);margin-top:2px">
                  ${card ? card.name : ''}　${tx.category || ''}
                </div>
                ${tx.detail ? `<div style="font-size:13px;color:var(--gray-600);margin-top:4px;white-space:pre-wrap">${tx.detail}</div>` : ''}
              </div>
              <div style="font-size:15px;font-weight:500;color:var(--gray-800);white-space:nowrap;margin-left:8px">${formatAmount(tx.amount)}</div>
            </div>
            <div style="display:flex;gap:8px;border-top:1px solid var(--gray-200);padding-top:10px">
              <button onclick="openEditTransaction('${tx.id}')" style="flex:1;background:none;border:1px solid var(--gray-200);border-radius:8px;padding:6px;cursor:pointer;color:var(--gray-400);font-size:12px">
                <i class="ph-bold ph-pencil"></i>　編集
              </button>
              <button onclick="reuseTransaction('${tx.id}')" style="flex:1;background:none;border:1px solid var(--primary);border-radius:8px;padding:6px;cursor:pointer;color:var(--primary);font-size:12px">
                <i class="ph-bold ph-copy"></i>　再利用（新規追加）
              </button>
            </div>
          </div>
        `;
      }).join('')
    }
  `;
}

function reuseTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  if (!tx) return;
  
//今日の日付取得修正UTC→日本時間
  //const today = new Date().toISOString().split('T')[0];
  const todayString = new Date(
  Date.now() - new Date().getTimezoneOffset() * 60000
)
  .toISOString()
  .split('T')[0];
  const reuseTx = {
    ...tx,
    id: null,
    used_date: todayString,
    is_bookmarked: false,
    is_confirmed: false,
    billing_date: null,
    _isReuse: true
  };

  showTransactionModal(reuseTx);
}

// ==================== 検索 ====================
let searchState = {
  keyword: '',
  cardId: '',
  yearMonth: '',
  amountMin: '',
  amountMax: ''
};

function renderSearch() {
  const results = getSearchResults();

  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:12px">検索</h2>

    <!-- 検索フォーム -->
    <div class="card" style="margin-bottom:12px">
      <div class="form-group">
        <label class="form-label">キーワード（購入先・カテゴリ・詳細）</label>
        <input class="form-input" id="search-keyword" type="text" placeholder="例：Amazon、食費"
          value="${searchState.keyword}" oninput="updateSearch()">
      </div>
      <div class="form-group">
        <label class="form-label">カード</label>
        <select class="form-input" id="search-card" onchange="updateSearch()">
          <option value="">すべて</option>
          ${cards.map(c => `<option value="${c.id}" ${searchState.cardId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">引き落とし年月</label>
        <input class="form-input" id="search-yearmonth" type="month"
          value="${searchState.yearMonth}" onchange="updateSearch()">
      </div>
      <div style="display:flex;gap:8px">
        <div class="form-group" style="flex:1">
          <label class="form-label">金額（下限）</label>
          <input class="form-input" id="search-amount-min" type="number" placeholder="例：1000"
            value="${searchState.amountMin}" oninput="updateSearch()">
        </div>
        <div class="form-group" style="flex:1">
          <label class="form-label">金額（上限）</label>
          <input class="form-input" id="search-amount-max" type="number" placeholder="例：10000"
            value="${searchState.amountMax}" oninput="updateSearch()">
        </div>
      </div>
      <button class="btn btn-ghost btn-full" onclick="clearSearch()">
        <i class="ph-bold ph-x"></i>　条件をクリア
      </button>
    </div>

    <!-- 検索結果 -->
    <div class="search-count" style="font-size:13px;color:var(--gray-400);margin-bottom:8px">
      ${results.length}件見つかりました
    </div>
    <div id="search-results">
    ${results.length === 0 ? '<div class="card text-center" style="color:var(--gray-400)">条件に一致するデータがありません</div>' :
      results.map(tx => {
        const card = cards.find(c => c.id === tx.card_id);
        return `
          <div class="card transaction-item" onclick="openEditTransaction('${tx.id}')">
            <div class="transaction-info">
              <div class="shop">${tx.shop || '（購入先未設定）'}
                ${tx.is_confirmed ? '<span class="badge badge-confirmed">確定</span>' : '<span class="badge badge-reserved">未確定</span>'}
              </div>
              <div class="date">${formatDate(tx.used_date)}　${card ? card.name : ''}　${tx.category || ''}</div>
              ${tx.detail ? `<div style="font-size:12px;color:var(--gray-400);margin-top:2px">${tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail}</div>` : ''}
            </div>
            <div class="transaction-amount">${formatAmount(tx.amount)}</div>
          </div>
        `;
      }).join('')
    }
    </div>
  `;
}

function getSearchResults() {
  return transactions.filter(tx => {
    const card = cards.find(c => c.id === tx.card_id);

    // キーワード
    if (searchState.keyword) {
      const kw = searchState.keyword.toLowerCase();
      const hit = (tx.shop || '').toLowerCase().includes(kw) ||
                  (tx.category || '').toLowerCase().includes(kw) ||
                  (tx.detail || '').toLowerCase().includes(kw);
      if (!hit) return false;
    }

    // カード
    if (searchState.cardId && tx.card_id !== searchState.cardId) return false;

    // 引き落とし年月
    if (searchState.yearMonth && card) {
      const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
      const billingKey = `${billing.getFullYear()}-${String(billing.getMonth()+1).padStart(2,'0')}`;
      if (billingKey !== searchState.yearMonth) return false;
    }

    // 金額下限
    if (searchState.amountMin && tx.amount < parseInt(searchState.amountMin)) return false;

    // 金額上限
    if (searchState.amountMax && tx.amount > parseInt(searchState.amountMax)) return false;

    return true;
  }).sort((a, b) => new Date(b.used_date) - new Date(a.used_date));
}

function updateSearch() {
  searchState.keyword = document.getElementById('search-keyword')?.value || '';
  searchState.cardId = document.getElementById('search-card')?.value || '';
  searchState.yearMonth = document.getElementById('search-yearmonth')?.value || '';
  searchState.amountMin = document.getElementById('search-amount-min')?.value || '';
  searchState.amountMax = document.getElementById('search-amount-max')?.value || '';

  const resultsEl = document.getElementById('search-results');
  const results = getSearchResults();

  document.querySelector('.search-count').textContent = `${results.length}件見つかりました`;

  if (resultsEl) {
    resultsEl.innerHTML = results.length === 0 ?
      '<div class="card text-center" style="color:var(--gray-400)">条件に一致するデータがありません</div>' :
      results.map(tx => {
        const card = cards.find(c => c.id === tx.card_id);
        return `
          <div class="card transaction-item" onclick="openEditTransaction('${tx.id}')">
            <div class="transaction-info">
              <div class="shop">${tx.shop || '（購入先未設定）'}
                ${tx.is_confirmed ? '<span class="badge badge-confirmed">確定</span>' : '<span class="badge badge-reserved">未確定</span>'}
              </div>
              <div class="date">${formatDate(tx.used_date)}　${card ? card.name : ''}　${tx.category || ''}</div>
              ${tx.detail ? `<div style="font-size:12px;color:var(--gray-400);margin-top:2px">${tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail}</div>` : ''}
            </div>
            <div class="transaction-amount">${formatAmount(tx.amount)}</div>
          </div>
        `;
      }).join('');
  }
}

function clearSearch() {
  searchState = { keyword: '', cardId: '', yearMonth: '', amountMin: '', amountMax: '' };
  renderPage();
}

// ==================== 削除済み一覧 ====================
let deletedActiveTab = 'cards';

function renderDeleted() {
  setTimeout(() => showDeletedTab('cards'), 0);
  return `
    <h2 style="font-size:16px;font-weight:700;margin-bottom:12px">削除済み一覧</h2>
    <div id="deleted-content">
      <div style="display:flex;gap:8px;margin-bottom:12px" id="deleted-tabs">
        <button class="btn btn-primary" id="tab-cards" onclick="showDeletedTab('cards')">カード</button>
        <button class="btn btn-ghost" id="tab-transactions" onclick="showDeletedTab('transactions')">利用データ</button>
      </div>
      <div id="deleted-list"></div>
    </div>
  `;
}

async function showDeletedTab(tab) {
  deletedActiveTab = tab;
  const el = document.getElementById('deleted-list');
  if (!el) return;

  const tabCards = document.getElementById('tab-cards');
  const tabTx = document.getElementById('tab-transactions');
  if (tabCards && tabTx) {
    tabCards.className = tab === 'cards' ? 'btn btn-primary' : 'btn btn-ghost';
    tabTx.className = tab === 'transactions' ? 'btn btn-primary' : 'btn btn-ghost';
  }
  if (tab === 'cards') {
    const { data } = await window._db.from('cards').select('*').eq('is_deleted', true);
    el.innerHTML = (data && data.length > 0) ? data.map(card => `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${card.name}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-ghost" onclick="restoreCard('${card.id}')">復元</button>
          <button class="btn btn-danger" onclick="permanentDeleteCard('${card.id}')">完全削除</button>
        </div>
      </div>
    `).join('') : '<div class="card text-center" style="color:var(--gray-400)">削除済みカードはありません</div>';
  } else {
    const { data } = await window._db.from('transactions').select('*').eq('is_deleted', true);
    el.innerHTML = (data && data.length > 0) ? data.map(tx => `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${tx.shop || '（購入先未設定）'}</span>
          <span>${formatAmount(tx.amount)}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-ghost" onclick="restoreTransaction('${tx.id}')">復元</button>
          <button class="btn btn-danger" onclick="permanentDeleteTransaction('${tx.id}')">完全削除</button>
        </div>
      </div>
    `).join('') : '<div class="card text-center" style="color:var(--gray-400)">削除済みデータはありません</div>';
  }
}

// ==================== カード追加・編集モーダル ====================
const CARD_BRANDS = ['Visa', 'Mastercard', 'JCB', 'American Express', 'Diners Club', 'その他'];

function openAddCard() {
  showCardModal(null);
}

function openEditCard(id) {
  const card = cards.find(c => c.id === id);
  showCardModal(card);
}

function showCardModal(card) {
  const isEdit = !!card;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${isEdit ? 'カード編集' : 'カード追加'}</div>
      <div class="form-group">
        <label class="form-label">カード名 *</label>
        <input class="form-input" id="card-name" value="${card?.name || ''}" placeholder="例：楽天カード">
      </div>
      <div class="form-group">
        <label class="form-label">カードブランド *</label>
        <input class="form-input" id="card-brand-select" list="brand-list" value="${card?.brand || ''}" placeholder="選択または入力">
        <datalist id="brand-list">${CARD_BRANDS.map(b => `<option value="${b}">`).join('')}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">締め日 *</label>
        <input class="form-input" id="card-closing" type="number" min="1" max="31" value="${card?.closing_day || ''}" placeholder="例：15">
      </div>
      <div class="form-group">
        <label class="form-label">引き落とし日 *</label>
        <input class="form-input" id="card-billing" type="number" min="1" max="31" value="${card?.billing_day || ''}" placeholder="例：27">
      </div>
      <div class="form-group">
        <label class="form-label">利用可能枠（円） *</label>
        <input class="form-input" id="card-limit" type="number" value="${card?.credit_limit || ''}" placeholder="例：500000">
      </div>
       <div class="form-group">
        <label class="form-label">引き落とし口座</label>
        <select class="form-input" id="card-bank">
          <option value="">未設定</option>
          ${bankAccounts.map(b => `<option value="${b.id}" ${card?.bank_account_id === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
        </select>
      </div>
      ${isEdit ? `
        <div class="delete-check">
          <input type="checkbox" id="card-delete">
          <label for="card-delete">このカードを削除する</label>
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveCard('${card?.id || ''}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}


async function saveCard(id) {
  const name = document.getElementById('card-name').value.trim();
const brand = document.getElementById('card-brand-select').value.trim();
  const closing_day = parseInt(document.getElementById('card-closing').value);
  const billing_day = parseInt(document.getElementById('card-billing').value);
  const credit_limit = parseInt(document.getElementById('card-limit').value);
  const bank_account_id = document.getElementById('card-bank')?.value || null;
  const is_deleted = document.getElementById('card-delete')?.checked || false;

  if (!name || !brand || !closing_day || !billing_day || !credit_limit) {
    alert('必須項目を入力してください');
    return;
  }

try {
    if (id) {
            const { error } = await window._db.from('cards').update({ name, brand, closing_day, billing_day, credit_limit, bank_account_id, is_deleted, updated_at: new Date() }).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window._db.from('cards').insert({ name, brand, closing_day, billing_day, credit_limit, bank_account_id });
      if (error) throw error;
    }
    closeModal();
    await loadData();
    renderApp();
    showToast('✅ 保存しました');
  } catch (e) {
    showToast('❌ 保存に失敗しました', 'error');
    console.error(e);
  }
}

// ==================== トランザクション追加・編集モーダル ====================
function openAddTransaction() {
  showTransactionModal(null);
}

function openEditTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  showTransactionModal(tx);
}

function showTransactionModal(tx) {
  const isEdit = !!tx;
  const today = new Date().toISOString().split('T')[0];
  const shops = [...new Set(transactions.map(t => t.shop).filter(Boolean))];
  const cats = [...new Set(transactions.map(t => t.category).filter(Boolean))];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${isEdit && !tx?._isReuse ? '利用データ編集' : '利用データ追加'}</div>
      <div class="form-group">
        <label class="form-label">利用日 *</label>
        <input class="form-input" id="tx-date" type="date" value="${tx?.used_date || today}" onchange="updateBillingDate()">
      </div>
      <div class="form-group">
        <label class="form-label">カード *</label>
        <select class="form-input" id="tx-card" onchange="updateBillingDate()">
          <option value="">選択してください</option>
          ${cards.map(c => `<option value="${c.id}" ${tx?.card_id === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">金額（円） *</label>
        <input class="form-input" id="tx-amount" type="number" value="${tx?.amount || ''}" placeholder="例：3000">
      </div>
<div class="form-group suggest-wrap">
        <label class="form-label">購入先</label>
        <input class="form-input" id="tx-shop" value="${tx?.shop || ''}" placeholder="例：Amazon"
          oninput="filterSuggest('shop')" onfocus="filterSuggest('shop')" onblur="hideSuggest('shop')" autocomplete="off">
        <div class="suggest-list" id="shop-suggest"></div>
      </div>
      <div class="form-group suggest-wrap">
        <label class="form-label">カテゴリ</label>
        <input class="form-input" id="tx-category" value="${tx?.category || ''}" placeholder="例：食費"
          oninput="filterSuggest('category')" onfocus="filterSuggest('category')" onblur="hideSuggest('category')" autocomplete="off">
        <div class="suggest-list" id="category-suggest"></div>
      </div>
      <div class="form-group">
        <label class="form-label">詳細</label>
        <textarea class="form-input" id="tx-detail" placeholder="メモなど">${tx?.detail || ''}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">引き落とし予定日</label>
        <input class="form-input" id="tx-billing-date" readonly value="${tx?.billing_date ? formatDate(tx.billing_date) : ''}">
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="tx-confirmed" ${tx?.is_confirmed ? 'checked' : ''}>
        <label for="tx-confirmed" class="form-label" style="margin:0">確定済み（チェックなし＝未確定）</label>
      </div>
      <div class="form-group" style="display:flex;align-items:center;gap:8px">
        <input type="checkbox" id="tx-bookmarked" ${tx?.is_bookmarked ? 'checked' : ''}>
        <label for="tx-bookmarked" class="form-label" style="margin:0">🔖 ブックマーク（再利用したいデータ）</label>
      </div>
      ${isEdit ? `
        <div class="delete-check">
          <input type="checkbox" id="tx-delete">
          <label for="tx-delete">このデータを削除する</label>
        </div>
      ` : ''}
      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-ghost" style="flex:1" onclick="closeModal()">キャンセル</button>
        <button class="btn btn-primary" style="flex:1" onclick="saveTransaction('${tx?.id || ''}')">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  if (tx?.card_id) updateBillingDate();
}

function updateBillingDate() {
  const cardId = document.getElementById('tx-card')?.value;
  const date = document.getElementById('tx-date')?.value;
  const billingInput = document.getElementById('tx-billing-date');
  if (!billingInput) return;

  const card = cards.find(c => c.id === cardId);
  if (card && date) {
    const billing = calcBillingDate(date, card.closing_day, card.billing_day);
    billingInput.value = formatDate(billing);
  } else {
    billingInput.value = '';
  }
}

// ==================== カスタムサジェスト ====================
function filterSuggest(field) {
  const input = document.getElementById(`tx-${field}`);
  const listEl = document.getElementById(`${field}-suggest`);
  if (!input || !listEl) return;

  const value = input.value.toLowerCase();
  const source = field === 'shop'
    ? [...new Set(transactions.map(t => t.shop).filter(Boolean))]
    : [...new Set(transactions.map(t => t.category).filter(Boolean))];

  const filtered = value
    ? source.filter(s => s.toLowerCase().includes(value))
    : source;

  if (filtered.length === 0) {
    listEl.classList.remove('show');
    return;
  }

  listEl.innerHTML = filtered.slice(0, 8).map(item =>
    `<div class="suggest-item" onmousedown="selectSuggest('${field}', '${item.replace(/'/g, "\\'")}')">${item}</div>`
  ).join('');

  listEl.classList.add('show');
}

function selectSuggest(field, value) {
  const input = document.getElementById(`tx-${field}`);
  if (input) input.value = value;
  hideSuggest(field);
}

function hideSuggest(field) {
  setTimeout(() => {
    const listEl = document.getElementById(`${field}-suggest`);
    if (listEl) listEl.classList.remove('show');
  }, 150);
}

async function saveTransaction(id) {
  const used_date = document.getElementById('tx-date').value;
  const card_id = document.getElementById('tx-card').value;
  const amount = parseInt(document.getElementById('tx-amount').value);
  const shop = document.getElementById('tx-shop').value.trim();
  const category = document.getElementById('tx-category').value.trim();
  const detail = document.getElementById('tx-detail').value.trim();
  const is_confirmed = document.getElementById('tx-confirmed').checked;
  const is_bookmarked = document.getElementById('tx-bookmarked')?.checked || false;
  const is_deleted = document.getElementById('tx-delete')?.checked || false;

  if (!used_date || !card_id || !amount) {
    alert('利用日・カード・金額は必須です');
    return;
  }

  const card = cards.find(c => c.id === card_id);
  const billing = calcBillingDate(used_date, card.closing_day, card.billing_day);
  const billing_date = billing.toISOString().split('T')[0];

try {
    if (shop) await window._db.from('suggestions').upsert({ type: 'shop', value: shop });
    if (category) await window._db.from('suggestions').upsert({ type: 'category', value: category });

    if (id) {
      const { error } = await window._db.from('transactions').update({ used_date, card_id, amount, shop, category, detail, billing_date, is_confirmed, is_bookmarked, is_deleted, updated_at: new Date() }).eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await window._db.from('transactions').insert({ used_date, card_id, amount, shop, category, detail, billing_date, is_confirmed, is_bookmarked });
      if (error) throw error;
    }

    closeModal();
    await loadData();
    renderApp();
    showToast('✅ 保存しました');
  } catch (e) {
    showToast('❌ 保存に失敗しました', 'error');
    console.error(e);
  }
}

// ==================== 削除・復元 ====================
async function restoreCard(id) {
  await window._db.from('cards').update({ is_deleted: false }).eq('id', id);
  await loadData();
  showDeletedTab('cards');
}

async function permanentDeleteCard(id) {
  if (!confirm('完全に削除します。元に戻せません。よろしいですか？')) return;
  await window._db.from('cards').delete().eq('id', id);
  showDeletedTab('cards');
}

async function restoreTransaction(id) {
  await window._db.from('transactions').update({ is_deleted: false }).eq('id', id);
  await loadData();
  showDeletedTab('transactions');
}

async function permanentDeleteTransaction(id) {
  if (!confirm('完全に削除します。元に戻せません。よろしいですか？')) return;
  await window._db.from('transactions').delete().eq('id', id);
  showDeletedTab('transactions');
}

// ==================== モーダルを閉じる ====================
function closeModal() {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

// ==================== トースト通知 ====================
function showToast(message, type = 'success', onClick = null) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cursor = onClick ? 'pointer' : 'default';
  toast.onclick = onClick || null;

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // タップで更新の場合は長めに表示
  const duration = onClick ? 8000 : 3000;
  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}


// ==================== ドロワー ====================
function toggleDrawer() {
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('drawer-overlay');
  const isOpen = drawer.style.left === '0px';

  drawer.style.left = isOpen ? '-280px' : '0px';
  overlay.style.display = isOpen ? 'none' : 'block';
  
    if (!isOpen) {
    // メールアドレス表示
    window._db.auth.getSession().then(({ data: { session } }) => {
      const el = document.getElementById('drawer-email');
      if (el && session) el.textContent = session.user.email;
    });

// 最終更新日時表示
    const el = document.getElementById('last-updated');
    if (el) {
      const date = sessionStorage.getItem('app-version-date');
      if (date) el.textContent = `最終更新：${date}`;
    }
  }
}

function navigateDrawer(page) {
  toggleDrawer();
  navigate(page);
}

async function logout() {
  await window._db.auth.signOut();
  renderLogin();
}

async function checkUpdate() {
  showToast('🔄 更新を確認しています…', 'warning');

  try {
    const res = await fetch('https://api.github.com/repos/sevenpersonalip7-commits/card-manager/commits/main', {
      cache: 'no-store'
    });
    const data = await res.json();
    if (!data.sha) throw new Error('SHA取得失敗');

    const latestSha = data.sha.substring(0, 7);
    const currentSha = sessionStorage.getItem('app-version');

    // 日時表示更新
    const el = document.getElementById('last-updated');
    if (el) {
      const date = new Date(data.commit.committer.date);
      const formatted = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      el.textContent = `最終更新：${formatted}`;
    }

    if (currentSha === latestSha) {
      showToast('✅ すでに最新版です');
      return;
    }

    // Service Worker登録解除
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }

    // キャッシュ全消去
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));

    sessionStorage.setItem('app-version', latestSha);
    showToast('🎉 最新版に更新しました！リロードします', 'success');

    setTimeout(() => {
      window.location.href = window.location.href + '?t=' + Date.now();
    }, 1500);

  } catch (e) {
    showToast('⚠️ 更新確認に失敗しました', 'warning');
    console.error(e);
  }
}


// ==================== スワイプ処理 ====================
let touchStartX = 0;

function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
}

function handleTouchEnd(e) {
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) < 50) return;
  if (diff > 0) {
    changeMonth(1);
  } else {
    changeMonth(-1);
  }
}

// ==================== ナビ設定画面 ====================
function renderNavSettings() {
  return `
    <h2 style="font-size:16px;font-weight:500;margin-bottom:4px">ナビ設定</h2>
    <p style="font-size:12px;color:var(--gray-400);margin-bottom:16px">ボトムナビの表示・順番を変更できます</p>

    <div class="card" style="margin-bottom:16px">
      <div style="font-size:14px;font-weight:500;margin-bottom:12px">ボトムナビ（表示/非表示・順番）</div>
      <p style="font-size:12px;color:var(--gray-400);margin-bottom:12px">↑↓ボタンで並び替え、チェックで表示切替</p>
      ${navSettings.bottomNav.map((n, i) => {
        const item = ALL_NAV_ITEMS.find(it => it.id === n.id);
        if (!item) return '';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--gray-200)">
            <input type="checkbox" ${n.visible ? 'checked' : ''} ${item.required ? 'disabled' : ''}
              onchange="toggleNavItem(${i})">
            <i class="ph-bold ${item.icon}" style="color:var(--primary);font-size:18px"></i>
            <span style="flex:1;font-size:14px">${item.label}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px" onclick="moveNavItem(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px" onclick="moveNavItem(${i}, 1)" ${i === navSettings.bottomNav.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="card">
      <div style="font-size:14px;font-weight:500;margin-bottom:12px">ドロワーメニュー（順番）</div>
      <p style="font-size:12px;color:var(--gray-400);margin-bottom:12px">↑↓ボタンで並び替え（全項目常に表示）</p>
      ${navSettings.drawerNav.map((n, i) => {
        const item = ALL_DRAWER_ITEMS.find(it => it.id === n.id);
        if (!item) return '';
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--gray-200)">
            <i class="ph-bold ${item.icon}" style="color:var(--primary);font-size:18px"></i>
            <span style="flex:1;font-size:14px">${item.label}</span>
            <div style="display:flex;gap:4px">
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px" onclick="moveDrawerItem(${i}, -1)" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-ghost" style="padding:4px 8px;font-size:12px" onclick="moveDrawerItem(${i}, 1)" ${i === navSettings.drawerNav.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
          </div>
        `;
      }).join('')}
</div>

    <button class="btn btn-danger btn-full" style="margin-top:16px" onclick="resetNavSettings()">
      <i class="ph-bold ph-arrow-counter-clockwise"></i>　ナビ設定をリセット
    </button>
  `;
}

function resetNavSettings() {
  localStorage.removeItem('nav-settings');
  navSettings = loadNavSettings();
  renderApp();
  navigate('settings');
  showToast('✅ ナビ設定をリセットしました');
}

function toggleNavItem(index) {
  navSettings.bottomNav[index].visible = !navSettings.bottomNav[index].visible;
  saveNavSettings(navSettings);
  renderApp();
  navigate('settings');
}

function moveNavItem(index, direction) {
  const arr = navSettings.bottomNav;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  saveNavSettings(navSettings);
  renderApp();
  navigate('settings');
}

function moveDrawerItem(index, direction) {
  const arr = navSettings.drawerNav;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  saveNavSettings(navSettings);
  renderApp();
  navigate('settings');
}