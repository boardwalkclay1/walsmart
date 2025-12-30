const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// In-memory store (also periodically written to data.json)
let state = {
  employees: [],
  requests: [],
  nextEmployeeId: 1,
  nextRequestId: 1
};

const DATA_FILE = path.join(__dirname, 'data.json');

// Load existing data if present
if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state = parsed;
    }
  } catch (err) {
    console.error('Failed to load data.json, starting fresh:', err.message);
  }
}

function saveState() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save data.json:', err.message);
  }
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Simple Zones map (for radar)
// You can edit these to match real store layout.
const ZONES = [
  { id: 'A1', name: 'Front Entrance', x: 50, y: 20 },
  { id: 'A2', name: 'Customer Service', x: 50, y: 40 },
  { id: 'B1', name: 'Groceries', x: 20, y: 60 },
  { id: 'B2', name: 'Household', x: 40, y: 70 },
  { id: 'C1', name: 'Electronics', x: 70, y: 70 },
  { id: 'C2', name: 'Clothing', x: 80, y: 50 }
];

function findZoneById(zoneId) {
  return ZONES.find(z => z.id === zoneId) || null;
}

// API: Get full state (used by short polling)
app.get('/api/state', (req, res) => {
  const now = Date.now();
  const timeoutMs = 5 * 60 * 1000; // 5 minutes timeout for employees

  // Auto-timeout employees who haven't pinged recently
  state.employees = state.employees.map(emp => {
    if (emp.status === 'active' && emp.lastPing && (now - emp.lastPing > timeoutMs)) {
      return { ...emp, status: 'offline' };
    }
    return emp;
  });

  res.json({
    employees: state.employees,
    requests: state.requests,
    zones: ZONES
  });
});

// API: Employee login or register
app.post('/api/employee/login', (req, res) => {
  const { code, name, role } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'code is required' });
  }

  let employee = state.employees.find(e => e.code === code);

  if (!employee) {
    // Create new employee profile
    const newEmployee = {
      id: state.nextEmployeeId++,
      code,
      name: name || `Employee ${state.nextEmployeeId}`,
      role: role || 'General',
      status: 'offline',
      lastZoneId: 'A1',
      lastPing: Date.now()
    };
    state.employees.push(newEmployee);
    saveState();
    employee = newEmployee;
  } else {
    // Update name/role if provided
    if (name) employee.name = name;
    if (role) employee.role = role;
    employee.lastPing = Date.now();
    saveState();
  }

  res.json(employee);
});

// API: Update employee status / zone
app.post('/api/employee/status', (req, res) => {
  const { id, status, zoneId } = req.body;

  const employee = state.employees.find(e => e.id === id);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (status) {
    if (!['offline', 'active', 'busy'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    employee.status = status;
  }

  if (zoneId && findZoneById(zoneId)) {
    employee.lastZoneId = zoneId;
  }

  employee.lastPing = Date.now();
  saveState();

  res.json(employee);
});

// API: Create customer request
app.post('/api/request', (req, res) => {
  const { locationDescription, helpType, zoneId, notes } = req.body;

  if (!locationDescription || !helpType) {
    return res.status(400).json({ error: 'locationDescription and helpType are required' });
  }

  const zone = zoneId && findZoneById(zoneId) ? zoneId : 'A1';

  const newRequest = {
    id: state.nextRequestId++,
    locationDescription,
    helpType,
    notes: notes || '',
    zoneId: zone,
    status: 'waiting',
    createdAt: Date.now(),
    acceptedByEmployeeId: null
  };

  state.requests.push(newRequest);
  saveState();

  res.json(newRequest);
});

// API: Employee accepts request
app.post('/api/request/:id/accept', (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { employeeId } = req.body;

  const request = state.requests.find(r => r.id === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }
  const employee = state.employees.find(e => e.id === employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  if (request.status !== 'waiting') {
    return res.status(400).json({ error: 'Request already accepted or completed' });
  }

  request.status = 'accepted';
  request.acceptedByEmployeeId = employeeId;
  employee.status = 'busy';
  employee.lastPing = Date.now();

  saveState();

  res.json({ request, employee });
});

// API: Employee completes request
app.post('/api/request/:id/complete', (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const { employeeId } = req.body;

  const request = state.requests.find(r => r.id === requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const employee = state.employees.find(e => e.id === employeeId);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }

  request.status = 'completed';

  // Employee goes back to active
  if (employee.status === 'busy') {
    employee.status = 'active';
  }
  employee.lastPing = Date.now();

  saveState();

  res.json({ request, employee });
});

// API: Simple HTML reader endpoint - lists public HTML files
app.get('/api/html-files', (req, res) => {
  const publicDir = path.join(__dirname, 'public');
  fs.readdir(publicDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Failed to list HTML files' });
    const htmlFiles = files.filter(f => f.endsWith('.html'));
    res.json(htmlFiles);
  });
});

app.listen(PORT, () => {
  console.log(`Walsmart Help Radar running on http://localhost:${PORT}`);
});
