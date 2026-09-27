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
let cardBillingLogs = [];

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
// ナビ設定のロード・保存関数
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
// ナビ設定の保存関数
function saveNavSettings(settings) {
  localStorage.setItem('nav-settings', JSON.stringify(settings));
}
// ナビ設定の初期ロード
let navSettings = loadNavSettings();

// ==================== 初期化 ====================
document.addEventListener('DOMContentLoaded', async () => {
  registerServiceWorker();
  await checkAuth();
});
// ==================== 認証チェック ====================
async function checkAuth() {
  const progress = document.getElementById('progress-bar');
// 進捗バーの更新関数
  const setProgress = (pct) => {
    if (progress) progress.style.width = pct + '%';
  };
// 進捗バーのタイムアウト設定（10秒）
  const timeoutMs=10000;
  // Promiseにタイムアウトを追加する関数
  const withTimeout= (promise, ms=timeoutMs) => {
    let timer;
    const timeout=new Promise((_, reject) => {
      timer=setTimeout(() => reject(new Error('読み込みがタイムアウトしました')), ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(timer)),
      timeout
    ]);
  };

  // GitHub APIから最新コミット情報を取得して、SHAと日付をセッションストレージに保存
  fetch('https://api.github.com/repos/sevenpersonalip7-commits/card-manager/commits/main', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      const date = new Date(data.commit.committer.date);
      const formatted = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      sessionStorage.setItem('app-version', data.sha.substring(0, 7));
      sessionStorage.setItem('app-version-date', formatted);
    })
    .catch(() => {});
    try {
    setProgress(50);
  // 認証セッションの取得
  const { data: { session } } = await withTimeout(window._db.auth.getSession());
  setProgress(80);
// セッションがあればデータロードしてアプリ描画、なければログイン画面描画
  if (session) {
    await withTimeout(loadData());
    setProgress(100);
    renderApp();
  } else {
    setProgress(100);
    renderLogin();
  }
}catch (error) {
  console.error(error);
  showToast('⚠️ エラー：認証チェックに失敗しました', 'warning');
  renderLogin();
}
}

// ==================== ログイン画面の描画 ====================
function renderLogin() {
  const app = document.getElementById('app');
  const template = document.getElementById('tmpl-login');
  // appの中身を一旦クリア
  app.replaceChildren();
  // テンプレートの中身を複製して#appに追加
  const clone = template.content.cloneNode(true);
  
  // ✅ ログインボタンのクリックイベントをアタッチ
  const loginBtn = clone.querySelector('#btn-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      login();
    });
  }

  // ✅ Enterキーでも送信できるようにする（UX向上）
  const emailInput = clone.querySelector('#login-email');
  const passwordInput = clone.querySelector('#login-password');
  
  if (passwordInput) {
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        login();
      }
    });
  }
  
  app.appendChild(clone);
}

// ログイン処理
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  // ✅ 入力値の簡易チェック
  if (!email || !password) {
    if (errorEl) {
      errorEl.textContent = 'メールアドレスとパスワードを入力してください';
      errorEl.style.display = 'block';
    }
    return;
  }

  const { error } = await window._db.auth.signInWithPassword({ email, password });
  
  // ログインエラーがあればエラーメッセージを表示、なければデータロードしてアプリ描画
  if (error) {
    if (errorEl) {
      errorEl.textContent = 'メールアドレスまたはパスワードが違います';
      errorEl.style.display = 'block';
    }
  } else {
    await loadData();
    renderApp();
  }
}


// gitバージョン確認
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
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

// ==================== データロード ====================
async function loadData() {
  try {
    // データベースからカード・取引・口座・定期支払い・定期支払いログを取得
    const { data: cardsData, error: cardsError } = await window._db
      .from('cards').select('*').eq('is_deleted', false).order('created_at');
    if (cardsError) throw cardsError;
// 取引データ取得・格納・ソート
    const { data: transData, error: transError } = await window._db
      .from('transactions').select('*').eq('is_deleted', false).order('used_date');
    if (transError) throw transError;
// 口座データ取得・格納・ソート
    const { data: bankData, error: bankError } = await window._db
      .from('bank_accounts').select('*').eq('is_deleted', false).order('created_at');
    if (bankError) throw bankError;
  // データをグローバル変数に格納
    cards = cardsData || [];
    transactions = transData || [];
    bankAccounts = bankData || [];
// 定期支払いデータ取得・格納・ソート
    const { data: recurringData, error: recurringError } = await window._db
      .from('recurring_payments').select('*').eq('is_deleted', false).order('billing_day');
    if (recurringError) throw recurringError;
// 定期支払いログデータ取得・格納・ソート
    const { data: logsData, error: logsError } = await window._db
      .from('recurring_payment_logs').select('*').order('processed_at', { ascending: false });
    if (logsError) throw logsError;

    // ↓ カード引き落としログの取得を追加
    const { data: cLogs, error: cLogsError } = await window._db
      .from('card_billing_logs')
      .select('*');
    // エラーがなければカード引き落としログを格納、エラーがあれば空配列にする
    if (!cLogsError && cLogs) {
      cardBillingLogs = cLogs;
    } else {
      cardBillingLogs = [];
    }
// 取得したデータをグローバル変数に格納
    recurringPayments = recurringData || [];
    recurringLogs = logsData || [];
    //エラーハンドリング
  } catch (e) {
    showToast('⚠️ データの読み込みに失敗しました', 'warning');
    console.error(e);
    cards = [];
    transactions = [];
  }
}

// ==================== ページ描画 ====================
function renderPage() {
  const el = document.getElementById('main-content');
  if (!el) return;

  let content = '';
  if (currentPage === 'home') content = renderHome();
  else if (currentPage === 'monthly') content = renderMonthly();
  else if (currentPage === 'reserved') content = renderReserved();
  else if (currentPage === 'cards') content = renderCards();
  else if (currentPage === 'banks') content = renderBanks();
  else if (currentPage === 'recurring') content = renderRecurring();
  else if (currentPage === 'bookmarks') content = renderBookmarks();
  else if (currentPage === 'search') content = renderSearch();
  else if (currentPage === 'category-detail') content = renderCategoryDetail();
  else if (currentPage === 'deleted') content = renderDeleted();
  else if (currentPage === 'settings') content = renderNavSettings();

  if (content instanceof Node) {
    el.replaceChildren(content);
  } else {
    el.innerHTML = content;
  }
}

// ▼ ページ切り替え用の関数（renderApp より上に配置する）
function navigate(page) {
  currentPage = page;
  renderApp();
}



// ==================== レンダリング ====================
function renderApp() {
  const app = document.getElementById('app');
  app.replaceChildren();

  // 1. 全体フレームの展開
  const appTemplate = document.getElementById('tmpl-app');
  const appClone = appTemplate.content.cloneNode(true);

  // --- 💡 [追加] ドロワー開閉＆ヘッダー・フッターボタンの安全なイベントバインド ---
  const hamburgerBtn = appClone.getElementById('btn-hamburger');
  const overlay = appClone.getElementById('drawer-overlay');
  const drawer = appClone.getElementById('drawer');
  const checkUpdateBtn = appClone.getElementById('btn-check-update');
  const logoutBtn = appClone.getElementById('btn-logout');

  // ドロワー開閉関数
  const toggleDrawer = () => {
    if (!drawer || !overlay) return;
    const isOpen = drawer.style.left === '0px';
    drawer.style.left = isOpen ? '-280px' : '0px';
    overlay.style.display = isOpen ? 'none' : 'block';
  };
// ハンバーガーボタンのクリックでドロワーを開閉
  if (hamburgerBtn) hamburgerBtn.addEventListener('click', toggleDrawer);
  // オーバーレイクリックでドロワーを閉じる
  if (overlay) overlay.addEventListener('click', toggleDrawer);
// 更新チェックボタンのクリックで checkUpdate 関数を呼び出す
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', () => {
      if (typeof checkUpdate === 'function') checkUpdate();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof logout === 'function') logout();
    });
  }
  // -----------------------------------------------------------------

  // コンテナ要素を取得
  const drawerNav = appClone.getElementById('drawer-nav');
  const bottomNav = appClone.getElementById('bottom-nav');
  const fabContainer = appClone.getElementById('fab-container');

  // テンプレート参照
  const drawerItemTmpl = document.getElementById('tmpl-drawer-item');
  const bottomNavTmpl = document.getElementById('tmpl-bottom-nav-item');
  const fabTmpl = document.getElementById('tmpl-fab');

  // 2. ドロワーメニューの生成
  if (drawerNav) {
    navSettings.drawerNav.forEach(n => {
      const item = ALL_DRAWER_ITEMS.find(i => i.id === n.id);
      if (!item) return;

      const clone = drawerItemTmpl.content.cloneNode(true);
      const btn = clone.querySelector('button');
      const icon = clone.querySelector('i');
      const label = clone.querySelector('.item-label');
      // ⭕️ addEventListenerへ書き換え
      btn.addEventListener('click', () => {
        toggleDrawer(); // メニュー選択時にドロワーを閉じる
        navigateDrawer(item.id);
      });

      if (currentPage === item.id) btn.classList.add('drawer-active');
      icon.classList.add(item.icon);
      label.textContent = item.label;

      drawerNav.appendChild(clone);
    });

    // 「ナビ設定」ボタンの追加（ドロワー末尾固定）
    const settingsClone = drawerItemTmpl.content.cloneNode(true);
    const settingsBtn = settingsClone.querySelector('button');
    const settingsIcon = settingsClone.querySelector('i');
    const settingsLabel = settingsClone.querySelector('.item-label');

    // ⭕️ addEventListenerへ書き換え
    settingsBtn.addEventListener('click', () => {
      toggleDrawer(); // メニュー選択時にドロワーを閉じる
      navigateDrawer('settings');
    });

    if (currentPage === 'settings') settingsBtn.classList.add('drawer-active');
    settingsIcon.classList.add('ph-gear');
    settingsLabel.textContent = 'ナビ設定';

    drawerNav.appendChild(settingsClone);
  }

  // 3. ボトムナビの生成
  if (bottomNav) {
    navSettings.bottomNav
      .filter(n => n.visible)
      .forEach(n => {
        const item = ALL_NAV_ITEMS.find(i => i.id === n.id);
        if (!item) return;

        const clone = bottomNavTmpl.content.cloneNode(true);
        const btn = clone.querySelector('button');
        const icon = clone.querySelector('i');
        const label = clone.querySelector('.item-label');

        // ⭕️ addEventListenerへ書き換え
        btn.addEventListener('click', () => {
          navigate(item.id);
        });

        if (currentPage === item.id) btn.classList.add('active');
        icon.classList.add(item.icon);
        label.textContent = item.label;

        bottomNav.appendChild(clone);
      });
  }
// 4. FAB（＋ボタン）の表示制御
  if (currentPage !== 'cards' && fabContainer) {
    const fabClone = fabTmpl.content.cloneNode(true);
    
    // FABボタンを取得して、安全にクリックイベントをアタッチ
    const fabBtn = fabClone.querySelector('#btn-fab') || fabClone.querySelector('.fab') || fabClone.querySelector('button');
    if (fabBtn) {
      fabBtn.addEventListener('click', () => {
        showTransactionModal();
      });
    }

    fabContainer.appendChild(fabClone);
  }

  // 5. 最後に画面に差し込んで各ページの中身を描画
  app.appendChild(appClone);
  renderPage();
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


























// ==================== ホーム画面のソート状態管理 ====================
let homeSortKey = 'dueDate';   // 'amount' | 'dueDate' | 'name' | 'count'
let homeSortOrder = 'asc';   // 'asc' | 'desc'

let homeTranSortKey='used_date'; // 'usedDate' | 'amount' | 'shop' 
let homeTranSortOrder='desc'; // 'asc' | 'desc'

function handleHomeSortChange(val) {
  // val が引き渡されなかった場合（引数なし呼び出し）のフォールバック処理付き
  if (val) {
    homeSortKey = val;
  } else {
    const select = document.getElementById('home-sort-key');
    if (select) homeSortKey = select.value;
  }
  renderPage();
}

