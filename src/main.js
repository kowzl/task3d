import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { appwriteConfigured, loadSessionsFromAppwrite, saveSessionsToAppwrite } from './appwrite.js';
import './styles.css';

const departmentColors = {
  Strategy: 0x3f5bd9,
  Design: 0xf06d5d,
  Engineering: 0x3e9d77,
  Marketing: 0xe8a83e,
  Finance: 0x8066c6,
};

const employeeColors = [0x4062d9, 0xe97562, 0x4a9f7c, 0xdfa23d, 0x8067c5];
const employees = ['Maya Chen', 'Eli Brooks', 'Nora Singh', 'Theo Martin', 'Ava Williams'];
const roomPositions = [
  [-4.2, 2.1], [0, 2.1], [4.2, 2.1],
  [-2.1, -1.6], [2.1, -1.6], [-4.2, -1.6], [4.2, -1.6],
];

const STORAGE_KEY = 'floorplan-time-sessions';
const route = window.location.pathname.replace(/\/+$/, '') || '/admin';
const isUserRoute = route === '/user';
let sessions = loadSessions();
let scene;
let camera;
let renderer;
let controls;
let roomGroup;
let loungeGroup;
let raycaster;
let pointer;
let selectedUser = employees[0];

const sceneContainer = document.querySelector('#scene-container');
const taskList = document.querySelector('#task-list');
const emptyState = document.querySelector('#empty-state');
const roomCount = document.querySelector('#room-count');
const taskSummary = document.querySelector('#task-summary');
const sceneStatus = document.querySelector('#scene-status');
const userPanel = document.querySelector('#user-panel');
const managerPanel = document.querySelector('#manager-panel');
const userOwner = document.querySelector('#user-owner');
const managerOwner = document.querySelector('#manager-owner');
const userTaskList = document.querySelector('#user-task-list');
const managerTaskList = document.querySelector('#manager-task-list');
const userTimeSummary = document.querySelector('#user-time-summary');
const timeToggle = document.querySelector('#time-toggle');

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  if (appwriteConfigured) saveSessionsToAppwrite(sessions).catch((error) => console.error('Unable to save sessions to Appwrite:', error));
}

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0efe9);
  scene.fog = new THREE.Fog(0xf0efe9, 18, 34);

  camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(9.6, 10.5, 12.5);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  sceneContainer.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableRotate = true;
  controls.rotateSpeed = 0.7;
  controls.enablePan = false;
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  controls.touches.ONE = THREE.TOUCH.ROTATE;
  controls.minDistance = 10;
  controls.maxDistance = 22;
  controls.maxPolarAngle = Math.PI / 2.15;
  controls.target.set(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfffdf6, 0x8d8c8a, 2.4));
  const sun = new THREE.DirectionalLight(0xffffff, 3.4);
  sun.position.set(-5, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(13.5, 0.28, 9.8),
    new THREE.MeshStandardMaterial({ color: 0xd8d5cc, roughness: 0.88 }),
  );
  floor.position.y = -0.16;
  floor.receiveShadow = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(13.5, 27, 0xbcbab2, 0xe2e0d9);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.48;
  scene.add(grid);

  roomGroup = new THREE.Group();
  scene.add(roomGroup);
  loungeGroup = createLounge();
  scene.add(loungeGroup);
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();

  sceneContainer.addEventListener('pointerdown', onScenePointerDown);
  window.addEventListener('resize', resizeScene);
  document.querySelector('#reset-view').addEventListener('click', resetCamera);
  resizeScene();
  animate();
}

function makeTextSprite(text, color = '#22231f') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  context.font = '600 28px Arial';
  context.fillStyle = color;
  context.textAlign = 'center';
  context.fillText(text, canvas.width / 2, 57);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(2.65, 0.5, 1);
  return sprite;
}

