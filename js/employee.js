let currentEmployee = null;
let zonesCache = [];
let pollingInterval = null;

const loginSection = document.getElementById('login-section');
const statusSection = document.getElementById('status-section');
const requestsSection = document.getElementById('requests-section');
const employeeZoneSelect = document.getElementById('employee-zone');
const radarCanvas = document.getElementById('radar-canvas');
const requestList = document.getElementById('request-list');

async function loadZones() {
  const state = await apiGet('/api/state');
  zonesCache = state.zones || [];
  employeeZoneSelect.innerHTML = '';
  zonesCache.forEach(z => {
    const opt = document.createElement('option');
    opt.value = z.id;
    opt.textContent = `${z.id} - ${z.name}`;
    employeeZoneSelect.appendChild(opt);
  });
}

async function handleLogin() {
  const code = document.getElementById('employee-code').value.trim();
  const name = document.getElementById('employee-name').value.trim();
  const role = document.getElementById('employee-role').value.trim();
  const loginStatus = document.getElementById('login-status');

  if (!code) {
    loginStatus.textContent = 'Employee code is required.';
    return;
  }

  try {
    const emp = await apiPost('/api/employee/login', { code, name, role });
    currentEmployee = emp;
    localStorage.setItem('walsmart_employee', JSON.stringify(emp));
    loginStatus.textContent = 'Logged in successfully.';
    afterLogin();
  } catch (err) {
    loginStatus.textContent = 'Login failed: ' + err.message;
  }
}

function restoreEmployeeFromStorage() {
  const raw = localStorage.getItem('walsmart_employee');
  if (!raw) return;
  try {
    const emp = JSON.parse(raw);
    if (emp && emp.id) {
      currentEmployee = emp;
      document.getElementById('employee-code').value = emp.code || '';
      document.getElementById('employee-name').value = emp.name || '';
      document.getElementById('employee-role').value = emp.role || '';
      afterLogin(true);
    }
  } catch (err) {
    console.warn('Failed to restore employee from storage', err);
  }
}

async function afterLogin(skipStatusUpdate) {
  loginSection.classList.add('hidden');
  statusSection.classList.remove('hidden');
  requestsSection.classList.remove('hidden');

  document.getElementById('current-employee').textContent =
    `Logged in as ${currentEmployee.name} (${currentEmployee.role})`;

  if (!zonesCache.length) {
    await loadZones();
  }

  if (currentEmployee.lastZoneId) {
    employeeZoneSelect.value = currentEmployee.lastZoneId;
  }

  if (!skipStatusUpdate) {
    await updateEmployeeStatus('offline');
  }

  if (!pollingInterval) {
    startPolling();
  }
}

async function updateEmployeeStatus(newStatus) {
  const zoneId = employeeZoneSelect.value;
  const statusMessage = document.getElementById('status-message');

  try {
    const emp = await apiPost('/api/employee/status', {
      id: currentEmployee.id,
      status: newStatus,
      zoneId
    });
    currentEmployee = emp;
    localStorage.setItem('walsmart_employee', JSON.stringify(emp));
    statusMessage.textContent = `Status: ${emp.status} in zone ${emp.lastZoneId}`;
  } catch (err) {
    statusMessage.textContent = 'Failed to update status: ' + err.message;
  }
}

async function pollState() {
  try {
    const state = await apiGet('/api/state');
    const employees = state.employees || [];
    const requests = state.requests || [];
    zonesCache = state.zones || zonesCache;

    renderRequests(requests, employees);
    drawRadar(
      radarCanvas,
      zonesCache,
      employees,
      requests,
      null,
      false
    );
  } catch (err) {
    console.error('Polling failed:', err.message);
  }
}

function startPolling() {
  pollState();
  pollingInterval = setInterval(pollState, 3000);
}

function renderRequests(requests, employees) {
  requestList.innerHTML = '';
  const openRequests = requests.filter(r => ['waiting', 'accepted'].includes(r.status));
  if (!openRequests.length) {
    const li = document.createElement('li');
    li.textContent = 'No active customer requests.';
    requestList.appendChild(li);
    return;
  }

  openRequests.forEach(req => {
    const li = document.createElement('li');
    li.className = 'list-item';

    const employeeName = req.acceptedByEmployeeId
      ? (employees.find(e => e.id === req.acceptedByEmployeeId)?.name || 'Unknown')
      : null;

    const header = document.createElement('div');
    header.className = 'list-item-header';
    header.textContent = `${req.helpType} (${req.status.toUpperCase()})`;

    const body = document.createElement('div');
    body.className = 'list-item-body';
    body.innerHTML = `
      <p><strong>Location:</strong> ${req.locationDescription}</p>
      <p><strong>Zone:</strong> ${req.zoneId}</p>
      ${req.notes ? `<p><strong>Notes:</strong> ${req.notes}</p>` : ''}
      ${employeeName ? `<p><strong>Accepted by:</strong> ${employeeName}</p>` : ''}
    `;

    const actions = document.createElement('div');
    actions.className = 'list-item-actions';

    if (req.status === 'waiting') {
      const acceptBtn = document.createElement('button');
      acceptBtn.className = 'btn small primary';
      acceptBtn.textContent = 'Accept';
      acceptBtn.onclick = () => acceptRequest(req.id);
      actions.appendChild(acceptBtn);
    }

    if (req.status === 'accepted' && req.acceptedByEmployeeId === currentEmployee.id) {
      const completeBtn = document.createElement('button');
      completeBtn.className = 'btn small success';
      completeBtn.textContent = 'Complete';
      completeBtn.onclick = () => completeRequest(req.id);
      actions.appendChild(completeBtn);
    }

    li.appendChild(header);
    li.appendChild(body);
    li.appendChild(actions);
    requestList.appendChild(li);
  });
}

async function acceptRequest(requestId) {
  try {
    await apiPost(`/api/request/${requestId}/accept`, {
      employeeId: currentEmployee.id
    });
    await pollState();
  } catch (err) {
    alert('Failed to accept request: ' + err.message);
  }
}

async function completeRequest(requestId) {
  try {
    await apiPost(`/api/request/${requestId}/complete`, {
      employeeId: currentEmployee.id
    });
    await pollState();
  } catch (err) {
    alert('Failed to complete request: ' + err.message);
  }
}

document.getElementById('login-btn').addEventListener('click', handleLogin);
document.getElementById('go-active-btn').addEventListener('click', () => updateEmployeeStatus('active'));
document.getElementById('go-offline-btn').addEventListener('click', () => updateEmployeeStatus('offline'));
employeeZoneSelect.addEventListener('change', () => updateEmployeeStatus(currentEmployee?.status || 'offline'));

loadZones().then(restoreEmployeeFromStorage);