function toggleHomeSortOrder() {
  homeSortOrder = homeSortOrder === 'asc' ? 'desc' : 'asc';
  renderPage();
}



// ==================== ホーム画面 ====================
function renderHome() {
  // === 1. データ計算 ===
  const targetTx = transactions.filter(tx => {
    const card = cards.find(c => c.id === tx.card_id);
    if (!card) return false;
    const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
    return isSameMonth(billing, currentMonth);
  });

  // 当月の定期支払いを抽出
  const targetRecurring = recurringPayments.filter(rp => rp.is_active && !rp.is_deleted);

  // === サマリー計算 ===
  const totalTxAmount = targetTx.reduce((sum, tx) => sum + tx.amount, 0);
  
  // ✅ 修正：利用開始日＆頻度チェック済みの定期支払いのみ合算
  const displayRecurring = recurringPayments.filter(rp => {
    if (!rp.is_active || rp.is_deleted) return false;
    const startDate = new Date(rp.start_date);
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    if (startDate > firstDayOfMonth) return false;
    return isRecurringDueThisMonth(rp, currentMonth);
  });
  
  const totalRecurringAmount = displayRecurring.reduce((sum, rp) => sum + rp.amount, 0);
  const grandTotalAmount = totalTxAmount + totalRecurringAmount;

  const confirmedCount = targetTx.filter(tx => tx.is_confirmed).length;
  const unconfirmedCount = targetTx.filter(tx => !tx.is_confirmed).length;

  // カテゴリマップの作成
  const categoryMap = {};
  targetTx.forEach(tx => {
    const key = tx.category || '未分類';
    if (!categoryMap[key]) categoryMap[key] = 0;
    categoryMap[key] += tx.amount;
  });
  const sortedCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1]);

  // カテゴリカラーマップの作成
  const categoryColorMap = {};
  sortedCategories.forEach(([cat], i) => {
    categoryColorMap[cat] = CHART_COLORS[i % CHART_COLORS.length];
  });

  // === 口座ごとの階層データ構造を作成 ===
  const accountGroups = bankAccounts.map(account => {
    // 口座に紐づくカード群取得
    const accountCards = cards.filter(c => c.bank_account_id === account.id);

    // 各カードの取引明細をグループ化
    const cardGroups = accountCards.map(card => {
      const cardTx = targetTx
        .filter(tx => tx.card_id === card.id)
        .sort((a, b) => new Date(b.used_date) - new Date(a.used_date));
      
      const cardTotal = cardTx.reduce((sum, tx) => sum + tx.amount, 0);
      
      const billingLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
      const billingDay = Math.min(card.billing_day, billingLastDay);
      const rawBillingDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), billingDay);
      const billingDate = `${currentMonth.getMonth() + 1}/${billingDay}`;

      return { 
        card, 
        transactions: cardTx, 
        total: cardTotal, 
        billingDate,
        rawBillingDate
      };
    }).filter(g => g.transactions.length > 0);

    // ソート（アカウント内のカードをソート）
    cardGroups.sort((a, b) => {
      let valA, valB;
      switch (homeSortKey) {
        case 'amount':
          valA = a.total;
          valB = b.total;
          break;
        case 'dueDate':
          valA = a.rawBillingDate.getTime();
          valB = b.rawBillingDate.getTime();
          break;
        case 'name':
          valA = a.card.name;
          valB = b.card.name;
          if (homeSortOrder === 'asc') return valA.localeCompare(valB, 'ja');
          return valB.localeCompare(valA, 'ja');
        case 'count':
          valA = a.transactions.length;
          valB = b.transactions.length;
          break;
        default:
          valA = a.total;
          valB = b.total;
      }

      if (homeSortOrder === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0;
      }
    });

// ✅ 修正：口座に紐づく定期支払データ取得（利用開始日＆頻度チェック）
const accountRecurring = targetRecurring.filter(rp => {
  // 1. 口座が一致するか
  if (rp.bank_account_id !== account.id) return false;
  
  // 2. 利用開始月は当月以前か（月単位でチェック）
  const startDate = new Date(rp.start_date);
  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const currentMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  
  if (startMonth > currentMonthStart) return false;  // ✅ 開始月が当月より後ならスキップ
  
  // 3. 当月は対象月か（頻度チェック）
  return isRecurringDueThisMonth(rp, currentMonth);
});

    const recurringTotal = accountRecurring.reduce((sum, rp) => sum + rp.amount, 0);

    // カード合計 + 定期支払合計
    const cardsTotal = cardGroups.reduce((sum, g) => sum + g.total, 0);
    const accountTotal = cardsTotal + recurringTotal;

    return {
      account,
      cardGroups,
      recurring: accountRecurring,  // ✅ ここにフィルター済みデータが入る
      cardTotal: cardsTotal,
      recurringTotal,
      accountTotal
    };
  }).filter(ag => ag.cardGroups.length > 0 || ag.recurring.length > 0);

  // === 2. DOMの組み立て ===
  const tmplHome = document.getElementById('tmpl-home');
  const clone = tmplHome.content.cloneNode(true);

  // ヘッダー・サマリー部
  clone.querySelector('.month-label').textContent = formatYearMonth(currentMonth);
  clone.querySelector('.summary-amount').textContent = formatAmount(grandTotalAmount);
  clone.querySelector('.summary-sub').textContent = `確定 ${confirmedCount}件 ／ 未確定 ${unconfirmedCount}件`;

   // 一括開閉・ソートUIの制御と状態同期
  if (accountGroups.length > 0) {
    const toggleButtons = clone.querySelector('.toggle-buttons');
    if (toggleButtons) toggleButtons.style.display = 'flex';

    // ✅ 全て開く / 全て閉じるボタンのイベントをアタッチ
    const expandBtn = clone.querySelector('#btn-expand-all');
    const collapseBtn = clone.querySelector('#btn-collapse-all');

    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        expandAllCards();
      });
    }

    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        collapseAllCards();
      });
    }

    const sortSelect = clone.querySelector('#home-sort-key');
    if (sortSelect) {
      sortSelect.value = homeSortKey;
    }

    const sortIcon = clone.querySelector('#home-sort-order-icon');
    const sortText = clone.querySelector('#home-sort-order-text');
    if (sortIcon && sortText) {
      if (homeSortOrder === 'asc') {
        sortIcon.className = 'ph-bold ph-sort-ascending';
        sortText.textContent = '昇順';
      } else {
        sortIcon.className = 'ph-bold ph-sort-descending';
        sortText.textContent = '降順';
      }
    }
  }

  // カテゴリチャートの描画
  if (targetTx.length > 0) {
    const chartArea = clone.querySelector('.chart-container');
    const chartNode = renderCategoryChart(targetTx);
    if (chartArea && chartNode) {
      chartArea.appendChild(chartNode);
    }
  }

  // データなし判定
  if (accountGroups.length === 0) {
    clone.querySelector('.no-data').style.display = 'block';
  } else {
    const groupsContainer = clone.querySelector('.card-groups-container');
    const tmplAccount = document.getElementById('tmpl-account-group');
    const tmplCardGroup = document.getElementById('tmpl-card-group');
    const tmplTx = document.getElementById('tmpl-transaction-item');
    const tmplRecItem = document.getElementById('tmpl-home-recurring-item');

    // 各口座をループ
    accountGroups.forEach(ag => {
      const accountClone = tmplAccount.content.cloneNode(true);
      
      // 口座ヘッダー
      const accountHeader = accountClone.querySelector('.account-header');
      const accountToggleIcon = accountClone.querySelector('.account-header .toggle-icon');
      const accountBody = accountClone.querySelector('.account-cards-container');
      
      const isAccountCollapsed = collapsedCards[`account-${ag.account.id}`] !== undefined 
        ? collapsedCards[`account-${ag.account.id}`] 
        : false;

      accountToggleIcon.classList.add(isAccountCollapsed ? 'ph-caret-right' : 'ph-caret-down');
      accountClone.querySelector('.account-name').textContent = '🏦 '+ag.account.name;
      accountClone.querySelector('.account-total-amount').textContent = formatAmount(ag.accountTotal);

      // 口座クリックで開閉
      accountHeader.addEventListener('click', () => {
        const currentCollapsed = collapsedCards[`account-${ag.account.id}`] !== undefined 
          ? collapsedCards[`account-${ag.account.id}`] 
          : false;
        const nextCollapsed = !currentCollapsed;
        collapsedCards[`account-${ag.account.id}`] = nextCollapsed;

        accountBody.style.display = nextCollapsed ? 'none' : 'block';

        if (nextCollapsed) {
          accountToggleIcon.classList.remove('ph-caret-down');
          accountToggleIcon.classList.add('ph-caret-right');
        } else {
          accountToggleIcon.classList.remove('ph-caret-right');
          accountToggleIcon.classList.add('ph-caret-down');
        }
      });

      accountBody.style.display = isAccountCollapsed ? 'none' : 'block';
      accountBody.id = `account-${ag.account.id}`;

      // === 定期支払い描画 ===
      if (ag.recurring.length > 0) {
        ag.recurring.forEach(rec => {
          const recClone = tmplRecItem.content.cloneNode(true);

          recClone.querySelector('.rec-name').textContent = rec.name;
          recClone.querySelector('.rec-meta').textContent = `${rec.billing_day}日 ${FREQUENCY_LABELS[rec.frequency]}`;
          recClone.querySelector('.rec-amount').textContent = formatAmount(rec.amount);

          accountBody.appendChild(recClone);
        });
      }


      // === カードグループ描画 ===
      ag.cardGroups.forEach(g => {
        const cardGroupClone = tmplCardGroup.content.cloneNode(true);
        
        const isCardCollapsed = collapsedCards[g.card.id] !== undefined ? collapsedCards[g.card.id] : true;
        
        const totalRow = cardGroupClone.querySelector('.card-total-row');
        const icon = cardGroupClone.querySelector('.toggle-icon');
        const groupBody = cardGroupClone.querySelector('.card-group-body');
        
        totalRow.addEventListener('click', () => {
          const currentCollapsed = collapsedCards[g.card.id] !== undefined ? collapsedCards[g.card.id] : true;
          const nextCollapsed = !currentCollapsed;
          collapsedCards[g.card.id] = nextCollapsed;

          groupBody.style.display = nextCollapsed ? 'none' : 'block';

          if (nextCollapsed) {
            icon.classList.remove('ph-caret-down');
            icon.classList.add('ph-caret-right');
          } else {
            icon.classList.remove('ph-caret-right');
            icon.classList.add('ph-caret-down');
          }
        });
        
        icon.classList.add(isCardCollapsed ? 'ph-caret-right' : 'ph-caret-down');

        cardGroupClone.querySelector('.card-name').textContent = g.card.name;
        cardGroupClone.querySelector('.card-date').textContent = g.billingDate;
        cardGroupClone.querySelector('.card-count').textContent = `(${g.transactions.length}件)`;
        cardGroupClone.querySelector('.card-total-amount').textContent = formatAmount(g.total);

        groupBody.id = `card-group-${g.card.id}`;
        groupBody.style.display = isCardCollapsed ? 'none' : 'block';

        // 明細ソート状態管理
        if (!window.cardTxSortState) window.cardTxSortState = {};
        if (!window.cardTxSortState[g.card.id]) {
          window.cardTxSortState[g.card.id] = { key: 'usedDate', order: 'desc' };
        }
        const currentState = window.cardTxSortState[g.card.id];

        const txContainer = cardGroupClone.querySelector('.card-transactions');
        const sortSelect = cardGroupClone.querySelector('.home-tran-sort-key');
        const sortBtn = cardGroupClone.querySelector('.home-tran-sort-order-btn');
        const sortIcon = cardGroupClone.querySelector('.home-tran-sort-order-icon');
        const sortText = cardGroupClone.querySelector('.home-tran-sort-order-text');

        const renderTransactionsList = () => {
          txContainer.innerHTML = '';

          const sortedTx = [...g.transactions].sort((a, b) => {
            let valA, valB;
            switch (currentState.key) {
              case 'usedDate':
                valA = new Date(a.used_date).getTime();
                valB = new Date(b.used_date).getTime();
                break;
              case 'amount':
                valA = a.amount;
                valB = b.amount;
                break;
              case 'shop':
                valA = a.shop || '';
                valB = b.shop || '';
                if (currentState.order === 'asc') return valA.localeCompare(valB, 'ja');
                return valB.localeCompare(valA, 'ja');
              default:
                valA = new Date(a.used_date).getTime();
                valB = new Date(b.used_date).getTime();
            }

            if (currentState.order === 'asc') {
              return valA > valB ? 1 : valA < valB ? -1 : 0;
            } else {
              return valA < valB ? 1 : valA > valB ? -1 : 0;
            }
          });

          sortedTx.forEach(tx => {
            const txClone = tmplTx.content.cloneNode(true);
            const itemEl = txClone.querySelector('.transaction-item');

            itemEl.addEventListener('click', () => {
              openEditTransaction(tx.id);
            });
            txClone.querySelector('.shop-name').textContent = tx.shop || '（購入先未設定）';

            const badge = txClone.querySelector('.badge');
            badge.className = `badge ${tx.is_confirmed ? 'badge-confirmed' : 'badge-reserved'}`;
            badge.textContent = tx.is_confirmed ? '確定' : '未確定';

            const categoryBadge = txClone.querySelector('.badge-category');
            const catKey = tx.category || '未分類';
            
            if (tx.category) {
              categoryBadge.textContent = tx.category;
              categoryBadge.style.display = 'inline-block';
              categoryBadge.style.fontSize = '10px';
              categoryBadge.style.padding = '2px 6px';
              categoryBadge.style.borderRadius = '4px';
              categoryBadge.style.marginLeft = '4px';
              
              const assignedColor = categoryColorMap[catKey] || '#cccccc';
              categoryBadge.style.backgroundColor = assignedColor;
              categoryBadge.style.color = '#ffffffeb'; 
            } else {
              categoryBadge.style.display = 'none';
            }

            txClone.querySelector('.date-category').textContent = `${formatDate(tx.used_date)} ${tx.category || ''}`;

            if (tx.detail) {
              const detailEl = txClone.querySelector('.tx-detail');
              detailEl.textContent = tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail;
              detailEl.style.display = 'block';
            }

            txClone.querySelector('.transaction-amount').textContent = formatAmount(tx.amount);

            txContainer.appendChild(txClone);
          });
        };

        if (sortSelect) {
          sortSelect.value = currentState.key;
          sortSelect.addEventListener('change', (e) => {
            currentState.key = e.target.value;
            renderTransactionsList();
          });
        }

        if (sortBtn && sortIcon && sortText) {
          if (currentState.order === 'asc') {
            sortIcon.className = 'ph-bold ph-sort-ascending home-tran-sort-order-icon';
            sortText.textContent = '昇順';
          } else {
            sortIcon.className = 'ph-bold ph-sort-descending home-tran-sort-order-icon';
            sortText.textContent = '降順';
          }

          sortBtn.addEventListener('click', () => {
            currentState.order = currentState.order === 'asc' ? 'desc' : 'asc';
            if (currentState.order === 'asc') {
              sortIcon.className = 'ph-bold ph-sort-ascending home-tran-sort-order-icon';
              sortText.textContent = '昇順';
            } else {
              sortIcon.className = 'ph-bold ph-sort-descending home-tran-sort-order-icon';
              sortText.textContent = '降順';
            }
            renderTransactionsList();
          });
        }

        accountBody.appendChild(cardGroupClone);
        renderTransactionsList();
      });



      groupsContainer.appendChild(accountClone);
    });
  }

  // ===== 月ナビゲーション・スワイプの配線 ======
  const prevBtn = clone.querySelector('#btn-prev-month');
  const nextBtn = clone.querySelector('#btn-next-month');
  const currentBtn = clone.querySelector('#btn-current-month');
  const monthLabel = clone.querySelector('.month-label');

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      changeMonth(-1);
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      changeMonth(1);
    });
  }

  if (currentBtn) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthNum = now.getMonth();

    const displayYear = currentMonth.getFullYear();
    const displayMonthNum = currentMonth.getMonth();

    const isThisMonth = (displayYear === currentYear && displayMonthNum === currentMonthNum);

    if (isThisMonth) {
      currentBtn.disabled = true;
      currentBtn.style.opacity = '0.4';
      currentBtn.style.cursor = 'default';
      currentBtn.textContent = '今月';
    } else {
      currentBtn.disabled = false;
      currentBtn.style.opacity = '1';
      currentBtn.style.cursor = 'pointer';
      currentBtn.textContent = '今月へ戻る';
      
      currentBtn.addEventListener('click', () => {
        const monthDiff = (currentYear * 12 + currentMonthNum) - (displayYear * 12 + displayMonthNum);
        changeMonth(monthDiff);
      });
    }
  }

