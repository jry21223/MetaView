from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

BiologyGeneticsKind = Literal[
    "monohybrid_ratio",
    "test_cross",
    "dihybrid_ratio",
    "genotype_probability",
    "phenotype_probability",
    "punnett_table",
]


class BiologyGeneticsProblemSpec(BaseModel):
    language: str = "zh-CN"
    kind: BiologyGeneticsKind
    parents: list[str] = Field(default_factory=list)
    dominance: dict[str, str] = Field(default_factory=dict)
    target_genotype: str | None = None
    target_phenotype: str | None = None
    requested_outputs: list[str] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_cross(self) -> "BiologyGeneticsProblemSpec":
        if len(self.parents) != 2:
            raise ValueError("exactly two parent genotypes are required")
        trait_count = _trait_count(self.parents[0])
        if trait_count not in {1, 2}:
            raise ValueError("only one or two traits are supported")
        if _trait_count(self.parents[1]) != trait_count:
            raise ValueError("parents must have the same trait count")
        first_loci = _loci_keys(self.parents[0])
        second_loci = _loci_keys(self.parents[1])
        if first_loci != second_loci:
            raise ValueError("parents must refer to the same loci in the same order")
        if self.target_genotype and _loci_keys(self.target_genotype) != first_loci:
            raise ValueError("target genotype must use the same loci")
        return self


def _trait_count(genotype: str) -> int:
    if len(genotype) not in {2, 4}:
        raise ValueError("genotype must contain one or two diploid loci")
    return len(genotype) // 2


def _loci_keys(genotype: str) -> list[str]:
    keys: list[str] = []
    for index in range(0, len(genotype), 2):
        pair = genotype[index : index + 2]
        if len(pair) != 2 or pair[0].upper() != pair[1].upper():
            raise ValueError("each locus must be a diploid pair such as Aa or aa")
        keys.append(pair[0].upper())
    return keys
