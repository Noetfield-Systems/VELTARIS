import {paymentSchedule} from './credit.mjs';

const byId = (id) => document.getElementById(id);
const currency = new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD'});
const cad = (cents) => currency.format(cents/100);
const credits = (receipt) => receipt.principal+receipt.interest;

export function mountServicing(api, download) {
  const dialog = byId('servicing-dialog');
  const form = byId('servicing-form');
  const list = byId('receipt-list');
  const status = byId('servicing-status');
  const record = byId('record-receipt');
  const exportButton = byId('export-journal');
  const filter = byId('unmatched-only');
  const roles = ['owner','editor'];
  let selection = null;
  let data = null;
  let dialogAction = null;

  function clear() {
    selection = data = dialogAction = null;
    list.replaceChildren();
    record.hidden = true;
    exportButton.disabled = true;
    status.textContent = '';
    for (const id of ['service-balance','service-cash','service-matched','service-unmatched']) byId(id).textContent = '—';
    if (dialog.open) dialog.close();
  }

  function openDialog(action, item) {
    const {facility} = selection;
    dialogAction = {action,id:item?.id || facility.id};
    form.reset();
    byId('servicing-error').textContent = '';
    const groups = {'book-receipt':'receipt-fields','match-receipt':'match-fields','reverse-receipt':'reverse-fields'};
    for (const section of Object.values(groups)) {
      const panel = byId(section);
      panel.hidden = section !== groups[action];
      for (const field of panel.querySelectorAll('input, select, textarea')) field.required = !panel.hidden;
    }
    const names = {'book-receipt':'Record repayment','match-receipt':'Match statement line','reverse-receipt':'Reverse repayment'};
    byId('servicing-title').textContent = byId('servicing-submit').textContent = names[action];
    if (action === 'book-receipt') {
      form.elements.period.replaceChildren(...paymentSchedule(facility).map((p) => new Option('Period '+p.period+' · '+p.date,p.period)));
    }
    byId('servicing-context').textContent = item ? item.reference+' · '+cad(credits(item)) : facility.borrower;
    dialog.showModal();
  }

  function button(label, action, item) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'button light';
    node.textContent = label;
    node.addEventListener('click', () => openDialog(action,item));
    return node;
  }

  function render() {
    const {facility,role} = selection;
    const active = data.receipts.filter((item) => !item.reversed_at);
    const principal = active.reduce((total,item) => total+item.principal,0);
    const cash = active.reduce((total,item) => total+credits(item),0);
    const matched = active.filter((item) => item.matched_at).reduce((total,item) => total+credits(item),0);
    for (const [id,value] of Object.entries({'service-balance':facility.principal-principal,'service-cash':cash,'service-matched':matched,'service-unmatched':cash-matched})) {
      byId(id).textContent = cad(value);
    }
    record.hidden = !roles.includes(role);
    exportButton.disabled = data.journal.length === 0;
    list.replaceChildren();
    const visible = filter.checked ? active.filter((item) => !item.matched_at) : data.receipts;
    if (!visible.length) {
      const empty = list.insertRow().insertCell();
      empty.colSpan = 7;
      empty.textContent = filter.checked ? 'No unmatched repayments.' : 'No repayments recorded for this facility.';
    }
    for (const item of visible) {
      const row = list.insertRow();
      const label = item.reversed_at ? 'Reversed' : item.matched_at ? 'Matched' : 'Unmatched';
      const allocation = cad(item.principal)+' principal · '+cad(item.interest)+' interest';
      for (const value of [item.received_on,item.reference,item.period,allocation,cad(credits(item))]) row.insertCell().textContent = value;
      const badge = document.createElement('span');
      badge.textContent = label;
      badge.className = 'servicing-state';
      badge.dataset.status = label;
      const details = row.insertCell();
      details.append(badge);
      if (item.statement_reference || item.reversal_reason) {
        const note = document.createElement('div');
        note.className = 'helper';
        note.textContent = [item.statement_reference,item.reversal_reason].filter(Boolean).join(' · ');
        details.append(note);
      }
      const controls = row.insertCell();
      if (!item.matched_at && !item.reversed_at && roles.includes(role)) controls.append(button('Match','match-receipt',item));
      if (role === 'owner' && !item.reversed_at) controls.append(button('Reverse','reverse-receipt',item));
    }
  }

  async function open(facility,role) {
    clear();
    const current = {facility,role};
    selection = current;
    status.textContent = 'Loading repayment register…';
    try {
      const result = await api(null,'?servicing='+facility.id);
      if (selection !== current) return;
      data = result;
      status.textContent = '';
      render();
    } catch (error) {
      if (selection === current) status.textContent = error.message;
    }
  }

  filter.addEventListener('change',() => { if (data) render(); });
  record.addEventListener('click', () => openDialog('book-receipt'));
  exportButton.addEventListener('click', () => {
    if (!data) return;
    download('veltaris-servicing-journal.csv',[
      ['Effective date','Receipt reference','Entry','Account','Debit (CAD)','Credit (CAD)'],
      ...data.journal.map((entry) => [entry.effective_date,entry.reference,entry.kind,entry.account,(entry.debit/100).toFixed(2),(entry.credit/100).toFixed(2)]),
    ]);
  });
  byId('servicing-cancel').addEventListener('click',() => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = selection;
    const {action,id} = dialogAction;
    const fields = Object.fromEntries(new FormData(form));
    const commands = {
      'book-receipt':{reference:fields.receiptRef,date:fields.receivedDate,period:fields.period,principal:fields.principal,interest:fields.interest},
      'match-receipt':{reference:fields.statementRef,date:fields.statementDate,amount:fields.amount},
      'reverse-receipt':{reason:fields.reason},
    };
    const submit = byId('servicing-submit');
    submit.disabled = true;
    byId('servicing-error').textContent = '';
    try {
      await api({action,id,...commands[action]});
      if (selection !== current) return;
      dialog.close();
      await open(current.facility,current.role);
    } catch (error) {
      if (selection === current) byId('servicing-error').textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  return {open,clear};
}
