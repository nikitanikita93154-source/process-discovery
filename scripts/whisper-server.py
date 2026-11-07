"""Local-only speech transcription service for the interview application."""

import io
import json
import os
import wave
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parent.parent
MODEL = Path(os.environ.get("WHISPER_MODEL_PATH", ROOT / ".local/whisper/model"))
model = WhisperModel(str(MODEL), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def do_POST(self):
        if self.path != "/inference":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 4_000_000:
                self.send_error(413)
                return
            content_type = self.headers.get("Content-Type", "")
            if not content_type.startswith("multipart/form-data;"):
                self.send_error(415)
                return
            headers = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode()
            message = BytesParser(policy=default).parsebytes(headers + self.rfile.read(length))
            audio = next((part.get_payload(decode=True) for part in message.iter_parts()
                          if part.get_param("name", header="content-disposition") == "file"), None)
            if not audio:
                self.send_error(400)
                return
            with wave.open(io.BytesIO(audio), "rb") as wav:
                if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
                    self.send_error(400)
                    return
                samples = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768.0
            segments, _ = model.transcribe(samples, language="ru", beam_size=5)
            data = json.dumps({"text": " ".join(segment.text.strip() for segment in segments).strip()}, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.send_error(500, "Transcription failed")


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8080), Handler).serve_forever()