// 年月ラベルクリックで、月別画面へ遷移
if(monthLabel){
    monthLabel.addEventListener('click', () =>{
      navigate('monthly');
    }
    )
}

// スワイプ
  if (monthLabel) {
    let touchStartX = 0;

    monthLabel.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    monthLabel.addEventListener('touchend', (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) < 50) return;
      if (diff > 0) {
        changeMonth(1);
      } else {
        changeMonth(-1);
      }
    }, { passive: true });
  }

  // ==================== ソートUIのイベント紐づけ ====================
  const homeSortSelect = clone.querySelector('#home-sort-key');
  if (homeSortSelect) {
    homeSortSelect.addEventListener('change', (e) => {
      handleHomeSortChange(e.target.value);
    });
  }

  const sortOrderBtn = clone.querySelector('#home-sort-order-btn');
  if (sortOrderBtn) {
    sortOrderBtn.addEventListener('click', () => {
      toggleHomeSortOrder();
    });
  }

  return clone;
}

// ==================== 月切り替え ====================
function changeMonth(diff) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + diff, 1);
  renderPage();
}

// ==================== カードグループ・口座グループの開閉 ====================
function expandAllCards() {
  // ✅ カード ID の処理
  cards.forEach(card => { 
    collapsedCards[card.id] = false; 
  });
  
  // ✅ 口座 ID の処理も追加
  bankAccounts.forEach(account => { 
    collapsedCards[`account-${account.id}`] = false; 
  });
  
  renderPage();
}

function collapseAllCards() {
  // ✅ カード ID の処理
  cards.forEach(card => { 
    collapsedCards[card.id] = true; 
  });
  
  // ✅ 口座 ID の処理も追加
  bankAccounts.forEach(account => { 
    collapsedCards[`account-${account.id}`] = true; 
  });
  
  renderPage();
}

// ==================== カテゴリチャートの開閉 ====================
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

// カテゴリチャートの描画関数
function renderCategoryChart(targetTx) {
  // === 1. 集計・ソート処理（元のロジックと100%同じ） ===
  const categoryMap = {};
  targetTx.forEach(tx => {
    const key = tx.category || '未分類';
    if (!categoryMap[key]) categoryMap[key] = 0;
    categoryMap[key] += tx.amount;
  });

  const sorted = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1]);
 
  const total = sorted.reduce((sum, [, v]) => sum + v, 0);
  if (total === 0) return null; // 合計0なら描画しない
  
  // カテゴリ名 -> 色 の対応表（マップ）を作成
const categoryColorMap = {};
sorted.forEach(([cat], i) => {
  categoryColorMap[cat] = CHART_COLORS[i % CHART_COLORS.length];
});






// // お試し
// // === 2. DOMの組み立て（案1：積み上げバー＋リスト） ===
// const chartClone = document.getElementById('tmpl-category-chart').content.cloneNode(true);

// // トグルボタン処理
// const toggleBtn = chartClone.querySelector('#btn-toggle-category-chart');
// if (toggleBtn) {
//   toggleBtn.addEventListener('click', () => {
//     if (typeof toggleCategoryChart === 'function') {
//       toggleCategoryChart();
//     }
//   });
// }

// // ヘッダー情報の設定
// const icon = chartClone.querySelector('.toggle-icon');
// if (icon) {
//   icon.classList.add(isCategoryChartCollapsed ? 'ph-caret-right' : 'ph-caret-down');
// }

// const totalAmountEl = chartClone.querySelector('.chart-total-amount');
// if (totalAmountEl) {
//   totalAmountEl.textContent = "(カード計) " + formatAmount(total);
// }

// // 開閉状態の設定
// const chartBody = chartClone.querySelector('#category-chart-body');
// if (chartBody) {
//   chartBody.style.display = isCategoryChartCollapsed ? 'none' : 'block';
// }

// const stackedBar = chartClone.querySelector('.stacked-bar');
// const barsContainer = chartClone.querySelector('.bars-container');
// const tmplBar = document.getElementById('tmpl-category-bar');

// // 各カテゴリの要素を生成
// sorted.forEach(([label, value], i) => {
//   const barClone = tmplBar.content.cloneNode(true);
//   const ratio = value / total;
//   const percent = Math.round(ratio * 100);
//   const color = CHART_COLORS[i % CHART_COLORS.length];

//   // ① 上部の1本バーにセグメントを追加
//   if (stackedBar && percent > 0) {
//     const segment = document.createElement('div');
//     segment.className = 'stacked-segment';
//     segment.style.width = `${percent}%`;
//     segment.style.backgroundColor = color;
//     stackedBar.appendChild(segment);
//   }

//   // ② リスト行のクリックで詳細画面へ遷移
//   const itemEl = barClone.querySelector('.legend-item');
//   itemEl.addEventListener('click', () => {
//     openCategoryDetail(encodeURIComponent(label));
//   });

//   // ③ テキスト・色・パーセントの設定
//   barClone.querySelector('.legend-dot').style.backgroundColor = color;
//   barClone.querySelector('.legend-label').textContent = label;
//   barClone.querySelector('.legend-percent').textContent = `${percent}%`;
//   barClone.querySelector('.legend-amount').textContent = formatAmount(value);

//   barsContainer.appendChild(barClone);
// });

// return chartClone;



  // === 2. DOMの組み立て ===
  // テンプレートから要素を複製する処理の周辺
const chartClone = document.getElementById('tmpl-category-chart').content.cloneNode(true);
const toggleBtn = chartClone.querySelector('#btn-toggle-category-chart');
// トグルボタンのクリックイベントを安全にバインド
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    if (typeof toggleCategoryChart === 'function') {
      toggleCategoryChart();
    }
  });
}
// ヘッダー（合計金額・トグルアイコン状態）の設定
  const icon = chartClone.querySelector('.toggle-icon');
  if (icon) {
    icon.classList.add(isCategoryChartCollapsed ? 'ph-caret-right' : 'ph-caret-down');
  }
  
  const totalAmountEl = chartClone.querySelector('.chart-total-amount');
  if (totalAmountEl) {
    totalAmountEl.textContent = "(カード計) " + formatAmount(total);
  }

  // 開閉（非表示）状態の設定
const chartBody = chartClone.querySelector('#category-chart-body');
  if (chartBody) {
    chartBody.style.display = isCategoryChartCollapsed ? 'none' : 'block';
  }

  // 各カテゴリバーの生成
  const barsContainer = chartClone.querySelector('.bars-container');
  const tmplBar = document.getElementById('tmpl-category-bar');

  sorted.forEach(([label, value], i) => {
    const barClone = tmplBar.content.cloneNode(true);
    const ratio = value / total;
    const percent = Math.round(ratio * 100);
    const color = CHART_COLORS[i % CHART_COLORS.length];

    // カテゴリクリック時の詳細画面遷移
    const itemEl = barClone.querySelector('.legend-item');
    itemEl.addEventListener('click', () => {
      openCategoryDetail(encodeURIComponent(label));
    });     
    // ドットの色
    barClone.querySelector('.legend-dot').style.background = color;

    // テキスト・金額・パーセント
    barClone.querySelector('.legend-label').textContent = label;
    barClone.querySelector('.legend-amount').textContent =  formatAmount(value);
    barClone.querySelector('.legend-percent').textContent = `${percent}%`;

    // プログレスバーの長さと色
    const progressFill = barClone.querySelector('.progress-bar-fill');
    progressFill.style.background = color;
    progressFill.style.width = `${percent}%`;

    barsContainer.appendChild(barClone);
  });

  return chartClone;
}

