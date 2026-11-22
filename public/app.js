// =========================================================================
// BRO SQUAD - Master Application Controller
// Modular Firebase Cloud Integration, Exact Paisa Math & Live Sync Engine
// =========================================================================

import {
  auth,
  db,
  ROOM_ID,
  ROOM_NAME,
  INITIAL_MEMBERS,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from "./firebase-config.js";

// =========================================================================
// GLOBAL APPLICATION STATE
// =========================================================================
const state = {
  currentUser: null,       // Firebase Auth User
  currentMember: null,     // Room Member profile
  members: [],             // 4 Room Members
  expenses: [],            // List of all room expenses
  settlements: [],         // List of all completed settlements
  unsubscribers: [],       // Firestore active snapshot listeners
  syncStatus: "connected", // 'connected' | 'syncing' | 'offline'
  activeView: "viewDashboard"
};

// =========================================================================
// UTILITY: EXACT PAISA ARITHMETIC (ZERO ROUNDING ERROR)
// =========================================================================
export const PaisaMath = {
  toPaisa(bdtValue) {
    const num = parseFloat(bdtValue);
    if (isNaN(num)) return 0;
    return Math.round(num * 100);
  },

  toBDT(paisa) {
    return (paisa / 100).toFixed(2);
  },

  formatBDT(paisa) {
    const bdt = (paisa / 100).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    return `৳${bdt}`;
  },

  splitFairly(totalPaisa, participantIds) {
    if (!participantIds || participantIds.length === 0) return {};
    const count = participantIds.length;
    const baseShare = Math.floor(totalPaisa / count);
    const remainder = totalPaisa - (baseShare * count);

    const shares = {};
    participantIds.forEach((uid, index) => {
      // Allocate the remaining single paisas one-by-one to the first few participants
      shares[uid] = baseShare + (index < remainder ? 1 : 0);
    });
    return shares;
  }
};

// =========================================================================
// TOAST NOTIFICATIONS & UI FEEDBACK
// =========================================================================
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === "success" ? "✓" : "⚠"}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function updateSyncIndicator(status, message = null) {
  state.syncStatus = status;
  const pill = document.getElementById("syncPill");
  const text = document.getElementById("syncText");
  if (!pill || !text) return;

  pill.className = `sync-pill ${status}`;
  text.textContent = message || (status === "connected" ? "Connected" : status === "syncing" ? "Syncing..." : "Offline");
}

// Monitor offline/online browser events
window.addEventListener("online", () => updateSyncIndicator("connected"));
window.addEventListener("offline", () => updateSyncIndicator("offline", "No Internet"));

// =========================================================================
// NAVIGATION & VIEW SWITCHER
// =========================================================================
function switchView(targetViewId) {
  state.activeView = targetViewId;
  const views = document.querySelectorAll(".app-view");
  views.forEach((v) => v.classList.add("hidden"));

  const activeElement = document.getElementById(targetViewId);
  if (activeElement) activeElement.classList.remove("hidden");

  // Update Bottom Nav active status
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("data-target") === targetViewId);
  });

  // Re-render specific view contents
  if (targetViewId === "viewExpenses") renderExpensesList();
  if (targetViewId === "viewSettlements") renderSettlementsView();
  if (targetViewId === "viewReports") renderReportsView();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Setup navigation listeners
document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.getAttribute("data-target");
    if (target) switchView(target);
  });
});

document.getElementById("viewAllBalancesBtn")?.addEventListener("click", () => switchView("viewReports"));
document.getElementById("viewMoreExpensesBtn")?.addEventListener("click", () => switchView("viewExpenses"));

// =========================================================================
// AUTHENTICATION & ROOM BOOTSTRAPPING
// =========================================================================
function initAuth() {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      state.currentUser = user;
      document.getElementById("authModal").classList.remove("active");
      showToast(`Signed in as ${user.email}`);
      await bootstrapRoomAndMembers(user);
      startRealtimeListeners();
    } else {
      state.currentUser = null;
      state.currentMember = null;
      stopRealtimeListeners();
      document.getElementById("authModal").classList.add("active");
    }
  });
}

// Handle Login Form
document.getElementById("loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  const submitBtn = document.getElementById("submitLoginBtn");

  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Authenticating...";
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showToast(err.message || "Failed to sign in", "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In to BRO SQUAD";
  }
});

// Handle Forgot Password
document.getElementById("forgotPasswordBtn")?.addEventListener("click", async () => {
  const email = prompt("Enter your account email to receive a password reset link:");
  if (!email) return;
  try {
    await sendPasswordResetEmail(auth, email.trim());
    showToast("Password reset link sent to your email!");
  } catch (err) {
    showToast(err.message, "error");
  }
});

