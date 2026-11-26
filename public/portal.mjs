import {mountServicing} from './servicing.mjs';
import {ASSETS, STAGES, csv, paymentSchedule} from './credit.mjs';

const byId = (id) => document.getElementById(id);
const form = (id) => byId(id);
const currency = new Intl.NumberFormat('en-CA', {style:'currency', currency:'CAD'});
const money = (cents) => currency.format(cents / 100);
const leadStages = ['New','Qualified','Discovery','Proposal','Closed won','Closed lost'];
const options = (select, values) => values.forEach((value) => select.add(new Option(value,value)));
const element = (tag, text) => Object.assign(document.createElement(tag), {textContent:text});
const tableRow = (body, values) => values.forEach((value) => body.insertCell().textContent = value);
const status = (message) => byId('notice').textContent = message;
const state = {data:null, selected:null, edit:null, lead:null};
const facilityForm = form('facility-form');
const leadForm = form('lead-form');
const provision = form('provision');
const servicing = mountServicing(api,downloadCsv);

options(facilityForm.elements.asset, ASSETS);
options(facilityForm.elements.stage, STAGES);
options(leadForm.elements.stage, leadStages);

async function api(body, suffix = '') {
  const request = {cache:'no-store',signal:AbortSignal.timeout(22000)};
  if (body) Object.assign(request, {method:'POST', headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const response = await fetch('/api/portal'+suffix,request);
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.message || 'Request could not be completed.'), {status:response.status});
  return payload;
}

function downloadCsv(filename, rows) {
  const url = URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));
  const anchor = Object.assign(document.createElement('a'), {href:url, download:filename});
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}

function inviteLink(elementId, invitation) {
  const target = byId(elementId);
  target.querySelector('input').value = location.origin + '/portal.html#invite=' + invitation;
  target.hidden = false;
  target.querySelector('input').select();
}

function clearInvite(elementId) {
  const target = byId(elementId);
  target.querySelector('input').value = '';
  target.hidden = true;
}

