/**
 * VocabMaster App Logic
 * Quản lý trạng thái, SPA router, tương tác UI, lưu trữ LocalStorage, Speech API, Quiz và Đặt câu.
 */

// --- 1. BIẾN TRẠNG THÁI TOÀN CỤC (APP STATE) ---
const state = {
  vocabulary: [],
  grammar: [],
  sentences: [],
  activeTab: "dashboard",
  
  // Trạng thái phân trang danh sách từ vựng
  vocabPagination: {
    currentPage: 1,
    itemsPerPage: 36
  },
  
  // Trạng thái Bảng tổng hợp tất cả từ vựng
  allVocabState: {
    currentPage: 1,
    itemsPerPage: 50
  },
  
  // Trạng thái Flashcards
  flashcards: {
    list: [],
    currentIndex: 0,
    isFlipped: false
  },
  
  // Trạng thái Quiz
  quiz: {
    mode: null,          // 'mcq' hoặc 'fitb'
    questions: [],       // Mảng câu hỏi
    currentIndex: 0,     // Chỉ số câu hỏi hiện tại
    score: 0,            // Số điểm hiện tại
    hasAnswered: false   // Trạng thái đã trả lời câu hỏi hiện tại chưa
  },
  
  // Trạng thái Topic Quiz (Kiểm tra theo Topic)
  topicQuiz: {
    selectedTopic: "Coming and Going",
    mode: "mcq",          // 'mcq', 'fitb', 'audio', 'match'
    questions: [],
    currentIndex: 0,
    score: 0,
    hasAnswered: false,
    timerSeconds: 0,
    timerInterval: null,
    wrongAnswers: [],
    matchState: {
      selectedEngCard: null,
      selectedViCard: null,
      matchedCount: 0,
      totalPairs: 0
    }
  },
  
  // Trạng thái chỉnh sửa từ vựng
  editingVocabId: null
};

// Mảng danh ngôn động lực học tập tiếng Anh ngẫu nhiên
const MOTIVATIONAL_QUOTES = [
  { text: "The limits of my language mean the limits of my world.", author: "Ludwig Wittgenstein" },
  { text: "Learning another language is not only learning different words for the same things, but learning another way to think about things.", author: "Flora Lewis" },
  { text: "Language is the road map of a culture. It tells you where its people come from and where they are going.", author: "Rita Mae Brown" },
  { text: "One language sets you in a corridor for life. Two languages open every door along the way.", author: "Frank Smith" },
  { text: "To have another language is to possess a second soul.", author: "Charlemagne" },
  { text: "Change your language and you change your thoughts.", author: "Karl Albrecht" },
  { text: "Knowledge of languages is the doorway to wisdom.", author: "Roger Bacon" }
];

// Các câu thoại của chú cún robot
const ROBOT_MESSAGES = [
  "Xin chào sếp Duy! 👋",
  "Sếp....Hôm nay đẹp trai quá 😍",
  "Hôm nay chúng ta cùng học từ vựng nhé! 📚"
];

let _robotTimer = null;
let _robotState = { msgIdx: 0, charIdx: 0, deleting: false };

// --- 2. KHỞI TẠO DỮ LIỆU BAN ĐẦU ---
function initApp() {
  // Tự động reset sang bộ từ vựng mới nếu phát hiện dữ liệu cũ (chứa từ "Ephemeral")
  let storedVocab = localStorage.getItem("vocabmaster_vocab");
  if (storedVocab && storedVocab.includes("Ephemeral")) {
    localStorage.removeItem("vocabmaster_vocab");
    localStorage.removeItem("vocabmaster_sentences");
  }

  // Tự động reset bộ ngữ pháp mới nếu phát hiện bộ ngữ pháp cũ (dưới 10 bài học)
  let storedGrammarObj = localStorage.getItem("vocabmaster_grammar");
  if (storedGrammarObj) {
    try {
      const grammarArr = JSON.parse(storedGrammarObj);
      if (grammarArr.length < 10) {
        localStorage.removeItem("vocabmaster_grammar");
      }
    } catch (e) {
      localStorage.removeItem("vocabmaster_grammar");
    }
  }

  // Lấy dữ liệu từ localStorage hoặc sử dụng dữ liệu mặc định từ data.js
  storedVocab = localStorage.getItem("vocabmaster_vocab");
  const storedGrammar = localStorage.getItem("vocabmaster_grammar");
  const storedSentences = localStorage.getItem("vocabmaster_sentences");
  const storedTheme = localStorage.getItem("vocabmaster_theme") || "dark";
  const storedRank = localStorage.getItem("vocabmaster_user_rank") || "bronze";

  if (storedVocab) {
    try {
      const parsedVocab = JSON.parse(storedVocab);
      const existingIds = new Set(parsedVocab.map(v => v.id));
      const existingKeys = new Set(parsedVocab.map(v => `${v.word.toLowerCase()}__${v.topic || 'General'}`));

      // Tự động đồng bộ thêm các từ vựng mới từ DEFAULT_VOCABULARY mà người dùng chưa có trong kho
      const newItems = DEFAULT_VOCABULARY.filter(v => !existingIds.has(v.id) && !existingKeys.has(`${v.word.toLowerCase()}__${v.topic || 'General'}`));

      if (newItems.length > 0) {
        state.vocabulary = [...parsedVocab, ...newItems];
      } else {
        state.vocabulary = parsedVocab;
      }

      // Tự động đồng bộ grammarPattern từ DEFAULT_VOCABULARY nếu item trong kho chưa có
      const defaultVocabMap = new Map(DEFAULT_VOCABULARY.map(v => [v.id, v]));
      let hasPatternUpdates = false;
      state.vocabulary.forEach(v => {
        if (!v.grammarPattern) {
          const defItem = defaultVocabMap.get(v.id) || DEFAULT_VOCABULARY.find(dv => dv.word.toLowerCase() === v.word.toLowerCase());
          if (defItem && defItem.grammarPattern) {
            v.grammarPattern = defItem.grammarPattern;
            hasPatternUpdates = true;
          }
        }
      });
      if (hasPatternUpdates || newItems.length > 0) {
        saveToLocalStorage("vocab");
      }
    } catch (e) {
      state.vocabulary = [...DEFAULT_VOCABULARY];
    }
  } else {
    state.vocabulary = [...DEFAULT_VOCABULARY];
  }

  // Đảm bảo tất cả từ vựng đều có thuộc tính topic
  state.vocabulary.forEach(v => {
    if (!v.topic) {
      if (v.id && (v.id.startsWith("vocab-cg-") || v.id.includes("-cg-"))) {
        v.topic = "Coming and Going";
      } else {
        v.topic = "General";
      }
    }
  });

  saveToLocalStorage("vocab");

  state.grammar = storedGrammar ? JSON.parse(storedGrammar) : [...DEFAULT_GRAMMAR];
  state.sentences = storedSentences ? JSON.parse(storedSentences) : [...DEFAULT_SENTENCES];
  state.userRank = storedRank;

  // Áp dụng theme đã lưu
  document.documentElement.setAttribute("data-theme", storedTheme);
  updateThemeUI(storedTheme);

  // Lưu lại vào localStorage nếu là lần đầu chạy để đồng bộ hóa
  if (!storedGrammar) saveToLocalStorage("grammar");
  if (!storedSentences) saveToLocalStorage("sentences");

  // Thiết lập ngày tháng hiện tại trên Header
  displayCurrentDate();

  // Đăng ký toàn bộ sự kiện và render trang chủ
  registerEventListeners();
  updateTopicUI();
  renderDashboard();
  updateGlobalStats();
  
  // Hiển thị quote ngẫu nhiên
  showRandomQuote();

  // Khởi động hiệu ứng typewriter cho chú cún robot
  initRobotTypewriter();
}

// Lưu dữ liệu vào LocalStorage
function saveToLocalStorage(key) {
  if (key === "vocab" || key === "all") {
    localStorage.setItem("vocabmaster_vocab", JSON.stringify(state.vocabulary));
  }
  if (key === "grammar" || key === "all") {
    localStorage.setItem("vocabmaster_grammar", JSON.stringify(state.grammar));
  }
  if (key === "sentences" || key === "all") {
    localStorage.setItem("vocabmaster_sentences", JSON.stringify(state.sentences));
  }
}

// Cập nhật thống kê hiển thị trên header và các phần khác
function updateGlobalStats() {
  const total = state.vocabulary.length;
  const mastered = state.vocabulary.filter(v => v.status === "mastered").length;
  const sentenceCount = state.sentences.length;

  // Header stats
  document.getElementById("header-total-vocab").textContent = total;
  document.getElementById("header-mastered-vocab").textContent = mastered;

  // Dashboard stats
  const dashVocab = document.getElementById("dash-stat-vocab");
  const dashMastered = document.getElementById("dash-stat-mastered");
  const dashSentences = document.getElementById("dash-stat-sentences");

  if (dashVocab) dashVocab.textContent = total;
  if (dashMastered) dashMastered.textContent = mastered;
  if (dashSentences) dashSentences.textContent = sentenceCount;
}

// --- CHỨC NĂNG QUẢN LÝ CHỦ ĐỀ HỌC (TOPIC MANAGEMENT) ---
function getAvailableTopics() {
  const topicsMap = new Map();
  
  const defaultTopicIcons = {
    "Coming and Going": "✈️",
    "Người nổi tiếng": "⭐",
    "Lịch sử": "🏛️",
    "Mạng xã hội": "📲",
    "Giải pháp": "💡",
    "Học tập": "🎓",
    "General": "📚"
  };

  // Mặc định khởi tạo các chủ đề chính
  topicsMap.set("Coming and Going", { name: "Coming and Going", icon: "✈️", total: 0, mastered: 0 });
  topicsMap.set("Người nổi tiếng", { name: "Người nổi tiếng", icon: "⭐", total: 0, mastered: 0 });
  topicsMap.set("Lịch sử", { name: "Lịch sử", icon: "🏛️", total: 0, mastered: 0 });
  topicsMap.set("Mạng xã hội", { name: "Mạng xã hội", icon: "📲", total: 0, mastered: 0 });
  topicsMap.set("Giải pháp", { name: "Giải pháp", icon: "💡", total: 0, mastered: 0 });
  topicsMap.set("Học tập", { name: "Học tập", icon: "🎓", total: 0, mastered: 0 });
  topicsMap.set("General", { name: "Từ vựng chung", icon: "📚", total: 0, mastered: 0 });

  state.vocabulary.forEach(v => {
    const rawTopic = v.topic || "General";
    const topicKey = (rawTopic === "Từ vựng chung") ? "General" : rawTopic;
    const topicDisplayName = (topicKey === "General") ? "Từ vựng chung" : topicKey;
    const icon = defaultTopicIcons[topicKey] || "🏷️";

    if (!topicsMap.has(topicKey)) {
      topicsMap.set(topicKey, { name: topicDisplayName, icon: icon, total: 0, mastered: 0 });
    }

    const tObj = topicsMap.get(topicKey);
    tObj.total++;
    if (v.status === "mastered") tObj.mastered++;
  });

  return Array.from(topicsMap.entries()).map(([key, val]) => ({
    key,
    name: val.name,
    icon: val.icon,
    total: val.total,
    mastered: val.mastered
  }));
}

function updateTopicUI() {
  populateTopicDropdowns();
  renderTopicPills();
}

function populateTopicDropdowns() {
  const topics = getAvailableTopics();
  const dropdownIds = ["vocab-filter-topic", "all-vocab-filter-topic", "flash-filter-topic", "quiz-filter-topic", "vocab-topic"];

  dropdownIds.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = "";

    if (id !== "vocab-topic") {
      const allOpt = document.createElement("option");
      allOpt.value = "all";
      allOpt.textContent = `🌐 Tất cả chủ đề (${state.vocabulary.length} từ)`;
      select.appendChild(allOpt);
    }

    topics.forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.key;
      opt.textContent = `${t.icon} ${t.name} (${t.total} từ)`;
      select.appendChild(opt);
    });

    if (Array.from(select.options).some(o => o.value === currentVal)) {
      select.value = currentVal;
    }
  });
}

function renderTopicPills() {
  const container = document.getElementById("topic-pills-wrapper");
  const statsContainer = document.getElementById("topic-bar-stats");
  if (!container) return;

  const topics = getAvailableTopics();
  const currentTopic = state.activeTopicFilter || "all";

  let filteredCount = state.vocabulary.length;
  let masteredCount = state.vocabulary.filter(v => v.status === "mastered").length;

  if (currentTopic !== "all") {
    const matched = state.vocabulary.filter(v => {
      const t = v.topic || "General";
      return (t === currentTopic) || (currentTopic === "General" && (t === "General" || t === "Từ vựng chung"));
    });
    filteredCount = matched.length;
    masteredCount = matched.filter(v => v.status === "mastered").length;
  }

  if (statsContainer) {
    statsContainer.innerHTML = `<span>Đang xem: <strong style="color:var(--color-primary-light);">${filteredCount} từ</strong> (Đã thuộc: <strong style="color:var(--color-success);">${masteredCount}</strong>)</span>`;
  }

  container.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.type = "button";
  allBtn.className = `topic-pill-btn ${currentTopic === "all" ? "active" : ""}`;
  allBtn.innerHTML = `<span>🌐 Tất cả chủ đề</span> <span class="pill-count">${state.vocabulary.length}</span>`;
  allBtn.addEventListener("click", () => selectTopicFilter("all"));
  container.appendChild(allBtn);

  topics.forEach(t => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `topic-pill-btn ${currentTopic === t.key ? "active" : ""}`;
    btn.innerHTML = `<span>${t.icon} ${t.name}</span> <span class="pill-count">${t.total} từ</span>`;
    btn.addEventListener("click", () => selectTopicFilter(t.key));
    container.appendChild(btn);
  });
}

function selectTopicFilter(topicKey) {
  state.activeTopicFilter = topicKey;

  ["vocab-filter-topic", "all-vocab-filter-topic", "flash-filter-topic", "quiz-filter-topic"].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.value = topicKey;
  });

  state.vocabPagination.currentPage = 1;
  state.allVocabState.currentPage = 1;

  renderTopicPills();
  renderVocabularyList();
  renderAllVocabTable();
  if (state.activeTab === "flashcards") initFlashcards();
  if (state.activeTab === "quiz") initQuiz();
}

// Hiển thị ngày tháng hiện tại tiếng Việt
function displayCurrentDate() {
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const today = new Date();
  document.getElementById("current-date-txt").textContent = today.toLocaleDateString('vi-VN', dateOptions);
}

// Hiển thị quote ngẫu nhiên trên Dashboard
function showRandomQuote() {
  const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
  const quote = MOTIVATIONAL_QUOTES[randomIndex];
  document.getElementById("quote-text").textContent = `"${quote.text}"`;
  document.getElementById("quote-author").textContent = `— ${quote.author}`;
}

// ---- Hiệu ứng Typewriter cho chú cún robot ----
function initRobotTypewriter() {
  const el = document.getElementById('robot-typewriter');
  if (!el) return;

  // Dừng timer cũ nếu đang chạy
  if (_robotTimer) clearTimeout(_robotTimer);
  _robotState = { msgIdx: 0, charIdx: 0, deleting: false };

  function tick() {
    const s = _robotState;
    const msg = ROBOT_MESSAGES[s.msgIdx];

    if (!s.deleting) {
      // Đang gõ thêm từng ký tự
      s.charIdx++;
      el.textContent = msg.substring(0, s.charIdx);

      if (s.charIdx >= msg.length) {
        // Đã gõ hết câu → dừng 2.8s rồi bắt đầu xóa
        s.deleting = true;
        _robotTimer = setTimeout(tick, 2800);
        return;
      }
      // Tốc độ gõ: 65ms/ký tự
      _robotTimer = setTimeout(tick, 65);

    } else {
      // Đang xóa từng ký tự
      s.charIdx--;
      el.textContent = msg.substring(0, s.charIdx);

      if (s.charIdx <= 0) {
        // Đã xóa hết → chuyển câu tiếp theo, dừng 450ms
        s.deleting = false;
        s.msgIdx = (s.msgIdx + 1) % ROBOT_MESSAGES.length;
        _robotTimer = setTimeout(tick, 450);
        return;
      }
      // Tốc độ xóa: 35ms/ký tự (nhanh hơn gõ)
      _robotTimer = setTimeout(tick, 35);
    }
  }

  // Trễ 800ms trước khi bắt đầu để trang load xong
  _robotTimer = setTimeout(tick, 800);
}

// --- 3. SPA ROUTER & NAVIGATION ---
function navigateToTab(tabName) {
  state.activeTab = tabName;
  
  // Cập nhật giao diện thanh Sidebar active class
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("data-tab") === tabName) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  // Ẩn/Hiện các section tương ứng
  document.querySelectorAll(".page-section").forEach(sec => {
    sec.classList.remove("active");
  });
  
  const targetSection = document.getElementById(`sec-${tabName}`);
  if (targetSection) {
    targetSection.classList.add("active");
  }

  // Chạy logic khởi tạo cho từng tab cụ thể
  if (tabName === "dashboard") {
    renderDashboard();
  } else if (tabName === "vocabulary") {
    renderVocabularyList();
    resetVocabForm();
  } else if (tabName === "all-vocab") {
    renderAllVocabTable();
  } else if (tabName === "flashcards") {
    initFlashcards();
  } else if (tabName === "quiz") {
    initQuizSetup();
  } else if (tabName === "grammar") {
    renderGrammarList();
  } else if (tabName === "rank") {
    initRankTab();
  } else if (tabName === "sentences") {
    initSentencePractice();
  } else if (tabName === "reading") {
    initReading();
  } else if (tabName === "topic-quiz") {
    initTopicQuizHub();
  }
}

// --- 4. TOAST NOTIFICATIONS (UX FEEDBACK) ---
function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toast-container");
  const toast = document.createElement("div");
  
  toast.style.background = "var(--bg-glass)";
  toast.style.backdropFilter = "blur(12px)";
  toast.style.border = `1px solid ${type === 'success' ? 'var(--color-success)' : type === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)'}`;
  toast.style.color = "var(--text-main)";
  toast.style.padding = "12px 24px";
  toast.style.borderRadius = "var(--border-radius-sm)";
  toast.style.boxShadow = "var(--shadow-main)";
  toast.style.display = "flex";
  toast.style.alignItems = "center";
  toast.style.gap = "10px";
  toast.style.animation = "fadeIn 0.3s, fadeOut 0.3s 2.7s";
  toast.style.minWidth = "250px";

  let icon = "fa-circle-check";
  if (type === "danger") icon = "fa-circle-exclamation";
  if (type === "warning") icon = "fa-triangle-exclamation";

  toast.innerHTML = `
    <i class="fa-solid ${icon}" style="color: ${type === 'success' ? 'var(--color-success)' : type === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)'}"></i>
    <span style="font-size: 14px; font-weight: 500;">${message}</span>
  `;

  toastContainer.appendChild(toast);

  // Xóa toast sau 3s
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// --- 5. RENDER CHỨC NĂNG DASHBOARD ---
function renderDashboard() {
  updateGlobalStats();
  
  // Hiển thị 3 từ mới thêm gần đây
  const recentContainer = document.getElementById("dashboard-recent-vocab");
  if (!recentContainer) return;
  
  recentContainer.innerHTML = "";

  // Sắp xếp từ vựng theo thời gian giảm dần
  const sortedVocab = [...state.vocabulary].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);

  if (sortedVocab.length === 0) {
    recentContainer.innerHTML = `
      <div class="empty-state" style="padding: 20px 0;">
        <i class="fa-solid fa-folder-open" style="font-size: 30px;"></i>
        <p style="font-size: 13px;">Chưa có từ vựng nào. Hãy thêm từ mới để bắt đầu học nhé!</p>
      </div>
    `;
    return;
  }

  sortedVocab.forEach(vocab => {
    const item = document.createElement("div");
    item.className = "recent-item";
    
    // Format thời gian hiển thị đơn giản
    const dateObj = new Date(vocab.createdAt);
    const dateStr = `${dateObj.getDate()}/${dateObj.getMonth() + 1}`;

    let typeTag = "";
    if (vocab.type === "noun") typeTag = "Danh từ";
    else if (vocab.type === "verb") typeTag = "Động từ";
    else if (vocab.type === "adjective") typeTag = "Tính từ";
    else if (vocab.type === "adverb") typeTag = "Trạng từ";
    else typeTag = vocab.type;

    item.innerHTML = `
      <div class="recent-info">
        <span class="recent-word">${vocab.word} <span style="font-size: 11px; font-weight: 500; color: var(--color-secondary);">(${vocab.pronunciation || ''})</span></span>
        <span class="recent-detail">${typeTag} — ${vocab.definition}</span>
      </div>
      <span class="recent-time"><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
    `;
    recentContainer.appendChild(item);
  });
}

// --- 6. CHỨC NĂNG KHO TỪ VỰNG (VOCABULARY MANAGEMENT) ---
function renderVocabularyList() {
  const container = document.getElementById("vocab-cards-container");
  const statsBar = document.getElementById("vocab-stats-bar");
  const paginationContainer = document.getElementById("vocab-pagination-container");

  const searchQuery = document.getElementById("vocab-search").value.trim().toLowerCase();
  const filterTopicEl = document.getElementById("vocab-filter-topic");
  const filterTopic = filterTopicEl ? filterTopicEl.value : (state.activeTopicFilter || "all");
  const filterType = document.getElementById("vocab-filter-type").value;
  const filterStatus = document.getElementById("vocab-filter-status").value;

  if (!container) return;
  container.innerHTML = "";

  // Áp dụng tìm kiếm và bộ lọc
  const filteredVocab = state.vocabulary.filter(item => {
    const matchesSearch = !searchQuery || 
                          item.word.toLowerCase().includes(searchQuery) || 
                          (item.definition && item.definition.toLowerCase().includes(searchQuery)) ||
                          (item.example && item.example.toLowerCase().includes(searchQuery));
    
    const matchesTopic = filterTopic === "all" || 
                         (item.topic && item.topic === filterTopic) || 
                         (filterTopic === "General" && (!item.topic || item.topic === "General" || item.topic === "Từ vựng chung"));
    const matchesType = filterType === "all" || (item.type && item.type.toLowerCase().includes(filterType));
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;

    return matchesSearch && matchesTopic && matchesType && matchesStatus;
  });

  // Sắp xếp từ vựng: Từ mới nhất đưa lên đầu
  filteredVocab.sort((a, b) => b.createdAt - a.createdAt);

  const totalItems = filteredVocab.length;
  const itemsPerPage = state.vocabPagination.itemsPerPage || 36;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  if (state.vocabPagination.currentPage > totalPages) {
    state.vocabPagination.currentPage = totalPages;
  }
  if (state.vocabPagination.currentPage < 1) {
    state.vocabPagination.currentPage = 1;
  }

  const currentPage = state.vocabPagination.currentPage;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(totalItems, startIndex + itemsPerPage);
  const pageItems = filteredVocab.slice(startIndex, endIndex);

  // Hiển thị thanh thống kê
  if (statsBar) {
    if (totalItems === 0) {
      statsBar.innerHTML = `<span><i class="fa-solid fa-layer-group"></i> Không tìm thấy từ vựng nào</span>`;
    } else {
      statsBar.innerHTML = `
        <span><i class="fa-solid fa-layer-group"></i> Hiển thị <strong>${startIndex + 1}–${endIndex}</strong> / <strong>${totalItems}</strong> từ vựng (Tổng kho: ${state.vocabulary.length})</span>
        <span style="font-size: 12px; opacity: 0.85;">Trang ${currentPage} / ${totalPages}</span>
      `;
    }
  }

  if (totalItems === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>Không tìm thấy từ vựng nào</h3>
        <p>Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.</p>
      </div>
    `;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  pageItems.forEach(item => {
    const card = document.createElement("div");
    card.className = `vocab-card ${item.status}`;
    card.setAttribute("data-id", item.id);

    // Tách nhiều loại từ nếu từ đó có nhiều từ loại (ví dụ: noun, verb)
    const types = item.type ? item.type.split(/[\s,]+/).filter(Boolean) : ["noun"];
    const labels = types.map(t => {
      if (t === "noun") return "danh từ";
      if (t === "verb") return "động từ";
      if (t === "adjective") return "tính từ";
      if (t === "adverb") return "trạng từ";
      if (t === "preposition") return "giới từ";
      if (t === "conjunction") return "liên từ";
      return t;
    });

    const typeLabelText = types.length > 1 ? `(${labels.join(" / ")})` : labels[0];
    const badgeClass = types.length > 1 ? "multi" : types[0];

    const isMastered = item.status === "mastered";
    const statusBadgeText = isMastered ? "Đã thuộc" : "Đang học";
    const statusBadgeClass = isMastered ? "mastered" : "learning";
    const statusIcon = isMastered ? "fa-circle-check" : "fa-circle-play";

    const topicName = (item.topic === "General" || !item.topic) ? "Từ vựng chung" : item.topic;

    card.innerHTML = `
      <div class="vocab-card-header" style="align-items: flex-start; justify-content: space-between; gap: 10px;">
        <div>
          <h4 class="vocab-card-title">
            ${item.word}
          </h4>
          <span class="vocab-card-topic-tag"><i class="fa-solid fa-folder"></i> ${topicName}</span>
        </div>
        <span class="vocab-card-type ${badgeClass}">${typeLabelText}</span>
      </div>
      
      <div class="vocab-pronounce">
        <span>${item.pronunciation || ""}</span>
        <button class="vocab-speak-btn" onclick="speakWord('${item.word.replace(/'/g, "\\'")}')" title="Phát âm">
          <i class="fa-solid fa-volume-high"></i>
        </button>
      </div>
      
      <div class="vocab-def">${item.definition}</div>
      
      ${item.example ? `
        <div class="vocab-example-box">
          <div class="vocab-eg-eng">${item.example}</div>
          <div class="vocab-eg-vi">${item.exampleTranslation || ""}</div>
        </div>
      ` : ""}
      
      ${item.grammarPattern ? `
        <div class="vocab-grammar-pattern">
          <i class="fa-solid fa-diagram-project"></i>
          <span>${item.grammarPattern}</span>
        </div>
      ` : ""}
      
      <div class="vocab-card-actions">
        <span class="badge-status ${statusBadgeClass}">
          <i class="fa-solid ${statusIcon}"></i> ${statusBadgeText}
        </span>
        
        <div class="card-action-icons">
          <button class="card-btn toggle-status" onclick="toggleVocabStatus('${item.id}')" title="${isMastered ? 'Đánh dấu cần ôn tập' : 'Đánh dấu đã thuộc'}">
            <i class="fa-solid ${isMastered ? 'fa-book-bookmark' : 'fa-check-double'}"></i>
          </button>
          <button class="card-btn edit" onclick="startEditVocab('${item.id}')" title="Sửa từ vựng">
            <i class="fa-solid fa-pen-to-square"></i>
          </button>
          <button class="card-btn delete" onclick="deleteVocab('${item.id}')" title="Xóa từ vựng">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
    
    container.appendChild(card);
  });

  renderVocabPagination(totalPages, paginationContainer);
}