// Sign Out
document.getElementById("logoutBtn")?.addEventListener("click", async () => {
  if (confirm("Are you sure you want to sign out?")) {
    await signOut(auth);
    showToast("Signed out successfully");
  }
});

// User Avatar Quick View
document.getElementById("userProfileBtn")?.addEventListener("click", () => switchView("viewSettings"));

// =========================================================================
// BOOTSTRAP ROOM & SQUAD MEMBERS
// =========================================================================
async function bootstrapRoomAndMembers(user) {
  const roomDocRef = doc(db, "rooms", ROOM_ID);
  const roomSnap = await getDoc(roomDocRef);

  // Initialize room if not yet created
  if (!roomSnap.exists()) {
    await setDoc(roomDocRef, {
      roomName: ROOM_NAME,
      currency: "BDT",
      adminUid: user.uid,
      createdAt: serverTimestamp()
    });
  }

  // Check Members subcollection
  const membersColRef = collection(db, "rooms", ROOM_ID, "members");
  const membersSnap = await getDocs(membersColRef);

  if (membersSnap.empty) {
    // Populate the 4 predefined members: Asaduzzaman, Abdullah, Md Milon, Md Monir
    const batch = writeBatch(db);
    INITIAL_MEMBERS.forEach((m, idx) => {
      // The first member who creates the room is matched to Asaduzzaman or their account
      const memberUid = idx === 0 ? user.uid : `member_${m.id}`;
      const mRef = doc(db, "rooms", ROOM_ID, "members", memberUid);
      batch.set(mRef, {
        uid: memberUid,
        name: m.name,
        role: m.role,
        email: idx === 0 ? user.email : `${m.id}@brosquad.local`,
        joinedAt: serverTimestamp()
      });
    });
    await batch.commit();
  }

  // Load existing members into local state
  const currentMembersSnap = await getDocs(membersColRef);
  state.members = [];
  currentMembersSnap.forEach((docSnap) => {
    state.members.push({ id: docSnap.id, ...docSnap.data() });
  });

  // Identify current member
  state.currentMember = state.members.find((m) => m.uid === user.uid) || {
    id: user.uid,
    name: user.email.split("@")[0],
    role: "member"
  };

  // Update Settings Email
  const emailField = document.getElementById("settingsEmailField");
  if (emailField) emailField.value = `${user.email} (${state.currentMember.name})`;

  // Update Avatar
  const avatarBtn = document.getElementById("userProfileBtn");
  if (avatarBtn) {
    const initials = state.currentMember.name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
    avatarBtn.textContent = initials;
  }

  populateExpenseModalMemberPickers();
}

// =========================================================================
// REAL-TIME FIRESTORE LISTENERS
// =========================================================================
function startRealtimeListeners() {
  stopRealtimeListeners();
  updateSyncIndicator("syncing");

  // 1. Members Listener
  const membersRef = collection(db, "rooms", ROOM_ID, "members");
  const unsubMembers = onSnapshot(membersRef, (snapshot) => {
    state.members = [];
    snapshot.forEach((d) => state.members.push({ id: d.id, ...d.data() }));
    populateExpenseModalMemberPickers();
    recalculateBalancesAndRender();
    updateSyncIndicator("connected");
  }, (err) => {
    console.error("Members sync error:", err);
    updateSyncIndicator("offline", "Sync Error");
  });
  state.unsubscribers.push(unsubMembers);

  // 2. Expenses Listener
  const expensesRef = collection(db, "rooms", ROOM_ID, "expenses");
  const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
    state.expenses = [];
    snapshot.forEach((d) => {
      const data = d.data();
      state.expenses.push({
        id: d.id,
        ...data,
        expenseDate: data.expenseDate?.toDate ? data.expenseDate.toDate() : new Date(data.expenseDate || Date.now())
      });
    });
    // Sort descending by date
    state.expenses.sort((a, b) => b.expenseDate - a.expenseDate);
    recalculateBalancesAndRender();
    updateSyncIndicator("connected");
  }, (err) => {
    console.error("Expenses sync error:", err);
    updateSyncIndicator("offline", "Sync Error");
  });
  state.unsubscribers.push(unsubExpenses);

  // 3. Settlements Listener
  const settlementsRef = collection(db, "rooms", ROOM_ID, "settlements");
  const unsubSettlements = onSnapshot(settlementsRef, (snapshot) => {
    state.settlements = [];
    snapshot.forEach((d) => {
      const data = d.data();
      state.settlements.push({
        id: d.id,
        ...data,
        completedAt: data.completedAt?.toDate ? data.completedAt.toDate() : new Date()
      });
    });
    recalculateBalancesAndRender();
    updateSyncIndicator("connected");
  }, (err) => {
    console.error("Settlements sync error:", err);
  });
  state.unsubscribers.push(unsubSettlements);
}

