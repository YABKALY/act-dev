import { LoginResponse } from './types';

const TOKEN_KEY = 'auth_token';
const API_BASE_URL = 'https://act-dev.onrender.com';

export async function login(username: string, password: string): Promise<LoginResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/organizer/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        username: username, 
        password: password 
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Login failed:', response.status, errorText);
      
      throw new Error(`Login failed: ${response.status} - ${errorText}`);
    }

    const data: LoginResponse = await response.json();

    // Store the accessToken from the response
    if (data.accessToken) {
      localStorage.setItem(TOKEN_KEY, data.accessToken);
    }

    return data;
  } catch (error) {
    console.error('Network error during login:', error);
    throw new Error('Network error: Unable to reach the server');
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// Additional utility function
export function getAuthHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}