// ==================== カテゴリ詳細画面への遷移 ====================
function openCategoryDetail(encodedCategory) {
  const category = decodeURIComponent(encodedCategory);
  currentPage = 'category-detail';
  window._categoryDetail = { category, month: new Date(currentMonth) };
  renderPage();
}

// ==================== カテゴリ詳細画面 ====================
function renderCategoryDetail() {
  const { category, month } = window._categoryDetail;

  // === 1. データ抽出・集計（元のロジックと100%同じ） ===
  const targetTx = transactions.filter(tx => {
    const card = cards.find(c => c.id === tx.card_id);
    if (!card) return false;
    const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
    const txCategory = tx.category || '未分類';
    return isSameMonth(billing, month) && txCategory === category;
  });

  const total = targetTx.reduce((sum, tx) => sum + tx.amount, 0);

  // === 2. DOMの組み立て ===
  const tmplDetail = document.getElementById('tmpl-category-detail');
  const clone = tmplDetail.content.cloneNode(true);

  // 💡 [追加] 戻るボタンのイベントバインド（.btn-back または button を検索）
  const backBtn = clone.querySelector('.btn-back') || clone.querySelector('button');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // ホーム（あるいは元の画面）へ戻る
      if (typeof navigate === 'function') {
        navigate('home');
      } else {
        currentPage = 'home';
        renderApp();
      }
    });
  }

  // ヘッダー情報のセット
  clone.querySelector('.category-name').textContent = category;
  clone.querySelector('.target-month').textContent = formatYearMonth(month);
  clone.querySelector('.category-total').textContent = formatAmount(total);

  // 明細リストの描画
  if (targetTx.length === 0) {
    // 明細がない場合の表示
    clone.querySelector('.no-data').style.display = 'block';
  } else {
    // 明細リストのコンテナとテンプレートを取得
    const listContainer = clone.querySelector('.tx-list-container');
    const tmplTx = document.getElementById('tmpl-transaction-item');

    // 明細ループ処理
    targetTx.forEach(tx => {
      const card = cards.find(c => c.id === tx.card_id);
      const txClone = tmplTx.content.cloneNode(true);
      const itemEl = txClone.querySelector('.transaction-item');

      // 明細クリックで編集画面を開く
      itemEl.classList.add('card');
      itemEl.addEventListener('click', () => {
        openEditTransaction(tx.id);
      });

      // 購入先
      txClone.querySelector('.shop-name').textContent = tx.shop || '（購入先未設定）';

      // 確定/未確定バッジ
      const badge = txClone.querySelector('.badge');
      badge.className = `badge ${tx.is_confirmed ? 'badge-confirmed' : 'badge-reserved'}`;
      badge.textContent = tx.is_confirmed ? '確定' : '未確定';

      // 日付・カード名
      const cardName = card ? card.name : '';
      txClone.querySelector('.date-category').textContent = `${formatDate(tx.used_date)} ${cardName}`;

      // 詳細（30文字超の省略処理）
      if (tx.detail) {
        const detailEl = txClone.querySelector('.tx-detail');
        detailEl.textContent = tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail;
        detailEl.style.display = 'block';
      }

      // 金額
      txClone.querySelector('.transaction-amount').textContent = formatAmount(tx.amount);

      listContainer.appendChild(txClone);
    });
  }

  return clone;
}




















// ==================== 月別一覧 ====================
let collapsedYears = {};

function renderMonthly() {
  // === 1. 集計・グループ化処理 ===
  const monthMap = {};

  // ① カード取引の集計（✅ cardTotal と recurringTotal を両方初期化）
  transactions.forEach(tx => {
    const card = cards.find(c => c.id === tx.card_id);
    if (!card) return;
    const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
    const key = `${billing.getFullYear()}-${String(billing.getMonth()+1).padStart(2,'0')}`;
    if (!monthMap[key]) monthMap[key] = { date: billing, cardTotal: 0, recurringTotal: 0 };
    monthMap[key].cardTotal += tx.amount;
  });

  // ② 定期支払いの集計
recurringPayments.forEach(rp => {
  if (!rp.is_active || rp.is_deleted) return;
  
  const startDate = new Date(rp.start_date);
  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);  // ✅ 月単位に変換
  const startYear = startMonth.getFullYear();
  const startMonthNum = startMonth.getMonth() + 1;

  // 現在の年月を取得
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth() + 1;

  // start_date から現在までの全対象月をループで計算
  for (let y = startYear; y <= endYear; y++) {
    const mStart = y === startYear ? startMonthNum : 1;  // ✅ startMonthNum を使用
    const mEnd = y === endYear ? endMonth : 12;
    
    for (let m = mStart; m <= mEnd; m++) {
      const checkDate = new Date(y, m - 1, 1);
      if (isRecurringDueThisMonth(rp, checkDate)) {
        const key = `${y}-${String(m).padStart(2,'0')}`;
        if (!monthMap[key]) monthMap[key] = { date: checkDate, cardTotal: 0, recurringTotal: 0 };
        monthMap[key].recurringTotal += rp.amount;
      }
    }
  }
});

  // ③ 合計を計算（✅ null チェック追加）
  Object.entries(monthMap).forEach(([key, val]) => {
    val.total = (val.cardTotal || 0) + (val.recurringTotal || 0);
  });

  const sorted = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0]));

  // 年別にグループ化
  const yearMap = {};
  sorted.forEach(([key, val]) => {
    const year = val.date.getFullYear();
    if (!yearMap[year]) yearMap[year] = [];
    yearMap[year].push([key, val]);
  });

  const currentYear = new Date().getFullYear();
  const years = Object.keys(yearMap).sort((a, b) => b - a);

  // 年別合計（カード + 定期支払い）
  const yearTotals = {};
  years.forEach(year => {
    yearTotals[year] = yearMap[year].reduce((sum, [, val]) => sum + val.total, 0);
  });

  // === 2. DOMの組み立て ===
  const tmplMonthly = document.getElementById('tmpl-monthly');
  const clone = tmplMonthly.content.cloneNode(true);

  if (years.length === 0) {
    const noDataEl = clone.querySelector('.no-data');
    if (noDataEl) noDataEl.style.display = 'block';
  } else {
    // 一括開閉ボタンを表示
    const toggleButtons = clone.querySelector('.toggle-buttons');
    if (toggleButtons) toggleButtons.style.display = 'flex';

    const yearsContainer = clone.querySelector('.years-container');
    const tmplYear = document.getElementById('tmpl-year-group');
    const tmplMonth = document.getElementById('tmpl-month-item');

    years.forEach(year => {
      const yearClone = tmplYear.content.cloneNode(true);

      const isCurrentYear = parseInt(year) === currentYear;
      const isCollapsed = collapsedYears[year] !== undefined ? collapsedYears[year] : !isCurrentYear;

      // 年ヘッダーの設定
      const header = yearClone.querySelector('.year-header');
      const icon = yearClone.querySelector('.toggle-icon');
      
      if (header) {
        header.addEventListener('click', () => {
          toggleYear(year);
        });
      }

      if (icon) {
        icon.classList.add(isCollapsed ? 'ph-caret-right' : 'ph-caret-down');
      }

      const yearLabel = yearClone.querySelector('.year-label');
      if (yearLabel) yearLabel.textContent = `${year}年`;

      const yearTotalEl = yearClone.querySelector('.year-total-amount');
      if (yearTotalEl) yearTotalEl.textContent = formatAmount(yearTotals[year]);

      // 月別リスト格納部の設定
      const yearBody = yearClone.querySelector('.year-body');
      if (yearBody) {
        yearBody.id = `year-${year}`;
        yearBody.style.display = isCollapsed ? 'none' : 'block';

        // 各月の1行パーツを生成
        yearMap[year].forEach(([key, val]) => {
          const monthClone = tmplMonth.content.cloneNode(true);
          const itemEl = monthClone.querySelector('.month-item');

          // 月クリックでホーム画面に遷移するイベントを追加
          if (itemEl) {
            itemEl.addEventListener('click', () => {
              goToMonth(key);
            });
          }

          // 月ラベルと金額の設定
          const monthLabel = monthClone.querySelector('.month-label');
          if (monthLabel) monthLabel.textContent = `${val.date.getMonth() + 1}月 引き落とし`;

          const monthAmount = monthClone.querySelector('.month-amount');
          if (monthAmount) monthAmount.textContent = formatAmount(val.total);
          
          yearBody.appendChild(monthClone);
        });
      }

      if (yearsContainer) yearsContainer.appendChild(yearClone);
    });
  }

  return clone;
}

//年グループ作成
function toggleYear(year) {
  const el = document.getElementById(`year-${year}`);
  if (!el) return;
  const isCollapsed = el.style.display === 'none';
  el.style.display = isCollapsed ? 'block' : 'none';
  collapsedYears[year] = !isCollapsed;
  renderPage();
}

// ==================== 年別グループの一括開閉 ====================

// 全ての年を開く
function expandAllYears() {
  // transactions（または表示対象データ）から存在する「年」を動的に取得
  // データが存在しない場合でも DOM 上の year-XXXX 要素から網羅
  const allYears = new Set([
    ...transactions.map(tx => new Date(tx.used_date).getFullYear()),
    ...Array.from(document.querySelectorAll('[id^="year-"]')).map(el => el.id.replace('year-', ''))
  ]);

  allYears.forEach(year => {
    if (year) collapsedYears[year] = false;
  });

  renderPage();
}

// 全ての年を閉じる
function collapseAllYears() {
  const allYears = new Set([
    ...transactions.map(tx => new Date(tx.used_date).getFullYear()),
    ...Array.from(document.querySelectorAll('[id^="year-"]')).map(el => el.id.replace('year-', ''))
  ]);

  allYears.forEach(year => {
    if (year) collapsedYears[year] = true;
  });

  renderPage();
}

function goToMonth(key) {
  const [y, m] = key.split('-').map(Number);
  currentMonth = new Date(y, m - 1, 1);
  navigate('home');
}















// ==================== 予約管理 ====================

function renderReserved() {
  let reserved = transactions.filter(tx => !tx.is_confirmed);
  reserved.sort((a,b) => new Date(a.used_date) - new Date(b.used_date));

  const tmplReserved = document.getElementById('tmpl-reserved');
  const clone = tmplReserved.content.cloneNode(true);

  if (reserved.length === 0) {
    clone.querySelector('.no-data').style.display = 'block';
  } else {
    const listContainer = clone.querySelector('.reserved-list-container');
    const tmplItem = document.getElementById('tmpl-reserved-item');

    reserved.forEach(tx => {
      const card = cards.find(c => c.id === tx.card_id);
      const itemClone = tmplItem.content.cloneNode(true);

      // クリックで編集画面を開く
      const header = itemClone.querySelector('.reserved-header');
      header.addEventListener('click', () => {
        openEditTransaction(tx.id);
      });

      itemClone.querySelector('.shop').textContent = tx.shop || '（購入先未設定）';
      
      const cardName = card ? card.name : '';
      const categoryName = tx.category || '';
      itemClone.querySelector('.date-card-category').textContent = `${formatDate(tx.used_date)} ${cardName} ${categoryName}`;
      itemClone.querySelector('.transaction-amount').textContent = formatAmount(tx.amount);

      // 詳細テキストの処理
      if (tx.detail) {
        const detailSection = itemClone.querySelector('.detail-section');
        const detailTextEl = itemClone.querySelector('.detail-text');
        const toggleBtn = itemClone.querySelector('.toggle-detail-btn');

        detailSection.style.display = 'block';

        // 原文をそのままセット（改行含めそのまま入る）
        detailTextEl.textContent = tx.detail;

        // 改行が2行以上ある、または文字数が40文字以上の場合は開閉ボタンを表示
        const lines = tx.detail.split('\n').length;
        const isLong = lines > 2 || tx.detail.length > 40;

        if (isLong) {
          toggleBtn.style.display = 'block';
          toggleBtn.addEventListener('click', (event) => {
            toggleReservedDetail(toggleBtn, event);
          });
        }
      }

      listContainer.appendChild(itemClone);
    });
  }

  return clone;
}