// Render các nút chuyển trang Pagination cho kho từ vựng
function renderVocabPagination(totalPages, container) {
  if (!container) return;
  container.innerHTML = "";

  if (totalPages <= 1) return;

  const current = state.vocabPagination.currentPage;

  // Nút Trang đầu
  const firstBtn = document.createElement("button");
  firstBtn.className = `btn btn-secondary ${current === 1 ? 'disabled' : ''}`;
  firstBtn.style.padding = "6px 12px";
  firstBtn.style.fontSize = "13px";
  firstBtn.disabled = current === 1;
  firstBtn.innerHTML = `<i class="fa-solid fa-angles-left"></i>`;
  firstBtn.onclick = () => { state.vocabPagination.currentPage = 1; renderVocabularyList(); };
  container.appendChild(firstBtn);

  // Nút Trang trước
  const prevBtn = document.createElement("button");
  prevBtn.className = `btn btn-secondary ${current === 1 ? 'disabled' : ''}`;
  prevBtn.style.padding = "6px 12px";
  prevBtn.style.fontSize = "13px";
  prevBtn.disabled = current === 1;
  prevBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i> Trước`;
  prevBtn.onclick = () => { state.vocabPagination.currentPage--; renderVocabularyList(); };
  container.appendChild(prevBtn);

  let startPage = Math.max(1, current - 2);
  let endPage = Math.min(totalPages, current + 2);

  if (startPage > 1) {
    const dot = document.createElement("span");
    dot.textContent = "...";
    dot.style.color = "var(--text-muted)";
    dot.style.alignSelf = "center";
    container.appendChild(dot);
  }

  for (let p = startPage; p <= endPage; p++) {
    const pageBtn = document.createElement("button");
    pageBtn.className = `btn ${p === current ? 'btn-primary' : 'btn-secondary'}`;
    pageBtn.style.padding = "6px 12px";
    pageBtn.style.fontSize = "13px";
    pageBtn.textContent = p;
    pageBtn.onclick = () => { state.vocabPagination.currentPage = p; renderVocabularyList(); };
    container.appendChild(pageBtn);
  }

  if (endPage < totalPages) {
    const dot = document.createElement("span");
    dot.textContent = "...";
    dot.style.color = "var(--text-muted)";
    dot.style.alignSelf = "center";
    container.appendChild(dot);
  }

  // Nút Trang sau
  const nextBtn = document.createElement("button");
  nextBtn.className = `btn btn-secondary ${current === totalPages ? 'disabled' : ''}`;
  nextBtn.style.padding = "6px 12px";
  nextBtn.style.fontSize = "13px";
  nextBtn.disabled = current === totalPages;
  nextBtn.innerHTML = `Sau <i class="fa-solid fa-chevron-right"></i>`;
  nextBtn.onclick = () => { state.vocabPagination.currentPage++; renderVocabularyList(); };
  container.appendChild(nextBtn);

  // Nút Trang cuối
  const lastBtn = document.createElement("button");
  lastBtn.className = `btn btn-secondary ${current === totalPages ? 'disabled' : ''}`;
  lastBtn.style.padding = "6px 12px";
  lastBtn.style.fontSize = "13px";
  lastBtn.disabled = current === totalPages;
  lastBtn.innerHTML = `<i class="fa-solid fa-angles-right"></i>`;
  lastBtn.onclick = () => { state.vocabPagination.currentPage = totalPages; renderVocabularyList(); };
  container.appendChild(lastBtn);
}

// Đăng ký sự kiện submit form Thêm/Sửa từ
document.getElementById("vocab-form").addEventListener("submit", function(e) {
  e.preventDefault();

  const vocabIdInput = document.getElementById("vocab-id").value;
  const word = document.getElementById("vocab-word").value.trim();
  const definition = document.getElementById("vocab-definition").value.trim();

  if (!word || !definition) {
    showToast("Vui lòng điền đầy đủ các thông tin bắt buộc!", "warning");
    return;
  }

  if (vocabIdInput) {
    // CHẾ ĐỘ SỬA (EDIT) - Người dùng tự chỉnh sửa trực tiếp trên form
    const pronunciation = document.getElementById("vocab-pronunciation").value.trim();
    const topicSel = document.getElementById("vocab-topic");
    const topic = topicSel ? topicSel.value : "General";
    const example = document.getElementById("vocab-example").value.trim();
    const exampleTranslation = document.getElementById("vocab-example-translation").value.trim();
    const grammarPatternEl = document.getElementById("vocab-grammar-pattern");
    const grammarPattern = grammarPatternEl ? grammarPatternEl.value.trim() : "";

    const index = state.vocabulary.findIndex(item => item.id === vocabIdInput);
    if (index !== -1) {
      state.vocabulary[index] = {
        ...state.vocabulary[index],
        word,
        topic,
        pronunciation,
        definition,
        example,
        exampleTranslation,
        grammarPattern
      };
      saveToLocalStorage("vocab");
      showToast(`Đã cập nhật từ vựng: ${word}`);
      
      resetVocabForm();
      updateTopicUI();
      renderVocabularyList();
      updateGlobalStats();
    }
  } else {
    // CHẾ ĐỘ THÊM MỚI (ADD) - Tự động tra từ điển API ngầm
    const submitBtn = document.getElementById("vocab-btn-submit");
    submitBtn.disabled = true;
    const originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tra từ điển...`;

    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
      .then(res => {
        if (!res.ok) throw new Error("Word not found");
        return res.json();
      })
      .then(data => {
        let pronunciationStr = "";
        let typesArr = [];
        let exampleStr = "";

        if (data && data[0]) {
          const entry = data[0];
          
          // Lấy phiên âm
          pronunciationStr = entry.phonetic || "";
          if (!pronunciationStr && entry.phonetics && entry.phonetics.length > 0) {
            const withText = entry.phonetics.find(p => p.text);
            pronunciationStr = withText ? withText.text : entry.phonetics[0].text || "";
          }

          // Gom tất cả các loại từ duy nhất
          if (entry.meanings && entry.meanings.length > 0) {
            const rawTypes = entry.meanings.map(m => m.partOfSpeech.toLowerCase());
            typesArr = [...new Set(rawTypes)];
            
            const validTypes = ["noun", "verb", "adjective", "adverb", "preposition", "conjunction"];
            typesArr = typesArr.filter(t => validTypes.includes(t));

            // Tìm ví dụ mẫu
            for (const m of entry.meanings) {
              for (const def of m.definitions) {
                if (def.example) {
                  exampleStr = def.example;
                  break;
                }
              }
              if (exampleStr) break;
            }
          }
        }

        if (typesArr.length === 0) {
          typesArr = ["noun"];
        }

        const grammarPatternEl = document.getElementById("vocab-grammar-pattern");
        const grammarPattern = grammarPatternEl ? grammarPatternEl.value.trim() : "";
        const typeStr = typesArr.join(", ");
        saveNewVocab(word, definition, pronunciationStr, typeStr, exampleStr, "", grammarPattern);
      })
      .catch(err => {
        console.warn("Dictionary API lookup failed or not found:", err);
        // Tra cứu thất bại vẫn lưu từ
        const grammarPatternEl = document.getElementById("vocab-grammar-pattern");
        const grammarPattern = grammarPatternEl ? grammarPatternEl.value.trim() : "";
        saveNewVocab(word, definition, "", "noun", "", "", grammarPattern);
      })
      .finally(() => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      });
  }
});

// Nút bật/tắt tùy chọn nâng cao trên form thêm từ
const toggleAdvBtn = document.getElementById("vocab-toggle-adv-btn");
if (toggleAdvBtn) {
  toggleAdvBtn.addEventListener("click", function() {
    const rowFields = document.getElementById("vocab-adv-fields-row");
    const egFields = document.getElementById("vocab-adv-fields-eg");
    const egViFields = document.getElementById("vocab-adv-fields-eg-vi");
    const grammarFields = document.getElementById("vocab-adv-fields-grammar");
    const toggleText = document.getElementById("vocab-toggle-adv-text");
    const isHidden = !rowFields || rowFields.style.display === "none";

    if (rowFields) rowFields.style.display = isHidden ? "flex" : "none";
    if (egFields) egFields.style.display = isHidden ? "block" : "none";
    if (egViFields) egViFields.style.display = isHidden ? "block" : "none";
    if (grammarFields) grammarFields.style.display = isHidden ? "block" : "none";
    if (toggleText) {
      toggleText.textContent = isHidden
        ? "Ẩn bớt tùy chọn nâng cao"
        : "Tùy chọn nâng cao (Phiên âm, Ví dụ, Ngữ pháp...)";
    }
  });
}

// Chuyển form sang trạng thái Sửa từ vựng
window.startEditVocab = function(id) {
  const item = state.vocabulary.find(v => v.id === id);
  if (!item) return;

  document.getElementById("vocab-id").value = item.id;
  document.getElementById("vocab-word").value = item.word;
  document.getElementById("vocab-pronunciation").value = item.pronunciation || "";
  const topicSel = document.getElementById("vocab-topic");
  if (topicSel) topicSel.value = item.topic || "General";
  document.getElementById("vocab-definition").value = item.definition;
  document.getElementById("vocab-example").value = item.example || "";
  document.getElementById("vocab-example-translation").value = item.exampleTranslation || "";
  const grammarPatternInput = document.getElementById("vocab-grammar-pattern");
  if (grammarPatternInput) grammarPatternInput.value = item.grammarPattern || "";

  // Hiển thị lại các trường nâng cao khi đang ở chế độ Edit để người dùng có thể tự chỉnh sửa nâng cao
  const rowFields = document.getElementById("vocab-adv-fields-row");
  const egFields = document.getElementById("vocab-adv-fields-eg");
  const egViFields = document.getElementById("vocab-adv-fields-eg-vi");
  const grammarFields = document.getElementById("vocab-adv-fields-grammar");
  if (rowFields) rowFields.style.display = "flex";
  if (egFields) egFields.style.display = "block";
  if (egViFields) egViFields.style.display = "block";
  if (grammarFields) grammarFields.style.display = "block";

  const toggleText = document.getElementById("vocab-toggle-adv-text");
  if (toggleText) toggleText.textContent = "Ẩn bớt tùy chọn nâng cao";

  // Thay đổi tiêu đề form và nút bấm
  document.getElementById("vocab-form-title").innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Cập nhật từ vựng`;
  document.getElementById("vocab-btn-submit").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi`;
  document.getElementById("vocab-btn-cancel").style.display = "inline-flex";

  // Cuộn mượt lên khung form (hữu ích cho giao diện di động)
  document.getElementById("vocab-form").scrollIntoView({ behavior: "smooth" });
};

// Hủy trạng thái sửa, đưa form về mặc định
function resetVocabForm() {
  document.getElementById("vocab-form").reset();
  document.getElementById("vocab-id").value = "";

  // Ẩn lại các trường nâng cao khi về chế độ Thêm mới mặc định
  const rowFields = document.getElementById("vocab-adv-fields-row");
  const egFields = document.getElementById("vocab-adv-fields-eg");
  const egViFields = document.getElementById("vocab-adv-fields-eg-vi");
  const grammarFields = document.getElementById("vocab-adv-fields-grammar");
  if (rowFields) rowFields.style.display = "none";
  if (egFields) egFields.style.display = "none";
  if (egViFields) egViFields.style.display = "none";
  if (grammarFields) grammarFields.style.display = "none";
  
  const toggleText = document.getElementById("vocab-toggle-adv-text");
  if (toggleText) toggleText.textContent = "Tùy chọn nâng cao (Phiên âm, Ví dụ, Ngữ pháp...)";

  document.getElementById("vocab-form-title").innerHTML = `<i class="fa-solid fa-plus-circle"></i> Thêm từ vựng mới`;
  document.getElementById("vocab-btn-submit").innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu từ vựng`;
  document.getElementById("vocab-btn-cancel").style.display = "none";
}

// Lưu từ vựng mới vào kho dữ liệu
function saveNewVocab(word, definition, pronunciation, type, example, exampleTranslation, grammarPattern = "") {
  // Kiểm tra xem từ đã tồn tại chưa
  const existing = state.vocabulary.find(item => item.word.toLowerCase() === word.toLowerCase());
  if (existing) {
    showToast(`Từ "${word}" đã có sẵn trong kho từ vựng!`, "warning");
    return;
  }

  const topicSel = document.getElementById("vocab-topic");
  const topic = topicSel ? topicSel.value : "General";

  const grammarPatternEl = document.getElementById("vocab-grammar-pattern");
  const finalGrammarPattern = grammarPattern || (grammarPatternEl ? grammarPatternEl.value.trim() : "");

  const newVocab = {
    id: `vocab-${Date.now()}`,
    word,
    topic,
    pronunciation,
    type,
    definition,
    example,
    exampleTranslation,
    grammarPattern: finalGrammarPattern,
    status: "learning",
    createdAt: Date.now()
  };

  state.vocabulary.push(newVocab);
  saveToLocalStorage("vocab");
  showToast(`Đã thêm từ vựng: ${word}`);

  // Reset form và cập nhật giao diện
  resetVocabForm();
  updateTopicUI();
  renderVocabularyList();
  updateGlobalStats();
}

// Xóa từ vựng
window.deleteVocab = function(id) {
  const item = state.vocabulary.find(v => v.id === id);
  if (!item) return;

  if (confirm(`Bạn có chắc chắn muốn xóa từ vựng "${item.word}" khỏi kho từ của mình không?`)) {
    state.vocabulary = state.vocabulary.filter(v => v.id !== id);
    saveToLocalStorage("vocab");
    updateTopicUI();
    renderVocabularyList();
    updateGlobalStats();
    showToast(`Đã xóa từ vựng thành công`, "danger");
  }
};

// Đổi trạng thái 'mastered' <=> 'learning'
window.toggleVocabStatus = function(id) {
  const item = state.vocabulary.find(v => v.id === id);
  if (!item) return;

  item.status = item.status === "mastered" ? "learning" : "mastered";
  saveToLocalStorage("vocab");
  updateTopicUI();
  renderVocabularyList();
  updateGlobalStats();
  
  if (item.status === "mastered") {
    showToast(`Tuyệt vời! Đã thuộc từ "${item.word}"`, "success");
  } else {
    showToast(`Đã đưa từ "${item.word}" về danh sách cần học`, "warning");
  }
};

// --- 6.2 CHỨC NĂNG BẢNG TỔNG HỢP TẤT CẢ TỪ VỰNG (ALL VOCABULARY TABLE) ---

// Tách từ đồng nghĩa English paraphrase từ đối tượng từ vựng
function parseVocabSynonyms(vocab) {
  if (!vocab) return [];

  // Nếu đối tượng từ vựng có trường synonyms hoặc paraphrase trực tiếp
  if (vocab.synonyms) {
    if (Array.isArray(vocab.synonyms)) return vocab.synonyms;
    return String(vocab.synonyms).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }
  if (vocab.paraphrase) {
    if (Array.isArray(vocab.paraphrase)) return vocab.paraphrase;
    return String(vocab.paraphrase).split(/[,;]+/).map(s => s.trim()).filter(Boolean);
  }

  // Tách từ nội dung trong ngoặc đơn (...) của definition
  if (vocab.definition) {
    const matches = vocab.definition.match(/\(([^)]+)\)/g);
    if (matches) {
      const extractedSynonyms = [];
      matches.forEach(m => {
        const content = m.replace(/[()]/g, "").trim();
        // Kiểm tra xem đây có phải là chú thích tiếng Việt hay không
        const isVietnameseNote = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(content) ||
                                 /\b(của|trong|cho|khi|ở|hoặc|và|với)\b/i.test(content);
        if (!isVietnameseNote) {
          const terms = content.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
          extractedSynonyms.push(...terms);
        }
      });
      if (extractedSynonyms.length > 0) return extractedSynonyms;
    }
  }

  return [];
}

// Làm sạch nghĩa tiếng Việt (loại bỏ phần ngoặc đơn đồng nghĩa tiếng Anh nếu có)
function parseVocabDefinition(vocab) {
  if (!vocab || !vocab.definition) return "";
  let def = vocab.definition;

  const matches = def.match(/\(([^)]+)\)/g);
  if (matches) {
    matches.forEach(m => {
      const content = m.replace(/[()]/g, "").trim();
      const isVietnameseNote = /[àáảãạâầấẩẫậăằắẳẵặèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(content) ||
                               /\b(của|trong|cho|khi|ở|hoặc|và|với)\b/i.test(content);
      if (!isVietnameseNote) {
        def = def.replace(m, "").trim();
      }
    });
  }
  return def || vocab.definition;
}

// Chuyển dạng từ loại thành các pill badge đẹp mắt
function formatWordTypePills(typeStr) {
  if (!typeStr) return '<span class="vocab-card-type noun">danh từ</span>';
  const types = typeStr.split(/[\s,]+/).filter(Boolean);
  return types.map(t => {
    const key = t.toLowerCase();
    let label = t;
    let badgeClass = key;
    if (key === "noun") label = "danh từ";
    else if (key === "verb") label = "động từ";
    else if (key === "adjective" || key === "adj") label = "tính từ";
    else if (key === "adverb" || key === "adv") label = "trạng từ";
    else if (key === "preposition" || key === "prep") label = "giới từ";
    else if (key === "conjunction" || key === "conj") label = "liên từ";
    return `<span class="vocab-card-type ${badgeClass}">${label}</span>`;
  }).join(" ");
}

// Render Bảng tổng hợp tất cả từ vựng
function renderAllVocabTable() {
  const tableBody = document.getElementById("all-vocab-table-body");
  const statsBar = document.getElementById("all-vocab-stats-bar");
  const paginationContainer = document.getElementById("all-vocab-pagination-container");

  if (!tableBody) return;

  const searchEl = document.getElementById("all-vocab-search");
  const topicFilterEl = document.getElementById("all-vocab-filter-topic");
  const typeFilterEl = document.getElementById("all-vocab-filter-type");
  const statusFilterEl = document.getElementById("all-vocab-filter-status");
  const perPageEl = document.getElementById("all-vocab-per-page");

  const searchQuery = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const filterTopic = topicFilterEl ? topicFilterEl.value : "all";
  const filterType = typeFilterEl ? typeFilterEl.value : "all";
  const filterStatus = statusFilterEl ? statusFilterEl.value : "all";
  const perPageVal = perPageEl ? perPageEl.value : "50";

  if (perPageVal === "all") {
    state.allVocabState.itemsPerPage = 999999;
  } else {
    state.allVocabState.itemsPerPage = parseInt(perPageVal, 10) || 50;
  }

  // Lọc danh sách từ vựng theo từ khóa và bộ lọc
  const filtered = state.vocabulary.filter(item => {
    const synonyms = parseVocabSynonyms(item).join(" ").toLowerCase();
    const cleanDef = parseVocabDefinition(item).toLowerCase();
    
    const matchesSearch = !searchQuery ||
      item.word.toLowerCase().includes(searchQuery) ||
      cleanDef.includes(searchQuery) ||
      (item.definition && item.definition.toLowerCase().includes(searchQuery)) ||
      synonyms.includes(searchQuery);

    const matchesTopic = filterTopic === "all" || 
                         (item.topic && item.topic === filterTopic) || 
                         (filterTopic === "General" && (!item.topic || item.topic === "General" || item.topic === "Từ vựng chung"));
    const matchesType = filterType === "all" || (item.type && item.type.toLowerCase().includes(filterType));
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;

    return matchesSearch && matchesTopic && matchesType && matchesStatus;
  });

  const totalItems = filtered.length;
  const itemsPerPage = state.allVocabState.itemsPerPage;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  if (state.allVocabState.currentPage > totalPages) {
    state.allVocabState.currentPage = totalPages;
  }
  if (state.allVocabState.currentPage < 1) {
    state.allVocabState.currentPage = 1;
  }

  const currentPage = state.allVocabState.currentPage;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(totalItems, startIndex + itemsPerPage);
  const pageItems = filtered.slice(startIndex, endIndex);

  // Cập nhật thanh thống kê
  if (statsBar) {
    if (totalItems === 0) {
      statsBar.innerHTML = `<span><i class="fa-solid fa-table-list"></i> Không tìm thấy từ vựng nào phù hợp</span>`;
    } else {
      const isAll = perPageVal === "all";
      const rangeText = isAll ? `Tất cả ${totalItems}` : `${startIndex + 1}–${endIndex}`;
      statsBar.innerHTML = `
        <span><i class="fa-solid fa-table-list"></i> Hiển thị <strong>${rangeText}</strong> / <strong>${totalItems}</strong> từ vựng (Tổng kho: ${state.vocabulary.length} từ)</span>
        <span style="font-size: 12px; opacity: 0.85;">${isAll ? 'Tất cả 1 trang' : `Trang ${currentPage} / ${totalPages}`}</span>
      `;
    }
  }

  tableBody.innerHTML = "";

  if (totalItems === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
          <i class="fa-solid fa-magnifying-glass" style="font-size: 32px; margin-bottom: 10px; display: block; opacity: 0.4;"></i>
          Không tìm thấy từ vựng nào khớp với từ khóa tìm kiếm hoặc bộ lọc!
        </td>
      </tr>
    `;
    if (paginationContainer) paginationContainer.innerHTML = "";
    return;
  }

  pageItems.forEach((item, index) => {
    const stt = startIndex + index + 1;
    const synonymsArr = parseVocabSynonyms(item);
    const cleanDefinition = parseVocabDefinition(item);
    const typePills = formatWordTypePills(item.type);
    const topicName = (item.topic === "General" || !item.topic) ? "Từ vựng chung" : item.topic;

    let synonymsHTML = "";
    if (synonymsArr.length > 0) {
      synonymsHTML = `
        <div class="synonym-tags-list">
          ${synonymsArr.map(s => `<span class="synonym-tag">${s}</span>`).join("")}
        </div>
      `;
    } else {
      synonymsHTML = `<span style="color: var(--text-muted); font-size: 13px; font-style: italic;">—</span>`;
    }

    // Ngữ pháp sau từ (grammarPattern)
    const grammarHTML = item.grammarPattern
      ? `<span class="vocab-grammar-pattern" style="display:inline-flex; margin:0;">
           <i class="fa-solid fa-diagram-project"></i>${item.grammarPattern}
         </span>`
      : `<span style="color: var(--text-muted); font-size: 13px; font-style: italic;">—</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="table-stt">${stt}</td>
      <td>
        <div class="table-word-cell">
          <span class="word-text">${item.word}</span>
          ${item.pronunciation ? `<span class="phonetic-text">${item.pronunciation}</span>` : ""}
          <button class="table-speak-btn" onclick="speakWord('${item.word.replace(/'/g, "\\'")}')" title="Phát âm tiếng Anh">
            <i class="fa-solid fa-volume-high"></i>
          </button>
        </div>
      </td>`
      + `<td><span class="vocab-card-topic-tag" style="margin-top:0;"><i class="fa-solid fa-folder"></i> ${topicName}</span></td>
      <td>${typePills}</td>
      <td style="line-height: 1.5; font-weight: 500;">${cleanDefinition}</td>
      <td>${synonymsHTML}</td>
      <td>${grammarHTML}</td>
    `;
    tableBody.appendChild(tr);
  });

  renderAllVocabPagination(totalPages, currentPage, paginationContainer);
}

