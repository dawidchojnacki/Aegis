from pydantic import BaseModel, Field
from typing import Literal, Optional


class TraceIn(BaseModel):
    department: str
    use_case: str
    user_email: str
    model: str
    provider: str = "openrouter"
    prompt: str
    response: str
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    latency_ms: int
    status: Literal["ok", "error", "timeout", "filtered"] = "ok"
    error_msg: Optional[str] = None
    meta: dict = Field(default_factory=dict)


class BenchmarkRequest(BaseModel):
    name: str
    prompts: list[str]
    models: list[str]
    use_case: Optional[str] = None
