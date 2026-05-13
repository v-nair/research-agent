from pydantic import BaseModel, field_validator


class ResearchRequest(BaseModel):
    topic: str

    @field_validator("topic")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Topic must not be empty")
        return v.strip()


class ResearchPlan(BaseModel):
    subtopics: list[str]