// Render các nút phân trang cho All Vocab Table
function renderAllVocabPagination(totalPages, currentPage, container) {
  if (!container) return;
  container.innerHTML = "";

  if (totalPages <= 1) return;

  // Nút Trang trước
  const prevBtn = document.createElement("button");
  prevBtn.className = `btn btn-secondary btn-sm ${currentPage === 1 ? 'disabled' : ''}`;
  prevBtn.style.padding = "6px 12px";
  prevBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i> Trước`;
  if (currentPage > 1) {
    prevBtn.addEventListener("click", () => {
      state.allVocabState.currentPage--;
      renderAllVocabTable();
      scrollToAllVocabTableTop();
    });
  } else {
    prevBtn.style.opacity = "0.4";
    prevBtn.style.cursor = "not-allowed";
  }
  container.appendChild(prevBtn);

  // Số trang
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, currentPage + 2);

  if (currentPage <= 3) endPage = Math.min(totalPages, 5);
  if (currentPage >= totalPages - 2) startPage = Math.max(1, totalPages - 4);

  if (startPage > 1) {
    const page1Btn = document.createElement("button");
    page1Btn.className = "btn btn-secondary btn-sm";
    page1Btn.style.padding = "6px 12px";
    page1Btn.textContent = "1";
    page1Btn.addEventListener("click", () => {
      state.allVocabState.currentPage = 1;
      renderAllVocabTable();
      scrollToAllVocabTableTop();
    });
    container.appendChild(page1Btn);

    if (startPage > 2) {
      const dots = document.createElement("span");
      dots.style.color = "var(--text-muted)";
      dots.style.padding = "0 4px";
      dots.textContent = "...";
      container.appendChild(dots);
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement("button");
    pageBtn.className = `btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-secondary'}`;
    pageBtn.style.padding = "6px 12px";
    pageBtn.textContent = i;
    pageBtn.addEventListener("click", () => {
      state.allVocabState.currentPage = i;
      renderAllVocabTable();
      scrollToAllVocabTableTop();
    });
    container.appendChild(pageBtn);
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      const dots = document.createElement("span");
      dots.style.color = "var(--text-muted)";
      dots.style.padding = "0 4px";
      dots.textContent = "...";
      container.appendChild(dots);
    }

    const lastPageBtn = document.createElement("button");
    lastPageBtn.className = "btn btn-secondary btn-sm";
    lastPageBtn.style.padding = "6px 12px";
    lastPageBtn.textContent = totalPages;
    lastPageBtn.addEventListener("click", () => {
      state.allVocabState.currentPage = totalPages;
      renderAllVocabTable();
      scrollToAllVocabTableTop();
    });
    container.appendChild(lastPageBtn);
  }

  // Nút Trang sau
  const nextBtn = document.createElement("button");
  nextBtn.className = `btn btn-secondary btn-sm ${currentPage === totalPages ? 'disabled' : ''}`;
  nextBtn.style.padding = "6px 12px";
  nextBtn.innerHTML = `Sau <i class="fa-solid fa-chevron-right"></i>`;
  if (currentPage < totalPages) {
    nextBtn.addEventListener("click", () => {
      state.allVocabState.currentPage++;
      renderAllVocabTable();
      scrollToAllVocabTableTop();
    });
  } else {
    nextBtn.style.opacity = "0.4";
    nextBtn.style.cursor = "not-allowed";
  }
  container.appendChild(nextBtn);
}

function scrollToAllVocabTableTop() {
  const sec = document.getElementById("sec-all-vocab");
  if (sec) {
    sec.scrollIntoView({ behavior: "smooth" });
  }
}

// Xuất CSV Bảng từ vựng
function exportAllVocabToCSV() {
  if (!state.vocabulary || state.vocabulary.length === 0) {
    showToast("Không có từ vựng nào để xuất CSV!", "warning");
    return;
  }

  let csvContent = "\uFEFF"; // UTF-8 BOM cho MS Excel
  csvContent += "STT,Từ vựng,Dạng từ loại,Nghĩa tiếng Việt,Các từ paraphrase đồng nghĩa\n";

  state.vocabulary.forEach((item, idx) => {
    const stt = idx + 1;
    const word = `"${item.word.replace(/"/g, '""')}"`;
    
    const types = item.type ? item.type.split(/[\s,]+/).filter(Boolean) : ["noun"];
    const labels = types.map(t => {
      if (t === "noun") return "danh từ";
      if (t === "verb") return "động từ";
      if (t === "adjective") return "tính từ";
      if (t === "adverb") return "trạng từ";
      if (t === "preposition") return "giới từ";
      if (t === "conjunction") return "liên từ";
      return t;
    });
    const typeLabel = `"${labels.join(", ")}"`;

    const cleanDef = `"${parseVocabDefinition(item).replace(/"/g, '""')}"`;
    const synonymsStr = `"${parseVocabSynonyms(item).join(", ").replace(/"/g, '""')}"`;

    csvContent += `${stt},${word},${typeLabel},${cleanDef},${synonymsStr}\n`;
  });

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `Tong_Hop_Tu_Vung_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Đã xuất danh sách từ vựng thành công!");
}

// Sao chép toàn bộ bảng từ vựng vào bộ nhớ tạm
function copyAllVocabTable() {
  if (!state.vocabulary || state.vocabulary.length === 0) {
    showToast("Không có dữ liệu để sao chép!", "warning");
    return;
  }

  let text = "STT\tTừ vựng\tDạng từ loại\tNghĩa tiếng Việt\tCác từ paraphrase đồng nghĩa\n";
  state.vocabulary.forEach((item, idx) => {
    const stt = idx + 1;
    const word = item.word;
    const types = item.type ? item.type.split(/[\s,]+/).filter(Boolean) : ["noun"];
    const labels = types.map(t => {
      if (t === "noun") return "danh từ";
      if (t === "verb") return "động từ";
      if (t === "adjective") return "tính từ";
      if (t === "adverb") return "trạng từ";
      if (t === "preposition") return "giới từ";
      if (t === "conjunction") return "liên từ";
      return t;
    });
    const typeLabel = labels.join(", ");
    const cleanDef = parseVocabDefinition(item);
    const synonymsStr = parseVocabSynonyms(item).join(", ");

    text += `${stt}\t${word}\t${typeLabel}\t${cleanDef}\t${synonymsStr}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast("Đã sao chép toàn bộ bảng từ vựng vào khay nhớ tạm!");
  }).catch(() => {
    showToast("Không thể sao chép tự động", "warning");
  });
}

// Sử dụng Web Speech API để phát âm tiếng Anh
window.speakWord = function(text) {
  if (!('speechSynthesis' in window)) {
    showToast("Trình duyệt của bạn không hỗ trợ tính năng phát âm!", "danger");
    return;
  }

  // Hủy âm thanh đang phát để phát âm thanh mới lập tức
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.85; // Tốc độ nói vừa phải để dễ nghe
  window.speechSynthesis.speak(utterance);
};

// --- 7. CHỨC NĂNG ÔN TẬP (FLASHCARDS) ---
function initFlashcards() {
  const limitSelect = document.getElementById("flash-filter-limit");
  const limitVal = limitSelect ? limitSelect.value : "50";
  const topicSelect = document.getElementById("flash-filter-topic");
  const topicVal = topicSelect ? topicSelect.value : "all";

  let pool = state.vocabulary;
  if (topicVal !== "all") {
    pool = pool.filter(v => (v.topic && v.topic === topicVal) || (topicVal === "General" && (!v.topic || v.topic === "General" || v.topic === "Từ vựng chung")));
  }

  // Lấy các từ ở trạng thái 'learning' làm ưu tiên ôn tập
  let listToLearn = pool.filter(v => v.status === "learning");
  
  // Nếu đã thuộc hết các từ trong pool, lấy toàn bộ danh sách pool để ôn tập lại
  if (listToLearn.length === 0) {
    listToLearn = pool;
  }

  let shuffled = shuffleArray([...listToLearn]);

  if (limitVal !== "all") {
    const maxCount = parseInt(limitVal, 10);
    if (!isNaN(maxCount) && maxCount > 0) {
      shuffled = shuffled.slice(0, maxCount);
    }
  }

  state.flashcards.list = shuffled;
  state.flashcards.currentIndex = 0;
  state.flashcards.isFlipped = false;

  const cardBox = document.getElementById("flashcard-box");
  if (cardBox) cardBox.classList.remove("flipped");

  renderFlashcard();
}

function renderFlashcard() {
  const list = state.flashcards.list;
  const index = state.flashcards.currentIndex;

  const counter = document.getElementById("flashcard-counter");
  const fill = document.getElementById("flash-progress-fill");

  if (list.length === 0) {
    counter.textContent = "0 / 0 từ";
    fill.style.width = "0%";
    
    // Giao diện trống
    document.getElementById("flash-word").textContent = "Trống";
    document.getElementById("flash-phonetic").textContent = "";
    document.getElementById("flash-type").textContent = "";
    document.getElementById("flash-definition").textContent = "Hãy thêm từ mới vào kho từ vựng để ôn tập Flashcard!";
    document.getElementById("flash-example-box").style.display = "none";
    return;
  }

  // Cập nhật tiến độ
  counter.textContent = `${index + 1} / ${list.length} từ`;
  const percent = ((index) / list.length) * 100;
  fill.style.width = `${percent}%`;

  const item = list[index];
  
  // Cập nhật thông tin mặt trước
  document.getElementById("flash-word").textContent = item.word;
  document.getElementById("flash-phonetic").textContent = item.pronunciation || "";
  
  let typeLabel = "";
  if (item.type === "noun") typeLabel = "Danh từ";
  else if (item.type === "verb") typeLabel = "Động từ";
  else if (item.type === "adjective") typeLabel = "Tính từ";
  else if (item.type === "adverb") typeLabel = "Trạng từ";
  else typeLabel = item.type;
  document.getElementById("flash-type").textContent = typeLabel;

  // Cập nhật thông tin mặt sau
  document.getElementById("flash-definition").textContent = item.definition;

  const exampleBox = document.getElementById("flash-example-box");
  if (item.example) {
    exampleBox.style.display = "block";
    document.getElementById("flash-example").textContent = item.example;
    document.getElementById("flash-example-translation").textContent = item.exampleTranslation || "";
  } else {
    exampleBox.style.display = "none";
  }

  // Hiển thị ngữ pháp sau từ ở mặt sau flashcard
  const grammarPatternEl = document.getElementById("flash-grammar-pattern");
  const grammarPatternText = document.getElementById("flash-grammar-pattern-text");
  if (grammarPatternEl && grammarPatternText) {
    if (item.grammarPattern) {
      grammarPatternText.textContent = item.grammarPattern;
      grammarPatternEl.style.display = "flex";
    } else {
      grammarPatternEl.style.display = "none";
    }
  }
}

// Xử lý chuyển thẻ tiếp theo trong flashcard
function nextFlashcard(isMastered = false) {
  const list = state.flashcards.list;
  const index = state.flashcards.currentIndex;
  
  if (list.length === 0) return;

  const currentItem = list[index];

  // Nếu người dùng chọn "Đã thuộc"
  if (isMastered) {
    // Đổi trạng thái trong state tổng
    const mainVocab = state.vocabulary.find(v => v.id === currentItem.id);
    if (mainVocab) {
      mainVocab.status = "mastered";
      saveToLocalStorage("vocab");
      updateGlobalStats();
    }
  }

  // Reset hiệu ứng lật thẻ
  const cardBox = document.getElementById("flashcard-box");
  cardBox.classList.remove("flipped");
  state.flashcards.isFlipped = false;

  // Đợi hiệu ứng lật thẻ quay lại mặt trước rồi mới đổi chữ (tránh lộ chữ trước khi lật)
  setTimeout(() => {
    state.flashcards.currentIndex++;
    
    // Nếu hoàn thành lượt ôn tập
    if (state.flashcards.currentIndex >= list.length) {
      // Đầy thanh progress
      document.getElementById("flash-progress-fill").style.width = "100%";
      
      // Chúc mừng
      showToast("Chúc mừng! Bạn đã ôn tập xong danh sách thẻ từ vựng này.", "success");
      
      // Reset về từ đầu hoặc thông báo hoàn thành
      if (confirm("Chúc mừng bạn đã hoàn thành bộ flashcard này! Bạn có muốn học lại lượt mới không?")) {
        initFlashcards();
      } else {
        navigateToTab("dashboard");
      }
    } else {
      renderFlashcard();
    }
  }, 250); // Khớp thời gian animation CSS
}

