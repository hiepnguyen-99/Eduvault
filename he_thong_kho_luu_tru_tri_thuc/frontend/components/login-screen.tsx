"use client";

import { useState, useEffect } from "react";
import { BookOpenCheck, LoaderCircle, LockKeyhole, Sparkles, Shield, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const BG_IMAGES = ["/vinuni.jpg", "/vinuni_library.jpg", "/vinuni_hall.jpg"];

export function LoginScreen() {
  const { login } = useAuth();
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Background Slideshow state
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prevIndex) => (prevIndex + 1) % BG_IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(code, password);
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white grid md:grid-cols-12">
      {/* Left Side: Introduction & Image Slideshow */}
      <div className="md:col-span-5 lg:col-span-6 relative bg-[#102451] text-white flex flex-col justify-between p-8 md:p-16 overflow-hidden">
        {/* Background Image Slideshow Layer */}
        {BG_IMAGES.map((imgUrl, index) => (
          <div
            key={imgUrl}
            className={`absolute inset-0 bg-cover bg-center transition-all duration-[1500ms] ease-in-out transform ${
              index === bgIndex ? "opacity-55 scale-100" : "opacity-0 scale-105"
            }`}
            style={{ backgroundImage: `url('${imgUrl}')` }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-[#08132e]/90 via-[#102451]/60 to-[#102451]/40" />

        {/* Left Side Content */}
        <div className="relative z-10 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/25">
            <Sparkles size={14} className="text-yellow-400 animate-pulse" />
            <span className="text-xs font-semibold tracking-wider uppercase">EduVault Enterprise</span>
          </div>
          
          <div className="space-y-3">
            <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight">
              Hệ Thống Kho Lưu Trữ <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-300">
                Tri Thức Học Thuật
              </span>
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed max-w-md">
              Giải pháp lưu trữ thông minh, phân quyền tự động và chuyển giao học liệu tinh gọn dành riêng cho giảng viên đại học.
            </p>
          </div>
        </div>

        <div className="relative z-10 space-y-6 mt-12 md:mt-0">
          <div className="space-y-4 border-l border-white/20 pl-4">
            {/* Feature 1 */}
            <div className="flex gap-4 items-start group/feat cursor-pointer p-2 rounded-xl transition-all duration-300 hover:bg-white/5 hover:translate-x-2">
              <div className="h-10 w-10 rounded-xl bg-[#C92027]/20 border border-[#C92027]/30 flex items-center justify-center shrink-0 transition-all duration-300 group-hover/feat:bg-[#C92027]/40 group-hover/feat:scale-110 group-hover/feat:shadow-[0_0_12px_rgba(201,32,39,0.3)]">
                <Sparkles size={18} className="text-red-300" />
              </div>
              <div className="space-y-0.5">
                <strong className="text-sm block font-bold tracking-tight text-white transition-colors duration-200 group-hover/feat:text-yellow-300">
                  Trợ lý AI
                </strong>
                <span className="text-xs text-gray-300 transition-colors duration-200 group-hover/feat:text-white">
                  Hỏi đáp tài liệu RAG, trích xuất dữ liệu tự động.
                </span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="flex gap-4 items-start group/feat cursor-pointer p-2 rounded-xl transition-all duration-300 hover:bg-white/5 hover:translate-x-2">
              <div className="h-10 w-10 rounded-xl bg-[#C92027]/20 border border-[#C92027]/30 flex items-center justify-center shrink-0 transition-all duration-300 group-hover/feat:bg-[#C92027]/40 group-hover/feat:scale-110 group-hover/feat:shadow-[0_0_12px_rgba(201,32,39,0.3)]">
                <Shield size={18} className="text-red-300" />
              </div>
              <div className="space-y-0.5">
                <strong className="text-sm block font-bold tracking-tight text-white transition-colors duration-200 group-hover/feat:text-yellow-300">
                  Phân quyền thông minh
                </strong>
                <span className="text-xs text-gray-300 transition-colors duration-200 group-hover/feat:text-white">
                  Tự động cấu hình cây thư mục theo vai trò & chuyên môn.
                </span>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="flex gap-4 items-start group/feat cursor-pointer p-2 rounded-xl transition-all duration-300 hover:bg-white/5 hover:translate-x-2">
              <div className="h-10 w-10 rounded-xl bg-[#C92027]/20 border border-[#C92027]/30 flex items-center justify-center shrink-0 transition-all duration-300 group-hover/feat:bg-[#C92027]/40 group-hover/feat:scale-110 group-hover/feat:shadow-[0_0_12px_rgba(201,32,39,0.3)]">
                <RefreshCw size={18} className="text-red-300" />
              </div>
              <div className="space-y-0.5">
                <strong className="text-sm block font-bold tracking-tight text-white transition-colors duration-200 group-hover/feat:text-yellow-300">
                  Quy trình bàn giao tinh gọn
                </strong>
                <span className="text-xs text-gray-300 transition-colors duration-200 group-hover/feat:text-white">
                  Bàn giao giảng dạy, đồng bộ đám mây và phục hồi sao lưu.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10 text-xs text-gray-400 flex justify-end items-center">
            <span>Phiên bản 2.0</span>
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="md:col-span-7 lg:col-span-6 flex flex-col justify-center p-8 md:p-16 bg-white transition-all duration-500">
        <div className="w-full max-w-md mx-auto space-y-8">
          {/* VinUniversity Branding Header */}
          <div className="flex flex-col items-center space-y-2 text-center group">
            <div className="inline-flex flex-col items-center w-fit cursor-pointer">
              <img 
                src="/vinuniversity-logo.png" 
                alt="VinUniversity Logo" 
                className="h-12 w-auto object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <div className="h-[3px] w-full bg-[#C92027] mt-2 rounded-full transition-all duration-300 group-hover:bg-[#a81a20] group-hover:shadow-[0_1px_6px_rgba(201,32,39,0.4)]" />
            </div>
            <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mt-2 transition-colors duration-300 group-hover:text-gray-600">
              KHO LƯU TRỮ TRI THỨC KHOA
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            {/* User Code Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Mã người dùng</label>
              <div className="relative group/input">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within/input:text-[#102451] transition-colors duration-200">
                  <Sparkles size={16} />
                </div>
                <input 
                  className="w-full bg-gray-50/50 hover:bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 focus:ring-4 focus:ring-[#102451]/10 focus:border-[#102451] outline-none transition-all duration-200 placeholder:text-gray-400 text-sm" 
                  placeholder="Ví dụ: GV001, ADMIN" 
                  value={code} 
                  onChange={e => setCode(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">Mật khẩu</label>
              <div className="relative group/input">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400 group-focus-within/input:text-[#102451] transition-colors duration-200">
                  <LockKeyhole size={16} />
                </div>
                <input 
                  type="password" 
                  className="w-full bg-gray-50/50 hover:bg-gray-50 border border-gray-200 rounded-xl py-3 pl-11 pr-4 focus:ring-4 focus:ring-[#102451]/10 focus:border-[#102451] outline-none transition-all duration-200 placeholder:text-gray-400 text-sm" 
                  placeholder="••••••••"
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-100 p-3.5 text-xs text-red-700 font-medium transition-all duration-300">
                {error}
              </div>
            )}

            {/* Login Button with Hover/Active Effects */}
            <button 
              disabled={loading} 
              className="w-full py-3.5 bg-[#102451] hover:bg-[#C92027] text-white font-bold text-sm rounded-xl shadow-md hover:shadow-lg hover:shadow-[#C92027]/10 active:scale-[0.98] transform transition-all duration-200 cursor-pointer flex justify-center items-center gap-2 mt-6 disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading ? (
                <LoaderCircle className="animate-spin" size={18}/>
              ) : (
                <LockKeyhole size={16} />
              )}
              <span>Đăng nhập hệ thống</span>
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
