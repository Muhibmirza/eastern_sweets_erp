import { zodResolver } from '@hookform/resolvers/zod';
import { Lock, Mail } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useUiStore } from '../store/ui';
import type { ApiResponse, User } from '../types';
import { queryClient } from '../queryClient';
import { ROLE_HOME, ROLE_LABELS } from '../config/permissions';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  remember: z.boolean().default(false)
});

type FormData = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const toast = useUiStore((s) => s.toast);
  const { register, handleSubmit, formState } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false }
  });

  useEffect(() => {
    logout();
    queryClient.removeQueries({ queryKey: ['auth-me'] });
  }, [logout]);

  const onSubmit = async (values: FormData) => {
    try {
      const response = await api.post<ApiResponse<{ user: User; accessToken: string; refreshToken: string }>>('/api/auth/login', values);
      const { user, accessToken, refreshToken } = response.data.data;
      setSession(user, accessToken, refreshToken, values.remember);
      toast(`Welcome, ${user.name} — ${ROLE_LABELS[user.role]}`);
      navigate(ROLE_HOME[user.role], { replace: true });
    } catch {
      toast('Invalid email or password', 'error');
    }
  };

  return (
    <main className="login-page relative min-h-[100svh] overflow-hidden bg-black text-white">
      <video
        className="fixed inset-0 z-0 h-full w-full object-cover opacity-100 brightness-110 contrast-105"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/eastern-bg.mp4" type="video/mp4" />
        <source src="/eastern-bg.webm" type="video/webm" />
      </video>
      <div className="fixed inset-0 z-[1] bg-black/45" />
      <div className="pointer-events-none fixed inset-0 z-[2] bg-[linear-gradient(180deg,_rgba(0,0,0,0.08),_rgba(0,0,0,0.24))]" />

      <div className="relative z-10 grid min-h-[100svh] w-full place-items-center px-3 py-3 sm:px-6 sm:py-6 lg:px-8">
        <form
          onSubmit={handleSubmit(onSubmit)}
          autoComplete="off"
          className="login-card mx-auto w-full max-w-[430px] rounded-2xl border border-white/18 bg-[#fffaf0]/[0.92] px-4 py-4 text-[#123b39] shadow-[0_24px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-8 sm:py-8"
        >
          <div className="mb-4 text-center sm:mb-7">
            <div className="login-logo-wrap mx-auto mb-3 grid h-20 w-20 place-items-center rounded-2xl bg-white p-2 shadow-[0_14px_34px_rgba(9,45,43,0.18)] sm:mb-4 sm:h-32 sm:w-32 sm:p-2.5">
              <img
                src="/eastern-sweets-logo.png"
                alt="Eastern Sweets"
                className="h-full w-full object-contain"
              />
            </div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[#c88421] sm:text-[0.72rem] sm:tracking-[0.26em]">Eastern Sweets</p>
            <h1 className="mt-1 font-serif text-2xl font-semibold leading-tight tracking-wide text-[#0f615d] sm:mt-2 sm:text-4xl">
              Eastern Sweets
            </h1>
            <p className="mx-auto mt-1 max-w-xs text-xs font-medium text-[#55716d] sm:mt-2 sm:text-sm">
              Business Management
            </p>
          </div>

          <label className="mb-3 block sm:mb-4">
            <span className="mb-1.5 block text-sm font-semibold text-[#184b48] sm:mb-2">Email Address</span>
            <div className="login-input-group flex min-h-12 items-center gap-3 rounded-xl border border-[#d9c3a4] bg-white/80 px-4 shadow-sm transition duration-200 focus-within:border-[#c88421] focus-within:bg-white focus-within:ring-3 focus-within:ring-[#c88421]/18">
              <Mail size={18} className="text-[#0f615d]" />
              <input className="w-full bg-transparent text-sm text-[#123b39] outline-none placeholder:text-[#82918e]" autoComplete="off" {...register('email')} />
            </div>
            {formState.errors.email && <span className="mt-1 block text-xs text-red-700">{formState.errors.email.message}</span>}
          </label>

          <label className="mb-3 block sm:mb-4">
            <span className="mb-1.5 block text-sm font-semibold text-[#184b48] sm:mb-2">Password</span>
            <div className="login-input-group flex min-h-12 items-center gap-3 rounded-xl border border-[#d9c3a4] bg-white/80 px-4 shadow-sm transition duration-200 focus-within:border-[#c88421] focus-within:bg-white focus-within:ring-3 focus-within:ring-[#c88421]/18">
              <Lock size={18} className="text-[#0f615d]" />
              <input className="w-full bg-transparent text-sm text-[#123b39] outline-none placeholder:text-[#82918e]" type="password" autoComplete="new-password" {...register('password')} />
            </div>
            {formState.errors.password && <span className="mt-1 block text-xs text-red-700">{formState.errors.password.message}</span>}
          </label>

          <label className="mb-4 flex min-h-10 items-center gap-3 text-sm font-medium text-[#46635f] sm:mb-6 sm:min-h-11">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-[#d9c3a4] bg-white accent-[#0f615d]"
              {...register('remember')}
            />
            Remember me
          </label>

          <button
            className="touch login-submit w-full rounded-xl bg-[#0f615d] px-5 font-bold tracking-wide text-white shadow-[0_12px_28px_rgba(15,97,93,0.24)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#0b504d] hover:shadow-[0_16px_34px_rgba(15,97,93,0.28)] focus:outline-none focus:ring-3 focus:ring-[#c88421]/35 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={formState.isSubmitting}
          >
            {formState.isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>

      <div
        className="fixed bottom-5 left-5 z-20 flex items-center gap-2.5"
        aria-label="Viralage branding"
      >
        <img
          src="/viralage-logo.png"
          alt="Viralage"
          className="h-9 w-9 object-contain"
        />
        <div className="leading-snug text-white">
          <div className="text-[13px] font-bold uppercase tracking-[0.08em]">Viralage</div>
          <div className="text-[11px] text-white/80">Developed by Muhib Mirza</div>
        </div>
      </div>
    </main>
  );
}