// --- 8. CHỨC NĂNG KIỂM TRA TỪ VỰNG (QUIZ) ---
function initQuizSetup() {
  document.getElementById("quiz-setup-screen").style.display = "flex";
  document.getElementById("quiz-play-screen").style.display = "none";
  document.getElementById("quiz-result-screen").style.display = "none";

  const topicSelect = document.getElementById("quiz-filter-topic");
  const topicVal = topicSelect ? topicSelect.value : "all";

  let pool = state.vocabulary;
  if (topicVal !== "all") {
    pool = pool.filter(v => (v.topic && v.topic === topicVal) || (topicVal === "General" && (!v.topic || v.topic === "General" || v.topic === "Từ vựng chung")));
  }

  let quizVocab = pool.filter(v => v.status === "mastered");
  if (quizVocab.length < 4) {
    quizVocab = pool;
  }

  const warning = document.getElementById("quiz-empty-warning");
  if (warning) {
    if (quizVocab.length < 4) {
      warning.style.display = "block";
      warning.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Chủ đề này cần tối thiểu <strong>4 từ vựng</strong> để bắt đầu kiểm tra. Hiện có <strong>${quizVocab.length}</strong> từ. Hãy chọn chủ đề khác!`;
      document.getElementById("quiz-mode-mcq").style.pointerEvents = "none";
      document.getElementById("quiz-mode-fitb").style.pointerEvents = "none";
      document.getElementById("quiz-mode-mcq").style.opacity = "0.5";
      document.getElementById("quiz-mode-fitb").style.opacity = "0.5";
    } else {
      warning.style.display = "none";
      document.getElementById("quiz-mode-mcq").style.pointerEvents = "auto";
      document.getElementById("quiz-mode-fitb").style.pointerEvents = "auto";
      document.getElementById("quiz-mode-mcq").style.opacity = "1";
      document.getElementById("quiz-mode-fitb").style.opacity = "1";
    }
  }
}

function startQuiz(mode) {
  const topicSelect = document.getElementById("quiz-filter-topic");
  const topicVal = topicSelect ? topicSelect.value : "all";

  let pool = state.vocabulary;
  if (topicVal !== "all") {
    pool = pool.filter(v => (v.topic && v.topic === topicVal) || (topicVal === "General" && (!v.topic || v.topic === "General" || v.topic === "Từ vựng chung")));
  }

  let quizVocab = pool.filter(v => v.status === "mastered");
  if (quizVocab.length < 4) {
    quizVocab = pool;
  }

  if (quizVocab.length < 4) {
    showToast("Bạn cần có tối thiểu 4 từ vựng trong chủ đề này để bắt đầu kiểm tra!", "warning");
    return;
  }

  state.quiz.mode = mode;
  state.quiz.currentIndex = 0;
  state.quiz.score = 0;
  state.quiz.hasAnswered = false;

  // Lấy giới hạn số câu hỏi do người học chọn
  const countSelect = document.getElementById("quiz-question-count");
  const countVal = countSelect ? countSelect.value : "10";
  let limit = 10;
  if (countVal === "all") {
    limit = quizVocab.length;
  } else {
    limit = parseInt(countVal, 10);
  }

  const totalQuestions = Math.min(limit, quizVocab.length);
  const shuffledVocab = shuffleArray([...quizVocab]);
  const selectedVocab = shuffledVocab.slice(0, totalQuestions);

  // Tạo câu hỏi chi tiết
  state.quiz.questions = selectedVocab.map(vocab => {
    if (mode === "mcq") {
      // 1 đáp án đúng
      const correctAnswer = vocab.definition;
      
      // Lấy 3 đáp án sai từ các từ vựng khác
      const otherMastered = quizVocab.filter(v => v.id !== vocab.id);
      const otherVocabs = otherMastered.length >= 3 ? otherMastered : state.vocabulary.filter(v => v.id !== vocab.id);
      const shuffledOthers = shuffleArray(otherVocabs);
      const wrongAnswers = shuffledOthers.slice(0, 3).map(v => v.definition);

      const options = shuffleArray([correctAnswer, ...wrongAnswers]);

      return {
        word: vocab.word,
        correctAnswer: correctAnswer,
        options: options,
        vocabObj: vocab
      };
    } else {
      // Chế độ điền từ vào chỗ trống
      // Tạo ví dụ ẩn đi từ khóa
      let hiddenExample = "";
      if (vocab.example) {
        // Thay thế từ trong ví dụ bằng dấu gạch ngang (không phân biệt hoa thường)
        const regex = new RegExp(`\\b${vocab.word}\\b`, 'gi');
        hiddenExample = vocab.example.replace(regex, "_______");
      }

      return {
        word: vocab.word, // Đáp án chính xác
        correctAnswer: vocab.word.trim().toLowerCase(),
        definition: vocab.definition,
        hiddenExample: hiddenExample,
        exampleTranslation: vocab.exampleTranslation || "",
        vocabObj: vocab
      };
    }
  });

  // Chuyển màn hình
  document.getElementById("quiz-setup-screen").style.display = "none";
  document.getElementById("quiz-play-screen").style.display = "flex";
  document.getElementById("quiz-result-screen").style.display = "none";

  renderQuizQuestion();
}

function renderQuizQuestion() {
  state.quiz.hasAnswered = false;
  
  const qIndex = state.quiz.currentIndex;
  const qList = state.quiz.questions;
  const currentQ = qList[qIndex];

  // Ẩn nút "Tiếp tục" cho đến khi trả lời xong
  document.getElementById("quiz-btn-next").style.display = "none";

  // Cập nhật Tiến độ & Điểm trực tiếp
  document.getElementById("quiz-progress-text").textContent = `Câu hỏi ${qIndex + 1}/${qList.length}`;
  document.getElementById("quiz-score-live").textContent = `Điểm: ${state.quiz.score}`;
  
  const progressPercent = ((qIndex) / qList.length) * 100;
  document.getElementById("quiz-progress-fill").style.width = `${progressPercent}%`;

  const qLabel = document.getElementById("quiz-q-label");
  const qText = document.getElementById("quiz-q-text");
  const qSub = document.getElementById("quiz-q-sub");

  const mcqContainer = document.getElementById("quiz-options-container");
  const fitbContainer = document.getElementById("quiz-input-container");

  if (state.quiz.mode === "mcq") {
    // MCQ Giao diện
    mcqContainer.style.display = "grid";
    fitbContainer.style.display = "none";
    mcqContainer.innerHTML = "";

    qLabel.textContent = "Hãy tìm định nghĩa tiếng Việt chính xác của từ:";
    qText.textContent = currentQ.word;
    qSub.textContent = currentQ.vocabObj.pronunciation || "";

    // Sinh các button đáp án
    currentQ.options.forEach(option => {
      const btn = document.createElement("button");
      btn.className = "quiz-option-btn";
      btn.innerHTML = `<span>${option}</span> <i class="fa-regular fa-circle"></i>`;
      btn.addEventListener("click", () => selectMCQOption(btn, option, currentQ.correctAnswer));
      mcqContainer.appendChild(btn);
    });
  } else {
    // FITB Giao diện
    mcqContainer.style.display = "none";
    fitbContainer.style.display = "flex";

    qLabel.textContent = "Hãy gõ từ tiếng Anh phù hợp với định nghĩa:";
    qText.textContent = currentQ.definition;
    
    if (currentQ.hiddenExample) {
      qSub.innerHTML = `Ví dụ: ${currentQ.hiddenExample}<br><span style="color:var(--text-muted); font-size:12px; font-weight:normal;">(${currentQ.exampleTranslation})</span>`;
    } else {
      qSub.textContent = "";
    }

    // Reset input text
    const answerInput = document.getElementById("quiz-input-answer");
    answerInput.value = "";
    answerInput.disabled = false;
    answerInput.style.borderColor = "var(--border-glass)";
    answerInput.style.color = "var(--text-main)";
    answerInput.focus();

    // Reset button gửi
    const submitBtn = document.getElementById("quiz-btn-submit-answer");
    submitBtn.disabled = false;
    submitBtn.innerHTML = "Gửi đáp án";
    submitBtn.className = "btn btn-primary";
  }
}

// Xử lý chọn đáp án MCQ
function selectMCQOption(selectedBtn, selectedValue, correctValue) {
  if (state.quiz.hasAnswered) return;
  state.quiz.hasAnswered = true;

  const isCorrect = selectedValue === correctValue;
  
  if (isCorrect) {
    state.quiz.score++;
    selectedBtn.className = "quiz-option-btn correct";
    selectedBtn.querySelector("i").className = "fa-solid fa-circle-check";
    showToast("Chính xác!", "success");
  } else {
    selectedBtn.className = "quiz-option-btn wrong";
    selectedBtn.querySelector("i").className = "fa-solid fa-circle-xmark";
    
    // Tìm và làm nổi bật đáp án đúng trong container từ vựng
    document.querySelectorAll("#quiz-options-container .quiz-option-btn").forEach(btn => {
      if (btn.querySelector("span").textContent === correctValue) {
        btn.className = "quiz-option-btn correct";
        btn.querySelector("i").className = "fa-solid fa-circle-check";
      }
    });
    showToast("Chưa đúng rồi!", "danger");
  }

  // Phát âm từ vựng để người dùng nhớ cách đọc luôn
  const currentQ = state.quiz.questions[state.quiz.currentIndex];
  speakWord(currentQ.word);

  // Vô hiệu hóa tất cả các nút khác trong container từ vựng
  document.querySelectorAll("#quiz-options-container .quiz-option-btn").forEach(btn => {
    btn.style.pointerEvents = "none";
  });

  // Hiện nút tiếp theo
  document.getElementById("quiz-btn-next").style.display = "inline-flex";
}

// Xử lý gửi đáp án Điền từ (FITB)
function submitFITBAnswer() {
  if (state.quiz.hasAnswered) return;
  
  const answerInput = document.getElementById("quiz-input-answer");
  const userAnswer = answerInput.value.trim().toLowerCase();
  
  if (!userAnswer) {
    showToast("Vui lòng nhập từ tiếng Anh để kiểm tra!", "warning");
    return;
  }
  
  state.quiz.hasAnswered = true;
  answerInput.disabled = true;

  const currentQ = state.quiz.questions[state.quiz.currentIndex];
  const isCorrect = userAnswer === currentQ.correctAnswer;
  
  const submitBtn = document.getElementById("quiz-btn-submit-answer");
  submitBtn.disabled = true;

  if (isCorrect) {
    state.quiz.score++;
    answerInput.style.borderColor = "var(--color-success)";
    answerInput.style.color = "var(--color-success)";
    showToast("Chính xác!", "success");
  } else {
    answerInput.style.borderColor = "var(--color-danger)";
    answerInput.style.color = "var(--color-danger)";
    showToast(`Chưa đúng! Đáp án đúng là: ${currentQ.word}`, "danger");
  }

  // Phát âm từ
  speakWord(currentQ.word);

  // Hiển thị nút tiếp theo
  document.getElementById("quiz-btn-next").style.display = "inline-flex";
}

// Chuyển câu hỏi tiếp theo hoặc kết thúc quiz
function nextQuizQuestion() {
  state.quiz.currentIndex++;
  
  if (state.quiz.currentIndex >= state.quiz.questions.length) {
    // Đạt đến câu cuối cùng => Show màn hình kết quả
    showQuizResults();
  } else {
    renderQuizQuestion();
  }
}

function showQuizResults() {
  document.getElementById("quiz-setup-screen").style.display = "none";
  document.getElementById("quiz-play-screen").style.display = "none";
  document.getElementById("quiz-result-screen").style.display = "flex";

  const total = state.quiz.questions.length;
  const score = state.quiz.score;
  const percent = Math.round((score / total) * 100);

  document.getElementById("quiz-final-score").textContent = `${score}/${total}`;

  const title = document.getElementById("quiz-result-title");
  const msg = document.getElementById("quiz-result-message");
  const icon = document.getElementById("quiz-result-icon");

  if (percent === 100) {
    title.textContent = "Tuyệt vời! Điểm tuyệt đối!";
    msg.textContent = "Bạn đã trả lời đúng tất cả các câu hỏi. Khả năng ghi nhớ từ vựng của bạn cực kỳ tốt!";
    icon.className = "fa-solid fa-trophy";
    icon.style.color = "var(--color-warning)";
  } else if (percent >= 70) {
    title.textContent = "Kết quả rất tốt!";
    msg.textContent = "Bạn nắm từ vựng rất khá. Hãy tiếp tục ôn tập thường xuyên nhé!";
    icon.className = "fa-solid fa-medal";
    icon.style.color = "var(--color-secondary)";
  } else if (percent >= 50) {
    title.textContent = "Đạt mục tiêu!";
    msg.textContent = "Bạn đã nhớ được một nửa số từ kiểm tra. Hãy ôn lại Flashcard để củng cố kỹ hơn.";
    icon.className = "fa-solid fa-thumbs-up";
    icon.style.color = "var(--color-primary-light)";
  } else {
    title.textContent = "Cần cố gắng thêm nhé!";
    msg.textContent = "Có vẻ bạn đã quên một số từ rồi. Đừng lo lắng, hãy ôn tập qua Flashcards thường xuyên để ghi nhớ tốt hơn.";
    icon.className = "fa-solid fa-book-open-reader";
    icon.style.color = "var(--text-muted)";
  }
}

// --- 9. CHỨC NĂNG HỌC NGỮ PHÁP (GRAMMAR HUB) ---
function renderGrammarList() {
  const listContainer = document.getElementById("grammar-lesson-list");
  if (!listContainer) return;
  
  listContainer.innerHTML = "";

  state.grammar.forEach((item, index) => {
    const navItem = document.createElement("div");
    navItem.className = `grammar-nav-item ${index === 0 ? "active" : ""}`;
    navItem.setAttribute("data-id", item.id);
    
    // Rút gọn công thức hiển thị
    const shortFormula = item.formula.split('\n')[0];

    navItem.innerHTML = `
      <h4 class="grammar-nav-title">${item.title}</h4>
      <p class="grammar-nav-desc">${shortFormula}</p>
    `;
    
    navItem.addEventListener("click", () => selectGrammarLesson(item.id, navItem));
    listContainer.appendChild(navItem);
  });

  // Mặc định hiển thị bài đầu tiên nếu có danh sách
  if (state.grammar.length > 0) {
    displayGrammarDetail(state.grammar[0].id);
  }
}

function selectGrammarLesson(id, element) {
  // Đổi active class trên sidebar ngữ pháp
  document.querySelectorAll(".grammar-nav-item").forEach(item => {
    item.classList.remove("active");
  });
  element.classList.add("active");

  displayGrammarDetail(id);
}

function displayGrammarDetail(id) {
  const lesson = state.grammar.find(g => g.id === id);
  if (!lesson) return;

  // Reset giao diện thực hành ngữ pháp khi chuyển sang bài học mới
  const writeInput = document.getElementById("g-write-input");
  if (writeInput) writeInput.value = "";
  
  const writeResultBox = document.getElementById("g-write-result-box");
  if (writeResultBox) writeResultBox.style.display = "none";

  // Reset tab về tab luyện viết câu
  switchGrammarPracticeTab("write");

  // Ẩn bảng thực hành đối với các bài học ngữ pháp tự tạo (không có ngân hàng câu hỏi)
  const practiceArea = document.getElementById("g-practice-container");
  if (practiceArea) {
    if (id.startsWith("grammar-custom-")) {
      practiceArea.style.display = "none";
    } else {
      practiceArea.style.display = "block";
    }
  }

  document.getElementById("g-view-title").textContent = lesson.title;
  document.getElementById("g-view-formula").textContent = lesson.formula;
  document.getElementById("g-view-explanation").textContent = lesson.explanation;

  const examplesContainer = document.getElementById("g-view-examples");
  examplesContainer.innerHTML = "";

  if (lesson.examples && lesson.examples.length > 0) {
    lesson.examples.forEach(eg => {
      const egItem = document.createElement("div");
      egItem.className = "grammar-eg-item";
      egItem.innerHTML = `
        <div class="grammar-eg-eng"><i class="fa-solid fa-chevron-right" style="color:var(--color-secondary); font-size:11px; margin-right:8px;"></i>${eg.eng}</div>
        <div class="grammar-eg-vi">${eg.vi}</div>
      `;
      examplesContainer.appendChild(egItem);
    });
  } else {
    examplesContainer.innerHTML = `<p style="font-style:italic; color:var(--text-muted); font-size:13px;">Chưa có ví dụ cho chủ đề này.</p>`;
  }

  // Quản lý nút Xóa chủ đề: Chỉ cho phép xóa các chủ đề do Người dùng tự thêm (để phân biệt với chủ đề mặc định ban đầu)
  const actionContainer = document.getElementById("g-delete-action-container");
  actionContainer.innerHTML = "";
  
  if (id.startsWith("grammar-custom-")) {
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-sm";
    deleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Xóa ghi chú ngữ pháp này`;
    deleteBtn.addEventListener("click", () => deleteCustomGrammar(id));
    actionContainer.appendChild(deleteBtn);
  }
}

// Xử lý thêm ghi chú ngữ pháp tự chọn
document.getElementById("grammar-form").addEventListener("submit", function(e) {
  e.preventDefault();

  const title = document.getElementById("grammar-custom-title").value.trim();
  const formula = document.getElementById("grammar-custom-formula").value.trim();
  const explanation = document.getElementById("grammar-custom-explanation").value.trim();

  if (!title || !explanation) {
    showToast("Vui lòng nhập Tên chủ điểm và nội dung Giải thích!", "warning");
    return;
  }

  const newLesson = {
    id: `grammar-custom-${Date.now()}`,
    title: title,
    formula: formula || "Không có công thức cụ thể",
    explanation: explanation,
    examples: [] // Ghi chú cơ bản ban đầu có thể chưa có mảng ví dụ phức tạp
  };

  state.grammar.push(newLesson);
  saveToLocalStorage("grammar");
  
  // Reset form
  document.getElementById("grammar-form").reset();
  showToast(`Đã thêm ghi chú ngữ pháp: ${title}`);

  // Cập nhật sidebar & Hiển thị ngay bài học mới
  renderGrammarList();
  
  // Active bài học mới tạo
  setTimeout(() => {
    const items = document.querySelectorAll(".grammar-nav-item");
    const lastItem = items[items.length - 1];
    if (lastItem) {
      lastItem.click();
      lastItem.scrollIntoView({ behavior: "smooth" });
    }
  }, 100);
});

// Xóa chủ điểm ngữ pháp tự tạo
function deleteCustomGrammar(id) {
  const lesson = state.grammar.find(g => g.id === id);
  if (!lesson) return;

  if (confirm(`Bạn muốn xóa chủ đề ngữ pháp tự viết này chứ: "${lesson.title}"?`)) {
    state.grammar = state.grammar.filter(g => g.id !== id);
    saveToLocalStorage("grammar");
    showToast(`Đã xóa chủ đề ngữ pháp thành công`, "danger");
    renderGrammarList();
  }
}

// --- 9.1 CHỨC NĂNG THỰC HÀNH NGỮ PHÁP TƯƠNG TÁC ---

// Chuyển đổi tab trong Luyện tập ngữ pháp
function switchGrammarPracticeTab(tabName) {
  const btnWrite = document.getElementById("g-btn-tab-write");
  const btnMcq = document.getElementById("g-btn-tab-mcq");
  const contentWrite = document.getElementById("g-tab-content-write");
  const contentMcq = document.getElementById("g-tab-content-mcq");

  if (!btnWrite || !btnMcq || !contentWrite || !contentMcq) return;

  if (tabName === "write") {
    btnWrite.style.background = "rgba(123, 97, 255, 0.15)";
    btnWrite.style.border = "1px solid var(--border-active)";
    btnMcq.style.background = "none";
    btnMcq.style.border = "1px solid var(--border-glass)";

    contentWrite.style.display = "flex";
    contentMcq.style.display = "none";
  } else {
    btnMcq.style.background = "rgba(123, 97, 255, 0.15)";
    btnMcq.style.border = "1px solid var(--border-active)";
    btnWrite.style.background = "none";
    btnWrite.style.border = "1px solid var(--border-glass)";

    contentWrite.style.display = "none";
    contentMcq.style.display = "flex";
    
    // Nếu chưa chạy quiz thì reset về màn hình setup
    const playScreen = document.getElementById("g-mcq-play");
    const resultScreen = document.getElementById("g-mcq-result");
    if (playScreen && playScreen.style.display === "none" && resultScreen && resultScreen.style.display === "none") {
      document.getElementById("g-mcq-setup").style.display = "flex";
    }
  }
}

// Chấm điểm câu tự viết dựa trên Regex
function gradeGrammarSentence(lessonId, text) {
  const sentence = text.trim();
  if (sentence.split(/\s+/).length < 3) {
    return {
      score: 3,
      feedback: "Câu của bạn quá ngắn (dưới 3 từ). Vui lòng viết một câu hoàn chỉnh đầy đủ thành phần chủ ngữ - vị ngữ."
    };
  }

  let score = 10;
  let feedback = "";

  switch (lessonId) {
    case "grammar-1": // Hiện tại đơn
      const isPresSimple = /\b(am|is|are|don't|doesn't|do|does)\b/i.test(sentence) || 
                           /\b(always|usually|often|sometimes|never|every\s\w+)\b/i.test(sentence) ||
                           /[a-z]+s\b/i.test(sentence);
      if (isPresSimple) {
        score = 10;
        feedback = "Xuất sắc! Câu của bạn đã dùng đúng cấu trúc hoặc trạng từ chỉ tần suất của thì Hiện tại đơn.";
      } else {
        score = 4;
        feedback = "Cảnh báo: Câu dường như chưa chia động từ ở hiện tại đơn (V/V-s/es, am/is/are) hoặc thiếu các trạng từ chỉ tần suất (always, usually, often...).";
      }
      break;

    case "grammar-2": // Hiện tại tiếp diễn
      const hasTobePres = /\b(am|is|are|isn't|aren't|'m|'s|'re)\b/i.test(sentence);
      const hasVing = /\w+ing\b/i.test(sentence);
      
      if (hasTobePres && hasVing) {
        score = 10;
        feedback = "Tuyệt vời! Bạn đã sử dụng chính xác cấu trúc Hiện tại tiếp diễn (S + am/is/are + V-ing).";
      } else if (hasTobePres && !hasVing) {
        score = 5;
        feedback = "Câu có động từ to be (am/is/are) nhưng thiếu động từ thêm đuôi '-ing'. Ví dụ: is running, are building.";
      } else if (!hasTobePres && hasVing) {
        score = 5;
        feedback = "Câu có động từ đuôi '-ing' nhưng bạn quên mất động từ to be (am/is/are) đi kèm phía trước.";
      } else {
        score = 3;
        feedback = "Thiếu cấu trúc Hiện tại tiếp diễn. Hãy viết câu sử dụng: S + am/is/are + V-ing.";
      }
      break;

    case "grammar-3": // Hiện tại hoàn thành
      const hasHaveHas = /\b(have|has|haven't|hasn't|'ve|'s)\b/i.test(sentence);
      const hasV3 = /\w+ed\b/i.test(sentence) || /\b(been|done|seen|gone|written|read|come|taken|made|known|run|got|met|built|bought|lost|kept)\b/i.test(sentence);
      
      if (hasHaveHas && hasV3) {
        score = 10;
        feedback = "Rất tốt! Câu viết đúng cấu trúc Hiện tại hoàn thành (have/has + V3/ed).";
      } else if (hasHaveHas && !hasV3) {
        score = 5;
        feedback = "Bạn đã dùng trợ động từ have/has nhưng động từ chính chưa được chia ở dạng Phân từ 2 (V3/ed).";
      } else if (!hasHaveHas && hasV3) {
        score = 4;
        feedback = "Bạn có động từ phân từ 2 nhưng quên trợ động từ 'have' hoặc 'has' đi kèm phía trước.";
      } else {
        score = 3;
        feedback = "Chưa tìm thấy cấu trúc Hiện tại hoàn thành. Vui lòng chia động từ dạng: have/has + V3/ed.";
      }
      break;

    case "grammar-4": // Quá khứ đơn
      const hasPastVerb = /\b(was|were|wasn't|weren't|did|didn't|had|went|saw|wrote|built|demolished|took|came|made|found|bought|thought)\b/i.test(sentence) || /\w+ed\b/i.test(sentence);
      
      if (hasPastVerb) {
        score = 10;
        feedback = "Hoàn hảo! Bạn đã dùng đúng động từ ở thì Quá khứ đơn (V2/ed hoặc was/were).";
      } else {
        score = 4;
        feedback = "Câu chưa chia động từ ở quá khứ. Hãy dùng động từ thêm -ed hoặc động từ bất quy tắc cột 2 (ví dụ: built, demolished, went).";
      }
      break;

    case "grammar-5": // Tương lai đơn
      const hasWill = /\b(will|won't)\b/i.test(sentence);
      if (hasWill) {
        score = 10;
        feedback = "Chính xác! Câu đã áp dụng cấu trúc Tương lai đơn với trợ động từ 'will / won't'.";
      } else {
        score = 4;
        feedback = "Thiếu trợ động từ 'will' hoặc phủ định 'won't' để biểu thị hành động xảy ra ở tương lai.";
      }
      break;

    case "grammar-6": // Tương lai gần
      const hasTobeNear = /\b(am|is|are|isn't|aren't|'m|'s|'re)\b/i.test(sentence);
      const hasGoingTo = /\bgoing\s+to\b/i.test(sentence);
      
      if (hasTobeNear && hasGoingTo) {
        score = 10;
        feedback = "Tuyệt vời! Bạn đã sử dụng chính xác cấu trúc Tương lai gần (be going to + V-inf).";
      } else if (hasTobeNear && !hasGoingTo) {
        score = 5;
        feedback = "Thiếu cụm từ 'going to' sau động từ to be.";
      } else if (!hasTobeNear && hasGoingTo) {
        score = 5;
        feedback = "Bạn quên chia động từ to be (am/is/are) trước cụm 'going to'.";
      } else {
        score = 3;
        feedback = "Hãy viết lại câu sử dụng cấu trúc Tương lai gần: S + am/is/are + going to + V-inf.";
      }
      break;

    case "grammar-7": // Từ loại
      const words = sentence.split(/\s+/);
      const hasPrepositions = /\b(in|on|at|of|to|for|with|by|from|about|through|under)\b/i.test(sentence);
      
      if (words.length >= 5 && hasPrepositions) {
        score = 10;
        feedback = "Tuyệt vời! Câu của bạn dài và sử dụng đa dạng các loại từ bao gồm cả Giới từ để liên kết ý.";
      } else if (words.length >= 5 && !hasPrepositions) {
        score = 8;
        feedback = "Câu viết tốt. Để câu sinh động hơn, hãy thử chèn thêm các giới từ (in, on, at, with...) để chỉ mối liên hệ không gian hoặc thời gian.";
      } else {
        score = 6;
        feedback = "Câu hơi ngắn. Hãy mở rộng thêm các thành phần trong câu để có cấu trúc ngữ pháp phong phú hơn.";
      }
      break;

    case "grammar-8": // So sánh hơn/kém
      const hasThan = /\bthan\b/i.test(sentence);
      const hasCompMarker = /\w+er\b/i.test(sentence) || /\b(more|less)\b/i.test(sentence) || /\b(better|worse|further)\b/i.test(sentence);
      
      if (hasThan && hasCompMarker) {
        score = 10;
        feedback = "Chính xác! Câu của bạn đã dùng đúng cấu trúc so sánh hơn/kém với từ liên kết 'than'.";
      } else if (!hasThan && hasCompMarker) {
        score = 5;
        feedback = "Bạn đã dùng tính từ so sánh nhưng thiếu từ 'than' để liên kết với đối tượng so sánh thứ hai.";
      } else if (hasThan && !hasCompMarker) {
        score = 5;
        feedback = "Câu có từ 'than' nhưng chưa thấy tính từ/trạng từ ở dạng so sánh hơn (đuôi -er hoặc more/less).";
      } else {
        score = 3;
        feedback = "Vui lòng đặt câu so sánh sử dụng cấu trúc: Adj-er + than hoặc more/less + Adj + than.";
      }
      break;

    case "grammar-9": // So sánh bằng
      const hasAsAs = /\bas\b.*\bas\b/i.test(sentence) || /\bso\b.*\bas\b/i.test(sentence);
      if (hasAsAs) {
        score = 10;
        feedback = "Tuyệt vời! Bạn đã áp dụng hoàn hảo cấu trúc so sánh bằng (as + Adj/Adv + as).";
      } else {
        score = 4;
        feedback = "Thiếu cấu trúc so sánh bằng. Hãy đặt câu chứa cụm: as + tính từ + as.";
      }
      break;

    case "grammar-10": // So sánh nhất
      const hasTheSuper = /\bthe\b/i.test(sentence);
      const hasSuperMarker = /\w+est\b/i.test(sentence) || /\b(most|least)\b/i.test(sentence) || /\b(best|worst|furthest|farthest)\b/i.test(sentence);
      
      if (hasTheSuper && hasSuperMarker) {
        score = 10;
        feedback = "Chính xác! Câu của bạn đã áp dụng đúng cấu trúc so sánh nhất.";
      } else if (!hasTheSuper && hasSuperMarker) {
        score = 6;
        feedback = "Lưu ý: So sánh nhất bắt buộc phải có mạo từ 'the' đứng trước tính từ so sánh.";
      } else {
        score = 4;
        feedback = "Chưa phát hiện cấu trúc so sánh nhất. Hãy dùng: the + Adj-est hoặc the most/least + Adj.";
      }
      break;

    case "grammar-11": // Bị động Hiện tại
      const hasTobePresP = /\b(am|is|are|been|being)\b/i.test(sentence);
      const hasPastPart = /\w+ed\b/i.test(sentence) || /\b(been|done|seen|built|written|made|approved|released|cleaned|repaired|kept)\b/i.test(sentence);
      
      if (hasTobePresP && hasPastPart) {
        score = 10;
        feedback = "Rất tốt! Câu viết đúng cấu trúc câu bị động ở thì hiện tại.";
      } else {
        score = 4;
        feedback = "Hãy đặt câu bị động với cấu trúc: am/is/are (+ being/been) + V3/ed.";
      }
      break;

    case "grammar-12": // Bị động Quá khứ & Tương lai
      const hasTobePastP = /\b(was|were|be|been|being)\b/i.test(sentence);
      const hasPastPartP = /\w+ed\b/i.test(sentence) || /\b(been|done|seen|built|written|made|approved|demolished|changed|tested)\b/i.test(sentence);
      
      if (hasTobePastP && hasPastPartP) {
        score = 10;
        feedback = "Chính xác! Bạn đã viết đúng cấu trúc câu bị động ở thì quá khứ hoặc tương lai.";
      } else {
        score = 4;
        feedback = "Hãy đặt câu bị động quá khứ/tương lai sử dụng: was/were + V3/ed hoặc will be + V3/ed.";
      }
      break;

    case "grammar-13": // Mệnh đề quan hệ
      const hasRelative = /\b(who|whom|which|that|whose|where|when|why)\b/i.test(sentence);
      if (hasRelative) {
        score = 10;
        feedback = "Xuất sắc! Bạn đã sử dụng đúng đại từ hoặc trạng từ quan hệ để liên kết mệnh đề phụ.";
      } else {
        score = 4;
        feedback = "Hãy dùng một đại từ quan hệ (who, whom, which, that, whose) hoặc trạng từ quan hệ (where, when, why) để bổ nghĩa cho danh từ.";
      }
      break;

    default:
      score = 10;
      feedback = "Hệ thống đã ghi nhận câu viết của bạn. Hãy cố gắng luyện tập viết câu thật nhiều nhé!";
  }

  return { score, feedback };
}

// Thực hiện chấm điểm câu tự viết trong Ngữ pháp
function handleGradeGrammarSentence() {
  const activeLessonId = document.querySelector(".grammar-nav-item.active")?.getAttribute("data-id");
  if (!activeLessonId) return;

  const inputEl = document.getElementById("g-write-input");
  const sentence = inputEl.value.trim();

  if (!sentence) {
    showToast("Vui lòng gõ một câu tiếng Anh để hệ thống chấm điểm!", "warning");
    return;
  }

  const result = gradeGrammarSentence(activeLessonId, sentence);

  // Hiển thị kết quả
  const resultBox = document.getElementById("g-write-result-box");
  const scoreVal = document.getElementById("g-write-score-val");
  const scoreCircle = document.getElementById("g-write-score-circle");
  const resTitle = document.getElementById("g-write-result-title");
  const resDesc = document.getElementById("g-write-result-desc");

  scoreVal.textContent = result.score;
  resDesc.textContent = result.feedback;

  // Đổi màu viền dựa theo số điểm đạt được
  if (result.score >= 8) {
    scoreCircle.style.borderColor = "var(--color-success)";
    resTitle.textContent = "Kết quả: Xuất Sắc! 🎉";
    resTitle.style.color = "var(--color-success)";
    showToast("Chúc mừng! Bạn đạt điểm rất cao.", "success");
  } else if (result.score >= 5) {
    scoreCircle.style.borderColor = "var(--color-warning)";
    resTitle.textContent = "Kết quả: Cần hoàn thiện! 💡";
    resTitle.style.color = "var(--color-warning)";
    showToast("Bạn viết gần đúng rồi, xem lại nhận xét nhé.", "warning");
  } else {
    scoreCircle.style.borderColor = "var(--color-danger)";
    resTitle.textContent = "Kết quả: Chưa chính xác! ❌";
    resTitle.style.color = "var(--color-danger)";
    showToast("Hãy xem lại cấu trúc ngữ pháp và thử lại.", "danger");
  }

  resultBox.style.display = "flex";
}

// Khởi chạy Bài test trắc nghiệm 10 câu (Grammar MCQ Quiz)
function startGrammarMCQQuiz() {
  const activeLessonId = document.querySelector(".grammar-nav-item.active")?.getAttribute("data-id");
  if (!activeLessonId) return;

  const lesson = state.grammar.find(g => g.id === activeLessonId);
  if (!lesson || !lesson.quizQuestions || lesson.quizQuestions.length === 0) {
    showToast("Chủ đề ngữ pháp này chưa hỗ trợ bộ câu hỏi trắc nghiệm mặc định!", "warning");
    return;
  }

  // Khởi tạo trạng thái bài test
  state.grammarQuiz = {
    questions: shuffleArray([...lesson.quizQuestions]), // Trộn ngẫu nhiên 10 câu hỏi
    currentIndex: 0,
    score: 0,
    hasAnswered: false
  };

  // Chuyển đổi màn hình hiển thị trong tab MCQ
  document.getElementById("g-mcq-setup").style.display = "none";
  document.getElementById("g-mcq-play").style.display = "flex";
  document.getElementById("g-mcq-result").style.display = "none";

  renderGrammarQuizQuestion();
}

function renderGrammarQuizQuestion() {
  const gQuiz = state.grammarQuiz;
  gQuiz.hasAnswered = false;

  const qIndex = gQuiz.currentIndex;
  const currentQ = gQuiz.questions[qIndex];

  // Ẩn nút Next và box feedback
  document.getElementById("g-mcq-btn-next").style.display = "none";
  document.getElementById("g-mcq-feedback-box").style.display = "none";

  // Cập nhật text tiến trình
  document.getElementById("g-mcq-progress").textContent = `Câu hỏi ${qIndex + 1}/${gQuiz.questions.length}`;
  document.getElementById("g-mcq-score").textContent = `Điểm: ${gQuiz.score}`;

  // Đổ thanh progress fill
  const percent = ((qIndex) / gQuiz.questions.length) * 100;
  document.getElementById("g-mcq-progress-fill").style.width = `${percent}%`;

  // Hiển thị câu hỏi
  document.getElementById("g-mcq-question-text").textContent = currentQ.question;

  // Tạo các nút A, B, C, D
  const optionsGrid = document.getElementById("g-mcq-options");
  optionsGrid.innerHTML = "";

  currentQ.options.forEach(option => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option-btn";
    btn.innerHTML = `<span>${option}</span> <i class="fa-regular fa-circle"></i>`;
    btn.addEventListener("click", () => handleSelectGrammarOption(btn, option, currentQ));
    optionsGrid.appendChild(btn);
  });
}

function handleSelectGrammarOption(selectedBtn, selectedValue, questionObj) {
  const gQuiz = state.grammarQuiz;
  if (gQuiz.hasAnswered) return;
  gQuiz.hasAnswered = true;

  const isCorrect = selectedValue === questionObj.correct;
  const feedbackBox = document.getElementById("g-mcq-feedback-box");
  const feedbackStatus = document.getElementById("g-mcq-feedback-status");
  const feedbackText = document.getElementById("g-mcq-feedback-text");

  if (isCorrect) {
    gQuiz.score++;
    selectedBtn.className = "quiz-option-btn correct";
    selectedBtn.querySelector("i").className = "fa-solid fa-circle-check";
    feedbackStatus.textContent = "Chính xác! (+1 điểm)";
    feedbackStatus.style.color = "var(--color-success)";
    showToast("Chúc mừng! Câu trả lời chính xác.", "success");
  } else {
    selectedBtn.className = "quiz-option-btn wrong";
    selectedBtn.querySelector("i").className = "fa-solid fa-circle-xmark";
    feedbackStatus.textContent = "Chưa chính xác!";
    feedbackStatus.style.color = "var(--color-danger)";
    
    // Nổi bật đáp án đúng
    document.querySelectorAll("#g-mcq-options .quiz-option-btn").forEach(btn => {
      if (btn.querySelector("span").textContent === questionObj.correct) {
        btn.className = "quiz-option-btn correct";
        btn.querySelector("i").className = "fa-solid fa-circle-check";
      }
    });
    showToast("Tiếc quá! Sai rồi.", "danger");
  }

  feedbackText.textContent = questionObj.explanation;
  feedbackBox.style.display = "block";

  // Vô hiệu hóa click các nút khác
  document.querySelectorAll("#g-mcq-options .quiz-option-btn").forEach(btn => {
    btn.style.pointerEvents = "none";
  });

  // Hiện nút Next
  document.getElementById("g-mcq-btn-next").style.display = "inline-flex";
}

function nextGrammarQuizQuestion() {
  const gQuiz = state.grammarQuiz;
  gQuiz.currentIndex++;

  if (gQuiz.currentIndex >= gQuiz.questions.length) {
    // Kết thúc bài test
    showGrammarQuizResults();
  } else {
    renderGrammarQuizQuestion();
  }
}

function showGrammarQuizResults() {
  document.getElementById("g-mcq-play").style.display = "none";
  document.getElementById("g-mcq-result").style.display = "flex";

  const score = state.grammarQuiz.score;
  const total = state.grammarQuiz.questions.length;
  
  document.getElementById("g-mcq-res-score").textContent = score;

  const resTitle = document.getElementById("g-mcq-res-title");
  const resDesc = document.getElementById("g-mcq-res-desc");
  const resIcon = document.getElementById("g-mcq-res-icon");

  if (score === 10) {
    resTitle.textContent = "Hoàn hảo! Điểm tối đa 10/10!";
    resDesc.textContent = "Bạn đã nắm cực kỳ vững cấu trúc ngữ pháp này. Hãy tiếp tục phát huy và viết thật nhiều câu thực hành nhé!";
    resIcon.className = "fa-solid fa-trophy";
    resIcon.style.color = "var(--color-warning)";
  } else if (score >= 8) {
    resTitle.textContent = "Kết quả xuất sắc!";
    resDesc.textContent = "Bạn đạt điểm số rất cao. Kỹ năng chia động từ của bạn rất tốt!";
    resIcon.className = "fa-solid fa-medal";
    resIcon.style.color = "var(--color-secondary)";
  } else if (score >= 5) {
    resTitle.textContent = "Hoàn thành bài test!";
    resDesc.textContent = "Bạn đã vượt qua bài kiểm tra. Hãy xem lại các câu trả lời sai để củng cố kỹ năng chia động từ nhé.";
    resIcon.className = "fa-solid fa-circle-check";
    resIcon.style.color = "var(--color-primary-light)";
  } else {
    resTitle.textContent = "Hãy ôn tập thêm nhé!";
    resDesc.textContent = "Điểm số của bạn hơi thấp. Đừng nản lòng, hãy đọc kỹ lại lý thuyết và làm lại bài test để tiến bộ hơn.";
    resIcon.className = "fa-solid fa-triangle-exclamation";
    resIcon.style.color = "var(--color-danger)";
  }
}

// --- 10. CHỨC NĂNG LUYỆN ĐẶT CÂU (SENTENCE PRACTICE) ---
function initSentencePractice() {
  const select = document.getElementById("sentence-vocab-select");
  if (!select) return;

  select.innerHTML = `<option value="" disabled selected>-- Chọn một từ trong kho --</option>`;

  // Sắp xếp từ vựng theo bảng chữ cái để dễ chọn
  const sortedVocab = [...state.vocabulary].sort((a, b) => a.word.localeCompare(b.word));
  
  sortedVocab.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.word;
    opt.textContent = `${v.word} (${v.definition})`;
    select.appendChild(opt);
  });

  // Reset các thông báo và form
  document.getElementById("sentence-vocab-guide").textContent = "";
  document.getElementById("sentence-validation-msg").textContent = "";
  document.getElementById("sentence-form").reset();

  renderSentenceTimeline();
}

// Khi người dùng chọn từ để đặt câu
document.getElementById("sentence-vocab-select").addEventListener("change", function() {
  const selectedWord = this.value;
  const vocabObj = state.vocabulary.find(v => v.word === selectedWord);
  const guide = document.getElementById("sentence-vocab-guide");

  if (vocabObj) {
    guide.innerHTML = `
      <i class="fa-solid fa-circle-info" style="color:var(--color-secondary);"></i> 
      <strong>${vocabObj.word}</strong> (${vocabObj.type}): ${vocabObj.definition}
      ${vocabObj.example ? `<br><span style="font-style:italic;">Ví dụ mẫu: ${vocabObj.example}</span>` : ""}
    `;
  } else {
    guide.textContent = "";
  }
});

// Bắt sự kiện gõ phím để check validation real-time (tùy chọn nhưng tăng UX rất lớn)
document.getElementById("sentence-english").addEventListener("input", function() {
  validateSentenceInput();
});

function validateSentenceInput() {
  const selectedWord = document.getElementById("sentence-vocab-select").value;
  const sentence = document.getElementById("sentence-english").value.trim();
  const validationMsg = document.getElementById("sentence-validation-msg");

  if (!selectedWord) {
    validationMsg.textContent = "Vui lòng chọn một từ vựng trước khi viết!";
    validationMsg.style.color = "var(--color-warning)";
    return false;
  }

  if (!sentence) {
    validationMsg.textContent = "";
    return false;
  }

  // Kiểm tra sự xuất hiện của từ được chọn (không phân biệt hoa thường)
  // Tạo biểu thức RegExp khớp với từ gốc hoặc từ gốc có thêm s, es, ed, ing
  const wordClean = selectedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex
  const regex = new RegExp(`\\b${wordClean}(s|es|ed|ing)?\\b`, 'i');
  
  const isValid = regex.test(sentence);

  if (isValid) {
    validationMsg.innerHTML = `<i class="fa-solid fa-circle-check"></i> Câu hợp lệ (Đã tìm thấy từ vựng gốc hoặc biến thể của từ!)`;
    validationMsg.style.color = "var(--color-success)";
    return true;
  } else {
    validationMsg.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Câu của bạn chưa chứa từ vựng đang luyện tập: "${selectedWord}"`;
    validationMsg.style.color = "var(--color-danger)";
    return false;
  }
}

// Xử lý gửi câu tự đặt
document.getElementById("sentence-form").addEventListener("submit", function(e) {
  e.preventDefault();

  const selectedWord = document.getElementById("sentence-vocab-select").value;
  const english = document.getElementById("sentence-english").value.trim();
  const vietnamese = document.getElementById("sentence-vietnamese").value.trim();

  if (!selectedWord) {
    showToast("Vui lòng chọn từ vựng muốn đặt câu!", "warning");
    return;
  }

  // Validate lại câu trước khi lưu
  const isValid = validateSentenceInput();
  if (!isValid) {
    showToast("Câu tiếng Anh của bạn chưa sử dụng đúng từ vựng đã chọn!", "danger");
    return;
  }

  if (!vietnamese) {
    showToast("Vui lòng nhập bản dịch nghĩa tiếng Việt!", "warning");
    return;
  }

  const newSentence = {
    id: `sentence-${Date.now()}`,
    vocabWord: selectedWord,
    english: english,
    vietnamese: vietnamese,
    createdAt: Date.now()
  };

  state.sentences.push(newSentence);
  saveToLocalStorage("sentences");
  showToast("Chúc mừng! Đã lưu câu tự đặt thành công.");

  // Reset form và vẽ lại timeline
  initSentencePractice();
  updateGlobalStats();
});

// Render Timeline câu đã đặt
function renderSentenceTimeline() {
  const container = document.getElementById("sentence-timeline-container");
  if (!container) return;

  container.innerHTML = "";

  // Sắp xếp câu mới nhất lên đầu
  const sortedSentences = [...state.sentences].sort((a, b) => b.createdAt - a.createdAt);

  if (sortedSentences.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 30px 0;">
        <i class="fa-solid fa-pen-nib"></i>
        <h3>Chưa có câu nào được luyện viết</h3>
        <p>Chọn từ vựng bên trái và thử đặt câu tiếng Anh của riêng bạn!</p>
      </div>
    `;
    return;
  }

  sortedSentences.forEach(item => {
    const card = document.createElement("div");
    card.className = "sentence-card";

    const dateObj = new Date(item.createdAt);
    const dateStr = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')} ngày ${dateObj.getDate()}/${dateObj.getMonth() + 1}/${dateObj.getFullYear()}`;

    card.innerHTML = `
      <div class="sentence-card-header">
        <span class="sentence-card-vocab-tag">${item.vocabWord}</span>
        <button class="sentence-card-delete" onclick="deleteSentence('${item.id}')" title="Xóa câu này">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
      <div class="sentence-eng">${item.english}</div>
      <div class="sentence-vi">${item.vietnamese}</div>
      <div class="sentence-date"><i class="fa-regular fa-clock"></i> ${dateStr}</div>
    `;

    container.appendChild(card);
  });
}

// Xóa câu tự đặt
window.deleteSentence = function(id) {
  if (confirm("Bạn có chắc muốn xóa câu luyện tập này?")) {
    state.sentences = state.sentences.filter(s => s.id !== id);
    saveToLocalStorage("sentences");
    renderSentenceTimeline();
    updateGlobalStats();
    showToast("Đã xóa câu thành công", "danger");
  }
};

// --- 11. ĐĂNG KÝ CÁC SỰ KIỆN TƯƠNG TÁC CHUNG (EVENT LISTENERS) ---
function registerEventListeners() {
  // Sidebar Navigation Click
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", function() {
      const tab = this.getAttribute("data-tab");
      navigateToTab(tab);
    });
  });

  // Nút chuyển theme Sáng / Tối
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const newTheme = currentTheme === "dark" ? "light" : "dark";
      
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("vocabmaster_theme", newTheme);
      updateThemeUI(newTheme);
      showToast(`Đã chuyển sang giao diện ${newTheme === 'dark' ? 'tối' : 'sáng'}`);
    });
  }

  // Đăng ký các liên kết / nút tắt chuyển tab nhanh trên Dashboard
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", function(e) {
      e.preventDefault();
      const action = this.getAttribute("data-action");

      if (action === "go-vocab-add") {
        navigateToTab("vocabulary");
        // Cuộn lên form thêm từ
        setTimeout(() => {
          document.getElementById("vocab-word").focus();
        }, 100);
      } else if (action === "go-vocab-list") {
        navigateToTab("vocabulary");
        // Cuộn lên danh sách từ
        setTimeout(() => {
          document.getElementById("vocab-cards-container").scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else if (action === "go-flash") {
        navigateToTab("flashcards");
      } else if (action === "go-quiz") {
        navigateToTab("quiz");
      } else if (action === "go-sentence") {
        navigateToTab("sentences");
      }
    });
  });

  // Hủy sửa từ vựng
  const cancelEditBtn = document.getElementById("vocab-btn-cancel");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      resetVocabForm();
      showToast("Đã hủy chế độ sửa", "warning");
    });
  }

  // Sự kiện tìm kiếm & lọc trên danh sách từ vựng
  const vocabTopicFilter = document.getElementById("vocab-filter-topic");
  if (vocabTopicFilter) {
    vocabTopicFilter.addEventListener("change", (e) => {
      selectTopicFilter(e.target.value);
    });
  }
  document.getElementById("vocab-search").addEventListener("input", () => {
    state.vocabPagination.currentPage = 1;
    renderVocabularyList();
  });
  document.getElementById("vocab-filter-type").addEventListener("change", () => {
    state.vocabPagination.currentPage = 1;
    renderVocabularyList();
  });
  document.getElementById("vocab-filter-status").addEventListener("change", () => {
    state.vocabPagination.currentPage = 1;
    renderVocabularyList();
  });

  // Sự kiện tìm kiếm & lọc trên Bảng tổng hợp tất cả từ vựng
  const allTopicFilter = document.getElementById("all-vocab-filter-topic");
  if (allTopicFilter) {
    allTopicFilter.addEventListener("change", (e) => {
      selectTopicFilter(e.target.value);
    });
  }
  const allSearch = document.getElementById("all-vocab-search");
  if (allSearch) {
    allSearch.addEventListener("input", () => {
      state.allVocabState.currentPage = 1;
      renderAllVocabTable();
    });
  }
  const allTypeFilter = document.getElementById("all-vocab-filter-type");
  if (allTypeFilter) {
    allTypeFilter.addEventListener("change", () => {
      state.allVocabState.currentPage = 1;
      renderAllVocabTable();
    });
  }
  const allStatusFilter = document.getElementById("all-vocab-filter-status");
  if (allStatusFilter) {
    allStatusFilter.addEventListener("change", () => {
      state.allVocabState.currentPage = 1;
      renderAllVocabTable();
    });
  }
  const allPerPage = document.getElementById("all-vocab-per-page");
  if (allPerPage) {
    allPerPage.addEventListener("change", () => {
      state.allVocabState.currentPage = 1;
      renderAllVocabTable();
    });
  }

  // Sự kiện lọc chủ đề cho Flashcards & Quiz
  const flashTopicFilter = document.getElementById("flash-filter-topic");
  if (flashTopicFilter) {
    flashTopicFilter.addEventListener("change", () => {
      initFlashcards();
    });
  }

  const quizTopicFilter = document.getElementById("quiz-filter-topic");
  if (quizTopicFilter) {
    quizTopicFilter.addEventListener("change", () => {
      initQuizSetup();
    });
  }
  const allExportBtn = document.getElementById("all-vocab-btn-export");
  if (allExportBtn) {
    allExportBtn.addEventListener("click", exportAllVocabToCSV);
  }
  const allCopyBtn = document.getElementById("all-vocab-btn-copy");
  if (allCopyBtn) {
    allCopyBtn.addEventListener("click", copyAllVocabTable);
  }

  // Sự kiện chọn giới hạn số từ Flashcards & Tải lượt mới
  const flashLimitSelect = document.getElementById("flash-filter-limit");
  if (flashLimitSelect) {
    flashLimitSelect.addEventListener("change", initFlashcards);
  }
  const flashRestartBtn = document.getElementById("flash-btn-restart-session");
  if (flashRestartBtn) {
    flashRestartBtn.addEventListener("click", () => {
      initFlashcards();
      showToast("Đã tải lượt học Flashcard mới!", "info");
    });
  }

  // Sự kiện click Flashcard lật
  const cardBox = document.getElementById("flashcard-box");
  if (cardBox) {
    cardBox.addEventListener("click", () => {
      state.flashcards.isFlipped = !state.flashcards.isFlipped;
      cardBox.classList.toggle("flipped", state.flashcards.isFlipped);
    });
  }

  // Sự kiện nút Flashcard
  document.getElementById("flash-btn-again").addEventListener("click", (e) => {
    e.stopPropagation(); // ngăn lật thẻ
    nextFlashcard(false);
  });

  document.getElementById("flash-btn-know").addEventListener("click", (e) => {
    e.stopPropagation(); // ngăn lật thẻ
    nextFlashcard(true);
  });

  document.getElementById("flash-btn-speak").addEventListener("click", (e) => {
    e.stopPropagation(); // ngăn lật thẻ
    const list = state.flashcards.list;
    const index = state.flashcards.currentIndex;
    if (list.length > 0) {
      speakWord(list[index].word);
    }
  });

  // Sự kiện bắt đầu Quiz
  document.getElementById("quiz-mode-mcq").addEventListener("click", () => startQuiz("mcq"));
  document.getElementById("quiz-mode-fitb").addEventListener("click", () => startQuiz("fitb"));

  // Sự kiện gửi đáp án FITB Quiz
  document.getElementById("quiz-btn-submit-answer").addEventListener("click", submitFITBAnswer);
  // Bấm Enter ở ô input điền từ
  document.getElementById("quiz-input-answer").addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      if (state.quiz.hasAnswered) {
        nextQuizQuestion();
      } else {
        submitFITBAnswer();
      }
    }
  });

  // Nút Quiz kế tiếp
  document.getElementById("quiz-btn-next").addEventListener("click", nextQuizQuestion);

  // Nút restart quiz hoặc exit
  document.getElementById("quiz-btn-restart").addEventListener("click", initQuizSetup);
  document.getElementById("quiz-btn-exit").addEventListener("click", () => navigateToTab("dashboard"));

  // --- SỰ KIỆN LUYỆN TẬP NGỮ PHÁP TƯƠNG TÁC ---
  const tabWrite = document.getElementById("g-btn-tab-write");
  const tabMcq = document.getElementById("g-btn-tab-mcq");
  
  if (tabWrite) tabWrite.addEventListener("click", () => switchGrammarPracticeTab("write"));
  if (tabMcq) tabMcq.addEventListener("click", () => switchGrammarPracticeTab("mcq"));

  // Sự kiện nút chấm điểm câu tự viết
  const gradeBtn = document.getElementById("g-write-btn-grade");
  if (gradeBtn) gradeBtn.addEventListener("click", handleGradeGrammarSentence);

  // Sự kiện nút bắt đầu làm trắc nghiệm ngữ pháp
  const startGrammarMcqBtn = document.getElementById("g-mcq-btn-start");
  if (startGrammarMcqBtn) startGrammarMcqBtn.addEventListener("click", startGrammarMCQQuiz);

  // Sự kiện nút câu tiếp theo trong Grammar MCQ
  const nextGrammarMcqBtn = document.getElementById("g-mcq-btn-next");
  if (nextGrammarMcqBtn) nextGrammarMcqBtn.addEventListener("click", nextGrammarQuizQuestion);

  // Sự kiện làm lại Grammar MCQ
  const restartGrammarMcqBtn = document.getElementById("g-mcq-btn-restart");
  if (restartGrammarMcqBtn) restartGrammarMcqBtn.addEventListener("click", startGrammarMCQQuiz);

  // Sự kiện hoàn tất Grammar MCQ
  const finishGrammarMcqBtn = document.getElementById("g-mcq-btn-finish");
  if (finishGrammarMcqBtn) {
    finishGrammarMcqBtn.addEventListener("click", () => {
      document.getElementById("g-mcq-setup").style.display = "flex";
      document.getElementById("g-mcq-play").style.display = "none";
      document.getElementById("g-mcq-result").style.display = "none";
    });
  }

  // --- SỰ KIỆN ĐẤU HẠNG NGỮ PHÁP (RANK MATCH) ---
  const rankStartBtn = document.getElementById("rank-btn-start");
  if (rankStartBtn) rankStartBtn.addEventListener("click", startRankMatch);

  const rankNextBtn = document.getElementById("rank-play-btn-next");
  if (rankNextBtn) rankNextBtn.addEventListener("click", nextRankQuestion);

  // Nút hành động chính ở màn hình kết quả rank (Có thể là "Leo rank tiếp" hoặc "Thử lại")
  const rankResActionBtn = document.getElementById("rank-res-btn-action");
  if (rankResActionBtn) {
    rankResActionBtn.addEventListener("click", () => {
      const cfg = RANK_CONFIG[state.userRank];
      const resultTitle = document.getElementById("rank-res-title").textContent;
      
      if (resultTitle.includes("THÀNH CÔNG")) {
        // Đỗ => Trở về màn hình Rank Dashboard để xem rank mới
        document.getElementById("rank-dashboard-screen").style.display = "flex";
        document.getElementById("rank-play-screen").style.display = "none";
        document.getElementById("rank-result-screen").style.display = "none";
        initRankTab();
      } else {
        // Trượt => Thử lại trực tiếp
        startRankMatch();
      }
    });
  }

  const rankResExitBtn = document.getElementById("rank-res-btn-exit");
  if (rankResExitBtn) {
    rankResExitBtn.addEventListener("click", () => {
      document.getElementById("rank-dashboard-screen").style.display = "flex";
      document.getElementById("rank-play-screen").style.display = "none";
      document.getElementById("rank-result-screen").style.display = "none";
      initRankTab();
    });
  }
}