// 詳細テキストの開閉（改行を保持したまま、行数制限のみを解除/適用）
function toggleReservedDetail(btnEl, event) {
  if (event) event.stopPropagation();

  const detailSection = btnEl.closest('.detail-section');
  const detailText = detailSection.querySelector('.detail-text');
  const toggleLabel = btnEl.querySelector('.toggle-label');

  // 現在2行制限されている（閉じている）か判定
  const isCollapsed = detailText.style.webkitLineClamp === '2' || detailText.style.webkitLineClamp === '';

  if (isCollapsed) {
    // 全文表示（制限解除。改行もそのまま全て展開される）
    detailText.style.webkitLineClamp = 'unset';
    detailText.style.overflow = 'visible';
    toggleLabel.innerHTML = '閉じる <i class="ph-bold ph-caret-up"></i>';
  } else {
    // 2行に折りたたむ（高さ統一）
    detailText.style.webkitLineClamp = '2';
    detailText.style.overflow = 'hidden';
    toggleLabel.innerHTML = 'もっと見る <i class="ph-bold ph-caret-down"></i>';
  }
}














    // ==================== 定期支払い管理 ====================
function renderRecurring() {
  // === 1. DOMの組み立て ===
  const tmplRecurring = document.getElementById('tmpl-recurring');
  const clone = tmplRecurring.content.cloneNode(true);

  if (recurringPayments.length === 0) {
    clone.querySelector('.no-data').style.display = 'block';
  } else {
    const listContainer = clone.querySelector('.recurring-list-container');
    const tmplItem = document.getElementById('tmpl-recurring-item');
    const today = new Date();

    recurringPayments.forEach(r => {
      const bank = bankAccounts.find(b => b.id === r.bank_account_id);
      const isDue = isRecurringDueThisMonth(r, today);
      const processed = isRecurringProcessed(r.id, today.getFullYear(), today.getMonth() + 1);

      const itemClone = tmplItem.content.cloneNode(true);
      const cardEl = itemClone.querySelector('.recurring-card');
      const infoEl = itemClone.querySelector('.recurring-info');

      // 非アクティブ（オフ）時の透過度設定
      cardEl.style.opacity = r.is_active ? '1' : '0.6';




      // 編集ダイアログ起動設定
      infoEl.addEventListener('click', () => {
        openEditRecurring(r.id);
      });

      // 定期支払を追加モーダル起動設定
      const addBtn = clone.querySelector("#btn-add-recurring");
      addBtn.addEventListener('click',() =>{
        openAddRecurring();
      })

      // 名称と金額
      itemClone.querySelector('.recurring-name').textContent = r.name;
      itemClone.querySelector('.recurring-amount').textContent = formatAmount(r.amount);

      // 補足情報（周期・引き落とし日・口座名）
      const freqLabel = FREQUENCY_LABELS[r.frequency] || '';
      const bankName = bank ? bank.name : '口座未設定';
      itemClone.querySelector('.recurring-meta').textContent = `${freqLabel} ${r.billing_day}日 ${bankName}`;

      // メモ（存在時のみ）
      if (r.memo) {
        const memoEl = itemClone.querySelector('.recurring-memo');
        memoEl.textContent = r.memo;
        memoEl.style.display = 'block';
      }

      // ステータスバッジの挿入制御
      const badgeContainer = itemClone.querySelector('.badge-status-container');
      if (!r.is_active) {
        badgeContainer.appendChild(
          createBadge('オフ中', 'var(--gray-200)', 'var(--gray-400)')
        );
      } else if (isDue && processed) {
        badgeContainer.appendChild(
          createBadge('今月処理済', '#1a2d1a', 'var(--success)')
        );
      } else if (isDue && !processed) {
        badgeContainer.appendChild(
          createBadge('今月未処理', '#2d1a1a', 'var(--danger)')
        );
      }

      listContainer.appendChild(itemClone);
    });
  }

  return clone;
}

// バッジ生成用ヘルパー関数（この画面または共通処理に配置）
function createBadge(text, bg, color) {
  const badge = document.createElement('span');
  badge.textContent = text;
  badge.style.fontSize = '11px';
  badge.style.background = bg;
  badge.style.color = color;
  badge.style.padding = '2px 6px';
  badge.style.borderRadius = '99px';
  return badge;
}

function openAddRecurring() {
  showRecurringModal(null);
}

function openEditRecurring(id) {
  const r = recurringPayments.find(r => r.id === id);
  showRecurringModal(r);
}

// 定期支払い追加モーダル表示
function showRecurringModal(r) {
  const isEdit = !!r;
  const todayString = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

  const tmplModal = document.getElementById('tmpl-recurring-modal');
  const clone = tmplModal.content.cloneNode(true);
  const tmplOpt = document.getElementById('tmpl-option');

  // モーダルタイトルの設定
  clone.querySelector('.modal-title').textContent = isEdit ? '定期支払い編集' : '定期支払い追加';

  // 各フォームフィールドの参照取得と値の初期化
  const inputName = clone.getElementById('rec-name');
  const inputAmount = clone.getElementById('rec-amount');
  const selectBank = clone.getElementById('rec-bank');
  const inputDay = clone.getElementById('rec-day');
  const selectFrequency = clone.getElementById('rec-frequency');
  const inputStart = clone.getElementById('rec-start');
  const inputMemo = clone.getElementById('rec-memo');
  const checkActive = clone.getElementById('rec-active');

  inputName.value = r?.name || '';
  inputAmount.value = r?.amount || '';
  inputDay.value = r?.billing_day || '';
  inputStart.value = r?.start_date || todayString;
  inputMemo.value = r?.memo || '';
  checkActive.checked = r?.is_active !== false;

  // 口座 `<select>` の選択肢を生成
  bankAccounts.forEach(b => {
    const optClone = tmplOpt.content.cloneNode(true);
    const optEl = optClone.querySelector('option');
    optEl.value = b.id;
    optEl.textContent = b.name;
    if (r?.bank_account_id === b.id) optEl.selected = true;
    selectBank.appendChild(optClone);
  });

  // 頻度 `<select>` の選択肢を生成
  Object.entries(FREQUENCY_LABELS).forEach(([val, label]) => {
    const optClone = tmplOpt.content.cloneNode(true);
    const optEl = optClone.querySelector('option');
    optEl.value = val;
    optEl.textContent = label;
    if (r?.frequency === val) optEl.selected = true;
    selectFrequency.appendChild(optClone);
  });

  // 編集モード時の「削除チェックボックス」と「保存ボタン」のクリックイベント設定
  if (isEdit) {
    clone.querySelector('.delete-check').style.display = 'block';
  }

  const saveBtn = clone.querySelector('.btn-save');
  saveBtn.addEventListener('click', () => {
    saveRecurring(r?.id || null);
  });

  // キャンセルボタン押下時モーダル閉じる
      const cancelBtn= clone.querySelector('#btn-cancel');
    cancelBtn.addEventListener('click', () => {
      closeModal();
    })

  // DOMへの追加とスクロール制御（元のロジックと100%同じ）
  document.body.appendChild(clone);
  document.body.style.overflow = 'hidden';
}

async function saveRecurring(id) {
    const btnEl = document.querySelector('.btn-save');
  await withSaveGuard(btnEl, async () => {
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
}); // withSaveGuard end\n
}








// ==================== 口座管理 ====================
function renderBanks() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;

  const tmplBanks = document.getElementById('tmpl-banks');
  const clone = tmplBanks.content.cloneNode(true);

  if (bankAccounts.length === 0) {
    const noDataEl = clone.querySelector('.no-data');
    if (noDataEl) noDataEl.style.display = 'block';
  } else {
    const listContainer = clone.querySelector('.bank-list-container');
    const tmplCard = document.getElementById('tmpl-bank-card');
    const tmplRecItem = document.getElementById('tmpl-bank-recurring-item');
    const tmplCardItem = document.getElementById('tmpl-bank-card-item');

    bankAccounts.forEach(bank => {
      const cardClone = tmplCard.content.cloneNode(true);

      // 口座基本情報（null チェック追加）
      const bankNameEl = cardClone.querySelector('.bank-name');
      if (bankNameEl) bankNameEl.textContent = bank.name;

      const bankBalanceEl = cardClone.querySelector('.bank-balance');
      if (bankBalanceEl) bankBalanceEl.textContent = formatAmount(bank.balance);

      // ✅ bank-card が null でないか確認
      const bankCardEl = cardClone.querySelector('.bank-card');
      if (bankCardEl) {
        bankCardEl.addEventListener('click', () => {
          openEditBank(bank.id);
        });
      }

      let totalUnprocessed = 0;
      let totalProcessed = 0;

      // 1. 口座に紐付いたカードの計算・表示処理
      const linkedCards = cards.filter(c => c.bank_account_id === bank.id);
      const cardBillingSection = cardClone.querySelector('.card-billing-section');
      const noLinkedCards = cardClone.querySelector('.no-linked-cards');

      if (linkedCards.length > 0) {
        if (cardBillingSection) cardBillingSection.style.display = 'block';
        
        // ✅ card-billing-list が null でないか確認
        const cardBillingList = cardClone.querySelector('.card-billing-list');
        if (cardBillingList) {
          linkedCards.forEach(card => {
            const cardItemClone = tmplCardItem.content.cloneNode(true);
            
            const cardTx = transactions.filter(tx => {
              if (tx.card_id !== card.id) return false;
              const billing = calcBillingDate(tx.used_date, card.closing_day, card.billing_day);
              return isSameMonth(billing, today);
            });
            const amount = cardTx.reduce((sum, tx) => sum + tx.amount, 0);

            const isProcessed = isCardBillingProcessed(card.id, currentYear, currentMonth);

            if (isProcessed) {
              totalProcessed += amount;
            } else {
              totalUnprocessed += amount;
            }

            const billingLastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const billingDay = Math.min(card.billing_day, billingLastDay);
            const dateStr = `${currentMonth}/${String(billingDay).padStart(2, '0')}`;

            const cardNameEl = cardItemClone.querySelector('.card-name');
            if (cardNameEl) cardNameEl.textContent = card.name;

            const billingDateEl = cardItemClone.querySelector('.billing-date-text');
            if (billingDateEl) billingDateEl.textContent = `${dateStr}引き落とし`;

            const amountEl = cardItemClone.querySelector('.billing-amount');
            if (amountEl) {
              amountEl.textContent = formatAmount(amount);
              amountEl.style.color = isProcessed ? 'var(--gray-400)' : 'var(--gray-800)';
            }

            const badgeProcessed = cardItemClone.querySelector('.badge-card-processed');
            const btnProcess = cardItemClone.querySelector('.btn-process-card');

            if (isProcessed) {
              if (badgeProcessed) badgeProcessed.style.display = 'inline';
              if (btnProcess) btnProcess.style.display = 'none';
            } else {
              if (badgeProcessed) badgeProcessed.style.display = 'none';
              if (btnProcess && amount > 0) {
                btnProcess.style.display = 'inline-block';
                btnProcess.addEventListener('click', () => {
                  processCardBilling(card.id, amount, currentYear, currentMonth);
                });
              } else if (btnProcess) {
                btnProcess.style.display = 'none';
              }
            }

            cardBillingList.appendChild(cardItemClone);
          });
        }
      } else {
        if (cardBillingSection) cardBillingSection.style.display = 'none';
        if (noLinkedCards) noLinkedCards.style.display = 'block';
      }

      // 2. 定期支払いの計算・表示処理
      const linkedRecurring = recurringPayments.filter(r => r.bank_account_id === bank.id);
      const dueRecurring = linkedRecurring.filter(r => isRecurringDueThisMonth(r, today));

      if (dueRecurring.length > 0) {
        const recurringSection = cardClone.querySelector('.recurring-section');
        const recurringList = cardClone.querySelector('.recurring-list');
        if (recurringSection) recurringSection.style.display = 'block';

        dueRecurring.forEach(r => {
          const recClone = tmplRecItem.content.cloneNode(true);
          const isProcessed = isRecurringProcessed(r.id, currentYear, currentMonth);

          if (r.is_active) {
            if (isProcessed) {
              totalProcessed += r.amount;
            } else {
              totalUnprocessed += r.amount;
            }
          }

          const recNameEl = recClone.querySelector('.rec-name');
          if (recNameEl) recNameEl.textContent = r.name;

          const recMetaEl = recClone.querySelector('.rec-meta');
          if (recMetaEl) recMetaEl.textContent = `${r.billing_day}日 ${FREQUENCY_LABELS[r.frequency]}`;

          const badgeOffEl = recClone.querySelector('.badge-off');
          if (!r.is_active && badgeOffEl) badgeOffEl.style.display = 'inline';

          const badgeProcessedEl = recClone.querySelector('.badge-processed');
          if (isProcessed && badgeProcessedEl) badgeProcessedEl.style.display = 'inline';

          const amountEl = recClone.querySelector('.rec-amount');
          if (amountEl) {
            amountEl.textContent = formatAmount(r.amount);
            amountEl.style.color = (!r.is_active || isProcessed) ? 'var(--gray-400)' : 'var(--gray-800)';
          }

          const btnProcess = recClone.querySelector('.btn-process');
          if (btnProcess) {
            if (r.is_active && !isProcessed) {
              btnProcess.style.display = 'inline-block';
              btnProcess.addEventListener('click', () => {
                processRecurring(r.id, r.amount, currentYear, currentMonth);
              });
            } else {
              btnProcess.style.display = 'none';
            }
          }

          if (recurringList) recurringList.appendChild(recClone);
        });
      }

      // 3. 今月サマリー ＆ 残高判定のセット
      const grandTotal = totalUnprocessed + totalProcessed;

      const elTotalBilling = cardClone.querySelector('.total-billing-amount');
      if (elTotalBilling) elTotalBilling.textContent = formatAmount(grandTotal);

      const elUnprocessedTotal = cardClone.querySelector('.unprocessed-billing-amount');
      const elProcessedTotal = cardClone.querySelector('.processed-billing-amount');
      if (elUnprocessedTotal) elUnprocessedTotal.textContent = formatAmount(totalUnprocessed);
      if (elProcessedTotal) elProcessedTotal.textContent = formatAmount(totalProcessed);

      const remaining = bank.balance - totalUnprocessed;
      const isShort = remaining < 0;

      const statusBox = cardClone.querySelector('.status-box');
      const statusLabel = cardClone.querySelector('.status-label');
      const statusAmount = cardClone.querySelector('.status-amount');

      if (statusBox) {
        statusBox.style.background = isShort ? '#2d1a1a' : '#1a2d1a';
        
        if (statusLabel) {
          statusLabel.textContent = isShort ? '⚠️ 残高不足' : '✅ 残高充足';
          statusLabel.style.color = isShort ? 'var(--danger)' : 'var(--success)';
        }

        if (statusAmount) {
          statusAmount.textContent = `${isShort ? '-' : '+'}${formatAmount(Math.abs(remaining))}`;
          statusAmount.style.color = isShort ? 'var(--danger)' : 'var(--success)';
        }
      }

      if (listContainer) listContainer.appendChild(cardClone);
    });
  }

  return clone;
}

