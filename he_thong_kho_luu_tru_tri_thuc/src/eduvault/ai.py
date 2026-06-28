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


class AIProvider:
    """AI layer supporting both Gemini (native) and OpenAI/proxy with a deterministic local fallback."""

    def __init__(self):
        self.gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.openai_key = os.getenv("OPENAI_API_KEY", "").strip()
        
        if self.gemini_key:
            self.api_key = self.gemini_key
            self.provider = "gemini"
            self.model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip()
        elif self.openai_key:
            self.api_key = self.openai_key
            self.provider = "openai"
            self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
            self.base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        else:
            self.api_key = ""
            self.provider = "local"
            self.model = "local-fallback"

    @property
    def mode(self) -> str:
        return self.provider

    def status(self) -> dict:
        if self.provider == "gemini":
            return {
                "provider": "gemini", "model": self.model,
                "embedding_model": "text-embedding-004",
                "configured": True,
            }
        elif self.provider == "openai":
            return {
                "provider": "openai", "model": self.model,
                "embedding_model": os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small"),
                "configured": True,
            }
        else:
            return {
                "provider": "local", "model": "local-fallback",
                "embedding_model": "local-hash-vector",
                "configured": False,
            }

    def _response(self, instructions: str, prompt: str, json_mode: bool = False) -> str:
        if self.provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "systemInstruction": {"parts": [{"text": instructions}]}
            }
            if json_mode:
                payload["generationConfig"] = {"responseMimeType": "application/json"}
            
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    data = json.loads(response.read().decode("utf-8"))
                    return data["candidates"][0]["content"]["parts"][0]["text"]
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError) as exc:
                raise RuntimeError(f"Gemini API không khả dụng: {exc}") from exc
                
        elif self.provider == "openai":
            body = json.dumps({"model": self.model, "instructions": instructions, "input": prompt}, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(
                f"{self.base_url}/responses", data=body, method="POST",
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    data = json.loads(response.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                raise RuntimeError(f"OpenAI API không khả dụng: {exc}") from exc
            if data.get("output_text"):
                return data["output_text"]
            return "\n".join(
                content.get("text", "")
                for item in data.get("output", [])
                for content in item.get("content", [])
                if content.get("type") == "output_text"
            )
        else:
            raise RuntimeError("Không có AI Provider nào được cấu hình.")

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
            except (urllib.error.URLError, TimeoutError) as exc:
                print(f"[ocr_images] OpenAI OCR unavailable on pages {start + 1}-{start + len(batch)}: {exc}")
            except json.JSONDecodeError as exc:
                print(f"[ocr_images] Invalid OCR response on pages {start + 1}-{start + len(batch)}: {exc}")
        return "\n\n".join(outputs).strip()

    def ocr_images(self, images: list[bytes]) -> str:
        if not self.api_key or not images:
            return ""
            
        if self.provider == "gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.api_key}"
            parts = []
            parts.append({
                "text": "Trích xuất nguyên văn toàn bộ chữ trong các trang tài liệu này. Giữ thứ tự đọc và xuống dòng hợp lý. Chỉ trả nội dung tài liệu."
            })
            for img in images[:10]:
                parts.append({
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": base64.b64encode(img).decode("ascii")
                    }
                })
            payload = {"contents": [{"parts": parts}]}
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            request = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = json.loads(response.read().decode("utf-8"))
                    return data["candidates"][0]["content"]["parts"][0]["text"]
            except Exception as exc:
                print(f"[ocr_images] Gemini OCR error: {exc}")
                return ""
                
        elif self.provider == "openai":
            model = os.getenv("OPENAI_OCR_MODEL", "gpt-4o-mini").strip() or self.model
            return self._ocr_images_batched(images, model)
        return ""

    def metadata(self, filename: str, content: str, fallback: dict, instructions: str | None = None) -> dict:
        if not self.api_key:
            return fallback
        try:
            raw = self._response(
                instructions or "Phân loại tài liệu học thuật tiếng Việt. Chỉ trả JSON hợp lệ, không markdown.",
                f"Tên file: {filename}\nNội dung:\n{content[:12000]}\nTrả JSON gồm title, topic, doc_type, summary, keywords.",
                json_mode=True
            )
            result = json.loads(re.sub(r"^```json|```$", "", raw.strip(), flags=re.MULTILINE).strip())
            return {**fallback, **{key: result[key] for key in ("title", "topic", "doc_type", "summary", "keywords") if key in result}}
        except (RuntimeError, json.JSONDecodeError):
            return fallback

    def policy_tree(self, content: str, fallback: dict) -> dict:
        if not self.api_key or not content.strip():
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
            raw = self._response(instructions, f"Noi dung policy:\n{content[:20000]}", json_mode=True)
            cleaned = re.sub(r"^```json|```$", "", raw.strip(), flags=re.MULTILINE).strip()
            return {**fallback, **json.loads(cleaned)}
        except (RuntimeError, json.JSONDecodeError):
            return fallback

    def answer(self, question: str, contexts: list[dict], fallback: str, instructions: str | None = None) -> str:
        if not self.api_key or not contexts:
            return fallback

        clean_question = question
        if "Câu hỏi của người dùng:" in question:
            clean_question = question.split("Câu hỏi của người dùng:")[-1].strip()

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

Nguyên tắc trả lời:
- Mở đầu tự nhiên, đi thẳng vào vấn đề — không dùng "Dựa trên tài liệu...", "Theo nguồn..." hay bất kỳ cụm mở đầu cứng nhắc nào.
- Viết tiếng Việt tự nhiên, như đang nhắn tin cho đồng nghiệp — ngắn gọn, rõ ý, không cần trang trọng quá.
- Dùng bullet và **in đậm** để highlight ý chính, nhưng đừng liệt kê máy móc nếu câu trả lời ngắn thì viết thường là đủ.
- Nếu tài liệu trong kho trả lời được → trả lời luôn, không cần báo "đã tìm thấy".
- Nếu câu hỏi về cách dùng hệ thống → hướng dẫn cụ thể từng bước ngắn gọn.
- Không viết phần "Nguồn tham khảo" trong thân câu trả lời — giao diện đã hiển thị riêng.
- Không thêm phần gợi ý câu hỏi hay lời khuyên học tập ở cuối."""
        try:
            return self._response(
                f"{experience_instructions}\nChỉ dựa trên ngữ cảnh tài liệu được cung cấp. Không tiết lộ dữ liệu ngoài ngữ cảnh.\nHướng dẫn bổ sung: {instructions or 'Không có.'}",
                f"Ngữ cảnh tài liệu:\n{context}{memory_section}\n\nCâu hỏi: {clean_question}",
            )
        except RuntimeError:
            return fallback

    def embed(self, text: str, force_local: bool = False) -> list[float]:
        if self.api_key and not force_local:
            if self.provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key={self.api_key}"
                payload = {
                    "model": "models/text-embedding-004",
                    "content": {"parts": [{"text": text[:10000]}]}
                }
                body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
                request = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": "application/json"})
                try:
                    with urllib.request.urlopen(request, timeout=45) as response:
                        data = json.loads(response.read().decode("utf-8"))
                        return data["embedding"]["values"]
                except Exception as exc:
                    print(f"[embed] Gemini embedding error: {exc}")
                    pass
            elif self.provider == "openai":
                model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
                body = json.dumps({"model": model, "input": text[:24000]}, ensure_ascii=False).encode("utf-8")
                request = urllib.request.Request(
                    f"{self.base_url}/embeddings", data=body, method="POST",
                    headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                )
                try:
                    with urllib.request.urlopen(request, timeout=45) as response:
                        return json.loads(response.read().decode("utf-8"))["data"][0]["embedding"]
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
                    pass
                    
        vector = [0.0] * 128
        for word in re.findall(r"\w+", text.lower(), re.UNICODE):
            index = int.from_bytes(hashlib.sha256(word.encode("utf-8")).digest()[:4], "big") % len(vector)
            vector[index] += 1.0
        norm = math.sqrt(sum(value * value for value in vector)) or 1.0
        return [value / norm for value in vector]


ai_provider = AIProvider()
