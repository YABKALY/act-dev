import { ApiResponse } from './types';
import { getToken } from './auth';

export async function recordAttendance(studentId: string): Promise<ApiResponse> {
  const token = getToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch('/organizer/record-general-attendance', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ studentId }),
  });

  if (!response.ok) {
    throw new Error('Failed to record attendance');
  }

  const data: ApiResponse = await response.json();
  return data;
}
