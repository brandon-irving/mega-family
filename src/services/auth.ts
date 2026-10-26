// Auth as a small interface so Better Auth (or whatever the backend lands) is a drop-in adapter —
// feature code only ever imports `auth` from here, never a vendor SDK.
export type AuthState = { status: 'signedOut' } | { status: 'signedIn'; memberId: string } | { status: 'loading' };

export interface AuthService {
  getState(): AuthState;
  subscribe(listener: (state: AuthState) => void): () => void;
  signOut(): Promise<void>;
}

/** G1 stub: always "signed in" as the seeded admin, so every screen is reachable before auth lands. */
class StubAuthService implements AuthService {
  private state: AuthState = { status: 'signedIn', memberId: 'stub-admin' };
  private listeners = new Set<(state: AuthState) => void>();

  getState() {
    return this.state;
  }

  subscribe(listener: (state: AuthState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async signOut() {
    this.state = { status: 'signedOut' };
    this.listeners.forEach((l) => l(this.state));
  }
}

export const auth: AuthService = new StubAuthService();
