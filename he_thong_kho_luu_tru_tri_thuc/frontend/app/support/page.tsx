"use client";

import { Mail, Phone, MapPin, Clock, ShieldCheck, ExternalLink, HelpCircle } from "lucide-react";
import { PageHeader, Panel } from "@/components/ui";

export default function SupportPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto py-6">
      <PageHeader
        eyebrow="Hỗ trợ & Liên hệ"
        title="Thông tin liên hệ Hỗ trợ kỹ thuật"
        description="Mọi khó khăn, sự cố kỹ thuật hoặc yêu cầu cấp quyền bổ sung, quý Thầy/Cô vui lòng liên hệ bộ phận hỗ trợ kỹ thuật Viện Kỹ thuật và Khoa học Máy tính."
      />

      <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
        {/* Left: Contact Info Panels */}
        <div className="space-y-6">
          <Panel title="Bộ phận Hỗ trợ kỹ thuật Công nghệ thông tin (IT Helpdesk)">
            <div className="p-6 space-y-6 text-sm">
              <div className="flex items-start gap-4">
                <div className="h-10 w-10 rounded-xl bg-red-50 text-[#C92027] dark:bg-red-950/30 flex items-center justify-center shrink-0">
                  <Mail size={18} />
                </div>
                <div>
                  <strong className="block text-gray-800 dark:text-white font-bold">Email hỗ trợ</strong>
                  <a href="mailto:ithelpdesk@vinuni.edu.vn" className="text-blue-600 dark:text-blue-400 hover:underline block mt-1 font-semibold">
                    ithelpdesk@vinuni.edu.vn
                  </a>
                  <span className="text-xs text-gray-500 block mt-0.5">Thời gian phản hồi thông thường trong vòng 2 giờ làm việc.</span>
                </div>
              </div>

              <div className="flex items-start gap-4 border-t border-gray-100 dark:border-slate-800 pt-4">
                <div className="h-10 w-10 rounded-xl bg-blue-50 text-[#102451] dark:bg-blue-950/30 flex items-center justify-center shrink-0">
                  <Phone size={18} />
                </div>
                <div>
                  <strong className="block text-gray-800 dark:text-white font-bold">Hotline hỗ trợ nhanh</strong>
                  <span className="text-gray-700 dark:text-gray-300 block mt-1 font-semibold">
                    +84 (24) 7108 9779 (Máy lẻ: 8000)
                  </span>
                  <span className="text-xs text-gray-500 block mt-0.5">Phục vụ các trường hợp khẩn cấp trong giờ hành chính.</span>
                </div>
              </div>

              <div className="flex items-start gap-4 border-t border-gray-100 dark:border-slate-800 pt-4">
                <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/30 flex items-center justify-center shrink-0">
                  <MapPin size={18} />
                </div>
                <div>
                  <strong className="block text-gray-800 dark:text-white font-bold">Văn phòng làm việc</strong>
                  <span className="text-gray-700 dark:text-gray-300 block mt-1">
                    Phòng I201, Tòa nhà Viện Kỹ thuật và Khoa học Máy tính, Đại học VinUniversity.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-4 border-t border-gray-100 dark:border-slate-800 pt-4">
                <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
                  <Clock size={18} />
                </div>
                <div>
                  <strong className="block text-gray-800 dark:text-white font-bold">Thời gian hỗ trợ trực tiếp</strong>
                  <span className="text-gray-700 dark:text-gray-300 block mt-1">
                    Thứ Hai - Thứ Sáu: 08:30 - 17:30 <br />
                    Thứ Bảy, Chủ Nhật & Ngày lễ: Nghỉ.
                  </span>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        {/* Right: FAQ / Additional Resources */}
        <div className="space-y-6">
          <Panel title="Liên kết nhanh">
            <div className="p-4 space-y-3 text-xs">
              <a 
                href="https://vinuni.edu.vn" 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:border-gray-200 dark:border-slate-800 dark:hover:border-slate-700 bg-white dark:bg-slate-900 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <HelpCircle className="text-[#102451]" size={16} />
                  <strong className="text-gray-700 dark:text-gray-300">Trang chủ VinUniversity</strong>
                </div>
                <ExternalLink size={13} className="text-gray-400" />
              </a>

              <div className="rounded-xl bg-blue-50/50 dark:bg-slate-900/50 p-4 border border-blue-100/50 space-y-2 mt-4 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center gap-2 text-[#102451] dark:text-blue-300 font-bold">
                  <ShieldCheck size={16} />
                  <span>Tuân thủ chính sách bảo mật</span>
                </div>
                <p className="leading-relaxed">
                  Mọi thông tin trao đổi, yêu cầu cấp quyền và hỗ trợ tài khoản đều được lưu vết hệ thống nhằm mục đích bảo vệ dữ liệu học thuật của nhà trường.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
