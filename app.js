// Prime Shine CRM (no-install) - single-file JS (works via double-click file open)

// ---------- storage + models ----------
const STORAGE_KEY = "pscrm_v1";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function defaultState() {
  return {
    version: 1,
    updatedAt: nowIso(),
    settings: {
      businessName: "Prime shine auto detailing",
      addressLine1: "29 Hughson Drive",
      addressLine2: "Markham, Ontario L3R2T5",
      country: "Canada",
      phone: "",
      currency: "CAD",
      defaultTaxRate: 0.13,
      logoDataUrl: "",
    },
    counters: { invoiceNumber: 101 },
    clients: [],
    jobs: [],
    invoices: [],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  const next = { ...state, updatedAt: nowIso() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function exportState() {
  return JSON.stringify(loadState(), null, 2);
}

function importState(jsonText) {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid JSON");
  if (!("clients" in parsed) || !("jobs" in parsed) || !("invoices" in parsed)) {
    throw new Error("Backup missing required fields");
  }
  const merged = { ...defaultState(), ...parsed, updatedAt: nowIso() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

function createClient({ name, phone = "", email = "", notes = "" }) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) throw new Error("Client name is required");
  return {
    id: newId("cli"),
    name: trimmedName,
    phone: String(phone || "").trim(),
    email: String(email || "").trim(),
    notes: String(notes || "").trim(),
    createdAt: nowIso(),
  };
}

function createJob({ clientId, date, service, amountCents, notes = "" }) {
  if (!clientId) throw new Error("Client is required");
  if (!date) throw new Error("Date is required");
  const trimmedService = String(service || "").trim();
  if (!trimmedService) throw new Error("Service is required");
  const cents = Number(amountCents);
  if (!Number.isFinite(cents) || cents < 0) throw new Error("Amount must be 0 or more");
  return {
    id: newId("job"),
    clientId,
    date,
    service: trimmedService,
    amountCents: Math.round(cents),
    notes: String(notes || "").trim(),
    invoiceId: null,
    createdAt: nowIso(),
  };
}

function createInvoice({
  clientId,
  issueDate,
  taxRate,
  adjustmentCents = 0,
  lineItems,
  notes = "",
  payments = [],
}) {
  if (!clientId) throw new Error("Client is required");
  if (!issueDate) throw new Error("Issue date is required");
  const tr = Number(taxRate);
  if (!Number.isFinite(tr) || tr < 0) throw new Error("Tax rate must be 0 or more");
  if (!Array.isArray(lineItems) || lineItems.length === 0) throw new Error("Add at least one line item");
  return {
    id: newId("inv"),
    invoiceNumber: null,
    clientId,
    issueDate,
    taxRate: tr,
    adjustmentCents: Math.round(Number(adjustmentCents) || 0),
    lineItems: lineItems.map((li) => ({
      id: newId("li"),
      description: String(li.description || "").trim(),
      qty: Number(li.qty) || 1,
      unitPriceCents: Math.round(Number(li.unitPriceCents) || 0),
    })),
    notes: String(notes || "").trim(),
    payments: payments.map((p) => ({
      id: newId("pay"),
      date: p.date,
      amountCents: Math.round(Number(p.amountCents) || 0),
      method: String(p.method || "").trim(),
      receiptUrl: String(p.receiptUrl || "").trim(),
    })),
    status: "draft",
    createdAt: nowIso(),
  };
}

function assignNextInvoiceNumber(state, invoice) {
  const nextNo = state.counters.invoiceNumber || 1;
  const updatedState = {
    ...state,
    counters: { ...state.counters, invoiceNumber: nextNo + 1 },
  };
  return { updatedState, invoice: { ...invoice, invoiceNumber: nextNo } };
}

function sumCents(values) {
  return values.reduce((acc, v) => acc + (Number(v) || 0), 0);
}

function yyyyMmFromDate(dateStr) {
  return String(dateStr || "").slice(0, 7);
}

function moneyFromCents(cents, currency = "CAD") {
  const n = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------- invoice math + print template ----------
function computeInvoiceTotals(invoice) {
  const subCents = sumCents(
    invoice.lineItems.map((li) => Math.round((Number(li.qty) || 0) * (Number(li.unitPriceCents) || 0))),
  );
  const taxRate = Number(invoice.taxRate) || 0;
  const taxCents = Math.round(subCents * taxRate);
  const adjustmentCents = Math.round(Number(invoice.adjustmentCents) || 0);
  const totalCents = subCents + taxCents + adjustmentCents;
  return { subCents, taxCents, adjustmentCents, totalCents };
}

function safe(s) {
  return String(s ?? "");
}

function renderInvoicePrint({ invoice, client, settings }) {
  const currency = settings.currency || "CAD";
  const totals = computeInvoiceTotals(invoice);
  const taxPct = Math.round((Number(invoice.taxRate) || 0) * 10000) / 100;

  const logoHtml = settings.logoDataUrl
    ? `<img src="${settings.logoDataUrl}" alt="Logo" class="h-28 w-28 rounded-full object-cover ring-2 ring-slate-200" />`
    : `<div class="h-28 w-28 rounded-full bg-slate-900 text-slate-100 grid place-items-center font-black tracking-tight">LOGO</div>`;

  const liRows = invoice.lineItems
    .map((li) => {
      const qty = Number(li.qty) || 0;
      const unit = Number(li.unitPriceCents) || 0;
      return `
        <div class="flex items-start justify-between gap-4 py-3">
          <div class="min-w-0">
            <div class="font-medium text-slate-900">${safe(li.description) || "Item"}</div>
            <div class="text-sm text-slate-600">${qty} × ${moneyFromCents(unit, currency)}</div>
          </div>
          <div class="font-semibold text-slate-900 tabular-nums">${moneyFromCents(qty * unit, currency)}</div>
        </div>
      `;
    })
    .join("");

  const roundedLine =
    totals.adjustmentCents !== 0
      ? `
        <div class="flex items-center justify-between py-2">
          <div class="text-emerald-700">Rounded:</div>
          <div class="tabular-nums text-emerald-700">
            ${totals.adjustmentCents < 0 ? "(" : ""}${moneyFromCents(Math.abs(totals.adjustmentCents), currency)}${
            totals.adjustmentCents < 0 ? ")" : ""
          }
          </div>
        </div>
      `
      : "";

  const payments = Array.isArray(invoice.payments) ? invoice.payments : [];
  const payLines = payments
    .map((p) => {
      const date = safe(p.date);
      const method = safe(p.method || "payment");
      const receipt = safe(p.receiptUrl);
      return `
        <div class="flex items-start justify-between gap-4 py-2">
          <div class="text-slate-700">
            <div>${date} using</div>
            <div>${method}</div>
          </div>
          <div class="text-right">
            <div class="tabular-nums font-semibold">${moneyFromCents(p.amountCents, currency)}</div>
            ${receipt ? `<a class="text-sm text-blue-600 underline" href="${receipt}" target="_blank" rel="noreferrer">view receipt</a>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="print-sheet">
      <div class="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <div class="flex flex-col items-center text-center gap-3">
          ${logoHtml}
          <div class="mt-1 font-semibold text-xl text-slate-900">${safe(settings.businessName)}</div>
          <div class="text-slate-700 leading-relaxed">
            <div>${safe(settings.addressLine1)}</div>
            <div>${safe(settings.addressLine2)}</div>
            <div>${safe(settings.country)}</div>
            ${settings.phone ? `<div>${safe(settings.phone)}</div>` : ""}
          </div>
          <div class="mt-2 text-slate-900">
            <span class="font-medium">Invoice number:</span>
            <span class="tabular-nums">${safe(invoice.invoiceNumber ?? "")}</span>
          </div>
        </div>

        <div class="mt-8 grid gap-3">
          <div class="rounded-xl border border-slate-200 p-4">
            <div class="text-xs font-bold tracking-wide text-slate-500">BILL TO</div>
            <div class="mt-1 font-semibold text-slate-900">${safe(client?.name || "")}</div>
            <div class="mt-1 text-sm text-slate-700">
              ${client?.email ? `<div>${safe(client.email)}</div>` : ""}
              ${client?.phone ? `<div>${safe(client.phone)}</div>` : ""}
            </div>
            <div class="mt-3 text-sm text-slate-700">
              <span class="font-medium">Issue date:</span> <span class="tabular-nums">${safe(invoice.issueDate)}</span>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-4">
            <div class="flex items-center justify-between pb-2 border-b border-slate-200">
              <div class="text-sm font-bold tracking-wide text-slate-500">ITEMS</div>
              <div class="text-sm font-bold tracking-wide text-slate-500">AMOUNT</div>
            </div>

            ${liRows}

            <div class="mt-2 border-t border-slate-200 pt-3 space-y-2">
              <div class="flex items-center justify-between py-2">
                <div class="text-slate-700">Subtotal:</div>
                <div class="tabular-nums text-slate-900">${moneyFromCents(totals.subCents, currency)}</div>
              </div>
              ${roundedLine}
              <div class="flex items-center justify-between py-2">
                <div class="text-slate-700">Taxes ${taxPct}%:</div>
                <div class="tabular-nums text-slate-900">${moneyFromCents(totals.taxCents, currency)}</div>
              </div>
              <div class="flex items-center justify-between py-2 text-lg">
                <div class="font-bold text-slate-900">Total (${safe(currency)}):</div>
                <div class="font-extrabold tabular-nums text-slate-900">${moneyFromCents(
                  totals.totalCents,
                  currency,
                )}</div>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-slate-200 p-4">
            <div class="text-lg font-bold text-slate-900">Payments</div>
            <div class="mt-2 ${payments.length ? "" : "text-slate-600"}">
              ${payments.length ? payLines : "No payments recorded yet."}
            </div>
          </div>

          ${
            invoice.notes
              ? `<div class="rounded-xl border border-slate-200 p-4">
                  <div class="text-xs font-bold tracking-wide text-slate-500">NOTES</div>
                  <div class="mt-1 text-slate-700 whitespace-pre-wrap">${safe(invoice.notes)}</div>
                </div>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

// ---------- UI ----------
let state = loadState();
let currentRoute = "dashboard";

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

function setState(next) {
  state = saveState(next);
  render();
}

function byId(collection, id) {
  return collection.find((x) => x.id === id) || null;
}

function fmtPct(rate) {
  const pct = Math.round((Number(rate) || 0) * 10000) / 100;
  return `${pct}%`;
}

function centsFromMoneyInput(value) {
  const s = String(value ?? "").trim();
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

function moneyInputFromCents(cents) {
  return ((Number(cents) || 0) / 100).toFixed(2);
}

function sortByDateDesc(a, b) {
  return String(b.date || "").localeCompare(String(a.date || ""));
}

function setActiveNav(route) {
  document.querySelectorAll(".navlink").forEach((a) => {
    a.dataset.active = a.dataset.route === route ? "true" : "false";
  });
}

function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  $(viewId).classList.remove("hidden");
}

function routeFromHash() {
  const raw = (location.hash || "#/dashboard").replace(/^#\/?/, "");
  const [route, id] = raw.split("/");
  return { route: route || "dashboard", id: id || null };
}

function navTo(hash) {
  location.hash = hash;
}

function dashboardTotalsFor(yyyyMm) {
  const jobs = state.jobs.filter((j) => yyyyMmFromDate(j.date) === yyyyMm);
  const invoices = state.invoices.filter((inv) => yyyyMmFromDate(inv.issueDate) === yyyyMm);
  const jobRevenue = sumCents(jobs.map((j) => j.amountCents));
  const invoiceRevenue = sumCents(invoices.map((inv) => computeInvoiceTotals(inv).totalCents));
  return { jobRevenue, invoiceRevenue, jobsCount: jobs.length, invoicesCount: invoices.length };
}

function yearTotalsFor(year) {
  const invoices = state.invoices.filter((inv) => String(inv.issueDate || "").startsWith(`${year}-`));
  const invoiceRevenue = sumCents(invoices.map((inv) => computeInvoiceTotals(inv).totalCents));
  const jobs = state.jobs.filter((j) => String(j.date || "").startsWith(`${year}-`));
  const jobRevenue = sumCents(jobs.map((j) => j.amountCents));
  return { invoiceRevenue, invoicesCount: invoices.length, jobRevenue, jobsCount: jobs.length };
}

function renderDashboard() {
  const el = $("#view-dashboard");
  const today = new Date();
  const yyyyMm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const yyyy = String(today.getFullYear());
  const month = dashboardTotalsFor(yyyyMm);
  const year = yearTotalsFor(yyyy);
  const currency = state.settings.currency || "CAD";

  el.innerHTML = `
    <div class="grid gap-4">
      <div class="card p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div class="text-sm text-slate-300">This month</div>
            <div class="mt-1 text-2xl font-semibold tabular-nums">${moneyFromCents(month.jobRevenue, currency)}</div>
            <div class="mt-1 text-sm text-slate-400">
              Jobs total (no tax) • ${month.jobsCount} jobs
            </div>
            <div class="mt-1 text-sm text-slate-400">
              Invoices total (with tax) • ${month.invoicesCount} invoices • ${moneyFromCents(month.invoiceRevenue, currency)}
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-primary" id="quickAddJobBtn">Add job</button>
            <button class="btn btn-primary" id="quickAddInvoiceBtn">New invoice</button>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="card p-5">
          <div class="text-sm text-slate-300">This year</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums">${moneyFromCents(year.jobRevenue, currency)}</div>
          <div class="mt-1 text-sm text-slate-400">Jobs total (no tax) • ${year.jobsCount} jobs</div>
          <div class="mt-1 text-sm text-slate-400">
            Invoices total (with tax) • ${year.invoicesCount} invoices • ${moneyFromCents(year.invoiceRevenue, currency)}
          </div>
        </div>
        <div class="card p-5">
          <div class="text-sm text-slate-300">Clients</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums">${state.clients.length}</div>
          <div class="mt-1 text-sm text-slate-400">Stored on this device</div>
        </div>
      </div>

      <div class="card p-5">
        <div>
          <div class="text-sm text-slate-300">Clients documented</div>
          <div class="text-xs text-slate-400">List of all clients stored in this tracker.</div>
        </div>

        <div class="mt-4 overflow-x-auto">
          ${
            state.clients.length === 0
              ? `<div class="text-slate-300">No clients yet. Add your first client on the Clients page.</div>`
              : `
                  <table class="w-full min-w-[640px] text-sm">
                    <thead class="text-slate-400">
                      <tr class="border-b border-white/10">
                        <th class="py-2 text-left font-semibold">Name</th>
                        <th class="py-2 text-left font-semibold">Phone</th>
                        <th class="py-2 text-left font-semibold">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${state.clients
                        .slice()
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map(
                          (c) => `
                            <tr class="border-b border-white/5">
                              <td class="py-2 font-semibold">${c.name}</td>
                              <td class="py-2">${c.phone || "-"}</td>
                              <td class="py-2">${c.email || "-"}</td>
                            </tr>
                          `,
                        )
                        .join("")}
                    </tbody>
                  </table>
                `
          }
        </div>
      </div>
    </div>
  `;

  $("#quickAddJobBtn").onclick = () => navTo("#/jobs");
  $("#quickAddInvoiceBtn").onclick = () => navTo("#/invoices");
}

function renderClients() {
  const el = $("#view-clients");

  const rows =
    state.clients.length === 0
      ? `<div class="text-slate-300">No clients yet. Add your first client below.</div>`
      : `
        <div class="overflow-x-auto">
          <table class="w-full min-w-[680px] text-sm">
            <thead class="text-slate-400">
              <tr class="border-b border-white/10">
                <th class="py-2 text-left font-semibold">Name</th>
                <th class="py-2 text-left font-semibold">Phone</th>
                <th class="py-2 text-left font-semibold">Email</th>
                <th class="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${state.clients
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(
                  (c) => `
                    <tr class="border-b border-white/5">
                      <td class="py-2 font-semibold">${c.name}</td>
                      <td class="py-2">${c.phone || "-"}</td>
                      <td class="py-2">${c.email || "-"}</td>
                      <td class="py-2 text-right">
                        <button class="btn btn-secondary" data-edit-client="${c.id}">Edit</button>
                        <button class="btn btn-danger" data-del-client="${c.id}">Delete</button>
                      </td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;

  el.innerHTML = `
    <div class="grid gap-4">
      <div class="card p-5">
        <div>
          <div class="text-lg font-semibold">Clients</div>
          <div class="text-sm text-slate-400">Track name + contact details.</div>
        </div>
        <div class="mt-4">${rows}</div>
      </div>

      <div class="card p-5">
        <div class="text-lg font-semibold">Add client</div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Name</label>
            <input id="clientName" class="field" placeholder="Client name" />
          </div>
          <div>
            <label class="label">Phone</label>
            <input id="clientPhone" class="field" placeholder="647-000-0000" />
          </div>
          <div>
            <label class="label">Email</label>
            <input id="clientEmail" class="field" placeholder="name@email.com" />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Notes</label>
            <textarea id="clientNotes" class="field" rows="3" placeholder="Optional notes"></textarea>
          </div>
          <div class="sm:col-span-2 flex justify-end">
            <button id="addClientBtn" class="btn btn-primary">Add client</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#addClientBtn").onclick = () => {
    try {
      const client = createClient({
        name: $("#clientName").value,
        phone: $("#clientPhone").value,
        email: $("#clientEmail").value,
        notes: $("#clientNotes").value,
      });
      setState({ ...state, clients: [client, ...state.clients] });
      toast("Client added");
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  el.querySelectorAll("[data-del-client]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-del-client");
      const usedInJobs = state.jobs.some((j) => j.clientId === id);
      const usedInInvoices = state.invoices.some((inv) => inv.clientId === id);
      if (usedInJobs || usedInInvoices) {
        alert("This client is used in jobs/invoices. Delete those first.");
        return;
      }
      setState({ ...state, clients: state.clients.filter((c) => c.id !== id) });
      toast("Client deleted");
    };
  });

  el.querySelectorAll("[data-edit-client]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-edit-client");
      const c = byId(state.clients, id);
      if (!c) return;
      const name = prompt("Client name", c.name);
      if (name === null) return;
      const phone = prompt("Phone", c.phone || "");
      if (phone === null) return;
      const email = prompt("Email", c.email || "");
      if (email === null) return;
      const notes = prompt("Notes", c.notes || "");
      if (notes === null) return;

      const updated = { ...c, name: String(name).trim(), phone, email, notes };
      if (!updated.name) return alert("Name can't be empty");
      setState({ ...state, clients: state.clients.map((x) => (x.id === id ? updated : x)) });
      toast("Client updated");
    };
  });
}

function renderJobs() {
  const el = $("#view-jobs");
  const currency = state.settings.currency || "CAD";

  const hasClients = state.clients.length > 0;
  const clientOptions = hasClients
    ? state.clients
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `<option value="${c.id}">${c.name}</option>`)
        .join("")
    : `<option value="">Add a client first</option>`;

  const monthFilterDefault = new Date();
  const defaultMonth = `${monthFilterDefault.getFullYear()}-${String(monthFilterDefault.getMonth() + 1).padStart(
    2,
    "0",
  )}`;

  el.innerHTML = `
    <div class="grid gap-4">
      <div class="card p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div class="text-lg font-semibold">Jobs / Services</div>
            <div class="text-sm text-slate-400">Track each service and how much you charged.</div>
          </div>
          <div class="flex items-end gap-2">
            <div>
              <label class="label">Filter month</label>
              <input id="jobsMonth" type="month" class="field" value="${defaultMonth}" />
            </div>
            <button id="clearMonthFilter" class="btn btn-secondary">All</button>
          </div>
        </div>
        <div id="jobsTableWrap" class="mt-4"></div>
      </div>

      <div class="card p-5">
        <div class="flex items-baseline justify-between gap-4">
          <div>
            <div class="text-lg font-semibold">Add job</div>
            ${
              hasClients
                ? `<div class="text-sm text-slate-400">Link jobs to an invoice later (or auto-create).</div>`
                : `<div class="text-sm text-amber-200">Add a client first (Clients → Add client).</div>`
            }
          </div>
          ${hasClients ? "" : `<button class="btn btn-primary" id="goClientsBtn">Go to clients</button>`}
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Client</label>
            <select id="jobClientId" class="field" ${hasClients ? "" : "disabled"}>${clientOptions}</select>
          </div>
          <div>
            <label class="label">Date</label>
            <input id="jobDate" type="date" class="field" ${hasClients ? "" : "disabled"} />
          </div>
          <div>
            <label class="label">Amount (${currency})</label>
            <input id="jobAmount" type="number" step="0.01" class="field" placeholder="204.94" ${
              hasClients ? "" : "disabled"
            } />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Service</label>
            <input id="jobService" class="field" placeholder="Full in & out detail" ${hasClients ? "" : "disabled"} />
          </div>
          <div class="sm:col-span-2">
            <label class="label">Notes</label>
            <textarea id="jobNotes" class="field" rows="3" placeholder="Optional notes" ${
              hasClients ? "" : "disabled"
            }></textarea>
          </div>
          <div class="sm:col-span-2 flex justify-end">
            <button id="addJobBtn" class="btn btn-primary" ${hasClients ? "" : "disabled"}>Add job</button>
          </div>
        </div>
      </div>
    </div>
  `;

  if (!hasClients) {
    const go = $("#goClientsBtn");
    if (go) go.onclick = () => navTo("#/clients");
  }

  function renderTable(monthFilter) {
    const jobs = state.jobs
      .slice()
      .sort(sortByDateDesc)
      .filter((j) => (monthFilter ? yyyyMmFromDate(j.date) === monthFilter : true));

    const total = sumCents(jobs.map((j) => j.amountCents));

    const table =
      jobs.length === 0
        ? `<div class="text-slate-300">No jobs found for this filter.</div>`
        : `
          <div class="overflow-x-auto">
            <table class="w-full min-w-[820px] text-sm">
              <thead class="text-slate-400">
                <tr class="border-b border-white/10">
                  <th class="py-2 text-left font-semibold">Date</th>
                  <th class="py-2 text-left font-semibold">Client</th>
                  <th class="py-2 text-left font-semibold">Service</th>
                  <th class="py-2 text-right font-semibold">Amount</th>
                  <th class="py-2 text-left font-semibold">Invoice</th>
                  <th class="py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${jobs
                  .map((j) => {
                    const client = byId(state.clients, j.clientId);
                    const inv = j.invoiceId ? byId(state.invoices, j.invoiceId) : null;
                    const invoiceCell = inv
                      ? `<button class="btn btn-secondary" data-open-inv="${inv.id}">#${inv.invoiceNumber}</button>`
                      : `<button class="btn btn-secondary" data-make-inv="${j.id}">Create</button>`;
                    return `
                      <tr class="border-b border-white/5">
                        <td class="py-2 tabular-nums">${j.date}</td>
                        <td class="py-2 font-semibold">${client?.name || "Unknown"}</td>
                        <td class="py-2">${j.service}</td>
                        <td class="py-2 text-right tabular-nums font-semibold">${moneyFromCents(
                          j.amountCents,
                          currency,
                        )}</td>
                        <td class="py-2">${invoiceCell}</td>
                        <td class="py-2 text-right">
                          <button class="btn btn-secondary" data-edit-job="${j.id}">Edit</button>
                          <button class="btn btn-danger" data-del-job="${j.id}">Delete</button>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        `;

    $("#jobsTableWrap").innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="text-sm text-slate-300">${jobs.length} job(s)</div>
        <div class="text-sm text-slate-300">
          Total: <span class="font-semibold tabular-nums">${moneyFromCents(total, currency)}</span>
        </div>
      </div>
      <div class="mt-3">${table}</div>
    `;

    $("#jobsTableWrap").querySelectorAll("[data-del-job]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-del-job");
        const j = byId(state.jobs, id);
        if (!j) return;
        if (j.invoiceId) {
          alert("This job is attached to an invoice. Remove it from the invoice first.");
          return;
        }
        setState({ ...state, jobs: state.jobs.filter((x) => x.id !== id) });
        toast("Job deleted");
      };
    });

    $("#jobsTableWrap").querySelectorAll("[data-edit-job]").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.getAttribute("data-edit-job");
        const j = byId(state.jobs, id);
        if (!j) return;
        if (j.invoiceId) {
          alert("This job is attached to an invoice. Edit from the invoice instead.");
          return;
        }
        const service = prompt("Service", j.service);
        if (service === null) return;
        const amount = prompt(`Amount (${currency})`, moneyInputFromCents(j.amountCents));
        if (amount === null) return;
        const cents = centsFromMoneyInput(amount);
        if (!Number.isFinite(cents) || cents < 0) return alert("Invalid amount");
        const updated = { ...j, service: String(service).trim() || j.service, amountCents: cents };
        setState({ ...state, jobs: state.jobs.map((x) => (x.id === id ? updated : x)) });
        toast("Job updated");
      };
    });

    $("#jobsTableWrap").querySelectorAll("[data-open-inv]").forEach((btn) => {
      btn.onclick = () => navTo(`#/invoices/${btn.getAttribute("data-open-inv")}`);
    });

    $("#jobsTableWrap").querySelectorAll("[data-make-inv]").forEach((btn) => {
      btn.onclick = () => startInvoiceFromJob(btn.getAttribute("data-make-inv"));
    });
  }

  const monthInput = $("#jobsMonth");
  renderTable(monthInput.value);
  monthInput.onchange = () => renderTable(monthInput.value);
  $("#clearMonthFilter").onclick = () => {
    monthInput.value = "";
    renderTable("");
  };

  $("#addJobBtn").onclick = () => {
    try {
      const amountCents = centsFromMoneyInput($("#jobAmount").value);
      if (!Number.isFinite(amountCents)) throw new Error("Amount is required");
      const job = createJob({
        clientId: $("#jobClientId").value,
        date: $("#jobDate").value,
        service: $("#jobService").value,
        amountCents,
        notes: $("#jobNotes").value,
      });
      setState({ ...state, jobs: [job, ...state.jobs] });
      toast("Job added");
    } catch (e) {
      alert(e.message || String(e));
    }
  };
}