function stopRealtimeListeners() {
  state.unsubscribers.forEach((unsub) => {
    if (typeof unsub === "function") unsub();
  });
  state.unsubscribers = [];
}

// =========================================================================
// FINANCIAL CALCULATION ENGINE
// =========================================================================
function computeRoomFinancials() {
  // Map of Member ID -> financial metrics in Paisa
  const ledger = {};
  state.members.forEach((m) => {
    ledger[m.id] = {
      member: m,
      totalPaidPaisa: 0,
      totalConsumedPaisa: 0,
      settlementsPaidPaisa: 0,
      settlementsReceivedPaisa: 0,
      netBalancePaisa: 0,
      expenseCount: 0,
      participationCount: 0
    };
  });

  let roomTotalExpensesPaisa = 0;

  // Process all expenses
  state.expenses.forEach((exp) => {
    roomTotalExpensesPaisa += exp.amountPaisa;

    // Credit Payer
    if (ledger[exp.payerId]) {
      ledger[exp.payerId].totalPaidPaisa += exp.amountPaisa;
      ledger[exp.payerId].expenseCount += 1;
    }

    // Debit Participants
    if (exp.participantShares) {
      Object.entries(exp.participantShares).forEach(([uid, sharePaisa]) => {
        if (ledger[uid]) {
          ledger[uid].totalConsumedPaisa += sharePaisa;
          ledger[uid].participationCount += 1;
        }
      });
    }
  });

  // Process completed settlements
  let roomTotalSettledPaisa = 0;
  state.settlements.forEach((s) => {
    if (s.status === "completed") {
      roomTotalSettledPaisa += s.amountPaisa;
      if (ledger[s.fromMemberId]) ledger[s.fromMemberId].settlementsPaidPaisa += s.amountPaisa;
      if (ledger[s.toMemberId]) ledger[s.toMemberId].settlementsReceivedPaisa += s.amountPaisa;
    }
  });

  // Calculate Net Balances:
  // Net = (Total Paid - Total Consumed) + (Settlements Paid - Settlements Received)
  Object.values(ledger).forEach((acc) => {
    acc.netBalancePaisa = 
      (acc.totalPaidPaisa - acc.totalConsumedPaisa) + 
      (acc.settlementsPaidPaisa - acc.settlementsReceivedPaisa);
  });

  return {
    ledger,
    roomTotalExpensesPaisa,
    roomTotalSettledPaisa,
    expenseCount: state.expenses.length
  };
}

// Automatic Debt Minimization Algorithm (Greedy matching)
function calculateSettlementSuggestions(ledger) {
  const debtors = [];   // Net balance < 0 (needs to pay)
  const creditors = []; // Net balance > 0 (needs to receive)

  Object.values(ledger).forEach((acc) => {
    if (acc.netBalancePaisa < -1) {
      debtors.push({ member: acc.member, amountPaisa: Math.abs(acc.netBalancePaisa) });
    } else if (acc.netBalancePaisa > 1) {
      creditors.push({ member: acc.member, amountPaisa: acc.netBalancePaisa });
    }
  });

  // Sort descending by magnitude
  debtors.sort((a, b) => b.amountPaisa - a.amountPaisa);
  creditors.sort((a, b) => b.amountPaisa - a.amountPaisa);

  const suggestions = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const paymentAmount = Math.min(debtor.amountPaisa, creditor.amountPaisa);

    if (paymentAmount > 0) {
      suggestions.push({
        fromMember: debtor.member,
        toMember: creditor.member,
        amountPaisa: paymentAmount
      });
    }

    debtor.amountPaisa -= paymentAmount;
    creditor.amountPaisa -= paymentAmount;

    if (debtor.amountPaisa <= 1) dIdx++;
    if (creditor.amountPaisa <= 1) cIdx++;
  }

  return suggestions;
}

