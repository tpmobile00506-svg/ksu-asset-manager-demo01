'use client';
import { useState } from 'react';
import { Eye, EyeOff, Lock, TriangleAlert, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

// หน้าเข้าสู่ระบบ (แสดงเมื่อยังไม่มีเซสชัน) — ตัวหน้านี้แค่แสดงฟอร์ม การล็อกอินจริงอยู่ที่ onSubmit ใน workspace.tsx
export function LoginScreen({
  email,
  onEmail,
  password,
  onPassword,
  loggingIn,
  error,
  onSubmit,
}: {
  email: string;
  onEmail: (value: string) => void;
  password: string;
  onPassword: (value: string) => void;
  loggingIn: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  return (
    <div className="min-h-screen w-full relative flex flex-col justify-between bg-[#f0f4f9] overflow-hidden py-4 sm:py-8 px-3 sm:px-4 font-sans">
      <div className="absolute top-10 left-10 w-96 h-96 rounded-full bg-[#e0eaf8] blur-3xl pointer-events-none opacity-80" />
      <div className="absolute bottom-10 right-10 w-[30rem] h-[30rem] rounded-full bg-[#e2ebf8] blur-3xl pointer-events-none opacity-80" />
      <div className="absolute top-1/3 right-1/4 w-60 h-60 rounded-full bg-[#e8eff9] blur-2xl pointer-events-none opacity-60" />

      <header className="relative z-10 max-w-6xl w-full mx-auto flex items-center gap-3 sm:gap-4 pt-2 sm:pt-3 pb-3 sm:pb-5">
        <div className="w-12 h-12 sm:w-[68px] sm:h-[68px] rounded-xl sm:rounded-2xl bg-white p-1.5 sm:p-2.5 shadow-xs sm:shadow-sm border border-slate-200/90 flex items-center justify-center shrink-0">
          <img
            src="/logo-university.png"
            alt="ตราสัญลักษณ์ มหาวิทยาลัยกาฬสินธุ์"
            className="w-full h-full object-contain"
          />
        </div>
        <div>
          <h2 className="text-[#0f172a] text-sm sm:text-xl font-bold leading-tight tracking-tight">
            มหาวิทยาลัยกาฬสินธุ์ · KALASIN UNIVERSITY
          </h2>
          <p className="text-slate-600 text-sm mt-0.5 font-medium">คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม</p>
        </div>
      </header>

      <div className="relative z-10 max-w-[460px] w-full mx-auto my-auto bg-white rounded-2xl shadow-xl shadow-slate-900/10 border border-slate-200/80 p-5 sm:p-9 transition-all">
        <div className="flex flex-col items-center text-center mb-5 sm:mb-6">
          <div className="w-18 h-18 sm:w-[104px] sm:h-[104px] rounded-xl sm:rounded-2xl bg-white border border-slate-200/90 p-2 sm:p-3 shadow-sm sm:shadow-md flex items-center justify-center mb-3 sm:mb-4 hover:shadow-lg transition-shadow">
            <img
              src="/logo-faculty.png"
              alt="คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#0f172a] tracking-tight">เข้าสู่ระบบ</h1>
          <span className="text-sm sm:text-base font-bold text-[#1d4ed8] mt-0.5 sm:mt-1">ระบบบริหารจัดการครุภัณฑ์</span>
          <span className="text-sm text-slate-500 mt-0.5">คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม</span>
        </div>

        <div className="h-px w-full bg-slate-100 mb-5 sm:mb-6" />

        {error && (
          <div
            className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-medium flex items-start gap-2"
            role="alert"
          >
            <TriangleAlert size={16} className="shrink-0 mt-0.5 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4" autoComplete="off">
          <div>
            <label htmlFor="login-email" className="block text-sm font-bold text-slate-700 mb-1.5">
              อีเมล
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-500 pointer-events-none">
                <Users size={17} />
              </span>
              <Input
                id="login-email"
                name="email"
                autoComplete="off"
                type="email"
                value={email}
                onChange={e => onEmail(e.target.value)}
                placeholder="เช่น name@ksu.ac.th"
                className="pl-10 h-11 bg-slate-50/70 border-slate-300 text-sm focus:bg-white transition-colors"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-bold text-slate-700 mb-1.5">
              รหัสผ่าน
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-slate-500 pointer-events-none">
                <Lock size={17} />
              </span>
              <Input
                id="login-password"
                name="password"
                aria-label="รหัสผ่าน"
                autoComplete="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => onPassword(e.target.value)}
                placeholder="กรอกรหัสผ่าน"
                className="pl-10 pr-10 h-11 bg-slate-50/70 border-slate-300 text-sm focus:bg-white transition-colors tracking-wide"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-0 flex h-11 w-11 items-center justify-center text-slate-500 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg cursor-pointer"
                aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end text-sm pt-1">
            <button
              type="button"
              onClick={() => setForgotPasswordOpen(true)}
              className="text-[#2563eb] hover:underline font-bold cursor-pointer py-2 px-1 shrink-0 whitespace-nowrap"
            >
              ลืมรหัสผ่าน?
            </button>
          </div>

          <Button
            type="submit"
            disabled={loggingIn}
            className="w-full h-11 bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold text-sm rounded-lg shadow-md shadow-blue-500/20 transition-all mt-2 cursor-pointer"
          >
            {loggingIn ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </Button>
        </form>
      </div>

      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock size={18} className="text-[#2563eb]" />
              ลืมรหัสผ่าน
            </DialogTitle>
            <DialogDescription>
              ติดต่อผู้ดูแลระบบเพื่อตั้งรหัสผ่านใหม่ · ถ้ายังจำรหัสเดิมได้ เปลี่ยนเองได้ที่เมนูข้างหลังเข้าสู่ระบบ
            </DialogDescription>
          </DialogHeader>
          <Button
            type="button"
            onClick={() => setForgotPasswordOpen(false)}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-bold"
          >
            รับทราบ
          </Button>
        </DialogContent>
      </Dialog>

      <footer className="relative z-10 text-center text-xs text-slate-500 py-3 mt-4">
        © 2026 ระบบบริหารจัดการครุภัณฑ์ คณะวิศวกรรมศาสตร์และเทคโนโลยีอุตสาหกรรม มหาวิทยาลัยกาฬสินธุ์
      </footer>
    </div>
  );
}
