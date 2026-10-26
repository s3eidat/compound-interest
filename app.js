/* Compound Interest — month-by-month projection, computed locally. */
(function () {
  "use strict";
  var $ = S3.$, $$ = S3.$$;
  var KEY = "ci.v1";
  var FREQ = { "1": "yearly", "2": "half-yearly", "4": "quarterly", "12": "monthly", "365": "daily", "0": "continuously" };
  var state = { timing: "end", res: null, inp: null };

  function num(v) {
    v = String(v == null ? "" : v)
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 0x6F0; })
      .replace(/٫/g, ".").replace(/[,\s_٬]/g, "");
    return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) ? parseFloat(v) : NaN;
  }

  // Effective rate per month for a nominal annual rate compounded `freq` times a year (0 = continuously).
  function monthlyRate(annual, freq) {
    var r = annual / 100;
    if (freq === 0) return Math.exp(r / 12) - 1;
    return Math.pow(1 + r / freq, freq / 12) - 1;
  }

  // Returns one row per year: deposits, interest and balance (plus real value when inflation is set).
  function project(o) {
    var rm = monthlyRate(o.rate, o.freq), bal = o.initial, dep = o.initial, rows = [];
    var months = Math.round(o.years * 12);
    var yDep = 0, yInt = 0;
    for (var m = 1; m <= months; m++) {
      if (o.timing === "start") { bal += o.monthly; dep += o.monthly; yDep += o.monthly; }
      var i = bal * rm; bal += i; yInt += i;
      if (o.timing !== "start") { bal += o.monthly; dep += o.monthly; yDep += o.monthly; }
      if (m % 12 === 0 || m === months) {
        var y = m / 12;
        rows.push({ year: Math.ceil(y), months: m, deposits: yDep, interest: yInt, totalDep: dep, balance: bal,
          real: o.inflation ? bal / Math.pow(1 + o.inflation / 100, y) : bal });
        yDep = 0; yInt = 0;
      }
    }
    var last = rows[rows.length - 1] || { balance: o.initial, totalDep: o.initial, real: o.initial };
    return { rows: rows, balance: last.balance, deposits: last.totalDep, interest: last.balance - last.totalDep, real: last.real };
  }

  function money(v) { return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function yearsLabel(y) { return (+y.toFixed(2)) + (y === 1 ? " year" : " years"); }

  // ---------- chart ----------
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p;
    var steps = [1, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; steps[i] < f - 1e-9; i++);
    return steps[i] * p;
  }
  function compact(v) { return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v); }

  function drawChart() {
    var cv = $("#chart"), W = cv.clientWidth, H = cv.clientHeight, dpr = window.devicePixelRatio || 1;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    var res = state.res;
    if (!res || !res.rows.length) return;
    var rows = res.rows, font = getComputedStyle(document.body).fontFamily;
    var pl = 46, pr = 10, pt = 10, pb = 24, cw = W - pl - pr, ch = H - pt - pb;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return Math.max(r.balance, r.totalDep); })));
    g.font = "11px " + font; g.textBaseline = "middle"; g.lineWidth = 1;
    for (var t = 0; t <= 4; t++) {
      var y = pt + ch - ch * t / 4;
      g.strokeStyle = cssVar("--line"); g.beginPath(); g.moveTo(pl, Math.round(y) + .5); g.lineTo(W - pr, Math.round(y) + .5); g.stroke();
      g.fillStyle = cssVar("--text-3"); g.textAlign = "right"; g.fillText(compact(max * t / 4), pl - 6, y);
    }
    var n = rows.length, slot = cw / n, bw = Math.max(2, Math.min(30, slot * 0.68));
    var every = Math.ceil(n / Math.max(1, Math.floor(cw / 40)));
    var cC = cssVar("--accent"), cG = cssVar("--coffee");
    rows.forEach(function (r, i) {
      var x = pl + slot * i + (slot - bw) / 2, gain = Math.max(0, r.balance - r.totalDep);
      var hc = Math.min(r.totalDep, r.balance) / max * ch, hg = gain / max * ch;
      g.fillStyle = cC; g.fillRect(x, pt + ch - hc, bw, hc);
      g.fillStyle = cG; g.fillRect(x, pt + ch - hc - hg, bw, hg);
      if (i % every === 0 || i === n - 1 && n < 8) { g.fillStyle = cssVar("--text-3"); g.textAlign = "center"; g.fillText(String(r.year), x + bw / 2, H - pb / 2 + 2); }
    });
    if (state.inp.inflation) {
      g.strokeStyle = cssVar("--text-2"); g.lineWidth = 2; g.lineJoin = "round"; g.beginPath();
      rows.forEach(function (r, i) {
        var x = pl + slot * i + slot / 2, y = pt + ch - r.real / max * ch;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      });
      g.stroke();
    }
  }

  // ---------- UI ----------
  function seg(el, value, onPick) {
    $$("button", el).forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.v === value));
      b.addEventListener("click", function () {
        $$("button", el).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        onPick(b.dataset.v);
      });
    });
  }
  function stat(label, value, cls) { return '<div class="stat ' + (cls || "") + '"><b>' + S3.esc(value) + "</b><span>" + S3.esc(label) + "</span></div>"; }
  function opt(id) { var v = $(id).value.trim(); return v ? num(v) : 0; }

  function read() {
    var o = { initial: opt("#initial"), monthly: opt("#monthly"), rate: num($("#rate").value), years: num($("#years").value),
      freq: +$("#freq").value, timing: state.timing, inflation: $("#infl-on").checked ? opt("#infl") : 0 };
    if (!(o.initial >= 0) || !(o.monthly >= 0)) return { err: "Amounts must be 0 or more." };
    if (!(o.initial > 0 || o.monthly > 0)) return { err: "Enter an initial deposit or a monthly contribution." };
    if (!(o.rate >= -50 && o.rate <= 100)) return { err: "Enter an annual rate between -50 and 100%." };
    if (!(o.years > 0 && o.years <= 100) || o.years * 12 < 1) return { err: "Enter between 1 month (0.09) and 100 years." };
    if (!(o.inflation > -50 && o.inflation < 100)) return { err: "Enter an inflation rate below 100%." };
    return o;
  }

  function save() {
    S3.store(KEY, { initial: $("#initial").value, monthly: $("#monthly").value, rate: $("#rate").value, years: $("#years").value,
      freq: $("#freq").value, timing: state.timing, inflOn: $("#infl-on").checked, infl: $("#infl").value });
  }

  function render() {
    save();
    $("#infl-wrap").hidden = !$("#infl-on").checked;
    var o = read();
    $("#err").textContent = o.err || "";
    if (o.err) {
      state.res = null; $("#stats").innerHTML = ""; $("#split").hidden = true;
      $("#table").innerHTML = '<tr><td class="empty"><b>Nothing to show yet</b>Fill in your savings plan.</td></tr>';
      drawChart(); return;
    }
    var res = project(o);
    state.res = res; state.inp = o;
    $("#yrs-lbl").textContent = yearsLabel(o.years);
    $("#stats").innerHTML = stat("final balance", money(res.balance), "main") +
      stat("your deposits", money(res.deposits)) +
      stat("interest earned", money(res.interest)) +
      (o.inflation ? stat("in today's money", money(res.real)) : stat("growth", res.deposits ? "×" + (res.balance / res.deposits).toFixed(2) : "—"));
    var sp = $("#split"), share = res.balance > 0 ? Math.max(0, Math.min(1, res.deposits / res.balance)) : 1;
    sp.hidden = false; sp.children[0].style.flexGrow = share; sp.children[1].style.flexGrow = 1 - share;
    $("#leg-real").hidden = !o.inflation;
    drawChart();
    $("#table").innerHTML = "<thead><tr><th>Year</th><th class=\"num\">Deposits</th><th class=\"num\">Interest</th><th class=\"num\">Total deposits</th><th class=\"num\">Total interest</th><th class=\"num\">Balance</th>" +
      (o.inflation ? '<th class="num">Today\'s money</th>' : "") + "</tr></thead><tbody>" +
      res.rows.map(function (r) {
        return "<tr><td>" + r.year + '</td><td class="num">' + money(r.deposits) + '</td><td class="num">' + money(r.interest) + '</td><td class="num">' +
          money(r.totalDep) + '</td><td class="num">' + money(r.balance - r.totalDep) + '</td><td class="num"><b>' + money(r.balance) + "</b></td>" +
          (o.inflation ? '<td class="num">' + money(r.real) + "</td>" : "") + "</tr>";
      }).join("") + "</tbody>";
  }

  function summary() {
    var o = state.inp, r = state.res;
    return "Initial " + money(o.initial) + " + " + money(o.monthly) + "/month at " + o.rate + "% (compounded " + FREQ[String(o.freq)] + ") for " + yearsLabel(o.years) + "\n" +
      "Final balance: " + money(r.balance) + "\nYour deposits: " + money(r.deposits) + "\nInterest earned: " + money(r.interest) +
      (o.inflation ? "\nIn today's money (" + o.inflation + "% inflation): " + money(r.real) : "");
  }

  // ---------- wiring ----------
  var s = S3.store(KEY) || {};
  $("#initial").value = s.initial != null ? s.initial : "10,000";
  $("#monthly").value = s.monthly != null ? s.monthly : "200";
  $("#rate").value = s.rate != null ? s.rate : "7";
  $("#years").value = s.years != null ? s.years : "20";
  $("#freq").value = FREQ[s.freq] ? s.freq : "12";
  $("#infl-on").checked = !!s.inflOn;
  $("#infl").value = s.infl != null ? s.infl : "3";
  state.timing = s.timing === "start" ? "start" : "end";

  seg($("#timing"), state.timing, function (v) { state.timing = v; render(); });
  $$("#initial, #monthly, #rate, #years, #infl").forEach(function (el) { el.addEventListener("input", render); });
  $$("#freq, #infl-on").forEach(function (el) { el.addEventListener("change", render); });
  $("#copy").addEventListener("click", function () {
    if (!state.res) return S3.toast("Fill in your plan first", "error");
    S3.copy(summary()); S3.done();
  });
  $("#csv").addEventListener("click", function () {
    if (!state.res) return S3.toast("Fill in your plan first", "error");
    var lines = ["Year,Deposits,Interest,Total deposits,Total interest,Balance" + (state.inp.inflation ? ",Today's money" : "")];
    state.res.rows.forEach(function (r) {
      lines.push([r.year, r.deposits.toFixed(2), r.interest.toFixed(2), r.totalDep.toFixed(2), (r.balance - r.totalDep).toFixed(2), r.balance.toFixed(2)]
        .concat(state.inp.inflation ? [r.real.toFixed(2)] : []).join(","));
    });
    S3.download(lines.join("\n") + "\n", "compound-interest.csv", "text/csv"); S3.done();
  });
  if (window.ResizeObserver) new ResizeObserver(S3.debounce(drawChart, 60)).observe($("#chart"));
  new MutationObserver(drawChart).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  render();

  window.S3_DEMO = function () {
    $("#initial").value = "10,000"; $("#monthly").value = "300"; $("#rate").value = "7"; $("#years").value = "25";
    $("#freq").value = "12"; $("#infl-on").checked = true; $("#infl").value = "3";
    $("#timing button[data-v=end]").click();
  };

  window.S3_SELFTEST = function () {
    function near(a, b) { return Math.abs(a - b) < 0.006; }
    var base = { initial: 0, monthly: 0, rate: 5, years: 10, freq: 1, timing: "end", inflation: 0 };
    function P(o) { var x = {}; for (var k in base) x[k] = base[k]; for (k in o) x[k] = o[k]; return project(x); }
    return near(P({ initial: 10000 }).balance, 16288.95) &&                 // 10,000 @ 5% yearly, 10y
      near(P({ initial: 10000, freq: 12 }).balance, 16470.09) &&            // monthly compounding
      near(P({ initial: 1000, rate: 100, years: 1, freq: 0 }).balance, 2718.28) && // continuous → e
      near(P({ monthly: 100, rate: 6, freq: 12 }).balance, 16387.93) &&     // annuity, end of month
      near(P({ monthly: 100, rate: 6, freq: 12, timing: "start" }).balance, 16469.87) && // annuity due
      P({ monthly: 100, rate: 0 }).balance === 12000 &&                     // 0% is just deposits
      P({ monthly: 100, rate: 6, freq: 12 }).rows.length === 10 &&
      near(P({ initial: 1000, rate: 0, inflation: 2 }).real, 1000 / Math.pow(1.02, 10)) &&
      P({ initial: 500, years: 1.5 }).rows.length === 2;
  };
})();