// =========================================================================
// UI RENDERERS
// =========================================================================
function recalculateBalancesAndRender() {
  const financials = computeRoomFinancials();

  // 1. Render Dashboard Hero
  const heroTotal = document.getElementById("heroTotalExpense");
  if (heroTotal) heroTotal.textContent = PaisaMath.toBDT(financials.roomTotalExpensesPaisa);

  const heroPaid = document.getElementById("heroTotalPaid");
  if (heroPaid) heroPaid.textContent = PaisaMath.formatBDT(financials.roomTotalExpensesPaisa);

  const heroSettled = document.getElementById("heroTotalSettled");
  if (heroSettled) heroSettled.textContent = PaisaMath.formatBDT(financials.roomTotalSettledPaisa);

  const heroCount = document.getElementById("heroExpenseCount");
  if (heroCount) heroCount.textContent = financials.expenseCount;

  // 2. Render Logged-in User's Personal Stance
  renderPersonalStance(financials.ledger);

  // 3. Render 4-Member Squad Grid
  renderSquadGrid(financials.ledger);

  // 4. Render Recent Transactions
  renderRecentTransactions();

  // 5. Update other views if open
  if (state.activeView === "viewExpenses") renderExpensesList();
  if (state.activeView === "viewSettlements") renderSettlementsView();
  if (state.activeView === "viewReports") renderReportsView();
}

function renderPersonalStance(ledger) {
  if (!state.currentMember) return;
  const myAcc = ledger[state.currentMember.id] || { netBalancePaisa: 0 };
  
  const nameEl = document.getElementById("myMemberName");
  if (nameEl) nameEl.textContent = state.currentMember.name;

  const badgeEl = document.getElementById("myNetBadge");
  if (!badgeEl) return;

  const net = myAcc.netBalancePaisa;
  if (net > 50) {
    badgeEl.className = "stance-badge badge-receive";
    badgeEl.textContent = `To Receive: ${PaisaMath.formatBDT(net)}`;
  } else if (net < -50) {
    badgeEl.className = "stance-badge badge-pay";
    badgeEl.textContent = `To Pay: ${PaisaMath.formatBDT(Math.abs(net))}`;
  } else {
    badgeEl.className = "stance-badge badge-settled";
    badgeEl.textContent = "Settled (৳0.00)";
  }
}

function renderSquadGrid(ledger) {
  const container = document.getElementById("membersGrid");
  if (!container) return;
  container.innerHTML = "";

  state.members.forEach((m) => {
    const acc = ledger[m.id] || {
      totalPaidPaisa: 0,
      totalConsumedPaisa: 0,
      netBalancePaisa: 0
    };

    const net = acc.netBalancePaisa;
    let statusClass = "badge-settled";
    let statusLabel = "Settled";
    let statusColor = "text-muted";

    if (net > 50) {
      statusClass = "badge-receive";
      statusLabel = `+${PaisaMath.formatBDT(net)}`;
      statusColor = "text-emerald";
    } else if (net < -50) {
      statusClass = "badge-pay";
      statusLabel = `-${PaisaMath.formatBDT(Math.abs(net))}`;
      statusColor = "text-rose";
    }

    const card = document.createElement("div");
    card.className = "member-card";
    card.innerHTML = `
      <div class="member-card-header">
        <div class="member-avatar-mini">${m.name[0]}</div>
        <div style="flex: 1; min-width: 0;">
          <div class="member-name">${m.name}</div>
          <span class="member-role-tag">${m.role || "Member"}</span>
        </div>
      </div>
      <div class="member-figures">
        <div class="row"><span>Paid:</span> <strong>${PaisaMath.formatBDT(acc.totalPaidPaisa)}</strong></div>
        <div class="row"><span>Consumed:</span> <strong>${PaisaMath.formatBDT(acc.totalConsumedPaisa)}</strong></div>
      </div>
      <div class="member-net-status">
        <span>Balance:</span>
        <span class="${statusColor}">${statusLabel}</span>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderRecentTransactions() {
  const container = document.getElementById("recentTransactionsList");
  if (!container) return;

  const recent = state.expenses.slice(0, 5);
  if (recent.length === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 24px;">No transactions recorded yet. Tap + to add the first expense.</div>`;
    return;
  }

  container.innerHTML = "";
  recent.forEach((exp) => container.appendChild(createTransactionElement(exp)));
}

function createTransactionElement(exp) {
  const payer = state.members.find((m) => m.id === exp.payerId) || { name: "Unknown" };
  const isMine = state.currentMember && exp.participantShares && exp.participantShares[state.currentMember.id];
  const mySharePaisa = isMine ? exp.participantShares[state.currentMember.id] : 0;

  const dateStr = exp.expenseDate instanceof Date 
    ? exp.expenseDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) 
    : "Recent";

  const item = document.createElement("div");
  item.className = "transaction-item";
  item.innerHTML = `
    <div class="tx-icon-box">🍽️</div>
    <div class="tx-main-details">
      <div class="tx-title">${exp.category}: ${exp.description || "Room Expense"}</div>
      <div class="tx-meta">
        <span>Paid by <strong>${payer.name}</strong></span>
        <span>•</span>
        <span>${dateStr}</span>
      </div>
    </div>
    <div class="tx-amount-col">
      <div class="tx-total-amount">${PaisaMath.formatBDT(exp.amountPaisa)}</div>
      ${isMine ? `<div class="tx-my-share">My share: ${PaisaMath.formatBDT(mySharePaisa)}</div>` : `<div class="tx-my-share">Not shared</div>`}
    </div>
  `;

  item.addEventListener("click", () => openEditExpenseModal(exp));
  return item;
}

