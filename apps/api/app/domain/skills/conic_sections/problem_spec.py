from pydantic import BaseModel, Field, model_validator


class ConicEllipseFocusProblemSpec(BaseModel):
    original_prompt: str
    a: float = Field(gt=0)
    b: float = Field(gt=0)
    major_axis: str = "x"
    language: str = "zh-CN"

    @model_validator(mode="after")
    def validate_standard_ellipse(self) -> "ConicEllipseFocusProblemSpec":
        if self.a <= self.b:
            raise ValueError("standard ellipse requires a > b > 0")
        if self.major_axis != "x":
            raise ValueError("V1 deterministic adapter supports a horizontal major axis")
        return self
