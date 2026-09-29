let activeAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  activeAuthToken = token;
}

export function getAuthToken(): string | null {
  return activeAuthToken;
}

export function clearAuthToken(): void {
  activeAuthToken = null;
}

export default {
  setAuthToken,
  getAuthToken,
  clearAuthToken,
};