// =========================================================================
// EXPENSES LIST VIEW & ADVANCED FILTERS
// =========================================================================
function renderExpensesList() {
  const container = document.getElementById("allTransactionsList");
  if (!container) return;

  const searchKeyword = (document.getElementById("expenseSearchInput")?.value || "").toLowerCase();
  const categoryFilter = document.getElementById("expenseFilterCategory")?.value || "ALL";
  const periodFilter = document.getElementById("expenseFilterPeriod")?.value || "THIS_MONTH";

  const now = new Date();
  const filtered = state.expenses.filter((exp) => {
    // Category Filter
    if (categoryFilter !== "ALL" && exp.category !== categoryFilter) return false;

    // Search Keyword
    if (searchKeyword) {
      const payer = state.members.find((m) => m.id === exp.payerId)?.name?.toLowerCase() || "";
      const desc = (exp.description || "").toLowerCase();
      const cat = exp.category.toLowerCase();
      if (!payer.includes(searchKeyword) && !desc.includes(searchKeyword) && !cat.includes(searchKeyword)) {
        return false;
      }
    }

    // Period Filter
    const d = exp.expenseDate;
    if (periodFilter === "TODAY") {
      return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (periodFilter === "LAST_7_DAYS") {
      const diffTime = Math.abs(now - d);
      return diffTime <= (7 * 24 * 60 * 60 * 1000);
    }
    if (periodFilter === "THIS_MONTH") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (periodFilter === "PREV_MONTH") {
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
    }
    return true;
  });

  const countLabel = document.getElementById("filteredCountLabel");
  if (countLabel) countLabel.textContent = `${filtered.length} entries`;

  container.innerHTML = "";
  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 32px;">No matching expenses found.</div>`;
    return;
  }

  filtered.forEach((exp) => container.appendChild(createTransactionElement(exp)));
}

document.getElementById("expenseSearchInput")?.addEventListener("input", renderExpensesList);
document.getElementById("expenseFilterCategory")?.addEventListener("change", renderExpensesList);
document.getElementById("expenseFilterPeriod")?.addEventListener("change", renderExpensesList);

// =========================================================================
// ADD / EDIT EXPENSE CONTROLLER
// =========================================================================
function populateExpenseModalMemberPickers() {
  const payerSelect = document.getElementById("expensePayer");
  const participantsBox = document.getElementById("participantsCheckboxes");
  if (!payerSelect || !participantsBox) return;

  // Payer options
  payerSelect.innerHTML = "";
  state.members.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name;
    if (state.currentMember && m.id === state.currentMember.id) opt.selected = true;
    payerSelect.appendChild(opt);
  });

  // Participant Checkboxes
  participantsBox.innerHTML = "";
  state.members.forEach((m) => {
    const label = document.createElement("label");
    label.className = "participant-checkbox-pill selected";
    label.innerHTML = `
      <input type="checkbox" value="${m.id}" checked>
      <span class="participant-pill-name">${m.name}</span>
    `;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      label.classList.toggle("selected", input.checked);
      updateSplitPreview();
    });
    participantsBox.appendChild(label);
  });

  updateSplitPreview();
}

function updateSplitPreview() {
  const amountVal = parseFloat(document.getElementById("expenseAmount")?.value || 0);
  const checkedPills = document.querySelectorAll("#participantsCheckboxes input:checked");
  const count = checkedPills.length;
  const preview = document.getElementById("splitPreviewText");

  if (!preview) return;
  if (amountVal > 0 && count > 0) {
    const each = (amountVal / count).toFixed(2);
    preview.textContent = `Estimated share: ৳${each} each (${count} selected)`;
  } else {
    preview.textContent = "Please select at least 1 participant.";
  }
}

document.getElementById("expenseAmount")?.addEventListener("input", updateSplitPreview);

document.getElementById("selectAllParticipantsBtn")?.addEventListener("click", () => {
  document.querySelectorAll("#participantsCheckboxes label").forEach((label) => {
    const input = label.querySelector("input");
    input.checked = true;
    label.classList.add("selected");
  });
  updateSplitPreview();
});

