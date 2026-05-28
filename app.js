const state = {
  data: { memoria: null, domino: null, uno: null, cambleplay: null, ui: null },
  currentScreen: "intro",
  pendingFeedbackAction: null,
  resultChart: null,
  timers: { memoria: null, cpCea: null, cpGuide: null, cpWalk: null, cpLanding: null },
  games: { memoria: null, domino: null, uno: null, cambleplay: null }
};

const PLAYER_COLORS = ["#ff6f6f", "#26a6f0", "#5fd46f", "#ffb347", "#9b7cff", "#17bebb"];
const PLAYER_BOARD_COLORS = ["#2f80ff", "#ff4b4b", "#2dbb6f", "#f29f05", "#8b5cf6", "#17bebb"];
const BOT_BALANCE = {
  memoryKnownPair: 0.18,
  dominoKnownPair: 0.15,
  unoSmartPlay: 0.22,
  unoSwapWhenBad: 0.2,
  unoRandomSwap: 0.05,
  cpQuestion: 0.3,
  cpCount: 0.28,
  cpInput: 0.3,
  cpCea: 0.25
};
const BOT_TIMING = {
  memoryThink: 1050,
  memorySecondPick: 650,
  dominoAfterBuy: 760,
  dominoNoMove: 920,
  dominoPlay: 1120,
  unoPlay: 1050,
  cpRoll: 1220
};
const DATA_FILE_PATHS = {
  memoria: "data/memoria-camble.json",
  domino: "data/domino-camble.json",
  uno: "data/uno-camble.json",
  cambleplay: "data/cambleplay.json",
  ui: "data/ui-textos.json"
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatTime(totalSeconds) {
  const min = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
}

function formatClockNow() {
  return new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(text = "") {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(text = "") {
  return escapeHtml(text).replaceAll("'", "&#39;");
}

function normalizeCambleGlyphs(text = "") {
  return String(text)
    .replaceAll("ᙪ", "P")
    .replaceAll("Է", "B")
    .replaceAll("Ŋ", "S")
    .replaceAll("Š", "S")
    .replaceAll("ᗫ", "D");
}

function normalizeCambleInput(text = "") {
  return normalizeCambleGlyphs(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function signedPluralize(count, singular, plural = `${singular}s`) {
  const sign = count >= 0 ? "+" : "-";
  return `${sign}${pluralize(Math.abs(count), singular, plural)}`;
}

function createPlayers(mode, total, baseName) {
  const count = clamp(total, 2, 6);
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const isBot = mode === "solo" ? i > 0 : false;
    const name = mode === "solo" ? (i === 0 ? "Você" : `Bot ${i}`) : `${baseName} ${i + 1}`;
    players.push({
      id: `p${i + 1}`,
      name,
      isBot,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      markerColor: PLAYER_BOARD_COLORS[i % PLAYER_BOARD_COLORS.length],
      score: 0
    });
  }
  return players;
}

function applyStaticLabels() {
  ["btn-home", "btn-game-home", "modal-feedback-home"].forEach((id) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.textContent = "Retornar aos jogos";
    button.setAttribute("aria-label", "Retornar aos jogos");
  });
}

function drawCycling(deck, source) {
  if (deck.length === 0) deck.push(...shuffle([...source]));
  return deck.shift();
}

function groupByParId(items) {
  const grouped = {};
  items.forEach((item) => {
    const key = item.card.parId;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  });
  return grouped;
}

function getPermutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  arr.forEach((item, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    getPermutations(rest).forEach((perm) => out.push([item, ...perm]));
  });
  return out;
}

function uniqueBy(list, keyFn) {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, item);
  });
  return [...map.values()];
}

function cloneData(data) {
  if (typeof structuredClone === "function") return structuredClone(data);
  return JSON.parse(JSON.stringify(data));
}

function applyLoadedData(data) {
  state.data.memoria = data.memoria;
  state.data.domino = data.domino;
  state.data.uno = data.uno;
  state.data.cambleplay = data.cambleplay;
  state.data.ui = data.ui;
}

function getEmbeddedData() {
  if (!window.EMBEDDED_GAME_DATA) return null;
  return cloneData(window.EMBEDDED_GAME_DATA);
}

