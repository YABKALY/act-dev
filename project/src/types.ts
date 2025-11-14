export interface LoginResponse {
  token: string;
  message?: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
}

export interface ScanResult {
  studentId: string;
  timestamp: number;
}