// Cập nhật Icon & text hiển thị của Theme
function updateThemeUI(theme) {
  const icon = document.getElementById("theme-icon");
  const text = document.getElementById("theme-text");

  if (!icon || !text) return;

  if (theme === "light") {
    icon.className = "fa-solid fa-sun";
    text.textContent = "Chế độ sáng";
  } else {
    icon.className = "fa-solid fa-moon";
    text.textContent = "Chế độ tối";
  }
}

// --- 9.2 CHỨC NĂNG ĐẤU HẠNG NGỮ PHÁP (RANK MATCH) ---

// Cấu hình các cấp bậc Rank trong game
const RANK_CONFIG = {
  bronze: { name: "Đồng (Bronze)", icon: "fa-medal", color: "#cd7f32", qCount: 5, minCorrect: 4, next: "silver" },
  silver: { name: "Bạc (Silver)", icon: "fa-medal", color: "#c0c0c0", qCount: 5, minCorrect: 4, next: "gold" },
  gold: { name: "Vàng (Gold)", icon: "fa-medal", color: "#ffd700", qCount: 8, minCorrect: 6, next: "platinum" },
  platinum: { name: "Bạch kim (Platinum)", icon: "fa-gem", color: "#76e3cc", qCount: 8, minCorrect: 6, next: "diamond" },
  diamond: { name: "Kim cương (Diamond)", icon: "fa-gem", color: "#00f2fe", qCount: 10, minCorrect: 8, next: "master" },
  master: { name: "Cao thủ (Master)", icon: "fa-crown", color: "#d81b60", qCount: 10, minCorrect: 8, next: "challenger" },
  challenger: { name: "Thách đấu (Challenger)", icon: "fa-trophy", color: "#ff1744", qCount: 10, minCorrect: 9, next: null }
};

// Thứ tự xếp hạng để vẽ bản đồ
const RANK_ORDER = ["bronze", "silver", "gold", "platinum", "diamond", "master", "challenger"];

// Khởi chạy tab Đấu hạng xếp hạng
function initRankTab() {
  const currentRankKey = state.userRank;
  const cfg = RANK_CONFIG[currentRankKey];

  if (!cfg) return;

  // Cập nhật màn hình Tổng quan Rank
  const badgeDisplay = document.getElementById("rank-badge-display");
  const nameDisplay = document.getElementById("rank-name-display");

  badgeDisplay.style.background = `radial-gradient(circle, ${cfg.color}33 0%, ${cfg.color}11 100%)`;
  badgeDisplay.style.border = `4px solid ${cfg.color}`;
  badgeDisplay.style.color = cfg.color;
  badgeDisplay.style.boxShadow = `0 0 20px ${cfg.color}33`;
  badgeDisplay.innerHTML = `<i class="fa-solid ${cfg.icon}"></i>`;

  nameDisplay.textContent = cfg.name;
  nameDisplay.style.color = cfg.color;

  // Đổi chữ nút đấu hạng
  const startBtn = document.getElementById("rank-btn-start");
  if (currentRankKey === "challenger") {
    startBtn.innerHTML = `<i class="fa-solid fa-trophy"></i> Thử thách Thách Đấu`;
  } else {
    startBtn.innerHTML = `<i class="fa-solid fa-circle-play"></i> Bắt đầu Đấu Hạng (Rank Match)`;
  }

  // Vẽ Bản đồ Cấp bậc (Rank Map)
  const mapContainer = document.getElementById("rank-map-container");
  if (!mapContainer) return;

  mapContainer.innerHTML = "";

  // Lấy chỉ số rank hiện tại của người học
  const currentIdx = RANK_ORDER.indexOf(currentRankKey);

  RANK_ORDER.forEach((rankKey, idx) => {
    const rankCfg = RANK_CONFIG[rankKey];
    const isUnlocked = idx <= currentIdx; // Rank nhỏ hơn hoặc bằng hạng hiện tại thì mở khóa
    const isActive = idx === currentIdx;

    const rankNode = document.createElement("div");
    rankNode.style.display = "flex";
    rankNode.style.flexDirection = "column";
    rankNode.style.alignItems = "center";
    rankNode.style.gap = "8px";
    rankNode.style.opacity = isUnlocked ? "1" : "0.3";
    rankNode.style.flex = "1";
    rankNode.style.minWidth = "80px";
    rankNode.style.padding = "10px";
    rankNode.style.borderRadius = "var(--border-radius-sm)";
    rankNode.style.border = isActive ? `1px dashed ${rankCfg.color}` : "1px solid transparent";
    if (isActive) {
      rankNode.style.background = "rgba(255, 255, 255, 0.02)";
    }

    rankNode.innerHTML = `
      <div style="width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 2px solid ${isUnlocked ? rankCfg.color : 'var(--text-muted)'}; color: ${isUnlocked ? rankCfg.color : 'var(--text-muted)'}; background: rgba(0,0,0,0.1);">
        <i class="fa-solid ${isUnlocked ? rankCfg.icon : 'fa-lock'}"></i>
      </div>
      <div style="font-size: 11px; font-weight: 600; text-align: center; color: ${isUnlocked ? 'var(--text-main)' : 'var(--text-muted)'};">
        ${rankCfg.name.split(" ")[0]}
      </div>
    `;

    mapContainer.appendChild(rankNode);
  });

  // Reset các màn hình khác
  document.getElementById("rank-dashboard-screen").style.display = "flex";
  document.getElementById("rank-play-screen").style.display = "none";
  document.getElementById("rank-result-screen").style.display = "none";
}