// カード引き落としが処理済みかチェックする関数
function isCardBillingProcessed(cardId, year, month) {
  if (!Array.isArray(cardBillingLogs)) return false;
  return cardBillingLogs.some(log => 
    log.card_id === cardId && log.target_year === year && log.target_month === month
  );
}

// クレジットカード引き落とし処理（個別実行）
async function processCardBilling(cardId, amount, year, month) {
  const card = cards.find(c => c.id === cardId);
  if (!card) return;

  if (!confirm(`${card.name} ${year}年${month}月分（${formatAmount(amount)}）の引き落としを処理しますか？\n口座残高からマイナスされます。`)) return;

  const bank = bankAccounts.find(b => b.id === card.bank_account_id);
  if (!bank) return;

  try {
    // 1. 処理ログの作成
    const { error: logError } = await window._db.from('card_billing_logs').insert({
      card_id: cardId,
      target_year: year,
      target_month: month,
      amount: amount
    });
    if (logError) throw logError;

    // 2. 口座残高の減額
    const { error: bankError } = await window._db.from('bank_accounts')
      .update({ balance: bank.balance - amount, updated_at: new Date() })
      .eq('id', bank.id);
    if (bankError) throw bankError;

    showToast('✅ 引き落としを処理しました');
    await loadData();
    renderPage();
  } catch (e) {
    showToast('❌ 処理に失敗しました', 'error');
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

  const tmplModal = document.getElementById('tmpl-bank-modal');
  const clone = tmplModal.content.cloneNode(true);

  // タイトルの設定
  clone.querySelector('.modal-title').textContent = isEdit ? '口座編集' : '口座追加';

  // 入力フィールドの初期化
  const inputName = clone.getElementById('bank-name');
  const inputBalance = clone.getElementById('bank-balance');

  inputName.value = bank?.name || '';
  inputBalance.value = bank?.balance || '';

  // 編集モード時のみ削除チェックボックスを表示
  if (isEdit) {
    clone.querySelector('.delete-check').style.display = 'block';
  }

  // 保存ボタンにイベントを設定
  const saveBtn = clone.querySelector('.btn-save');
  saveBtn.addEventListener('click', () => {
    saveBank(bank?.id || null);
  });

  // DOMへの追加とスクロール制御
  document.body.appendChild(clone);
  document.body.style.overflow = 'hidden';
}

async function saveBank(id) {
    const btnEl = document.querySelector('.btn-save');
  await withSaveGuard(btnEl, async () => {
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
}); // withSaveGuard end\n}
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
  const tmplCards = document.getElementById('tmpl-cards');
  const clone = tmplCards.content.cloneNode(true);

// ⭕️ 複製した clone の中から #btn-add-card を取得してイベントをアタッチ
  const addCardBtn = clone.querySelector('#btn-add-card');
  if (addCardBtn) {
    addCardBtn.addEventListener('click', () => {
      showCardModal(null);
    });
  }

  const container = clone.querySelector('.card-list-container');
  const noDataEl = clone.querySelector('.no-data');

  if (cards.length === 0) {
    noDataEl.style.display = 'block';
  } else {
    const tmplItem = document.getElementById('tmpl-card-item');

    cards.forEach(card => {
      const itemClone = tmplItem.content.cloneNode(true);
      const cardEl = itemClone.querySelector('.transaction-item');

      // カード情報の埋め込み
      itemClone.querySelector('.card-name').textContent = card.name;
      itemClone.querySelector('.card-meta').textContent = `${card.brand} 締め日:${card.closing_day}日 引き落とし:${card.billing_day}日`;
      itemClone.querySelector('.card-limit').textContent = formatAmount(card.credit_limit);

      // クリックで編集画面を開くイベント設定
      cardEl.addEventListener('click', () => {
        openEditCard(card.id);
      });

      container.appendChild(itemClone);
    });
  }

  return clone;
}

// ==================== ブックマーク ====================
function renderBookmarks() {
  const bookmarked = transactions.filter(tx => tx.is_bookmarked);

  const tmplBookmarks = document.getElementById('tmpl-bookmarks');
  const clone = tmplBookmarks.content.cloneNode(true);

  const noDataEl = clone.querySelector('.no-data');
  const listContainer = clone.querySelector('.bookmark-list-container');

  if (bookmarked.length === 0) {
    noDataEl.style.display = 'block';
  } else {
    const tmplItem = document.getElementById('tmpl-bookmark-item');

    bookmarked.forEach(tx => {
      const itemClone = tmplItem.content.cloneNode(true);
      const card = cards.find(c => c.id === tx.card_id);

      // 店名・カテゴリ・金額
      itemClone.querySelector('.shop').textContent = tx.shop || '（購入先未設定）';
      itemClone.querySelector('.date').textContent = `${card ? card.name : ''} ${tx.category || ''}`;
      itemClone.querySelector('.tx-amount').textContent = formatAmount(tx.amount);

      // メモ（tx.detail）が存在する場合のみ表示
      if (tx.detail) {
        const detailEl = itemClone.querySelector('.tx-detail');
        if (detailEl) {
          detailEl.textContent = tx.detail;
          detailEl.style.display = 'block';
        }
      }

      // ボタンのイベント設定（安全にnullチェック）
      const btnDelete = itemClone.querySelector('.btn-delete');
      if (btnDelete) {
        btnDelete.addEventListener('click', (event) => {
          openEditTransaction(tx.id);
        });
      }

      const btnReuse = itemClone.querySelector('.btn-reuse');
      if (btnReuse) {
        btnReuse.addEventListener('click', (event) => {
          reuseTransaction(tx.id);
        });
      }

      listContainer.appendChild(itemClone);
    });
  }

  return clone;
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

  const tmplSearch = document.getElementById('tmpl-search');
  const clone = tmplSearch.content.cloneNode(true);

  // 1. 検索フォームの値設定（searchStateの反映）
  const inputKeyword = clone.getElementById('search-keyword');
  const selectCard = clone.getElementById('search-card');
  const inputYearMonth = clone.getElementById('search-yearmonth');
  const inputAmountMin = clone.getElementById('search-amount-min');
  const inputAmountMax = clone.getElementById('search-amount-max');

  inputKeyword.value = searchState.keyword || '';
  inputYearMonth.value = searchState.yearMonth || '';
  inputAmountMin.value = searchState.amountMin || '';
  inputAmountMax.value = searchState.amountMax || '';

  // カード選択肢の動的生成
  cards.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    if (searchState.cardId === c.id) {
      opt.selected = true;
    }
    selectCard.appendChild(opt);
  });

  // 2. 検索結果件数の表示
  clone.querySelector('.search-count').textContent = `${results.length}件見つかりました`;

  // 3. 検索結果リストの表示
  const noDataEl = clone.querySelector('#search-results .no-data');
  const resultsList = clone.querySelector('#search-results .search-results-list');

  if (results.length === 0) {
    noDataEl.style.display = 'block';
  } else {
    const tmplItem = document.getElementById('tmpl-search-item');

    results.forEach(tx => {
      const itemClone = tmplItem.content.cloneNode(true);
      const card = cards.find(c => c.id === tx.card_id);
      const itemEl = itemClone.querySelector('.transaction-item');

      // 店舗名 & 確定/未確定バッジ
      itemClone.querySelector('.shop-name').textContent = (tx.shop || '（購入先未設定）') + ' ';
      
      const badgeEl = itemClone.querySelector('.badge');
      if (tx.is_confirmed) {
        badgeEl.className = 'badge badge-confirmed';
        badgeEl.textContent = '確定';
      } else {
        badgeEl.className = 'badge badge-reserved';
        badgeEl.textContent = '未確定';
      }

      // 利用日・カード名・カテゴリ
      itemClone.querySelector('.date').textContent = `${formatDate(tx.used_date)} ${card ? card.name : ''} ${tx.category || ''}`;

      // 詳細メモ（30文字カット処理）
      if (tx.detail) {
        const detailEl = itemClone.querySelector('.tx-detail');
        const shortDetail = tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail;
        detailEl.textContent = shortDetail;
        detailEl.style.display = 'block';
      }

      // 金額
      itemClone.querySelector('.transaction-amount').textContent = formatAmount(tx.amount);

      // クリックイベント設定（編集画面を開く）
      itemEl.addEventListener('click', () => {
        openEditTransaction(tx.id);
      });

      resultsList.appendChild(itemClone);
    });
  }

  return clone;
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
  // 1. フォームの入力内容を searchState に保持
  searchState.keyword = document.getElementById('search-keyword')?.value || '';
  searchState.cardId = document.getElementById('search-card')?.value || '';
  searchState.yearMonth = document.getElementById('search-yearmonth')?.value || '';
  searchState.amountMin = document.getElementById('search-amount-min')?.value || '';
  searchState.amountMax = document.getElementById('search-amount-max')?.value || '';

  const resultsEl = document.getElementById('search-results');
  const results = getSearchResults();

  // 件数表示の更新
  const countEl = document.querySelector('.search-count');
  if (countEl) {
    countEl.textContent = `${results.length}件見つかりました`;
  }

  // 2. 検索結果エリアのDOM再構築
  if (resultsEl) {
    // 既存の中身をクリア
    resultsEl.textContent = '';

    if (results.length === 0) {
      // 該当データなしの表示
      const noDataEl = document.createElement('div');
      noDataEl.className = 'card text-center';
      noDataEl.style.color = 'var(--gray-400)';
      noDataEl.textContent = '条件に一致するデータがありません';
      resultsEl.appendChild(noDataEl);
    } else {
      // テンプレートを使って結果リストを生成
      const tmplItem = document.getElementById('tmpl-search-item');
      const listContainer = document.createElement('div');
      listContainer.className = 'search-results-list';

      results.forEach(tx => {
        const itemClone = tmplItem.content.cloneNode(true);
        const card = cards.find(c => c.id === tx.card_id);
        const itemEl = itemClone.querySelector('.transaction-item');

        // 店舗名 & 確定/未確定バッジ
        itemClone.querySelector('.shop-name').textContent = (tx.shop || '（購入先未設定）') + ' ';

        const badgeEl = itemClone.querySelector('.badge');
        if (tx.is_confirmed) {
          badgeEl.className = 'badge badge-confirmed';
          badgeEl.textContent = '確定';
        } else {
          badgeEl.className = 'badge badge-reserved';
          badgeEl.textContent = '未確定';
        }

        // 利用日・カード名・カテゴリ
        itemClone.querySelector('.date').textContent = `${formatDate(tx.used_date)} ${card ? card.name : ''} ${tx.category || ''}`;

        // 詳細メモ（30文字カット処理）
        if (tx.detail) {
          const detailEl = itemClone.querySelector('.tx-detail');
          const shortDetail = tx.detail.length > 30 ? tx.detail.substring(0, 30) + '…' : tx.detail;
          detailEl.textContent = shortDetail;
          detailEl.style.display = 'block';
        }

        // 金額
        itemClone.querySelector('.transaction-amount').textContent = formatAmount(tx.amount);

        // クリックイベント設定（編集画面を開く）
        itemEl.addEventListener('click', () => {
          openEditTransaction(tx.id);
        });

        listContainer.appendChild(itemClone);
      });

      resultsEl.appendChild(listContainer);
    }
  }
}