function createRoom(task, index) {
  const [x, z] = roomPositions[index % roomPositions.length];
  const color = employeeColors[index % employeeColors.length];
  const group = new THREE.Group();
  group.userData.sessionId = task.id;
  group.position.set(x, 0, z);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(3.35, 0.13, 2.8),
    new THREE.MeshStandardMaterial({ color: 0xc7c5be, roughness: 0.8 }),
  );
  base.position.y = 0.08;
  base.receiveShadow = true;
  group.add(base);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(3.35, 2.35, 0.12),
    new THREE.MeshStandardMaterial({ color: color, roughness: 0.65 }),
  );
  backWall.position.set(0, 1.25, -1.34);
  backWall.castShadow = true;
  group.add(backWall);

  [-1.61, 1.61].forEach((wallX) => {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 2.35, 2.8),
      new THREE.MeshStandardMaterial({ color: 0xe5e3db, roughness: 0.78, transparent: true, opacity: 0.93 }),
    );
    side.position.set(wallX, 1.25, 0);
    side.castShadow = true;
    group.add(side);
  });

  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.12, 0.72),
    new THREE.MeshStandardMaterial({ color: 0x9d8068, roughness: 0.6 }),
  );
  desk.position.set(0, 0.72, 0.26);
  desk.castShadow = true;
  group.add(desk);

  [-0.78, 0.78].forEach((legX) => {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.7, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x5e5f5b, roughness: 0.7 }),
    );
    leg.position.set(legX, 0.36, 0.26);
    group.add(leg);
  });

  const monitor = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.38, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x222b3b, roughness: 0.3, emissive: 0x17213b, emissiveIntensity: 0.6 }),
  );
  monitor.position.set(0, 1.01, -0.02);
  monitor.castShadow = true;
  group.add(monitor);

  const employee = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.55, 4, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  body.position.y = 0.75;
  body.castShadow = true;
  employee.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd99f7c, roughness: 0.8 }));
  head.position.y = 1.34;
  head.castShadow = true;
  employee.add(head);
  employee.position.set(0, 0, 1.0);
  group.add(employee);

  const label = makeTextSprite(task.employee, '#34362f');
  label.position.set(0, 2.72, -1.38);
  group.add(label);

  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color }));
  marker.position.set(-1.35, 2.2, -1.28);
  group.add(marker);
  return group;
}

function createLounge() {
  const group = new THREE.Group();
  group.position.set(-4.45, 0, -3.55);
  group.userData.isLounge = true;

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(3.65, 0.04, 1.85),
    new THREE.MeshStandardMaterial({ color: 0xd7cfc1, roughness: 0.95 }),
  );
  rug.position.y = 0.05;
  rug.receiveShadow = true;
  group.add(rug);

  const couch = new THREE.Mesh(
    new THREE.BoxGeometry(2.65, 0.65, 0.58),
    new THREE.MeshStandardMaterial({ color: 0x6f7f82, roughness: 0.8 }),
  );
  couch.position.set(0, 0.38, -0.48);
  couch.castShadow = true;
  group.add(couch);

  const couchBack = new THREE.Mesh(
    new THREE.BoxGeometry(2.65, 0.72, 0.18),
    new THREE.MeshStandardMaterial({ color: 0x77898b, roughness: 0.8 }),
  );
  couchBack.position.set(0, 0.7, -0.72);
  couchBack.castShadow = true;
  group.add(couchBack);

  const coffeeTable = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.62, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0xb58b66, roughness: 0.7 }),
  );
  coffeeTable.position.set(0, 0.35, 0.35);
  coffeeTable.castShadow = true;
  group.add(coffeeTable);

  const plantPot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.25, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0xc2775d, roughness: 0.8 }),
  );
  plantPot.position.set(1.45, 0.22, -0.35);
  plantPot.castShadow = true;
  group.add(plantPot);

  const plant = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x5e9477, roughness: 0.9 }),
  );
  plant.scale.set(0.75, 1.3, 0.75);
  plant.position.set(1.45, 0.78, -0.35);
  plant.castShadow = true;
  group.add(plant);

  const label = makeTextSprite('WAITING ROOM', '#59666a');
  label.scale.set(2.1, 0.4, 1);
  label.position.set(0, 1.62, -0.82);
  group.add(label);
  return group;
}

function createLoungeEmployee(name, index) {
  const employee = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.2, 0.4, 4, 10),
    new THREE.MeshStandardMaterial({ color: employeeColors[index % employeeColors.length], roughness: 0.75 }),
  );
  body.position.y = 0.57;
  body.castShadow = true;
  employee.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xd99f7c, roughness: 0.8 }),
  );
  head.position.y = 1.1;
  head.castShadow = true;
  employee.add(head);
  const label = makeTextSprite(name, '#59666a');
  label.scale.set(1.55, 0.3, 1);
  label.position.y = 1.47;
  employee.add(label);
  return employee;
}

