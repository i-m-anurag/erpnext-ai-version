import { z } from 'zod';

/** Password policy — single source of truth for set/reset flows. */
export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[0-9]/, 'Must contain a digit');

export const loginSchema = z.object({
  username: z.string().min(1).max(128),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(255),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const setPasswordSchema = z.object({
  token: z.string().min(16).max(128),
  newPassword: passwordSchema,
});
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
