"use client";

import { AssistantChat } from "@/components/assistant-chat";
import { PageHeader } from "@/components/ui";

export default function Assistant() {
  return <div>
    <PageHeader
      eyebrow="Trợ lý AI"
      title="Hỏi đáp trên kho tri thức"
      description="Hỏi tự nhiên trên các tài liệu bạn được phép xem trong Kho tri thức."
    />
    <AssistantChat variant="page"/>
  </div>;
}
