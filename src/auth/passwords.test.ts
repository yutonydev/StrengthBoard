import { describe, expect, it } from 'vitest';
import { checkEmail, checkNewPassword, friendlyAuthError } from './passwords';

describe('checkNewPassword', () => {
  it('accepts a long enough password typed the same twice', () => {
    expect(checkNewPassword('squat-405', 'squat-405')).toEqual({});
  });

  it('asks for at least 8 characters', () => {
    expect(checkNewPassword('short', 'short')).toEqual({ password: 'Use at least 8 characters' });
  });

  it('catches a mismatch, including an empty confirmation', () => {
    expect(checkNewPassword('squat-405', 'squat-406')).toEqual({ confirm: 'Passwords don’t match' });
    expect(checkNewPassword('squat-405', '')).toEqual({ confirm: 'Passwords don’t match' });
  });
});

describe('checkEmail', () => {
  it('accepts a normal address and trims spaces', () => {
    expect(checkEmail(' lifter@example.com ')).toBeUndefined();
  });

  it('rejects anything that is not an address', () => {
    expect(checkEmail('lifter')).toBe('Enter a valid email address');
    expect(checkEmail('')).toBe('Enter a valid email address');
  });
});

describe('friendlyAuthError', () => {
  it('rewrites Supabase messages into plain language', () => {
    expect(friendlyAuthError('Invalid login credentials')).toBe('Wrong email or password');
    expect(friendlyAuthError('Email not confirmed')).toBe('Confirm your email first. Check your inbox for the link.');
    expect(friendlyAuthError('User already registered')).toBe('An account with this email already exists. Sign in instead.');
    expect(friendlyAuthError('Email rate limit exceeded')).toBe('Too many attempts. Wait a minute and try again.');
    expect(friendlyAuthError('TypeError: Failed to fetch')).toBe('Can’t reach the server. Check your connection.');
  });

  it('passes unknown messages through', () => {
    expect(friendlyAuthError('Something odd')).toBe('Something odd');
  });
});
