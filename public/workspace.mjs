import {ASSETS, STAGES, SAMPLE, facilityFromInput, paymentSchedule, csv} from './credit.mjs';

const byId = (id) => document.getElementById(id);
const form = byId('facility-form');
const dialog = byId('facility-dialog');
const stage = byId('filter-stage');
const asset = byId('filter-asset');
const search = byId('search');
const register = byId('facilities');
const storageKey = 'veltaris.sample.credit.v1';
const money = new Intl.NumberFormat('en-CA', {style: 'currency', currency: 'CAD'});
const formatMoney = (cents) => money.format(cents / 100);
let facilities = readPortfolio();
let selected = null;
let editing = null;

function readPortfolio() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    return Array.isArray(saved) ? saved : structuredClone(SAMPLE);
  } catch {
    return structuredClone(SAMPLE);
  }
}

function fill(select, options) {
  for (const name of options) select.add(new Option(name, name));
}

fill(stage, STAGES);
fill(asset, ASSETS);
fill(form.elements.stage, STAGES);
fill(form.elements.asset, ASSETS);

function filteredPortfolio() {
  const query = search.value.trim().toLowerCase();
  return facilities.filter((facility) =>
    (!stage.value || facility.stage === stage.value)
    && (!asset.value || facility.asset === asset.value)
    && (facility.borrower + ' ' + facility.id).toLowerCase().includes(query));
}

function render() {
  const portfolio = filteredPortfolio();
  byId('principal').textContent = formatMoney(portfolio.reduce((sum, item) => sum + item.principal, 0));
  const interest = portfolio.reduce((sum, item) =>
    sum + paymentSchedule(item).reduce((total, payment) => total + payment.interest, 0), 0);
  byId('interest').textContent = formatMoney(interest);
  byId('count').textContent = portfolio.length;
  byId('export-portfolio').disabled = portfolio.length === 0;
  register.replaceChildren();

  if (!portfolio.length) {
    const cell = register.insertRow().insertCell();
    cell.colSpan = 6;
    cell.textContent = 'No facilities match these filters.';
  }

  for (const facility of portfolio) {
    const row = register.insertRow();
    row.classList.toggle('selected', facility.id === selected);
    const borrower = row.insertCell();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'borrower-link';
    button.textContent = facility.borrower;
    button.setAttribute('aria-expanded', String(facility.id === selected));
    button.setAttribute('aria-controls', 'schedule');
    button.addEventListener('click', () => {
      selected = facility.id;
      render();
      register.querySelector('.selected button').focus();
      byId('schedule').scrollIntoView({block: 'nearest'});
    });
    const identifier = document.createElement('span');
    identifier.textContent = facility.id;
    identifier.className = 'facility-id';
    borrower.append(button, identifier);

    for (const value of [facility.asset, facility.stage, formatMoney(facility.principal), (facility.bps / 100).toFixed(2) + '%', facility.term + ' mo']) {
      row.insertCell().textContent = value;
    }
  }

  const facility = portfolio.find((item) => item.id === selected);
  byId('schedule').hidden = !facility;
  if (!facility) return;
  byId('schedule-id').textContent = facility.id + ' / SAMPLE SERVICING';
  byId('schedule-heading').textContent = facility.borrower;
  const payments = byId('payments');
  payments.replaceChildren();
  for (const payment of paymentSchedule(facility)) {
    const row = payments.insertRow();
    for (const value of [payment.period, payment.date, formatMoney(payment.interest), formatMoney(payment.principal), formatMoney(payment.total)]) {
      row.insertCell().textContent = value;
    }
  }
}

function openForm(facility) {
  editing = facility?.id || null;
  form.reset();
  byId('facility-error').textContent = '';
  byId('dialog-title').textContent = editing ? 'Edit sample facility' : 'Add sample facility';
  if (facility) {
    const values = {...facility, principal: facility.principal / 100, rate: facility.bps / 100};
    for (const field of ['borrower', 'asset', 'stage', 'principal', 'rate', 'term', 'start']) {
      form.elements[field].value = values[field];
    }
  }
  dialog.showModal();
}

function download(filename, rows) {
  const url = URL.createObjectURL(new Blob([csv(rows)], {type: 'text/csv;charset=utf-8'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

byId('new-facility').addEventListener('click', () => openForm());
byId('edit-facility').addEventListener('click', () => openForm(facilities.find((item) => item.id === selected)));
byId('cancel-edit').addEventListener('click', () => dialog.close());
form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const input = facilityFromInput(Object.fromEntries(new FormData(form)));
    const id = editing || 'VC-' + crypto.randomUUID().slice(0, 8).toUpperCase();
    const facility = {...input, id};
    const next = editing ? facilities.map((item) => item.id === editing ? facility : item) : [...facilities, facility];
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    facilities = next;
    selected = id;
    if (!filteredPortfolio().some((item) => item.id === id)) {
      search.value = stage.value = asset.value = '';
    }
    dialog.close();
    render();
    register.querySelector('.selected button')?.focus();
  } catch (error) {
    byId('facility-error').textContent = error.message;
  }
});

for (const filter of [search, stage, asset]) filter.addEventListener('input', render);
byId('export-portfolio').addEventListener('click', () => {
  download('veltaris-sample-portfolio.csv', [
    ['ID', 'Borrower', 'Asset', 'Stage', 'Principal (CAD)', 'Annual rate (%)', 'Term (months)', 'Start date'],
    ...filteredPortfolio().map((item) => [item.id, item.borrower, item.asset, item.stage, (item.principal / 100).toFixed(2), (item.bps / 100).toFixed(2), item.term, item.start]),
  ]);
});
byId('export-schedule').addEventListener('click', () => {
  const facility = facilities.find((item) => item.id === selected);
  if (!facility) return;
  download(facility.id + '-sample-servicing.csv', [
    ['Period', 'Due date', 'Interest (CAD)', 'Principal (CAD)', 'Total (CAD)'],
    ...paymentSchedule(facility).map((item) => [item.period, item.date, ...[item.interest, item.principal, item.total].map((value) => (value / 100).toFixed(2))]),
  ]);
});

render();