function startInvoiceFromJob(jobId) {
  const job = byId(state.jobs, jobId);
  if (!job) return;
  const client = byId(state.clients, job.clientId);
  if (!client) return alert("Client not found");
  const issueDate = job.date || new Date().toISOString().slice(0, 10);
  const inv = createInvoice({
    clientId: job.clientId,
    issueDate,
    taxRate: state.settings.defaultTaxRate ?? 0.13,
    adjustmentCents: 0,
    lineItems: [{ description: job.service, qty: 1, unitPriceCents: job.amountCents }],
    notes: "",
    payments: [],
  });

  const { updatedState, invoice } = assignNextInvoiceNumber(state, inv);
  const next = {
    ...updatedState,
    invoices: [invoice, ...state.invoices],
    jobs: state.jobs.map((j) => (j.id === jobId ? { ...j, invoiceId: invoice.id } : j)),
  };
  setState(next);
  toast(`Invoice #${invoice.invoiceNumber} created`);
  navTo(`#/invoices/${invoice.id}`);
}

function renderInvoices(routeId) {
  const el = $("#view-invoices");
  const currency = state.settings.currency || "CAD";
  const hasClients = state.clients.length > 0;

  const list = state.invoices
    .slice()
    .sort((a, b) => String(b.issueDate || "").localeCompare(String(a.issueDate || "")))
    .map((inv) => {
      const client = byId(state.clients, inv.clientId);
      const totals = computeInvoiceTotals(inv);
      return `
        <tr class="border-b border-white/5">
          <td class="py-2 tabular-nums font-semibold">#${inv.invoiceNumber ?? ""}</td>
          <td class="py-2 tabular-nums">${inv.issueDate}</td>
          <td class="py-2">${client?.name || "Unknown"}</td>
          <td class="py-2 text-right tabular-nums font-semibold">${moneyFromCents(totals.totalCents, currency)}</td>
          <td class="py-2 text-right">
            <button class="btn btn-secondary" data-open-inv="${inv.id}">Open</button>
            <button class="btn btn-secondary" data-print-inv="${inv.id}">Print</button>
            <button class="btn btn-danger" data-del-inv="${inv.id}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");

  el.innerHTML = `
    <div class="grid gap-4">
      <div class="card p-5">
        <div class="flex items-baseline justify-between gap-4">
          <div>
            <div class="text-lg font-semibold">Invoices</div>
            <div class="text-sm text-slate-400">Create and print invoices as PDF.</div>
          </div>
          <button id="newInvoiceBtn" class="btn btn-primary">New invoice</button>
        </div>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[760px] text-sm">
            <thead class="text-slate-400">
              <tr class="border-b border-white/10">
                <th class="py-2 text-left font-semibold">Invoice</th>
                <th class="py-2 text-left font-semibold">Date</th>
                <th class="py-2 text-left font-semibold">Client</th>
                <th class="py-2 text-right font-semibold">Total</th>
                <th class="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${list || `<tr><td class="py-3 text-slate-300" colspan="5">No invoices yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-5">
        ${
          hasClients
            ? `<div id="invoiceFormWrap"></div>`
            : `
              <div class="text-lg font-semibold">Create invoice</div>
              <div class="mt-2 text-amber-200">Add a client first (Clients → Add client).</div>
              <div class="mt-4">
                <button id="goClientsFromInv" class="btn btn-primary">Go to clients</button>
              </div>
            `
        }
      </div>
    </div>
  `;

  // Wire list actions
  el.querySelectorAll("[data-open-inv]").forEach((btn) => (btn.onclick = () => navTo(`#/invoices/${btn.getAttribute("data-open-inv")}`)));
  el.querySelectorAll("[data-print-inv]").forEach((btn) => (btn.onclick = () => openPrint(btn.getAttribute("data-print-inv"))));
  el.querySelectorAll("[data-del-inv]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-del-inv");
      const inv = byId(state.invoices, id);
      if (!inv) return;
      const ok = confirm(`Delete invoice #${inv.invoiceNumber}? This can't be undone.`);
      if (!ok) return;
      const next = {
        ...state,
        invoices: state.invoices.filter((x) => x.id !== id),
        jobs: state.jobs.map((j) => (j.invoiceId === id ? { ...j, invoiceId: null } : j)),
      };
      setState(next);
      toast("Invoice deleted");
      navTo("#/invoices");
    };
  });

  $("#newInvoiceBtn").onclick = () => navTo("#/invoices");

  if (!hasClients) {
    const go = $("#goClientsFromInv");
    if (go) go.onclick = () => navTo("#/clients");
    return;
  }

  const formWrap = $("#invoiceFormWrap");
  const selectedInvoice = routeId ? byId(state.invoices, routeId) : null;

  const clientOptions = state.clients
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${c.id}">${c.name}</option>`)
    .join("");

  formWrap.innerHTML = `
    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div class="text-lg font-semibold">${selectedInvoice ? `Edit invoice #${selectedInvoice.invoiceNumber}` : "Create invoice"}</div>
        <div class="text-sm text-slate-400">Matches the layout from your receipt screenshots.</div>
      </div>
      ${
        selectedInvoice
          ? `<div class="flex gap-2">
              <button id="printSelectedBtn" class="btn btn-secondary">Print</button>
            </div>`
          : ""
      }
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
      <div class="sm:col-span-2">
        <label class="label">Client</label>
        <select id="invClientId" class="field">${clientOptions}</select>
      </div>
      <div>
        <label class="label">Issue date</label>
        <input id="invIssueDate" type="date" class="field" />
      </div>
      <div>
        <label class="label">Tax rate</label>
        <input id="invTaxRate" type="number" step="0.01" class="field" placeholder="0.13" />
        <div class="mt-1 text-xs text-slate-400">Example: 0.13 = 13%</div>
      </div>

      <div class="sm:col-span-2 mt-2">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-200">Line items</div>
          <button id="addLineBtn" class="btn btn-secondary">Add line</button>
        </div>
        <div id="lineItemsWrap" class="mt-3 grid gap-2"></div>
      </div>

      <div>
        <label class="label">Adjustment (Rounded) (${currency})</label>
        <input id="invAdjust" type="number" step="0.01" class="field" placeholder="-0.64" />
        <div class="mt-1 text-xs text-slate-400">Optional: negative reduces total (like your “Rounded” line).</div>
      </div>
      <div>
        <label class="label">Totals</label>
        <div id="invTotals" class="rounded-xl border border-white/10 bg-white/5 p-3 text-sm"></div>
      </div>

      <div class="sm:col-span-2">
        <label class="label">Notes (optional)</label>
        <textarea id="invNotes" rows="3" class="field" placeholder="Thank you for your business."></textarea>
      </div>

      <div class="sm:col-span-2 mt-2">
        <div class="text-sm font-semibold text-slate-200">Payment</div>
        <div class="mt-3 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Method</label>
            <input id="payMethod" class="field" placeholder="bank payment, cash, cheque" />
            <div class="mt-1 text-xs text-slate-400">
              Required for receipts. Total paid = full invoice amount on the issue date.
            </div>
          </div>
        </div>
      </div>

      <div class="sm:col-span-2 flex flex-wrap justify-end gap-2">
        <button id="saveInvoiceBtn" class="btn btn-primary">${selectedInvoice ? "Save changes" : "Create invoice"}</button>
        ${selectedInvoice ? `<button id="duplicateInvoiceBtn" class="btn btn-secondary">Duplicate</button>` : ""}
      </div>
    </div>
  `;

  let draft = selectedInvoice
    ? JSON.parse(JSON.stringify(selectedInvoice))
    : createInvoice({
        clientId: state.clients[0].id,
        issueDate: new Date().toISOString().slice(0, 10),
        taxRate: state.settings.defaultTaxRate ?? 0.13,
        adjustmentCents: 0,
        lineItems: [{ description: "Full in & out detail", qty: 1, unitPriceCents: 0 }],
        notes: "",
        payments: [],
      });

  const invClientId = $("#invClientId");
  const invIssueDate = $("#invIssueDate");
  const invTaxRate = $("#invTaxRate");
  const invAdjust = $("#invAdjust");
  const invNotes = $("#invNotes");

  invClientId.value = draft.clientId;
  invIssueDate.value = draft.issueDate;
  invTaxRate.value = String(draft.taxRate ?? 0.13);
  invAdjust.value = moneyInputFromCents(draft.adjustmentCents || 0);
  invNotes.value = draft.notes || "";

  const pay = (draft.payments && draft.payments[0]) || null;
  // Default to "bank payment" for new invoices to speed up entry,
  // but keep whatever was previously saved when editing.
  $("#payMethod").value = pay?.method || "bank payment";

  function updateTotals() {
    const totals = computeInvoiceTotals(draft);
    $("#invTotals").innerHTML = `
      <div class="flex items-center justify-between">
        <div class="text-slate-300">Subtotal</div>
        <div class="tabular-nums font-semibold">${moneyFromCents(totals.subCents, currency)}</div>
      </div>
      <div class="mt-1 flex items-center justify-between">
        <div class="text-slate-300">Rounded</div>
        <div class="tabular-nums font-semibold">${moneyFromCents(totals.adjustmentCents, currency)}</div>
      </div>
      <div class="mt-1 flex items-center justify-between">
        <div class="text-slate-300">Tax (${fmtPct(draft.taxRate)})</div>
        <div class="tabular-nums font-semibold">${moneyFromCents(totals.taxCents, currency)}</div>
      </div>
      <div class="mt-2 flex items-center justify-between text-base">
        <div class="font-bold text-slate-100">Total</div>
        <div class="tabular-nums font-extrabold">${moneyFromCents(totals.totalCents, currency)}</div>
      </div>
    `;
  }

  function renderLines() {
    const wrap = $("#lineItemsWrap");
    wrap.innerHTML = draft.lineItems
      .map((li, idx) => {
        const desc = String(li.description || "").replaceAll('"', "&quot;");
        return `
          <div class="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[1fr_110px_160px_84px] sm:items-end">
            <div>
              <label class="label">Description</label>
              <input class="field" data-li-desc="${idx}" value="${desc}" />
            </div>
            <div>
              <label class="label">Qty</label>
              <input class="field" type="number" step="1" min="0" data-li-qty="${idx}" value="${li.qty ?? 1}" />
            </div>
            <div>
              <label class="label">Unit price (${currency})</label>
              <input class="field" type="number" step="0.01" min="0" data-li-unit="${idx}" value="${moneyInputFromCents(
                li.unitPriceCents,
              )}" />
            </div>
            <div class="flex justify-end">
              <button class="btn btn-danger" data-li-del="${idx}">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    wrap.querySelectorAll("[data-li-desc]").forEach((inp) => {
      inp.oninput = () => {
        const idx = Number(inp.getAttribute("data-li-desc"));
        draft.lineItems[idx].description = inp.value;
      };
    });
    wrap.querySelectorAll("[data-li-qty]").forEach((inp) => {
      inp.oninput = () => {
        const idx = Number(inp.getAttribute("data-li-qty"));
        draft.lineItems[idx].qty = Number(inp.value) || 0;
        updateTotals();
      };
    });
    wrap.querySelectorAll("[data-li-unit]").forEach((inp) => {
      inp.oninput = () => {
        const idx = Number(inp.getAttribute("data-li-unit"));
        const cents = centsFromMoneyInput(inp.value);
        draft.lineItems[idx].unitPriceCents = Number.isFinite(cents) ? cents : 0;
        updateTotals();
      };
    });
    wrap.querySelectorAll("[data-li-del]").forEach((btn) => {
      btn.onclick = () => {
        const idx = Number(btn.getAttribute("data-li-del"));
        if (draft.lineItems.length === 1) return alert("Invoice needs at least 1 line item.");
        draft.lineItems.splice(idx, 1);
        renderLines();
        updateTotals();
      };
    });
  }

  renderLines();
  updateTotals();

  $("#addLineBtn").onclick = () => {
    draft.lineItems.push({ description: "Service", qty: 1, unitPriceCents: 0 });
    renderLines();
    updateTotals();
  };

  invClientId.onchange = () => (draft.clientId = invClientId.value);
  invIssueDate.onchange = () => (draft.issueDate = invIssueDate.value);
  invTaxRate.oninput = () => {
    const n = Number(invTaxRate.value);
    draft.taxRate = Number.isFinite(n) ? n : draft.taxRate;
    updateTotals();
  };
  invAdjust.oninput = () => {
    const cents = centsFromMoneyInput(invAdjust.value);
    draft.adjustmentCents = Number.isFinite(cents) ? cents : 0;
    updateTotals();
  };
  invNotes.oninput = () => (draft.notes = invNotes.value);

  function readPaymentIntoDraft() {
    const payMethod = $("#payMethod").value;
    const hasAny = payMethod && payMethod.trim() !== "";
    if (!hasAny) {
      throw new Error("Payment method is required (bank payment, cash, cheque, etc.).");
    }
    // Auto-fill receipt from invoice details:
    // - Date = invoice issue date
    // - Amount = full invoice total
    const totals = computeInvoiceTotals(draft);
    draft.payments = [
      {
        date: draft.issueDate,
        method: payMethod.trim() || "payment",
        amountCents: totals.totalCents,
        receiptUrl: "",
      },
    ];
  }

  $("#saveInvoiceBtn").onclick = () => {
    try {
      readPaymentIntoDraft();
      if (!draft.clientId) throw new Error("Select a client");
      if (!draft.issueDate) throw new Error("Issue date is required");
      if (!draft.lineItems.some((li) => String(li.description || "").trim())) {
        throw new Error("Add descriptions to line items");
      }

      if (!selectedInvoice) {
        const { updatedState, invoice } = assignNextInvoiceNumber(state, draft);
        setState({ ...updatedState, invoices: [invoice, ...state.invoices] });
        toast(`Invoice #${invoice.invoiceNumber} created`);
        navTo(`#/invoices/${invoice.id}`);
      } else {
        setState({ ...state, invoices: state.invoices.map((x) => (x.id === selectedInvoice.id ? { ...draft } : x)) });
        toast("Invoice saved");
        navTo(`#/invoices/${selectedInvoice.id}`);
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  };

  if (selectedInvoice) {
    $("#printSelectedBtn").onclick = () => openPrint(selectedInvoice.id);
    $("#duplicateInvoiceBtn").onclick = () => {
      const dup = JSON.parse(JSON.stringify(selectedInvoice));
      dup.id = newId("inv");
      dup.invoiceNumber = null;
      dup.createdAt = nowIso();
      dup.lineItems = (dup.lineItems || []).map((li) => ({ ...li, id: newId("li") }));
      dup.payments = (dup.payments || []).map((p) => ({ ...p, id: newId("pay") }));
      const { updatedState, invoice } = assignNextInvoiceNumber(state, dup);
      setState({ ...updatedState, invoices: [invoice, ...state.invoices] });
      toast(`Invoice duplicated (#${invoice.invoiceNumber})`);
      navTo(`#/invoices/${invoice.id}`);
    };
  }
}

function renderSettings() {
  const el = $("#view-settings");
  const s = state.settings;

  el.innerHTML = `
    <div class="grid gap-4">
      <div class="card p-5">
        <div class="text-lg font-semibold">Settings</div>
        <div class="text-sm text-slate-400">Used on your invoices.</div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Business name</label>
            <input id="bizName" class="field" value="${String(s.businessName || "").replaceAll('"', "&quot;")}" />
          </div>
          <div>
            <label class="label">Address line 1</label>
            <input id="addr1" class="field" value="${String(s.addressLine1 || "").replaceAll('"', "&quot;")}" />
          </div>
          <div>
            <label class="label">Address line 2</label>
            <input id="addr2" class="field" value="${String(s.addressLine2 || "").replaceAll('"', "&quot;")}" />
          </div>
          <div>
            <label class="label">Country</label>
            <input id="country" class="field" value="${String(s.country || "").replaceAll('"', "&quot;")}" />
          </div>
          <div>
            <label class="label">Phone</label>
            <input id="phone" class="field" value="${String(s.phone || "").replaceAll('"', "&quot;")}" placeholder="647-000-0000" />
          </div>
          <div>
            <label class="label">Currency</label>
            <input id="currency" class="field" value="${String(s.currency || "CAD").replaceAll('"', "&quot;")}" />
          </div>
          <div>
            <label class="label">Default tax rate</label>
            <input id="taxRate" class="field" type="number" step="0.01" value="${String(s.defaultTaxRate ?? 0.13)}" />
            <div class="mt-1 text-xs text-slate-400">Example: 0.13 = 13%</div>
          </div>

          <div class="sm:col-span-2">
            <label class="label">Logo (optional)</label>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-white/10 bg-white/5 p-3">
              <div class="flex items-center gap-3">
                ${
                  s.logoDataUrl
                    ? `<img src="${s.logoDataUrl}" class="h-16 w-16 rounded-full object-cover ring-2 ring-white/10" />`
                    : `<div class="h-16 w-16 rounded-full bg-slate-900 grid place-items-center font-black">LOGO</div>`
                }
                <div class="text-sm text-slate-300">Upload a square logo for invoices.</div>
              </div>
              <div class="flex gap-2">
                <label class="btn btn-secondary cursor-pointer">
                  Upload
                  <input id="logoFile" type="file" accept="image/*" class="hidden" />
                </label>
                <button id="clearLogo" class="btn btn-danger">Clear</button>
              </div>
            </div>
          </div>

          <div class="sm:col-span-2 flex flex-wrap justify-end gap-2">
            <button id="saveSettingsBtn" class="btn btn-primary">Save settings</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("#saveSettingsBtn").onclick = () => {
    const next = {
      ...state,
      settings: {
        ...state.settings,
        businessName: $("#bizName").value,
        addressLine1: $("#addr1").value,
        addressLine2: $("#addr2").value,
        country: $("#country").value,
        phone: $("#phone").value,
        currency: $("#currency").value || "CAD",
        defaultTaxRate: Number($("#taxRate").value) || 0,
      },
    };
    setState(next);
    toast("Settings saved");
  };

  $("#clearLogo").onclick = () => {
    setState({ ...state, settings: { ...state.settings, logoDataUrl: "" } });
    toast("Logo cleared");
  };

  const logoFile = $("#logoFile");
  logoFile.onchange = async () => {
    const file = logoFile.files && logoFile.files[0];
    if (!file) return;
    if (file.size > 1_500_000) {
      alert("Logo file is too large. Please use an image under ~1.5MB.");
      logoFile.value = "";
      return;
    }
    const dataUrl = await readFileAsDataUrl(file);
    setState({ ...state, settings: { ...state.settings, logoDataUrl: dataUrl } });
    toast("Logo uploaded");
  };
}

function renderInvoicePrintView(invoiceId) {
  const el = $("#view-invoice-print");
  const inv = byId(state.invoices, invoiceId);
  if (!inv) {
    el.innerHTML = `<div class="card p-5">Invoice not found.</div>`;
    return;
  }
  const client = byId(state.clients, inv.clientId);
  el.innerHTML = renderInvoicePrint({ invoice: inv, client, settings: state.settings });
}

function renderReceipts() {
  const el = $("#view-receipts");
  const currency = state.settings.currency || "CAD";

  // Collect all payments from all invoices = receipts
  const receipts = [];
  state.invoices.forEach((inv) => {
    (inv.payments || []).forEach((p) => {
      receipts.push({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientId: inv.clientId,
        client: byId(state.clients, inv.clientId),
        date: p.date,
        method: p.method || "payment",
        amountCents: p.amountCents,
        receiptUrl: p.receiptUrl,
      });
    });
  });

  el.innerHTML = `
    <div class="grid gap-4">
      <div class="card p-5">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div class="text-lg font-semibold">Receipts</div>
            <div class="text-sm text-slate-400">
              Shows payments recorded on your invoices (bank payment, cash, cheque, etc).
            </div>
          </div>
          <div class="flex items-end gap-2">
            <div>
              <label class="label">Filter month</label>
              <input id="receiptsMonth" type="month" class="field" />
            </div>
            <button id="clearReceiptsFilter" class="btn btn-secondary">All</button>
            <button id="printReceiptsBtn" class="btn btn-secondary">Print / export</button>
          </div>
        </div>

        <div class="mt-4 overflow-x-auto">
          <table class="w-full min-w-[760px] text-sm">
            <thead class="text-slate-400">
              <tr class="border-b border-white/10">
                <th class="py-2 text-left font-semibold">Date</th>
                <th class="py-2 text-left font-semibold">Client</th>
                <th class="py-2 text-left font-semibold">Method</th>
                <th class="py-2 text-right font-semibold">Amount</th>
                <th class="py-2 text-left font-semibold">Invoice</th>
                <th class="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="py-3 text-slate-300" colspan="6">Loading…</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card p-5">
        <div class="text-sm text-slate-300">
          To add a receipt, open an invoice, fill in the Payment section (date, method, amount), and save.
        </div>
      </div>
    </div>
  `;

  function renderReceiptsTable(monthFilter) {
    const tbody = el.querySelector("tbody");
    const filtered =
      receipts.length === 0
        ? []
        : receipts
            .slice()
            .filter((r) => (monthFilter ? yyyyMmFromDate(r.date) === monthFilter : true))
            .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    const rows =
      filtered.length === 0
        ? `<tr><td class="py-3 text-slate-300" colspan="6">No receipts for this filter.</td></tr>`
        : filtered
            .map((r) => {
              return `
                <tr class="border-b border-white/5">
                  <td class="py-2 tabular-nums">${r.date || "-"}</td>
                  <td class="py-2">${r.client?.name || "Unknown"}</td>
                  <td class="py-2">${r.method}</td>
                  <td class="py-2 text-right tabular-nums font-semibold">${moneyFromCents(r.amountCents, currency)}</td>
                  <td class="py-2">${r.invoiceNumber ? `#${r.invoiceNumber}` : "-"}</td>
                  <td class="py-2 text-right">
                    ${
                      r.receiptUrl
                        ? `<a href="${r.receiptUrl}" target="_blank" rel="noreferrer" class="btn btn-secondary">Open file</a>`
                        : ""
                    }
                    ${
                      r.invoiceId
                        ? `<button class="btn btn-secondary" data-open-inv="${r.invoiceId}">Open invoice</button>`
                        : ""
                    }
                  </td>
                </tr>
              `;
            })
            .join("");

    tbody.innerHTML = rows;

    tbody.querySelectorAll("[data-open-inv]").forEach((btn) => {
      btn.onclick = () => navTo(`#/invoices/${btn.getAttribute("data-open-inv")}`);
    });
  }

  const monthInput = $("#receiptsMonth");
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  monthInput.value = defaultMonth;
  renderReceiptsTable(defaultMonth);

  monthInput.onchange = () => renderReceiptsTable(monthInput.value);
  $("#clearReceiptsFilter").onclick = () => {
    monthInput.value = "";
    renderReceiptsTable("");
  };

  // Let the browser handle printing; user can choose "Save as PDF" to export.
  $("#printReceiptsBtn").onclick = () => {
    window.print();
  };
}