function renderLounge(activeTasks) {
  for (let index = loungeGroup.children.length - 1; index >= 0; index -= 1) {
    if (loungeGroup.children[index].userData.isLoungeEmployee) loungeGroup.remove(loungeGroup.children[index]);
  }
  const activeOwners = new Set(activeTasks.map((session) => session.employee));
  const visibleEmployees = isUserRoute ? [selectedUser] : employees;
  visibleEmployees.filter((employee) => !activeOwners.has(employee)).forEach((employeeName, index) => {
    const person = createLoungeEmployee(employeeName, index);
    person.userData.isLoungeEmployee = true;
    person.position.set(-1.1 + (index % 3) * 1.05, 0, index < 3 ? 0.03 : -0.1);
    loungeGroup.add(person);
  });
}

function renderRooms() {
  const allActiveSessions = sessions.filter((session) => !session.clockedOutAt);
  const activeSessions = isUserRoute ? allActiveSessions.filter((session) => session.employee === selectedUser) : allActiveSessions;
  const existingSessionIds = new Set(roomGroup.children.map((room) => room.userData.sessionId));
  while (roomGroup.children.length) roomGroup.remove(roomGroup.children[0]);
  activeSessions.forEach((session, index) => {
    const room = createRoom(session, index);
    if (!existingSessionIds.has(session.id)) startRoomEntrance(room);
    roomGroup.add(room);
  });
  renderLounge(activeSessions);
  emptyState.classList.toggle('hidden', activeSessions.length > 0);
  roomCount.textContent = `${activeSessions.length} room${activeSessions.length === 1 ? '' : 's'}`;
  sceneStatus.textContent = activeSessions.length ? `${activeSessions.length} employee${activeSessions.length === 1 ? '' : 's'} clocked in` : 'Team is in the waiting room';
  taskSummary.textContent = sessions.length ? `${allActiveSessions.length} clocked in · ${sessions.length} sessions` : 'No time logged yet';
  renderAttendanceList();
  renderRolePanels();
}

function renderRolePanels() {
  const options = employees.map((employee) => `<option value="${employee}" ${employee === selectedUser ? 'selected' : ''}>${employee}</option>`).join('');
  userOwner.innerHTML = options;
  managerOwner.innerHTML = options;
  const userSessions = sessions.filter((session) => session.employee === selectedUser);
  const managerSessions = sessions.filter((session) => session.employee === managerOwner.value);
  userTaskList.innerHTML = renderCompactSessions(userSessions);
  managerTaskList.innerHTML = renderCompactSessions(managerSessions);
  const activeSession = userSessions.find((session) => !session.clockedOutAt);
  userTimeSummary.innerHTML = activeSession
    ? `<span class="live-dot"></span> Clocked in ${formatTime(activeSession.clockedInAt)} · ${formatDuration(activeSession.clockedInAt)}`
    : '<span class="compact-empty">Not clocked in right now.</span>';
  timeToggle.textContent = activeSession ? 'Clock out' : 'Clock in';
  timeToggle.classList.toggle('clocked-in', Boolean(activeSession));
}

function renderCompactSessions(employeeSessions) {
  if (!employeeSessions.length) return '<p class="compact-empty">No time logged yet.</p>';
  return employeeSessions.slice().reverse().map((session) => `
    <div class="compact-task">
      <span class="compact-task-dot" style="background: #${session.clockedOutAt ? 'aaa9a0' : '44a77b'}"></span>
      <div><strong>${formatDateTime(session.clockedInAt)}</strong><small>${session.clockedOutAt ? `Ended ${formatTime(session.clockedOutAt)}` : `Live · ${formatDuration(session.clockedInAt)}`}</small></div>
      <span class="compact-status">${session.clockedOutAt ? formatDuration(session.clockedInAt, session.clockedOutAt) : 'LIVE'}</span>
    </div>`).join('');
}

