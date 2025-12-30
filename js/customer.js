let currentRequest = null;
let zonesCache = [];
let pollingInterval = null;

const customerZoneSelect = document.getElementById('customer-zone');
const radarCanvas = document.getElementById('radar-canvas');

async function loadZonesCustomer() {
  const state = await apiGet('/api/state');
  zonesCache = state.zones || [];
  customerZoneSelect.innerHTML = '';
  zonesCache.forEach(z => {
    const opt = document.createElement('option');
    opt.value = z.id;
    opt.textContent = `${z.id} - ${z.name}`;
    customerZoneSelect.appendChild(opt);
  });
}

async function submitRequest() {
  const locationDescription = document.getElementById('location-description').value.trim();
  const helpType = document.getElementById('help-type').value;
  const notes = document.getElementById('help-notes').value.trim();
  const zoneId = customerZoneSelect.value || 'A1';

  const statusEl = document.getElementById('request-status');

  if (!locationDescription || !helpType) {
    statusEl.textContent = 'Please describe your location and select a help type.';
    return;
  }

  try {
    const req = await apiPost('/api/request', {
      locationDescription,
      helpType,
      notes,
      zoneId
    });
    currentRequest = req;
    localStorage.setItem('walsmart_customer_request', JSON.stringify(req));
    statusEl.textContent = 'Request sent. Waiting for a helper...';
    showStatusSection();
    startPollingCustomer();
  } catch (err) {
    statusEl.textContent = 'Failed to send request: ' + err.message;
  }
}

function restoreRequestFromStorage() {
  const raw = localStorage.getItem('walsmart_customer_request');
  if (!raw) return;
  try {
    const req = JSON.parse(raw);
    if (req && req.id) {
      currentRequest = req;
      showStatusSection();
      startPollingCustomer();
    }
  } catch (err) {
    console.warn('Failed to restore customer request from storage', err);
  }
}

function showStatusSection() {
  document.getElementById('request-form-section').classList.add('hidden');
  document.getElementById('status-section').classList.remove('hidden');
}

async function pollStateCustomer() {
  if (!currentRequest) return;
  try {
    const state = await apiGet('/api/state');
    const employees = state.employees || [];
    const requests = state.requests || [];
    zonesCache = state.zones || zonesCache;

    const req = requests.find(r => r.id === currentRequest.id);
    if (!req) {
      document.getElementById('live-status').textContent =
        'Your request is no longer active. If you still need help, please create a new request.';
      clearInterval(pollingInterval);
      pollingInterval = null;
      return;
    }
    currentRequest = req;
    localStorage.setItem('walsmart_customer_request', JSON.stringify(req));
    updateCustomerStatus(req, employees);
    drawRadar(
      radarCanvas,
      zonesCache,
      employees,
      requests,
      req.id,
      true
    );
  } catch (err) {
    console.error('Customer polling failed:', err.message);
  }
}

function startPollingCustomer() {
  if (pollingInterval) return;
  pollStateCustomer();
  pollingInterval = setInterval(pollStateCustomer, 3000);
}

function updateCustomerStatus(req, employees) {
  const liveStatus = document.getElementById('live-status');
  const details = document.getElementById('request-details');

  let text = '';
  if (req.status === 'waiting') {
    text = 'Your request is waiting for an available employee.';
  } else if (req.status === 'accepted') {
    const emp = employees.find(e => e.id === req.acceptedByEmployeeId);
    const name = emp ? emp.name : 'an employee';
    text = `Good news! ${name} is on the way to help you.`;
  } else if (req.status === 'completed') {
    text = 'Help completed. Thank you!';
  } else {
    text = 'Request status: ' + req.status;
  }

  liveStatus.textContent = text;

  const zoneText = req.zoneId || 'Unknown';
  details.innerHTML = `
    <p><strong>Location:</strong> ${req.locationDescription}</p>
    <p><strong>Zone:</strong> ${zoneText}</p>
    <p><strong>Help type:</strong> ${req.helpType}</p>
    ${req.notes ? `<p><strong>Notes:</strong> ${req.notes}</p>` : ''}
  `;
}

document.getElementById('submit-request-btn').addEventListener('click', submitRequest);

loadZonesCustomer().then(restoreRequestFromStorage);