function openPrint(invoiceId) {
  navTo(`#/print/${invoiceId}`);
  setTimeout(() => window.print(), 50);
}

function render() {
  const { route, id } = routeFromHash();
  currentRoute = route;
  setActiveNav(route === "print" ? "invoices" : route);

  const printBtn = $("#printBtn");
  if (route === "print") {
    printBtn.classList.remove("hidden");
    printBtn.onclick = () => window.print();
  } else {
    printBtn.classList.add("hidden");
  }

  if (route === "dashboard") {
    showView("#view-dashboard");
    renderDashboard();
  } else if (route === "clients") {
    showView("#view-clients");
    renderClients();
  } else if (route === "jobs") {
    showView("#view-jobs");
    renderJobs();
  } else if (route === "invoices") {
    showView("#view-invoices");
    renderInvoices(id);
  } else if (route === "receipts") {
    showView("#view-receipts");
    renderReceipts();
  } else if (route === "settings") {
    showView("#view-settings");
    renderSettings();
  } else if (route === "print") {
    showView("#view-invoice-print");
    renderInvoicePrintView(id);
  } else {
    navTo("#/dashboard");
  }
}

async function readFileAsDataUrl(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

// ---------- Export / Import ----------
$("#exportBtn").onclick = () => {
  const json = exportState();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `prime-shine-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast("Exported backup JSON");
};

$("#importFile").onchange = async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = importState(text);
    state = imported;
    toast("Imported backup");
    render();
  } catch (err) {
    alert(err.message || String(err));
  } finally {
    e.target.value = "";
  }
};

window.addEventListener("hashchange", render);
render();

