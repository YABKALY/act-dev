export function showElement(element: HTMLElement): void {
  element.classList.remove('hidden');
}

export function hideElement(element: HTMLElement): void {
  element.classList.add('hidden');
}

export function setMessage(element: HTMLElement, message: string, isError: boolean = false): void {
  element.textContent = message;
  element.className = isError ? 'message error' : 'message success';
}

export function clearMessage(element: HTMLElement): void {
  element.textContent = '';
  element.className = 'message';
}

export function disableButton(button: HTMLButtonElement): void {
  button.disabled = true;
}

export function enableButton(button: HTMLButtonElement): void {
  button.disabled = false;
}