// Bắt đầu Trận đấu hạng
function startRankMatch() {
  const currentRankKey = state.userRank;
  const cfg = RANK_CONFIG[currentRankKey];
  const qBank = RANK_QUESTIONS[currentRankKey];

  if (!cfg || !qBank || qBank.length === 0) {
    showToast("Ngân hàng câu hỏi cho Rank này đang được cập nhật!", "warning");
    return;
  }

  // Khởi tạo trận đấu
  // Lấy ngẫu nhiên và giới hạn số câu hỏi theo cấu hình của Rank
  state.rankMatch = {
    questions: shuffleArray([...qBank]).slice(0, cfg.qCount),
    currentIndex: 0,
    score: 0,
    hasAnswered: false
  };

  // Chuyển màn hình
  document.getElementById("rank-dashboard-screen").style.display = "none";
  document.getElementById("rank-play-screen").style.display = "flex";
  document.getElementById("rank-result-screen").style.display = "none";

  renderRankQuestion();
}

function renderRankQuestion() {
  const match = state.rankMatch;
  match.hasAnswered = false;

  const idx = match.currentIndex;
  const currentQ = match.questions[idx];
  const currentRankKey = state.userRank;
  const cfg = RANK_CONFIG[currentRankKey];

  // Ẩn nút tiếp tục và box giải thích
  document.getElementById("rank-play-btn-next").style.display = "none";
  const feedbackBox = document.getElementById("rank-play-feedback");
  feedbackBox.style.display = "none";
  feedbackBox.className = "rank-feedback-box"; // reset class
  // Reset đáp án đúng note
  const correctNote = document.getElementById("rank-correct-answer-note");
  if (correctNote) correctNote.style.display = "none";

  // Cập nhật thông tin tiến trình
  document.getElementById("rank-play-progress").textContent = `Câu hỏi ${idx + 1}/${match.questions.length}`;
  document.getElementById("rank-play-score-live").textContent = `Số câu đúng: ${match.score} (Yêu cầu đạt: ${cfg.minCorrect})`;
  document.getElementById("rank-play-level-tag").textContent = `Bậc rank: ${cfg.name}`;
  document.getElementById("rank-play-level-tag").style.color = cfg.color;

  // Đổ thanh tiến trình
  const percent = ((idx) / match.questions.length) * 100;
  document.getElementById("rank-play-progress-fill").style.width = `${percent}%`;

  // Hiển thị câu hỏi
  document.getElementById("rank-play-question-text").textContent = currentQ.question;

  // Tạo các nút đáp án A, B, C, D
  const optionsContainer = document.getElementById("rank-play-options");
  optionsContainer.innerHTML = "";

  const letters = ["A", "B", "C", "D"];
  currentQ.options.forEach((option, optIdx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-option-btn";
    btn.innerHTML = `
      <span style="display:flex; align-items:center; gap:10px;">
        <span class="answer-letter-badge">${letters[optIdx] || (optIdx + 1)}</span>
        <span>${option}</span>
      </span>
      <i class="fa-regular fa-circle" style="flex-shrink:0;"></i>`;
    btn.addEventListener("click", () => handleSelectRankOption(btn, option, currentQ));
    optionsContainer.appendChild(btn);
  });
}

function handleSelectRankOption(selectedBtn, selectedValue, questionObj) {
  const match = state.rankMatch;
  if (match.hasAnswered) return;
  match.hasAnswered = true;

  const isCorrect = selectedValue === questionObj.correct;
  const feedbackBox = document.getElementById("rank-play-feedback");
  const statusEl = document.getElementById("rank-play-feedback-status");
  const subtitleEl = document.getElementById("rank-feedback-subtitle");
  const textEl = document.getElementById("rank-play-feedback-text");
  const iconEl = document.getElementById("rank-feedback-icon");
  const correctNoteEl = document.getElementById("rank-correct-answer-note");
  const correctAnswerTextEl = document.getElementById("rank-correct-answer-text");

  if (isCorrect) {
    match.score++;
    selectedBtn.className = "quiz-option-btn correct";
    selectedBtn.querySelector("i.fa-regular").className = "fa-solid fa-circle-check";
    
    // Update feedback box - correct state
    feedbackBox.className = "rank-feedback-box correct-feedback";
    iconEl.className = "fa-solid fa-circle-check";
    statusEl.textContent = "Chính xác! ✔";
    subtitleEl.textContent = `+1 câu đúng • Đang đúng: ${match.score} câu`;
    correctNoteEl.style.display = "none";
    showToast("Chúc mừng! Đáp án đúng.", "success");
  } else {
    selectedBtn.className = "quiz-option-btn wrong";
    selectedBtn.querySelector("i.fa-regular").className = "fa-solid fa-circle-xmark";

    // Update feedback box - wrong state
    feedbackBox.className = "rank-feedback-box wrong-feedback";
    iconEl.className = "fa-solid fa-circle-xmark";
    statusEl.textContent = "Chưa chính xác! ✘";
    subtitleEl.textContent = `Hãy xem giải thích phía dưới`;
    
    // Hiện đáp án đúng
    correctAnswerTextEl.textContent = questionObj.correct;
    correctNoteEl.style.display = "flex";

    // Nổi bật đáp án đúng trong danh sách
    document.querySelectorAll("#rank-play-options .quiz-option-btn").forEach(btn => {
      const spanTexts = btn.querySelectorAll("span");
      const optionText = spanTexts[spanTexts.length - 1]?.textContent;
      if (optionText === questionObj.correct) {
        btn.className = "quiz-option-btn correct";
        btn.querySelector("i.fa-solid, i.fa-regular").className = "fa-solid fa-circle-check";
      }
    });
    showToast("Sai mất rồi. Xem giải thích nhé!", "danger");
  }

  textEl.textContent = questionObj.explanation;
  feedbackBox.style.display = "block";

  // Vô hiệu hóa click các nút khác
  document.querySelectorAll("#rank-play-options .quiz-option-btn").forEach(btn => {
    btn.style.pointerEvents = "none";
  });

  // Hiện nút Tiếp tục
  document.getElementById("rank-play-btn-next").style.display = "inline-flex";
}

function nextRankQuestion() {
  const match = state.rankMatch;
  match.currentIndex++;

  if (match.currentIndex >= match.questions.length) {
    // Kết thúc trận đấu rank
    showRankMatchResults();
  } else {
    renderRankQuestion();
  }
}

function showRankMatchResults() {
  document.getElementById("rank-play-screen").style.display = "none";
  document.getElementById("rank-result-screen").style.display = "flex";

  const match = state.rankMatch;
  const score = match.score;
  const total = match.questions.length;
  
  const currentRankKey = state.userRank;
  const cfg = RANK_CONFIG[currentRankKey];
  
  const isPassed = score >= cfg.minCorrect;

  const resIcon = document.getElementById("rank-res-icon");
  const resTitle = document.getElementById("rank-res-title");
  const resDesc = document.getElementById("rank-res-desc");
  const scoreDetail = document.getElementById("rank-res-score-detail");
  const actionBtn = document.getElementById("rank-res-btn-action");

  scoreDetail.textContent = `Đúng: ${score} / ${total} câu hỏi (Yêu cầu vượt qua: ${cfg.minCorrect} câu)`;

  const badgeOld = document.getElementById("rank-res-badge-old");
  const badgeNew = document.getElementById("rank-res-badge-new");

  // Thiết lập huy hiệu cũ hiển thị
  badgeOld.style.color = cfg.color;
  badgeOld.style.border = `2px solid ${cfg.color}`;
  badgeOld.innerHTML = `<i class="fa-solid ${cfg.icon}"></i>`;

  if (isPassed) {
    // LÊN HẠNG THÀNH CÔNG!
    resIcon.className = "fa-solid fa-circle-up";
    resIcon.style.color = "var(--color-success)";
    resIcon.style.animation = "pulse 1.5s infinite";

    const nextRankKey = cfg.next;
    
    if (nextRankKey) {
      // Có rank tiếp theo để lên
      const nextCfg = RANK_CONFIG[nextRankKey];
      
      resTitle.textContent = "THĂNG HẠNG THÀNH CÔNG! 🎉";
      resDesc.textContent = `Tuyệt vời! Bạn đã vượt qua các câu hỏi thử thách của bậc ${cfg.name.split(" ")[0]} và thăng hạng lên ${nextCfg.name.split(" ")[0]}!`;

      // Hiển thị huy hiệu mới
      badgeNew.style.color = nextCfg.color;
      badgeNew.style.border = `3px solid ${nextCfg.color}`;
      badgeNew.style.boxShadow = `0 0 15px ${nextCfg.color}44`;
      badgeNew.style.background = `radial-gradient(circle, ${nextCfg.color}22 0%, transparent 100%)`;
      badgeNew.innerHTML = `<i class="fa-solid ${nextCfg.icon}"></i>`;
      badgeNew.parentElement.style.display = "flex"; // hiện khu vực so sánh huy hiệu

      // Cập nhật và lưu rank mới
      state.userRank = nextRankKey;
      localStorage.setItem("vocabmaster_user_rank", nextRankKey);
      
      actionBtn.textContent = "Tiếp tục leo rank";
      actionBtn.className = "btn btn-primary";
    } else {
      // Đã đạt rank cao nhất (Thách đấu) và chiến thắng thử thách
      resTitle.textContent = "BẢO VỆ HẠNG THÀNH CÔNG! 🏆";
      resDesc.textContent = "Bái phục! Bạn đã bảo vệ thành công danh hiệu Thách Đấu (Challenger) tối cao của đấu trường ngữ pháp VocabMaster!";
      
      badgeNew.parentElement.style.display = "none"; // Ẩn so sánh huy hiệu vì đã max rank
      
      actionBtn.textContent = "Thử thách lại";
      actionBtn.className = "btn btn-primary";
    }
    showToast("Chúc mừng! Bạn đã thăng hạng thành công.", "success");
  } else {
    // THẤT BẠI - GIỮ NGUYÊN HẠNG
    resIcon.className = "fa-solid fa-circle-down";
    resIcon.style.color = "var(--color-danger)";
    resIcon.style.animation = "none";

    resTitle.textContent = "GIỮ NGUYÊN HẠNG!";
    resDesc.textContent = `Tiếc quá! Bạn chưa trả lời đúng tối thiểu ${cfg.minCorrect}/${total} câu hỏi để thăng hạng. Hãy luyện tập lý thuyết thêm và thử thách lại bậc ${cfg.name.split(" ")[0]} nhé!`;

    // Ẩn so sánh huy hiệu
    badgeNew.parentElement.style.display = "none";

    actionBtn.textContent = "Thử thách lại";
    actionBtn.className = "btn btn-danger"; // nút đỏ báo động thử lại
    showToast("Chưa đạt yêu cầu lên hạng. Hãy thử lại!", "danger");
  }
}

// --- HÀM TRỢ GIÚP (HELPER FUNCTIONS) ---
// Thuật toán trộn mảng ngẫu nhiên Fisher-Yates Shuffle
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// KHỞI CHẠY KHI TẢI TRANG
window.addEventListener("DOMContentLoaded", initApp);

// ============================================================
// --- READING MODULE (Đọc hiểu + Công cụ dịch) ---
// ============================================================

// Dữ liệu bài đọc mặc định
const DEFAULT_ARTICLES = [
  {
    id: "art-001",
    title: "The Importance of Learning English",
    level: "beginner",
    wordCount: 120,
    content: `English is the most widely spoken language in the world. Today, more than 1.5 billion people speak English as their first or second language. Learning English opens many doors in life. It helps you get better jobs, travel easily, and make friends from different countries.

Many companies require their employees to speak English. If you know English, you can read books, watch movies, and understand the internet more easily. English is also the language of science and technology.

Learning a new language is not easy, but it is very rewarding. Start with simple words and phrases. Practice every day, even for just 15 minutes. Listen to English songs and watch English videos. Do not be afraid to make mistakes. Every mistake helps you learn faster.

Remember, the most important thing is to keep trying. With patience and practice, you will become fluent in English.`
  },
  {
    id: "art-002",
    title: "Healthy Eating Habits",
    level: "beginner",
    wordCount: 130,
    content: `Eating healthy food is very important for our body and mind. A balanced diet gives us the energy we need to work, study, and play. It also helps us stay away from diseases and feel happy every day.

Fruits and vegetables are excellent sources of vitamins and minerals. Doctors recommend eating at least five portions of fruits and vegetables each day. Whole grains, such as brown rice and oats, provide fiber and keep us full longer.

Protein is also essential for our body. Chicken, fish, eggs, and beans are great sources of protein. They help build and repair muscles and tissues in the body.

Try to avoid too much sugar, salt, and fried food. Drink plenty of water every day, at least eight glasses. Water keeps our skin healthy and helps our organs work properly.

Making small changes to your diet can have a big impact on your health. Start today and feel the difference!`
  },
  {
    id: "art-003",
    title: "The Power of Technology in Modern Life",
    level: "intermediate",
    wordCount: 160,
    content: `Technology has fundamentally transformed the way we live, work, and communicate in the twenty-first century. From smartphones to artificial intelligence, technological advancements have created unprecedented opportunities while also presenting new challenges for society.

The internet has connected billions of people across the globe, enabling instant communication and access to virtually unlimited information. Social media platforms allow individuals to share experiences, build communities, and even launch businesses with minimal investment.

In the workplace, automation and digital tools have dramatically increased productivity. Remote work, once considered a privilege, became a necessity during the global pandemic and has since reshaped corporate culture permanently. Employees now collaborate across continents using video conferencing and cloud-based applications.

However, technology also brings significant concerns. Privacy violations, cybercrime, and the spread of misinformation are growing threats. Furthermore, excessive screen time and social media addiction are affecting mental health, particularly among younger generations.

Ultimately, technology is a powerful tool that requires responsible usage. By embracing its benefits while remaining vigilant about its risks, we can harness technology to build a more equitable and prosperous future for all.`
  },
  {
    id: "art-004",
    title: "Climate Change and Its Consequences",
    level: "intermediate",
    wordCount: 155,
    content: `Climate change represents one of the most urgent and complex challenges facing humanity today. Rising global temperatures, driven primarily by the emission of greenhouse gases from human activities, are causing profound disruptions to ecosystems, weather patterns, and human societies worldwide.

The scientific consensus is clear: the burning of fossil fuels, deforestation, and industrial agriculture are the primary contributors to rising levels of carbon dioxide and methane in the atmosphere. These gases trap heat from the sun, creating a "greenhouse effect" that gradually warms the planet.

The consequences of climate change are already visible. Glaciers are melting at an alarming rate, raising sea levels and threatening coastal communities. Extreme weather events — including hurricanes, droughts, wildfires, and floods — have become more frequent and severe. Biodiversity loss is accelerating as species struggle to adapt to rapidly changing habitats.

Addressing climate change requires coordinated global action. Transitioning to renewable energy sources, improving energy efficiency, and adopting sustainable agricultural practices are essential steps. Additionally, individuals can contribute by reducing their carbon footprint through conscious consumption choices.

The time for decisive action is now. Future generations depend on the choices we make today.`
  },
  {
    id: "art-005",
    title: "Artificial Intelligence: Promise and Peril",
    level: "advanced",
    wordCount: 175,
    content: `Artificial intelligence (AI) stands at the frontier of technological innovation, promising to revolutionize virtually every domain of human activity — from healthcare and education to finance and creative expression. Yet this transformative potential is accompanied by profound ethical, social, and philosophical questions that demand careful consideration.

At its core, AI refers to the simulation of human intelligence in machines programmed to think, learn, and problem-solve. Machine learning algorithms enable systems to improve their performance autonomously by analyzing vast datasets, while deep neural networks can recognize patterns with superhuman accuracy in tasks such as image recognition and natural language processing.

The medical field offers compelling examples of AI's promise. Diagnostic algorithms can detect cancers from medical imaging with greater precision than experienced radiologists. Drug discovery pipelines are being accelerated dramatically, potentially compressing decades of research into mere years. Personalized medicine, tailored to an individual's genetic profile, is becoming increasingly viable.

However, the proliferation of AI also raises critical concerns. Algorithmic bias — the perpetuation of discriminatory patterns present in training data — poses significant risks to fairness and equity. Autonomous weapons systems present terrifying prospects for warfare without human judgment. Perhaps most fundamentally, the trajectory toward artificial general intelligence raises existential questions about the relationship between humans and the machines they create.

Navigating the AI revolution responsibly requires robust governance frameworks, interdisciplinary collaboration, and an unwavering commitment to ensuring that these powerful technologies serve human flourishing rather than undermine it.`
  },
  {
    id: "art-006",
    title: "The Benefits of Reading Books",
    level: "beginner",
    wordCount: 110,
    content: `Reading books is one of the best habits you can develop. Books are a wonderful source of knowledge and entertainment. Whether you read fiction or non-fiction, every book teaches you something new.

When you read regularly, your vocabulary grows. You learn new words and how to use them correctly in sentences. Reading also improves your spelling and grammar skills without you even noticing.

Books help you think more clearly and creatively. They expand your imagination and allow you to experience different lives, cultures, and perspectives. Reading before bed can also help you relax and sleep better.

Good books build empathy. When you read about characters facing challenges, you learn to understand other people's feelings and situations. This makes you a kinder, more thoughtful person.

Make reading a daily habit. Even just twenty minutes a day can make a big difference in your life.`
  },
  {
    id: "art-007",
    title: "Urbanization and Its Impact on Society",
    level: "intermediate",
    wordCount: 145,
    content: `The rapid shift of populations from rural areas to cities — a process known as urbanization — is one of the defining trends of the modern era. By 2050, approximately two-thirds of the world's population is projected to live in urban areas, fundamentally reshaping economies, cultures, and environments.

Cities are engines of economic growth. They concentrate talent, infrastructure, and innovation, creating opportunities for entrepreneurship and career advancement that are often unavailable in rural settings. The diversity of urban populations fosters creativity and cultural exchange, driving artistic and intellectual progress.

However, rapid urbanization also generates significant challenges. Overcrowding places enormous strain on housing, transportation, water, and sanitation systems. Informal settlements, commonly called slums, arise when urban growth outpaces infrastructure development, trapping millions in cycles of poverty.

Environmental consequences are equally concerning. Urban heat islands, air pollution, and the destruction of natural habitats are direct results of unplanned urban expansion. Cities consume enormous quantities of energy and resources, contributing substantially to greenhouse gas emissions.

Sustainable urban planning, investment in public transportation, and inclusive housing policies are essential for ensuring that cities remain livable and equitable for all residents.`
  },
  {
    id: "art-008",
    title: "The Psychology of Motivation",
    level: "advanced",
    wordCount: 165,
    content: `Motivation — the internal force that propels individuals toward goals and sustains behavior over time — remains one of psychology's most complex and consequential topics. Understanding what drives human action has profound implications for education, organizational management, therapeutic practice, and personal development.

Classical theories of motivation, such as Maslow's hierarchy of needs, propose that human behavior is driven by a sequential fulfillment of needs — from basic physiological requirements like food and shelter to higher-order pursuits such as self-actualization and transcendence. While influential, this framework has been critiqued for its cultural assumptions and oversimplification of human motivation.

Contemporary research distinguishes between intrinsic and extrinsic motivation. Intrinsic motivation arises from genuine interest, curiosity, or inherent enjoyment of an activity — the proverbial love of the game. Extrinsic motivation, conversely, is driven by external rewards such as money, grades, or social recognition. Research by Deci and Ryan suggests that intrinsic motivation fosters superior long-term engagement and well-being, while over-reliance on extrinsic rewards can paradoxically undermine inherent interest in an activity — a phenomenon known as the overjustification effect.

Goal-setting theory, developed by Edwin Locke, demonstrates that specific, challenging goals significantly outperform vague aspirations in driving performance. The quality of goals matters as much as their existence: goals must be SMART — specific, measurable, achievable, relevant, and time-bound — to catalyze sustained effort effectively.

Ultimately, cultivating intrinsic motivation and purposeful goal-setting are among the most powerful strategies available for achieving meaningful, lasting change.`
  },
  {
    id: "art-009",
    title: "Space Exploration: Humanity's Greatest Adventure",
    level: "intermediate",
    wordCount: 150,
    content: `Since the first human set foot on the Moon in 1969, space exploration has captured the imagination of people around the world. Today, a new era of space discovery is unfolding, driven by both government agencies and private companies with ambitious visions for humanity's future beyond Earth.

The benefits of space exploration extend far beyond the stars. Technologies developed for space missions — including GPS, water filtration systems, scratch-resistant lenses, and memory foam — have found widespread applications in everyday life, improving living standards for millions of people.

Mars has become the next great destination for human exploration. NASA's Perseverance rover is actively searching for signs of ancient life and collecting rock samples for future return to Earth. Meanwhile, SpaceX is developing the Starship spacecraft with the explicit goal of establishing a self-sustaining human colony on the red planet within decades.

Despite its enormous promise, space exploration faces significant challenges. The immense distances involved require revolutionary propulsion technologies. Long-duration spaceflight exposes astronauts to dangerous radiation and physiological deterioration. Furthermore, the costs of space programs must be balanced against pressing needs here on Earth.

Nevertheless, exploring space represents the continuation of humanity's oldest and most fundamental drive: curiosity, the desire to understand the universe we inhabit.`
  },
  {
    id: "art-010",
    title: "The Art of Effective Communication",
    level: "intermediate",
    wordCount: 140,
    content: `Effective communication is one of the most valuable skills a person can possess. Whether in personal relationships, professional settings, or public life, the ability to express ideas clearly and listen actively shapes the quality of nearly every human interaction.

Communication encompasses far more than the words we speak. Research suggests that non-verbal cues — including facial expressions, body language, eye contact, and tone of voice — account for the majority of the meaning conveyed in face-to-face interactions. A speaker's posture, gestures, and vocal inflection can reinforce or completely contradict the content of their words.

Active listening is equally important. True listening requires full attention, empathy, and the suspension of judgment. Many communication breakdowns occur not because of inadequate speaking but because of inadequate listening. Paraphrasing, asking clarifying questions, and acknowledging the speaker's perspective are practical techniques for demonstrating genuine engagement.

In professional environments, clear written communication is indispensable. Emails, reports, and presentations must be organized logically, free of jargon where appropriate, and adapted to the needs and knowledge level of the intended audience.

Ultimately, masterful communication requires continuous practice, self-awareness, and a genuine commitment to understanding others.`
  }
];

// State cho Reading module
const readingState = {
  articles: [],
  activeArticleId: null,
  activeLevel: "all",
  searchQuery: "",
  isSpeaking: false,
  lookupWord: null,
  lookupWordDefinition: null
};

// Khởi tạo tab Reading
function initReading() {
  // Load từ localStorage hoặc dùng mặc định
  const stored = localStorage.getItem("vocabmaster_reading_articles");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Merge: giữ default có sẵn, thêm custom của user
      const defaultIds = new Set(DEFAULT_ARTICLES.map(a => a.id));
      const customArticles = parsed.filter(a => !defaultIds.has(a.id));
      readingState.articles = [...DEFAULT_ARTICLES, ...customArticles];
    } catch(e) {
      readingState.articles = [...DEFAULT_ARTICLES];
    }
  } else {
    readingState.articles = [...DEFAULT_ARTICLES];
  }

  renderReadingList();
  bindReadingEvents();
}

function saveReadingArticles() {
  // Chỉ lưu bài custom (user-added) để localStorage không phình to
  const customArticles = readingState.articles.filter(a => a.isCustom);
  localStorage.setItem("vocabmaster_reading_articles", JSON.stringify(customArticles));
}

