/* ── 오늘의 경제 · 앱 셸 ──────────────────────────────────────
   data/latest.json 을 읽어 시황·뉴스 두 탭으로 렌더링합니다.
   스키마는 README.md 의 "데이터 스키마" 절을 참고하세요.
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var DATA_URL = 'data/latest.json';
  var INDEX_URL = 'data/index.json';
  var CACHE_KEY = 'dailybrief.payload.v1';
  var TAB_KEY = 'dailybrief.tab';
  var DISMISS_KEY = 'dailybrief.install.dismissed';

  var $ = function (id) { return document.getElementById(id); };
  var views = { market: $('view-market'), news: $('view-news'), archive: $('view-archive') };
  var scrollPos = { market: 0, news: 0, archive: 0 };
  var current = 'market';
  var payload = null;
  var archiveIndex = null;
  var viewingDate = null; // 지난 호를 보고 있을 때의 날짜

  /* ── 안전한 인라인 마크업 ──────────────────────────────────
     본문에는 <b> <span class="up"> 정도의 강조만 허용하고
     나머지 태그·속성은 전부 떨어냅니다.                        */
  var OK_TAG = { B: 1, STRONG: 1, EM: 1, I: 1, SMALL: 1, BR: 1, SPAN: 1, SUP: 1, SUB: 1 };
  var OK_CLASS = { up: 1, down: 1, flat: 1, num: 1, muted: 1 };

  function clean(node, out) {
    for (var n = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { out.appendChild(document.createTextNode(n.data)); continue; }
      if (n.nodeType !== 1) continue;
      if (!OK_TAG[n.tagName]) { clean(n, out); continue; }
      var el = document.createElement(n.tagName.toLowerCase());
      var cls = (n.getAttribute('class') || '').split(/\s+/).filter(function (c) { return OK_CLASS[c]; });
      if (cls.length) el.className = cls.join(' ');
      clean(n, el);
      out.appendChild(el);
    }
    return out;
  }

  function rich(target, html) {
    target.textContent = '';
    if (html == null) return target;
    var box = document.createElement('div');
    box.innerHTML = String(html);
    clean(box, target);
    return target;
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function dirClass(d) { return d === 'up' ? 'up' : d === 'down' ? 'down' : 'flat'; }

  function catVar(accent) {
    return /^c[1-5]$/.test(String(accent || '')) ? 'var(--' + accent + ')' : 'var(--accent)';
  }

  /* ── 블록 렌더러 ─────────────────────────────────────────── */
  var BLOCK = {
    p: function (b) {
      return rich(el('p', 'blk'), b.text);
    },

    bullets: function (b) {
      var ul = el('ul', 'blk');
      (b.items || []).forEach(function (it) { ul.appendChild(rich(el('li'), it)); });
      return ul;
    },

    callout: function (b) {
      return rich(el('div', 'blk callout'), b.text);
    },

    kpis: function (b) {
      var wrap = el('div', 'blk kpis');
      (b.items || []).forEach(function (k) {
        var box = el('div', 'kpi');
        box.appendChild(el('span', 'n', k.label));
        box.appendChild(el('span', 'v', k.value));
        if (k.delta) box.appendChild(el('span', 'd ' + dirClass(k.dir), k.delta));
        wrap.appendChild(box);
      });
      return wrap;
    },

    stats: function (b) {
      var wrap = el('div', 'blk stats');
      (b.items || []).forEach(function (s) {
        var box = el('div', 'stat');
        box.appendChild(el('span', 'lbl', s.label));
        box.appendChild(el('span', 'v', s.value));
        if (s.delta) box.appendChild(el('span', 'd ' + dirClass(s.dir), s.delta));
        wrap.appendChild(box);
      });
      return wrap;
    },

    table: function (b) {
      var wrap = el('div', 'blk tbl-wrap');
      var t = el('table');
      if (b.head && b.head.length) {
        var tr = el('tr');
        b.head.forEach(function (h, i) {
          tr.appendChild(el('th', b.numeric && b.numeric.indexOf(i) > -1 ? 'num' : null, h));
        });
        t.appendChild(tr);
      }
      (b.rows || []).forEach(function (row) {
        var tr = el('tr');
        row.forEach(function (cell, i) {
          var isNum = b.numeric && b.numeric.indexOf(i) > -1;
          var td = el('td', isNum ? 'num' : null);
          if (cell && typeof cell === 'object') {
            td.className = (isNum ? 'num ' : '') + dirClass(cell.dir);
            td.textContent = cell.text;
          } else {
            rich(td, cell);
          }
          tr.appendChild(td);
        });
        t.appendChild(tr);
      });
      wrap.appendChild(t);
      return wrap;
    },

    hbar: function (b) {
      var fig = el('div', 'blk figure');
      if (b.caption) fig.appendChild(el('p', 'cap', b.caption));
      var box = el('div', 'hbar');
      var rows = b.rows || [];
      var max = 0;
      rows.forEach(function (r) { max = Math.max(max, Math.abs(Number(r.magnitude != null ? r.magnitude : 0))); });
      rows.forEach(function (r) {
        var row = el('div', 'row');
        row.appendChild(el('span', 'lb', r.label));
        var track = el('span', 'track');
        var fill = el('i', 'fill');
        var pct = r.pct != null ? Number(r.pct)
          : (max > 0 ? Math.abs(Number(r.magnitude || 0)) / max * 100 : 0);
        fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
        // 등락(빨강/파랑)이 없는 지표는 분야 색으로 그린다
        fill.style.background = r.accent ? catVar(r.accent)
          : r.dir === 'down' ? 'var(--down)' : r.dir === 'up' ? 'var(--up)' : 'var(--flat)';
        if (r.fade) fill.style.opacity = String(r.fade);
        track.appendChild(fill);
        row.appendChild(track);
        row.appendChild(el('span', 'vl ' + dirClass(r.dir), r.value));
        box.appendChild(row);
      });
      fig.appendChild(box);
      return fig;
    },

    timeline: function (b) {
      var ul = el('ul', 'blk tl');
      (b.items || []).forEach(function (it) {
        var li = el('li', it.done ? 'on' : null);
        li.appendChild(el('span', 'when', it.when));
        li.appendChild(rich(el('span', 'what'), it.what));
        ul.appendChild(li);
      });
      return ul;
    },

    terms: function (b) {
      var wrap = el('div', 'blk terms');
      (b.items || []).forEach(function (t) {
        var box = el('div', 'tg');
        box.style.setProperty('--cat', catVar(t.accent));
        box.appendChild(el('b', null, t.word));
        box.appendChild(rich(el('span'), t.desc));
        wrap.appendChild(box);
      });
      return wrap;
    },

    term: function (b) {
      var box = el('div', 'blk term');
      box.appendChild(el('b', null, b.word));
      rich(box.appendChild(el('span')), b.desc);
      return box;
    },

    caption: function (b) {
      return el('p', 'blk cap', b.text);
    },

    photo: function (b) {
      return photoFigure(b);
    }
  };

  /* 사진 — photos/ 라이브러리의 이미지를 캡션과 함께 보여준다 */
  function photoFigure(spec, cls) {
    if (!spec || !spec.src) return null;
    var fig = el('figure', 'blk photo' + (cls ? ' ' + cls : ''));
    var img = document.createElement('img');
    img.src = spec.src;
    img.alt = spec.alt || '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // 파일이 없어도 레이아웃이 깨지지 않게 통째로 걷어낸다
    img.addEventListener('error', function () { fig.remove(); });
    fig.appendChild(img);
    if (spec.caption || spec.credit) {
      var cap = el('figcaption');
      if (spec.caption) cap.appendChild(document.createTextNode(spec.caption));
      // CC 라이선스 사진은 저작자·라이선스 표기가 의무다
      if (spec.credit) cap.appendChild(el('span', 'credit', spec.credit));
      fig.appendChild(cap);
    }
    return fig;
  }

  function renderBlocks(host, blocks) {
    (blocks || []).forEach(function (b) {
      var fn = BLOCK[b && b.type];
      if (fn) { try { host.appendChild(fn(b)); } catch (e) { /* 잘못된 블록은 건너뜀 */ } }
    });
  }

  /* ── 탭 한 개 렌더 ───────────────────────────────────────── */
  function renderTab(host, tab) {
    host.textContent = '';
    if (!tab) {
      host.appendChild(emptyState('내용이 없습니다', '이 날짜에는 해당 섹션이 없어요.'));
      return;
    }

    var mast = el('div', 'mast');
    if (tab.kicker) mast.appendChild(el('div', 'kicker', tab.kicker));
    if (tab.title) mast.appendChild(rich(el('h1'), tab.title));
    if (tab.subtitle) mast.appendChild(el('p', 'sub', tab.subtitle));
    if (tab.stamp && tab.stamp.length) {
      var stamp = el('div', 'stamp');
      tab.stamp.forEach(function (s) { stamp.appendChild(el('span', null, s)); });
      mast.appendChild(stamp);
    }
    host.appendChild(mast);

    if (tab.ticker && tab.ticker.length) {
      var tk = el('div', 'ticker');
      tab.ticker.forEach(function (t) {
        var c = el('div', 'tick');
        c.appendChild(el('span', 'lbl', t.label));
        c.appendChild(el('span', 'v', t.value));
        if (t.delta) c.appendChild(el('span', 'd ' + dirClass(t.dir), t.delta));
        tk.appendChild(c);
      });
      host.appendChild(tk);
    }

    if (tab.hero) {
      var hero = el('div', 'hero');
      if (tab.hero.tier) hero.appendChild(el('div', 'tier', tab.hero.tier));
      if (tab.hero.headline) hero.appendChild(rich(el('h2'), tab.hero.headline));
      if (tab.hero.image) {
        var heroFig = photoFigure(tab.hero.image, 'photo-hero');
        if (heroFig) hero.appendChild(heroFig);
      }
      if (tab.hero.lead) hero.appendChild(rich(el('p'), tab.hero.lead));
      if (tab.hero.kpis && tab.hero.kpis.length) {
        hero.appendChild(BLOCK.kpis({ items: tab.hero.kpis }));
      }
      host.appendChild(hero);
    }

    (tab.sections || []).forEach(function (sec) {
      if (sec.style === 'card') { host.appendChild(renderCard(sec)); return; }
      var s = el('section', 'sec');
      if (sec.title) {
        var head = el('div', 'sec-head');
        if (sec.no) head.appendChild(el('span', 'no', sec.no));
        head.appendChild(el('h3', null, sec.title));
        if (sec.note) head.appendChild(el('span', 'note', sec.note));
        s.appendChild(head);
      }
      if (sec.accent) s.style.setProperty('--cat', catVar(sec.accent));
      renderBlocks(s, sec.blocks);
      host.appendChild(s);
    });

    if (tab.footer && tab.footer.length) {
      var foot = el('div', 'foot');
      tab.footer.forEach(function (line) { foot.appendChild(rich(el('p'), line)); });
      host.appendChild(foot);
    }
  }

  function renderCard(sec) {
    var art = el('article', 'card');
    art.style.setProperty('--cat', catVar(sec.accent));
    art.appendChild(el('div', 'accent'));
    var body = el('div', 'body');
    if (sec.tag || sec.no) {
      var row = el('div', 'tagrow');
      row.appendChild(el('span', 'tag', sec.tag || ''));
      if (sec.no) row.appendChild(el('span', 'n', sec.no));
      body.appendChild(row);
    }
    if (sec.title) body.appendChild(rich(el('h4'), sec.title));
    if (sec.image) {
      var fig = photoFigure(sec.image, 'photo-card');
      if (fig) body.appendChild(fig);
    }
    renderBlocks(body, sec.blocks);
    art.appendChild(body);
    return art;
  }

  function emptyState(title, msg, actionLabel, action) {
    var box = el('div', 'state');
    box.appendChild(el('div', 'big', '📰'));
    box.appendChild(el('b', null, title));
    box.appendChild(el('p', null, msg));
    if (actionLabel) {
      var b = el('button', 'btn', actionLabel);
      b.type = 'button';
      b.addEventListener('click', action);
      box.appendChild(b);
    }
    return box;
  }

  function skeleton(host) {
    host.textContent = '';
    [[70, 26], [100, 92], [100, 150], [100, 150]].forEach(function (dim) {
      var s = el('div', 'skel');
      s.style.width = dim[0] + '%';
      s.style.height = dim[1] + 'px';
      s.style.marginBottom = '14px';
      host.appendChild(s);
    });
  }

  /* ── 데이터 적용 ─────────────────────────────────────────── */
  function tabOf(data, id) {
    return (data && data.tabs || []).filter(function (t) { return t.id === id; })[0] || null;
  }

  function apply(data, opts) {
    payload = data;
    renderTab(views.market, tabOf(data, 'market'));
    renderTab(views.news, tabOf(data, 'news'));

    var sub = [];
    if (data.issueDate) sub.push(data.issueDate);
    if (data.updatedLabel) sub.push(data.updatedLabel);
    $('brandSub').textContent = sub.join(' · ') || '최신 브리핑';
    $('brandName').textContent = viewingDate ? '지난 호 · ' + viewingDate : '오늘의 경제';

    if (opts && opts.stale) {
      showSync('저장된 내용을 보고 있어요 — 새 브리핑을 확인하는 중…');
    } else {
      hideSync();
    }
  }

  function cacheSave(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function cacheLoad() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function fetchJSON(url) {
    return fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  var loading = false;

  function load(opts) {
    if (loading) return Promise.resolve();
    loading = true;
    var btn = $('refreshBtn');
    btn.classList.add('is-busy');

    return fetchJSON(DATA_URL)
      .then(function (data) {
        viewingDate = null;
        cacheSave(data);
        apply(data);
        if (opts && opts.toast) toast('최신 브리핑을 불러왔어요');
        renderArchive();
      })
      .catch(function (err) {
        var cached = cacheLoad();
        if (cached) {
          apply(cached, { stale: false });
          showSync('오프라인 — 마지막으로 받은 브리핑을 보고 있어요');
        } else {
          views.market.textContent = '';
          views.market.appendChild(emptyState(
            '브리핑을 불러오지 못했어요',
            '네트워크를 확인한 뒤 다시 시도해 주세요. (' + err.message + ')',
            '다시 시도', function () { load({ toast: true }); }
          ));
          views.news.textContent = '';
          views.news.appendChild(emptyState('브리핑을 불러오지 못했어요', '시황 탭에서 다시 시도해 주세요.'));
        }
      })
      .then(function () {
        loading = false;
        btn.classList.remove('is-busy');
      });
  }

  /* ── 지난 호 ─────────────────────────────────────────────── */
  function renderArchive() {
    var host = views.archive;
    host.textContent = '';

    var mast = el('div', 'mast');
    mast.appendChild(el('div', 'kicker', 'Archive'));
    mast.appendChild(el('h1', null, '지난 호'));
    mast.appendChild(el('p', 'sub', '날짜를 누르면 그날의 시황·뉴스로 바뀝니다.'));
    host.appendChild(mast);

    var list = el('div', 'arch');
    host.appendChild(list);

    var todayBtn = el('button', 'arch-item' + (viewingDate ? '' : ' is-on'));
    todayBtn.type = 'button';
    todayBtn.appendChild(el('span', 'd', (payload && payload.date) || '최신'));
    todayBtn.appendChild(el('span', 't', (payload && payload.headline) || '오늘의 브리핑'));
    todayBtn.appendChild(el('span', 'arch-badge', '최신'));
    todayBtn.addEventListener('click', function () { load({ toast: false }).then(function () { switchTab('market'); }); });
    list.appendChild(todayBtn);

    function paint(items) {
      items.forEach(function (it) {
        if (payload && it.date === payload.date && !viewingDate) return;
        var b = el('button', 'arch-item' + (viewingDate === it.date ? ' is-on' : ''));
        b.type = 'button';
        b.appendChild(el('span', 'd', it.date));
        b.appendChild(el('span', 't', it.headline || ''));
        b.addEventListener('click', function () { openArchive(it); });
        list.appendChild(b);
      });
      if (!items.length) {
        list.appendChild(emptyState('지난 호가 아직 없어요', '내일 아침부터 하나씩 쌓입니다.'));
      }
    }

    if (archiveIndex) { paint(archiveIndex); return; }
    fetchJSON(INDEX_URL)
      .then(function (idx) {
        archiveIndex = (idx && idx.issues || []).slice().sort(function (a, b) {
          return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
        });
        paint(archiveIndex);
      })
      .catch(function () {
        list.appendChild(emptyState('목록을 불러오지 못했어요', '오프라인이거나 아직 지난 호가 없습니다.'));
      });
  }

  function openArchive(item) {
    var url = item.file || ('data/archive/' + item.date + '.json');
    toast(item.date + ' 브리핑을 여는 중…');
    fetchJSON(url)
      .then(function (data) {
        viewingDate = item.date;
        apply(data);
        showSync('지난 호(' + item.date + ')를 보고 있어요 — 새로고침하면 최신으로 돌아갑니다');
        switchTab('market');
      })
      .catch(function () { toast('그날 브리핑을 불러오지 못했어요'); });
  }

  /* ── 탭 전환 ─────────────────────────────────────────────── */
  function switchTab(id) {
    if (!views[id]) return;
    scrollPos[current] = window.scrollY;
    current = id;
    Object.keys(views).forEach(function (k) {
      views[k].hidden = k !== id;
      var t = $('tab-' + k);
      t.classList.toggle('is-on', k === id);
      t.setAttribute('aria-selected', String(k === id));
    });
    if (id === 'archive') renderArchive();
    try { sessionStorage.setItem(TAB_KEY, id); } catch (e) {}
    window.scrollTo({ top: scrollPos[id] || 0, behavior: 'instant' });
  }

  /* ── 알림 ────────────────────────────────────────────────── */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function showSync(msg) { var s = $('sync'); s.textContent = msg; s.hidden = false; }
  function hideSync() { $('sync').hidden = true; }

  /* ── 설치 배너 ───────────────────────────────────────────── */
  function initInstall() {
    var banner = $('install');
    var btn = $('installBtn');
    var deferred = null;
    var dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) {}
    var standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    if (dismissed || standalone) return;

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferred = e;
      btn.hidden = false;
      banner.hidden = false;
    });

    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      $('installHint').textContent = '공유 버튼 → "홈 화면에 추가"를 누르세요.';
      banner.hidden = false;
    }

    btn.addEventListener('click', function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; banner.hidden = true; });
    });

    $('installClose').addEventListener('click', function () {
      banner.hidden = true;
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) {}
    });

    window.addEventListener('appinstalled', function () {
      banner.hidden = true;
      toast('홈 화면에 추가됐어요');
    });
  }

  /* ── 시작 ────────────────────────────────────────────────── */
  function init() {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.addEventListener('click', function () { switchTab(t.dataset.tab); });
    });
    $('refreshBtn').addEventListener('click', function () { load({ toast: true }); });

    var params = new URLSearchParams(location.search);
    var start = params.get('tab');
    if (!start) { try { start = sessionStorage.getItem(TAB_KEY); } catch (e) {} }
    if (start && views[start]) switchTab(start);

    var cached = cacheLoad();
    if (cached) apply(cached, { stale: true });
    else { skeleton(views.market); skeleton(views.news); }

    load({ toast: false });

    // 앱으로 돌아왔을 때 하루가 지났으면 자동으로 새 브리핑 확인
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || viewingDate) return;
      var last = payload && payload.date;
      var today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
      if (last !== today) load({ toast: false });
    });

    initInstall();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