function clearSearch() {
  searchState = { keyword: '', cardId: '', yearMonth: '', amountMin: '', amountMax: '' };
  renderPage();
}

// ==================== 削除済み一覧 ====================
let deletedActiveTab = 'cards';

function renderDeleted() {
  const tmplDeleted = document.getElementById('tmpl-deleted');
  const clone = tmplDeleted.content.cloneNode(true);

  // 描画直後に「カード」タブの内容を表示する既存処理
  setTimeout(() => showDeletedTab('cards'), 0);

  return clone;
}

async function showDeletedTab(tab) {
  deletedActiveTab = tab;
  const el = document.getElementById('deleted-list');
  if (!el) return;

  // タブボタンのアクティブ表示切り替え
  const tabCards = document.getElementById('tab-cards');
  const tabTx = document.getElementById('tab-transactions');
  if (tabCards && tabTx) {
    tabCards.className = tab === 'cards' ? 'btn btn-primary' : 'btn btn-ghost';
    tabTx.className = tab === 'transactions' ? 'btn btn-primary' : 'btn btn-ghost';
  }

  // 表示エリアの初期化
  el.textContent = '';

  if (tab === 'cards') {
    const { data } = await window._db.from('cards').select('*').eq('is_deleted', true);

    if (data && data.length > 0) {
      const tmplCardItem = document.getElementById('tmpl-deleted-card-item');

      data.forEach(card => {
        const itemClone = tmplCardItem.content.cloneNode(true);

        itemClone.querySelector('.card-title').textContent = card.name;
        itemClone.querySelector('.btn-restore').addEventListener('click', () => {
          restoreCard(card.id);
        });
        itemClone.querySelector('.btn-perm-delete').addEventListener('click', () => {
          permanentDeleteCard(card.id);
        });

        el.appendChild(itemClone);
      });
    } else {
      const noDataEl = document.createElement('div');
      noDataEl.className = 'card text-center';
      noDataEl.style.color = 'var(--gray-400)';
      noDataEl.textContent = '削除済みカードはありません';
      el.appendChild(noDataEl);
    }
  } else {
    const { data } = await window._db.from('transactions').select('*').eq('is_deleted', true);

    if (data && data.length > 0) {
      const tmplTxItem = document.getElementById('tmpl-deleted-tx-item');

      data.forEach(tx => {
        const itemClone = tmplTxItem.content.cloneNode(true);

        itemClone.querySelector('.card-title').textContent = tx.shop || '（購入先未設定）';
        itemClone.querySelector('.tx-amount').textContent = formatAmount(tx.amount);
        itemClone.querySelector('.btn-restore').addEventListener('click', () => {
          restoreTransaction(tx.id);
        });
        itemClone.querySelector('.btn-perm-delete').addEventListener('click', () => {
          permanentDeleteTransaction(tx.id);
        });
        
        el.appendChild(itemClone);
      });
    } else {
      const noDataEl = document.createElement('div');
      noDataEl.className = 'card text-center';
      noDataEl.style.color = 'var(--gray-400)';
      noDataEl.textContent = '削除済みデータはありません';
      el.appendChild(noDataEl);
    }
  }
}

// ==================== カード追加・編集モーダル ====================
const CARD_BRANDS = ['Visa', 'Mastercard', 'JCB', 'American Express', 'Diners Club', 'その他'];

// カード追加モーダルを開く
function openAddCard() {
  showCardModal(null);
}

// カード編集モーダルを開く
function openEditCard(id) {
  const card = cards.find(c => c.id === id);
  showCardModal(card);
}

// カード追加・編集モーダルの表示
function showCardModal(card) {
  const isEdit = !!card;
  const tmplModal = document.getElementById('tmpl-card-modal');
  if (!tmplModal) {
    console.error('カードモーダルのテンプレートが見つかりませんでした');
    return;
  }

  // テンプレートの複製
  const clone = tmplModal.content.cloneNode(true);

  // タイトルの設定
  const titleEl = clone.querySelector('.modal-title');
  if (titleEl) titleEl.textContent = isEdit ? 'カード編集' : 'カード追加';

  // 入力フィールド要素の取得（querySelector に統一）
  const inputName = clone.querySelector('#card-name');
  const inputBrand = clone.querySelector('#card-brand-select');
  const inputClosing = clone.querySelector('#card-closing');
  const inputBilling = clone.querySelector('#card-billing');
  const inputLimit = clone.querySelector('#card-limit');
  const selectBank = clone.querySelector('#card-bank');
  const brandList = clone.querySelector('#brand-list');

  // 値の初期化
  if (inputName) inputName.value = card?.name || '';
  if (inputBrand) inputBrand.value = card?.brand || '';
  if (inputClosing) inputClosing.value = card?.closing_day || '';
  if (inputBilling) inputBilling.value = card?.billing_day || '';
  if (inputLimit) inputLimit.value = card?.credit_limit || '';

  // ブランドリスト（datalist）の動的生成
  if (brandList) {
    brandList.innerHTML = '';
    CARD_BRANDS.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      brandList.appendChild(opt);
    });
  }

  // 引き落とし口座（select）の動的生成
  if (selectBank) {
    bankAccounts.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      if (card?.bank_account_id === b.id) {
        opt.selected = true;
      }
      selectBank.appendChild(opt);
    });
  }

  // 編集モード時のみ削除チェックボックスを表示
  if (isEdit) {
    const deleteCheck = clone.querySelector('.delete-check');
    if (deleteCheck) deleteCheck.style.display = 'block';
  }

  // 保存ボタンにイベントを設定
  const saveBtn = clone.querySelector('.btn-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveCard(card?.id || '');
    });
  }

  // キャンセルボタン（#btn-cancel）にイベントを設定
  const cancelBtn = clone.querySelector('#btn-cancel') || clone.querySelector('.btn-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      closeModal();
    });
  }

  // ⭕️ 重複防止：画面上に残っている古いモーダルがあれば削除
  const existingModal = document.getElementById('modal-card') || document.querySelector('.modal');
  if (existingModal) {
    existingModal.remove();
  }

  // DOMへの追加とスクロール制御
  document.body.appendChild(clone);
  document.body.style.overflow = 'hidden';
}
// カードの保存処理（追加・編集共通）
async function saveCard(id) {
  // 1. 入力値の取得
  const btnEl = document.querySelector('.btn-save');
  // 2. 保存処理を withSaveGuard でラップして、二重クリック防止
  await withSaveGuard(btnEl, async () => {
  // 3. 入力値の取得    
  const name = document.getElementById('card-name').value.trim();const brand = document.getElementById('card-brand-select').value.trim();
  const closing_day = parseInt(document.getElementById('card-closing').value);
  const billing_day = parseInt(document.getElementById('card-billing').value);
  const credit_limit = parseInt(document.getElementById('card-limit').value);
  const bank_account_id = document.getElementById('card-bank')?.value || null;
  const is_deleted = document.getElementById('card-delete')?.checked || false;
// 4. 必須項目のバリデーション
  if (!name || !brand || !closing_day || !billing_day || !credit_limit) {
    alert('必須項目を入力してください');
    return;
  }
  // 5. データベースへの保存処理
try {
  // 6. 編集モードか新規追加モードかで処理を分岐
    if (id) {
            const { error } = await window._db.from('cards').update({ name, brand, closing_day, billing_day, credit_limit, bank_account_id, is_deleted, updated_at: new Date() }).eq('id', id);
            // 7. エラーハンドリング
            if (error) throw error;
    } else {
      // 8. 新規追加モードの場合は insert
      const { error } = await window._db.from('cards').insert({ name, brand, closing_day, billing_day, credit_limit, bank_account_id });
      // 9. エラーハンドリング
      if (error) throw error;
    }
    // 10. 保存成功時の処理
    closeModal();
    // 11. データの再読み込みと画面の再描画
    await loadData();
        renderApp();
    showToast('✅ 保存しました');
    //エラーキャッチ時
  } catch (e) {
    showToast('❌ 保存に失敗しました', 'error');
    console.error(e);
  }
  }); // withSaveGuard end
}