// Open Add Modal
function openAddExpenseModal() {
  document.getElementById("expenseModalTitle").textContent = "Add Expense";
  document.getElementById("editExpenseId").value = "";
  document.getElementById("expenseAmount").value = "";
  document.getElementById("expenseDesc").value = "";
  
  // Set current date/time in local format
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById("expenseDate").value = now.toISOString().slice(0, 16);

  // Set default payer to logged-in user
  if (state.currentMember) {
    document.getElementById("expensePayer").value = state.currentMember.id;
  }

  // Select all participants by default
  document.querySelectorAll("#participantsCheckboxes label").forEach((label) => {
    label.querySelector("input").checked = true;
    label.classList.add("selected");
  });
  updateSplitPreview();

  document.getElementById("expenseModal").classList.add("active");
}

// Open Edit Modal
function openEditExpenseModal(exp) {
  // Permission Check: only creator or Admin can edit
  const isAdmin = state.currentMember?.role === "admin";
  const isCreator = exp.createdBy === state.currentUser?.uid;
  if (!isAdmin && !isCreator) {
    alert("Permission Notice: Only the creator of this expense or Room Admin can edit or delete it.");
    return;
  }

  document.getElementById("expenseModalTitle").textContent = "Edit Expense";
  document.getElementById("editExpenseId").value = exp.id;
  document.getElementById("expenseAmount").value = PaisaMath.toBDT(exp.amountPaisa);
  document.getElementById("expenseCategory").value = exp.category;
  document.getElementById("expensePayer").value = exp.payerId;
  document.getElementById("expenseDesc").value = exp.description || "";

  const d = exp.expenseDate instanceof Date ? exp.expenseDate : new Date(exp.expenseDate);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  document.getElementById("expenseDate").value = d.toISOString().slice(0, 16);

  // Select participants
  const selectedIds = exp.participantIds || Object.keys(exp.participantShares || {});
  document.querySelectorAll("#participantsCheckboxes label").forEach((label) => {
    const input = label.querySelector("input");
    const isChecked = selectedIds.includes(input.value);
    input.checked = isChecked;
    label.classList.toggle("selected", isChecked);
  });

  updateSplitPreview();
  document.getElementById("expenseModal").classList.add("active");
}

document.getElementById("quickAddExpenseBtn")?.addEventListener("click", openAddExpenseModal);
document.getElementById("closeExpenseModalBtn")?.addEventListener("click", () => {
  document.getElementById("expenseModal").classList.remove("active");
});

// Submit Expense Form (Create or Edit)
document.getElementById("expenseForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const saveBtn = document.getElementById("saveExpenseBtn");
  const editId = document.getElementById("editExpenseId").value;
  const amountBdt = document.getElementById("expenseAmount").value;
  const category = document.getElementById("expenseCategory").value;
  const payerId = document.getElementById("expensePayer").value;
  const desc = document.getElementById("expenseDesc").value.trim();
  const dateVal = document.getElementById("expenseDate").value;

  const participantCheckboxes = document.querySelectorAll("#participantsCheckboxes input:checked");
  const participantIds = Array.from(participantCheckboxes).map((cb) => cb.value);

  if (participantIds.length === 0) {
    showToast("Select at least 1 participant!", "error");
    return;
  }

  const amountPaisa = PaisaMath.toPaisa(amountBdt);
  if (amountPaisa <= 0) {
    showToast("Please enter a valid amount!", "error");
    return;
  }

  // Fair integer paisa split
  const participantShares = PaisaMath.splitFairly(amountPaisa, participantIds);

  try {
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving to Cloud...";
    updateSyncIndicator("syncing");

    const expensePayload = {
      amountPaisa,
      category,
      payerId,
      participantIds,
      participantShares,
      description: desc,
      expenseDate: new Date(dateVal),
      updatedAt: serverTimestamp()
    };

    if (editId) {
      // Update
      const docRef = doc(db, "rooms", ROOM_ID, "expenses", editId);
      await updateDoc(docRef, expensePayload);
      showToast("Expense updated successfully!");
    } else {
      // Create New
      expensePayload.createdBy = state.currentUser?.uid;
      expensePayload.createdAt = serverTimestamp();
      const colRef = collection(db, "rooms", ROOM_ID, "expenses");
      await addDoc(colRef, expensePayload);
      showToast("Expense saved to cloud!");
    }

    document.getElementById("expenseModal").classList.remove("active");
  } catch (err) {
    console.error("Save expense error:", err);
    showToast(err.message || "Failed to save expense", "error");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Expense";
    updateSyncIndicator("connected");
  }
});