// Render danh sách bài đọc bên trái
function renderReadingList() {
  const container = document.getElementById("reading-articles-list");
  if (!container) return;

  const q = readingState.searchQuery.toLowerCase();
  const lvl = readingState.activeLevel;

  const filtered = readingState.articles.filter(a => {
    const matchLevel = lvl === "all" || a.level === lvl;
    const matchSearch = !q || a.title.toLowerCase().includes(q);
    return matchLevel && matchSearch;
  });

  container.innerHTML = "";

  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">
      Không tìm thấy bài đọc nào.
    </div>`;
    return;
  }

  const levelIcons = {
    beginner: "fa-seedling",
    intermediate: "fa-fire-flame-curved",
    advanced: "fa-bolt"
  };
  const levelLabels = {
    beginner: "Cơ bản",
    intermediate: "Trung cấp",
    advanced: "Nâng cao"
  };

  filtered.forEach(article => {
    const card = document.createElement("div");
    card.className = `reading-article-card${readingState.activeArticleId === article.id ? " active" : ""}`;
    card.setAttribute("data-id", article.id);

    const iconClass = article.isCustom ? "custom" : article.level;
    const iconFa = article.isCustom ? "fa-file-lines" : levelIcons[article.level];
    const words = article.content.split(/\s+/).length;

    card.innerHTML = `
      <div class="reading-article-card-icon ${iconClass}">
        <i class="fa-solid ${iconFa}"></i>
      </div>
      <div class="reading-article-card-info">
        <div class="reading-article-card-title">${article.title}</div>
        <div class="reading-article-card-meta">
          ${article.isCustom ? "Bài của bạn" : levelLabels[article.level]} • ~${words} từ
        </div>
      </div>
    `;

    card.addEventListener("click", () => openReadingArticle(article.id));
    container.appendChild(card);
  });
}

// Mở và hiển thị bài đọc
function openReadingArticle(articleId) {
  const article = readingState.articles.find(a => a.id === articleId);
  if (!article) return;

  readingState.activeArticleId = articleId;
  readingState.lookupWord = null;

  // Cập nhật active card
  document.querySelectorAll(".reading-article-card").forEach(c => {
    c.classList.toggle("active", c.getAttribute("data-id") === articleId);
  });

  // Ẩn empty state, hiện article view
  document.getElementById("reading-empty-state").style.display = "none";
  document.getElementById("reading-article-view").style.display = "block";

  // Reset translation
  document.getElementById("reading-translation-box").style.display = "none";
  document.getElementById("reading-word-lookup").style.display = "none";

  // Cập nhật header
  const levelBadge = document.getElementById("reading-view-level-badge");
  const levelLabels = { beginner: "Cơ bản", intermediate: "Trung cấp", advanced: "Nâng cao", custom: "Bài của bạn" };
  const levelKey = article.isCustom ? "custom" : article.level;
  levelBadge.textContent = levelLabels[levelKey] || levelKey;
  levelBadge.className = `reading-level-badge ${levelKey}`;

  document.getElementById("reading-view-title").textContent = article.title;

  // Ẩn nút xóa nếu là bài mặc định
  const deleteBtn = document.getElementById("reading-btn-delete");
  deleteBtn.style.display = article.isCustom ? "inline-flex" : "none";

  // Render nội dung bài đọc thành các từ có thể click
  renderReadingContent(article.content);

  // Tự động nhập từ mới từ bài đọc vào kho từ vựng
  autoImportArticleWords(article);
}

// Render nội dung bài đọc — mỗi từ là 1 span có thể click
function renderReadingContent(text) {
  const container = document.getElementById("reading-view-content");
  container.innerHTML = "";

  const paragraphs = text.trim().split(/\n+/);
  paragraphs.forEach(para => {
    if (!para.trim()) return;
    const p = document.createElement("p");
    p.style.marginBottom = "12px";

    // Tách từng token (giữ khoảng trắng và dấu câu)
    const tokens = para.split(/(\s+)/);
    tokens.forEach(token => {
      if (/^\s+$/.test(token)) {
        p.appendChild(document.createTextNode(token));
      } else {
        // Tách dấu câu ở đầu/cuối từ
        const match = token.match(/^([^a-zA-Z]*)([a-zA-Z'-]+)([^a-zA-Z]*)$/);
        if (match) {
          if (match[1]) p.appendChild(document.createTextNode(match[1]));

          const wordSpan = document.createElement("span");
          wordSpan.className = "reading-word";
          wordSpan.textContent = match[2];
          wordSpan.addEventListener("click", () => lookupReadingWord(match[2]));
          p.appendChild(wordSpan);

          if (match[3]) p.appendChild(document.createTextNode(match[3]));
        } else {
          p.appendChild(document.createTextNode(token));
        }
      }
    });

    container.appendChild(p);
  });
}

// Tra nghĩa một từ khi click vào trong bài đọc
function lookupReadingWord(word) {
  const cleanWord = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
  if (!cleanWord) return;

  readingState.lookupWord = cleanWord;

  // Bỏ highlight cũ, thêm highlight mới
  document.querySelectorAll(".reading-word").forEach(s => {
    s.classList.toggle("highlighted", s.textContent.toLowerCase() === cleanWord);
  });

  // Hiện lookup panel
  const lookupPanel = document.getElementById("reading-word-lookup");
  const lookupWordEl = document.getElementById("reading-lookup-word");
  const lookupResultEl = document.getElementById("reading-lookup-result");

  lookupWordEl.textContent = cleanWord;
  lookupResultEl.innerHTML = `<span class="reading-translate-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Đang tra từ điển...</span>`;
  lookupPanel.style.display = "block";

  // Cuộn xuống lookup panel
  lookupPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });

  // Kiểm tra trong kho từ vựng trước
  const inVocab = state.vocabulary.find(v => v.word.toLowerCase() === cleanWord);
  if (inVocab) {
    lookupResultEl.innerHTML = `
      <strong style="color:var(--color-success);">✓ Có trong kho từ vựng của bạn</strong><br>
      <span style="color:var(--text-main);">${inVocab.definition}</span><br>
      ${inVocab.pronunciation ? `<span style="color:var(--color-secondary);">${inVocab.pronunciation}</span><br>` : ""}
      ${inVocab.example ? `<em style="color:var(--text-muted); font-size:12px;">"${inVocab.example}"</em>` : ""}
    `;
    readingState.lookupWordDefinition = inVocab.definition;

    const addBtn = document.getElementById("reading-btn-add-vocab");
    addBtn.style.display = "none";
    return;
  }

  // Gọi Dictionary API
  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`)
    .then(r => { if (!r.ok) throw new Error("not found"); return r.json(); })
    .then(data => {
      const entry = data[0];
      let pronunciation = entry.phonetic || "";
      if (!pronunciation && entry.phonetics) {
        const p = entry.phonetics.find(p => p.text);
        if (p) pronunciation = p.text;
      }

      let defs = [];
      let example = "";
      if (entry.meanings) {
        entry.meanings.slice(0, 2).forEach(m => {
          m.definitions.slice(0, 1).forEach(d => {
            defs.push(`<em style="color:var(--color-warning); font-size:11px;">(${m.partOfSpeech})</em> ${d.definition}`);
            if (!example && d.example) example = d.example;
          });
        });
      }

      readingState.lookupWordDefinition = defs.map(d => d.replace(/<[^>]+>/g, "")).join("; ");

      lookupResultEl.innerHTML = `
        ${pronunciation ? `<span style="color:var(--color-secondary); font-size:13px;">${pronunciation}</span><br>` : ""}
        <div style="margin-top:6px; display:flex; flex-direction:column; gap:5px;">
          ${defs.join("<br>")}
        </div>
        ${example ? `<div style="margin-top:8px; padding:8px 12px; border-radius:6px; background:rgba(255,255,255,0.05); color:var(--text-muted); font-size:12px; font-style:italic;">"${example}"</div>` : ""}
      `;

      document.getElementById("reading-btn-add-vocab").style.display = "inline-flex";
    })
    .catch(() => {
      lookupResultEl.innerHTML = `<span style="color:var(--text-muted);">Không tìm thấy nghĩa trong từ điển. Hãy tự thêm vào kho từ!</span>`;
      readingState.lookupWordDefinition = null;
      document.getElementById("reading-btn-add-vocab").style.display = "none";
    });
}

// Dịch toàn bài qua MyMemory API (miễn phí, không cần API key)
function translateFullArticle() {
  const article = readingState.articles.find(a => a.id === readingState.activeArticleId);
  if (!article) return;

  const transBox = document.getElementById("reading-translation-box");
  const transContent = document.getElementById("reading-translation-content");
  const btn = document.getElementById("reading-btn-translate-all");

  transBox.style.display = "block";
  transContent.innerHTML = `<div class="reading-translate-spinner"><i class="fa-solid fa-spinner fa-spin"></i> Đang dịch bài đọc... (có thể mất vài giây)</div>`;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang dịch...`;

  // Chia bài thành các đoạn nhỏ (MyMemory giới hạn 500 ký tự/request)
  const paragraphs = article.content.trim().split(/\n+/).filter(p => p.trim());
  const chunks = [];
  let currentChunk = "";

  paragraphs.forEach(para => {
    if ((currentChunk + para).length > 450) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = para + "\n";
    } else {
      currentChunk += para + "\n";
    }
  });
  if (currentChunk.trim()) chunks.push(currentChunk.trim());

  // Dịch từng chunk tuần tự
  const translateChunk = (text) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`;
    return fetch(url)
      .then(r => r.json())
      .then(data => {
        if (data.responseStatus === 200) return data.responseData.translatedText;
        return text; // fallback: giữ nguyên nếu lỗi
      })
      .catch(() => text);
  };

  Promise.all(chunks.map(c => translateChunk(c)))
    .then(translations => {
      transContent.innerHTML = translations
        .map(t => `<p style="margin-bottom:10px;">${t}</p>`)
        .join("");
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-globe"></i> Dịch lại`;
    })
    .catch(() => {
      transContent.innerHTML = `<span style="color:var(--color-danger);">Không thể kết nối API dịch. Vui lòng thử lại sau.</span>`;
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-globe"></i> Dịch toàn bài`;
    });
}

