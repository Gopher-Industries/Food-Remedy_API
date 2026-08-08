import signInWithEmail from '@/services/authentication/signInWithEmail';
import registerWithEmail from '@/services/authentication/registerWithEmail';
import { forgotPasswordReducer, createInitialForgotPasswordState } from '@/app/forgotPasswordState';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

jest.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  sendEmailVerification: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn().mockReturnValue({}),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
}));

jest.mock('@/config/firebaseConfig', () => ({
  auth: { currentUser: null },
  fdb: {},
}));

describe('Forgot password reducer lifecycle', () => {
  it('preserves email while transitioning through submit, success, and error states', () => {
    const initial = createInitialForgotPasswordState('test@example.com');

    const started = forgotPasswordReducer(initial, { type: 'SUBMIT_STARTED' });
    expect(started.email).toBe('test@example.com');
    expect(started.status).toBe('submitting');

    const success = forgotPasswordReducer(started, { type: 'SUBMIT_SUCCESS' });
    expect(success.status).toBe('success');
    expect(success.successMessage).toBe('Reset link sent. Check your inbox.');

    const failure = forgotPasswordReducer(success, {
      type: 'SUBMIT_FAILURE',
      message: 'That account could not be reached.',
    });
    expect(failure.status).toBe('error');
    expect(failure.email).toBe('test@example.com');
    expect(failure.errorMessage).toBe('That account could not be reached.');
  });
});

describe('Authentication Services Mappings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('signInWithEmail', () => {
    it('should return success: true on valid sign in', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: { uid: 'test-user-id', email: 'test@example.com' },
      });

      const result = await signInWithEmail('test@example.com', 'password123');

      expect(signInWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'test@example.com', 'password123');
      expect(result).toEqual({ success: true });
    });

    it('should map auth/invalid-email error code', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/invalid-email',
      });

      const result = await signInWithEmail('invalid-email', 'password123');

      expect(result).toEqual({ success: false, message: 'Invalid Email' });
    });

    it('should map auth/wrong-password error code', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/wrong-password',
      });

      const result = await signInWithEmail('test@example.com', 'wrongpassword');

      expect(result).toEqual({ success: false, message: 'Incorrect Password' });
    });

    it('should map auth/user-not-found error code', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/user-not-found',
      });

      const result = await signInWithEmail('nonexistent@example.com', 'password123');

      expect(result).toEqual({ success: false, message: 'No account with that email was found' });
    });

    it('should map auth/invalid-credential error code', async () => {
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/invalid-credential',
      });

      const result = await signInWithEmail('test@example.com', 'password123');

      expect(result).toEqual({
        success: false,
        message: 'Invalid credentials. Check your email or password.',
      });
    });

    it('should map unexpected errors to generic error message', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      (signInWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/internal-error',
        message: 'Internal server error',
      });

      const result = await signInWithEmail('test@example.com', 'password123');

      expect(result).toEqual({
        success: false,
        message: 'An unexpected error occurred. Please try again later.',
      });
      consoleSpy.mockRestore();
    });
  });

  describe('registerWithEmail', () => {
    it('should return success: true and create DB user when user does not exist', async () => {
      const mockUser = { uid: 'new-uid-123', email: 'newuser@example.com' };
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
      });
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => false,
      });
      (setDoc as jest.Mock).mockResolvedValueOnce(undefined);
      (sendEmailVerification as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await registerWithEmail('John', 'Doe', 'newuser@example.com', 'securepass123');

      expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(expect.anything(), 'newuser@example.com', 'securepass123');
      expect(getDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          uid: 'new-uid-123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'newuser@example.com',
          hasOnboarded: false,
        })
      );
      expect(sendEmailVerification).toHaveBeenCalledWith(mockUser);
      expect(result).toEqual({ success: true });
    });

    it('should return success: true without creating DB user if user already exists in database', async () => {
      const mockUser = { uid: 'existing-uid-456', email: 'existing@example.com' };
      (createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
        user: mockUser,
      });
      (getDoc as jest.Mock).mockResolvedValueOnce({
        exists: () => true,
      });

      const result = await registerWithEmail('Jane', 'Doe', 'existing@example.com', 'securepass123');

      expect(setDoc).not.toHaveBeenCalled();
      expect(sendEmailVerification).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should map auth/weak-password error code', async () => {
      (createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/weak-password',
      });

      const result = await registerWithEmail('John', 'Doe', 'test@example.com', '123');

      expect(result).toEqual({
        success: false,
        message: 'Weak Password. Should be at least 6 characters',
      });
    });

    it('should map auth/email-already-in-use error code', async () => {
      (createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/email-already-in-use',
      });

      const result = await registerWithEmail('John', 'Doe', 'existing@example.com', 'securepass123');

      expect(result).toEqual({
        success: false,
        message: 'This email is already in use.',
      });
    });

    it('should map auth/invalid-email error code', async () => {
      (createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce({
        code: 'auth/invalid-email',
      });

      const result = await registerWithEmail('John', 'Doe', 'invalidemail', 'securepass123');

      expect(result).toEqual({
        success: false,
        message: 'Invalid Email',
      });
    });

    it('should rethrow unexpected error codes', async () => {
      const unexpectedError = { code: 'auth/network-request-failed' };
      (createUserWithEmailAndPassword as jest.Mock).mockRejectedValueOnce(unexpectedError);

      await expect(
        registerWithEmail('John', 'Doe', 'test@example.com', 'securepass123')
      ).rejects.toEqual(unexpectedError);
    });
  });
});