// =========================================================================
// SETTLEMENTS VIEW CONTROLLER
// =========================================================================
function renderSettlementsView() {
  const financials = computeRoomFinancials();
  const suggestions = calculateSettlementSuggestions(financials.ledger);

  const container = document.getElementById("settlementSuggestionsList");
  if (!container) return;
  container.innerHTML = "";

  if (suggestions.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; background: rgba(16, 185, 129, 0.1); border-radius: var(--border-radius-md); border: 1px solid rgba(16, 185, 129, 0.3);">
        <strong class="text-emerald">All Accounts Settled!</strong>
        <p class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">No one owes anything in BRO SQUAD right now.</p>
      </div>
    `;
  } else {
    suggestions.forEach((s) => {
      const card = document.createElement("div");
      card.className = "glass-panel";
      card.style.margin = "0";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--rose-400);">From: ${s.fromMember.name}</span>
          <span style="font-size: 0.85rem; font-weight: 700; color: var(--emerald-400);">To: ${s.toMember.name}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 1.3rem; font-weight: 800;">${PaisaMath.formatBDT(s.amountPaisa)}</span>
          <button class="btn-primary mark-paid-btn" style="width: auto; padding: 8px 16px; font-size: 0.82rem;">
            Mark as Paid
          </button>
        </div>
      `;

      card.querySelector(".mark-paid-btn").addEventListener("click", () => {
        recordCompletedSettlement(s.fromMember.id, s.toMember.id, s.amountPaisa);
      });

      container.appendChild(card);
    });
  }

  // Render completed settlement records
  renderCompletedSettlements();
}

async function recordCompletedSettlement(fromMemberId, toMemberId, amountPaisa) {
  const fromMember = state.members.find((m) => m.id === fromMemberId)?.name || "Debtor";
  const toMember = state.members.find((m) => m.id === toMemberId)?.name || "Creditor";

  if (!confirm(`Confirm that ${fromMember} has paid ${PaisaMath.formatBDT(amountPaisa)} to ${toMember}?`)) {
    return;
  }

  try {
    updateSyncIndicator("syncing");
    const colRef = collection(db, "rooms", ROOM_ID, "settlements");
    await addDoc(colRef, {
      fromMemberId,
      toMemberId,
      amountPaisa,
      status: "completed",
      confirmedBy: state.currentUser?.uid,
      completedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    });
    showToast("Settlement confirmed and balances updated!");
  } catch (err) {
    showToast(err.message || "Failed to record settlement", "error");
  } finally {
    updateSyncIndicator("connected");
  }
}

function renderCompletedSettlements() {
  const list = document.getElementById("settlementHistoryList");
  if (!list) return;

  if (state.settlements.length === 0) {
    list.innerHTML = `<div class="text-muted" style="text-align: center; padding: 20px;">No settlement history yet.</div>`;
    return;
  }

  list.innerHTML = "";
  state.settlements.forEach((s) => {
    const fromMember = state.members.find((m) => m.id === s.fromMemberId)?.name || "Member";
    const toMember = state.members.find((m) => m.id === s.toMemberId)?.name || "Member";
    const dateStr = s.completedAt instanceof Date ? s.completedAt.toLocaleDateString("en-GB") : "Done";

    const item = document.createElement("div");
    item.className = "transaction-item";
    item.innerHTML = `
      <div class="tx-icon-box" style="background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.3);">🤝</div>
      <div class="tx-main-details">
        <div class="tx-title">${fromMember} paid ${toMember}</div>
        <div class="tx-meta">Settled • ${dateStr}</div>
      </div>
      <div class="tx-amount-col">
        <div class="tx-total-amount text-emerald">${PaisaMath.formatBDT(s.amountPaisa)}</div>
      </div>
    `;
    list.appendChild(item);
  });
}

// =========================================================================
// REPORTS VIEW CONTROLLER
// =========================================================================
function renderReportsView() {
  const financials = computeRoomFinancials();
  const tableContainer = document.getElementById("reportsTableContainer");
  if (!tableContainer) return;

  let html = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
  `;

  state.members.forEach((m) => {
    const acc = financials.ledger[m.id];
    html += `
      <div style="background: rgba(16, 27, 50, 0.6); border: 1px solid var(--glass-border); border-radius: var(--border-radius-md); padding: 12px;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; margin-bottom: 6px;">
          <span>${m.name}</span>
          <span class="${acc.netBalancePaisa >= 0 ? "text-emerald" : "text-rose"}">
            ${acc.netBalancePaisa >= 0 ? "+" : ""}${PaisaMath.formatBDT(acc.netBalancePaisa)}
          </span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; font-size: 0.75rem; color: var(--text-muted);">
          <div>Total Paid: <strong>${PaisaMath.formatBDT(acc.totalPaidPaisa)}</strong></div>
          <div>Total Consumed: <strong>${PaisaMath.formatBDT(acc.totalConsumedPaisa)}</strong></div>
          <div>Expenses Paid: <strong>${acc.expenseCount}</strong></div>
          <div>Participations: <strong>${acc.participationCount}</strong></div>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  tableContainer.innerHTML = html;

  // Category Breakdown
  renderCategoryBreakdown();
}