async function fetchDataFiles() {
  const entries = await Promise.all(
    Object.entries(DATA_FILE_PATHS).map(async ([key, filePath]) => {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Falha ao carregar ${filePath} (${response.status})`);
      }
      return [key, await response.json()];
    })
  );

  return Object.fromEntries(entries);
}

function bestNumberFromHand(hand, target) {
  const nums = [...new Set(getPermutations(hand).map((p) => Number(p.join(""))))];
  let best = nums[0];
  let diffBest = Math.abs(best - target);
  nums.forEach((n) => {
    const d = Math.abs(n - target);
    if (d < diffBest || (d === diffBest && n < best)) {
      best = n;
      diffBest = d;
    }
  });
  return { value: best, diff: diffBest };
}

function sequenceOptionsFromDigits(digits, target) {
  return uniqueBy(
    getPermutations(digits).map((arr) => {
      const sequence = arr.join("");
      const value = Number(sequence);
      return {
        sequence,
        value,
        diff: Number.isFinite(target) ? Math.abs(value - target) : 0
      };
    }),
    (x) => x.sequence
  ).sort((a, b) => a.value - b.value || a.sequence.localeCompare(b.sequence));
}

function bestSequenceFromHand(hand, target) {
  const options = sequenceOptionsFromDigits(hand, target);
  return options.reduce((best, option) => {
    if (!best) return option;
    if (option.diff < best.diff) return option;
    if (option.diff === best.diff && option.value < best.value) return option;
    return best;
  }, null);
}

function cambleTextForSequence(sequence, numberWords) {
  return String(sequence)
    .split("")
    .map((digit) => numberWords?.[digit] || digit)
    .join(" ");
}

function describeNumberDistance(value, target) {
  const delta = value - target;
  if (delta === 0) return "exato";
  return `${Math.abs(delta)} ${delta > 0 ? "a mais" : "a menos"}`;
}

function buildCambleplayTrackPositions() {
  const coords = [];
  for (let x = 0; x <= 9; x += 1) coords.push({ x, y: 8 });
  for (let y = 7; y >= 0; y -= 1) coords.push({ x: 9, y });
  for (let x = 8; x >= 0; x -= 1) coords.push({ x, y: 0 });
  for (let y = 1; y <= 7; y += 1) coords.push({ x: 0, y });
  return coords;
}

const CAMBLEPLAY_TRACK_POSITIONS = buildCambleplayTrackPositions();

function cambleplayCellClass(code) {
  if (code === "+1") return "type-PLUS";
  if (code === "?") return "type-Q";
  if (code === "S/A") return "type-SA";
  return `type-${String(code).replaceAll("/", "_")}`;
}

function cambleplayCellLabel(code) {
  const labels = {
    INICIO: "INÍCIO",
    "+1": "+1",
    "S/A": "S/A",
    CEA: "CEA",
    VC: "VC",
    ADJ: "ADJ",
    VPA: "VPA",
    VPR: "VPR",
    VF: "VF",
    "?": "?"
  };
  return labels[code] || code;
}

function createClickBurst(target, event) {
  const rect = target.getBoundingClientRect();
  const cx = Number.isFinite(event?.clientX) && event.clientX > 0 ? event.clientX : rect.left + rect.width / 2;
  const cy = Number.isFinite(event?.clientY) && event.clientY > 0 ? event.clientY : rect.top + rect.height / 2;

  const ripple = document.createElement("span");
  ripple.className = "fx-ripple";
  ripple.style.left = `${cx}px`;
  ripple.style.top = `${cy}px`;
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 640);

  const sparkCount = target.classList.contains("btn") ? 12 : 9;
  for (let i = 0; i < sparkCount; i += 1) {
    const angle = (Math.PI * 2 * i) / sparkCount + (Math.random() * 0.45 - 0.22);
    const distance = 22 + Math.random() * 28;
    const spark = document.createElement("span");
    spark.className = "fx-spark";
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    spark.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    spark.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    spark.style.background = `hsl(${Math.round(Math.random() * 360)}, 88%, 62%)`;
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 620);
  }
}

function triggerClickAnimation(target, event) {
  target.classList.remove("fx-click-pop");
  // Reinicia a animação para cada clique, mesmo em cliques rápidos.
  void target.offsetWidth;
  target.classList.add("fx-click-pop");
  setTimeout(() => target.classList.remove("fx-click-pop"), 420);
  createClickBurst(target, event);
}

function setupExpressiveClickFX() {
  const selector = [
    "button",
    ".card",
    ".domino-hand-piece",
    ".digit-card.pick",
    ".cp-card-back",
    ".cp-card-front"
  ].join(",");

  document.addEventListener("click", (event) => {
    const target = event.target.closest(selector);
    if (!target) return;
    if (target.matches(":disabled")) return;
    if (target.getAttribute("aria-disabled") === "true") return;
    triggerClickAnimation(target, event);
  });
}

const mobileAssist = {
  panel: null,
  toggleBtn: null,
  labelEl: null,
  summaryEl: null,
  body: null,
  content: null,
  mediaQuery: null,
  expanded: false,
  currentScreen: null,
  placeholders: new Map(),

  init() {
    this.panel = document.getElementById("mobile-assist");
    this.toggleBtn = document.getElementById("mobile-assist-toggle");
    this.labelEl = this.toggleBtn?.querySelector(".mobile-assist-label") || null;
    this.summaryEl = document.getElementById("mobile-assist-summary");
    this.body = document.getElementById("mobile-assist-body");
    this.content = document.getElementById("mobile-assist-content");
    if (!this.panel || !this.toggleBtn || !this.summaryEl || !this.body || !this.content) return;

    this.mediaQuery = window.matchMedia("(max-width: 700px)");
    this.toggleBtn.addEventListener("click", () => this.toggle());
    this.mediaQuery.addEventListener?.("change", () => this.refresh(true));
    window.addEventListener("resize", () => this.refresh(true));
    this.refresh(true);
  },

  isEnabled() {
    return this.mediaQuery?.matches ?? window.innerWidth <= 700;
  },

  nodeKey(node) {
    if (!node.dataset.mobileAssistKey) {
      node.dataset.mobileAssistKey = node.id || `assist-${Math.random().toString(36).slice(2, 10)}`;
    }
    return node.dataset.mobileAssistKey;
  },

  ensurePlaceholder(node) {
    const key = this.nodeKey(node);
    if (this.placeholders.has(key)) return;
    const placeholder = document.createComment(`mobile-assist:${key}`);
    node.parentNode?.insertBefore(placeholder, node);
    this.placeholders.set(key, { node, placeholder });
  },

  moveNode(node) {
    if (!node || !this.content) return;
    this.ensurePlaceholder(node);
    if (node.parentNode !== this.content) {
      this.content.appendChild(node);
    }
    node.classList.add("assist-mounted");
  },

  restoreNode(node) {
    if (!node) return;
    const entry = this.placeholders.get(this.nodeKey(node));
    if (!entry?.placeholder?.parentNode) return;
    entry.placeholder.parentNode.insertBefore(node, entry.placeholder.nextSibling);
    node.classList.remove("assist-mounted");
  },

  restoreAll() {
    [...this.placeholders.values()].forEach(({ node }) => this.restoreNode(node));
  },

  collapse() {
    this.expanded = false;
    if (this.panel) this.panel.classList.remove("is-open");
    if (this.toggleBtn) this.toggleBtn.setAttribute("aria-expanded", "false");
    if (this.labelEl) this.labelEl.textContent = "Abrir painel do jogo";
    if (this.body) this.body.hidden = true;
  },

  expand() {
    this.expanded = true;
    if (this.panel) this.panel.classList.add("is-open");
    if (this.toggleBtn) this.toggleBtn.setAttribute("aria-expanded", "true");
    if (this.labelEl) this.labelEl.textContent = "Fechar painel do jogo";
    if (this.body) this.body.hidden = false;
  },

  toggle() {
    if (this.expanded) this.collapse();
    else this.expand();
  },

  getText(id, fallback = "-") {
    return document.getElementById(id)?.textContent?.trim() || fallback;
  },

  getNodesForScreen(screenName) {
    const selectors = {
      memoria: ["#memoria-status", "#memoria-msg"],
      domino: ["#domino-status", "#domino-msg", "#domino-acoes", "#domino-log"],
      uno: ["#uno-status", "#uno-jogada", "#uno-ficha", "#uno-log"],
      cambleplay: ["#cp-dashboard", "#cp-acao"]
    };
    return (selectors[screenName] || [])
      .map((selector) => document.querySelector(selector))
      .filter(Boolean);
  },

  getSummary(screenName) {
    if (screenName === "memoria") {
      return `${this.getText("memoria-turno")} • ${this.getText("memoria-tempo")} • Mov. ${this.getText("memoria-movimentos", "0")}`;
    }
    if (screenName === "domino") {
      return `${this.getText("domino-turno")} • ${this.getText("domino-restantes")} • Mesa ${this.getText("domino-extremos")}`;
    }
    if (screenName === "uno") {
      return `Rod. ${this.getText("uno-rodada")} • Alvo ${this.getText("uno-alvo")} • ${this.getText("uno-vez")}`;
    }
    if (screenName === "cambleplay") {
      return `${this.getText("cp-turno")} • Dado ${this.getText("cp-dado")} • Meta ${document.getElementById("cp-meta")?.value || "-"}`;
    }
    return "Toque para abrir";
  },

  refreshSummary() {
    if (!this.summaryEl || !this.currentScreen || !this.panel || this.panel.hidden) return;
    this.summaryEl.textContent = this.getSummary(this.currentScreen);
  },

  refresh(forceCollapse = false) {
    if (!this.panel || !this.content) return;

    const screenName = state.currentScreen;
    const active = this.isEnabled() && screenName && screenName !== "home" && screenName !== "intro";

    document.body.classList.toggle("mobile-assist-active", active);

    if (!active) {
      this.currentScreen = null;
      this.restoreAll();
      this.panel.hidden = true;
      this.content.innerHTML = "";
      this.collapse();
      return;
    }

    if (forceCollapse || this.currentScreen !== screenName) {
      this.collapse();
    }
    this.currentScreen = screenName;
    this.panel.hidden = false;
    this.summaryEl.textContent = this.getSummary(screenName);

    const nodes = this.getNodesForScreen(screenName);
    const activeKeys = new Set(nodes.map((node) => this.nodeKey(node)));

    [...this.placeholders.values()].forEach(({ node }) => {
      if (!activeKeys.has(this.nodeKey(node))) this.restoreNode(node);
    });

    nodes.forEach((node) => this.moveNode(node));
  }
};

mobileAssist.getSummary = function getSummary(screenName) {
  if (screenName === "memoria") {
    return `${this.getText("memoria-turno")} | ${this.getText("memoria-tempo")} | Mov. ${this.getText("memoria-movimentos", "0")}`;
  }
  if (screenName === "domino") {
    return `${this.getText("domino-turno")} | ${this.getText("domino-restantes")} | Mesa ${this.getText("domino-extremos")}`;
  }
  if (screenName === "uno") {
    return `Rod. ${this.getText("uno-rodada")} | Alvo ${this.getText("uno-alvo")} | ${this.getText("uno-vez")}`;
  }
  if (screenName === "cambleplay") {
    return `${this.getText("cp-turno")} | Dado ${this.getText("cp-dado")} | Meta ${document.getElementById("cp-meta")?.value || "-"}`;
  }
  return "Toque para abrir";
};

const gamification = {
  formatNumber(value, digits = 1) {
    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: digits
    }).format(value);
  },

  featureValue(feature, player) {
    const raw = typeof feature.value === "function" ? feature.value(player) : player[feature.key];
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  },

  formatFeature(feature, value) {
    if (typeof feature.format === "function") return feature.format(value);
    if (Number.isInteger(value)) return String(value);
    return this.formatNumber(value, 1);
  },

  featureStats(players, feature) {
    const values = players.map((player) => this.featureValue(feature, player));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const distinct = new Set(values.map((value) => value.toFixed(4))).size;
    return {
      min,
      max,
      range: max - min,
      distinct
    };
  },

  selectFeatures(players, features) {
    const scored = features.map((feature, index) => {
      const stats = this.featureStats(players, feature);
      const priority = feature.priority ?? feature.weight ?? 1;
      const score = (feature.primary ? 100 : 0) + priority * 8 + (stats.distinct > 1 ? 12 : 0) + stats.distinct;
      return { ...feature, index, stats, selectionScore: score };
    });

    return scored
      .sort((a, b) => b.selectionScore - a.selectionScore || a.index - b.index)
      .slice(0, Math.min(4, Math.max(1, scored.length)));
  },

  normalizedValue(feature, value) {
    const stats = feature.stats || { min: value, max: value, range: 0 };
    if (!stats.range) return 1;
    const ratio = feature.higherIsBetter === false ? (stats.max - value) / stats.range : (value - stats.min) / stats.range;
    return clamp(ratio, 0, 1);
  },

  performanceFor(player, selectedFeatures) {
    const totalWeight = selectedFeatures.reduce((sum, feature) => sum + (feature.weight ?? 1), 0) || 1;
    const score = selectedFeatures.reduce((sum, feature) => {
      const value = this.featureValue(feature, player);
      return sum + this.normalizedValue(feature, value) * (feature.weight ?? 1);
    }, 0);
    return Math.round((score / totalWeight) * 100);
  },

  participantType(player) {
    return player.isBot ? "Bot" : "Player";
  },

  participantCountLabel(count, label) {
    return `${count} ${label}${count === 1 ? "" : "s"}`;
  },

  createReport({ gameName, message, players, features, summary = [] }) {
    const selectedFeatures = this.selectFeatures(players, features);
    const ranking = players
      .map((player, index) => {
        const values = selectedFeatures.map((feature) => {
          const value = this.featureValue(feature, player);
          return {
            key: feature.key,
            label: feature.label,
            shortLabel: feature.shortLabel || feature.label,
            value,
            display: this.formatFeature(feature, value)
          };
        });
        const primary = selectedFeatures[0];
        return {
          id: player.id || `player-${index}`,
          name: player.name,
          color: player.color || PLAYER_COLORS[index % PLAYER_COLORS.length],
          isBot: Boolean(player.isBot),
          kindLabel: this.participantType(player),
          chartLabel: `${player.name} (${this.participantType(player)})`,
          performance: this.performanceFor(player, selectedFeatures),
          primaryValue: primary ? this.featureValue(primary, player) : 0,
          values
        };
      })
      .sort((a, b) => {
        if (b.performance !== a.performance) return b.performance - a.performance;
        const primary = selectedFeatures[0];
        if (!primary) return a.name.localeCompare(b.name);
        return primary.higherIsBetter === false ? a.primaryValue - b.primaryValue : b.primaryValue - a.primaryValue;
      });

    return {
      gameName,
      message,
      summary,
      participants: {
        players: ranking.filter((row) => !row.isBot).length,
        bots: ranking.filter((row) => row.isBot).length,
        total: ranking.length
      },
      selectedFeatures,
      ranking,
      highlights: this.buildHighlights(ranking, selectedFeatures)
    };
  },

  buildHighlights(ranking, selectedFeatures) {
    const highlights = [];
    const topPerformance = ranking[0]?.performance ?? 0;
    const topPlayers = ranking.filter((row) => row.performance === topPerformance).map((row) => row.name);

    if (topPlayers.length) {
      highlights.push({
        label: "Melhor desempenho geral",
        names: topPlayers.join(", "),
        value: `${topPerformance}%`,
        detail: "Combinação dos critérios selecionados."
      });
    }

    selectedFeatures.forEach((feature) => {
      const values = ranking.map((row) => ({
        row,
        value: row.values.find((item) => item.key === feature.key)?.value ?? 0
      }));
      const bestValue =
        feature.higherIsBetter === false
          ? Math.min(...values.map((item) => item.value))
          : Math.max(...values.map((item) => item.value));
      const winners = values
        .filter((item) => Math.abs(item.value - bestValue) < 0.0001)
        .map((item) => item.row.name);
      highlights.push({
        label: feature.highlightLabel || feature.label,
        names: winners.join(", "),
        value: this.formatFeature(feature, bestValue),
        detail: feature.higherIsBetter === false ? "Menor valor entre os jogadores." : "Maior valor entre os jogadores."
      });
    });

    return highlights.slice(0, 5);
  },

  renderReport(report) {
    const summary = report.summary.length
      ? `
        <div class="endgame-summary-grid">
          ${report.summary
            .map(
              (item) => `
                <article class="endgame-summary-card">
                  <span>${escapeHtml(item.label)}</span>
                  <strong>${escapeHtml(item.value)}</strong>
                </article>
              `
            )
            .join("")}
        </div>
      `
      : "";

    const featureChips = report.selectedFeatures
      .map((feature) => `<span>${escapeHtml(feature.shortLabel || feature.label)}</span>`)
      .join("");
    const participantText = [
      this.participantCountLabel(report.participants.players, "Player"),
      report.participants.bots ? this.participantCountLabel(report.participants.bots, "Bot") : ""
    ]
      .filter(Boolean)
      .join(" + ");

    return `
      <section class="endgame-report" aria-label="Resultado gamificado de ${escapeAttr(report.gameName)}">
        <div class="endgame-hero">
          <p>${escapeHtml(report.message)}</p>
          ${summary}
        </div>

        <div class="endgame-feature-selection">
          <strong>Melhores resultados selecionados</strong>
          <div>${featureChips}</div>
        </div>

        <div class="endgame-participants">
          <strong>Participantes no gráfico</strong>
          <span>${escapeHtml(participantText)}</span>
        </div>

        <div class="endgame-layout">
          <section class="endgame-chart-panel" aria-labelledby="endgame-chart-title">
            <h4 id="endgame-chart-title">Comparativo Player x Bot</h4>
            <div class="endgame-chart-wrap">
              <canvas id="endgame-chart" aria-label="Gráfico comparando métricas finais de players e bots"></canvas>
            </div>
            <p class="endgame-chart-note">As métricas são normalizadas em 0-100 para comparar jogadores, bots e partidas com 2 participantes.</p>
            <p id="endgame-chart-fallback" class="endgame-chart-fallback" hidden></p>
          </section>

          <section class="endgame-ranking-panel" aria-labelledby="endgame-ranking-title">
            <h4 id="endgame-ranking-title">Ranking</h4>
            <ol class="endgame-ranking">
              ${report.ranking
                .map(
                  (row, index) => `
                    <li class="endgame-rank-item" style="--player-color:${escapeAttr(row.color)}">
                      <div class="endgame-rank-topline">
                        <span class="endgame-rank-pos">${index + 1}º</span>
                        <strong>${escapeHtml(row.name)}</strong>
                        <span class="endgame-player-type">${escapeHtml(row.kindLabel)}</span>
                        <span>${row.performance}%</span>
                      </div>
                      <div class="endgame-rank-meter" aria-hidden="true">
                        <span style="width:${clamp(row.performance, 0, 100)}%"></span>
                      </div>
                      <div class="endgame-rank-values">
                        ${row.values
                          .map((item) => `<span>${escapeHtml(item.shortLabel)}: ${escapeHtml(item.display)}</span>`)
                          .join("")}
                      </div>
                    </li>
                  `
                )
                .join("")}
            </ol>
          </section>
        </div>

        <section class="endgame-highlights" aria-labelledby="endgame-highlights-title">
          <h4 id="endgame-highlights-title">Destaques da partida</h4>
          <div class="endgame-highlight-grid">
            ${report.highlights
              .map(
                (item) => `
                  <article class="endgame-highlight">
                    <span>${escapeHtml(item.label)}</span>
                    <strong>${escapeHtml(item.names)}</strong>
                    <em>${escapeHtml(item.value)}</em>
                  </article>
                `
              )
              .join("")}
          </div>
        </section>
      </section>
    `;
  },

  renderChart(report) {
    this.destroyChart();
    const canvas = document.getElementById("endgame-chart");
    const fallback = document.getElementById("endgame-chart-fallback");
    if (!canvas) return;

    if (typeof Chart === "undefined") {
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = "O Chart.js não foi carregado. O ranking acima continua disponível.";
      }
      return;
    }

    const compact = window.matchMedia("(max-width: 520px)").matches;
    const valueScale = compact ? "x" : "y";
    const categoryScale = compact ? "y" : "x";
    const metricColors = ["#ffb347", "#5fd46f", "#9b7cff", "#17bebb"];
    const chartFeatures = report.selectedFeatures.slice(0, 3);
    const metricDatasets = chartFeatures.map((feature, index) => ({
      label: feature.shortLabel || feature.label,
      data: report.ranking.map((row) => {
        const item = row.values.find((value) => value.key === feature.key);
        return Math.round(this.normalizedValue(feature, item?.value ?? 0) * 100);
      }),
      backgroundColor: metricColors[index % metricColors.length],
      borderColor: "#173449",
      borderWidth: 1,
      borderRadius: 10,
      featureKey: feature.key,
      maxBarThickness: report.ranking.length <= 2 ? 44 : 28
    }));

    state.resultChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels: report.ranking.map((row) => row.chartLabel),
        datasets: [
          {
            label: "Desempenho geral",
            data: report.ranking.map((row) => row.performance),
            backgroundColor: report.ranking.map((row) => row.color),
            borderColor: "#173449",
            borderWidth: 2,
            borderRadius: 12,
            maxBarThickness: report.ranking.length <= 2 ? 52 : 34
          },
          ...metricDatasets
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        resizeDelay: 80,
        indexAxis: compact ? "y" : "x",
        categoryPercentage: report.ranking.length <= 2 ? 0.58 : 0.74,
        barPercentage: report.ranking.length <= 2 ? 0.86 : 0.78,
        scales: {
          [valueScale]: {
            beginAtZero: true,
            suggestedMax: 100,
            max: 100,
            grid: { color: "rgba(23, 52, 73, 0.12)" },
            ticks: {
              callback: (value) => `${value}%`
            }
          },
          [categoryScale]: {
            grid: { display: false }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: compact ? "bottom" : "top",
            labels: {
              boxWidth: 14,
              color: "#173449",
              font: {
                weight: "700"
              }
            }
          },
          tooltip: {
            callbacks: {
              beforeLabel: (context) => {
                const row = report.ranking[context.dataIndex];
                return `Tipo: ${row.kindLabel}`;
              },
              label: (context) => {
                const value = context.parsed[valueScale];
                return `${context.dataset.label}: ${value}%`;
              },
              afterLabel: (context) => {
                const row = report.ranking[context.dataIndex];
                if (context.dataset.featureKey) {
                  const item = row.values.find((value) => value.key === context.dataset.featureKey);
                  return item ? `Valor real: ${item.display}` : "";
                }
                return row.values.map((item) => `${item.shortLabel}: ${item.display}`);
              }
            }
          }
        }
      }
    });
  },

  destroyChart() {
    if (state.resultChart) {
      state.resultChart.destroy();
      state.resultChart = null;
    }
  }
};

const ui = {
  screen(screenName) {
    document.querySelectorAll(".screen").forEach((el) => {
      el.classList.toggle("active", el.dataset.screen === screenName);
    });
    state.currentScreen = screenName;
    document.body.dataset.activeScreen = screenName;
    mobileAssist.refresh(true);
  },

  text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
    mobileAssist.refreshSummary();
  },

  score(containerId, players, currentIndex, rowFormatter) {
    const box = document.getElementById(containerId);
    if (!box) return;
    box.innerHTML = players
      .map((p, i) => {
        const active = i === currentIndex ? "current" : "";
        return `
          <article class="score-item ${active}">
            <strong style="display:flex;align-items:center;gap:6px;">
              <span class="cp-token" style="background:${p.color}"></span>
              ${escapeHtml(p.name)}
            </strong>
            <div>${rowFormatter ? rowFormatter(p) : ""}</div>
          </article>
        `;
      })
      .join("");
  },

  log(containerId, text) {
    const box = document.getElementById(containerId);
    if (!box) return;
    if (containerId === "cp-log") {
      const item = document.createElement("article");
      item.className = "cp-chat-entry";
      item.innerHTML = `
        <span class="cp-chat-time">${escapeHtml(formatClockNow())}</span>
        <span>${escapeHtml(text)}</span>
      `;
      box.appendChild(item);
      box.scrollTop = box.scrollHeight;
      return;
    }

    const p = document.createElement("p");
    p.textContent = text;
    box.prepend(p);
  },

  feedback(title, text, onContinue, report = null) {
    gamification.destroyChart();
    state.pendingFeedbackAction = typeof onContinue === "function" ? onContinue : null;
    const modal = document.getElementById("modal-feedback");
    const content = document.getElementById("modal-feedback-texto");
    document.getElementById("modal-feedback-titulo").textContent = title;
    modal.classList.toggle("modal-endgame", Boolean(report));
    content.className = report ? "modal-content endgame-content" : "modal-content";
    if (report) {
      content.innerHTML = gamification.renderReport(report);
    } else {
      content.textContent = text;
    }
    modal.showModal();
    if (report) requestAnimationFrame(() => gamification.renderChart(report));
  },

  confetti() {
    const wrap = document.getElementById("confete");
    wrap.innerHTML = "";
    const colors = ["#ff6f6f", "#ffd84d", "#5fd46f", "#26a6f0", "#9b7cff"];
    for (let i = 0; i < 32; i += 1) {
      const c = document.createElement("span");
      c.className = "confetti";
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDelay = `${Math.random() * 0.2}s`;
      wrap.appendChild(c);
    }
    setTimeout(() => {
      wrap.innerHTML = "";
    }, 1800);
  }
};

const memoryGame = {
  start() {
    const data = state.data.memoria;
    if (!data) return;
    this.stopTimer();

    const mode = document.getElementById("memoria-modo").value;
    const playersTotal = Number(document.getElementById("memoria-jogadores").value);
    const deckType = document.getElementById("memoria-tipo").value;
    const level = document.getElementById("memoria-nivel").value;
    const availableIds = [...(data.modos[deckType] || [])];
    const wanted = Math.min(data.niveis[level] || 8, availableIds.length);
    const ids = shuffle(availableIds).slice(0, wanted);

    if (!ids.length) {
      ui.text("memoria-msg", "Esse tipo de baralho ainda não possui pares disponíveis.");
      return;
    }

    const cards = [];
    ids.forEach((id) => {
      const pair = data.pares.find((p) => p.id === id);
      if (!pair) return;
      cards.push(
        { uid: `${id}_a`, parId: id, ...pair.a, flipped: false, matched: false },
        { uid: `${id}_b`, parId: id, ...pair.b, flipped: false, matched: false }
      );
    });

    state.games.memoria = {
      sid: Date.now(),
      mode,
      players: createPlayers(mode, playersTotal, "Jogador"),
      cards: shuffle(cards),
      turn: 0,
      moves: 0,
      selected: [],
      locked: false,
      startedAt: Date.now(),
      done: false
    };

    ui.text("memoria-msg", "Partida iniciada! Encontre os pares.");
    this.render();
    this.startTimer();
    this.botTurnMaybe();
  },

  render() {
    const g = state.games.memoria;
    if (!g) return;
    ui.text("memoria-turno", g.players[g.turn].name);
    ui.text("memoria-movimentos", String(g.moves));
    ui.score("memoria-placar", g.players, g.turn, (p) => `Pontos: ${p.score}`);

    const board = document.getElementById("memoria-tabuleiro");
    board.style.setProperty("--cols", g.cards.length <= 16 ? "4" : "6");
    board.innerHTML = "";
    g.cards.forEach((card, index) => {
      const btn = document.createElement("button");
      btn.className = `card ${card.flipped || card.matched ? "flipped" : ""} ${card.matched ? "matched" : ""}`;
      btn.type = "button";
      btn.disabled = card.matched || g.locked || g.done;
      const media = card.emoji
        ? `<span class="memory-emoji" role="img" aria-label="${escapeAttr(card.descricao || card.titulo || "Carta visual")}">${escapeHtml(card.emoji)}</span>`
        : card.imagem
          ? `<img src="${escapeAttr(card.imagem)}" alt="${escapeAttr(card.descricao || card.titulo || "")}">`
          : "";
      const title = card.titulo ? `<b>${escapeHtml(card.titulo)}</b>` : "";
      const subtitle = card.subtitulo ? `<small>${escapeHtml(card.subtitulo)}</small>` : "";
      btn.innerHTML = `
        <span class="card-inner">
          <span class="face front">Camble</span>
          <span class="face back ${card.emoji ? "has-emoji" : ""}">
            ${media}
            ${title}
            ${subtitle}
          </span>
        </span>
      `;
      btn.addEventListener("click", () => this.pick(index));
      board.appendChild(btn);
    });
  },

  pick(index) {
    const g = state.games.memoria;
    if (!g || g.done || g.locked) return;
    if (g.players[g.turn].isBot) return;
    this.pickCore(index);
  },

  pickCore(index) {
    const g = state.games.memoria;
    if (!g || g.done || g.locked) return;
    const card = g.cards[index];
    if (!card || card.flipped || card.matched) return;

    card.flipped = true;
    g.selected.push(index);
    this.render();
    if (g.selected.length < 2) return;

    g.locked = true;
    g.moves += 1;
    const [a, b] = g.selected;
    const same = g.cards[a].parId === g.cards[b].parId;
    const playerName = g.players[g.turn].name;

    setTimeout(() => {
      const fresh = state.games.memoria;
      if (!fresh || fresh.sid !== g.sid) return;
      if (same) {
        fresh.cards[a].matched = true;
        fresh.cards[b].matched = true;
        fresh.players[fresh.turn].score += 1;
        ui.text("memoria-msg", `${playerName} acertou o par e joga novamente.`);
      } else {
        fresh.cards[a].flipped = false;
        fresh.cards[b].flipped = false;
        fresh.turn = (fresh.turn + 1) % fresh.players.length;
        ui.text("memoria-msg", "Não foi par. Vez do próximo jogador.");
      }
      fresh.selected = [];
      fresh.locked = false;
      this.render();
      if (!this.checkEnd()) this.botTurnMaybe();
    }, same ? 520 : 820);
  },

  botTurnMaybe() {
    const g = state.games.memoria;
    if (!g || g.done) return;
    const p = g.players[g.turn];
    if (!p.isBot) return;
    const sid = g.sid;
    setTimeout(() => {
      const fresh = state.games.memoria;
      if (!fresh || fresh.done || fresh.sid !== sid) return;

      const open = fresh.cards
        .map((card, i) => ({ card, i }))
        .filter((x) => !x.card.matched && !x.card.flipped);
      if (open.length < 2) return;

      const groups = groupByParId(open);
      const pair = Object.values(groups).find((arr) => arr.length >= 2);
      let first;
      let second;
      if (pair && Math.random() < BOT_BALANCE.memoryKnownPair) {
        first = pair[0].i;
        second = pair[1].i;
      } else {
        const rnd = shuffle(open);
        first = rnd[0].i;
        second = rnd[1].i;
      }

      ui.text("memoria-msg", `${p.name} está jogando...`);
      this.pickCore(first);
      setTimeout(() => {
        const latest = state.games.memoria;
        if (!latest || latest.done || latest.sid !== sid) return;
        this.pickCore(second);
      }, BOT_TIMING.memorySecondPick);
    }, BOT_TIMING.memoryThink);
  },

  checkEnd() {
    const g = state.games.memoria;
    if (!g) return false;
    if (!g.cards.every((c) => c.matched)) return false;
    g.done = true;
    this.stopTimer();

    const rank = [...g.players].sort((a, b) => b.score - a.score);
    const top = rank[0].score;
    const winners = rank.filter((p) => p.score === top);
    const msg =
      winners.length > 1
        ? `Empate entre ${winners.map((w) => w.name).join(", ")} com ${pluralize(top, "par", "pares")}.`
        : `${winners[0].name} venceu com ${top} pares.`;
    ui.text("memoria-msg", msg);
    ui.confetti();
    const elapsedSeconds = Math.floor((Date.now() - g.startedAt) / 1000);
    const report = gamification.createReport({
      gameName: "Memória Camble",
      message: msg,
      players: g.players,
      summary: [
        { label: "Pares do baralho", value: pluralize(g.cards.length / 2, "par", "pares") },
        { label: "Movimentos", value: String(g.moves) },
        { label: "Tempo", value: formatTime(elapsedSeconds) }
      ],
      features: [
        {
          key: "score",
          label: "Pares encontrados",
          shortLabel: "Pares",
          highlightLabel: "Mais pares encontrados",
          higherIsBetter: true,
          primary: true,
          weight: 3,
          value: (player) => player.score,
          format: (value) => pluralize(value, "par", "pares")
        }
      ]
    });
    ui.feedback("Fim da partida - Memória Camble", msg, () => this.start(), report);
    return true;
  },

  startTimer() {
    this.stopTimer();
    state.timers.memoria = setInterval(() => {
      const g = state.games.memoria;
      if (!g || g.done) return;
      ui.text("memoria-tempo", formatTime(Math.floor((Date.now() - g.startedAt) / 1000)));
    }, 1000);
  },

  stopTimer() {
    if (state.timers.memoria) {
      clearInterval(state.timers.memoria);
      state.timers.memoria = null;
    }
  },

  reset() {
    this.stopTimer();
    state.games.memoria = null;
    ui.text("memoria-msg", "Abra Configurações para escolher o modo e iniciar a partida.");
    ui.text("memoria-turno", "-");
    ui.text("memoria-movimentos", "0");
    ui.text("memoria-tempo", "00:00");
    document.getElementById("memoria-tabuleiro").innerHTML = "";
    document.getElementById("memoria-placar").innerHTML = "";
  }
};

const dominoGame = {
  start() {
    const data = state.data.domino;
    if (!data) return;

    const mode = document.getElementById("domino-modo").value;
    const total = Number(document.getElementById("domino-jogadores").value);
    const level = document.getElementById("domino-nivel").value;
    const groups = this.buildGroups(data, level);
    if (groups.length < 2) {
      ui.text("domino-msg", "Não há grupos suficientes para montar o dominó.");
      return;
    }

    const pieces = shuffle(this.buildPieces(groups));
    const players = createPlayers(mode, total, "Jogador").map((p) => ({
      ...p,
      hand: [],
      score: 0,
      passes: 0,
      buys: 0
    }));

    const handSize = this.handSizeByLevel(level);
    for (let round = 0; round < handSize; round += 1) {
      players.forEach((player) => {
        if (pieces.length > 0) {
          player.hand.push(pieces.shift());
        }
      });
    }

    state.games.domino = {
      sid: Date.now(),
      mode,
      groups,
      groupMap: Object.fromEntries(groups.map((g) => [g.id, g])),
      players,
      pile: pieces,
      chain: [],
      turn: 0,
      startGroup: groups[0].id,
      pending: null,
      passStreak: 0,
      done: false,
      locked: false
    };

    document.getElementById("domino-log").innerHTML = "";
    ui.log("domino-log", "Partida iniciada.");
    ui.text(
      "domino-msg",
      `Jogador 1 começa. Para abrir a mesa, a peça precisa ter ${groups[0].options[0]}.`
    );
    this.render();
    this.runTurn();
  },

  buildGroups(data, level) {
    const order = [];
    const grouped = {};
    data.cartas.forEach((card) => {
      if (!grouped[card.parId]) {
        grouped[card.parId] = [];
        order.push(card.parId);
      }
      grouped[card.parId].push(card.valor);
    });

    const countMap = { facil: 5, medio: 6, dificil: 7 };
    const wanted = countMap[level] || 6;
    return order
      .map((id) => ({
        id,
        options: [...new Set(grouped[id])].slice(0, 2)
      }))
      .filter((g) => g.options.length >= 2)
      .slice(0, wanted);
  },

  handSizeByLevel(level) {
    const map = { facil: 5, medio: 6, dificil: 7 };
    return map[level] || 6;
  },

  buildPieces(groups) {
    const pieces = [];
    let seq = 1;
    for (let i = 0; i < groups.length; i += 1) {
      for (let j = i; j < groups.length; j += 1) {
        const leftGroup = groups[i];
        const rightGroup = groups[j];
        pieces.push({
          id: `dom_${seq++}`,
          left: {
            group: leftGroup.id,
            label: leftGroup.options[randInt(0, leftGroup.options.length - 1)]
          },
          right: {
            group: rightGroup.id,
            label: rightGroup.options[randInt(0, rightGroup.options.length - 1)]
          }
        });
      }
    }
    return pieces;
  },

  groupColor(groupId) {
    const palette = ["#8ec1ff", "#ffa775", "#ffe778", "#98e293", "#c8a4ff", "#8be6f2", "#ffb2da", "#c7f59a"];
    const key = String(groupId || "");
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) {
      hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  },

  plainLabel(label) {
    return String(label ?? "")
      .replace(/\s+/g, " ")
      .trim();
  },

  groupLabel(g, groupId) {
    return this.plainLabel(g.groupMap[groupId]?.options?.[0] || groupId);
  },

  pieceHtml(piece) {
    return `
      <span class="domino-half" style="--half-bg:${escapeAttr(this.groupColor(piece.left.group))}">${escapeHtml(
      piece.left.label
    )}</span>
      <span class="domino-divider"></span>
      <span class="domino-half" style="--half-bg:${escapeAttr(this.groupColor(piece.right.group))}">${escapeHtml(
      piece.right.label
    )}</span>
    `;
  },

  getPlayOptions(g, piece) {
    if (!g || !piece) return [];

    if (g.chain.length === 0) {
      return piece.left.group === g.startGroup || piece.right.group === g.startGroup ? ["start"] : [];
    }

    const leftGroup = g.chain[0].left.group;
    const rightGroup = g.chain[g.chain.length - 1].right.group;
    const options = [];
    if (piece.left.group === leftGroup || piece.right.group === leftGroup) options.push("left");
    if (piece.left.group === rightGroup || piece.right.group === rightGroup) options.push("right");
    return options;
  },

  renderBoard(g) {
    const board = document.getElementById("domino-board");
    board.innerHTML = "";

    if (!g.chain.length) {
      board.innerHTML = `
        <p class="domino-empty">
          Mesa vazia. A primeira peça precisa ter <strong>${escapeHtml(this.groupLabel(g, g.startGroup))}</strong>.
        </p>
      `;
      return;
    }

    g.chain.forEach((piece) => {
      const el = document.createElement("article");
      el.className = "domino-piece domino-table-piece";
      el.innerHTML = this.pieceHtml(piece);
      board.appendChild(el);
    });
  },

  renderHand(g, current) {
    const handBox = document.getElementById("domino-mao");
    handBox.innerHTML = "";

    if (current.isBot) {
      handBox.innerHTML = `<p class="domino-empty">${escapeHtml(current.name)} está pensando...</p>`;
      return;
    }

    if (!current.hand.length) {
      handBox.innerHTML = `<p class="domino-empty">Sem peças na mão.</p>`;
      return;
    }

    current.hand.forEach((piece, i) => {
      const options = this.getPlayOptions(g, piece);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `domino-piece domino-hand-piece ${options.length ? "playable" : ""} ${
        g.pending?.pieceId === piece.id ? "selected" : ""
      }`;
      btn.disabled = g.done || g.locked;
      btn.innerHTML = this.pieceHtml(piece);
      btn.addEventListener("click", () => this.selectHumanPiece(i));
      handBox.appendChild(btn);
    });
  },

  renderActions(g, current) {
    const actions = document.getElementById("domino-acoes");
    actions.innerHTML = "";
    if (g.done || current.isBot) return;

    if (g.pending) {
      actions.innerHTML = `
        <p>Escolha o lado para encaixar a peça.</p>
        <div class="modal-actions">
          ${g.pending.options.includes("left") ? '<button class="btn btn-primary" data-side="left">Esquerda</button>' : ""}
          ${g.pending.options.includes("right") ? '<button class="btn btn-primary" data-side="right">Direita</button>' : ""}
          ${g.pending.options.includes("start") ? '<button class="btn btn-primary" data-side="start">Abrir mesa</button>' : ""}
          <button class="btn btn-outline" data-side="cancel">Cancelar</button>
        </div>
      `;
      actions.querySelectorAll("[data-side]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const side = btn.dataset.side;
          if (side === "cancel") {
            g.pending = null;
            this.render();
            return;
          }
          this.playFromHand(g.pending.index, side);
        });
      });
      return;
    }

    const hasMove = current.hand.some((piece) => this.getPlayOptions(g, piece).length > 0);
    const canBuy = g.chain.length > 0 && g.pile.length > 0;
    const helpText = hasMove
      ? "Selecione uma peça para jogar."
      : canBuy
        ? "Sem jogada válida. Você pode comprar uma peça."
        : "Sem jogada válida. Clique em Passar vez.";

    actions.innerHTML = `
      <p>${helpText}</p>
      <div class="modal-actions">
        ${canBuy ? '<button id="domino-comprar" class="btn btn-outline">Comprar peça</button>' : ""}
        <button id="domino-passar" class="btn btn-secondary">Passar vez</button>
      </div>
    `;

    const buyBtn = actions.querySelector("#domino-comprar");
    if (buyBtn) {
      buyBtn.addEventListener("click", () => this.buyPiece(false));
    }
    actions.querySelector("#domino-passar").addEventListener("click", () => this.passTurn("sem jogada"));
  },

  render() {
    const g = state.games.domino;
    if (!g) return;

    const current = g.players[g.turn];
    ui.text("domino-turno", current.name);
    ui.text("domino-restantes", `${current.hand.length} (Monte ${g.pile.length})`);
    ui.text(
      "domino-extremos",
      g.chain.length
        ? `${this.groupLabel(g, g.chain[0].left.group)} | ${this.groupLabel(g, g.chain[g.chain.length - 1].right.group)}`
        : "-"
    );

    ui.score("domino-placar", g.players, g.turn, (p) => `Pontos: ${p.score} | Mão: ${p.hand.length} | Compras: ${p.buys}`);
    this.renderBoard(g);
    this.renderHand(g, current);
    this.renderActions(g, current);
  },

  selectHumanPiece(index) {
    const g = state.games.domino;
    if (!g || g.done || g.locked) return;
    const player = g.players[g.turn];
    if (player.isBot) return;

    const piece = player.hand[index];
    if (!piece) return;

    const options = this.getPlayOptions(g, piece);
    if (!options.length) {
      ui.text("domino-msg", "Essa peça não encaixa agora.");
      return;
    }

    if (options.length === 1) {
      this.playFromHand(index, options[0]);
      return;
    }

    g.pending = { index, pieceId: piece.id, options };
    ui.text("domino-msg", "Escolha em qual lado da mesa deseja encaixar.");
    this.render();
  },

  buyPiece(autoPassIfNoMove) {
    const g = state.games.domino;
    if (!g || g.done || g.locked) return;
    const player = g.players[g.turn];

    if (g.chain.length === 0) {
      ui.text("domino-msg", "A mesa ainda não foi aberta. Sem compra nesta fase inicial.");
      return;
    }

    if (!g.pile.length) {
      if (autoPassIfNoMove) {
        this.passTurn("monte vazio");
      } else {
        ui.text("domino-msg", "Monte vazio. Passe a vez.");
      }
      return;
    }

    const drawn = g.pile.shift();
    player.hand.push(drawn);
    player.buys += 1;
    ui.log("domino-log", `${player.name} comprou uma peça do monte.`);

    const options = this.getPlayOptions(g, drawn);
    this.render();

    if (player.isBot) {
      if (!options.length) {
        this.passTurn("comprou e não encaixou");
        return;
      }
      const side = options.includes("right") ? "right" : options[0];
      const sid = g.sid;
      setTimeout(() => {
        const fresh = state.games.domino;
        if (!fresh || fresh.done || fresh.sid !== sid) return;
        if (fresh.players[fresh.turn].id !== player.id) return;
        const idx = fresh.players[fresh.turn].hand.findIndex((piece) => piece.id === drawn.id);
        if (idx >= 0) this.playFromHand(idx, side);
      }, BOT_TIMING.dominoAfterBuy);
      return;
    }

    if (!options.length) {
      ui.text("domino-msg", "Peça comprada não encaixou. Passe a vez.");
    } else {
      ui.text("domino-msg", "Peça comprada encaixa! Clique nela para jogar.");
    }
  },

  playFromHand(index, side) {
    const g = state.games.domino;
    if (!g || g.done || g.locked) return;

    const player = g.players[g.turn];
    const piece = player.hand[index];
    if (!piece) return;

    const options = this.getPlayOptions(g, piece);
    if (!options.includes(side)) {
      ui.text("domino-msg", "Jogada inválida para essa peça.");
      return;
    }

    g.locked = true;
    let placed = null;

    if (g.chain.length === 0) {
      placed =
        piece.left.group === g.startGroup
          ? { id: piece.id, left: { ...piece.left }, right: { ...piece.right } }
          : { id: piece.id, left: { ...piece.right }, right: { ...piece.left } };
      g.chain.push(placed);
    } else if (side === "left") {
      const target = g.chain[0].left.group;
      placed =
        piece.right.group === target
          ? { id: piece.id, left: { ...piece.left }, right: { ...piece.right } }
          : { id: piece.id, left: { ...piece.right }, right: { ...piece.left } };
      g.chain.unshift(placed);
    } else if (side === "right") {
      const target = g.chain[g.chain.length - 1].right.group;
      placed =
        piece.left.group === target
          ? { id: piece.id, left: { ...piece.left }, right: { ...piece.right } }
          : { id: piece.id, left: { ...piece.right }, right: { ...piece.left } };
      g.chain.push(placed);
    } else {
      g.locked = false;
      return;
    }

    player.hand.splice(index, 1);
    player.score += placed.left.group === placed.right.group ? 2 : 1;
    g.passStreak = 0;
    g.pending = null;
    g.locked = false;

    const where = side === "left" ? "na esquerda" : side === "right" ? "na direita" : "na abertura";
    ui.log(
      "domino-log",
      `${player.name} encaixou [${this.plainLabel(placed.left.label)} | ${this.plainLabel(placed.right.label)}] ${where}.`
    );
    ui.text("domino-msg", `${player.name} jogou uma peça.`);
    this.render();

    if (this.finishIfWinner(player)) return;
    this.nextTurn();
  },

  passTurn(reason) {
    const g = state.games.domino;
    if (!g || g.done) return;

    const player = g.players[g.turn];
    player.passes += 1;
    if (g.chain.length === 0 || g.pile.length === 0) {
      g.passStreak += 1;
    } else {
      g.passStreak = 0;
    }
    g.pending = null;

    ui.log("domino-log", `${player.name} passou a vez (${reason}).`);
    ui.text("domino-msg", `${player.name} passou a vez.`);
    this.render();

    if (g.passStreak >= g.players.length && (g.chain.length === 0 || g.pile.length === 0)) {
      this.finishBlocked();
      return;
    }

    this.nextTurn();
  },

  nextTurn() {
    const g = state.games.domino;
    if (!g || g.done) return;
    g.turn = (g.turn + 1) % g.players.length;
    this.render();
    if (this.shouldPauseForHandoff()) {
      this.openHandoffModal();
      return;
    }
    this.runTurn();
  },

  shouldPauseForHandoff() {
    const g = state.games.domino;
    if (!g || g.done || g.mode !== "grupo") return false;
    const current = g.players[g.turn];
    if (!current || current.isBot) return false;
    return g.players.filter((p) => !p.isBot).length > 1;
  },

  openHandoffModal() {
    const g = state.games.domino;
    if (!g || g.done) return;
    const modal = document.getElementById("modal-domino-pass");
    if (!modal) return;
    const current = g.players[g.turn];
    const previous = g.players[(g.turn - 1 + g.players.length) % g.players.length];
    document.getElementById("modal-domino-pass-title").textContent = `Vez de ${current.name}`;
    document.getElementById("modal-domino-pass-texto").textContent =
      `${previous.name} terminou a jogada. Passe o aparelho para ${current.name} sem mostrar a mão.`;
    if (!modal.open) modal.showModal();
  },

  resumeAfterHandoff() {
    const modal = document.getElementById("modal-domino-pass");
    if (modal?.open) modal.close();
    const g = state.games.domino;
    if (!g || g.done) return;
    this.runTurn();
  },

  runTurn() {
    const g = state.games.domino;
    if (!g || g.done) return;

    const p = g.players[g.turn];
    const hasMove = p.hand.some((piece) => this.getPlayOptions(g, piece).length > 0);

    if (p.isBot) {
      if (!hasMove) {
        const sid = g.sid;
        setTimeout(() => {
          const fresh = state.games.domino;
          if (!fresh || fresh.done || fresh.sid !== sid) return;
          if (fresh.players[fresh.turn].id !== p.id) return;
          if (fresh.chain.length > 0 && fresh.pile.length > 0) {
            this.buyPiece(true);
          } else {
            this.passTurn("sem peça para encaixar");
          }
        }, BOT_TIMING.dominoNoMove);
        return;
      }
      const sid = g.sid;
      setTimeout(() => {
        const fresh = state.games.domino;
        if (!fresh || fresh.done || fresh.sid !== sid) return;
        this.botPlay();
      }, BOT_TIMING.dominoPlay);
      return;
    }

    if (!hasMove) {
      if (g.chain.length === 0) {
        ui.text("domino-msg", `${p.name} não tem a peça inicial (${this.groupLabel(g, g.startGroup)}). Passe a vez.`);
      } else if (g.pile.length > 0) {
        ui.text("domino-msg", `${p.name} não tem jogada válida. Compre uma peça ou passe a vez.`);
      } else {
        ui.text("domino-msg", `${p.name} não tem jogada válida. Passe a vez.`);
      }
      this.render();
      return;
    }

    if (g.chain.length === 0 && g.turn === 0) {
      ui.text("domino-msg", `${p.name}: inicie com peça contendo ${this.groupLabel(g, g.startGroup)}.`);
    } else {
      ui.text("domino-msg", `${p.name}: escolha uma peça da sua mão.`);
    }
    this.render();
  },

  botPlay() {
    const g = state.games.domino;
    if (!g || g.done) return;

    const p = g.players[g.turn];
    if (!p.isBot) return;

    const moves = [];
    p.hand.forEach((piece, index) => {
      this.getPlayOptions(g, piece).forEach((side) => {
        let weight = 1;
        if (piece.left.group === piece.right.group) weight += 2;
        if (side === "start") weight += 1;
        moves.push({ index, side, weight });
      });
    });

    if (!moves.length) {
      if (g.chain.length > 0 && g.pile.length > 0) {
        this.buyPiece(true);
      } else {
        this.passTurn("sem peça para encaixar");
      }
      return;
    }

    const smart = Math.random() < BOT_BALANCE.dominoKnownPair;
    const chosen = smart
      ? [...moves].sort((a, b) => b.weight - a.weight)[0]
      : shuffle(moves)[0];
    this.playFromHand(chosen.index, chosen.side);
  },

  createEndReport(message) {
    const g = state.games.domino;
    return gamification.createReport({
      gameName: "Dominó Camble",
      message,
      players: g.players,
      summary: [
        { label: "Peças na mesa", value: String(g.chain.length) },
        { label: "Monte final", value: pluralize(g.pile.length, "peça") },
        { label: "Jogadores", value: String(g.players.length) }
      ],
      features: [
        {
          key: "remaining",
          label: "Peças na mão",
          shortLabel: "Mão",
          highlightLabel: "Menor mão final",
          higherIsBetter: false,
          primary: true,
          weight: 3,
          value: (player) => player.hand.length,
          format: (value) => pluralize(value, "peça")
        },
        {
          key: "score",
          label: "Pontos de encaixe",
          shortLabel: "Pontos",
          highlightLabel: "Mais pontos de encaixe",
          higherIsBetter: true,
          weight: 2,
          value: (player) => player.score,
          format: (value) => pluralize(value, "ponto")
        },
        {
          key: "buys",
          label: "Compras",
          shortLabel: "Compras",
          highlightLabel: "Menos compras",
          higherIsBetter: false,
          weight: 1,
          value: (player) => player.buys,
          format: (value) => pluralize(value, "compra")
        },
        {
          key: "passes",
          label: "Passes",
          shortLabel: "Passes",
          highlightLabel: "Menos passes",
          higherIsBetter: false,
          weight: 1,
          value: (player) => player.passes,
          format: (value) => pluralize(value, "passe")
        }
      ]
    });
  },

  finishIfWinner(player) {
    const g = state.games.domino;
    if (!g || player.hand.length > 0) return false;

    g.done = true;
    const msg = `${player.name} venceu esvaziando a mão!`;
    ui.log("domino-log", msg);
    ui.text("domino-msg", msg);
    ui.confetti();
    ui.feedback("Fim da partida - Dominó", msg, () => this.start(), this.createEndReport(msg));
    return true;
  },

  finishBlocked() {
    const g = state.games.domino;
    if (!g) return;

    g.done = true;
    const ordered = [...g.players].sort((a, b) => a.hand.length - b.hand.length || b.score - a.score);
    const best = ordered[0];
    const tied = ordered.filter((p) => p.hand.length === best.hand.length && p.score === best.score);
    const header = g.chain.length === 0 ? "Ninguém tinha a peça inicial." : "A mesa travou sem jogadas válidas.";
    const msg =
      tied.length > 1
        ? `${header} Empate entre ${tied.map((p) => p.name).join(", ")} com ${pluralize(best.hand.length, "peça")} na mão.`
        : `${header} ${best.name} venceu com ${pluralize(best.hand.length, "peça")} na mão.`;

    ui.log("domino-log", msg);
    ui.text("domino-msg", msg);
    ui.feedback("Fim da partida - Dominó", msg, () => this.start(), this.createEndReport(msg));
  },

  reset() {
    state.games.domino = null;
    const modal = document.getElementById("modal-domino-pass");
    if (modal?.open) modal.close();
    ui.text("domino-msg", "Abra Configurações para escolher o modo e iniciar a partida.");
    ui.text("domino-turno", "-");
    ui.text("domino-restantes", "0");
    ui.text("domino-extremos", "-");
    document.getElementById("domino-board").innerHTML = "";
    document.getElementById("domino-placar").innerHTML = "";
    document.getElementById("domino-mao").innerHTML = "";
    document.getElementById("domino-acoes").innerHTML = "";
    document.getElementById("domino-log").innerHTML = "";
  }
};

const unoGame = {
  start() {
    const data = state.data.uno;
    if (!data) return;
    const mode = document.getElementById("uno-modo").value;
    const total = Number(document.getElementById("uno-jogadores").value);
    const rounds = Number(document.getElementById("uno-rodadas").value || data.rodadasPadrao || 6);

    state.games.uno = {
      sid: Date.now(),
      mode,
      players: createPlayers(mode, total, "Jogador").map((p) => ({
        ...p,
        points: 0,
        hand: [],
        swapped: false,
        currentSequence: null,
        currentNumber: null,
        currentDiff: null,
        cambleText: ""
      })),
      round: 0,
      totalRounds: rounds,
      targetDigits: [],
      targetSequence: "",
      targetNumber: null,
      numberWords: { ...data.dicionarioNumeros },
      sheet: Array.from({ length: rounds }, (_, index) => ({
        round: index + 1,
        targetSequence: "",
        targetNumber: null,
        players: {}
      })),
      deck: [],
      turn: 0,
      phase: "setup",
      busy: false
    };
    document.getElementById("uno-log").innerHTML = "";
    this.render();
    this.renderNumberSetup();
  },

  renderNumberSetup() {
    const g = state.games.uno;
    if (!g) return;
    const panel = document.getElementById("uno-jogada");
    const rows = Array.from({ length: 10 }, (_, digit) => {
      const value = g.numberWords[String(digit)] || "";
      return `
        <label class="uno-number-item">
          <span>${digit}</span>
          <input type="text" data-uno-number="${digit}" value="${escapeAttr(value)}" aria-label="Palavra em camble para ${digit}">
        </label>
      `;
    }).join("");

    panel.innerHTML = `
      <h3>Ficha dos números</h3>
      <p>Preencha as palavras em camble que serão usadas nas cartas numeradas de 0 a 9.</p>
      <div class="uno-number-grid">${rows}</div>
      <div class="modal-actions">
        <button id="uno-number-save" class="btn btn-primary">Salvar e começar</button>
      </div>
      <p id="uno-number-msg" class="message compact-message"></p>
    `;

    panel.querySelector("#uno-number-save").addEventListener("click", () => {
      const nextWords = {};
      panel.querySelectorAll("[data-uno-number]").forEach((input) => {
        nextWords[input.dataset.unoNumber] = normalizeCambleInput(input.value);
      });
      const missing = Object.entries(nextWords)
        .filter(([, value]) => !value)
        .map(([digit]) => digit);
      if (missing.length) {
        panel.querySelector("#uno-number-msg").textContent = `Preencha os números: ${missing.join(", ")}.`;
        return;
      }
      g.numberWords = nextWords;
      ui.log("uno-log", "Ficha dos números preenchida.");
      this.startRound();
    });
  },

  startRound() {
    const g = state.games.uno;
    const data = state.data.uno;
    if (!g || !data) return;
    g.round += 1;
    g.deck = shuffle([...data.cartas]);
    g.targetDigits = [g.deck.shift(), g.deck.shift(), g.deck.shift()];
    g.targetSequence = "";
    g.targetNumber = null;
    g.turn = 0;
    g.phase = "target";
    g.busy = false;
    g.players.forEach((p) => {
      p.hand = [];
      p.swapped = false;
      p.currentSequence = null;
      p.currentNumber = null;
      p.currentDiff = null;
      p.cambleText = "";
    });
    this.render();
    this.renderTargetBuilder();
  },

  renderTargetBuilder() {
    const g = state.games.uno;
    if (!g) return;
    const panel = document.getElementById("uno-jogada");
    const options = sequenceOptionsFromDigits(g.targetDigits, null);
    let chosenSequence = g.targetDigits.join("");

    panel.innerHTML = `
      <h3>Rodada ${g.round}: número da mesa</h3>
      <p>As 3 cartas da mesa foram sorteadas. Crie a sequência que será o alvo da rodada.</p>
      <div class="digit-cards">
        ${g.targetDigits.map((digit) => `<span class="digit-card">${digit}</span>`).join("")}
      </div>
      <section class="uno-choice-panel" aria-labelledby="uno-target-title">
        <div class="uno-choice-head">
          <strong id="uno-target-title">Número da mesa</strong>
          <span id="uno-target-current" class="uno-choice-current">${chosenSequence}</span>
        </div>
        <div class="uno-choice-grid" role="listbox" aria-label="Escolha do número da mesa">
          ${options
            .map(
              (option) => `
                <button
                  class="uno-choice-btn ${option.sequence === chosenSequence ? "selected" : ""}"
                  type="button"
                  data-target-sequence="${option.sequence}"
                  aria-selected="${option.sequence === chosenSequence ? "true" : "false"}"
                >
                  ${option.sequence}
                </button>
              `
            )
            .join("")}
        </div>
      </section>
      <div class="uno-write-preview">
        <strong>Por extenso em camble</strong>
        <span id="uno-target-camble">${escapeHtml(cambleTextForSequence(chosenSequence, g.numberWords))}</span>
      </div>
      <div class="modal-actions">
        <button id="uno-target-confirm" class="btn btn-primary">Confirmar número da mesa</button>
      </div>
    `;

    const current = panel.querySelector("#uno-target-current");
    const camble = panel.querySelector("#uno-target-camble");
    panel.querySelectorAll("[data-target-sequence]").forEach((btn) => {
      btn.addEventListener("click", () => {
        chosenSequence = btn.dataset.targetSequence;
        panel.querySelectorAll("[data-target-sequence]").forEach((choiceBtn) => {
          const active = choiceBtn === btn;
          choiceBtn.classList.toggle("selected", active);
          choiceBtn.setAttribute("aria-selected", String(active));
        });
        current.textContent = chosenSequence;
        camble.textContent = cambleTextForSequence(chosenSequence, g.numberWords);
      });
    });

    panel.querySelector("#uno-target-confirm").addEventListener("click", () => {
      g.targetSequence = chosenSequence;
      g.targetNumber = Number(chosenSequence);
      const record = g.sheet[g.round - 1];
      if (record) {
        record.targetSequence = chosenSequence;
        record.targetNumber = g.targetNumber;
      }
      g.players.forEach((p) => {
        p.hand = [g.deck.shift(), g.deck.shift(), g.deck.shift()];
      });
      g.phase = "turn";
      ui.log("uno-log", `Rodada ${g.round} | Mesa ${chosenSequence}`);
      this.render();
      this.runTurn();
    });
  },

  render() {
    const g = state.games.uno;
    if (!g) return;
    ui.text("uno-rodada", `${g.round}/${g.totalRounds}`);
    ui.text("uno-alvo", g.targetSequence || (g.targetNumber == null ? "---" : String(g.targetNumber)));
    const turnName = g.phase === "setup" ? "Ficha" : g.phase === "target" ? "Mesa" : g.players[g.turn]?.name || "-";
    ui.text("uno-vez", turnName);
    ui.score("uno-placar", g.players, g.turn < g.players.length ? g.turn : -1, (p) => {
      const n = p.currentSequence != null ? ` | Número: ${p.currentSequence}` : "";
      return `Pontos: ${p.points}${n}`;
    });
    this.renderSheet();
  },

  renderSheet() {
    const box = document.getElementById("uno-ficha");
    const g = state.games.uno;
    if (!box) return;
    if (!g) {
      box.innerHTML = "";
      return;
    }

    const playerHeads = g.players.map((p) => `<th>${escapeHtml(p.name)}</th>`).join("");
    const rows = g.sheet
      .map(
        (record) => `
          <tr>
            <td>${record.round}</td>
            <td>${escapeHtml(record.targetSequence || "-")}</td>
            ${g.players
              .map((p) => {
                const entry = record.players[p.id];
                return `<td>${entry ? `${escapeHtml(entry.sequence)}<small>${escapeHtml(entry.cambleText)}</small>` : "-"}</td>`;
              })
              .join("")}
          </tr>
        `
      )
      .join("");

    box.innerHTML = `
      <h3>Ficha de anotação</h3>
      <div class="uno-sheet-scroll">
        <table>
          <thead>
            <tr>
              <th>Rod.</th>
              <th>Mesa</th>
              ${playerHeads}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  },

  runTurn() {
    const g = state.games.uno;
    if (!g || g.phase !== "turn") return;
    if (g.turn >= g.players.length) {
      this.resolveRound();
      return;
    }
    this.render();
    const p = g.players[g.turn];
    if (p.isBot) this.runBot(p);
    else this.renderHuman(p);
  },

  renderHuman(player) {
    const g = state.games.uno;
    if (!g) return;
    const panel = document.getElementById("uno-jogada");
    const options = sequenceOptionsFromDigits(player.hand, g.targetNumber);
    const best = bestSequenceFromHand(player.hand, g.targetNumber);
    const defaultChoice = best?.sequence || options[0]?.sequence || player.hand.join("");
    let chosenSequence = defaultChoice;

    panel.innerHTML = `
      <h3>Vez de ${escapeHtml(player.name)}</h3>
      <p>Mesa: <strong>${escapeHtml(g.targetSequence || String(g.targetNumber))}</strong></p>
      <p><strong>Objetivo:</strong> com suas 3 cartas, crie a sequência mais próxima possível e registre por extenso em camble.</p>
      <div class="digit-cards" id="uno-hand">
        ${player.hand
          .map(
            (digit, i) =>
              `<button class="digit-card pick" type="button" data-hand="${i}" ${player.swapped ? "disabled" : ""}>${digit}</button>`
          )
          .join("")}
      </div>
      <small>${player.swapped ? "Troca já utilizada nesta rodada." : "Opcional: marque uma carta e troque por outra do monte sem ver."}</small>
      <div class="modal-actions">
        <button class="btn btn-outline" id="uno-trocar" ${player.swapped ? "disabled" : ""}>Trocar carta selecionada</button>
      </div>
      <section class="uno-choice-panel" aria-labelledby="uno-choice-title">
        <div class="uno-choice-head">
          <strong id="uno-choice-title">Escolha seu número final</strong>
          <span id="uno-choice-current" class="uno-choice-current">${defaultChoice}</span>
        </div>
        <div id="uno-final" class="uno-choice-grid" role="listbox" aria-label="Escolha do número final">
          ${options
            .map((option) => {
              const selected = option.sequence === defaultChoice;
              return `
                <button
                  class="uno-choice-btn ${selected ? "selected" : ""}"
                  type="button"
                  data-final="${option.sequence}"
                  aria-selected="${selected ? "true" : "false"}"
                >
                  ${option.sequence}
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
      <label class="uno-write-label">
        Número por extenso em camble
        <textarea id="uno-camble-text" rows="2">${escapeHtml(cambleTextForSequence(defaultChoice, g.numberWords))}</textarea>
      </label>
      <div class="modal-actions">
        <button class="btn btn-primary" id="uno-confirmar">Confirmar jogada</button>
      </div>
    `;

    let swap = null;
    panel.querySelectorAll("[data-hand]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (player.swapped) return;
        const idx = Number(btn.dataset.hand);
        swap = swap === idx ? null : idx;
        panel.querySelectorAll("[data-hand]").forEach((b) => {
          b.classList.toggle("selected", Number(b.dataset.hand) === swap);
        });
      });
    });

    const choiceCurrent = panel.querySelector("#uno-choice-current");
    const cambleTextInput = panel.querySelector("#uno-camble-text");
    panel.querySelectorAll("[data-final]").forEach((btn) => {
      btn.addEventListener("click", () => {
        chosenSequence = btn.dataset.final;
        panel.querySelectorAll("[data-final]").forEach((choiceBtn) => {
          const active = choiceBtn === btn;
          choiceBtn.classList.toggle("selected", active);
          choiceBtn.setAttribute("aria-selected", String(active));
        });
        if (choiceCurrent) choiceCurrent.textContent = chosenSequence;
        if (cambleTextInput) cambleTextInput.value = cambleTextForSequence(chosenSequence, g.numberWords);
      });
    });

    panel.querySelector("#uno-trocar")?.addEventListener("click", () => {
      if (player.swapped || swap == null) return;
      const newDigit = g.deck.shift();
      if (Number.isFinite(newDigit)) {
        const oldDigit = player.hand[swap];
        player.hand[swap] = newDigit;
        player.swapped = true;
        ui.log("uno-log", `${player.name} trocou ${oldDigit} por uma carta do monte.`);
        this.renderHuman(player);
      }
    });

    panel.querySelector("#uno-confirmar").addEventListener("click", () => {
      if (g.busy) return;
      g.busy = true;
      const selected = options.find((option) => option.sequence === chosenSequence) || bestSequenceFromHand(player.hand, g.targetNumber);
      player.currentSequence = selected.sequence;
      player.currentNumber = selected.value;
      player.currentDiff = selected.diff;
      player.cambleText = cambleTextInput.value.trim() || cambleTextForSequence(selected.sequence, g.numberWords);
      this.recordPlayerRound(player);
      ui.log("uno-log", `${player.name}: ${selected.sequence} (${player.cambleText})`);
      g.turn += 1;
      g.busy = false;
      this.render();
      this.runTurn();
    });
  },

  runBot(player) {
    const g = state.games.uno;
    if (!g) return;
    const sid = g.sid;
    setTimeout(() => {
      const fresh = state.games.uno;
      if (!fresh || fresh.sid !== sid || fresh.phase !== "turn") return;

      const playSmart = Math.random() < BOT_BALANCE.unoSmartPlay;
      const bestBefore = bestSequenceFromHand(player.hand, fresh.targetNumber);

      if (playSmart && bestBefore.diff > 120 && Math.random() < BOT_BALANCE.unoSwapWhenBad) {
        const idx = randInt(0, 2);
        const d = fresh.deck.shift();
        if (Number.isFinite(d)) player.hand[idx] = d;
        player.swapped = true;
      } else if (!playSmart && Math.random() < BOT_BALANCE.unoRandomSwap) {
        const idx = randInt(0, 2);
        const d = fresh.deck.shift();
        if (Number.isFinite(d)) player.hand[idx] = d;
        player.swapped = true;
      }

      let final;
      if (playSmart) {
        final = bestSequenceFromHand(player.hand, fresh.targetNumber);
      } else {
        const options = sequenceOptionsFromDigits(player.hand, fresh.targetNumber);
        options.sort((a, b) => b.diff - a.diff);
        const worstHalf = options.slice(0, Math.max(1, Math.ceil(options.length / 2)));
        final = Math.random() < 0.7 ? worstHalf[randInt(0, worstHalf.length - 1)] : options[randInt(0, options.length - 1)];
      }

      player.currentSequence = final.sequence;
      player.currentNumber = final.value;
      player.currentDiff = final.diff;
      player.cambleText = cambleTextForSequence(final.sequence, fresh.numberWords);
      this.recordPlayerRound(player);
      ui.log("uno-log", `${player.name}: ${final.sequence}`);
      fresh.turn += 1;
      this.render();
      this.runTurn();
    }, BOT_TIMING.unoPlay);
  },

  recordPlayerRound(player) {
    const g = state.games.uno;
    const record = g?.sheet?.[g.round - 1];
    if (!record || !player.currentSequence) return;
    record.players[player.id] = {
      sequence: player.currentSequence,
      value: player.currentNumber,
      diff: player.currentDiff,
      cambleText: player.cambleText
    };
  },

  resolveRound() {
    const g = state.games.uno;
    if (!g) return;
    g.phase = "round";
    const results = g.players.map((p) => ({
      name: p.name,
      sequence: p.currentSequence,
      num: p.currentNumber,
      diff: p.currentDiff,
      cambleText: p.cambleText
    }));
    const minDiff = Math.min(...results.map((r) => r.diff));
    const winners = results.filter((r) => r.diff === minDiff);
    winners.forEach((w) => {
      const p = g.players.find((x) => x.name === w.name);
      if (p) p.points += 1;
    });
    this.render();

    const panel = document.getElementById("uno-jogada");
    panel.innerHTML = `
      <h3>Resultado da rodada ${g.round}</h3>
      <p>Mesa: <strong>${escapeHtml(g.targetSequence)}</strong>. Compare os números criados e veja quem chegou mais perto.</p>
      <ul class="uno-result-list">
        ${results
          .map(
            (r) => `
              <li>
                <strong>${escapeHtml(r.name)}</strong>
                <span>${escapeHtml(r.sequence)} - ${escapeHtml(describeNumberDistance(r.num, g.targetNumber))}</span>
                <small>${escapeHtml(r.cambleText)}</small>
              </li>
            `
          )
          .join("")}
      </ul>
      <p><strong>${winners.map((w) => w.name).join(", ")}</strong> ${winners.length === 1 ? "venceu" : "venceram"} a rodada.</p>
      <button class="btn btn-primary" id="uno-next">${g.round >= g.totalRounds ? "Ver resultado final" : "Próxima rodada"}</button>
    `;
    panel.querySelector("#uno-next").addEventListener("click", () => {
      if (g.round >= g.totalRounds) this.finish();
      else this.startRound();
    });
  },

  finish() {
    const g = state.games.uno;
    if (!g) return;
    g.phase = "done";
    const top = Math.max(...g.players.map((p) => p.points));
    const winners = g.players.filter((p) => p.points === top);
    const msg =
      winners.length > 1
        ? `Empate entre ${winners.map((w) => w.name).join(", ")} com ${pluralize(top, "ponto")}.`
        : `${winners[0].name} venceu com ${pluralize(top, "ponto")}!`;
    const playerStats = new Map(
      g.players.map((player) => {
        const entries = g.sheet.map((record) => record.players[player.id]).filter(Boolean);
        const diffs = entries.map((entry) => Number(entry.diff)).filter(Number.isFinite);
        const avgDiff = diffs.length ? diffs.reduce((sum, diff) => sum + diff, 0) / diffs.length : 0;
        return [
          player.id,
          {
            avgDiff,
            exactRounds: diffs.filter((diff) => diff === 0).length
          }
        ];
      })
    );
    const report = gamification.createReport({
      gameName: "UNO Camble",
      message: msg,
      players: g.players,
      summary: [
        { label: "Rodadas", value: String(g.totalRounds) },
        { label: "Jogadores", value: String(g.players.length) },
        { label: "Maior pontuação", value: pluralize(top, "ponto") }
      ],
      features: [
        {
          key: "points",
          label: "Pontos finais",
          shortLabel: "Pontos",
          highlightLabel: "Mais rodadas vencidas",
          higherIsBetter: true,
          primary: true,
          weight: 3,
          value: (player) => player.points,
          format: (value) => pluralize(value, "ponto")
        },
        {
          key: "avgDiff",
          label: "Distância média",
          shortLabel: "Média",
          highlightLabel: "Menor distância média",
          higherIsBetter: false,
          weight: 2,
          value: (player) => playerStats.get(player.id)?.avgDiff ?? 0,
          format: (value) => gamification.formatNumber(value, 1)
        },
        {
          key: "exactRounds",
          label: "Acertos exatos",
          shortLabel: "Exatos",
          highlightLabel: "Mais números exatos",
          higherIsBetter: true,
          weight: 1,
          value: (player) => playerStats.get(player.id)?.exactRounds ?? 0,
          format: (value) => pluralize(value, "acerto")
        }
      ]
    });
    ui.confetti();
    ui.feedback("Fim da partida - UNO", msg, () => this.start(), report);
    document.getElementById("uno-jogada").innerHTML = `
      <h3>Partida encerrada</h3>
      <p>${escapeHtml(msg)}</p>
      <button class="btn btn-primary" id="uno-restart">Jogar novamente</button>
    `;
    document.getElementById("uno-restart").addEventListener("click", () => this.start());
  },

  reset() {
    state.games.uno = null;
    ui.text("uno-rodada", "0/0");
    ui.text("uno-alvo", "---");
    ui.text("uno-vez", "-");
    document.getElementById("uno-placar").innerHTML = "";
    document.getElementById("uno-jogada").innerHTML = `
      <h3>UNO Camble</h3>
      <p>Abra Configurações para escolher as rodadas, iniciar a partida e preencher a ficha dos números.</p>
    `;
    const sheet = document.getElementById("uno-ficha");
    if (sheet) sheet.innerHTML = "";
    document.getElementById("uno-log").innerHTML = "";
  }
};

const cambleplayGame = {
  start() {
    const data = state.data.cambleplay;
    if (!data) return;
    this.stopCeaTimer();
    this.stopWalkTimers();

    const mode = document.getElementById("cp-modo").value;
    const total = Number(document.getElementById("cp-jogadores").value);
    const meta = Number(document.getElementById("cp-meta").value);
    const players = createPlayers(mode, total, "Jogador").map((p) => ({
      ...p,
      pieces: data.config.pecasIniciais,
      pos: 0
    }));

    state.games.cambleplay = {
      sid: Date.now(),
      mode,
      meta,
      board: [...data.tabuleiro],
      players,
      turn: 0,
      waiting: false,
      walking: false,
      done: false,
      lastCard: null,
      decks: {
        perguntas: shuffle([...data.perguntas]),
        sa: shuffle([...data.sorteAzar]),
        cea: shuffle([...data.cambleEmAcao])
      }
    };

    ui.text("cp-turno", players[0].name);
    ui.text("cp-dado", "-");
    document.getElementById("cp-acao").innerHTML = `
      <h3>Desafios da rodada</h3>
      <p>Clique em rolar dado para começar.</p>
    `;
    document.getElementById("cp-log").innerHTML = "";
    this.setCardPreview("Última carta", "Nenhuma carta revelada ainda.", "");
    ui.log("cp-log", "Partida iniciada.");
    this.render();
    this.botTurnMaybe();
  },

  render() {
    const g = state.games.cambleplay;
    if (!g) return;
    const current = g.players[g.turn];
    ui.text("cp-turno", current.name);
    ui.score(
      "cp-placar",
      g.players,
      g.turn,
      (p) => `<span>Peças: ${p.pieces}</span><span>Casa: ${p.pos}/${g.board.length - 1}</span>`
    );
    ui.text("cp-piece-total", `x${g.players.reduce((sum, p) => sum + p.pieces, 0)}`);
    this.renderStatusHero(g, current);

    const board = document.getElementById("cp-board");
    board.innerHTML = "";
    const center = document.createElement("div");
    center.className = "cp-center";
    board.appendChild(center);

    g.board.forEach((cell, index) => {
      const pos = CAMBLEPLAY_TRACK_POSITIONS[index] || CAMBLEPLAY_TRACK_POSITIONS[CAMBLEPLAY_TRACK_POSITIONS.length - 1];
      const el = document.createElement("article");
      const occupants = g.players.filter((p) => p.pos === index);
      const currentOnCell = current.pos === index;
      const isGoalCell = index === g.board.length - 1;
      const goalReady = isGoalCell && current.pieces >= g.meta;
      const goalBlocked = isGoalCell && currentOnCell && current.pieces < g.meta;
      el.className = `cp-cell ${cambleplayCellClass(cell)} ${occupants.length ? "has-occupant" : ""} ${currentOnCell ? "current" : ""} ${
        isGoalCell ? "goal-cell" : ""
      } ${goalReady ? "goal-ready" : ""} ${goalBlocked ? "goal-blocked" : ""}`;
      el.style.gridColumn = String(pos.x + 1);
      el.style.gridRow = String(pos.y + 1);
      const tokens = occupants
        .map((p) => `<span class="cp-token" style="background:${p.color}" title="${escapeAttr(p.name)}"></span>`)
        .join("");
      const rings = occupants
        .slice(0, 3)
        .map(
          (p, ringIndex) =>
            `<span class="cp-cell-ring" style="--ring-color:${escapeAttr(p.markerColor)};--ring-offset:${ringIndex * 4}px" aria-hidden="true"></span>`
        )
        .join("");
      el.innerHTML = `
        <span class="cp-cell-rings">${rings}</span>
        <span class="cp-cell-label">${escapeHtml(cambleplayCellLabel(cell))}</span>
        <span class="cp-cell-tokens">${tokens}</span>
      `;
      board.appendChild(el);
    });

    const rollBtn = document.getElementById("cp-rolar");
    rollBtn.disabled = g.done || g.waiting || g.walking || current.isBot;
    const rollLabel = rollBtn.querySelector(".cp-roll-label");
    const rollText = g.walking ? "Andando..." : g.waiting ? "Aguardando..." : "Rolar Dado";
    if (rollLabel) rollLabel.textContent = rollText;
    else rollBtn.textContent = rollText;
  },

  renderStatusHero(g, current) {
    const box = document.getElementById("cp-status-hero");
    if (!box || !g || !current) return;

    const casasRestantes = Math.max(0, g.board.length - 1 - current.pos);
    const pecasRestantes = Math.max(0, g.meta - current.pieces);
    let tone = "progress";
    let icon = "🎯";
    let title = `Vez de ${current.name}`;
    let text = `Faltam ${pluralize(pecasRestantes, "peça")} para vencer. Casa atual: ${current.pos}/${g.board.length - 1}.`;

    if (g.done) {
      tone = "success";
      icon = "🏆";
      title = "Partida encerrada";
      text = `${current.name} completou a meta de peças.`;
    } else if (casasRestantes === 0 && pecasRestantes > 0) {
      tone = "warning";
      icon = "🏰";
      title = "Chegada alcançada";
      text = `${current.name} chegou ao fim do percurso, mas ainda precisa de ${pluralize(pecasRestantes, "peça")}. Na próxima jogada volta ao início.`;
    } else if (pecasRestantes === 0) {
      tone = "ready";
      icon = "🧩";
      title = "Meta de peças concluída";
      text = `${current.name} completou a meta de peças.`;
    }

    box.className = `cp-status-hero tone-${tone}`;
    box.innerHTML = `
      <div class="cp-status-icon" aria-hidden="true">${icon}</div>
      <div class="cp-status-copy">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(text)}</p>
        <div class="cp-status-chips">
          <span class="cp-status-chip">Peças: ${current.pieces}/${g.meta}</span>
          <span class="cp-status-chip">Casa: ${current.pos}/${g.board.length - 1}</span>
          <span class="cp-status-chip">Dado: ${escapeHtml(document.getElementById("cp-dado")?.textContent || "-")}</span>
        </div>
      </div>
    `;
  },

  getCellGuide(player, code) {
    const g = state.games.cambleplay;
    if (!g || !player) return null;

    const pecasRestantes = Math.max(0, g.meta - player.pieces);
    const guides = {
      INICIO: {
        chip: "Casa início",
        title: "Ponto de partida",
        text: "Esta é a casa inicial do tabuleiro. Prepare-se para a próxima rodada.",
        tone: "info"
      },
      "+1": {
        chip: "Casa +1",
        title: "Ganhe uma peça",
        text: "Você recebe +1 peça imediatamente e depois passa a vez.",
        tone: "success"
      },
      "S/A": {
        chip: "Casa S/A",
        title: "Sorte ou azar",
        text: "Uma carta será revelada agora. Ela pode dar ou tirar peças e também mover seu peão.",
        tone: "warning"
      },
      "?": {
        chip: "Casa pergunta",
        title: "Responda a pergunta",
        text: "Responda corretamente para ganhar +2 peças nesta rodada.",
        tone: "info"
      },
      VC: {
        chip: "Casa VC",
        title: "Vamos contar",
        text: "Digite os três primeiros números em camble. Se errar, você perde 1 peça e os outros ganham 1.",
        tone: "info"
      },
      ADJ: {
        chip: "Casa ADJ",
        title: "Adjetivo em camble",
        text: "Fale um adjetivo em camble. Se a resposta for validada, você ganha +1 peça.",
        tone: "ready"
      },
      VPA: {
        chip: "Casa VPA",
        title: "Verbo no passado",
        text: "Fale um verbo em camble no passado. Use PA antes do verbo.",
        tone: "ready"
      },
      VPR: {
        chip: "Casa VPR",
        title: "Verbo no presente",
        text: "Fale um verbo em camble no presente para concluir a casa.",
        tone: "ready"
      },
      VF: {
        chip: "Casa VF",
        title: "Verbo no futuro",
        text: "Fale um verbo em camble no futuro. Use PA depois do verbo.",
        tone: "ready"
      },
      CEA: {
        chip: "Casa CEA",
        title: "Camble em ação",
        text: "Você fará uma mímica. Se o grupo acertar, você ganha +2 peças e os demais ganham +1.",
        tone: "warning"
      },
      CHEGADA: {
        chip: "Casa final",
        title: "Chegada",
        text:
          pecasRestantes > 0
            ? `Você chegou ao fim do percurso, mas ainda precisa de ${pluralize(pecasRestantes, "peça")} para vencer. Depois desta jogada, volte ao início para continuar coletando.`
            : "Você completou a meta de peças e pode vencer a partida.",
        tone: pecasRestantes > 0 ? "warning" : "success"
      }
    };

    return (
      guides[code] || {
        chip: `Casa ${code}`,
        title: "Instrução da casa",
        text: "Siga a orientação mostrada nesta rodada para continuar no tabuleiro.",
        tone: "info"
      }
    );
  },

  hideCellGuide(continueTurn = false) {
    if (typeof this.cellGuideCleanup === "function") {
      const cleanup = this.cellGuideCleanup;
      cleanup(continueTurn);
      return;
    }

    const guide = document.getElementById("cp-cell-guide");
    if (guide) {
      guide.hidden = true;
      guide.className = "cp-cell-guide";
      guide.innerHTML = "";
    }
    clearTimeout(state.timers.cpGuide);
    state.timers.cpGuide = null;
  },

  showCellGuide(player, code, onContinue) {
    const guideData = this.getCellGuide(player, code);
    const guide = document.getElementById("cp-cell-guide");

    if (!guideData || !guide || player.isBot) {
      onContinue();
      return;
    }

    this.hideCellGuide(false);

    let finished = false;
    const closeGuide = (continueTurn = true) => {
      if (finished) return;
      finished = true;
      clearTimeout(state.timers.cpGuide);
      state.timers.cpGuide = null;
      guide.hidden = true;
      guide.className = "cp-cell-guide";
      guide.innerHTML = "";
      guide.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      if (this.cellGuideCleanup === closeGuide) this.cellGuideCleanup = null;
      if (continueTurn) onContinue();
    };

    const handlePointerDown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeGuide(true);
    };

    const handleKeyDown = (event) => {
      if (!["Escape", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      closeGuide(true);
    };

    this.cellGuideCleanup = closeGuide;
    guide.hidden = false;
    guide.className = `cp-cell-guide tone-${guideData.tone || "info"}`;
    guide.innerHTML = `
      <article class="cp-guide-card tone-${guideData.tone || "info"}" role="dialog" aria-live="polite">
        <span class="cp-guide-chip">${escapeHtml(guideData.chip)}</span>
        <h3>${escapeHtml(guideData.title)}</h3>
        <p>${escapeHtml(guideData.text)}</p>
        <small>Toque na tela ou aguarde 8 segundos para continuar.</small>
      </article>
    `;
    guide.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    state.timers.cpGuide = setTimeout(() => closeGuide(true), 8000);
  },

  enhanceTurnFeedback(player, feedback) {
    const g = state.games.cambleplay;
    if (!g) return feedback;

    const pecasRestantes = Math.max(0, g.meta - player.pieces);
    const casasRestantes = Math.max(0, g.board.length - 1 - player.pos);
    const textBase = feedback.text ? `${feedback.text} ` : "";

    if (pecasRestantes === 0) {
      return {
        title: "Meta de peças atingida",
        text: `${textBase}${player.name} completou a meta de peças.`,
        tone: "success",
        buttonLabel: "Finalizar partida"
      };
    }

    if (casasRestantes === 0 && pecasRestantes > 0) {
      return {
        title: "Chegada alcançada",
        text: `${textBase}Ainda faltam ${pluralize(pecasRestantes, "peça")} para vencer. Volte ao início para continuar coletando.`,
        tone: "warning",
        buttonLabel: "Voltar ao início"
      };
    }

    return feedback;
  },

  showTurnFeedback(player, feedback, onContinue) {
    const box = document.getElementById("cp-acao");
    if (!box) {
      onContinue();
      return;
    }

    if (player.isBot) {
      box.innerHTML = "";
      onContinue();
      return;
    }

    const info = this.enhanceTurnFeedback(player, feedback);
    const icons = {
      success: "✅",
      warning: "🏰",
      danger: "⚠️",
      info: "🎲",
      ready: "🧩"
    };

    box.innerHTML = `
      <article class="cp-result-card tone-${info.tone || "info"}">
        <div class="cp-result-icon" aria-hidden="true">${icons[info.tone || "info"] || "🎲"}</div>
        <div class="cp-result-copy">
          <h3>${escapeHtml(info.title || "Resultado da jogada")}</h3>
          <p>${escapeHtml(info.text || "A jogada foi registrada.")}</p>
        </div>
      </article>
      <div class="modal-actions">
        <button id="cp-feedback-next" class="btn btn-primary">${escapeHtml(info.buttonLabel || "Continuar")}</button>
      </div>
    `;

    box.querySelector("#cp-feedback-next").addEventListener("click", () => {
      box.innerHTML = "";
      onContinue();
    });
  },

  stopWalkTimers() {
    if (state.timers.cpWalk) {
      clearTimeout(state.timers.cpWalk);
      state.timers.cpWalk = null;
    }
    if (state.timers.cpLanding) {
      clearTimeout(state.timers.cpLanding);
      state.timers.cpLanding = null;
    }
  },

  animateMove(player, targetPos, onArrive) {
    const g = state.games.cambleplay;
    if (!g || !player) return;

    this.stopWalkTimers();
    g.walking = true;
    const sid = g.sid;
    const playerId = player.id;

    const stepForward = () => {
      const fresh = state.games.cambleplay;
      if (!fresh || fresh.sid !== sid || fresh.done) return;
      const livePlayer = fresh.players.find((p) => p.id === playerId);
      if (!livePlayer) return;

      if (livePlayer.pos >= targetPos) {
        fresh.walking = false;
        this.render();
        onArrive?.(livePlayer);
        return;
      }

      livePlayer.pos += 1;
      this.render();
      state.timers.cpWalk = setTimeout(stepForward, 320);
    };

    stepForward();
  },

  roll(forcedBot = false) {
    const g = state.games.cambleplay;
    if (!g || g.done || g.waiting) return;
    const player = g.players[g.turn];
    if (player.isBot !== forcedBot) return;
    g.waiting = true;

    if (player.pos >= g.board.length - 1 && player.pieces < g.meta) {
      player.pos = 0;
      this.render();
      ui.log("cp-log", `${player.name} voltou ao início para continuar coletando peças.`);
    }

    const dice = randInt(1, 6);
    const targetPos = Math.min(g.board.length - 1, player.pos + dice);
    ui.text("cp-dado", String(dice));
    ui.log("cp-log", `${player.name} rolou ${dice}.`);
    this.animateMove(player, targetPos, (livePlayer) => {
      const fresh = state.games.cambleplay;
      if (!fresh || fresh.done || fresh.sid !== g.sid) return;
      ui.log("cp-log", `${livePlayer.name} chegou na casa ${livePlayer.pos}.`);
      state.timers.cpLanding = setTimeout(() => {
        const currentGame = state.games.cambleplay;
        if (!currentGame || currentGame.done || currentGame.sid !== g.sid) return;
        this.runCell(livePlayer, currentGame.board[livePlayer.pos]);
      }, 1000);
    });
  },

  runCell(player, code) {
    const g = state.games.cambleplay;
    const d = state.data.cambleplay;
    if (!g || !d) return;
    this.showCellGuide(player, code, () => this.executeCell(player, code));
  },

  executeCell(player, code) {
    const g = state.games.cambleplay;
    const d = state.data.cambleplay;
    if (!g || !d) return;

    const finishTurn = () => {
      this.render();
      if (this.checkEnd(player)) return;
      g.waiting = false;
      g.turn = (g.turn + 1) % g.players.length;
      this.render();
      this.botTurnMaybe();
    };

    if (code === "INICIO" || code === "CHEGADA") {
      if (code === "CHEGADA") {
        const needsMorePieces = player.pieces < g.meta;
        this.showTurnFeedback(
          player,
          {
            title: needsMorePieces ? "Chegada alcançada" : "Meta de peças completa",
            text: needsMorePieces
              ? `Você chegou ao fim do percurso, mas ainda precisa de ${pluralize(g.meta - player.pieces, "peça")}. Volte ao início para continuar coletando.`
              : "Você completou a meta de peças.",
            tone: needsMorePieces ? "warning" : "success",
            buttonLabel: needsMorePieces ? "Voltar ao início" : "Conferir resultado"
          },
          () => {
            if (needsMorePieces) player.pos = 0;
            finishTurn();
          }
        );
        return;
      }
      finishTurn();
      return;
    }

    if (code === "+1") {
      player.pieces += 1;
      ui.log("cp-log", `${player.name} ganhou +1 peça.`);
      this.showTurnFeedback(
        player,
        {
          title: "Peça adicionada",
          text: `${player.name} ganhou +1 peça nesta casa.`,
          tone: "success",
          buttonLabel: "Passar a vez"
        },
        finishTurn
      );
      return;
    }

    if (code === "S/A") {
      const card = drawCycling(g.decks.sa, d.sorteAzar);
      const deltaPecas = card.efeito.pecas || 0;
      const deltaCasas = card.efeito.casas || 0;
      player.pieces = Math.max(0, player.pieces + (card.efeito.pecas || 0));
      player.pos = clamp(player.pos + (card.efeito.casas || 0), 0, g.board.length - 1);
      g.lastCard = { tipo: "sa", titulo: "Sorte ou Azar", texto: card.texto };
      this.setCardPreview("Sorte ou Azar", card.texto, "sa");
      ui.log("cp-log", `${player.name} tirou Sorte/Azar: ${card.texto}`);
      this.showTurnFeedback(
        player,
        {
          title: "Carta de Sorte ou Azar",
          text: `${card.texto} Resultado: ${signedPluralize(deltaPecas, "peça")} e ${signedPluralize(deltaCasas, "casa")}.`,
          tone: deltaPecas < 0 || deltaCasas < 0 ? "warning" : "success",
          buttonLabel: "Passar a vez"
        },
        finishTurn
      );
      return;
    }

    if (code === "?") {
      const q = drawCycling(g.decks.perguntas, d.perguntas);
      g.lastCard = { tipo: "pergunta", titulo: "Pergunta", texto: q.pergunta };
      this.setCardPreview("Pergunta", q.pergunta, "pergunta");
      this.actionQuestion(player, q, finishTurn);
      return;
    }

    if (code === "VC") {
      this.actionCount(player, finishTurn);
      return;
    }

    if (code === "ADJ" || code === "VPA" || code === "VPR" || code === "VF") {
      this.actionInput(player, code, finishTurn);
      return;
    }

    if (code === "CEA") {
      const card = drawCycling(g.decks.cea, d.cambleEmAcao);
      g.lastCard = { tipo: "cea", titulo: "Camble em Ação", texto: `${card.verboCamble} (${card.traducao})` };
      this.setCardPreview("Camble em Ação", `${card.verboCamble} (${card.traducao})`, "cea");
      this.actionCea(player, card, finishTurn);
      return;
    }

    finishTurn();
  },

  setCardPreview(title, text, tipo) {
    const box = document.getElementById("cp-card-front");
    if (!box) return;
    box.className = `cp-card-front ${tipo ? `type-${tipo}` : ""}`;
    box.innerHTML = `
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(text)}</p>
    `;
  },

  actionQuestion(player, question, done) {
    if (player.isBot) {
      const ok = Math.random() < BOT_BALANCE.cpQuestion;
      if (ok) player.pieces += 2;
      ui.log("cp-log", `${player.name} ${ok ? "acertou (+2)" : "errou"} a pergunta.`);
      this.showTurnFeedback(
        player,
        {
          title: ok ? "Resposta correta" : "Resposta incorreta",
          text: ok ? `${player.name} ganhou +2 peças.` : "Nenhuma peça foi adicionada nesta rodada.",
          tone: ok ? "success" : "warning"
        },
        done
      );
      return;
    }
    const box = document.getElementById("cp-acao");
    box.innerHTML = `
      <h3>Pergunta</h3>
      <p>${escapeHtml(question.pergunta)}</p>
      <div class="digit-cards">
        ${question.opcoes
          .map((op, i) => `<button class="btn btn-outline" data-op="${i}" type="button">${escapeHtml(op)}</button>`)
          .join("")}
      </div>
    `;
    box.querySelectorAll("[data-op]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const ok = Number(btn.dataset.op) === question.resposta;
        if (ok) player.pieces += 2;
        ui.log("cp-log", `${player.name} ${ok ? "acertou (+2)" : "errou"} a pergunta.`);
        this.showTurnFeedback(
          player,
          {
            title: ok ? "Resposta correta" : "Resposta incorreta",
            text: ok ? `${player.name} ganhou +2 peças.` : "Sem bônus nesta pergunta.",
            tone: ok ? "success" : "warning",
            buttonLabel: "Passar a vez"
          },
          done
        );
      });
    });
  },

  actionCount(player, done) {
    const g = state.games.cambleplay;
    const d = state.data.cambleplay;
    if (player.isBot) {
      const ok = Math.random() < BOT_BALANCE.cpCount;
      if (!ok) {
        player.pieces = Math.max(0, player.pieces - 1);
        g.players.forEach((p) => {
          if (p.id !== player.id) p.pieces += 1;
        });
      }
      ui.log("cp-log", `${player.name} ${ok ? "acertou" : "errou"} VC.`);
      this.showTurnFeedback(
        player,
        {
          title: ok ? "Contagem validada" : "Contagem incorreta",
          text: ok ? "A sequência em camble foi aceita." : "Você perdeu 1 peça e os demais ganharam 1.",
          tone: ok ? "success" : "warning"
        },
        done
      );
      return;
    }
    const box = document.getElementById("cp-acao");
    box.innerHTML = `
      <h3>Vamos Contar (VC)</h3>
      <p>Digite os 3 primeiros números em camble (ex.: UNE TO WIQIS).</p>
      <input id="cp-vc-input" type="text">
      <div class="modal-actions">
        <button id="cp-vc-auto" class="btn btn-primary">Validar</button>
        <button id="cp-vc-manual" class="btn btn-secondary">Grupo confirmou</button>
      </div>
    `;
    box.querySelector("#cp-vc-auto").addEventListener("click", () => {
      const val = normalizeCambleInput(box.querySelector("#cp-vc-input").value);
      const expected = normalizeCambleInput(d.contagemCamble.slice(0, 3).join(" "));
      const ok = val.includes(expected);
      if (!ok) {
        player.pieces = Math.max(0, player.pieces - 1);
        g.players.forEach((p) => {
          if (p.id !== player.id) p.pieces += 1;
        });
      }
      ui.log("cp-log", `${player.name} ${ok ? "acertou" : "errou"} VC.`);
      this.showTurnFeedback(
        player,
        {
          title: ok ? "Contagem validada" : "Contagem incorreta",
          text: ok ? "Os três primeiros números em camble foram reconhecidos." : "Você perdeu 1 peça e os demais ganharam 1.",
          tone: ok ? "success" : "warning",
          buttonLabel: "Passar a vez"
        },
        done
      );
    });
    box.querySelector("#cp-vc-manual").addEventListener("click", () => {
      ui.log("cp-log", `${player.name} confirmou VC com o grupo.`);
      this.showTurnFeedback(
        player,
        {
          title: "Contagem confirmada",
          text: "O grupo validou a resposta manualmente.",
          tone: "success",
          buttonLabel: "Passar a vez"
        },
        done
      );
    });
  },

  actionInput(player, code, done) {
    const valid = state.data.cambleplay.validacaoBasica;
    const normalizedCambleVerbs = (valid.verbosCamble || []).map((w) => normalizeCambleInput(w));
    const includesCambleVerb = (text) => normalizedCambleVerbs.some((w) => text.includes(w));
    const includesCamblePhrase = (text, before, after) =>
      normalizedCambleVerbs.some((w) => text.includes(`${before}${w}${after}`));
    const validate = (input) => {
      const t = normalizeCambleInput(input);
      if (!t) return false;
      if (code === "ADJ") return false;
      if (code === "VPA") return includesCamblePhrase(t, "PA ", "");
      if (code === "VF") return includesCamblePhrase(t, "", " PA");
      if (code === "VPR") return includesCambleVerb(t);
      return false;
    };
    const conclude = (ok, manual = false) => {
      if (code === "ADJ" && ok) player.pieces += 1;
      ui.log("cp-log", `${player.name} ${ok ? "cumpriu" : "não cumpriu"} ${code}${manual ? " (manual)" : ""}.`);
      const rewardText = code === "ADJ" && ok ? " Você ganhou +1 peça." : "";
      this.showTurnFeedback(
        player,
        {
          title: ok ? `${code} concluído` : `${code} não validado`,
          text: ok
            ? `O desafio ${code} foi aceito.${rewardText}${manual ? " Confirmação manual do grupo." : ""}`
            : `O desafio ${code} não foi reconhecido.${manual ? " O grupo pode revisar a resposta." : ""}`,
          tone: ok ? "success" : "warning",
          buttonLabel: "Passar a vez"
        },
        done
      );
    };

    if (player.isBot) {
      conclude(Math.random() < BOT_BALANCE.cpInput);
      return;
    }

    const help = {
      ADJ: "Pronuncie um adjetivo em camble para o grupo validar.",
      VPA: "Use PA antes de um verbo em camble.",
      VPR: "Fale um verbo em camble sem auxiliar.",
      VF: "Use PA depois de um verbo em camble."
    };
    const box = document.getElementById("cp-acao");
    box.innerHTML = `
      <h3>${code}</h3>
      <p>${help[code]}</p>
      <input id="cp-input-generic" type="text">
      <div class="modal-actions">
        ${
          code === "ADJ"
            ? `
              <button id="cp-input-manual" class="btn btn-primary">Grupo confirmou</button>
              <button id="cp-input-fail" class="btn btn-outline">Não cumpriu</button>
            `
            : `
              <button id="cp-input-auto" class="btn btn-primary">Validar automaticamente</button>
              <button id="cp-input-manual" class="btn btn-secondary">Grupo confirmou</button>
            `
        }
      </div>
    `;
    box.querySelector("#cp-input-auto")?.addEventListener("click", () => {
      const ok = validate(box.querySelector("#cp-input-generic").value);
      box.innerHTML = "";
      conclude(ok);
    });
    box.querySelector("#cp-input-manual").addEventListener("click", () => {
      box.innerHTML = "";
      conclude(true, true);
    });
    box.querySelector("#cp-input-fail")?.addEventListener("click", () => {
      box.innerHTML = "";
      conclude(false, true);
    });
  },

  actionCea(player, card, done) {
    const g = state.games.cambleplay;
    const secondsBase = state.data.cambleplay.config.tempoCEA;
    const reward = () => {
      player.pieces += 2;
      g.players.forEach((p) => {
        if (p.id !== player.id) p.pieces += 1;
      });
    };
    if (player.isBot) {
      const ok = Math.random() < BOT_BALANCE.cpCea;
      if (ok) reward();
      else player.pieces = Math.max(0, player.pieces - 1);
      ui.log("cp-log", `${player.name} ${ok ? "teve sucesso" : "falhou"} no CEA.`);
      done();
      return;
    }

    this.stopCeaTimer();
    let sec = secondsBase;
    const box = document.getElementById("cp-acao");
    box.innerHTML = `
      <h3>Camble em Ação (CEA)</h3>
      <p>Mímica de: <strong>${escapeHtml(card.verboCamble)}</strong> (${escapeHtml(card.traducao)})</p>
      <p>Tempo: <strong id="cp-cea-time">${sec}s</strong></p>
      <div class="modal-actions">
        <button id="cp-cea-ok" class="btn btn-primary">Grupo acertou</button>
        <button id="cp-cea-no" class="btn btn-secondary">Ninguém acertou</button>
      </div>
    `;

    const finish = (ok) => {
      this.stopCeaTimer();
      if (ok) reward();
      else player.pieces = Math.max(0, player.pieces - 1);
      ui.log("cp-log", `${player.name} ${ok ? "teve sucesso" : "não teve acerto"} no CEA.`);
      this.showTurnFeedback(
        player,
        {
          title: ok ? "Mímica acertada" : "Mímica não acertada",
          text: ok
            ? `${player.name} ganhou +2 peças e os demais ganharam +1.`
            : `${player.name} perdeu 1 peça por não concluir o desafio.`,
          tone: ok ? "success" : "warning",
          buttonLabel: "Passar a vez"
        },
        done
      );
    };

    state.timers.cpCea = setInterval(() => {
      sec -= 1;
      const el = document.getElementById("cp-cea-time");
      if (el) el.textContent = `${sec}s`;
      if (sec <= 0) finish(false);
    }, 1000);

    box.querySelector("#cp-cea-ok").addEventListener("click", () => finish(true));
    box.querySelector("#cp-cea-no").addEventListener("click", () => finish(false));
  },

  stopCeaTimer() {
    if (state.timers.cpCea) {
      clearInterval(state.timers.cpCea);
      state.timers.cpCea = null;
    }
  },

  checkEnd(player) {
    const g = state.games.cambleplay;
    if (!g) return false;
    const contenders = g.players.filter((p) => p.pieces >= g.meta);
    if (!contenders.length) return false;

    const winners = [...contenders].sort((a, b) => b.pieces - a.pieces || b.pos - a.pos);
    const topPieces = winners[0].pieces;
    const tiedWinners = winners.filter((p) => p.pieces === topPieces);
    g.done = true;
    this.stopCeaTimer();
    this.stopWalkTimers();
    const msg =
      tiedWinners.length > 1
        ? `Empate entre ${tiedWinners.map((p) => p.name).join(", ")} com ${pluralize(topPieces, "peça")}!`
        : `${tiedWinners[0].name} venceu ao completar ${pluralize(topPieces, "peça")}!`;
    ui.log("cp-log", msg);
    ui.confetti();
    const lastCell = Math.max(1, g.board.length - 1);
    const report = gamification.createReport({
      gameName: "Cambleplay",
      message: msg,
      players: g.players,
      summary: [
        { label: "Meta de peças", value: String(g.meta) },
        { label: "Casas do percurso", value: String(lastCell) },
        { label: "Jogadores", value: String(g.players.length) }
      ],
      features: [
        {
          key: "pieces",
          label: "Peças coletadas",
          shortLabel: "Peças",
          highlightLabel: "Mais peças coletadas",
          higherIsBetter: true,
          primary: true,
          weight: 4,
          value: (p) => p.pieces,
          format: (value) => pluralize(value, "peça")
        },
        {
          key: "pieceProgress",
          label: "Progresso de peças",
          shortLabel: "Meta",
          highlightLabel: "Maior progresso de peças",
          higherIsBetter: true,
          weight: 3,
          value: (p) => (Math.min(p.pieces, g.meta) / g.meta) * 100,
          format: (value) => `${gamification.formatNumber(value, 0)}%`
        },
        {
          key: "position",
          label: "Casa alcançada",
          shortLabel: "Casa",
          highlightLabel: "Casa mais avançada",
          higherIsBetter: true,
          weight: 2,
          value: (p) => p.pos,
          format: (value) => `${value}/${lastCell}`
        },
        {
          key: "piecesMissing",
          label: "Peças faltantes",
          shortLabel: "Faltam",
          highlightLabel: "Menos peças faltantes",
          higherIsBetter: false,
          weight: 1,
          value: (p) => Math.max(0, g.meta - p.pieces),
          format: (value) => pluralize(value, "peça")
        }
      ]
    });
    ui.feedback("Fim da partida - Cambleplay", msg, () => this.start(), report);
    return true;
  },

  botTurnMaybe() {
    const g = state.games.cambleplay;
    if (!g || g.done) return;
    const p = g.players[g.turn];
    if (!p.isBot) return;
    const sid = g.sid;
    setTimeout(() => {
      const fresh = state.games.cambleplay;
      if (!fresh || fresh.done || fresh.sid !== sid) return;
      this.roll(true);
    }, BOT_TIMING.cpRoll);
  },

  reset() {
    this.stopCeaTimer();
    this.stopWalkTimers();
    this.hideCellGuide(false);
    state.games.cambleplay = null;
    ui.text("cp-turno", "-");
    ui.text("cp-dado", "-");
    ui.text("cp-piece-total", "x0");
    const hero = document.getElementById("cp-status-hero");
    if (hero) {
      hero.className = "cp-status-hero";
      hero.innerHTML = `
        <div class="cp-status-icon" aria-hidden="true">🎯</div>
        <div class="cp-status-copy">
          <strong>Antes de começar</strong>
          <p>Abra Configurações para escolher o modo, definir a meta de peças e iniciar a partida.</p>
        </div>
      `;
    }
    document.getElementById("cp-placar").innerHTML = "";
    document.getElementById("cp-board").innerHTML = "";
    document.getElementById("cp-acao").innerHTML = `
      <h3>Cambleplay</h3>
      <p>Abra Configurações para escolher o modo, definir a meta de peças e iniciar a partida.</p>
    `;
    document.getElementById("cp-log").innerHTML = "";
    this.setCardPreview("Última carta", "Nenhuma carta revelada ainda.", "");
  }
};

function resetAllGames() {
  closeGameConfigDialogs();
  memoryGame.reset();
  dominoGame.reset();
  unoGame.reset();
  cambleplayGame.reset();
}

function closeGameConfigDialogs() {
  document.querySelectorAll(".modal-game-config[open]").forEach((dialog) => dialog.close());
}

function getActiveConfigDialogId() {
  const map = {
    memoria: "modal-config-memoria",
    domino: "modal-config-domino",
    uno: "modal-config-uno",
    cambleplay: "modal-config-cambleplay"
  };
  return map[state.currentScreen] || null;
}

async function loadData() {
  ui.text("memoria-msg", "Carregando dados dos jogos...");
  const embeddedData = getEmbeddedData();

  if (window.location.protocol === "file:" && embeddedData) {
    applyLoadedData(embeddedData);
    return;
  }

  try {
    applyLoadedData(await fetchDataFiles());
  } catch (error) {
    if (embeddedData) {
      console.warn("Falha ao carregar os JSONs por fetch. Usando dados embutidos.", error);
      applyLoadedData(embeddedData);
      return;
    }
    throw error;
  }
}

function attachEvents() {
  document.getElementById("btn-home").addEventListener("click", () => {
    resetAllGames();
    ui.screen("intro");
  });
  document.getElementById("btn-game-home").addEventListener("click", () => {
    resetAllGames();
    ui.screen("home");
  });
  document.getElementById("btn-game-config").addEventListener("click", () => {
    const dialogId = getActiveConfigDialogId();
    const dialog = dialogId ? document.getElementById(dialogId) : null;
    if (dialog && !dialog.open) dialog.showModal();
  });
  document.querySelectorAll("[data-back-home]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resetAllGames();
      ui.screen("home");
    });
  });
  document.querySelectorAll("[data-open-game]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resetAllGames();
      ui.screen(btn.dataset.openGame);
    });
  });
  document.querySelectorAll("[data-open-screen]").forEach((btn) => {
    btn.addEventListener("click", () => {
      resetAllGames();
      ui.screen(btn.dataset.openScreen);
    });
  });
  document.querySelectorAll("[data-close-config]").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.closest("dialog")?.close();
    });
  });

  document.getElementById("modal-feedback-ok").addEventListener("click", () => {
    gamification.destroyChart();
    document.getElementById("modal-feedback").close();
    if (state.pendingFeedbackAction) {
      const fn = state.pendingFeedbackAction;
      state.pendingFeedbackAction = null;
      fn();
    }
  });
  document.getElementById("modal-feedback-home").addEventListener("click", () => {
    gamification.destroyChart();
    document.getElementById("modal-feedback").close();
    state.pendingFeedbackAction = null;
    resetAllGames();
    ui.screen("home");
  });

  const dominoPassModal = document.getElementById("modal-domino-pass");
  dominoPassModal.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  document.getElementById("modal-domino-pass-ok").addEventListener("click", () => {
    dominoGame.resumeAfterHandoff();
  });

  document.getElementById("memoria-iniciar").addEventListener("click", () => {
    memoryGame.start();
    closeGameConfigDialogs();
  });
  document.getElementById("domino-iniciar").addEventListener("click", () => {
    dominoGame.start();
    closeGameConfigDialogs();
  });
  document.getElementById("uno-iniciar").addEventListener("click", () => {
    unoGame.start();
    closeGameConfigDialogs();
  });
  document.getElementById("cp-iniciar").addEventListener("click", () => {
    cambleplayGame.start();
    closeGameConfigDialogs();
  });
  document.getElementById("cp-rolar").addEventListener("click", () => cambleplayGame.roll(false));
}

async function init() {
  try {
    await loadData();
    setupExpressiveClickFX();
    mobileAssist.init();
    applyStaticLabels();
    attachEvents();
    ui.screen("intro");
  } catch (err) {
    console.error(err);
    const msg = state.data.ui?.mensagens?.erroDados || "Não foi possível carregar os dados dos jogos.";
    ui.feedback("Erro", msg, null);
  }
}

init();
