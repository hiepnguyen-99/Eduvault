from __future__ import annotations

import json
import hashlib
import base64
import math
import os
import re
import urllib.error
import urllib.request
from pathlib import Path


def load_env_file() -> None:
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file()


def _looks_like_placeholder(value: str) -> bool:
    cleaned = str(value or "").strip().lower()
    if not cleaned:
        return True
    return cleaned in {
        "your_openai_api_key_here",
        "replace-with-openai-api-key",
        "replace-me",
        "changeme",
    } or cleaned.startswith("replace-with")


class AIProvider:
    """OpenAI-ready AI layer with a deterministic local fallback."""

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
        self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

    @property
    def mode(self) -> str:
        return "openai" if self.is_configured else "local"

    @property
    def is_configured(self) -> bool:
        return not _looks_like_placeholder(self.api_key)

    def status(self) -> dict:
        return {
            "provider": self.mode,
            "model": self.model if self.is_configured else "local-fallback",
            "embedding_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small") if self.is_configured else "local-hash-vector",
            "configured": self.is_configured,
        }

    def _response(self, instructions: str, prompt: str) -> str:
        body = json.dumps({"model": self.model, "instructions": instructions, "input": prompt}, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/responses", data=body, method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            raise RuntimeError(f"OpenAI API không khả dụng: {exc}") from exc
        if data.get("output_text"):
            return data["output_text"]
        return "\n".join(
            content.get("text", "")
            for item in data.get("output", [])
            for content in item.get("content", [])
            if content.get("type") == "output_text"
        )

    def _ocr_images_batched(self, images: list[bytes], model: str) -> str:
        max_pages = max(1, int(os.getenv("OCR_MAX_PAGES", "30")))
        batch_pages = max(1, min(6, int(os.getenv("OCR_BATCH_PAGES", "4"))))
        timeout = max(30, int(os.getenv("OPENAI_OCR_TIMEOUT_SECONDS", "180")))
        outputs: list[str] = []
        instruction = (
            "Ban la he thong OCR tai lieu tieng Viet. "
            "Trich xuat dung nguyen van, giu thu tu doc, khong tom tat, khong them nhan xet."
        )
        prompt = (
            "Trich xuat toan bo chu trong cac trang PDF scan nay. "
            "Neu trang bi nghieng hoac anh mo, hay co gang doc phan nhin thay. "
            "Chi tra ve noi dung tai lieu."
        )
        selected = images[:max_pages]
        for start in range(0, len(selected), batch_pages):
            batch = selected[start:start + batch_pages]
            content = [{"type": "input_text", "text": f"{prompt}\nTrang {start + 1}-{start + len(batch)}."}]
            content.extend(
                {"type": "input_image", "image_url": f"data:image/png;base64,{base64.b64encode(image).decode('ascii')}"}
                for image in batch
            )
            body = json.dumps(
                {"model": model, "instructions": instruction, "input": [{"role": "user", "content": content}]},
                ensure_ascii=False,
            ).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/responses", data=body, method="POST",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=timeout) as response:
                    data = json.loads(response.read().decode("utf-8"))
                if data.get("output_text"):
                    text = data["output_text"]
                else:
                    text = "\n".join(
                        item.get("text", "")
                        for output in data.get("output", [])
                        for item in output.get("content", [])
                        if item.get("type") == "output_text"
                    )
                if text.strip():
                    outputs.append(text.strip())
            except urllib.error.HTTPError as exc:
                detail = exc.read().decode("utf-8", errors="ignore")[:500]
                print(f"[ocr_images] OpenAI HTTP {exc.code} on pages {start + 1}-{start + len(batch)}: {detail}")
            except Exception as exc:
                print(f"[ocr_images] OCR failed on pages {start + 1}-{start + len(batch)}: {exc}")
        return "\n\n".join(outputs).strip()

    def ocr_images(self, images: list[bytes]) -> str:
        if not self.is_configured or not images:
            return ""
        model = os.getenv("OPENAI_OCR_MODEL", "gpt-4o-mini").strip() or self.model
        return self._ocr_images_batched(images, model)
        content = [{"type": "input_text", "text": "Trích xuất nguyên văn toàn bộ chữ trong các trang tài liệu này. Giữ thứ tự đọc và xuống dòng hợp lý. Chỉ trả nội dung tài liệu."}]
        content.extend(
            {"type": "input_image", "image_url": f"data:image/png;base64,{base64.b64encode(image).decode('ascii')}"}
            for image in images[:10]
        )
        body = json.dumps(
            {"model": model, "instructions": "Bạn là hệ thống OCR tài liệu tiếng Việt chính xác.", "input": [{"role": "user", "content": content}]},
            ensure_ascii=False,
        ).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/responses", data=body, method="POST",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                data = json.loads(response.read().decode("utf-8"))
            if data.get("output_text"):
                return data["output_text"]
            return "\n".join(
                item.get("text", "")
                for output in data.get("output", [])
                for item in output.get("content", [])
                if item.get("type") == "output_text"
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            return ""

    def metadata(self, filename: str, content: str, fallback: dict, instructions: str | None = None) -> dict:
        if not self.is_configured:
            return fallback
        try:
            raw = self._response(
                instructions or "Phân loại tài liệu học thuật tiếng Việt. Chỉ trả JSON hợp lệ, không markdown.",
                f"Tên file: {filename}\nNội dung:\n{content[:12000]}\nTrả JSON gồm title, topic, doc_type, summary, keywords.",
            )
            result = json.loads(re.sub(r"^```json|```$", "", raw.strip(), flags=re.MULTILINE).strip())
            return {**fallback, **{key: result[key] for key in ("title", "topic", "doc_type", "summary", "keywords") if key in result}}
        except (RuntimeError, json.JSONDecodeError):
            return fallback

    def policy_tree(self, content: str, fallback: dict) -> dict:
        if not self.is_configured or not content.strip():
            return fallback
        instructions = """
Ban la bo parser Policy cho he thong EduVault. Chi tra JSON hop le, khong markdown.
Schema bat buoc:
{
  "faculty": {"name": "ten khoa", "code": "ma khoa neu co"},
  "specializations": [
    {
      "name": "ten nhom chuyen mon",
      "description": "",
      "courses": [
        {
          "name": "ten hoc phan",
          "code": "ma hoc phan neu co",
          "description": "",
          "standard_folders": [
            "De cuong mon hoc",
            "Bai giang",
            "Slide",
            "Lab",
            "Bai tap",
            "De thi",
            "Dap an",
            "Tai lieu tham khảo"
          ]
        }
      ]
    }
  ]
}
Khong tao node rong. Khong dat ten node la "Thu muc". Khong tra id ky thuat.
Neu policy chi co hoc phan ma khong noi ro nhom chuyen mon, hay gom theo nhom chuyen mon gan nhat trong van ban.
"""
        try:
            raw = self._response(instructions, f"Noi dung policy:\n{content[:20000]}")
            cleaned = re.sub(r"^```json|```$", "", raw.strip(), flags=re.MULTILINE).strip()
            return {**fallback, **json.loads(cleaned)}
        except (RuntimeError, json.JSONDecodeError):
            return fallback

    def answer(self, question: str, contexts: list[dict], fallback: str, instructions: str | None = None) -> str:
        if not self.is_configured or not contexts:
            return fallback

        # Extract the actual user question from context-injected string
        clean_question = question
        if "Câu hỏi của người dùng:" in question:
            clean_question = question.split("Câu hỏi của người dùng:")[-1].strip()

        # Extract conversation memory if present
        memory_section = ""
        if "Bộ nhớ ngắn hạn:" in question or "Bộ nhớ dài hạn:" in question:
            memory_lines = []
            in_memory = False
            for line in question.split("\n"):
                if "Bộ nhớ" in line:
                    in_memory = True
                elif "Câu hỏi của người dùng:" in line:
                    in_memory = False
                elif in_memory and line.strip().startswith("- "):
                    memory_lines.append(line.strip())
            if memory_lines:
                memory_section = "\n\nLịch sử hỏi đáp gần đây (chỉ dùng làm ngữ cảnh):\n" + "\n".join(memory_lines[:5])

        context = "\n\n".join(f"[{item['title']}]\n{item['content'][:6000]}" for item in contexts)
        experience_instructions = """Bạn là trợ lý AI của EduVault — hệ thống kho tri thức dành cho giảng viên đại học.
Hãy trả lời như một đồng nghiệp thân thiện, am hiểu hệ thống, không phải như một chatbot đọc database.

LANGUAGE POLICY (BẮT BUỘC):
- Luôn trả lời bằng tiếng Việt chuẩn Unicode có dấu.
- Tuyệt đối không trả lời bằng tiếng Việt không dấu.
- Không dùng kiểu viết như: toi, minh, ban, du lieu, tai lieu, hoc tap.
- Mọi câu trả lời phải đúng chính tả tiếng Việt.
- Nếu phát hiện nội dung chuẩn bị trả lời bị mất dấu hoặc không dấu, phải tự sửa thành tiếng Việt có dấu trước khi gửi.
- Nếu người dùng viết không dấu, vẫn phải trả lời bằng tiếng Việt có dấu.
- Chỉ dùng tiếng Anh khi người dùng yêu cầu, khi trích dẫn code, hoặc khi nhắc tới API, framework, thư viện và thuật ngữ kỹ thuật không nên dịch.
- Không được pha trộn tiếng Việt không dấu với tiếng Việt có dấu.

Nguyên tắc trả lời:
- Mở đầu tự nhiên, đi thẳng vào vấn đề — không dùng "Dựa trên tài liệu...", "Theo nguồn..." hay bất kỳ cụm mở đầu cứng nhắc nào.
- Dùng bullet và **in đậm** để highlight ý chính, nhưng đừng liệt kê máy móc nếu câu trả lời ngắn thì viết thường là đủ.
- Nếu tài liệu trong kho trả lời được → trả lời luôn, không cần báo "đã tìm thấy".
- Nếu câu hỏi về cách dùng hệ thống → hướng dẫn cụ thể từng bước ngắn gọn.
- Không viết phần "Nguồn tham khảo" trong thân câu trả lời — giao diện đã hiển thị riêng.
- Không thêm phần gợi ý câu hỏi hay lời khuyên học tập ở cuối.

Trước khi gửi câu trả lời, hãy tự kiểm tra:
- Có phải tiếng Việt không?
- Có dấu đầy đủ chưa?
- Có lỗi chính tả không?"""
        try:
            return self._response(
                f"{experience_instructions}\nChỉ dựa trên ngữ cảnh tài liệu được cung cấp. Không tiết lộ dữ liệu ngoài ngữ cảnh.\nHướng dẫn bổ sung: {instructions or 'Không có.'}",
                f"Ngữ cảnh tài liệu:\n{context}{memory_section}\n\nCâu hỏi: {clean_question}",
            )
        except RuntimeError:
            return fallback

    def embed(self, text: str, force_local: bool = False) -> list[float]:
        if self.api_key and not force_local:
            model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
            body = json.dumps({"model": model, "input": text[:24000]}, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/embeddings", data=body, method="POST",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    return json.loads(response.read().decode("utf-8"))["data"][0]["embedding"]
            except Exception:
                pass
        vector = [0.0] * 128
        for word in re.findall(r"\w+", text.lower(), re.UNICODE):
            index = int.from_bytes(hashlib.sha256(word.encode("utf-8")).digest()[:4], "big") % len(vector)
            vector[index] += 1.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


ai_provider = AIProvider()
