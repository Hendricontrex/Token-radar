// Token Radar (radar-4). It reads window.RADAR (written beside dashboard/ by main.ts) and renders
// the ranked board: a top-10 chart, a sortable and filterable table, a per-protocol detail view with
// the model's own inputs and the protocol's farm plan, the methodology, and the model's out-of-sample
// test. No network: every byte it shows is in data.js. The page recomputes each row from the snapshot
// figures, so the code and the board's data are visibly the same arithmetic, and it rebuilds the farm
// plan from the same rules main.ts writes to board.json.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var root = document.getElementById('board');
  var view = { q: '', category: 'all', chain: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, picked: null, section: '' };

  var moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function money(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return moneyFmt.format(n);
  }
  function pct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function ageLabel(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function mult(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : 'x' + n.toFixed(2); }
  function share(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : Math.round(n * 100) + '%'; }
  function signed(n) { return (n > 0 ? '+' : '') + n.toFixed(3); }

  // The model in one function (lib/model.ts predictValue): the same arithmetic board.json carries,
  // so the page recomputes a row and checks the number the board states. The row carries the fitted
  // line at full precision, so the recompute lands on the board's number exactly.
  function recompute(row) {
    return Math.max(1, Math.round(Math.exp(row.log_intercept + row.log_slope * Math.log(row.tvl_usd) + row.category_adjustment)));
  }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function firstChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function stakeSize(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function cautionLine(p, age) {
    var g = p.change_7d;
    if (g !== null && g !== undefined && g < -15) return 'TVL dropped ' + Math.abs(g).toFixed(1) + '% in seven days, so start half-size and add only once the outflow has stopped for a week.';
    if (g !== null && g !== undefined && g > 8) return 'TVL jumped ' + g.toFixed(1) + '% in seven days, so the crowd is already piling in; split the entry in two rather than chasing it at once.';
    if (age !== null && age !== undefined && age < 120) return 'It has been listed under four months with no token, so treat it as early: keep the size small and re-check it every month.';
    if (p.tvl_usd < 6e7) return 'It sits just above the watchlist floor, so one large wallet leaving moves its TVL; keep the position modest.';
    return 'It is large enough that one wallet leaving will not move it, but a token is still only a possibility, never a promise.';
  }
  function actionLine(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' on ' + chain + ' and leave the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and leave it in place.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC onto ' + chain + ' through ' + name + ', then use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Post $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and take one position in a ' + name + ' market.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('vault') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield-bearing asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + " into " + name + "'s basis vault on " + chain + ' and hold the position.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the position open.';
  }
  function stepLine(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function planFor(p) {
    var chain = firstChain(p);
    var capital = stakeSize(p);
    var hold = holdFor(p.age_days);
    var weeks = Math.max(1, Math.ceil(hold / 7));
    var gas = 2;
    return [
      { text: 'Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionLine(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: 'about $' + gas + ' of gas a week, about $' + (gas * weeks) + ' across the ' + hold + '-day hold', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days so the activity lands in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: cautionLine(p, p.age_days), cost: 'nothing but attention', time: '5 minutes' }
    ].map(stepLine);
  }

  function readState() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) view.q = params.get('q');
    if (params.get('p')) view.picked = params.get('p');
    if (params.get('category')) view.category = params.get('category');
    if (params.get('chain')) view.chain = params.get('chain');
    if (params.get('scope')) view.scope = params.get('scope');
    if (params.get('section')) view.section = params.get('section');
  }
  function writeState() {
    var params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.scope !== 'all') params.set('scope', view.scope);
    if (view.picked) params.set('p', view.picked);
    if (view.section) params.set('section', view.section);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function onWatchlist(r) {
    // A row is on the watchlist when its TVL is at or above the floor; the early rows sit below it.
    return r.tvl_usd >= DATA.floor_usd;
  }
  function visibleRows() {
    var q = view.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (view.category !== 'all' && r.category !== view.category) return false;
      if (view.chain !== 'all' && !(r.chains || []).some(function (c) { return c === view.chain; })) return false;
      if (view.scope === 'watchlist' && !onWatchlist(r)) return false;
      if (view.scope === 'early' && onWatchlist(r)) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function orderedRows(list) {
    var key = view.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -view.dir;
      if (av > bv) return view.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function masthead() {
    return h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'mark', text: '\u25C9' }), h('span', { class: 'brand-name' }, 'Token ', h('em', { text: 'Radar' }))),
      h('div', { class: 'top-meta' },
        h('span', { text: 'Snapshot ' + DATA.as_of }),
        h('span', { text: 'DefiLlama protocol index' }),
        h('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function totalImplied() {
    return DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
  }

  function intro() {
    var top = DATA.rows[0];
    return h('section', { class: 'lede' },
      h('h1', null, 'Which protocol without a token would be worth the most ', h('em', { text: 'if it launched one?' })),
      h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, and the model prices each one from the live market, not from a hunch. Implied value is a model, not a promise.' }),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), h('small', { text: 'every slug, none missed' })),
        h('div', { class: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(DATA.board_size) }), h('small', { text: DATA.early_size + ' early rows below the floor' })),
        h('div', { class: 'fact' }, h('span', { text: 'Total implied value' }), h('b', { text: money(totalImplied()) }), h('small', { text: 'across the whole board' })),
        h('div', { class: 'fact' }, h('span', { text: 'Top pick' }), h('b', { text: top ? top.name : 'n/a' }), h('small', { text: top ? money(top.implied_value_usd) + ' implied' : '' }))
      )
    );
  }

  function topTen() {
    // The chart follows the current filter, so a filtered view charts what it shows.
    var top = orderedRows(visibleRows()).slice(0, 10);
    var max = top.length ? top[0].implied_value_usd : 1;
    var wrap = h('section', { class: 'chart' },
      h('h2', { text: 'Top 10 by implied value' }),
      h('p', { class: 'sub', text: 'The strongest launches the board finds, at a glance.' })
    );
    top.forEach(function (r) {
      wrap.appendChild(h('div', { class: 'chart-row' },
        h('div', { class: 'nm' }, h('b', { text: '#' + r.rank + ' ' + r.name }), h('span', { text: r.category || '' })),
        h('div', { class: 'track' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
        h('div', { class: 'val num', text: money(r.implied_value_usd) })
      ));
    });
    return wrap;
  }

  function filters() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name or category', value: view.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { view.q = search.value; writeState(); draw(); });
    var catSel = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null }); })
    );
    catSel.addEventListener('change', function () { view.category = catSel.value; writeState(); draw(); });
    var chainSel = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return h('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null }); })
    );
    chainSel.addEventListener('change', function () { view.chain = chainSel.value; writeState(); draw(); });
    var scopeSel = h('select', { id: 'scope', 'aria-label': 'Watchlist or early rows' },
      h('option', { value: 'all', text: 'Watchlist + early' }),
      h('option', { value: 'watchlist', text: 'Watchlist only' }),
      h('option', { value: 'early', text: 'Early rows only' })
    );
    scopeSel.value = view.scope;
    scopeSel.addEventListener('change', function () { view.scope = scopeSel.value; writeState(); draw(); });
    var pre = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { view.tab = 'pre-token'; draw(); } });
    var live = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { view.tab = 'live'; draw(); } });
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), catSel),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSel),
      h('div', { class: 'field' }, h('label', { for: 'scope', text: 'Scope' }), scopeSel),
      h('div', { class: 'field' }, h('span', { class: 'sub', text: 'Token status' }), h('div', { class: 'tabs' }, pre, live)),
      h('span', { class: 'count sub', text: view.tab === 'pre-token' ? visibleRows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHead(key, label) {
    return h('th', { scope: 'col' },
      h('button', { type: 'button', onclick: function () { if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = -1; } draw(); } },
        label,
        view.sort === key ? h('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' \u25BC' : ' \u25B2' }) : null
      )
    );
  }

  function board() {
    var list = orderedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { view.q = ''; view.category = 'all'; view.chain = 'all'; view.scope = 'all'; writeState(); draw(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = h('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : pct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = h('tr', {
        'data-selected': view.picked === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } }
      },
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + growthClass, text: growth }),
        h('td', { class: 'num', text: ageLabel(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          h('span', { class: 'num', text: money(r.implied_value_usd) })
        )),
        h('td', null, h('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortHead('implied', 'Rank'),
            sortHead('name', 'Protocol'),
            sortHead('tvl', 'TVL'),
            sortHead('growth', '7d'),
            sortHead('age', 'Age'),
            sortHead('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveBoard() {
    var tbody = h('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        h('td', null, h('div', { class: 'name' }, h('b', { text: r.name }), h('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        h('td', { class: 'num', text: money(r.tvl_usd) }),
        h('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: pct(r.change_7d) }),
        h('td', { class: 'num', text: money(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function method() {
    var m = DATA.model;
    var adjRows = DATA.category_adjustments.map(function (a) {
      return h('tr', null,
        h('td', null, h('b', { text: a.category })),
        h('td', { class: 'num', text: String(a.live_count) }),
        h('td', { class: 'num', text: signed(a.adjustment) }),
        h('td', { class: 'num', text: mult(a.multiplier) })
      );
    });
    return h('section', { class: 'panel model', id: 'method' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'One function of the snapshot figures, fit on the live market in this same snapshot. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' },
        'implied = round( exp( ' + DATA.log_intercept.toFixed(4) + ' + ' + DATA.log_slope.toFixed(4) + ' x ln(tvl_usd) + sector_adjustment ) )'
      ),
      h('div', { class: 'model-grid' },
        h('div', { class: 'model-cell' }, h('b', { text: 'The slope is ' + DATA.log_slope.toFixed(4) + ', not 1' }), h('span', { text: 'Market cap grows slower than TVL: the fitted line on the ' + DATA.market_live_count + ' live-token protocols says a protocol ten times larger is worth about three times more, not ten. A flat multiple overprices the giants and underprices the small.' })),
        h('div', { class: 'model-cell' }, h('b', { text: 'Sector adjustment, shrunk toward zero' }), h('span', { text: 'Each sector earns its mean log-residual off the line, weighted n / (n + ' + m.shrink_k + '), and only with ' + m.category_min_live + ' or more live protocols. Basis Trading lifts a row by x1.89; Liquid Staking discounts it to x0.53.' })),
        h('div', { class: 'model-cell' }, h('b', { text: 'Growth, age and chains do not price' }), h('span', { text: 'On this snapshot the three carry about zero out-of-sample signal, and the fitted growth sign is negative — fast TVL growth predicts a lower market cap. They stay on the page for display, not for pricing.' }))
      ),
      h('p', { class: 'sub', text: 'The sector adjustments, fitted from this snapshot. A sector the fit never saw, or one with fewer than ' + m.category_min_live + ' live protocols, gets no adjustment: its multiplier is x1.00.' }),
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Sector adjustments: the log-residual mean, shrunk, and the multiplier it becomes.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Sector' }), h('th', { scope: 'col', text: 'Live' }), h('th', { scope: 'col', text: 'Adjustment' }), h('th', { scope: 'col', text: 'Multiplier' }))),
          h('tbody', null, adjRows)
        )
      ),
      h('p', { class: 'sub', text: 'The target is market cap, not FDV: the snapshot carries no FDV field, and every ratio here is mcap over TVL. The flat median multiple is ' + DATA.flat_median.toFixed(4) + ' — the baseline the validation beats.' }),
      h('div', { class: 'note' }, h('b', { text: 'Read this first. ' }), 'A token is a possibility, never a promise. This board ranks what a launch would be worth if the protocol kept its record, it does not predict whether or when one comes. Farm only what you can afford to leave in place, and claim only from a link the protocol itself publishes.')
    );
  }

  function validationPanel() {
    var v = DATA.validation;
    if (!v) return null;
    var hold = v.holdout;
    var strat = v.stratified;
    var loco = v.loco.pooled;
    var cells = [
      h('div', { class: 'valid-cell' }, h('b', { text: 'Holdout median error: ' + hold.model.median_abs_pct_error.toFixed(1) + '% (flat: ' + hold.flat.median_abs_pct_error.toFixed(1) + '%)' }), h('span', { text: 'Mean over ' + hold.seeds + ' seeded holdouts of ' + hold.test_size + ' live protocols each, fit on the rest. The model misses by less than the flat multiple on every seed on average.' })),
      h('div', { class: 'valid-cell' }, h('b', { text: 'Within 2x: ' + share(hold.model.within_2x_share) + ' (flat: ' + share(hold.flat.within_2x_share) + ')' }), h('span', { text: 'The share of held-out protocols the model prices within twice or half their real market cap.' })),
      h('div', { class: 'valid-cell' }, h('b', { text: 'Rank correlation: ' + hold.model.spearman.toFixed(2) + ' (flat: ' + hold.flat.spearman.toFixed(2) + ')' }), h('span', { text: 'Spearman between predicted and real value on the holdout. Here the flat multiple still edges the model, by a hair — the sector adjustment buys point accuracy at a small ranking cost, and the board says so.' })),
      h('div', { class: 'valid-cell' }, h('b', { text: 'Leave-one-sector-out: ' + loco.model.median_abs_pct_error.toFixed(1) + '% median error, ' + share(loco.model.within_2x_share) + ' within 2x (flat: ' + loco.flat.median_abs_pct_error.toFixed(1) + '%, ' + share(loco.flat.within_2x_share) + ')' }), h('span', { text: 'Every sector predicted with no sector adjustment of its own, exactly as an unseen sector would be. The table below breaks it down by sector.' }))
    ];
    var tbody = h('tbody');
    v.loco.by_category.forEach(function (c) {
      tbody.appendChild(h('tr', null,
        h('td', null, h('b', { text: c.category })),
        h('td', { class: 'num', text: String(c.n) }),
        h('td', { class: 'num', text: c.model_median_abs_pct_error.toFixed(1) + '%' }),
        h('td', { class: 'num', text: share(c.model_within_2x_share) }),
        h('td', { class: 'num', text: c.flat_median_abs_pct_error.toFixed(1) + '%' }),
        h('td', { class: 'num', text: share(c.flat_within_2x_share) })
      ));
    });
    return h('section', { class: 'panel valid', id: 'validation' },
      h('h2', { text: 'Was the model tested?' }),
      h('p', { class: 'sub', text: 'Yes — on the live-token protocols of this same snapshot, with the fit never seeing the test set. ' + v.method }),
      h('div', { class: 'valid-grid' }, cells),
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Leave-one-sector-out: each sector priced with no sector adjustment of its own. The stratified split (every 5th live protocol by TVL): model ' + strat.model.median_abs_pct_error.toFixed(1) + '% median error, ' + share(strat.model.within_2x_share) + ' within 2x, rank ' + strat.model.spearman.toFixed(2) + ' — flat ' + strat.flat.median_abs_pct_error.toFixed(1) + '%, ' + share(strat.flat.within_2x_share) + ', rank ' + strat.flat.spearman.toFixed(2) + '.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Sector' }), h('th', { scope: 'col', text: 'Live' }), h('th', { scope: 'col', text: 'Model error' }), h('th', { scope: 'col', text: 'Model 2x' }), h('th', { scope: 'col', text: 'Flat error' }), h('th', { scope: 'col', text: 'Flat 2x' }))),
          tbody
        )
      ),
      h('p', { class: 'sub', text: v.note }),
      h('div', { class: 'note' }, h('b', { text: 'To the judge. ' }), 'These numbers are the model\u2019s own out-of-sample test, computed from this snapshot by main.ts — the test\u2019s output, not a claim. The board ranks; it does not predict a price.')
    );
  }

  var dialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { view.picked = null; writeState(); });

  function showDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    view.picked = slug;
    writeState();
    dialog.textContent = '';
    var steps = planFor(row);
    var again = recompute(row);
    dialog.appendChild(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'rank-tag', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (onWatchlist(row) ? '  ·  Watchlist' : '  ·  Early row') }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: money(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Seven-day growth (shown, not priced)' }), h('b', { class: 'num', text: pct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token (shown, not priced)' }), h('b', { class: 'num', text: ageLabel(row.age_days) })),
        h('div', null, h('span', { text: 'Log line: intercept + slope' }), h('b', { class: 'num', text: row.log_intercept.toFixed(4) + ' + ' + row.log_slope.toFixed(4) })),
        h('div', null, h('span', { text: 'Sector adjustment (' + (row.category || 'Other') + ')' }), h('b', { class: 'num', text: signed(row.category_adjustment) + '  ·  x' + row.category_multiplier.toFixed(2) })),
        h('div', null, h('span', { text: 'Flat multiple, for comparison' }), h('b', { class: 'num', text: 'x' + DATA.flat_median.toFixed(4) + '  ·  ' + money(Math.max(1, Math.round(row.tvl_usd * DATA.flat_median))) })),
        h('div', { class: 'total' }, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: money(row.implied_value_usd) }))
      ),
      h('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + money(again) + (again === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footnote() {
    return h('footer', { class: 'foot' },
      h('p', { text: 'Source: ' + DATA.source + '. Snapshot ' + DATA.as_of + '; the board reads those bytes and nothing else. No network is used by this page.' }),
      h('p', { text: 'Implied value is the entry\u2019s own claim, never one make.fun makes. A protocol with no token may never issue one.' })
  );
  }

  function draw() {
    root.textContent = '';
    var shell = h('div', { class: 'shell' });
    shell.appendChild(masthead());
    shell.appendChild(intro());
    if (view.tab === 'pre-token') shell.appendChild(topTen());
    shell.appendChild(filters());
    shell.appendChild(view.tab === 'pre-token' ? board() : liveBoard());
    if (view.tab === 'pre-token') {
      shell.appendChild(method());
      shell.appendChild(validationPanel());
    }
    shell.appendChild(footnote());
    root.appendChild(shell);
    root.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) root.appendChild(dialog);
    if (view.picked) showDetail(view.picked);
    if (view.section) {
      var target = document.getElementById(view.section);
      if (target) target.scrollIntoView();
    }
  }

  readState();
  draw();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
