const API_BASE = '';

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) throw new Error('GET ' + path + ' failed: ' + res.status);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error('POST ' + path + ' failed: ' + res.status + ' ' + text);
  }
  return res.json();
}

// Draw a simple radar on a canvas
function drawRadar(canvas, zones, employees, requests, focusRequestId, isCustomerView) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const centerX = w / 2;
  const centerY = h / 2;
  const radius = Math.min(w, h) / 2 - 10;

  // Background
  ctx.fillStyle = '#030612';
  ctx.fillRect(0, 0, w, h);

  // Radar circles
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath();
    ctx.arc(centerX, centerY, (radius * i) / 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Center point (customer)
  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
  ctx.fill();

  // Map zones to approximate angles
  const zoneAngleStep = (Math.PI * 2) / Math.max(zones.length, 1);

  function getZonePosition(zoneId) {
    const index = zones.findIndex(z => z.id === zoneId);
    if (index === -1) {
      return { x: centerX, y: centerY };
    }
    const angle = index * zoneAngleStep - Math.PI / 2; // start at top
    const dist = radius * 0.7;
    return {
      x: centerX + dist * Math.cos(angle),
      y: centerY + dist * Math.sin(angle)
    };
  }

  // Draw employees
  (employees || []).forEach(emp => {
    if (emp.status !== 'active' && emp.status !== 'busy') return;
    const pos = getZonePosition(emp.lastZoneId || 'A1');
    ctx.fillStyle = emp.status === 'active' ? '#3b82f6' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });

  // Draw requests
  (requests || []).forEach(req => {
    if (!['waiting', 'accepted'].includes(req.status)) return;
    const pos = getZonePosition(req.zoneId || 'A1');
    ctx.fillStyle = req.status === 'waiting' ? '#ef4444' : '#a855f7';
    const size = focusRequestId && req.id === focusRequestId ? 8 : 5;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
    ctx.fill();
  });

  // Crosshair
  ctx.strokeStyle = '#111827';
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX, centerY + radius);
  ctx.moveTo(centerX - radius, centerY);
  ctx.lineTo(centerX + radius, centerY);
  ctx.stroke();
}