function setRole(role) {
  const isManager = role === 'manager';
  userPanel.hidden = isManager;
  managerPanel.hidden = !isManager;
  document.querySelector('#task-strip').hidden = !isManager;
  document.querySelectorAll('.role-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.role === role));
  document.querySelector('#workspace-eyebrow').textContent = isManager ? 'Manager workspace' : 'Personal workspace';
  document.querySelector('#workspace-title').textContent = isManager ? 'Track the workday.' : `${selectedUser}'s workday.`;
  document.querySelector('#workspace-description').textContent = isManager ? 'See who is clocked in, review every session, and keep the office pulse visible.' : 'Clock in when you arrive. Your live room and time log update automatically.';
  document.querySelector('#floor-eyebrow').textContent = isManager ? 'Main floor / Monday, 28 October' : `My floor / ${selectedUser}`;
  document.querySelector('#floor-title').textContent = isManager ? 'Live office' : `${selectedUser}'s live room`;
}

function startRoomEntrance(room) {
  room.position.y = -0.45;
  room.scale.set(0.86, 0.08, 0.86);
  room.userData.entrance = { startedAt: performance.now(), duration: 720 };
}

function updateRoomAnimations(now) {
  roomGroup.children.forEach((room) => {
    const entrance = room.userData.entrance;
    if (!entrance) return;
    const progress = Math.min((now - entrance.startedAt) / entrance.duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const bounce = progress < 1 ? Math.sin(progress * Math.PI) * 0.08 : 0;
    room.position.y = -0.45 + (eased * 0.45) + bounce;
    const scale = 0.86 + (eased * 0.14);
    room.scale.set(scale, 0.08 + (eased * 0.92), scale);
    if (progress === 1) delete room.userData.entrance;
  });
}

function renderAttendanceList() {
  taskList.innerHTML = '';
  sessions.slice().reverse().forEach((session) => {
    const item = document.createElement('article');
    item.className = 'task-card';
    item.innerHTML = `
      <div class="task-color" style="background: #${session.clockedOutAt ? 'aaa9a0' : '44a77b'}"></div>
      <div class="task-card-content">
        <div class="task-card-top"><h4>${escapeHtml(session.employee)}</h4></div>
        <p>${formatDateTime(session.clockedInAt)} <span>·</span> ${session.clockedOutAt ? `Ended ${formatTime(session.clockedOutAt)}` : 'Currently clocked in'}</p>
        <div class="task-card-bottom"><span class="due-label">${session.clockedOutAt ? 'Session total' : 'Live duration'}</span><span class="compact-status">${session.clockedOutAt ? formatDuration(session.clockedInAt, session.clockedOutAt) : formatDuration(session.clockedInAt)}</span></div>
      </div>`;
    taskList.appendChild(item);
  });
}

function toggleClock() {
  const activeSession = sessions.find((session) => session.employee === selectedUser && !session.clockedOutAt);
  if (activeSession) activeSession.clockedOutAt = new Date().toISOString();
  else sessions.push({ id: crypto.randomUUID(), employee: selectedUser, clockedInAt: new Date().toISOString(), clockedOutAt: null });
  saveSessions();
  renderRooms();
}

function onScenePointerDown(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(roomGroup.children, true)[0];
  if (!hit) return;
  let selected = hit.object;
  while (selected.parent && selected.parent !== roomGroup) selected = selected.parent;
  const session = sessions.find((item) => item.id === selected.userData.sessionId);
  if (session && isUserRoute && session.employee !== selectedUser) return;
}

function resetCamera() {
  camera.position.set(9.6, 10.5, 12.5);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resizeScene() {
  const { clientWidth, clientHeight } = sceneContainer;
  camera.aspect = clientWidth / clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(clientWidth, clientHeight, false);
}

function animate() {
  requestAnimationFrame(animate);
  updateRoomAnimations(performance.now());
  controls.update();
  renderer.render(scene, camera);
}

function formatDate(value) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function formatDuration(start, end = new Date().toISOString()) {
  const totalMinutes = Math.max(0, Math.floor((new Date(end) - new Date(start)) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

userOwner.addEventListener('change', (event) => {
  selectedUser = event.target.value;
  renderRooms();
});
managerOwner.addEventListener('change', renderRolePanels);
timeToggle.addEventListener('click', toggleClock);

async function boot() {
  if (appwriteConfigured) {
    try {
      sessions = await loadSessionsFromAppwrite() || sessions;
    } catch (error) {
      console.error('Unable to load sessions from Appwrite. Using local data:', error);
    }
  }
  initScene();
  setRole(isUserRoute ? 'user' : 'manager');
  renderRooms();
  setInterval(() => {
    if (document.visibilityState === 'visible') renderRolePanels();
  }, 30000);
}

boot();