// ==================== トランザクション追加・編集モーダル ====================
function openAddTransaction() {
  showTransactionModal(null);
}
// トランザクション編集モーダルの表示
function openEditTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  showTransactionModal(tx);
}
// トランザクション追加・編集モーダルの表示
function showTransactionModal(tx) {
  // テンプレートの取得（実際のID: tmpl-tx-modal）
  const tmplModal = document.getElementById('tmpl-tx-modal') || document.getElementById('tmpl-transaction-modal');
  if (!tmplModal) {
    console.error('モーダルのテンプレートが見つかりませんでした');
    return;
  }

  const isEdit = !!tx;
  const today = new Date().toISOString().split('T')[0];
  const clone = tmplModal.content.cloneNode(true);

  // タイトルの設定（新規追加・再利用・編集の判別）
  const titleEl = clone.querySelector('.modal-title');
  if (titleEl) {
    titleEl.textContent = (isEdit && !tx?._isReuse) ? '利用データ編集' : '利用データ追加';
  }

  // 各入力要素の取得（getElementById は DocumentFragment で使えないため querySelector/getElementById を併用）
  const inputDate = clone.querySelector('#tx-date');
  const selectCard = clone.querySelector('#tx-card');
  const inputAmount = clone.querySelector('#tx-amount');
  const inputShop = clone.querySelector('#tx-shop');
  const inputCategory = clone.querySelector('#tx-category');
  const inputDetail = clone.querySelector('#tx-detail');
  const inputBillingDate = clone.querySelector('#tx-billing-date');
  const checkConfirmed = clone.querySelector('#tx-confirmed');
  const checkBookmarked = clone.querySelector('#tx-bookmarked');

  // 値の初期化
  if (inputDate) inputDate.value = tx?.used_date || today;
  if (inputAmount) inputAmount.value = tx?.amount || '';
  if (inputShop) inputShop.value = tx?.shop || '';
  if (inputCategory) inputCategory.value = tx?.category || '';
  if (inputDetail) inputDetail.value = tx?.detail || '';
  if (inputBillingDate) inputBillingDate.value = tx?.billing_date ? formatDate(tx.billing_date) : '';

  // チェックボックスの状態設定
  if (checkConfirmed) checkConfirmed.checked = !!tx?.is_confirmed;
  if (checkBookmarked) checkBookmarked.checked = !!tx?.is_bookmarked;

  // カード選択肢（select）の生成
  if (selectCard) {
    cards.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      if (tx?.card_id === c.id) {
        opt.selected = true;
      }
      selectCard.appendChild(opt);
    });
  }

  // 編集モード時（かつ再利用でない場合）のみ削除チェックボックスを表示
  if (isEdit && !tx?._isReuse) {
    const deleteCheck = clone.querySelector('.delete-check');
    if (deleteCheck) deleteCheck.style.display = 'block';
  }

  // ⭕️ 保存ボタンにイベントを設定
  const saveBtn = clone.querySelector('.btn-save') || clone.querySelector('#btn-save-tx');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveTransaction(tx?.id || '');
    });
  }

  // ⭕️ キャンセルボタン / 閉じるボタンにイベントを設定
// ⭕️ キャンセルボタンのバインド（ID: #btn-cancel を優先取得）
  const cancelBtn = clone.querySelector('#btn-cancel') || clone.querySelector('.btn-cancel');
  
  if (cancelBtn) {
    console.log('✅ キャンセルボタンが見つかりました:', cancelBtn);
    cancelBtn.addEventListener('click', () => {
      console.log('👆 キャンセルボタンがクリックされました');
      closeModal();
    });
  } else {
    console.error('❌ キャンセルボタン（#btn-cancel）がテンプレート内に見つかりませんでした');
  }

  // 既存の同IDモーダルがあれば削除してから新しく追加（重複防止）
  const existingModal = document.getElementById('modal-transaction');
  if (existingModal) existingModal.remove();

  // DOMへの追加と表示処理
  document.body.appendChild(clone);
  document.body.style.overflow = 'hidden';

  const modalEl = document.getElementById('modal-transaction') || document.querySelector('.modal');
  if (modalEl) {
    modalEl.classList.add('show');
  }

  // カード設定済みの場合は引き落とし予定日を自動計算・更新
  if (tx?.card_id && typeof updateBillingDate === 'function') {
    updateBillingDate();
  }
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
  const btnEl = document.querySelector('.btn-save');
  await withSaveGuard(btnEl, async () => {
  const used_date = document.getElementById('tx-date').value;  const card_id = document.getElementById('tx-card').value;
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
  }); // withSaveGuard end
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
  console.log('閉じる処理（closeModal）が実行されました');

  // 該当する可能性のあるモーダル要素をすべて取得
  const modals = document.querySelectorAll('#modal-transaction, .modal-overlay, .modal');

  if (modals.length > 0) {
    modals.forEach(modal => {
      console.log('削除対象のモーダル:', modal);
      modal.remove(); // 見つかった要素をすべて削除
    });
  } else {
    console.warn('削除対象のモーダル要素が見つかりませんでした');
  }

  // スクロールロックの解除
  document.body.style.overflow = '';
}

// ==================== 保存処理の二重実行防止・タイムアウト ====================
let _saveTimer = null;

function lockSaveButton(btnEl) {
  if (!btnEl) return;
  btnEl.disabled = true;
  btnEl.dataset.originalText = btnEl.innerHTML;
  btnEl.innerHTML = '<i class="ph-bold ph-spinner"></i>　処理中…';
}

function unlockSaveButton(btnEl) {
  if (!btnEl) return;
  btnEl.disabled = false;
  btnEl.innerHTML = btnEl.dataset.originalText || '保存';
}

async function withSaveGuard(btnEl, asyncFn) {
  if (btnEl?.disabled) return; // 二重押し防止

  lockSaveButton(btnEl);

  // 5秒で「まだ処理中」のトースト
  const warnTimer = setTimeout(() => {
    showToast('⏳ まだ処理中です。しばらくお待ちください…', 'warning');
  }, 5000);

  // 10秒でタイムアウト
  let timedOut = false;
  const timeoutTimer = setTimeout(() => {
    timedOut = true;
    unlockSaveButton(btnEl);
    showToast('⚠️ タイムアウトしました。再度お試しください', 'warning');
  }, 10000);

  try {
    await asyncFn();
  } catch (e) {
    console.error(e);
  } finally {
    clearTimeout(warnTimer);
    clearTimeout(timeoutTimer);
    if (!timedOut) unlockSaveButton(btnEl);
  }
}

// ==================== トースト通知 ====================
function showToast(message, type = 'success', onClick = null) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  // ⭕️ 以前登録された古いクリックイベントを取り除く（重複・競合防止）
  if (toast._clickHandler) {
    toast.removeEventListener('click', toast._clickHandler);
    toast._clickHandler = null;
  }

  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cursor = onClick ? 'pointer' : 'default';

  // ⭕️ クリック処理がある場合のみ、addEventListenerで安全に登録
  if (onClick) {
    toast._clickHandler = () => {
      onClick();
      toast.classList.remove('show'); // タップされたら即座にトーストを閉じる
    };
    toast.addEventListener('click', toast._clickHandler);
  }

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

    // ✅ ステータスコードをチェック
    if (!res.ok) {
      throw new Error(`GitHub API エラー: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // ✅ レスポンスが正常か確認
    if (!data || !data.sha) {
      console.error('GitHub API レスポンス:', data);
      throw new Error('SHA取得失敗：レスポンスが不正です');
    }

    const latestSha = data.sha.substring(0, 7);
    const currentSha = sessionStorage.getItem('app-version');

    // 日時表示更新
    const el = document.getElementById('last-updated');
    if (el) {
      const date = new Date(data.commit.committer.date);
      const formatted = `${date.getFullYear()}/${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
      
      const commitMessage = data.commit.message.split('\n')[0];
      
      el.innerHTML = `最終更新：${formatted}<br>${latestSha}<br>${commitMessage}`;
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
    console.error('更新確認エラー:', e);
    showToast(`⚠️ 更新確認に失敗しました: ${e.message}`, 'warning');
  }
}
// ==================== スワイプ処理 ====================
// ==================== スワイプ・月切り替え処理 ====================
let touchStartX = 0;
// スワイプ開始時の処理
function handleTouchStart(e) {
  touchStartX = e.touches[0].clientX;
}
// スワイプ終了時の処理
function handleTouchEnd(e) {
  const diff = touchStartX - e.changedTouches[0].clientX;
  if (Math.abs(diff) < 50) return;
  if (diff > 0) {
    changeMonth(1);  // 左スワイプ（翌月へ）
  } else {
    changeMonth(-1); // 右スワイプ（前月へ）
  }
}





// ==================== ナビ設定画面 ====================
function renderNavSettings() {
  const tmplNavSettings = document.getElementById('tmpl-nav-settings');
  if (!tmplNavSettings) return document.createElement('div');

  const clone = tmplNavSettings.content.cloneNode(true);

  const bottomListContainer = clone.querySelector('.bottom-nav-list');
  const drawerListContainer = clone.querySelector('.drawer-nav-list');

  // 1. ボトムナビ一覧の動的生成
  const tmplBottomItem = document.getElementById('tmpl-nav-setting-bottom-item');
  if (tmplBottomItem && bottomListContainer) {
    navSettings.bottomNav.forEach((n, i) => {
      const item = ALL_NAV_ITEMS.find(it => it.id === n.id);
      if (!item) return;

      const itemClone = tmplBottomItem.content.cloneNode(true);

      // チェックボックス制御（addEventListenerに修正）
      const checkEl = itemClone.querySelector('.nav-visible-check');
      if (checkEl) {
        checkEl.checked = !!n.visible;
        if (item.required) checkEl.disabled = true;
        checkEl.addEventListener('change', () => toggleNavItem(i));
      }

      // アイコン・ラベル設定
      const iconEl = itemClone.querySelector('.nav-icon');
      if (iconEl && item.icon) {
        iconEl.className = `nav-icon ph-bold ${item.icon}`;
      }

      const labelEl = itemClone.querySelector('.nav-label');
      if (labelEl) {
        labelEl.textContent = item.label || '';
      }

      // 上下移動ボタンの設定（addEventListenerに修正）
      const btnUp = itemClone.querySelector('.btn-up');
      const btnDown = itemClone.querySelector('.btn-down');

      if (btnUp) {
        if (i === 0) btnUp.disabled = true;
        btnUp.addEventListener('click', () => moveNavItem(i, -1));
      }

      if (btnDown) {
        if (i === navSettings.bottomNav.length - 1) btnDown.disabled = true;
        btnDown.addEventListener('click', () => moveNavItem(i, 1));
      }

      bottomListContainer.appendChild(itemClone);
    });
  }

  // 2. ドロワーメニュー一覧の動的生成
  const tmplDrawerItem = document.getElementById('tmpl-drawer-nav-item');
  if (tmplDrawerItem && drawerListContainer) {
    navSettings.drawerNav.forEach((n, i) => {
      const item = ALL_DRAWER_ITEMS.find(it => it.id === n.id);
      if (!item) return;

      const itemClone = tmplDrawerItem.content.cloneNode(true);

      // アイコン・ラベル設定
      const iconEl = itemClone.querySelector('.nav-icon');
      if (iconEl && item.icon) {
        iconEl.className = `nav-icon ph-bold ${item.icon}`;
      }

      const labelEl = itemClone.querySelector('.nav-label');
      if (labelEl) {
        labelEl.textContent = item.label || '';
      }

      // 上下移動ボタンの設定
      const btnUp = itemClone.querySelector('.btn-up');
      const btnDown = itemClone.querySelector('.btn-down');

      if (btnUp) {
        if (i === 0) btnUp.disabled = true;
        btnUp.addEventListener('click', () => moveDrawerItem(i, -1));
      }

      if (btnDown) {
        if (i === navSettings.drawerNav.length - 1) btnDown.disabled = true;
        btnDown.addEventListener('click', () => moveDrawerItem(i, 1));
      }

      drawerListContainer.appendChild(itemClone);
    });
  }

  return clone;
}

// -------------------- ナビ操作ロジック --------------------
function resetNavSettings() {
  localStorage.removeItem('nav-settings');
  navSettings = loadNavSettings();
  renderApp(); // 画面全体（ボトムナビ本体と画面中身）を再描画
  showToast('✅ ナビ設定をリセットしました');
}

function toggleNavItem(index) {
  navSettings.bottomNav[index].visible = !navSettings.bottomNav[index].visible;
  saveNavSettings(navSettings);
  renderApp();
}

function moveNavItem(index, direction) {
  const arr = navSettings.bottomNav;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  saveNavSettings(navSettings);
  renderApp();
}

function moveDrawerItem(index, direction) {
  const arr = navSettings.drawerNav;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  saveNavSettings(navSettings);
  renderApp();
}