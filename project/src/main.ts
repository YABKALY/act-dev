import './style.css';
import { login, isAuthenticated, logout } from './auth';
import { recordAttendance } from './attendance';
import { QRScanner } from './scanner';
import { showElement, hideElement, setMessage, clearMessage, disableButton, enableButton } from './ui';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="container">
    <h1>Attendance Scanner</h1>

    <div id="login-view">
      <form id="login-form">
        <div class="form-group">
          <label for="username">Username</label>
          <input type="text" id="username" required autocomplete="username" />
        </div>
        <div class="form-group">
          <label for="password">Password</label>
          <input type="password" id="password" required autocomplete="current-password" />
        </div>
        <button type="submit" id="login-button">Login</button>
        <div id="login-message" class="message"></div>
      </form>
    </div>

    <div id="scanner-view" class="hidden">
      <div class="scanner-header">
        <button id="logout-button" class="secondary">Logout</button>
      </div>

      <div id="scanner-container">
        <video id="video" playsinline></video>
        <canvas id="canvas" class="hidden"></canvas>
      </div>

      <div class="controls">
        <button id="start-scan-button">Start Scanning</button>
        <button id="scan-next-button" class="hidden">Scan Next</button>
      </div>

      <div id="scan-message" class="message"></div>
    </div>
  </div>
`;

const loginView = document.getElementById('login-view') as HTMLDivElement;
const scannerView = document.getElementById('scanner-view') as HTMLDivElement;
const loginForm = document.getElementById('login-form') as HTMLFormElement;
const loginButton = document.getElementById('login-button') as HTMLButtonElement;
const loginMessage = document.getElementById('login-message') as HTMLDivElement;
const usernameInput = document.getElementById('username') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const logoutButton = document.getElementById('logout-button') as HTMLButtonElement;
const startScanButton = document.getElementById('start-scan-button') as HTMLButtonElement;
const scanNextButton = document.getElementById('scan-next-button') as HTMLButtonElement;
const scanMessage = document.getElementById('scan-message') as HTMLDivElement;
const video = document.getElementById('video') as HTMLVideoElement;
const canvas = document.getElementById('canvas') as HTMLCanvasElement;

let scanner: QRScanner | null = null;

function initializeApp(): void {
  if (isAuthenticated()) {
    showScannerView();
  } else {
    showLoginView();
  }
}

function showLoginView(): void {
  hideElement(scannerView);
  showElement(loginView);
  clearMessage(loginMessage);
}

function showScannerView(): void {
  hideElement(loginView);
  showElement(scannerView);
  clearMessage(scanMessage);
}

loginForm.addEventListener('submit', async (event: Event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    setMessage(loginMessage, 'Please enter username and password', true);
    return;
  }

  disableButton(loginButton);
  clearMessage(loginMessage);

  try {
    await login(username, password);
    setMessage(loginMessage, 'Login successful!', false);
    setTimeout(() => {
      showScannerView();
      usernameInput.value = '';
      passwordInput.value = '';
    }, 500);
  } catch (error) {
    setMessage(loginMessage, 'Login failed. Please check your credentials.', true);
  } finally {
    enableButton(loginButton);
  }
});

logoutButton.addEventListener('click', () => {
  if (scanner) {
    scanner.stop();
    scanner = null;
  }
  logout();
  showLoginView();
});

startScanButton.addEventListener('click', async () => {
  clearMessage(scanMessage);
  hideElement(startScanButton);
  hideElement(scanNextButton);

  if (!scanner) {
    scanner = new QRScanner(video, canvas);
  }

  try {
    await scanner.start(async (data: string) => {
      scanner?.stop();
      await handleQRCodeScan(data);
    });
  } catch (error) {
    setMessage(scanMessage, 'Failed to access camera: ' + (error as Error).message, true);
    showElement(startScanButton);
  }
});

scanNextButton.addEventListener('click', async () => {
  clearMessage(scanMessage);
  hideElement(scanNextButton);

  if (!scanner) {
    scanner = new QRScanner(video, canvas);
  }

  try {
    await scanner.start(async (data: string) => {
      scanner?.stop();
      await handleQRCodeScan(data);
    });
  } catch (error) {
    setMessage(scanMessage, 'Failed to access camera: ' + (error as Error).message, true);
    showElement(startScanButton);
  }
});

async function handleQRCodeScan(studentId: string): Promise<void> {
  clearMessage(scanMessage);
  setMessage(scanMessage, `Scanned: ${studentId}. Recording attendance...`, false);

  try {
    const response = await recordAttendance(studentId);
    setMessage(scanMessage, response.message, !response.success);
    showElement(scanNextButton);
  } catch (error) {
    setMessage(scanMessage, 'Failed to record attendance: ' + (error as Error).message, true);
    showElement(scanNextButton);
  }
}

initializeApp();
