"use client";

import { AssistantChat } from "@/components/assistant-chat";

export default function Assistant() {
  return <div className="mx-auto h-[calc(100dvh-96px)] min-h-0 w-full max-w-[1480px] overflow-hidden md:h-[calc(100dvh-112px)] 2xl:max-w-[1560px]">
    <AssistantChat variant="page" className="!h-full !border-slate-200/60 dark:!border-slate-700/60 !rounded-2xl shadow-2xl bg-white dark:bg-slate-950 overflow-hidden flex flex-col" />
  </div>;
}
