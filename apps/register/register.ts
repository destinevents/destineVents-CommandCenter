import { sb } from '../../shared/services/supabase';

const params = new URLSearchParams(window.location.search);
const eventId = params.get('event');

async function init() {
  if (!eventId) {
    showError('No event specified.');
    return;
  }

  const { data: event, error } = await sb.from('events').select('*').eq('id', eventId).single();
  if (error || !event) {
    showError('Event not found or registration is closed.');
    return;
  }

  if (event.status === 'Cancelled') {
    showError('This event has been cancelled.');
    return;
  }
  if (event.status === 'Completed') {
    showError('Registration for this event is closed.');
    return;
  }

  document.getElementById('event-name')!.textContent   = event.name;
  document.getElementById('event-brand')!.textContent  = event.brand;
  document.getElementById('event-type')!.textContent   = event.event_type || '';
  document.getElementById('event-date')!.textContent   = event.date
    ? new Date(event.date).toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'Date TBA';
  document.getElementById('event-venue')!.textContent  = event.venue || 'Venue TBA';
  document.getElementById('event-price')!.textContent  = event.price
    ? `₱${parseFloat(event.price).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
    : 'Free';

  document.getElementById('reg-form-wrap')!.style.display = '';
  document.getElementById('event-loading')!.style.display = 'none';
}

async function handleSubmit(e: SubmitEvent) {
  e.preventDefault();
  const btn = document.getElementById('reg-submit-btn') as HTMLButtonElement;
  const errEl = document.getElementById('reg-error')!;
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  const name  = (document.getElementById('reg-name') as HTMLInputElement).value.trim();
  const email = (document.getElementById('reg-email') as HTMLInputElement).value.trim();
  const phone = (document.getElementById('reg-phone') as HTMLInputElement).value.trim();
  const org   = (document.getElementById('reg-org') as HTMLInputElement).value.trim();

  if (!name || !email) {
    errEl.textContent = 'Name and email are required.';
    btn.disabled = false;
    btn.textContent = 'Register';
    return;
  }

  const { error } = await sb.from('event_registrations').insert({
    event_id:     eventId,
    name,
    email,
    phone:        phone || null,
    organization: org   || null,
    status:       'Registered',
  });

  if (error) {
    errEl.textContent = 'Registration failed. Please try again.';
    btn.disabled = false;
    btn.textContent = 'Register';
    return;
  }

  document.getElementById('reg-form-wrap')!.style.display = 'none';
  document.getElementById('reg-success')!.style.display   = '';
  document.getElementById('success-name')!.textContent    = name;
}

function showError(msg: string) {
  document.getElementById('event-loading')!.style.display  = 'none';
  const errEl = document.getElementById('page-error')!;
  errEl.textContent = msg;
  errEl.style.display = '';
}

document.getElementById('reg-form')!.addEventListener('submit', handleSubmit);
init();