// Đăng ký tất cả sự kiện cho tab Reading
function bindReadingEvents() {

  // ===== NÚT NHẬP TẤT CẢ TỪ MỚI TỪ TOÀN BỘ BÀI ĐỌC =====
  const importAllBtn = document.getElementById("reading-btn-import-all-articles");
  if (importAllBtn) {
    importAllBtn.onclick = () => importAllArticlesVocab();
  }

  // Tìm kiếm bài đọc
  const searchInput = document.getElementById("reading-search");
  if (searchInput) {
    searchInput.value = "";
    searchInput.oninput = () => {
      readingState.searchQuery = searchInput.value.trim();
      renderReadingList();
    };
  }

  // Filter theo level
  document.querySelectorAll(".reading-level-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".reading-level-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      readingState.activeLevel = btn.getAttribute("data-level");
      renderReadingList();
    };
  });

  // Nút dịch toàn bài
  const translateBtn = document.getElementById("reading-btn-translate-all");
  if (translateBtn) translateBtn.onclick = translateFullArticle;

  // Nút xóa bản dịch
  const clearBtn = document.getElementById("reading-btn-clear-translate");
  if (clearBtn) {
    clearBtn.onclick = () => {
      document.getElementById("reading-translation-box").style.display = "none";
      const translateAllBtn = document.getElementById("reading-btn-translate-all");
      if (translateAllBtn) {
        translateAllBtn.disabled = false;
        translateAllBtn.innerHTML = `<i class="fa-solid fa-globe"></i> Dịch toàn bài`;
      }
    };
  }

  // Nút phát âm toàn bài
  const speakBtn = document.getElementById("reading-btn-speak");
  if (speakBtn) {
    speakBtn.onclick = () => {
      const article = readingState.articles.find(a => a.id === readingState.activeArticleId);
      if (!article) return;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        speakBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i>`;
        readingState.isSpeaking = false;
        return;
      }
      const utterance = new SpeechSynthesisUtterance(article.content);
      utterance.lang = "en-US";
      utterance.rate = 0.88;
      utterance.onend = () => {
        speakBtn.innerHTML = `<i class="fa-solid fa-volume-high"></i>`;
        readingState.isSpeaking = false;
      };
      window.speechSynthesis.speak(utterance);
      speakBtn.innerHTML = `<i class="fa-solid fa-stop"></i>`;
      readingState.isSpeaking = true;
    };
  }

  // Nút xóa bài đọc
  const deleteBtn = document.getElementById("reading-btn-delete");
  if (deleteBtn) {
    deleteBtn.onclick = () => {
      const article = readingState.articles.find(a => a.id === readingState.activeArticleId);
      if (!article || !article.isCustom) return;
      if (confirm(`Bạn có chắc muốn xóa bài đọc "${article.title}"?`)) {
        readingState.articles = readingState.articles.filter(a => a.id !== readingState.activeArticleId);
        readingState.activeArticleId = null;
        saveReadingArticles();
        renderReadingList();
        document.getElementById("reading-empty-state").style.display = "flex";
        document.getElementById("reading-article-view").style.display = "none";
        showToast("Đã xóa bài đọc", "danger");
      }
    };
  }

  // Nút thêm từ vào kho từ vựng từ lookup
  const addVocabBtn = document.getElementById("reading-btn-add-vocab");
  if (addVocabBtn) {
    addVocabBtn.onclick = () => {
      if (!readingState.lookupWord) return;
      const word = readingState.lookupWord;
      const definition = readingState.lookupWordDefinition || "";

      const existing = state.vocabulary.find(v => v.word.toLowerCase() === word.toLowerCase());
      if (existing) {
        showToast(`Từ "${word}" đã có trong kho từ vựng!`, "warning");
        return;
      }

      const newVocab = {
        id: `vocab-${Date.now()}`,
        word,
        pronunciation: "",
        type: "noun",
        definition: definition.substring(0, 200),
        example: "",
        exampleTranslation: "",
        status: "learning",
        createdAt: Date.now()
      };

      state.vocabulary.push(newVocab);
      saveToLocalStorage("vocab");
      updateGlobalStats();
      showToast(`Đã thêm "${word}" vào kho từ vựng!`, "success");
      addVocabBtn.disabled = true;
      addVocabBtn.innerHTML = `<i class="fa-solid fa-check"></i> Đã thêm`;
    };
  }

  // Form thêm bài đọc mới
  const addForm = document.getElementById("reading-add-form");
  if (addForm) {
    addForm.onsubmit = (e) => {
      e.preventDefault();
      const title = document.getElementById("reading-add-title").value.trim();
      const level = document.getElementById("reading-add-level").value;
      const content = document.getElementById("reading-add-content").value.trim();

      if (!title || !content) {
        showToast("Vui lòng điền đầy đủ tiêu đề và nội dung!", "warning");
        return;
      }

      const newArticle = {
        id: `art-custom-${Date.now()}`,
        title,
        level,
        content,
        isCustom: true,
        createdAt: Date.now()
      };

      readingState.articles.push(newArticle);
      saveReadingArticles();
      renderReadingList();
      addForm.reset();
      openReadingArticle(newArticle.id);
      showToast(`Đã thêm bài đọc: ${title}`, "success");
    };
  }
}
// Tự động nhập từ mới từ bài đọc vào kho từ vựng
async function autoImportArticleWords(article) {
  // Danh sách stop words tiếng Anh đầy đủ
  const STOP_WORDS = new Set([
    "a","an","the","and","or","but","if","in","on","at","to","for","of","with",
    "as","by","from","into","through","during","before","after","above","below",
    "between","out","off","over","under","again","further","then","once","here",
    "there","when","where","why","how","all","both","each","few","more","most",
    "other","some","such","no","nor","not","only","own","same","so","than","too",
    "very","just","can","will","may","that","this","these","those","i","you",
    "he","she","it","we","they","what","which","who","whom","whose","my","your",
    "his","her","its","our","their","me","him","us","them","also","any","even",
    "up","do","did","does","done","is","are","was","were","be","been","being",
    "have","has","had","would","could","should","must","might","shall","need",
    "used","let","make","made","get","got","go","went","come","came","take",
    "took","give","gave","know","knew","think","thought","see","saw","say",
    "said","look","looked","want","wanted","use","find","found","like","liked",
    "time","year","way","day","man","new","now","long","great","little","own",
    "work","part","place","case","week","back","down","about","many","then",
    "them","these","so","some","her","his","would","make","like","him","into",
    "time","has","look","two","more","write","go","see","number","no","way",
    "could","people","than","first","been","its","who","now","one","while",
    "are","was","also","well","such","through","because","though","although",
    "since","until","while","whereas","whether","without","within","upon",
    "however","therefore","moreover","furthermore","nevertheless","thus",
    "hence","yet","still","already","often","always","never","sometimes",
    "usually","perhaps","around","among","along","away","ever","much","every",
    "rather","quite","merely","simply","nearly","almost","enough","instead"
  ]);

  // Bước 1: Trích xuất tất cả từ duy nhất từ bài đọc
  const rawWords = article.content
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .map(w => w.replace(/^['-]+|['-]+$/g, ""))  // xóa dấu ở đầu/cuối
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && /^[a-z]/.test(w));

  // Lấy các từ duy nhất và loại bỏ từ đã có trong kho
  const existingWords = new Set(state.vocabulary.map(v => v.word.toLowerCase()));
  const uniqueNewWords = [...new Set(rawWords)].filter(w => !existingWords.has(w));

  if (uniqueNewWords.length === 0) {
    // Không có từ mới — không hiện gì
    return;
  }

  // Bước 2: Hiện thanh trạng thái
  const bar = document.getElementById("reading-import-bar");
  const barText = document.getElementById("reading-import-bar-text");
  const barIcon = document.getElementById("reading-import-bar-icon");
  if (bar) {
    bar.style.display = "flex";
    barText.textContent = `Đang tra và nhập ${uniqueNewWords.length} từ mới từ bài đọc...`;
    barIcon.className = "fa-solid fa-spinner fa-spin";
    barIcon.style.color = "var(--color-primary-light)";
  }

  // Bước 3: Tra từ điển và thêm từ vựng theo batch (3 từ/lần để tránh rate limit)
  const BATCH_SIZE = 3;
  const DELAY_MS = 350;
  let addedCount = 0;
  let notFoundCount = 0;

  // Hủy tính hiệu nếu bài đọc bị đổi trước khi nhập xong
  const targetArticleId = article.id;

  for (let i = 0; i < uniqueNewWords.length; i += BATCH_SIZE) {
    // Dừng nếu người dùng đã chuyển sang bài khác
    if (readingState.activeArticleId !== targetArticleId) break;

    const batch = uniqueNewWords.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (word) => {
      // Kiểm tra lại lần 2 (phòng trường hợp từ vừa được thêm trước đó)
      if (state.vocabulary.find(v => v.word.toLowerCase() === word)) return;

      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        const entry = data[0];

        // Lấy phân âm
        let pronunciation = entry.phonetic || "";
        if (!pronunciation && entry.phonetics) {
          const ph = entry.phonetics.find(p => p.text);
          if (ph) pronunciation = ph.text;
        }

        // Lấy từ loại + định nghĩa + ví dụ
        let type = "noun";
        let definition = "";
        let example = "";
        let exampleTranslation = "";

        if (entry.meanings && entry.meanings.length > 0) {
          const m = entry.meanings[0];
          type = m.partOfSpeech || "noun";
          if (m.definitions && m.definitions.length > 0) {
            definition = m.definitions[0].definition || "";
            example = m.definitions[0].example || "";
          }
        }

        if (!definition) { notFoundCount++; return; }

        // Thêm vào kho từ vựng
        const newVocab = {
          id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          word,
          pronunciation,
          type,
          definition: definition.substring(0, 200),
          example,
          exampleTranslation,
          status: "learning",
          createdAt: Date.now()
        };

        state.vocabulary.push(newVocab);
        addedCount++;

        // Cập nhật thanh trạng thái
        if (barText && readingState.activeArticleId === targetArticleId) {
          const done = i + batch.indexOf(word) + 1;
          barText.textContent = `Đã nhập ${addedCount} từ mới... (${Math.min(i + BATCH_SIZE, uniqueNewWords.length)}/${uniqueNewWords.length})`;
        }
      } catch {
        notFoundCount++;
      }
    }));

    // Lưu sau mỗi batch
    saveToLocalStorage("vocab");
    updateGlobalStats();

    // Delay giữa các batch
    if (i + BATCH_SIZE < uniqueNewWords.length) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Lưu lần cuối và cập nhật UI
  saveToLocalStorage("vocab");
  updateGlobalStats();

  // Hiện kết quả trên thanh trạng thái
  if (bar && readingState.activeArticleId === targetArticleId) {
    if (addedCount > 0) {
      barIcon.className = "fa-solid fa-circle-check";
      barIcon.style.color = "var(--color-success)";
      barText.textContent = `✅ Đã tự động thêm ${addedCount} từ mới vào kho từ vựng${notFoundCount > 0 ? ` (${notFoundCount} từ không tìm thấy nghĩa)` : ""}`;
      // Tự ẩn sau 5 giây
      setTimeout(() => {
        if (bar) bar.style.display = "none";
      }, 5000);
    } else {
      // Không thêm được từ nào
      bar.style.display = "none";
    }
  }
}

// ============================================================
// Nhập TẤT CẢ từ mới từ toàn bộ bài đọc vào kho từ vựng
// ============================================================
async function importAllArticlesVocab() {
  const importBtn   = document.getElementById("reading-btn-import-all-articles");
  const progressBar = document.getElementById("reading-import-all-bar");
  const fillEl      = document.getElementById("reading-import-all-fill");
  const textEl      = document.getElementById("reading-import-all-text");
  const countEl     = document.getElementById("reading-import-all-count");

  // Stop words
  const STOP_WORDS = new Set([
    "a","an","the","and","or","but","if","in","on","at","to","for","of","with",
    "as","by","from","into","through","during","before","after","above","below",
    "between","out","off","over","under","again","further","then","once","here",
    "there","when","where","why","how","all","both","each","few","more","most",
    "other","some","such","no","nor","not","only","own","same","so","than","too",
    "very","just","can","will","may","that","this","these","those","i","you",
    "he","she","it","we","they","what","which","who","whom","whose","my","your",
    "his","her","its","our","their","me","him","us","them","also","any","even",
    "up","do","did","does","done","is","are","was","were","be","been","being",
    "have","has","had","would","could","should","must","might","shall","need",
    "used","let","make","made","get","got","go","went","come","came","take",
    "took","give","gave","know","knew","think","thought","see","saw","say",
    "said","look","looked","want","wanted","use","find","found","like","liked",
    "time","year","way","day","man","new","now","long","great","little","work",
    "part","place","case","week","back","down","about","many","two","people",
    "one","well","while","because","though","although","since","until","whereas",
    "whether","without","within","upon","however","therefore","moreover",
    "furthermore","nevertheless","thus","hence","yet","still","already","often",
    "always","never","sometimes","usually","perhaps","around","among","along",
    "away","ever","much","every","rather","quite","merely","simply","nearly",
    "almost","enough","instead","first","three","four","five","six","seven",
    "eight","nine","ten","its","their","those"
  ]);

  // ── Bước 1: Gom tất cả từ từ mọi bài đọc ──
  const allWordsSet = new Set();
  readingState.articles.forEach(article => {
    article.content
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, " ")
      .split(/\s+/)
      .map(w => w.replace(/^['-]+|['-]+$/g, ""))
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && /^[a-z]/.test(w))
      .forEach(w => allWordsSet.add(w));
  });

  // ── Bước 2: Loại những từ đã có trong kho ──
  const existingWords = new Set(state.vocabulary.map(v => v.word.toLowerCase()));
  const newWords = [...allWordsSet].filter(w => !existingWords.has(w));

  if (newWords.length === 0) {
    showToast("✅ Tất cả từ đã có trong kho từ vựng rồi!", "success");
    return;
  }

  // ── Bước 3: Hiện progress bar, disable nút ──
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang nhập ${newWords.length} từ...`;
  }
  if (progressBar) progressBar.style.display = "flex";
  if (textEl) textEl.textContent = `Đang tra từ điển và nhập ${newWords.length} từ mới...`;
  if (countEl) countEl.textContent = `0 / ${newWords.length}`;
  if (fillEl)  fillEl.style.width = "0%";

  // ── Bước 4: Tra từ điển & thêm vào kho theo batch ──
  const BATCH_SIZE = 4;
  const DELAY_MS   = 300;
  let added    = 0;
  let notFound = 0;
  let processed = 0;

  for (let i = 0; i < newWords.length; i += BATCH_SIZE) {
    const batch = newWords.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (word) => {
      if (state.vocabulary.find(v => v.word.toLowerCase() === word)) { processed++; return; }

      try {
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!res.ok) throw new Error("not found");
        const data = await res.json();
        const entry = data[0];

        // Phiên âm
        let pronunciation = entry.phonetic || "";
        if (!pronunciation && entry.phonetics) {
          const ph = entry.phonetics.find(p => p.text);
          if (ph) pronunciation = ph.text;
        }

        // Từ loại + định nghĩa + ví dụ
        let type = "noun", definition = "", example = "";
        if (entry.meanings && entry.meanings.length > 0) {
          const m = entry.meanings[0];
          type = m.partOfSpeech || "noun";
          if (m.definitions && m.definitions.length > 0) {
            definition = m.definitions[0].definition || "";
            example    = m.definitions[0].example || "";
          }
        }

        if (!definition) { notFound++; processed++; return; }

        state.vocabulary.push({
          id: `vocab-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
          word, pronunciation, type,
          definition: definition.substring(0, 200),
          example, exampleTranslation: "",
          status: "learning",
          createdAt: Date.now()
        });

        added++;
        processed++;
      } catch {
        notFound++;
        processed++;
      }
    }));

    // Cập nhật progress
    const pct = Math.round((processed / newWords.length) * 100);
    if (fillEl)  fillEl.style.width  = `${pct}%`;
    if (countEl) countEl.textContent = `${processed} / ${newWords.length} từ`;
    if (textEl)  textEl.textContent  = `Đã nhập ${added} từ mới...`;

    // Lưu sau mỗi batch
    saveToLocalStorage("vocab");
    updateGlobalStats();

    if (i + BATCH_SIZE < newWords.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // ── Bước 5: Hoàn tất ──
  saveToLocalStorage("vocab");
  updateGlobalStats();

  if (fillEl)  fillEl.style.width  = "100%";
  if (textEl)  textEl.textContent  = `✅ Hoàn tất! Đã thêm ${added} từ mới${notFound > 0 ? ` (${notFound} từ không có trong từ điển)` : ""}`;
  if (countEl) countEl.textContent = `${newWords.length} / ${newWords.length} từ`;

  if (importBtn) {
    importBtn.disabled = false;
    importBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã nhập ${added} từ mới`;
    importBtn.style.background = "linear-gradient(135deg, var(--color-success), #00c853)";
  }

  showToast(`✅ Đã nhập ${added} từ mới vào kho từ vựng!`, "success");

  // Ẩn thanh tiến trình sau 6 giây
  setTimeout(() => {
    if (progressBar) progressBar.style.display = "none";
  }, 6000);
}

// --- CHỨC NĂNG KIỂM TRA THEO TOPIC (TOPIC QUIZ HUB) ---

function initTopicQuizHub() {
  // Reset màn hình setup
  const setupScreen = document.getElementById("tquiz-setup-screen");
  const playArena = document.getElementById("tquiz-play-arena");
  const resultScreen = document.getElementById("tquiz-result-screen");

  if (setupScreen) setupScreen.style.display = "block";
  if (playArena) playArena.style.display = "none";
  if (resultScreen) resultScreen.style.display = "none";

  if (state.topicQuiz.timerInterval) {
    clearInterval(state.topicQuiz.timerInterval);
    state.topicQuiz.timerInterval = null;
  }

  // Đảm bảo có topic hợp lệ được chọn
  const topics = getAvailableTopics();
  if (topics.length > 0) {
    const topicExists = topics.some(t => t.key === state.topicQuiz.selectedTopic);
    if (!topicExists) {
      state.topicQuiz.selectedTopic = topics[0].key;
    }
  }

  renderTopicCardsInHub();
  bindTopicQuizEvents();
}

function renderTopicCardsInHub() {
  const container = document.getElementById("tquiz-cards-grid");
  if (!container) return;

  const topics = getAvailableTopics();
  const selected = state.topicQuiz.selectedTopic || "Coming and Going";

  // Thêm tùy chọn "Tất cả chủ đề"
  const allTopicObj = {
    key: "all",
    name: "Tất cả chủ đề",
    icon: "🌐",
    total: state.vocabulary.length,
    mastered: state.vocabulary.filter(v => v.status === "mastered").length
  };

  const fullTopicList = [allTopicObj, ...topics];

  container.innerHTML = "";

  fullTopicList.forEach(t => {
    const pct = t.total > 0 ? Math.round((t.mastered / t.total) * 100) : 0;
    const card = document.createElement("div");
    card.className = `tquiz-card ${selected === t.key ? "active" : ""}`;
    card.setAttribute("data-topic-key", t.key);

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span class="tquiz-card-icon">${t.icon}</span>
        <span class="tquiz-card-count">${t.total} từ</span>
      </div>
      <h3 class="tquiz-card-title">${t.name}</h3>
      <div class="tquiz-progress-bar">
        <div class="tquiz-progress-fill" style="width: ${pct}%;"></div>
      </div>
      <div class="tquiz-stats-text">
        <span>Đã thuộc: ${t.mastered}/${t.total}</span>
        <span>${pct}%</span>
      </div>
    `;

    card.onclick = () => {
      state.topicQuiz.selectedTopic = t.key;
      document.querySelectorAll(".tquiz-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");

      const titleEl = document.getElementById("tquiz-selected-topic-title");
      if (titleEl) titleEl.textContent = t.name;
    };

    container.appendChild(card);
  });

  const selectedObj = fullTopicList.find(t => t.key === selected) || allTopicObj;
  const titleEl = document.getElementById("tquiz-selected-topic-title");
  if (titleEl) titleEl.textContent = selectedObj.name;
}

function bindTopicQuizEvents() {
  // Chọn Mode kiểm tra
  document.querySelectorAll(".tquiz-mode-card").forEach(card => {
    card.onclick = () => {
      document.querySelectorAll(".tquiz-mode-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      state.topicQuiz.mode = card.getAttribute("data-tmode");
    };
  });

  // Nút bắt đầu bài test
  const startBtn = document.getElementById("btn-start-tquiz-custom");
  if (startBtn) {
    startBtn.onclick = () => startTopicQuiz(state.topicQuiz.mode);
  }

  // Nút quick topic test từ Kho từ vựng
  const quickTestBtn = document.getElementById("btn-quick-topic-test");
  if (quickTestBtn) {
    quickTestBtn.onclick = () => {
      if (state.activeTopicFilter && state.activeTopicFilter !== "all") {
        state.topicQuiz.selectedTopic = state.activeTopicFilter;
      }
      navigateToTab("topic-quiz");
    };
  }

  // Nút thoát bài test
  const exitBtn = document.getElementById("btn-tquiz-exit");
  if (exitBtn) {
    exitBtn.onclick = () => {
      if (confirm("Bạn có chắc chắn muốn dừng bài kiểm tra đang dở?")) {
        initTopicQuizHub();
      }
    };
  }

  // Nút nghe phát âm trong câu hỏi
  const speakBtn = document.getElementById("tquiz-q-speak");
  if (speakBtn) {
    speakBtn.onclick = () => {
      const q = state.topicQuiz.questions[state.topicQuiz.currentIndex];
      if (q && q.word) speakWord(q.word);
    };
  }

  // Nút gửi đáp án FITB
  const fitbBtn = document.getElementById("tquiz-btn-submit-fitb");
  const fitbInput = document.getElementById("tquiz-input-answer");
  if (fitbBtn) {
    fitbBtn.onclick = checkTopicFITBAnswer;
  }
  if (fitbInput) {
    fitbInput.onkeydown = (e) => {
      if (e.key === "Enter") checkTopicFITBAnswer();
    };
  }

  // Nút câu tiếp theo
  const nextBtn = document.getElementById("tquiz-btn-next");
  if (nextBtn) {
    nextBtn.onclick = () => {
      state.topicQuiz.currentIndex++;
      renderTopicQuizQuestion();
    };
  }

  // Nút thử lại bài test
  const retryBtn = document.getElementById("btn-tquiz-retry");
  if (retryBtn) {
    retryBtn.onclick = () => startTopicQuiz(state.topicQuiz.mode);
  }

  // Nút chọn topic khác
  const backSetupBtn = document.getElementById("btn-tquiz-back-setup");
  if (backSetupBtn) {
    backSetupBtn.onclick = initTopicQuizHub;
  }
}

function startTopicQuiz(mode) {
  const selectedTopic = state.topicQuiz.selectedTopic || "Coming and Going";
  
  // Lọc từ vựng theo Topic
  let topicWords = [];
  if (selectedTopic === "all") {
    topicWords = [...state.vocabulary];
  } else {
    topicWords = state.vocabulary.filter(v => {
      const t = v.topic || "General";
      return (t === selectedTopic) || (selectedTopic === "General" && (t === "General" || t === "Từ vựng chung"));
    });
  }

  if (topicWords.length < 4) {
    showToast(`Chủ đề này cần tối thiểu 4 từ vựng để bắt đầu kiểm tra! (Hiện có ${topicWords.length} từ)`, "warning");
    return;
  }

  state.topicQuiz.mode = mode || "mcq";
  state.topicQuiz.score = 0;
  state.topicQuiz.currentIndex = 0;
  state.topicQuiz.hasAnswered = false;
  state.topicQuiz.wrongAnswers = [];
  state.topicQuiz.timerSeconds = 0;

  // Cập nhật Badge giao diện Arena
  const topics = getAvailableTopics();
  const tObj = topics.find(t => t.key === selectedTopic);
  const topicBadgeName = (selectedTopic === "all") ? "🌐 Tất cả chủ đề" : `${tObj ? tObj.icon : '🏷️'} ${tObj ? tObj.name : selectedTopic}`;
  
  let modeName = "Trắc nghiệm";
  if (mode === "fitb") modeName = "Gõ từ vựng";
  if (mode === "audio") modeName = "Luyện nghe";
  if (mode === "match") modeName = "Ghép từ & Định nghĩa";

  document.getElementById("tquiz-arena-topic-badge").textContent = topicBadgeName;
  document.getElementById("tquiz-arena-mode-badge").textContent = modeName;
  document.getElementById("tquiz-live-score").textContent = "0";

  // Bắt đầu đồng hồ đếm giờ
  if (state.topicQuiz.timerInterval) clearInterval(state.topicQuiz.timerInterval);
  const timerEl = document.getElementById("tquiz-timer");
  if (timerEl) timerEl.textContent = "00:00";

  state.topicQuiz.timerInterval = setInterval(() => {
    state.topicQuiz.timerSeconds++;
    const mins = String(Math.floor(state.topicQuiz.timerSeconds / 60)).padStart(2, '0');
    const secs = String(state.topicQuiz.timerSeconds % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);

  // Hiển thị màn hình arena
  document.getElementById("tquiz-setup-screen").style.display = "none";
  document.getElementById("tquiz-play-arena").style.display = "block";
  document.getElementById("tquiz-result-screen").style.display = "none";

  if (mode === "match") {
    // Mode Ghép từ
    document.getElementById("tquiz-standard-box").style.display = "none";
    document.getElementById("tquiz-matching-box").style.display = "block";
    startTopicMatchingQuiz(topicWords);
  } else {
    // Mode MCQ, FITB, Audio
    document.getElementById("tquiz-standard-box").style.display = "block";
    document.getElementById("tquiz-matching-box").style.display = "none";

    // Chuẩn bị mảng câu hỏi (tối đa 15 câu)
    const shuffled = [...topicWords].sort(() => Math.random() - 0.5);
    state.topicQuiz.questions = shuffled.slice(0, 15);
    
    renderTopicQuizQuestion();
  }
}

function renderTopicQuizQuestion() {
  const tq = state.topicQuiz;
  if (tq.currentIndex >= tq.questions.length) {
    finishTopicQuiz();
    return;
  }

  tq.hasAnswered = false;
  const q = tq.questions[tq.currentIndex];
  const totalQ = tq.questions.length;
  const currentNum = tq.currentIndex + 1;

  // Progress bar & Live score
  const fillEl = document.getElementById("tquiz-progress-fill");
  if (fillEl) fillEl.style.width = `${(currentNum / totalQ) * 100}%`;
  document.getElementById("tquiz-live-score").textContent = tq.score;

  // UI Elements
  const labelEl = document.getElementById("tquiz-q-label");
  const textEl = document.getElementById("tquiz-q-text");
  const subEl = document.getElementById("tquiz-q-sub");
  const speakBtn = document.getElementById("tquiz-q-speak");
  const optionsGrid = document.getElementById("tquiz-options-container");
  const inputContainer = document.getElementById("tquiz-input-container");
  const inputAnswer = document.getElementById("tquiz-input-answer");
  const nextBtn = document.getElementById("tquiz-btn-next");

  nextBtn.style.display = "none";
  optionsGrid.innerHTML = "";
  if (inputAnswer) inputAnswer.value = "";

  if (tq.mode === "mcq") {
    labelEl.textContent = `Câu ${currentNum}/${totalQ}: Chọn nghĩa tiếng Việt chính xác`;
    textEl.textContent = q.word;
    subEl.textContent = `${q.pronunciation ? q.pronunciation : ''} • ${q.type || 'vocab'}`;
    speakBtn.style.display = "inline-flex";

    optionsGrid.style.display = "grid";
    inputContainer.style.display = "none";

    // Tạo 4 lựa chọn (1 đúng, 3 sai từ pool từ vựng)
    const options = generateTopicMCQOptions(q);
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "quiz-option-btn";
      btn.textContent = opt.definition;
      btn.onclick = () => handleTopicQuizAnswer(opt, btn, opt.isCorrect);
      optionsGrid.appendChild(btn);
    });

  } else if (tq.mode === "fitb") {
    labelEl.textContent = `Câu ${currentNum}/${totalQ}: Nhập từ tiếng Anh tương ứng`;
    textEl.textContent = q.definition;
    subEl.textContent = `Gợi ý phát âm: ${q.pronunciation || '/.../'} (${q.word.length} ký tự, bắt đầu bằng '${q.word[0].toUpperCase()}')`;
    speakBtn.style.display = "none";

    optionsGrid.style.display = "none";
    inputContainer.style.display = "flex";
    if (inputAnswer) inputAnswer.focus();

  } else if (tq.mode === "audio") {
    labelEl.textContent = `Câu ${currentNum}/${totalQ}: Nghe phát âm và chọn từ vựng đúng`;
    textEl.textContent = "🔊 Bấm nút để nghe từ vựng";
    subEl.textContent = `Từ loại: ${q.type || 'vocab'}`;
    speakBtn.style.display = "inline-flex";

    // Tự động phát âm khi load câu
    setTimeout(() => speakWord(q.word), 300);

    optionsGrid.style.display = "grid";
    inputContainer.style.display = "none";

    const options = generateTopicAudioOptions(q);
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "quiz-option-btn";
      btn.textContent = `${opt.word} (${opt.pronunciation || ''})`;
      btn.onclick = () => handleTopicQuizAnswer(opt, btn, opt.isCorrect);
      optionsGrid.appendChild(btn);
    });
  }
}

function generateTopicMCQOptions(correctWord) {
  const pool = state.vocabulary.filter(v => v.id !== correctWord.id);
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
  const distractors = shuffledPool.slice(0, 3).map(v => ({ definition: v.definition, isCorrect: false }));

  const all = [{ definition: correctWord.definition, isCorrect: true }, ...distractors];
  return all.sort(() => Math.random() - 0.5);
}

function generateTopicAudioOptions(correctWord) {
  const pool = state.vocabulary.filter(v => v.id !== correctWord.id);
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
  const distractors = shuffledPool.slice(0, 3).map(v => ({ word: v.word, pronunciation: v.pronunciation, isCorrect: false }));

  const all = [{ word: correctWord.word, pronunciation: correctWord.pronunciation, isCorrect: true }, ...distractors];
  return all.sort(() => Math.random() - 0.5);
}

function handleTopicQuizAnswer(selectedOpt, btnElement, isCorrect) {
  const tq = state.topicQuiz;
  if (tq.hasAnswered) return;
  tq.hasAnswered = true;

  const q = tq.questions[tq.currentIndex];
  const allBtns = document.querySelectorAll("#tquiz-options-container .quiz-option-btn");

  allBtns.forEach(btn => {
    btn.disabled = true;
    if (btn === btnElement) {
      if (isCorrect) {
        btn.classList.add("correct");
      } else {
        btn.classList.add("wrong");
      }
    } else {
      // Highlight đáp án đúng nếu trả lời sai
      if (!isCorrect) {
        const text = btn.textContent;
        if (tq.mode === "mcq" && text === q.definition) btn.classList.add("correct");
        if (tq.mode === "audio" && text.includes(q.word)) btn.classList.add("correct");
      }
    }
  });

  if (isCorrect) {
    tq.score++;
    document.getElementById("tquiz-live-score").textContent = tq.score;
  } else {
    tq.wrongAnswers.push(q);
  }

  const nextBtn = document.getElementById("tquiz-btn-next");
  if (nextBtn) nextBtn.style.display = "inline-flex";

  // Tự động chuyển câu sau 1.4s nếu chọn đúng
  if (isCorrect) {
    setTimeout(() => {
      if (tq.hasAnswered && state.activeTab === "topic-quiz") {
        tq.currentIndex++;
        renderTopicQuizQuestion();
      }
    }, 1400);
  }
}

function checkTopicFITBAnswer() {
  const tq = state.topicQuiz;
  if (tq.hasAnswered) return;

  const inputEl = document.getElementById("tquiz-input-answer");
  if (!inputEl) return;

  const userAns = inputEl.value.trim().toLowerCase();
  const q = tq.questions[tq.currentIndex];
  const correctAns = q.word.trim().toLowerCase();

  if (!userAns) {
    showToast("Vui lòng nhập từ tiếng Anh!", "warning");
    return;
  }

  tq.hasAnswered = true;
  const isCorrect = (userAns === correctAns);

  if (isCorrect) {
    inputEl.style.border = "2px solid var(--color-success)";
    inputEl.style.background = "rgba(0, 230, 118, 0.1)";
    tq.score++;
    document.getElementById("tquiz-live-score").textContent = tq.score;
  } else {
    inputEl.style.border = "2px solid var(--color-danger)";
    inputEl.style.background = "rgba(255, 77, 106, 0.1)";
    showToast(`Đáp án đúng là: "${q.word}"`, "danger");
    tq.wrongAnswers.push(q);
  }

  const nextBtn = document.getElementById("tquiz-btn-next");
  if (nextBtn) nextBtn.style.display = "inline-flex";

  if (isCorrect) {
    setTimeout(() => {
      if (tq.hasAnswered && state.activeTab === "topic-quiz") {
        tq.currentIndex++;
        renderTopicQuizQuestion();
      }
    }, 1200);
  }
}

// Mode Ghép thẻ (Matching Pairs)
function startTopicMatchingQuiz(topicWords) {
  const container = document.getElementById("tquiz-match-grid-container");
  if (!container) return;

  // Lấy 8 cặp từ ngẫu nhiên từ Topic
  const shuffled = [...topicWords].sort(() => Math.random() - 0.5);
  const selectedPairs = shuffled.slice(0, 8);

  state.topicQuiz.matchState = {
    selectedEngCard: null,
    selectedViCard: null,
    matchedCount: 0,
    totalPairs: selectedPairs.length,
    wrongAnswers: []
  };

  const engItems = selectedPairs.map(v => ({ id: v.id, text: v.word, sub: v.pronunciation || '', type: 'eng' })).sort(() => Math.random() - 0.5);
  const viItems = selectedPairs.map(v => ({ id: v.id, text: v.definition, sub: v.type || '', type: 'vi' })).sort(() => Math.random() - 0.5);

  container.innerHTML = "";

  // Tạo 2 cột: Cột Anh (trái) và Cột Việt (phải)
  const leftCol = document.createElement("div");
  leftCol.style.display = "flex";
  leftCol.style.flexDirection = "column";
  leftCol.style.gap = "10px";

  const rightCol = document.createElement("div");
  rightCol.style.display = "flex";
  rightCol.style.flexDirection = "column";
  rightCol.style.gap = "10px";

  engItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "tquiz-match-card";
    card.setAttribute("data-vocab-id", item.id);
    card.setAttribute("data-type", "eng");
    card.innerHTML = `<strong>${item.text}</strong> <span style="font-size:11px; opacity:0.7;">${item.sub}</span>`;
    card.onclick = () => handleTopicMatchCardClick(card, item);
    leftCol.appendChild(card);
  });

  viItems.forEach(item => {
    const card = document.createElement("div");
    card.className = "tquiz-match-card";
    card.setAttribute("data-vocab-id", item.id);
    card.setAttribute("data-type", "vi");
    card.innerHTML = `<span>${item.text}</span>`;
    card.onclick = () => handleTopicMatchCardClick(card, item);
    rightCol.appendChild(card);
  });

  container.appendChild(leftCol);
  container.appendChild(rightCol);
}

function handleTopicMatchCardClick(card, item) {
  if (card.classList.contains("matched")) return;

  const mState = state.topicQuiz.matchState;

  if (item.type === "eng") {
    if (mState.selectedEngCard) mState.selectedEngCard.classList.remove("selected");
    mState.selectedEngCard = card;
    card.classList.add("selected");
    speakWord(item.text);
  } else {
    if (mState.selectedViCard) mState.selectedViCard.classList.remove("selected");
    mState.selectedViCard = card;
    card.classList.add("selected");
  }

  // Kiểm tra khi đã chọn đủ 1 thẻ Anh và 1 thẻ Việt
  if (mState.selectedEngCard && mState.selectedViCard) {
    const engId = mState.selectedEngCard.getAttribute("data-vocab-id");
    const viId = mState.selectedViCard.getAttribute("data-vocab-id");

    const engCard = mState.selectedEngCard;
    const viCard = mState.selectedViCard;

    mState.selectedEngCard = null;
    mState.selectedViCard = null;

    if (engId === viId) {
      // Đúng cặp!
      engCard.classList.remove("selected");
      viCard.classList.remove("selected");
      engCard.classList.add("matched");
      viCard.classList.add("matched");

      mState.matchedCount++;
      state.topicQuiz.score++;
      document.getElementById("tquiz-live-score").textContent = state.topicQuiz.score;

      if (mState.matchedCount >= mState.totalPairs) {
        setTimeout(() => finishTopicQuiz(), 800);
      }
    } else {
      // Sai cặp!
      engCard.classList.add("wrong");
      viCard.classList.add("wrong");

      setTimeout(() => {
        engCard.classList.remove("selected", "wrong");
        viCard.classList.remove("selected", "wrong");
      }, 700);
    }
  }
}

function finishTopicQuiz() {
  if (state.topicQuiz.timerInterval) {
    clearInterval(state.topicQuiz.timerInterval);
    state.topicQuiz.timerInterval = null;
  }

  document.getElementById("tquiz-play-arena").style.display = "none";
  document.getElementById("tquiz-result-screen").style.display = "block";

  const tq = state.topicQuiz;
  const isMatch = (tq.mode === "match");
  const total = isMatch ? tq.matchState.totalPairs : tq.questions.length;
  const score = tq.score;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  // Format thời gian
  const mins = String(Math.floor(tq.timerSeconds / 60)).padStart(2, '0');
  const secs = String(tq.timerSeconds % 60).padStart(2, '0');
  const timeStr = `${mins}:${secs}`;

  document.getElementById("tquiz-res-score").textContent = `${score}/${total}`;
  document.getElementById("tquiz-res-percent").textContent = `${percent}% Chính xác`;
  document.getElementById("tquiz-res-time").textContent = timeStr;
  document.getElementById("tquiz-res-correct").textContent = `${score} câu`;
  document.getElementById("tquiz-res-wrong").textContent = `${total - score} câu`;

  const topics = getAvailableTopics();
  const tObj = topics.find(t => t.key === tq.selectedTopic);
  document.getElementById("tquiz-res-topic-name").textContent = (tq.selectedTopic === "all") ? "🌐 Tất cả chủ đề" : (tObj ? tObj.name : tq.selectedTopic);

  // Icon & Title theo phần trăm điểm
  const iconEl = document.getElementById("tquiz-res-icon");
  const titleEl = document.getElementById("tquiz-res-title");
  const subEl = document.getElementById("tquiz-res-subtitle");

  if (percent >= 90) {
    iconEl.className = "fa-solid fa-trophy";
    titleEl.textContent = "Xuất sắc! 🎉";
    subEl.textContent = "Bạn đã làm chủ hoàn toàn các từ vựng thuộc chủ đề này!";
  } else if (percent >= 70) {
    iconEl.className = "fa-solid fa-medal";
    titleEl.textContent = "Rất tốt! 👏";
    subEl.textContent = "Kết quả ghi nhớ từ vựng rất ấn tượng. Hãy tiếp tục duy trì nhé!";
  } else if (percent >= 50) {
    iconEl.className = "fa-solid fa-star-half-stroke";
    titleEl.textContent = "Khá lắm! 👍";
    subEl.textContent = "Bạn đã nhớ được phần lớn từ vựng. Ôn tập thêm 1 chút nữa nhé!";
  } else {
    iconEl.className = "fa-solid fa-rotate-right";
    titleEl.textContent = "Cần cố gắng hơn! 💪";
    subEl.textContent = "Hãy dùng Flashcards ôn lại bài trước khi làm bài test nhé!";
  }

  // Danh sách từ làm sai
  const wrongReviewBox = document.getElementById("tquiz-wrong-review-box");
  const wrongList = document.getElementById("tquiz-wrong-list");

  if (tq.wrongAnswers && tq.wrongAnswers.length > 0) {
    wrongReviewBox.style.display = "block";
    wrongList.innerHTML = "";

    tq.wrongAnswers.forEach(item => {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${item.word}</strong> (${item.pronunciation || ''}): ${item.definition}`;
      wrongList.appendChild(li);
    });
  } else {
    wrongReviewBox.style.display = "none";
  }
}


