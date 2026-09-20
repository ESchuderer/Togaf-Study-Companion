/* Shared TOGAF mock-exam engine.
 * One engine, two modes: Part 1 (single correct answer, 1 pt) and Part 2 (gradient, 5/3/1/0).
 * Each exam HTML page defines a global EXAM object then calls TogafExam.init(EXAM).
 *
 * EXAM shape:
 * {
 *   part: 1 | 2,
 *   title: string,
 *   source: string,           // provenance line shown under the title
 *   passMark: number,         // points needed to pass (Part 1: 24/40, Part 2: 24/40)
 *   maxScore: number,         // total available points
 *   questions: [
 *     // Part 1:
 *     { n, lo, topic, q, img?, o:[["A","text"],...], a:"C", e:"explanation" }
 *     // Part 2:
 *     { n, lo, topic, stitle, scenario, q, o:{A,B,C,D}, pts:{A,B,C,D}, rat:{A,B,C,D} }
 *   ]
 * }
 * `lo` is the syllabus learning-outcome tag (e.g. "P1-4.3" or "P2-U5.4"); it drives the learning-target report.
 */
(function () {
  const $ = id => document.getElementById(id);
  const t = ((text, values = {}) => text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(values, key) ? values[key] : match));
  const qt = text => window.TOGAF_GENERATED ? TogafStats.escape(t(text)) : text;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  /* Result persistence (localStorage). Every graded run is appended so weak-spots.html
   * can aggregate across practice sessions and drills. Question id = src#n. */
  const TogafStats = {
    t,
    KEY: window.TOGAF_CLOUD ? "togaf.runs.github."+window.TOGAF_CLOUD.user.id : "togaf.generated.runs.v1",
    error: "",
    escape(value) { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]); },
    valid(run) {
      if(window.TOGAF_HOSTED)return window.TogafRecords.validRun(run);
      if (window.TOGAF_GENERATED) {
        if (!window.TogafRecords.validRun(run)) return false;
        const ids = new Set(window.TOGAF_BANKS.filter(b => b.part === run.part).flatMap(b => b.questions.map(q => b.src + "#" + q.n)));
        return run.items.every(i => ids.has(i.id));
      }
      return run && [1, 2].includes(run.part) && typeof run.title === "string" &&
        Number.isFinite(run.ts) && Number.isFinite(run.score) && Number.isFinite(run.max) &&
        run.max > 0 && run.score >= 0 && run.score <= run.max && Array.isArray(run.items) &&
        run.items.length > 0 && run.items.every(i => i && typeof i.id === "string" && typeof i.topic === "string" &&
          Number.isFinite(i.earned) && i.earned >= 0 && i.earned <= i.max && i.max === (run.part === 1 ? 1 : 5));
    },
    load() {
      this.error = "";
      try {
        const runs = JSON.parse(localStorage.getItem(this.KEY) || "[]");
        if (!Array.isArray(runs) || !runs.every(r => this.valid(r))) throw new Error(t("Saved results are malformed. Export the raw data before repairing it."));
        return runs;
      } catch (e) { this.error = t("Results unavailable: {error}", {error:e.message}); return []; }
    },
    identity(run) { return run.id || JSON.stringify([run.ts, run.title, run.part, run.items]); },
    mergeRuns(runs, incoming) {
      if (!Array.isArray(incoming) || !incoming.every(r => this.valid(r))) throw new Error(t("Invalid result data; nothing was imported."));
      if (!Array.isArray(runs) || !runs.every(r => this.valid(r))) throw new Error(t("Invalid result data; nothing was imported."));
      const ids = new Set(runs.map(r => this.identity(r)));
      const additions = incoming.filter(r => { const id = this.identity(r); if (ids.has(id)) return false; ids.add(id); return true; });
      return runs.concat(additions);
    },
    importRuns(incoming) {
      const runs = this.load();
      if (this.error) throw new Error(this.error);
      const merged = this.mergeRuns(runs, incoming);
      const additions = merged.slice(runs.length);
      window.TogafCloud?.beforeSave(additions);
      localStorage.setItem(this.KEY, JSON.stringify(merged));
      window.TogafCloud?.changed();
      return additions.length;
    },
    importJSON(text) {
      let data;
      try { data = JSON.parse(text); }
      catch { throw new Error(t("Invalid JSON backup. Nothing was imported.")); }
      return this.importRuns(Array.isArray(data) ? data : data?.runs);
    },
    save(run) {
      try { this.importRuns([run]); return true; }
      catch (e) { this.error = t("Results were not saved: {error}", {error:e.message}); return false; }
    },
    clear() { try { localStorage.removeItem(this.KEY); return true; } catch (e) { this.error = e.message; return false; } },
    qid(q, fallback) { return (q.src || fallback) + "#" + (q.orig || q.n); },
    latest(part, runs = this.load()) {
      const items = new Map();
      runs.filter(r => r.part === part).slice().sort((a, b) => a.ts - b.ts).forEach(r => {
        r.items.forEach(i => { if (i.sel !== null) items.set(i.id, { ...i, ts: r.ts, mode: r.mode || r.kind }); });
      });
      return [...items.values()];
    },
    topics(part, runs = this.load()) {
      const topics = new Map();
      this.latest(part, runs).forEach(i => {
        const t = topics.get(i.topic) || { topic: i.topic, earned: 0, max: 0, seen: 0, missed: 0 };
        t.earned += i.earned; t.max += i.max; t.seen++; if (i.earned < i.max) t.missed++;
        topics.set(i.topic, t);
      });
      return [...topics.values()].map(t => ({ ...t, pct: t.earned / t.max })).sort((a, b) => a.pct - b.pct || b.seen - a.seen);
    }
  };
  window.TogafStats = TogafStats;

  const TogafExam = {
    shuffle,
    mix(banks, part, count, accept = () => true, prefer = () => true) {
      if (![1, 2].includes(part) || !Number.isInteger(count) || count < 0) throw new Error(t("Invalid practice selection."));
      const used = new Set(), selected = [];
      const pools = banks.filter(b => b.part === part).map(b => shuffle(b.questions.map(q => ({ ...q, src: b.src })).filter(q => {
        const id = TogafStats.qid(q, b.src);
        if (used.has(id) || !accept(q)) return false;
        used.add(id); return true;
      })));
      // Draw across sources without replacement; preferred (unseen) questions come first.
      for (const preferred of [true, false]) {
        let buckets = pools.map(qs => qs.filter(q => !!prefer(q) === preferred)).filter(qs => qs.length);
        while (buckets.length && (!count || selected.length < count)) {
          for (const bucket of shuffle(buckets)) {
            if (count && selected.length >= count) break;
            selected.push(bucket.pop());
          }
          buckets = buckets.filter(qs => qs.length);
        }
      }
      return shuffle(selected).map((q, i) => ({ ...q, orig: q.orig || q.n, n: i + 1 }));
    },
    init(exam) {
      this.exam = exam;
      this.part = exam.part;
      this.state = { mode: "exam", order: [], idx: 0, responses: {}, startMs: 0, timerId: null };
      this.wire();
      this.renderStart();
    },

    wire() {
      $("start-btn").addEventListener("click", () => this.start());
      $("prev-btn").addEventListener("click", () => { if (this.state.idx > 0) { this.state.idx--; this.renderQuestion(); } });
      $("next-btn").addEventListener("click", () => { if (this.state.idx < this.state.order.length - 1) { this.state.idx++; this.renderQuestion(); } });
      $("submit-btn").addEventListener("click", () => {
        const total = this.exam.questions.length;
        const un = total - Object.keys(this.state.responses).length;
        if (un > 0 && !confirm(t("{count} question(s) unanswered. Submit anyway?", {count:un}))) return;
        this.grade();
      });
      $("review-btn").addEventListener("click", () => this.reviewAll());
      $("restart-btn").addEventListener("click", () => {
        $("result").classList.remove("show");
        $("start-screen").classList.remove("hidden");
        window.scrollTo(0, 0);
      });
    },

    renderStart() {
      $("exam-title").textContent = t(this.exam.title);
      $("exam-source").textContent = this.exam.source;
      const total = this.exam.questions.length;
      $("start-count").textContent = total;
      document.querySelectorAll(".js-count").forEach(el => el.textContent = total);
    },

    start() {
      clearInterval(this.state.timerId);
      this.state.graded = false;
      this.state.mode = document.querySelector('input[name="mode"]:checked').value;
      this.state.order = shuffle(this.exam.questions).map(q => {
        if (this.part === 1) return { ...q, shuffledOpts: shuffle(q.o) };
        return { ...q, keyOrder: shuffle(["A", "B", "C", "D"]) };
      });
      this.state.idx = 0;
      this.state.responses = {};
      $("start-screen").classList.add("hidden");
      $("exam-screen").classList.remove("hidden");
      $("exam-screen").querySelector(".exam-bar").classList.remove("hidden");
      $("exam-screen").querySelector(".nav-btns").classList.remove("hidden");
      $("submit-btn").textContent = t(this.state.mode === "study" ? "Finish & score" : "Submit exam");
      this.state.startMs = performance.now();
      $("timer").textContent = "00:00";
      this.state.timerId = setInterval(() => { $("timer").textContent = fmtTime(performance.now() - this.state.startMs); }, 500);
      this.renderQuestion();
    },

    ptClass(p) { return p === 5 ? "p5" : p === 3 ? "p3" : p === 1 ? "p1" : "p0"; },
    badgeClass(p) { return p === 5 ? "b5" : p === 3 ? "b3" : p === 1 ? "b1" : "b0"; },

    renderQuestion() {
      const original = this.state.order[this.state.idx];
      const q = original;
      const total = this.state.order.length;
      $("counter").textContent = t("Q {number} / {total}", {number:this.state.idx + 1,total});
      const answered = Object.keys(this.state.responses).length;
      $("answered-count").textContent = t("{count} answered", {count:answered});
      $("progress-fill").style.width = (answered / total * 100) + "%";

      const sel = this.state.responses[q.n];
      const revealed = this.state.mode === "study" && sel;
      let html = '<div class="qcard">';
      html += '<div class="qnum">' + t('Q{number}', {number:this.state.idx + 1}) + ' &middot; ' + qt(q.topic) + ' <span class="lo">' + q.lo + '</span></div>';

      if (this.part === 2) {
        html += '<div class="scenario"><div class="stitle">' + qt(q.stitle) + '</div>' + qt(q.scenario) + '</div>';
      }
      html += '<div class="qtext">' + qt(q.q) + '</div>';
      if (q.img) html += '<div class="imgnote">' + q.img + '</div>';

      if (this.part === 1) {
        q.shuffledOpts.forEach(([key, text]) => {
          let cls = "opt";
          if (revealed) {
            if (key === q.a) cls += " correct";
            else if (key === sel) cls += " wrong";
          } else if (key === sel) cls += " selected";
          html += '<button class="' + cls + '" data-key="' + key + '"><span class="key">' + key + '.</span>' + qt(text) + '</button>';
        });
        if (revealed) {
          const ok = sel === q.a;
          html += '<div class="explain ' + (ok ? "ok" : "no") + ' show">' +
            (ok ? t("Correct. ") : t("Incorrect. Correct answer: {answer}. ", {answer:q.a})) + qt(q.e) + '</div>';
        }
      } else {
        q.keyOrder.forEach(key => {
          let cls = "opt";
          if (revealed) cls += " " + this.ptClass(q.pts[key]);
          else if (key === sel) cls += " selected";
          let badge = revealed ? '<span class="badge ' + this.badgeClass(q.pts[key]) + '">' + q.pts[key] + t(' pts') + '</span>' : "";
          html += '<button class="' + cls + '" data-key="' + key + '">' + badge + '<span class="key">' + key + '.</span>' + qt(q.o[key]) + '</button>';
        });
        if (revealed) {
          html += '<div class="explain show">' + t('You picked <strong>{answer}</strong> = <strong>{points} of 5</strong>.<ul>', {answer:sel,points:q.pts[sel]});
          ["A", "B", "C", "D"].sort((a, b) => q.pts[b] - q.pts[a]).forEach(k => {
            html += '<li><strong>' + k + ' (' + q.pts[k] + '):</strong> ' + qt(q.rat[k]) + '</li>';
          });
          html += '</ul></div>';
        }
      }
      if (revealed && q.reviewNote) html += '<div class="target-callout"><strong>Review note:</strong> ' + TogafStats.escape(q.reviewNote) + '</div>';
      html += '</div>';
      $("question-container").innerHTML = html;

      $("question-container").querySelectorAll("button.opt").forEach(btn => {
        btn.addEventListener("click", () => {
          if (this.state.mode === "study" && this.state.responses[q.n]) return;
          this.state.responses[q.n] = btn.getAttribute("data-key");
          this.renderQuestion();
        });
      });

      $("prev-btn").disabled = this.state.idx === 0;
      $("next-btn").disabled = this.state.idx === total - 1;
    },

    scoreOf(q, sel) {
      if (!sel) return 0;
      if (this.part === 1) return sel === q.a ? 1 : 0;
      return q.pts[sel];
    },
    maxOf(q) { return this.part === 1 ? 1 : 5; },
    bestKey(q) {
      if (this.part === 1) return q.a;
      return ["A", "B", "C", "D"].reduce((a, b) => q.pts[b] > q.pts[a] ? b : a, "A");
    },

    grade() {
      if (this.state.graded) return;
      this.state.graded = true;
      clearInterval(this.state.timerId);
      let score = 0;
      this.exam.questions.forEach(q => { score += this.scoreOf(q, this.state.responses[q.n]); });
      const pass = score >= this.exam.passMark;
      $("exam-screen").classList.add("hidden");
      $("result").classList.add("show");
      const v = $("verdict-line");
      v.textContent = t(pass ? "PASS" : "FAIL");
      v.className = "verdict " + (pass ? "pass" : "fail");
      $("score-line").innerHTML = "<strong>" + score + " / " + this.exam.maxScore + "</strong> " +
        t(this.part === 1 ? "correct" : "points") + t(". Pass mark is {mark}. ", {mark:this.exam.passMark}) +
        (pass ? t("Practice threshold reached; this is not a prediction of an exam pass.") : t("Short by {points}.", {points:this.exam.passMark - score}));
      $("time-line").textContent = t("Time: {time}. Answered: {answered} of {total}.", {time:fmtTime(performance.now() - this.state.startMs),answered:Object.keys(this.state.responses).length,total:this.exam.questions.length});

      const saved = TogafStats.save({
        title: this.exam.title, part: this.part, kind: this.exam.kind || "mock", ts: Date.now(),
        mode: this.state.mode,
        score, max: this.exam.maxScore, pass, ms: Math.round(performance.now() - this.state.startMs),
        items: this.exam.questions.map(q => ({
          id: TogafStats.qid(q, this.exam.title), lo: q.lo, topic: q.topic,
          earned: this.scoreOf(q, this.state.responses[q.n]), max: this.maxOf(q), sel: this.state.responses[q.n] || null
        }))
      });
      this.renderLearningTargets();
      if (!saved) $("learning-targets").insertAdjacentHTML("afterbegin", '<p role="alert" class="target-callout">' + TogafStats.escape(TogafStats.error) + '</p>');
      this.renderReviewTable();
      $("review-table").classList.add("hidden");
      window.scrollTo(0, 0);
    },

    // Aggregate lost points by topic to surface the weakest areas.
    renderLearningTargets() {
      const byTopic = {};
      this.exam.questions.forEach(q => {
        const key = q.topic;
        if (!byTopic[key]) byTopic[key] = { earned: 0, max: 0, missed: [] };
        const earned = this.scoreOf(q, this.state.responses[q.n]);
        const max = this.maxOf(q);
        if (this.state.responses[q.n]) {
          byTopic[key].earned += earned;
          byTopic[key].max += max;
          if (earned < max) byTopic[key].missed.push(q);
        }
      });
      const rows = Object.entries(byTopic).map(([topic, d]) => ({
        topic, ...d, pct: d.max ? d.earned / d.max : 1
      })).sort((a, b) => a.pct - b.pct);

      let html = '<h2>' + t('Learning targets') + '</h2>';
      html += '<p class="source">' + t('This run, answered questions only. Blank questions reduce the test score but are not evidence of a topic weakness. The dashboard uses your latest answer to each question.') + '</p>';
      html += '<table><tr><th>' + t('Topic') + '</th><th>' + t('Score') + '</th><th>%</th><th>' + t('Study') + '</th></tr>';
      rows.forEach(r => {
        const pct = Math.round(r.pct * 100);
        const cls = pct >= 80 ? "res-full" : pct >= 60 ? "res-part" : "res-zero";
        const los = [...new Set(r.missed.map(q => q.lo))].join(", ");
        html += '<tr><td>' + qt(r.topic) + '</td><td>' + r.earned + '/' + r.max + '</td>' +
          '<td class="' + cls + '">' + (r.max ? pct + '%' : t('Not assessed')) + '</td><td class="lo">' + (los || "-") + '</td></tr>';
      });
      html += '</table>';

      const weak = rows.filter(r => r.pct < 0.6);
      if (weak.length) {
        html += '<div class="target-callout"><strong>' + t('Priority study targets:') + '</strong> ' +
          weak.map(r => qt(r.topic)).join("; ") + t('. These learning outcomes need work: ') +
          [...new Set(weak.flatMap(r => r.missed.map(q => q.lo)))].join(", ") + '.</div>';
      } else {
        html += '<div class="target-callout ok">' + t('No assessed topic below 60% in this run. Check unseen topics and fresh exam-mode performance too.') + '</div>';
      }
      const dashboard = this.exam.dashboard || "../../../../weak-spots.html";
      html += '<p class="source"><a href="' + TogafStats.escape(dashboard) + '">' + t('Open the weak-spot dashboard') + '</a>' + t(' for current weaknesses and complete run history. Study-mode scores reflect practice, not timed readiness.') + '</p>';
      $("learning-targets").innerHTML = html;
    },

    renderReviewTable() {
      let html = '<h2>' + t('Answer review') + '</h2><table><tr><th>' + t('Q') + '</th><th>' + t('Topic') + '</th><th>' + t('Your pick') + '</th><th>' + t('Best') + '</th><th>' +
        t(this.part === 1 ? "Result" : "Points") + '</th></tr>';
      this.state.order.forEach((q, index) => {
        const your = this.state.responses[q.n];
        const p = this.scoreOf(q, your);
        const max = this.maxOf(q);
        const best = this.bestKey(q);
        let cls, label;
        if (this.part === 1) {
          cls = p === 1 ? "res-full" : (your ? "res-zero" : "res-zero");
          label = t(p === 1 ? "OK" : (your ? "wrong" : "blank"));
        } else {
          cls = p === 5 ? "res-full" : (p > 0 ? "res-part" : "res-zero");
          label = p;
        }
        html += '<tr><td>' + (index + 1) + '</td><td>' + qt(q.topic) + '</td><td>' + (your || "-") + '</td><td>' + best + '</td>' +
          '<td class="' + cls + '">' + label + '</td></tr>';
      });
      html += '</table>';
      $("review-table").innerHTML = html;
    },

    reviewAll() {
      $("review-table").classList.remove("hidden");
      let html = "";
      this.state.order.forEach((original, index) => {
        const q = original;
        const sel = this.state.responses[q.n];
        html += '<div class="qcard"><div class="qnum">' + t('Q{number}', {number:index + 1}) + ' &middot; ' + qt(q.topic) + ' <span class="lo">' + q.lo + '</span></div>';
        if (this.part === 2) html += '<div class="scenario"><div class="stitle">' + qt(q.stitle) + '</div>' + qt(q.scenario) + '</div>';
        html += '<div class="qtext">' + qt(q.q) + '</div>';
        if (q.img) html += '<div class="imgnote">' + q.img + '</div>';
        if (q.reviewNote) html += '<div class="target-callout"><strong>Review note:</strong> ' + TogafStats.escape(q.reviewNote) + '</div>';
        if (this.part === 1) {
          q.shuffledOpts.forEach(([key, text]) => {
            let cls = "opt";
            if (key === q.a) cls += " correct";
            else if (key === sel) cls += " wrong";
            html += '<button class="' + cls + '" disabled><span class="key">' + key + '.</span>' + qt(text) + '</button>';
          });
          const ok = sel === q.a;
          html += '<div class="explain ' + (ok ? "ok" : "no") + ' show">' +
            (ok ? t("You got this right. ") : t("Correct answer: {answer}{selection}. ", {answer:q.a,selection:sel ? t(" (you picked {answer})", {answer:sel}) : t(" (blank)")})) + qt(q.e) + '</div>';
        } else {
          q.keyOrder.forEach(key => {
            let cls = "opt " + this.ptClass(q.pts[key]);
            let badge = '<span class="badge ' + this.badgeClass(q.pts[key]) + '">' + q.pts[key] + t(' pts') + '</span>';
            if (key === sel) badge += '<span class="badge byou">' + t('your pick') + '</span>';
            html += '<button class="' + cls + '" disabled>' + badge + '<span class="key">' + key + '.</span>' + qt(q.o[key]) + '</button>';
          });
          html += '<div class="explain show"><ul>';
          ["A", "B", "C", "D"].sort((a, b) => q.pts[b] - q.pts[a]).forEach(k => {
            html += '<li><strong>' + k + ' (' + q.pts[k] + '):</strong> ' + qt(q.rat[k]) + '</li>';
          });
          html += '</ul></div>';
        }
        html += '</div>';
      });
      $("exam-screen").classList.remove("hidden");
      $("exam-screen").querySelector(".exam-bar").classList.add("hidden");
      $("exam-screen").querySelector(".nav-btns").classList.add("hidden");
      $("question-container").innerHTML = html;
    }
  };

  window.TogafExam = TogafExam;
})();