function attachForm(node, operation, errorId = null) {
  node.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = node.querySelector('button[type=submit]');
    const message = (value) => errorId ? byId(errorId).textContent = value : status(value);
    button.disabled = true;
    message('');
    try {
      await operation(Object.fromEntries(new FormData(node)));
    } catch (error) {
      if (error.status === 401 && node.id !== 'activate') show(null);
      message(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

function renderOperator(data) {
  byId('lead-count').textContent = data.leads.length + ' recent requests';
  const list = byId('leads');
  list.replaceChildren();
  if (!data.leads.length) list.append(element('p','No customer requests have arrived yet.'));
  for (const lead of data.leads) {
    const card = document.createElement('article');
    card.className = 'lead-entry';
    const detail = element('p', lead.name + ' · ' + lead.email);
    const metadata = element('p', lead.workflow + ' · ' + lead.stage + ' · ' + lead.created_at.slice(0,10));
    const follow = element('p', [lead.owner, lead.next_date, lead.notes].filter(Boolean).join(' · '));
    const button = element('button','Update follow-up');
    button.type = 'button';
    button.className = 'button light';
    button.addEventListener('click', () => {
      state.lead = lead.id;
      byId('lead-title').textContent = 'Follow-up for ' + lead.company;
      byId('lead-error').textContent = '';
      for (const field of ['stage','owner','notes']) leadForm.elements[field].value = lead[field] || '';
      leadForm.elements.nextDate.value = lead.next_date || '';
      byId('lead-dialog').showModal();
    });
    card.append(element('h3',lead.company),detail,metadata,element('p',lead.context),follow,button);
    list.append(card);
  }
  const select = provision.elements.organizationId;
  const saved = select.value;
  select.replaceChildren(new Option('Create new organization',''));
  for (const org of data.organizations) select.add(new Option(org.name, org.id));
  if ([...select.options].some(({value}) => value === saved)) select.value = saved;
  adjustProvision();
}

function adjustProvision() {
  const existing = Boolean(provision.elements.organizationId.value);
  provision.elements.organization.required = !existing;
  provision.elements.organization.closest('label').hidden = existing;
  if (!existing) provision.elements.role.value = 'owner';
  provision.elements.role.disabled = !existing;
}

function visibleFacilities() {
  const term = byId('facility-search').value.trim().toLowerCase();
  return (state.data?.facilities || []).filter((facility) =>
    [facility.borrower,facility.asset,facility.stage].some((text) => text.toLowerCase().includes(term)));
}

function renderFacilities() {
  const target = byId('facilities');
  target.replaceChildren();
  for (const facility of visibleFacilities()) {
    const row = target.insertRow();
    const open = element('button',facility.borrower);
    open.type = 'button';
    open.className = 'borrower-link';
    open.setAttribute('aria-controls','details');
    open.setAttribute('aria-expanded',String(state.selected === facility.id));
    open.addEventListener('click', () => {
      state.selected = state.selected === facility.id ? null : facility.id;
      for (const control of target.querySelectorAll('button')) control.setAttribute('aria-expanded',String(control === open && !!state.selected));
      renderDetails();
      if (state.selected) byId('details').scrollIntoView({block:'nearest'});
    });
    row.insertCell().append(open);
    tableRow(row,[facility.asset,facility.stage,money(facility.principal),(facility.bps/100).toFixed(2)+'%']);
  }
  if (target.rows.length === 0) {
    const empty = target.insertRow().insertCell(); empty.colSpan = 5; empty.textContent = 'No facilities match this view.';
  }
}

function renderDetails() {
  const facility = state.data.facilities.find((item) => item.id === state.selected);
  byId('details').hidden = !facility;
  if (!facility) { servicing.clear(); return; }
  servicing.open(facility,state.data.role);
  byId('borrower').textContent = facility.borrower;
  const schedule = byId('payments');
  schedule.replaceChildren();
  for (const payment of paymentSchedule(facility)) {
    tableRow(schedule.insertRow(),[payment.period,payment.date,money(payment.interest),money(payment.principal),money(payment.total)]);
  }
  const list = byId('documents');
  list.replaceChildren();
  for (const doc of state.data.documents.filter((item) => item.facility_id === facility.id)) {
    const link = Object.assign(element('a',doc.name), {href:'/api/portal?document='+doc.id});
    const row = document.createElement('li');
    row.append(link,document.createTextNode(' · '+Math.ceil(doc.size/1024)+' KB'));
    list.append(row);
  }
  if (!list.children.length) list.append(element('li','No documents are attached.'));
}

function renderWorkspace(data) {
  const canEdit = ['owner','editor'].includes(data.role);
  for (const id of ['add','edit','upload']) byId(id).hidden = !canEdit;
  byId('member-invites').hidden = data.role !== 'owner';
  byId('organization').textContent = data.organization;
  byId('member').textContent = data.name + ' · ' + data.role;
  byId('count').textContent = data.facilities.length;
  byId('total').textContent = money(data.facilities.reduce((total, facility) => total + facility.principal, 0));
  byId('documents-count').textContent = data.documents.length;
  const activity = byId('activity');
  activity.replaceChildren(...data.activity.map((entry) => element('li',entry.action + ' · ' + entry.member + ' · ' + entry.created_at.slice(0,10))));
  if (!data.activity.length) activity.append(element('li','No activity recorded.'));
  renderFacilities();
  renderDetails();
}

function show(data) {
  state.data = data;
  byId('access').hidden = !!data;
  byId('signout').hidden = !data;
  byId('return-access').hidden = !data;
  byId('operator').hidden = data?.role !== 'operator';
  byId('work').hidden = !data || data.role === 'operator';
  if (!data) {
    state.selected = state.edit = state.lead = null;
    clearInvite('member-link');
    clearInvite('operator-link');
    clearInvite('return-link');
    servicing.clear();
    for (const id of ['facilities','payments','documents','activity','leads']) byId(id).replaceChildren();
    for (const id of ['organization','member','lead-title','borrower','total','count','documents-count','lead-count']) byId(id).textContent = '';
    for (const id of ['facility-dialog','lead-dialog']) byId(id).close();
    facilityForm.reset();
    leadForm.reset();
    return;
  }
  if (data.role === 'operator') renderOperator(data);
  else renderWorkspace(data);
}

function openFacility(facility = null) {
  state.edit = facility;
  facilityForm.reset();
  byId('facility-title').textContent = facility ? 'Edit facility' : 'Add facility';
  byId('facility-error').textContent = '';
  if (facility) {
    const terms = {...facility,principal:facility.principal/100,rate:facility.bps/100};
    for (const key of ['borrower','asset','stage','principal','rate','term','start']) facilityForm.elements[key].value = terms[key];
  }
  byId('facility-dialog').showModal();
}

async function activate(invitation) {
  await api({action:'activate',invitation});
  form('activate').reset();
  show(await api());
  status('Workspace opened.');
}

function loadInvitation() {
  const invitation = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (!invitation) return false;
  history.replaceState(null,'',location.pathname+location.search);
  show(null);
  form('activate').elements.invitation.value = invitation;
  status('Invitation loaded. Select Open workspace to activate it.');
  return true;
}

window.addEventListener('hashchange', loadInvitation);
attachForm(form('activate'), ({invitation}) => activate(invitation.trim()));

byId('signout').addEventListener('click', async () => {
  try { await api({action:'signout'}); show(null); status('Signed out.'); }
  catch (error) { if (error.status === 401) show(null); status(error.message); }
});

byId('return-button').addEventListener('click', async () => {
  const button = byId('return-button');
  button.disabled = true;
  try {
    const result = await api({action:'return-invite'});
    inviteLink('return-link',result.invitation);
    status('Save the return link privately before signing out.');
  } catch (error) {
    if (error.status === 401) show(null);
    status(error.message);
  } finally {
    button.disabled = false;
  }
});

byId('add').addEventListener('click', () => openFacility());
byId('edit').addEventListener('click', () => openFacility(state.data.facilities.find((item) => item.id === state.selected)));
byId('cancel-facility').addEventListener('click', () => byId('facility-dialog').close());
byId('cancel-lead').addEventListener('click', () => byId('lead-dialog').close());
byId('facility-search').addEventListener('input', renderFacilities);
byId('export').addEventListener('click', () => downloadCsv('veltaris-facilities.csv', [
  ['Borrower','Asset','Stage','Principal (CAD)','Annual rate %','Term (months)','Start date'],
  ...visibleFacilities().map((f) => [f.borrower,f.asset,f.stage,(f.principal/100).toFixed(2),(f.bps/100).toFixed(2),f.term,f.start]),
]));
byId('export-schedule').addEventListener('click', () => {
  const facility = state.data.facilities.find((item) => item.id === state.selected);
  if (!facility) return;
  downloadCsv('veltaris-schedule.csv', [['Period','Due','Interest (CAD)','Principal (CAD)','Total (CAD)'],
    ...paymentSchedule(facility).map((p) => [p.period,p.date,(p.interest/100).toFixed(2),(p.principal/100).toFixed(2),(p.total/100).toFixed(2)])]);
});

attachForm(facilityForm, async (fields) => {
  const result = await api({...fields,action:'facility',id:state.edit?.id,version:state.edit?.version});
  state.selected = result.id;
  byId('facility-dialog').close();
  byId('facility-search').value = '';
  show(await api()); status('Facility saved.');
},'facility-error');
attachForm(form('upload'), async ({file}) => {
  if (!file.size || file.size > 2097152) throw new Error('Choose a file up to 2 MB.');
  const data = await new Promise((resolve,reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
  await api({action:'upload',facilityId:state.selected,name:file.name,data});
  form('upload').reset();
  show(await api()); status('Document saved.');
});
attachForm(leadForm, async (fields) => {
  await api({...fields,action:'followup',id:state.lead});
  byId('lead-dialog').close();
  show(await api()); status('Follow-up saved.');
},'lead-error');
provision.elements.organizationId.addEventListener('change', adjustProvision);
attachForm(provision, async (fields) => {
  const result = await api({...fields,role:fields.role || 'owner',action:'provision'});
  provision.reset(); show(await api()); inviteLink('operator-link',result.invitation);
});
attachForm(form('invite-member'), async (fields) => {
  const result = await api({...fields,action:'provision'});
  form('invite-member').reset(); inviteLink('member-link',result.invitation);
});

try {
  if (!loadInvitation()) {
    const current = await api();
    if (!form('activate').elements.invitation.value) show(current);
  }
} catch (error) {
  show(null);
  if (error.status !== 401) status(error.message);
}