function renderCategoryBreakdown() {
  const container = document.getElementById("categoryBreakdownContainer");
  if (!container) return;

  const categories = {};
  let totalPaisa = 0;

  state.expenses.forEach((exp) => {
    categories[exp.category] = (categories[exp.category] || 0) + exp.amountPaisa;
    totalPaisa += exp.amountPaisa;
  });

  if (totalPaisa === 0) {
    container.innerHTML = `<div class="text-muted" style="text-align: center; padding: 14px;">No expense data available.</div>`;
    return;
  }

  container.innerHTML = "";
  Object.entries(categories).forEach(([cat, amountPaisa]) => {
    const percentage = ((amountPaisa / totalPaisa) * 100).toFixed(1);
    const row = document.createElement("div");
    row.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
        <span>${cat}</span>
        <strong>${PaisaMath.formatBDT(amountPaisa)} (${percentage}%)</strong>
      </div>
      <div style="height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden;">
        <div style="width: ${percentage}%; height: 100%; background: linear-gradient(90deg, var(--emerald-400), var(--blue-400));"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// CSV Export
document.getElementById("exportCsvBtn")?.addEventListener("click", () => {
  if (state.expenses.length === 0) {
    showToast("No expenses to export!", "error");
    return;
  }

  const rows = [["Date", "Category", "Description", "Payer", "Amount_BDT", "Participants"]];
  state.expenses.forEach((e) => {
    const payer = state.members.find((m) => m.id === e.payerId)?.name || "Unknown";
    const dateStr = e.expenseDate instanceof Date ? e.expenseDate.toISOString().slice(0, 10) : "";
    const participants = (e.participantIds || []).map((id) => state.members.find(m => m.id === id)?.name || id).join("; ");

    rows.push([
      dateStr,
      `"${e.category}"`,
      `"${(e.description || '').replace(/"/g, '""')}"`,
      `"${payer}"`,
      PaisaMath.toBDT(e.amountPaisa),
      `"${participants}"`
    ]);
  });

  const csvContent = "data:text/csv;charset=utf-8," + rows.map((r) => r.join(",")).join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `BRO_SQUAD_Expenses_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("CSV file downloaded!");
});

// =========================================================================
// BACKUP & RESTORE CONTROLLER
// =========================================================================
document.getElementById("downloadBackupBtn")?.addEventListener("click", () => {
  const backupData = {
    room: { id: ROOM_ID, name: ROOM_NAME },
    members: state.members,
    expenses: state.expenses,
    settlements: state.settlements,
    exportedAt: new Date().toISOString(),
    version: "1.0.0"
  };

  const jsonBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(jsonBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `BRO_SQUAD_Backup_${new Date().toISOString().slice(0,10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Permanent JSON backup downloaded!");
});

// Restore Backup
document.getElementById("restoreBackupInput")?.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (!data.expenses || !Array.isArray(data.expenses)) {
        throw new Error("Invalid backup JSON format");
      }

      if (!confirm(`Restore ${data.expenses.length} expenses from backup? Existing entries will be preserved.`)) {
        return;
      }

      updateSyncIndicator("syncing");
      const batch = writeBatch(db);
      data.expenses.forEach((exp) => {
        const docRef = doc(db, "rooms", ROOM_ID, "expenses", exp.id || doc(collection(db, "dummy")).id);
        batch.set(docRef, {
          amountPaisa: exp.amountPaisa,
          category: exp.category,
          payerId: exp.payerId,
          participantIds: exp.participantIds,
          participantShares: exp.participantShares,
          description: exp.description || "",
          expenseDate: new Date(exp.expenseDate || Date.now()),
          restoredAt: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
      showToast("Backup restored successfully!");
    } catch (err) {
      showToast(err.message || "Failed to parse backup file", "error");
    } finally {
      updateSyncIndicator("connected");
      e.target.value = "";
    }
  };
  reader.readAsText(file);
});

// =========================================================================
// REGISTER PWA SERVICE WORKER
// =========================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then((reg) => console.log("BRO SQUAD Service Worker active:", reg.scope))
      .catch((err) => console.warn("Service Worker registration failed:", err));
  });
}

// Start Application
initAuth();
